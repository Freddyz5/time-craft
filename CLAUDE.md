# Time Craft

Sistema familiar para controlar el tiempo de pantalla de un niño de 9 años (Minecraft en PC y YouTube en una TV LG) con cuotas diarias y semanales tipo "créditos".
Lo usan los dos padres y el niño, cada uno desde su teléfono o navegador y desde cualquier lugar.
Versión 1 (MVP): cronómetro compartido, cuotas, bonos por tareas, alarmas push y dashboard. Se registra a mano: no detecta el juego ni la TV.
Los padres inician, pausan y detienen sesiones y aprueban solicitudes; el niño solo ve su saldo y pide (empezar, tiempo extra, bonos).
El servidor es la fuente de verdad del cronómetro, y el saldo no se guarda: se calcula a partir de las sesiones.
Las alarmas (inicio programado, aviso, fin y cierre automático) van por Upstash QStash, sin cron.
Stack: Bun + Turborepo, Hono en Vercel, Better Auth, PostgreSQL en Neon con Drizzle, y Astro estático con islas React y Tailwind.
Todo debe funcionar en planes gratuitos (Vercel Hobby, Neon Free, QStash Free).
El producto avanza por versiones; cada versión se construye en fases y cada fase es un PR.
Fuente de verdad: [docs/contexto-v1.md](docs/contexto-v1.md). Schema de referencia: [docs/timecraft_v1.sql](docs/timecraft_v1.sql). Si algo no está ahí, pregunta antes de suponer.

## Estructura del monorepo

```
apps/
  api/        Hono en Vercel: rutas, auth (Better Auth), adaptadores (Drizzle, QStash, Web Push), composition root
  web/        Astro (salida estática) + islas React + Tailwind
packages/
  core/       dominio, casos de uso y puertos
  db/         schema Drizzle, migraciones, cliente y seed
  tsconfig/   configs de TypeScript compartidas (base, node, astro)
```

Dirección de dependencias:

- `api → core` y `api → db`. Los adaptadores de `api` implementan los puertos de `core`.
- `core` no depende de Drizzle, Hono ni Better Auth (tampoco de `db`).
- Los paquetes internos se exportan como TypeScript fuente, sin build propio. `apps/api` los empaqueta en su build (`scripts/build.ts`) y `apps/web` a través de Vite.

Cada app y paquete tiene su propio `CLAUDE.md` con su responsabilidad y lo que no debe hacer.

## Convenciones

- Código, nombres y commits en inglés. Commits con [Conventional Commits](https://www.conventionalcommits.org/), con el paquete como scope cuando aplica (`feat(core): …`, `ci: …`).
- Textos de UI en español.
- Bun es el gestor de paquetes y el runner de tests (`bun test`). El linker es `hoisted` (`bunfig.toml`).
- El código desplegado (`apps/*/src`, `packages/*/src`) no usa APIs exclusivas de Bun (`Bun.*`, `bun:*`): en Vercel corre en Node. Biome lo bloquea; los tests y los scripts de build sí pueden usarlas.
- Biome para lint y formato (sin ESLint ni Prettier). Cada paquete declara en su `package.json` lo que importa (regla `noUndeclaredDependencies`).
- TypeScript 6: `@astrojs/check` todavía no soporta TypeScript 7.
- Variables de entorno: `.env.example` tiene la lista completa. Nunca se commitea un `.env`.

## Ramas y despliegue

- Un PR por fase, desde una rama creada a partir de `dev` (p. ej. `feat/f2-db`) y hacia `dev`. Un release es un PR de `dev` a `prod`, fusionado con merge commit (sin squash ni rebase). `prod` solo recibe PRs desde `dev` (lo exige el job `PR to prod comes from dev` de `ci.yml`) y las dos ramas exigen CI en verde.
- Vercel tiene un proyecto por app, cada uno configurado en el `vercel.json` de la app. `prod` despliega a producción, `dev` a sus dominios fijos y las demás ramas a previews. La web reescribe `/api/*` hacia la api de su ambiente (`API_ORIGIN`, que Vercel resuelve en cada petición): producción → api de producción; `dev` y las previews de PR → api de dev. `BETTER_AUTH_URL` es el origen de la web, no el de la api.
- Cada app se reconstruye solo si el commit la afecta (`scripts/vercel-ignore.mjs`, con `turbo query`). La web usa de la api solo los tipos: si empieza a importar código de otro paquete del workspace, lo declara en su `package.json` y no lo marca `--type-only`.
- Migraciones: `.github/workflows/migrate.yml` las aplica en cada push a `dev` (rama `dev` de Neon) y a `prod` (rama `main`), con el `DATABASE_URL_UNPOOLED` del GitHub Environment de esa rama. Las previews de PR usan Neon `dev`.
- Lo que se configura a mano en los dashboards y el primer despliegue: [docs/deploy.md](docs/deploy.md).

### Migraciones compatibles hacia atrás

Vercel despliega la api mientras corre la migración, y la versión anterior sigue atendiendo hasta que la nueva la reemplaza. Por eso cada migración debe funcionar con el código que ya está desplegado:

- Se puede agregar en un solo paso: tablas, columnas nullable o con default, índices, valores nuevos de un CHECK que solo amplían.
- Quitar o renombrar una tabla o columna, volverla obligatoria o cambiar su tipo va en dos releases: primero el código deja de depender de lo viejo (o escribe en lo viejo y lo nuevo); en un release posterior, la migración lo quita.
- En producción, Vercel no publica la api nueva hasta que el job `Migrate database` pasa (Deployment Checks), así que el código nuevo puede contar con el esquema nuevo. En `dev` no hay esa espera: el código nuevo puede correr unos segundos contra el esquema viejo.
- La web y la api se despliegan por separado y en cualquier orden: un cambio en el contrato de la api también va en pasos compatibles (la api acepta lo viejo y lo nuevo hasta que la web nueva está publicada).
- Una migración aplicada no se edita, y nunca se usa `drizzle-kit push`.

## Comandos

```sh
bun install            # instala dependencias
bun run dev            # web en http://localhost:4321 y api en http://localhost:3000
bun run lint           # Biome en todo el repo
bun run format         # Biome con --write (formato, orden de imports, fixes seguros)
bun run typecheck      # tsc en paquetes y api; astro check en web
bun run test           # bun test
bun run build          # web → apps/web/dist, api → apps/api/dist
bun run db:generate    # genera una migración a partir del schema (no se conecta a la base)
bun run db:migrate     # aplica las migraciones pendientes en DATABASE_URL_UNPOOLED
bun run db:studio      # Drizzle Studio sobre DATABASE_URL_UNPOOLED
bun run db:seed        # hogar completo desde las variables SEED_* (idempotente; imprime el código de recuperación una vez)

bun run test --filter=@time-craft/core   # cualquier tarea, en un solo paquete
```
