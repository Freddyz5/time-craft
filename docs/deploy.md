# Despliegue

Cómo se publica Time Craft y qué hay que configurar a mano, una sola vez, en Vercel, Neon, GitHub, Google Cloud y Upstash. Lo que vive en el código no se toca en los dashboards:

| Qué | Dónde |
|---|---|
| Build, instalación, salida y reescritura `/api/*` de la web | [`apps/web/vercel.json`](../apps/web/vercel.json) |
| Build, instalación y salida de la api | [`apps/api/vercel.json`](../apps/api/vercel.json) |
| Saltar el build de la app que un commit no afecta | [`scripts/vercel-ignore.mjs`](../scripts/vercel-ignore.mjs) (el `ignoreCommand` de cada app) |
| Lint, typecheck, tests y build en cada PR | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
| Migraciones de Neon al hacer push a `dev` o `prod` | [`.github/workflows/migrate.yml`](../.github/workflows/migrate.yml) |
| E2E contra dev y smoke test de producción, a mano | [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml) (parte D) |
| Versión, `CHANGELOG.md`, tag y GitHub Release de cada app en cada push a `prod` | [`.github/workflows/release.yml`](../.github/workflows/release.yml) y [`scripts/release/`](../scripts/release/) (parte E) |
| Versión de Node (22) | `engines` en `apps/api/package.json` y `apps/web/package.json` |

## Cómo fluye un cambio

```
feat/*  ──PR──▶  dev  ──PR (release)──▶  prod
         CI       │                      │
     previews     ├─ Migrate: Neon dev   ├─ Migrate: Neon main
                  └─ Vercel: dominio     └─ Release: versión y tag
                     fijo de dev            de cada app, vuelta a dev
                                              │
                                              ├─ Migrate: Neon main
                                              └─ Vercel: producción, solo
                                                 los commits de release
                                                 (la api espera a Migrate)
```

| | Producción | Dev | Previews de PR |
|---|---|---|---|
| Rama | `prod` | `dev` | cualquier otra |
| Web | `<WEB_PROD>` | `<WEB_DEV>` (fijo) | una URL por deployment |
| La web habla con | api de producción | api de dev | api de dev |
| Base de datos | Neon `main` | Neon `dev` | Neon `dev` |
| Login con Google | sí | sí | no: email y contraseña |
| Alarmas (QStash) | api de producción | api de dev | las procesa la api de dev |
| Protección de Vercel (web) | pública | solo tú, con tu sesión de Vercel | solo tú |

- En producción solo se despliegan releases: cada app se construye con su commit de release, que hace el workflow `Release` después del merge de `dev` (parte E). En `dev` y las previews, cada push crea deployments solo de la app que cambió: un cambio solo en la api no reconstruye la web, y al revés. La web usa de la api solo sus tipos, así que un cambio en `api`, `core` o `db` no la reconstruye. Un cambio en `turbo.json`, el `package.json` raíz o `bunfig.toml` reconstruye las dos; uno en `bun.lock`, las apps cuyas dependencias cambiaron. Uno solo en `docs/`, `.github/` o los `CLAUDE.md` raíz no reconstruye ninguna. En el primer push de una rama no hay un deployment anterior con qué comparar, así que el paso de ignorar construye todo lo que Vercel no haya saltado por su cuenta.
- Las previews de PR de la web hablan con la api de **dev**, no con una preview de la api. Si un PR cambia la api y la web a la vez, prueba la pareja completa en dev después del merge.
- Las migraciones corren en GitHub Actions al mismo tiempo que Vercel despliega. Por eso deben ser **compatibles hacia atrás** (la regla está en el [`CLAUDE.md`](../CLAUDE.md) raíz). En producción, Vercel no publica la api nueva hasta que el job `Migrate database` termina bien (paso 9).

## Tus valores

El resto del documento usa estos nombres. Anótalos a medida que los obtienes:

| Nombre | Qué es | Ejemplo |
|---|---|---|
| `<WEB_PROD>` | Dominio de producción del proyecto web (Vercel lo asigna, paso 4) | `https://time-craft-web.vercel.app` |
| `<API_PROD>` | Dominio de producción del proyecto api (paso 3) | `https://time-craft-api.vercel.app` |
| `<WEB_DEV>` | Dominio fijo de la web para la rama `dev` (lo eliges, paso 5) | `https://time-craft-web-dev.vercel.app` |
| `<API_DEV>` | Dominio fijo de la api para la rama `dev` (paso 5) | `https://time-craft-api-dev.vercel.app` |
| `<SCOPE>` | Sufijo de tu cuenta en las URLs de Vercel (paso 4) | `freddyz5s-projects` |

Los cuatro dominios van con `https://` y sin `/` al final.

---

## Parte A. Configuración inicial (una vez, antes de fusionar la fase 6 en `dev`)

### 1. Neon: una rama por ambiente

