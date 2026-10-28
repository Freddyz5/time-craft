# apps/e2e

Pruebas de punta a punta con Playwright: los 8 pasos del flujo del hito 1 ([docs/contexto-hito-1.md](../../docs/contexto-hito-1.md)) a través de la web, como los usan los padres y el niño, cada uno en su propio contexto de navegador (su "teléfono"). También el smoke test de producción. No se despliega.

- `playwright.config.ts`: dos suites contra `E2E_BASE_URL` (la web, por defecto `http://localhost:4321`). **e2e** (`tests/flows/`, un archivo por paso, más tiempo extra y cuentas): depende del proyecto `setup`, que crea una familia para la corrida e inicia sesión de Ana, Luis y el niño, y su `teardown` la borra. Todos los tests comparten esa familia, así que corren de a uno y cada uno empieza con la familia limpia (`cleanSlate` en `tests/support/fixtures.ts`). **smoke** (`tests/smoke/`): solo lectura, sin base ni familia; apto para producción. Usa el Chrome instalado (`channel: "chrome"`): Web Push no funciona en Chromium sin claves de Google y los runners Ubuntu de GitHub ya lo traen. Teléfono Pixel 7, `es-EC`.
- `src/db.ts`: la conexión a la base y el **candado**. El e2e escribe en la base del ambiente que prueba, así que solo acepta una marcada como de pruebas con `COMMENT ON DATABASE <db> IS 'timecraft:dev'`. Una cadena de Neon no dice a qué rama apunta; el comentario vive solo en la rama donde se escribió, así que `main` (producción) nunca lo tiene y queda rechazada. No se usa `ALTER DATABASE … SET`: con un parámetro propio, Postgres 15+ exige superusuario, y el dueño de la base en Neon no lo es.
- `src/family.ts`: la familia de prueba con el seed y `core` de la api (`@time-craft/api/seed` y `/container`): dos padres con contraseña, el niño (usuario + PIN), Juego y TV, política global (120 min al día, 600 a la semana), dos tareas de bono y el código de recuperación. Nombres, correos (`@e2e.timecraft.test`) y usuario llevan un id propio, y su zona horaria es una donde ahora es mediodía: nada cambia de día durante la corrida. `resetTestFamily` la deja como recién creada; `deleteTestFamilies` solo borra familias cuyos padres usan ese dominio.
- `scripts/family.ts`: `bun run family:create` (imprime la familia con sus contraseñas, para mirar a mano) y `bun run family:delete <id>… | --all` (restos de corridas que se cortaron). `bun run e2e` no los necesita: crea y borra su propia familia.
- `tests/support/`: personas y sesiones (`people.ts`), atajos de la api (`api.ts`) y de la base (`db.ts`: `session_alerts`, gastar el día, vencer una solicitud), pasos de pantalla (`ui.ts`) y el estado que deja `setup` en `.e2e/` (ignorado por git).
- Variables (de la shell o del `.env` raíz; la shell gana): `E2E_BASE_URL`, `E2E_API_URL` (solo smoke, `/health`), `DATABASE_URL_UNPOOLED` (cadena directa de la base del ambiente), `VERCEL_AUTOMATION_BYPASS_SECRET` (dominio de dev y previews: la web tiene Vercel Authentication) y `E2E_SLOW=1` (incluye los tests `@slow`).

## Correr

```sh
bun run dev                                  # web 4321 y api 3000 con el .env raíz
npx @upstash/qstash-cli dev                  # las alarmas (ver apps/api/CLAUDE.md)
bun run e2e                                  # desde la raíz o desde apps/e2e
E2E_SLOW=1 bun run e2e --grep @slow          # el cierre real por QStash (~4 min)
E2E_BASE_URL=<web> E2E_API_URL=<api> bun run e2e:smoke
```

Contra dev, `E2E_BASE_URL` es el dominio fijo de la web en dev (o una preview de PR), `DATABASE_URL_UNPOOLED` la cadena directa de Neon `dev` y hace falta el secreto de bypass. Lo corre el workflow manual `.github/workflows/e2e.yml` (configuración en [docs/deploy.md](../../docs/deploy.md)). Las alarmas reales necesitan que QStash llegue a la api: en local, el servidor de desarrollo de QStash.

## Cómo escribir tests

- Por la pantalla lo que se prueba; por la api (`tests/support/api.ts`) lo que solo prepara el escenario; por la base lo que la pantalla no muestra (`session_alerts`, overrides) o lo que tardaría horas (gastar el día, vencer una solicitud).
- Selectores por rol y nombre accesible, en español como la UI. Los minutos llevan espacio duro (`30 min`): en una cadena Playwright lo normaliza, en una regex usa `\s`.
- La otra persona se entera por polling (5 s): las esperas por defecto son de 15 s.
- Un test que cambia contraseñas o el PIN los restaura (`restoreCredentials`).

No debe:

- Correr contra producción salvo el smoke test, ni quitar o rodear el candado de `src/db.ts`.
- Dejar sesiones abiertas al borrar filas: ciérralas por la api (`closeOpenSession`) para que sus mensajes de QStash se cancelen.
- Depender del orden entre archivos: cada test empieza de la familia limpia.
