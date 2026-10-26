# Contexto: Time Craft · Versión 1 (MVP)

## Qué es
Sistema familiar para controlar cuánto tiempo pasa mi hijo de 9 años con videojuegos (Minecraft en PC Windows) y TV (YouTube en una TV LG). Funciona con una cuota de tiempo diaria y semanal, tipo "créditos". Lo usamos los dos padres y el niño, cada uno desde su teléfono o navegador, desde cualquier lugar.

**Versión 1:** cronómetro compartido, cuotas, alarmas push y dashboard. Se registra manualmente: no detecta el juego ni la TV. Eso queda para versiones posteriores.

**Nomenclatura:** el producto avanza por **versiones** (v1, v2…). Cada versión se construye en **fases**, y cada fase es un PR con varios commits.

**Restricción:** todo debe funcionar en planes gratuitos (Vercel Hobby, Neon Free, Upstash QStash Free).

## Stack (decidido)
| Capa | Elección | Notas |
|---|---|---|
| Monorepo | Turborepo + **Bun** (gestor de paquetes y `bun test`) | En Vercel el código corre en Node: no usar APIs exclusivas de Bun (`Bun.password`, `Bun.sql`) en código desplegado |
| Base de datos | PostgreSQL en **Neon** + **Drizzle** | Driver `neon-serverless` (Pool por WebSocket): hace falta para transacciones interactivas. Cadena pooled para runtime, directa para migraciones |
| Backend | **Hono** REST en Vercel (zero-config) | Exporta `AppType` para el cliente tipado `hc<AppType>` |
| Autenticación | **Better Auth** (email + contraseña, plugin `username`) | Montado en `/api/auth/*` dentro de Hono |
| Alarmas programadas | **Upstash QStash** (mensajes con `notBefore`) | Sin cron: Vercel Hobby solo permite cron diario |
| Notificaciones | Web Push (`web-push`, claves VAPID) | En Android funciona en Chrome sin instalar la PWA |
| Frontend | **Astro (salida estática) + islas React** + Tailwind | Una isla grande por rol (`/padres`, `/nino`). Diseño con la skill Impeccable |
| Deploy | Vercel Hobby: un proyecto para web y otro para api | Web reescribe `/api/*` hacia la api: mismo dominio, cookies first-party, sin CORS |

## Estructura del monorepo
```
apps/
  web/        Astro + React (islas)
  api/        Hono: rutas, auth (Better Auth), adaptadores (Drizzle, QStash, Web Push), composition root
packages/
  db/         schema Drizzle (incluye tablas de Better Auth), migraciones, cliente, seed
  core/       dominio + casos de uso + puertos. Cero dependencias de Drizzle, Hono o Better Auth
  tsconfig/   configuraciones TS compartidas
```
- Paquetes internos exportados como TS fuente, sin build propio.
- Dirección de dependencias: `api → core` y `api → db`. Los adaptadores (en `api`) implementan los puertos de `core`.
- Lint/format con Biome.

