# packages/core

Dominio, casos de uso y puertos (arquitectura hexagonal). Aquí viven las reglas de negocio: disponible, bonos, overrides, estrategia de imputación de sesiones, etc. Se exporta como TypeScript fuente, sin build.

- `src/domain/`: entidades, value objects y reglas puras, sin I/O. Duraciones en segundos (los minutos solo aparecen donde el schema o una persona los usan). Fechas con date-fns v4 + `@date-fns/tz` (`{ in: tz(zona) }`), siempre en la zona de la familia. Piezas clave: máquina de estados de la sesión (`session.ts`), cálculo del saldo (`balance.ts`) y estrategia de imputación por día (`attribution.ts`, una sola función reemplazable).
- `src/application/`: casos de uso. Cada uno recibe `CoreDeps`, el `Actor` y su input, valida permisos y corre en una transacción (`transaction` en `context.ts`). Los trabajos nuevos se programan dentro de la transacción; las cancelaciones de trabajos y los push van después del commit y sus errores se ignoran. `createCore(deps)` los deja listos para el composition root de la api.
- `src/ports/`: interfaces que implementa la api (repositorios por agregado, `UnitOfWork`, `Clock`, `IdGenerator`, `JobScheduler`, `Notifier`, `IdentityService`, `RecoveryCodeService`). Los métodos `…IfPending` y `update(…, expected)` son compare-and-set (`UPDATE … WHERE status = …`).
- `src/errors.ts`: `DomainError` con un `code` estable y un `kind` (validation, unauthorized, forbidden, not_found, conflict, rule) para mapearlo a HTTP. Lo que es de otra familia responde not_found.
- `src/testing/` (`@time-craft/core/testing`): fakes en memoria (base con rollback y los índices únicos parciales, reloj fijo, scheduler, notifier, identidad) y `seedHousehold`. Los tests usan `createTestKit` + `seedHousehold`.
- Tests con `bun test`, fakes en memoria y reloj fijo (puerto `Clock`).

No debe:

- Depender de Drizzle, Hono, Better Auth, QStash, web-push ni `packages/db`. Los adaptadores viven en `apps/api` e implementan los puertos de `core`. Biome lo bloquea (`noRestrictedImports` en el override de `packages/core`; el override de `src` repite la regla de Bun porque las opciones no se combinan entre overrides).
- Leer la hora del sistema, variables de entorno ni hacer I/O directo: todo entra por puertos.
- Usar APIs exclusivas de Bun fuera de los tests: se ejecuta en Node en Vercel.
- Lanzar errores de forma síncrona desde un caso de uso: son `async`, así que todo error llega como rechazo de la promesa.