- [ ] En la consola de Neon, abre el proyecto. La rama `main` es **producción**.
- [ ] **Branches → New branch**: nombre `dev`, rama padre `main`, desde *Current point in time* → **Create**. `dev` nace como copia de `main`: si `main` ya tiene el hogar de fases anteriores, `dev` también; si está vacía, el seed va en el paso 10. Las migraciones que falten las aplica GitHub Actions (pasos 9 y 12).
- [ ] Para cada rama (`main` y `dev`), saca dos cadenas con el botón **Connect** del proyecto (elige la rama en el selector *Branch*):
  - con **Connection pooling** activado (el host lleva `-pooler`): es `DATABASE_URL`, la que usa la api;
  - con **Connection pooling** desactivado: es `DATABASE_URL_UNPOOLED`, la de las migraciones.
- [ ] Anota la región del proyecto (Settings → General, p. ej. `AWS US East 1 (N. Virginia)`). La usarás en el paso 3.
- [ ] **No instales** la integración de Neon en Vercel: crea una rama de Neon por cada preview y reescribe `DATABASE_URL`. Aquí las previews usan la rama `dev`.

### 2. GitHub: un Environment por rama, con la cadena de migraciones

En el repo: **Settings → Environments → New environment**.

- [ ] Nombre `dev` → **Configure environment**:
  - **Deployment branches and tags** → *Selected branches and tags* → **Add deployment branch or tag rule** → *Ref type* Branch, *Name pattern* `dev` → **Add rule**.
  - **Environment secrets → Add environment secret**: nombre `DATABASE_URL_UNPOOLED`, valor la cadena **directa** (sin pooling) de la rama `dev` de Neon.
- [ ] Lo mismo con el nombre `prod`: regla de rama `prod` y la cadena **directa** de `main`.

El workflow `Migrate` elige el Environment por el nombre de la rama, y la regla impide que otra rama lea esos secretos.

### 3. Vercel: proyecto de la api

Si ya creaste el proyecto de la api en la fase 1, ábrelo y revisa cada punto en lugar de importarlo de nuevo.

