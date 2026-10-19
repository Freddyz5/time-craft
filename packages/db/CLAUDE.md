# packages/db

Schema Drizzle de las 18 tablas (incluidas las de Better Auth), índices parciales, migraciones versionadas, cliente y seed. Referencia: [docs/timecraft_v1.sql](../../docs/timecraft_v1.sql). Se exporta como TypeScript fuente, sin build.

- `src/schema/`: un archivo por sección del SQL (`auth`, `family`, `rules`, `requests`, `timer`, `bonuses`, `notifications`) y `relations.ts` para el query API. Cada tabla exporta sus tipos inferidos (`Family`, `NewFamily`…). Los nombres de constraints e índices son los del SQL de referencia.
- `src/client.ts`: `createDb(connectionString)` con el driver `neon-serverless` (Pool por WebSocket, para transacciones interactivas). Node 22+ y Bun traen `WebSocket` global, así que no se configura `ws`. `Db` y `Transaction` aceptan cualquier base Postgres de Drizzle con este schema (Neon o PGlite).
- `migrations/`: las genera `drizzle-kit generate` y no se editan a mano (Biome las ignora). `db:migrate` las aplica con `DATABASE_URL_UNPOOLED`.
- `src/seed.ts` + `scripts/seed.ts`: seed idempotente (familia, padres, actividades) desde las variables `SEED_*`.
- Tests: `bun test` aplica las migraciones reales a PGlite en memoria (`src/testing.ts`).
- `db:migrate`, `db:studio` y `db:seed` leen el `.env` de la raíz con `bun --env-file`; las variables de la shell tienen prioridad.

No debe:

- Contener reglas de negocio: van en `core`.
- Depender de `core` ni de `apps/*`: solo `api` depende de `db`.
- Aplicar cambios con `drizzle-kit push`: siempre `generate` + `migrate`, compatibles hacia atrás.
