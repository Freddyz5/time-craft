# packages/db

Schema Drizzle de las 18 tablas (incluidas las de Better Auth), índices parciales, migraciones versionadas, cliente y seed. Referencia: [docs/timecraft_hito_1.sql](../../docs/timecraft_hito_1.sql). Se exporta como TypeScript fuente, sin build.

- `src/schema/`: un archivo por sección del SQL (`auth`, `family`, `rules`, `requests`, `timer`, `bonuses`, `notifications`) y `relations.ts` para el query API. Cada tabla exporta sus tipos inferidos (`Family`, `NewFamily`…). Los nombres de constraints e índices son los del SQL de referencia. Las tablas `auth_*` se comparan con el CLI de Better Auth (cómo, en `apps/api/CLAUDE.md`).
- `src/client.ts`: `createDb(connectionString)` con el driver `neon-serverless` (Pool por WebSocket, para transacciones interactivas). Node 22+ y Bun traen `WebSocket` global, así que no se configura `ws`. `Db` y `Transaction` aceptan cualquier base Postgres de Drizzle con este schema (Neon o PGlite).
- `migrations/`: las genera `drizzle-kit generate` y no se editan a mano (Biome las ignora). `db:migrate` las aplica con `DATABASE_URL_UNPOOLED`. En `dev` y `prod` las aplica GitHub Actions (`migrate.yml`) en cada push, así que deben ser compatibles hacia atrás (la regla está en el `CLAUDE.md` raíz).
- `src/seed.ts` (`@time-craft/db/seed`): la parte del seed que es solo de la base (familia, padres y actividades), idempotente. El seed completo (`bun run db:seed`) vive en `apps/api`, porque también crea logins con Better Auth.
- Tests: `bun test` aplica las migraciones reales a PGlite en memoria (`src/testing.ts`, exportado como `@time-craft/db/testing` para los tests de la api).
- `db:migrate` y `db:studio` leen el `.env` de la raíz con `bun --env-file`; las variables de la shell tienen prioridad.

No debe:

- Contener reglas de negocio: van en `core`.
- Depender de `core` ni de `apps/*`: solo `api` depende de `db`.
- Aplicar cambios con `drizzle-kit push`: siempre `generate` + `migrate`, compatibles hacia atrás.