- [ ] [vercel.com/new](https://vercel.com/new) → **Import** del repo `Freddyz5/time-craft`.
  - *Project Name*: `time-craft-api`.
  - *Root Directory* → **Edit** → `apps/api`.
  - *Framework Preset* y *Build and Output Settings*: déjalos como estén; `apps/api/vercel.json` manda.
  - **Deploy**. Este primer deployment sale de la rama `prod` tal como está (fase 2) y puede fallar o quedar incompleto: es normal hasta el primer release (parte B).
- [ ] **Settings → Environments → Production → Branch Tracking**: la rama es `prod`. En versiones anteriores del panel está en **Settings → Git → Production Branch**.
- [ ] **Settings → Build and Deployment**:
  - *Root Directory*: `apps/api`, con **Include files outside the root directory in the Build Step** activado (la api empaqueta `packages/*`) y **Skip deployments when there are no changes to the root directory or its dependencies** activado.
  - *Node.js Version*: `22.x`.
  - *Ignored Build Step*: no lo cambies; `vercel.json` ya trae el `ignoreCommand`.
- [ ] **Settings → Functions → Function Region**: la más cercana a la región de Neon. Por ejemplo, Neon en `AWS US East 1` → `Washington, D.C., USA (iad1)`; `AWS US East 2` → `Cleveland, USA (cle1)`; `AWS US West 2` → `Portland, USA (pdx1)`; `AWS São Paulo` → `São Paulo, Brazil (gru1)`.
- [ ] **Settings → Deployment Protection → Vercel Authentication**: **desactivado** → **Save**. La api la llaman la reescritura de la web y QStash, de servidor a servidor, y ninguno de los dos tiene tu sesión de Vercel. Sus rutas ya están protegidas: todo `/api/*` exige sesión de Better Auth (salvo el login y el código de recuperación, con su rate limit) y `/internal/jobs` exige la firma de QStash. Más detalles en [QStash y la protección de Vercel](#qstash-y-la-protección-de-vercel).
- [ ] **Settings → Domains**: anota el dominio de producción que asignó Vercel → es `<API_PROD>`.

### 4. Vercel: proyecto de la web

- [ ] [vercel.com/new](https://vercel.com/new) → **Import** del mismo repo otra vez.
  - *Project Name*: `time-craft-web`.
  - *Root Directory* → **Edit** → `apps/web`.
  - **Environment Variables**: agrega `API_ORIGIN` = `<API_PROD>`, de tipo **Config** (al importar se aplica a todos los ambientes; en el paso 7 ajustas Preview).
  - **Deploy**. Igual que la api, este primer deployment sale de la fase 2 de `prod`.
- [ ] **Settings → Environments → Production → Branch Tracking**: `prod`.
- [ ] **Settings → Build and Deployment**: *Root Directory* `apps/web`, con **Include files outside the root directory in the Build Step** y **Skip deployments when there are no changes…** activados; *Node.js Version* `22.x`; *Ignored Build Step* sin tocar (lo trae `vercel.json`).
- [ ] **Settings → Deployment Protection → Vercel Authentication**: déjalo en **Standard Protection** (el valor por defecto). Las previews y el dominio de dev solo los abre quien tiene sesión en tu cuenta de Vercel; producción es pública.
- [ ] **Settings → Domains**: anota el dominio de producción → es `<WEB_PROD>`.
- [ ] Busca `<SCOPE>`: es el final de cualquier URL de deployment del proyecto (en **Deployments**, abre uno: `time-craft-web-abc123-<SCOPE>.vercel.app`). También aparece en la URL del panel: `vercel.com/<SCOPE>/time-craft-web`.

### 5. Vercel: dominio fijo para `dev`

Google exige registrar la URL de retorno y QStash necesita una URL estable a la que llamar, así que `dev` tiene dominios fijos en los dos proyectos.

- [ ] Proyecto **time-craft-api** → **Settings → Domains → Add Domain** → escribe `time-craft-api-dev.vercel.app` → en *Connect to an environment* elige **Preview** y en **Git Branch** escribe `dev` → **Save**. Si Vercel dice que el nombre no está libre, prueba otro (`time-craft-api-dev-<algo>.vercel.app`). Ese es `<API_DEV>`.
- [ ] Proyecto **time-craft-web** → lo mismo con `time-craft-web-dev.vercel.app`, Preview, rama `dev`. Ese es `<WEB_DEV>`.

### 6. Secretos y claves por ambiente

Genera en tu máquina, una vez por ambiente (Production y Preview), sin reutilizarlos entre ambientes:

```sh
openssl rand -base64 32          # BETTER_AUTH_SECRET
bunx web-push generate-vapid-keys  # VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY
```

**Google Cloud** ([console.cloud.google.com/auth](https://console.cloud.google.com/auth)). Si ya tienes el cliente OAuth de la fase 4, solo agrega las URLs:

- [ ] **Audience**: modo *Testing*, con los correos de los dos padres en *Test users*.
- [ ] **Clients** → tu cliente *Web application* (o **Create client** → *Web application*):
  - *Authorized JavaScript origins*: `<WEB_PROD>` y `<WEB_DEV>`.
  - *Authorized redirect URIs*: `<WEB_PROD>/api/auth/callback/google` y `<WEB_DEV>/api/auth/callback/google`. Para probar Google en local, agrega también `http://localhost:4321/api/auth/callback/google`.
- [ ] Copia el *Client ID* y el *Client secret*. Producción y dev usan el mismo cliente.

**QStash** ([console.upstash.com/qstash](https://console.upstash.com/qstash)):

- [ ] Arriba, elige la región. Recomendada: **US East**, cerca de la api; los mensajes, las claves y la facturación son de cada región.
- [ ] De la sección **Quickstart** copia `QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY` y `QSTASH_NEXT_SIGNING_KEY`. Producción y dev usan la misma cuenta (el plan gratis da 1.000 mensajes al día entre los dos). En la región EU, `QSTASH_URL` puede quedar vacío.

### 7. Vercel: variables de entorno

**Settings → Environment Variables → Add Environment Variable**. En *Environments* marca solo lo que dice cada columna; para "Preview, solo `dev`" marca Preview y en *Branch* escribe `dev` (un valor por rama gana al de Preview general). No marques *Development*: en local se usa el `.env`.

Proyecto **time-craft-api**:

| Variable | Production | Preview (todas las ramas) | Preview, solo `dev` |
|---|---|---|---|
| `DATABASE_URL` | Neon `main`, con pooling | Neon `dev`, con pooling | |
| `BETTER_AUTH_SECRET` | el de producción | el de preview | |
| `BETTER_AUTH_URL` | `<WEB_PROD>` | `<WEB_DEV>` | |
| `BETTER_AUTH_TRUSTED_ORIGINS` | | `https://time-craft-web-*-<SCOPE>.vercel.app` | |
| `GOOGLE_CLIENT_ID` | el del cliente | | el del cliente |
| `GOOGLE_CLIENT_SECRET` | el del cliente | | el del cliente |
| `QSTASH_URL` | la de tu región | la de tu región | |
| `QSTASH_TOKEN` | de Quickstart | de Quickstart | |
| `QSTASH_CURRENT_SIGNING_KEY` | de Quickstart | de Quickstart | |
| `QSTASH_NEXT_SIGNING_KEY` | de Quickstart | de Quickstart | |
| `PUBLIC_API_URL` | `<API_PROD>` | `<API_DEV>` | |
| `VAPID_PUBLIC_KEY` | par de producción | par de preview | |
| `VAPID_PRIVATE_KEY` | par de producción | par de preview | |
| `VAPID_SUBJECT` | `mailto:<tu correo>` | `mailto:<tu correo>` | |

Proyecto **time-craft-web** (edita el `API_ORIGIN` que pusiste al importar):

| Variable | Production | Preview (todas las ramas) | Preview, solo `dev` |
|---|---|---|---|
| `API_ORIGIN` | `<API_PROD>` | `<API_DEV>` | |
| `VAPID_PUBLIC_KEY` | par de producción (la misma que en la api) | par de preview | |
| `GOOGLE_CLIENT_ID` | el del cliente | | el del cliente |

Por qué así:

- `API_ORIGIN` va de tipo **Config**, no *Secret*: la reescritura de `/api/*` la lee en cada petición, y Vercel no le entrega el valor de un Secret. Con un Secret, `/api/*` entra en un bucle de redirecciones. Un Secret no se convierte a Config: bórralo y créalo de nuevo. No es un secreto, es la URL de la api.
- `BETTER_AUTH_URL` es el dominio de la **web**, no el de la api: el navegador llega a `/api/auth` a través de la reescritura de la web, y ahí quedan las cookies.
- Todas las previews (dev y las de PR) usan la api de dev. `BETTER_AUTH_TRUSTED_ORIGINS` deja que las previews de PR de la web, cada una con su URL, inicien sesión contra ella.
- Google va solo en Production y en la rama `dev`: las previews de PR cambian de URL y Google no las aceptaría. Sin `GOOGLE_CLIENT_ID`, la web no muestra el botón y la api no ofrece Google.
- No van en Vercel: `DATABASE_URL_UNPOOLED` (está en GitHub, paso 2), `SEED_*` (solo para el seed desde tu máquina) ni `API_DEV_URL` (solo local).
- Un cambio de variables se aplica en el **siguiente** deployment: después de editarlas, **Deployments → ⋯ → Redeploy** en el deployment que quieras actualizar, con **Use project's Ignore Build Step** desmarcado. El redeploy usa el mismo commit, así que el paso de ignorar no ve cambios y lo cancelaría.

### 8. GitHub: reglas de las ramas

En el repo: **Settings → Rules → Rulesets → New ruleset → New branch ruleset**. Crea dos.

Ruleset **`prod`**:

- [ ] *Enforcement status*: **Active**. *Bypass list*: vacía (la App de releases se agrega en el paso 19).
- [ ] *Target branches* → **Add target → Include by pattern** → `prod`.
- [ ] **Restrict deletions** y **Block force pushes**.
- [ ] **Require a pull request before merging**: *Required approvals* `0` (trabajas solo); en *Allowed merge methods* deja solo **Merge**.
- [ ] **Require status checks to pass** → **Add checks**: `Lint, typecheck, test, build` y `PR to prod comes from dev`. Deja **sin** marcar *Require branches to be up to date before merging*: cada release deja en `prod` un commit de merge que `dev` recibe recién cuando termina el workflow `Release` (parte E), y si ese paso falla, esa opción bloquearía el siguiente release.
- [ ] **Create**.

Ruleset **`dev`**:

- [ ] *Enforcement status* **Active**, *Bypass list* vacía (la App de releases, paso 19), target `dev`.
- [ ] **Restrict deletions**, **Block force pushes**, **Require a pull request before merging** (`0` aprobaciones, merge method **Merge**).
- [ ] **Require status checks to pass** → `Lint, typecheck, test, build`, con *Require branches to be up to date before merging* marcado.
- [ ] **Create**.

GitHub no puede limitar de qué rama viene un PR. Lo hace el job `PR to prod comes from dev` de `ci.yml`: falla si el PR hacia `prod` no sale de la rama `dev` de este repo. Un check solo aparece en *Add checks* después de haber corrido una vez; si `PR to prod comes from dev` todavía no aparece, escríbelo tal cual.

Usa siempre **Merge** (no squash ni rebase) en los PR de `dev` a `prod`: así `prod` contiene los mismos commits que `dev` y el siguiente release solo muestra lo nuevo.

---

## Parte B. Primer despliegue

### 9. Fusionar la fase 6 en `dev`

Las previews del propio PR de esta fase no funcionan del todo: su web apunta a la api de dev, que se despliega por primera vez con este merge.

- [ ] Fusiona el PR de esta fase en `dev`. Eso dispara:
  - **CI** sobre `dev`.
  - **Migrate** (Actions): aplica en Neon `dev` las migraciones pendientes. En su log, `drizzle-kit migrate` termina sin error.
  - **Vercel**: un deployment de cada proyecto para `dev`, en `<WEB_DEV>` y `<API_DEV>`. Es el primero de `dev` en estos proyectos, así que el paso de ignorar no tiene con qué comparar y construye.
- [ ] Proyecto **time-craft-api** → **Settings → Build and Deployment → Deployment Checks → Add Checks** → *GitHub* → elige `Migrate database` → guarda. Desde ahora, un deployment de producción de la api no se publica hasta que ese job pasa en el mismo commit. Si algún día necesitas saltarlo: **Force Promote** en el deployment.

### 10. Seed de una base vacía

Solo si la rama de Neon no tiene el hogar todavía (SQL Editor: `select name from families;` no devuelve filas). El seed crea la familia, los padres, las actividades, la cuenta del niño y su política desde las variables `SEED_*` de tu `.env`, y es idempotente. Corre en tu máquina, contra la cadena **directa** de la rama, después de que `Migrate` la haya migrado:

```sh
env DATABASE_URL_UNPOOLED='<cadena directa de la rama>' \
    BETTER_AUTH_SECRET='<el secreto de ese ambiente>' \
    BETTER_AUTH_URL='<WEB_DEV o WEB_PROD>' \
    bun run db:seed
```

- [ ] Ahora, para `dev` (con `<WEB_DEV>` y el secreto de Preview).
- [ ] Después del primer release (paso 12), para `main` si hace falta (con `<WEB_PROD>` y el secreto de Production).

Las variables de la línea de comandos ganan a las del `.env`. El seed imprime el **código de recuperación** de la familia una sola vez: guárdalo en un lugar seguro. Cada base tiene el suyo.

### 11. Comprobar `dev`

- [ ] `curl <API_DEV>/health` responde `{"ok":true,…}`.
- [ ] Abre `<WEB_DEV>`. Vercel te pide tu sesión (es una preview protegida); después ves el login de Time Craft.
- [ ] Inicia sesión como padre con **Continuar con Google**. En las herramientas del navegador, las llamadas van a `<WEB_DEV>/api/…` (mismo origen) y la cookie `__Secure-better-auth.session_token` es de `<WEB_DEV>`.
- [ ] Alarmas: activa las notificaciones y crea una sesión de 6 minutos. Con el aviso por defecto (5 minutos antes), al minuto llega el aviso y a los 6 el fin. En la consola de QStash (**Logs**) aparecen los mensajes entregados a `<API_DEV>/internal/jobs` con estado 200.
- [ ] En el SQL Editor de Neon (rama `dev`): `select ip_address, user_agent from auth_session order by created_at desc limit 3;`. La IP debe ser la tuya. Si es una IP de Vercel, la reescritura no pasa la IP del cliente y los límites por IP (5 inicios de sesión por minuto) los comparten todos: avísalo para ajustar `advanced.ipAddress` en `apps/api/src/auth/index.ts`.

### 12. Primer release: `dev` → `prod`

- [ ] Abre un PR de `dev` a `prod`. Corren `Lint, typecheck, test, build` y `PR to prod comes from dev`.
- [ ] Fusiónalo con **Merge**. Eso dispara **Migrate** en Neon `main` y los deployments de producción. La api queda en *Waiting for checks* hasta que `Migrate database` pasa, y luego se publica en `<API_PROD>`. Desde la parte E, producción solo construye los commits de release: el merge queda *Canceled* y el deploy llega con el workflow `Release`, que necesita la App de los pasos 18 y 19.
- [ ] Si `main` no tiene el hogar, haz el seed (paso 10) con los valores de producción.

### 13. Comprobar producción

- [ ] `curl <API_PROD>/health` responde `{"ok":true,…}`.
- [ ] `<WEB_PROD>` abre sin pedir sesión de Vercel. Los dos padres entran con Google y el niño con su usuario y PIN.
- [ ] Cada uno activa las notificaciones en su teléfono (en Android, con Chrome).
- [ ] Una sesión de 6 minutos dispara el aviso al minuto y el fin a los 6 (QStash → `<API_PROD>/internal/jobs`).

---

## Parte C. Día a día

1. Rama desde `dev` (`feat/f7-…`), commits, PR hacia `dev`. CI corre y Vercel comenta las previews de lo que cambió. Las previews de PR de la web usan la api de dev: entra con email y contraseña.
2. Merge a `dev`: migraciones en Neon `dev` y deploy en `<WEB_DEV>` / `<API_DEV>`. Ahí se prueba todo junto, incluidos Google y las alarmas.
3. Release: PR de `dev` a `prod`, merge con **Merge**. Migraciones en `main`. El workflow `Release` publica la versión nueva de cada app que cambió, y Vercel despliega a producción esos commits de release. Al final fusiona `prod` en `dev` (parte E): haz `git pull` en tu `dev` antes de crear la siguiente rama.

Una migración nueva se genera con `bun run db:generate` y nunca se edita a mano. Se aplica sola al llegar a `dev` y a `prod`.

Para forzar el build de una app que el paso de ignorar saltó: **Deployments → ⋯ → Redeploy** y desmarca **Use project's Ignore Build Step**. En producción, eso es el despliegue de emergencia (parte E).

---

## Parte D. Comprobación: e2e y smoke test

El e2e (`apps/e2e`) recorre los 8 pasos del flujo en la web de dev. Escribe en Neon `dev`: crea una familia de prueba por corrida y la borra al terminar. El smoke test solo lee producción. Lo que no se puede automatizar está en [verificacion-manual.md](verificacion-manual.md).

### 14. Marcar Neon `dev` como base de pruebas (una vez)

Una cadena de conexión de Neon no dice a qué rama apunta, así que el e2e se niega a escribir en una base que no esté marcada. La marca es un comentario de la base, que vive solo en la rama donde se escribe: `main` nunca la tiene.

- [ ] Neon → **SQL Editor** → elige la rama **`dev`** (¡no `main`!) y la base `neondb` → corre:
  ```sql
  COMMENT ON DATABASE neondb IS 'timecraft:dev';
  ```
- [ ] Si alguna vez reinicias `dev` desde `main` (*Reset from parent*), la marca se pierde y el e2e se niega a correr hasta que la vuelvas a poner.

Para correr el e2e en tu máquina contra una base local, márcala igual.

### 15. Vercel: bypass de la protección para el e2e

La web de dev y sus previews tienen Vercel Authentication. El e2e entra con un secreto de automatización.

- [ ] Proyecto **time-craft-web** → **Settings → Deployment Protection → Protection Bypass for Automation → Add Secret** (nombre, p. ej., `e2e`) → copia el secreto.
- [ ] Sirve en todos los deployments del proyecto, también en los que ya existen, hasta que lo revoques. No hace falta redeploy.

### 16. GitHub: lo que lee el workflow `E2E`

En el repo, **Settings → Environments → `dev`** (el mismo del paso 2):

- [ ] **Environment secrets → Add environment secret**: `VERCEL_AUTOMATION_BYPASS_SECRET` = el secreto del paso 15. `DATABASE_URL_UNPOOLED` ya está (paso 2).
- [ ] **Environment variables → Add environment variable**: `E2E_BASE_URL` = `<WEB_DEV>`.

En **Settings → Secrets and variables → Actions → Variables** (del repositorio, para el smoke test):

- [ ] `E2E_PROD_WEB_URL` = `<WEB_PROD>` y `E2E_PROD_API_URL` = `<API_PROD>`.

### 17. Correrlo

- [ ] **Actions → E2E → Run workflow**, rama **`dev`** (el Environment solo deja leer sus secretos a esa rama):
  - `e2e`: el flujo completo contra `<WEB_DEV>` (unos minutos).
  - `e2e-slow`: además, una sesión de 2 minutos que espera el aviso, el fin y el cierre real por QStash (unos 4 minutos más).
  - `smoke`: producción, solo lectura.
  - `base_url` (opcional): la URL de una preview de PR de la web, para probar un cambio antes de fusionarlo. Las previews hablan con la api de dev, que es la de `dev` ya fusionada.
- [ ] GitHub solo ofrece **Run workflow** cuando `e2e.yml` está en la rama por defecto (`prod`), como pasó con `Migrate`: hasta el siguiente release, córrelo desde tu máquina (abajo).
- [ ] Si falla, el job sube el reporte de Playwright como artefacto `e2e-report` (con trazas y capturas). Una corrida cortada a la mitad deja su familia: el último paso del job borra las que queden (`bun run e2e:family:delete --all`).

En tu máquina: `bun run e2e` contra `bun run dev` (con el servidor de desarrollo de QStash) o, con `E2E_BASE_URL`, `DATABASE_URL_UNPOOLED` y `VERCEL_AUTOMATION_BYPASS_SECRET` en la shell, contra dev. El smoke: `E2E_BASE_URL=<WEB_PROD> E2E_API_URL=<API_PROD> bun run e2e:smoke`. Detalles en [`apps/e2e/CLAUDE.md`](../apps/e2e/CLAUDE.md).

## Parte E. Versiones de la web y la api

Cada app tiene su versión semántica en su `package.json`, independiente de los hitos del producto, y nadie la edita a mano. En cada push a `prod`, el workflow `Release` ([`release.yml`](../.github/workflows/release.yml)) corre semantic-release para la web y luego para la api ([`scripts/release/`](../scripts/release/)):

- Cuenta los commits desde el último tag de la app que tocaron su carpeta, la de un paquete del workspace del que depende o un archivo raíz que leen todos los builds (`package.json`, `bun.lock`, `bunfig.toml`, `turbo.json`). La api cuenta `core` y `db`; la web no cuenta la api, porque de ella solo usa los tipos.
- `feat` sube el minor y `feat!:` (o `BREAKING CHANGE:` en el cuerpo) el major. `fix`, `perf`, `refactor`, `build`, `style`, `chore` y `ci` suben el patch: todo lo que cambia lo que se despliega publica una versión, porque producción solo despliega releases. `docs` y `test` no publican. El primer release de cada app sale como `1.0.0`.
- Escribe la versión en el `package.json` de la app y las notas en su `CHANGELOG.md`, hace el commit `chore(release): web-v1.2.0` en `prod`, crea el tag `web-v1.2.0` y publica el GitHub Release. Lo mismo para la api (`api-v…`).
- Al final fusiona `prod` en `dev`: un fast-forward si `dev` no se movió, un commit de merge si se movió. Así las dos ramas tienen siempre las mismas versiones.
- La web muestra su versión abajo a la derecha en las pantallas de entrada (login de padres, login del niño y recuperación). La api la devuelve en `/health`.

**Producción despliega solo releases.** En producción, el paso de ignorar ([`scripts/vercel-ignore.mjs`](../scripts/vercel-ignore.mjs)) construye una app solo con su commit de release (`chore(release): web-v…` para la web, `api-v…` para la api). El merge de `dev` queda *Canceled* con `Skip: production deploys only … release commits`, y cada release se construye una sola vez, ya con su versión. `Migrate` corre en el merge, así que la migración se aplica antes de que llegue la api nueva, y vuelve a correr en el commit del release (sin nada pendiente, termina enseguida); la api de producción espera ese segundo `Migrate` por la Deployment Check. Si un release no cambia una app, esa app no se despliega. `dev` y las previews siguen como antes: se construye lo que cambió.

**Emergencias:**

- *Desplegar ya* (falló `Release`, o hay que publicar un commit sin release): proyecto → **Deployments** → filtra por *Production* → el deployment de ese commit (aunque esté *Canceled*) → **⋯ → Redeploy** → desmarca **Use project's Ignore Build Step** → **Redeploy**. Construye ese commit con las variables actuales. La versión que muestra es la de su `package.json`. Si el problema fue `Release`, lo normal es corregirlo y hacer **Re-run jobs**.
- *Volver atrás*: en el proyecto, **Instant Rollback** en el tile de producción. En Hobby solo vuelve al deployment anterior. Mientras dure el rollback, Vercel no publica deployments nuevos de producción: cuando el arreglo esté desplegado, **Undo Rollback** y elige ese deployment.

Los rulesets solo aceptan PRs, así que esos pushes los hace una GitHub App tuya, la única en sus listas de bypass. Un token personal también podría, pero depende de tu cuenta y llega a todos tus repos. La App solo puede escribir el contenido de este repo, y cada token que el workflow le pide dura una hora.

Configúrala antes del release que lleve `release.yml` a `prod`. Si no, ese job falla al pedir el token; después de configurarla, basta con **Re-run jobs**.

### 18. GitHub: la App de releases

- [ ] Tu perfil → **Settings → Developer settings → GitHub Apps → New GitHub App**:
  - *GitHub App name*: `time-craft-release`. El nombre es único en todo GitHub: si está ocupado, agrégale un sufijo.
  - *Homepage URL*: la URL del repo.
  - *Webhook*: desmarca **Active**.
  - *Repository permissions* → **Contents**: **Read and write**. Nada más (*Metadata* queda en solo lectura, es obligatorio).
  - *Where can this GitHub App be installed?*: **Only on this account** → **Create GitHub App**.
- [ ] En la página de la App, anota el **Client ID**. En *Private keys* → **Generate a private key**: se descarga un `.pem`.
- [ ] **Install App** → tu cuenta → **Only select repositories** → `time-craft` → **Install**.
- [ ] En el repo, **Settings → Environments → `prod`** (el del paso 2: solo la rama `prod` lee sus secretos, así que un workflow de otra rama no puede pedir un token de la App):
  - **Environment variables → Add environment variable**: `RELEASE_APP_CLIENT_ID` = el Client ID.
  - **Environment secrets → Add environment secret**: `RELEASE_APP_PRIVATE_KEY` = el contenido completo del `.pem`, de `-----BEGIN` a `KEY-----`. Después borra el archivo de tu máquina.

### 19. GitHub: la App en la lista de bypass

- [ ] **Settings → Rules → Rulesets → `prod`** → *Bypass list* → **Add bypass** → elige la App → **Save changes**. Deja la App en *Always allow*.
- [ ] Lo mismo en el ruleset **`dev`**.

Se comprueba en el siguiente release: **Actions → Release** termina en verde, aparecen los tags y los Releases del repo, y el `version` de cada `package.json` es el mismo en `dev` y en `prod`.

## QStash y la protección de Vercel

Vercel Authentication protege las previews: quien no tiene sesión en tu cuenta de Vercel recibe un 401. QStash no tiene esa sesión, y la reescritura de la web hacia la api tampoco, porque es de servidor a servidor.

**Cómo está configurado:** la api no tiene Vercel Authentication (paso 3) y la web sí. Así:

- QStash llega a la api en dev y en producción sin nada más. Las alarmas se prueban en **dev**.
- Una preview de PR de la api (si alguien la usa directamente) programa sus alarmas contra `PUBLIC_API_URL`, que en Preview es `<API_DEV>`: las procesa la api de dev, sobre la misma base Neon `dev`.
- La web de dev y de las previews sigue protegida: solo tú la abres.

**Si quisieras proteger también la api**, Vercel ofrece *Protection Bypass for Automation*: en el proyecto de la api, **Settings → Deployment Protection → Protection Bypass for Automation → Add Secret**. Vercel expone ese secreto en los deployments de la api como `VERCEL_AUTOMATION_BYPASS_SECRET`, y quien lo envíe en la cabecera `x-vercel-protection-bypass` (o como `?x-vercel-protection-bypass=…` en la URL) pasa la protección. Harían falta dos cambios de código que hoy **no están hechos**:

1. En `apps/api/src/adapters/qstash.ts`, publicar cada mensaje con la cabecera `x-vercel-protection-bypass: <secreto>` (QStash reenvía las cabeceras que recibe al publicar).
2. En `apps/web/vercel.json`, añadir esa cabecera a la reescritura de `/api/*` (un `transforms` con `env`, igual que el destino), con el secreto en una variable del proyecto web.

Mientras tanto, la api tiene que quedar con Vercel Authentication desactivado, o fallan el login (la reescritura recibe un 401) y las alarmas.

## Problemas frecuentes

| Síntoma | Causa y arreglo |
|---|---|
| La web carga, pero el login y todo `/api/*` fallan sin llegar a la api (a menudo con demasiadas redirecciones) | `API_ORIGIN` falta en el proyecto web para ese ambiente, es de tipo *Secret* en vez de **Config**, o no es un origen (`https://…`, sin `/` final) (paso 7). La reescritura toma el valor que tenía al crear el deployment: corrígela y haz Redeploy sin *Use project's Ignore Build Step*. |
| Un deployment queda *Canceled* con `Skip: …` en el log | Es el paso de ignorar: el commit no afecta a esa app. En producción, `Skip: production deploys only … release commits` es lo normal para el merge de `dev`: el deploy llega con el commit del release. Para construir igual, Redeploy sin *Use project's Ignore Build Step*. |
| Producción no se actualiza aunque `Release` publicó la versión | Hay un Instant Rollback activo: **Undo Rollback** en el tile de producción (parte E). |
| La api responde 500 y el log de la función dice `Invalid environment variables` | El mensaje nombra la variable que falta o es inválida en ese ambiente (paso 7). |
| Iniciar sesión da 403 `Invalid origin` | En dev o producción: `BETTER_AUTH_URL` no es exactamente el dominio de la web (`https://`, sin `/` final). En una preview de PR: revisa `<SCOPE>` en `BETTER_AUTH_TRUSTED_ORIGINS`. |
| Google responde `redirect_uri_mismatch` | Falta `<dominio de la web>/api/auth/callback/google` en el cliente OAuth (paso 6). |
| En QStash los mensajes fallan con 401 | La api tiene Vercel Authentication activado (paso 3), o las claves de firma son de otra región. Con 404, `PUBLIC_API_URL` no apunta a la api. |
| La api de producción queda en *Waiting for checks* | El job `Migrate database` de ese commit falló o no corrió: revisa Actions → Migrate. |
| `Migrate` falla con `has no DATABASE_URL_UNPOOLED secret` | Falta el secreto en el Environment de esa rama (paso 2). Después, Actions → Migrate → **Run workflow** en esa rama (el botón aparece cuando `migrate.yml` ya está en `prod`). |
| `Release` falla en *Get a token for the release app* | Falta `RELEASE_APP_CLIENT_ID` o `RELEASE_APP_PRIVATE_KEY` en el Environment `prod`, o la App no está instalada en el repo (paso 18). Corrígelo y **Re-run jobs**: el job parte de la punta de `prod`, así que retoma lo que haya quedado sin publicar. |
| `Release` falla al hacer push con `push declined due to repository rule violations` | La App no está en la lista de bypass del ruleset de esa rama (paso 19). Agrégala y **Re-run jobs**. |
| `Release` falla en *Bring prod back into dev* | `dev` cambió las mismas líneas que el release (un `package.json` o un `CHANGELOG.md`). Abre un PR de `prod` a `dev`, resuelve el conflicto ahí y fusiónalo. |
| Un release no subió la versión de una app (y no la desplegó) | Desde su último tag, solo commits `docs` o `test` (o sin tipo) tocaron la app y lo que cuenta. El log del paso lo dice: `0 of N commits touch …` o `no release`. Si sí había que desplegar, el commit tenía el tipo equivocado: Redeploy de emergencia (parte E). |
| `bun install --frozen-lockfile` falla en Vercel | Revisa en el log la versión de Bun de Vercel (`bun install v…`): si es más vieja que la de `packageManager`, el lockfile puede no coincidir. |
