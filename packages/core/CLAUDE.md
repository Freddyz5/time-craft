# packages/core

Dominio, casos de uso y puertos (arquitectura hexagonal). Aquí viven las reglas de negocio: disponible, bonos, overrides, estrategia de imputación de sesiones, etc. Se exporta como TypeScript fuente, sin build.

- Tests con `bun test`, fakes en memoria y reloj fijo (puerto `Clock`).

No debe:

- Depender de Drizzle, Hono, Better Auth ni `packages/db`. Los adaptadores viven en `apps/api` e implementan los puertos de `core`.
- Leer la hora del sistema, variables de entorno ni hacer I/O directo: todo entra por puertos.
- Usar APIs exclusivas de Bun fuera de los tests: se ejecuta en Node en Vercel.
