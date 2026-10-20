# apps/api

API REST con Hono, desplegada en Vercel. Contiene las rutas, la autenticación (Better Auth montado en `/api/auth/*`), los adaptadores (Drizzle, QStash, Web Push, Better Auth) que implementan los puertos de `core`, el mapeo de errores de dominio a HTTP y el composition root.

- `src/index.ts`: composition root de producción. Valida el entorno (`src/env.ts`, zod: si falta una variable, falla al arrancar), crea la base y los adaptadores reales y hace `export default app` (formato zero-config de Vercel). También exporta `AppType` para el cliente `hc<AppType>` de la web.
- `src/container.ts`: arma Better Auth, `core` con sus adaptadores y la app. Lo usan `index.ts`, el seed y los tests (con su base y fakes).
- `src/app.ts`: Better Auth en `/api/auth/*`; las rutas REST bajo `/api` exigen sesión de un padre o del niño (salvo `/api/recovery-code/use`); el callback de QStash en `/internal/jobs`.
- `src/auth/`: configuración de Better Auth y sus hooks. Adapter Drizzle con el schema de `packages/db` (cada `modelName` es el nombre del export: `authUser` → tabla `auth_user`). Email + contraseña sin registro (`disableSignUp`), plugin `username` para el niño, Google solo si hay `GOOGLE_CLIENT_ID` (sin alta de usuarios: solo entran los correos que ya existen), rate limit en la base. Los hooks llaman a `core`: bloqueo del niño tras 5 PIN errados, regla de contraseña de padres en `/change-password` y limpieza de filas vencidas tras cada inicio de sesión.
- `src/adapters/`: repositorios Drizzle y `UnitOfWork` (`drizzle/`), QStash (`qstash.ts`), Web Push (`web-push.ts`), identidad sobre `auth.$context` (`identity.ts`), código de recuperación con scrypt (`recovery-codes.ts`), reloj e ids (`system.ts`).
- `src/http/`: formato de error único `{ error: { code, message, details? } }` (validation 400, unauthorized 401, forbidden 403, not_found 404, conflict 409, rule 422), validación con `@hono/zod-validator`, sesión → `Actor` y rate limit propio para el código de recuperación.
- `src/routes/`: un archivo por módulo. Las respuestas del cronómetro incluyen `serverTime`.
- `scripts/build.ts` empaqueta `src/index.ts` en `dist/index.js`: incluye los paquetes del workspace y deja externas las dependencias npm de este `package.json`. `vercel.json` configura el proyecto de Vercel: preset Hono, instalación con Bun, build con turbo, salida `dist` y el paso de ignorar el build (`scripts/vercel-ignore.mjs` en la raíz: solo construye si cambió la api o algo de lo que depende). `engines` fija Node 22 para la función.
- `bun run dev` sirve la api en http://localhost:3000 con el `.env` de la raíz. `bun run db:seed` (`scripts/seed.ts`) siembra el hogar completo e imprime el código de recuperación una sola vez.

## Better Auth

- El navegador llega a `/api/auth` por el dominio de la web (la web reescribe `/api/*` hacia la api), así que `BETTER_AUTH_URL` es el origen de la web, no el de la api. En el ambiente Preview, `BETTER_AUTH_TRUSTED_ORIGINS` agrega las URLs de las previews de PR de la web (un patrón con `*`), que hablan con la api de dev.
- No se usa el plugin `admin`: su `setUserPassword` exige una sesión de administrador y el flujo del código de recuperación no tiene sesión. `IdentityService` hace lo mismo que esos endpoints por dentro (`password.hash` + `internalAdapter`).
- Tras subir de versión Better Auth o cambiar sus plugins, compara su schema con `packages/db/src/schema/auth.ts`: crea un archivo temporal que exporte `auth = createAuth({...})` (con una base PGlite) y corre `bunx auth@<versión> generate --config <archivo> --output <scratch>`. Si falta algo, ajústalo en `packages/db` con una migración. Better Auth además valida tablas y columnas al primer request.

## Tests

- `bun test` con `app.request()` contra PGlite (las migraciones reales), Better Auth real, reloj fijo y fakes de QStash y Web Push (`src/testing/harness.ts`). La base sembrada se crea una vez y cada test trabaja sobre un clon.
- PGlite es una sola conexión: una consulta fuera de una transacción abierta espera a que termine. Por eso en los tests las consultas de Better Auth se unen a la transacción en curso; en Neon cada una usa su propia conexión del pool.

## QStash en local

QStash no puede llamar a `localhost`, así que hay dos caminos:

1. **Servidor de desarrollo de QStash** (recomendado): corre en tu máquina y llama a la api local.
   ```sh
   npx @upstash/qstash-cli dev            # http://127.0.0.1:8080
   ```
   Imprime credenciales fijas de desarrollo. Ponlas en el `.env` de la raíz junto con la URL local de la api:
   ```sh
   QSTASH_URL=http://127.0.0.1:8080
   QSTASH_TOKEN=<el que imprime>
   QSTASH_CURRENT_SIGNING_KEY=<el que imprime>
   QSTASH_NEXT_SIGNING_KEY=<el que imprime>
   PUBLIC_API_URL=http://localhost:3000
   ```
   Los mensajes viven en memoria: se pierden al reiniciarlo. Su consola está en https://console.upstash.com/qstash/local-mode-user?port=8080.
2. **Túnel** (ngrok, cloudflared) hacia `localhost:3000` con las credenciales reales de QStash: `PUBLIC_API_URL` es la URL pública del túnel y `QSTASH_URL` es la de la región de tu cuenta (vacío si es EU).

La firma se verifica contra `PUBLIC_API_URL + /internal/jobs` (la URL a la que se publicó el mensaje). No uses `QSTASH_DEV`: el adaptador configura el SDK explícitamente y lo ignora.

No debe:

- Contener reglas de negocio: van en `core`. La api traduce HTTP ↔ casos de uso.
- Usar APIs exclusivas de Bun en `src/` (salvo en tests): en Vercel corre en Node.
- Sacar `hono` de las dependencias externas del bundle: Vercel detecta el entrypoint buscando el import de `hono`.
- Usar en runtime una dependencia npm sin declararla aquí: si no está en este `package.json`, termina dentro del bundle en vez de quedar externa.
- Exponer el token de una sesión de login (`auth_session.token`): es su secreto.