## Fases de la versión 1 (un PR por fase, ramas desde `dev`)
1. **Monorepo:** esqueleto vacío, Bun, Turborepo (`dev`, `build`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`), Biome, GitHub Action de lint + typecheck + test. Deploy "hello world" de la api importando algo de `packages/core` para validar el empaquetado en Vercel.
2. **db:** schema Drizzle de las 18 tablas (las de Better Auth generadas con su CLI), índices parciales, migraciones versionadas (`generate` + `migrate`, nunca `push` en prod), seed.
3. **core:** reglas de negocio con arquitectura hexagonal. Tests con fakes en memoria y reloj fijo.
4. **api:** Hono, Better Auth, adaptadores Drizzle/QStash/Web Push, endpoints REST, mapeo de errores de dominio a HTTP.
5. **web:** 5a experiencia de padres, 5b experiencia del niño. Impeccable: configuración inicial (PRODUCT.md, DESIGN.md), `shape` por pantalla, `polish` al cierre.
6. **CI/CD:** Vercel con `prod` como rama de producción y previews en PR a `dev`; `turbo-ignore`; migraciones en GitHub Actions (merge a `dev` → rama `dev` de Neon; merge a `prod` → `main`), siempre compatibles hacia atrás.
7. **Comprobación:** e2e con Playwright de los 8 flujos sobre la preview + smoke test en producción.

## Reglas de negocio
- **Disponible** = mín(restante del día, restante de la semana). Si se agota la semana, no puede empezar aunque le quede tiempo en el día.
- **La sesión propuesta nunca supera el disponible** (más el override si lo hay). Lo valida `core`.
- **Bonos:** los minutos aprobados por tareas se suman a la bolsa semanal, hasta un tope semanal. No suben el límite diario.
- **El exceso cuenta:** si la sesión se pasa del tiempo, se descuenta el tiempo real consumido.
- **Cierre automático:** si nadie detiene la sesión, el servidor la cierra en `fin + families.auto_close_after_minutes` (30 por defecto) con `end_reason = auto_closed`, y avisa a los padres. Evita que una sesión olvidada consuma toda la semana.
- **Override:** con la cuota agotada, solo un padre puede dar minutos extra, siempre con un motivo. Se usa en una sesión nueva, no extiende la que está corriendo.
- **Cambio de límites a mitad de semana:** la política vigente al momento de calcular aplica a toda la semana (decidido).
- **Sesión que cruza la medianoche o el cambio de semana:** se imputa entera al día (y semana) de inicio (decidido, opción A). La regla vive en una sola función de `core` (estrategia de imputación) para poder pasar a repartirla por tramos (opción B) sin cambiar el schema. Como el saldo se calcula, el cambio también recalcula el historial.
- **Empezar ahora o más tarde:** al aprobar (o al crear una sesión directa) el padre elige empezar ya o programar la hora de inicio, como máximo hasta el final del día. Mientras está programada no consume. Al arrancar, la duración se recorta al disponible de ese momento; si es 0, se cancela y se avisa. Un padre puede adelantarla o cancelarla.
- **Sesión pausada y olvidada:** una pausa no consume, pero bloquea nuevas sesiones (solo una programada o activa por niño). En la versión 1 no hay límite de pausa; el dashboard de padres la muestra destacada para cerrarla a mano (decidido).
- **Tiempo extra solo con cuota agotada:** si al niño le queda disponible, debe pedir `start`, no `extra_time`.
- **El servidor es la fuente de verdad del cronómetro.** Guarda inicio, duración y pausas; cada cliente calcula lo restante, así todos ven lo mismo.
- **No se guarda el saldo.** Se calcula a partir de las sesiones, para no tener dos fuentes de verdad.
- **Concurrencia:** si los dos padres aprueban la misma solicitud a la vez, gana el primero. La aprobación hace `UPDATE … WHERE status = 'pending'` dentro de la transacción; si no afecta filas, ya estaba resuelta.

## Permisos
- **Padres (`parents`):** inician, pausan y detienen sesiones; aprueban o rechazan solicitudes y reportes; dan overrides; configuran límites y tareas de bono; crean la cuenta del niño y pueden cerrar sus sesiones de login.
- **Niño (`children`):** entra con usuario + PIN desde cualquier navegador. **Solo lee o pide**, nunca inicia, pausa ni detiene nada.
  - **Ve:** su saldo de forma visual (batería del día y de la semana, bonos y cuándo se recarga) y el cronómetro en vivo de su sesión.
  - **Pide:** empezar (actividad + minutos) o tiempo extra (motivo obligatorio). Puede **cancelar su propia solicitud pendiente**.
  - **Reporta:** tareas hechas para ganar bonos, que un padre valida.
- Toda FK hacia `parents` significa "lo hizo un padre". El niño nunca puede figurar como aprobador.

## Autenticación (Better Auth)
- **Identidad en tablas de Better Auth** (`auth_user`, `auth_session`, `auth_account`, `auth_verification`, `auth_rate_limit`). Se mapean con `modelName`/`fields` para usar prefijo `auth_` y snake_case (evita la palabra reservada `user`).
- **Padre o niño lo decide la tabla de dominio** que referencia al `auth_user` (`parents.auth_user_id` o `children.auth_user_id`). Un middleware de Hono resuelve la sesión y le pasa a `core` un `Actor` (padre o niño); `core` no conoce Better Auth.
- **Padres:** **"Continuar con Google"** como forma principal (proveedor social de Better Auth, cliente OAuth gratis en Google Cloud), con email + contraseña como segunda vía. Los dos padres se crean con el seed. **Sin registro público:** solo entran los correos que ya existen como padres.
  - Google OAuth: la app puede quedar en modo "testing" con los dos correos como usuarios de prueba (solo se piden `email` y `profile`).
  - Las previews de Vercel cambian de URL y Google exige registrar las URLs de retorno: el login con Google se activa solo en `dev` (dominio fijo) y producción. En previews se entra con contraseña.
- **Restablecer contraseña o PIN:** un padre puede restablecer la contraseña del otro padre y el PIN del niño desde la app. Endpoint propio que verifica que sea de la misma familia y luego fija la contraseña con el hasher y el adaptador internos de Better Auth (`auth.$context`). No se usa el plugin `admin` (decidido en la fase 4): su `setUserPassword` exige una sesión de administrador y el flujo del código de recuperación no tiene sesión.
- **Código de recuperación de la familia** (último recurso si ambos pierden acceso): código largo aleatorio de un solo uso, generado al configurar el hogar, guardado hasheado en `families.recovery_code_hash`. Se imprime o se guarda en lugar seguro. Con él se restablece la contraseña de un padre; al usarlo se genera uno nuevo. Endpoint con rate limit estricto.
- **Sin correo en la versión 1:** no hay "olvidé mi contraseña" por email. Si se necesita más adelante, se conecta Resend (plan gratis) sin cambiar el schema.
- **Script de desarrollo:** queda solo como herramienta del desarrollador, no como vía de recuperación.
- **Niño:** plugin `username`, login con usuario + PIN. El username es **único global**. Como Better Auth exige email, se usa uno sintético (`usuario@hijos.timecraft.local`). Su cuenta la crea un padre desde la api, también con el contexto interno de Better Auth (usuario + cuenta `credential`): con `disableSignUp`, `auth.api.signUpEmail` falla incluso en el servidor.
- **PIN:** mínimo 6 dígitos (se baja `minPasswordLength` a 6 y se exige más a los padres con validación propia).
- **Fuerza bruta:** rate limit de Better Auth con `storage: "database"` (en serverless la memoria no sirve) + bloqueo por cuenta con hooks antes/después del sign-in (`children.failed_pin_attempts`, `locked_until`): 5 PIN errados seguidos bloquean al niño 15 minutos; un padre que restablece el PIN lo desbloquea.
- **Sin vinculación de dispositivos.** `auth_session` guarda user agent e IP: ese es el registro de dónde está logueado cada uno, y un padre puede cerrar las sesiones del niño.

## Alarmas y tareas programadas (QStash)
Cuatro cosas necesitan un timer, y las cuatro van por QStash:
- `start`: arranca una sesión programada para más tarde y avisa al niño "¡ya puedes empezar!".
- `warning`: push de aviso previo (`warning_minutes`, 5 por defecto) a padres y niño.
- `end`: push de fin a padres y niño.
- `auto_close`: el servidor cierra la sesión olvidada y avisa a los padres.

Flujo:
1. Al arrancar la sesión (ahora o cuando dispara su `start`) se publican aviso, fin y cierre automático con `notBefore`, y se guarda `provider_message_id` en `session_alerts`. Al adelantar o cancelar una sesión programada se cancela su `start`.
2. Al pausar se cancelan en QStash y se marca `cancelled_at`.
3. Al reanudar se crean filas nuevas con las horas recalculadas.
4. El endpoint que recibe QStash verifica la firma y es idempotente: no hace nada si la alerta ya se envió o canceló, o si la sesión no está en el estado esperado (QStash reintenta).

Por qué no un cron/tick por minuto: Vercel Hobby solo permite cron diario, y un tick que consulta la base cada minuto mantiene Neon despierto todo el mes (~180 CU-hours frente a las 100 gratis). QStash es por eventos: solo despierta la api y la base cuando hay algo que hacer. Free: 1.000 mensajes/día, retraso máximo 7 días.

**Lo que no necesita timer:**
- Expiración de solicitudes: perezosa. Una `pending` con `expires_at` vencido se marca `expired` al leerla o antes de crear otra (si no, el índice de "una pendiente por niño" bloquea la nueva).
- Consumo: se calcula con timestamps.

**Push inmediatos (sin programar):** a los padres cuando el niño crea una solicitud o reporta una tarea; al niño cuando un padre la resuelve.

**Complemento en el cliente:** con la app abierta, el teléfono suena o vibra al segundo exacto. No reemplaza al push, porque Android congela los timers de pestañas en segundo plano.

**Push que fallan:** si el servicio de push responde 404 o 410, la suscripción ya no existe y se borra de `push_subscriptions`.

**Reloj del cliente:** la api devuelve la hora del servidor en cada respuesta del cronómetro y el cliente calcula su desfase. Así un teléfono con la hora mal configurada no muestra un restante distinto al de los demás.

**Tiempo real:** cada cliente calcula el restante localmente y hace polling cada 5–10 s (TanStack Query) para enterarse de pausas y aprobaciones; el push sirve de empujón. Sin WebSockets en el MVP.

## Flujo en 8 pasos
1. **Configurar el hogar** (padres, una vez): seed con familia y padres; los padres crean la cuenta del niño (usuario + PIN), las actividades (Juego, TV) y activan notificaciones en sus teléfonos.
2. **Definir reglas** (padres): límites diario y semanal, tope de bonos, aviso previo y catálogo de tareas de bono.
3. **Pedir** (niño): solicitud para empezar o para tiempo extra. Solo una pendiente a la vez; expira a los 15 min sin respuesta; puede cancelarla. Push inmediato a los padres.
4. **Aprobar o rechazar** (padres): se pueden aprobar menos minutos de los pedidos. Al aprobar se elige **empezar ahora** o **empezar más tarde** (hora elegida, como máximo hasta el final del día). La sesión (y el override si era tiempo extra) se crea en una sola transacción. Push al niño.
5. **Correr el cronómetro** (servidor + padres): una sesión programada arranca sola a su hora (o antes, si un padre la adelanta) y puede cancelarse. Luego: inicio y duración, pausas, y cierre con el tiempo real consumido (o cierre automático).
6. **Avisar** (servidor vía QStash): aviso previo y fin, a padres y niño. Al pausar se cancelan y al reanudar se reprograman.
7. **Ganar bonos** (el niño reporta, push a los padres, el padre valida con los minutos ganados). Un solo reporte pendiente por niño y tarea.
8. **Consultar** (todos, solo lectura): saldo, cronómetro en vivo, historial y desglose por actividad, overrides y solicitudes rechazadas.

## Base de datos (PostgreSQL, 18 tablas)
Archivo de referencia: `timecraft_v1.sql` (validado contra PostgreSQL 16, incluidos los índices parciales y los CHECK).

**Identidad (Better Auth, ids TEXT):**
- **auth_user**: name, email (unique), email_verified, image, username (unique, plugin), display_username
- **auth_session**: user_id, token (unique), expires_at, ip_address, user_agent
- **auth_account**: user_id, account_id, provider_id (`credential` o `google`), password (hash), tokens OAuth
- **auth_verification**: identifier, value, expires_at
- **auth_rate_limit**: key (unique), count, last_request. No se limpia sola.

**Dominio (PK uuid):**
- **families**: name, timezone (America/Guayaquil), week_start_day (0–6), request_expiry_minutes (15), auto_close_after_minutes (30), recovery_code_hash, recovery_code_created_at
- **parents**: family_id, auth_user_id (unique), name
- **children**: family_id, auth_user_id (unique), name, avatar, failed_pin_attempts, locked_until
- **activities**: family_id, code, name, is_active (unique family_id + code)
- **quota_policies**: child_id, activity_id (null = cuota global), daily_limit_minutes, weekly_limit_minutes, weekly_bonus_cap_minutes (60), carry_over_excess, warning_minutes (5), valid_from, valid_to (null = vigente), created_by_parent_id. Cambiar un límite cierra la política vigente y crea otra, así queda historial.
- **bonus_tasks**: family_id, name, description, reward_minutes, max_per_week, is_active, created_by_parent_id
- **child_requests**: child_id, request_type (start | extra_time), activity_id, requested_minutes, reason (obligatorio en extra_time), status (pending | approved | rejected | expired | cancelled), approved_minutes, response_note, expires_at, resolved_by_parent_id, resolved_at
- **quota_overrides**: child_id, request_id (null, unique → child_requests), granted_by_parent_id, extra_minutes, reason
- **sessions**: child_id, activity_id, request_id (null, unique), override_id (null), status (scheduled | running | paused | finished | cancelled), scheduled_start_at (solo si se programó), started_at (null mientras está programada o si se canceló), planned_duration_seconds, ended_at, end_reason (completed | stopped_early | auto_closed), consumed_seconds, started_by_parent_id, ended_by_parent_id (quien la detuvo o canceló; null solo si auto_closed). CHECKs: `scheduled` sin started_at; `running`/`paused`/`finished` con started_at; `finished` con ended_at, end_reason y consumed_seconds; `cancelled` con ended_at y quién canceló.
- **session_pauses**: session_id, paused_at, resumed_at (null = en curso), paused_by_parent_id, resumed_by_parent_id, reason
- **session_alerts**: session_id, alert_type (warning | end | auto_close), scheduled_at, provider_message_id (QStash), sent_at, cancelled_at
- **task_reports**: child_id, bonus_task_id, note, status (pending | approved | rejected), awarded_minutes (solo si approved), review_note, reviewed_by_parent_id, reviewed_at
- **push_subscriptions**: auth_user_id, endpoint (unique), p256dh_key, auth_key, device_label

**Para no tener FK circulares:** la sesión y el override apuntan a la solicitud con `request_id`; la solicitud no apunta a ellos.

**Índices parciales para la migración:**
- Una sola sesión programada o activa por niño: `sessions(child_id) WHERE status IN ('scheduled','running','paused')`
- Una sola pausa en curso por sesión: `session_pauses(session_id) WHERE resumed_at IS NULL`
- Una sola política vigente por niño y actividad: `quota_policies(child_id, COALESCE(activity_id, uuid cero)) WHERE valid_to IS NULL`
- Una sola solicitud pendiente por niño: `child_requests(child_id) WHERE status = 'pending'`
- Un solo reporte pendiente por niño y tarea: `task_reports(child_id, bonus_task_id) WHERE status = 'pending'`

**Se valida en la app (no en la BD):** un `auth_user` no puede ser padre y niño a la vez.

## Cálculos (no se guardan)
- Solo consumen sesiones que arrancaron (con `started_at`); las programadas o canceladas no cuentan.
- `consumido = Σ consumed_seconds de sesiones cerradas + transcurrido de la sesión activa` (si hay una corriendo, su tiempo ya cuenta para el saldo que se muestra).
- `transcurrido = ahora − started_at − Σ pausas` (una pausa en curso cuenta hasta `ahora`).
- `restante en vivo = planned_duration_seconds − transcurrido`
- `bonos_semana = mín(Σ task_reports.awarded_minutes aprobados en la semana, weekly_bonus_cap_minutes)`
- `disponible = mín(daily_limit − consumido_hoy, weekly_limit + bonos_semana − consumido_semana)`. A esto se suman los extra_minutes del override, solo para la sesión que lo usa.
- "Hoy" y "esta semana" se calculan con `families.timezone` y `week_start_day`. `core` recibe un puerto `Clock`.

## Reglas por decidir (configuración o default, sin cambiar el esquema)
- ¿Cuota global o separada por actividad? Se define con `quota_policies.activity_id`.
- ¿El exceso se descuenta del día siguiente? Se define con `carry_over_excess`.
- ¿Qué día empieza la semana? Se define con `week_start_day`.
- Valores iniciales de los límites diario y semanal.
- **Margen del cierre automático:** 30 min por defecto (`auto_close_after_minutes`).

## Puntos a vigilar
- **QStash y previews:** las previews protegidas de Vercel rechazan a QStash. Usar el bypass token de Deployment Protection o probar las alarmas solo en `dev`/local.
- **Neon Free:** 100 CU-hours/mes y suspensión tras 5 min sin actividad. Evitar cualquier proceso que consulte la base periódicamente.
- **Limpieza de `auth_rate_limit` y de sesiones de login vencidas:** borrar filas viejas en algún flujo existente (p. ej. al iniciar sesión), sin cron.

## Variables de entorno (por ambiente: local, preview/dev, producción)
| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Neon, cadena pooled (runtime) |
| `DATABASE_URL_UNPOOLED` | Neon, cadena directa (migraciones) |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Better Auth |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Login con Google (solo dev y producción) |
| `QSTASH_TOKEN` | Publicar y cancelar mensajes |
| `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | Verificar la firma de los callbacks |
| `PUBLIC_API_URL` | URL pública a la que QStash llama de vuelta |
| `QSTASH_URL` | URL de QStash (opcional): la de la región si no es EU (`https://qstash-us-east-1.upstash.io`) o, en local, el servidor de desarrollo |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push (la pública también la usa la web) |

Se validan al arrancar con un schema de zod: si falta una, la api falla de inmediato en lugar de fallar a mitad de un flujo.

## Fuera de la versión 1 (descartado por ahora)
- Que el niño planifique su semana.
- Que el niño termine antes por su cuenta.
- Logros y rachas.
- Que el niño sugiera contenido.
- Versiones siguientes:
  - **Versión 2:** agente en la PC que detecta Minecraft, avisa y lo cierra.
  - **Versión 3:** hub local para la TV LG (detección, mensajes en pantalla, apagado).
  - **Versión 4:** app propia en la TV con modo catálogo y canal "estilo TV de los 90s".
  - **Versión 5:** extras.