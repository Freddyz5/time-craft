# packages/db

Schema Drizzle de las 18 tablas (incluidas las de Better Auth), índices parciales, migraciones versionadas, cliente y seed. Referencia: [docs/timecraft_v1.sql](../../docs/timecraft_v1.sql). Se exporta como TypeScript fuente, sin build.

Por ahora está vacío: llega en la Fase 2. `db:generate` y `db:migrate` son no-op.

No debe:

- Contener reglas de negocio: van en `core`.
- Depender de `core` ni de `apps/*`: solo `api` depende de `db`.
- Aplicar cambios con `drizzle-kit push` en producción: siempre `generate` + `migrate`, compatibles hacia atrás.
