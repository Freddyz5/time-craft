# Time Craft

Sistema familiar para controlar el tiempo de pantalla de un niño de 9 años (Minecraft en PC y YouTube en una TV LG) con cuotas diarias y semanales tipo "créditos".
Lo usan los dos padres y el niño, cada uno desde su teléfono o navegador y desde cualquier lugar.
Hito 1 (MVP): cronómetro compartido, cuotas, bonos por tareas, alarmas push y dashboard. Se registra a mano: no detecta el juego ni la TV.
Hito 2: app Android (Capacitor) que muestra la misma web y hace sonar las alarmas con la pantalla apagada, con login de Google nativo y huella.
Los padres inician, pausan y detienen sesiones y aprueban solicitudes; el niño solo ve su saldo y pide (empezar, tiempo extra, bonos).
El servidor es la fuente de verdad del cronómetro, y el saldo no se guarda: se calcula a partir de las sesiones.
Las alarmas (inicio programado, aviso, fin y cierre automático) van por Upstash QStash, sin cron.
Stack: Bun + Turborepo, Hono en Vercel, Better Auth, PostgreSQL en Neon con Drizzle, y Astro estático con islas React y Tailwind.
Todo debe funcionar en planes gratuitos (Vercel Hobby, Neon Free, QStash Free).
El producto avanza por hitos; cada hito se construye en fases y cada fase es un PR. La web y la api llevan además su propia versión semántica, independiente de los hitos (ver «Ramas y despliegue»).
Fuente de verdad: [docs/contexto-hito-1.md](docs/contexto-hito-1.md) y, para la app Android, [docs/contexto-hito-2.md](docs/contexto-hito-2.md). Schema de referencia: [docs/timecraft_hito_1.sql](docs/timecraft_hito_1.sql) (más la tabla `native_push_tokens` del hito 2). Si algo no está ahí, pregunta antes de suponer.

## Estructura del monorepo

```
apps/
  api/        Hono en Vercel: rutas, auth (Better Auth), adaptadores (Drizzle, QStash, Web Push), composition root
  web/        Astro (salida estática) + islas React + Tailwind
  mobile/     app Android: Capacitor alrededor de la web publicada, avisos FCM y alarma nativa (no se despliega en Vercel)
  e2e/        Playwright: los 8 pasos del flujo contra la web y el smoke test de producción (no se despliega)
packages/
  core/       dominio, casos de uso y puertos
  db/         schema Drizzle, migraciones, cliente y seed
  tsconfig/   configs de TypeScript compartidas (base, node, astro)
```

Dirección de dependencias:

- `api → core` y `api → db`. Los adaptadores de `api` implementan los puertos de `core`.
- `mobile` no depende de ningún paquete: muestra la web publicada. Sus scripts de build leen los sonidos y la marca de `web` por ruta relativa.
- `e2e` usa el seed y el container de `api` (`@time-craft/api/seed`, `/container`) para crear su familia de prueba; nada depende de `e2e`.
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

- Un PR por fase, desde una rama creada a partir de `dev` (p. ej. `feat/f2-db`) y hacia `dev`. Un release es un PR de `dev` a `prod`, fusionado con merge commit (sin squash ni rebase). `prod` solo recibe PRs desde `dev` (lo revisa el job `PR to prod comes from dev` de `ci.yml`) y se fusiona con CI en verde. Las ramas no tienen rulesets: GitHub no lo bloquea, es una regla del flujo.
- Vercel tiene un proyecto por app, cada uno configurado en el `vercel.json` de la app. `prod` despliega a producción, `dev` a sus dominios fijos y las demás ramas a previews. La web reescribe `/api/*` hacia la api de su ambiente (`API_ORIGIN`, que Vercel resuelve en cada petición): producción → api de producción; `dev` y las previews de PR → api de dev. `BETTER_AUTH_URL` es el origen de la web, no el de la api.
- Cada app se reconstruye solo si el commit la afecta (`scripts/vercel-ignore.mjs`, con `turbo query`). En producción, solo con su commit de release (`chore(release): web-v…`); el merge de `dev` a `prod` no despliega. Para una emergencia: Redeploy en Vercel sin el paso de ignorar; en producción la api queda en *Running Checks* (un redeploy nunca cumple su Deployment Check) y se publica con Force Promote, tras ver que `Migrate` pasó en ese commit. La web usa de la api solo los tipos: si empieza a importar código de otro paquete del workspace, lo declara en su `package.json` y no lo marca `--type-only`.
- Migraciones: `.github/workflows/migrate.yml` las aplica en cada push a `dev` (rama `dev` de Neon) y a `prod` (rama `main`), con el `DATABASE_URL_UNPOOLED` del GitHub Environment de esa rama. Las previews de PR usan Neon `dev`.
- Versiones: la web, la api y la app Android tienen cada una su versión semántica en su `package.json`, que no se edita a mano. En cada push a `prod`, `.github/workflows/release.yml` corre semantic-release por app (`scripts/release/`). Cuenta los commits desde el último tag de la app que tocaron su carpeta, la de un paquete del workspace del que depende o un archivo raíz del build (un `feat(core)` sube la api; la web no cuenta la api, de la que solo usa tipos). Escribe la versión y el `CHANGELOG.md` de la app, hace el commit en `prod`, crea el tag (`web-v1.2.0`, `api-v1.2.0`, `mobile-v1.2.0`) y el GitHub Release, y al final fusiona `prod` en `dev`. Un tag `mobile-v…` construye el APK firmado y lo adjunta a su release (`.github/workflows/android.yml`). Por eso el tipo del commit importa: `feat` sube el minor; `fix`, `perf`, `refactor`, `build`, `style`, `chore` y `ci` el patch (todo lo que se despliega publica versión); `!` o `BREAKING CHANGE:` el major; `docs` y `test` no publican. Esos pushes los hace la GitHub App de releases: con el `GITHUB_TOKEN` del workflow no correría Migrate en el commit del release. La web muestra su versión en las pantallas de entrada y la api la devuelve en `/health`.
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

TIMECRAFT_WEB_URL=<web> bun --cwd=apps/mobile run android:debug   # APK de prueba (Java 21 y SDK de Android)

bun run e2e            # e2e con Playwright contra E2E_BASE_URL (por defecto la web local); crea y borra su familia
bun run e2e:smoke      # smoke test de solo lectura (E2E_BASE_URL y E2E_API_URL), apto para producción
bun run e2e:family:create   # una familia de prueba para mirar a mano; e2e:family:delete <id>… | --all la borra
```

El e2e escribe en la base de `DATABASE_URL_UNPOOLED` y solo acepta una marcada como de pruebas (`COMMENT ON DATABASE … IS 'timecraft:dev'`, en Neon `dev` o una local): nunca producción. Lo que no se automatiza se revisa con [docs/verificacion-manual.md](docs/verificacion-manual.md).
