# apps/api

API REST con Hono, desplegada en Vercel. Contiene las rutas, la autenticación (Better Auth montado en `/api/auth/*`), los adaptadores (Drizzle, QStash, Web Push) que implementan los puertos de `core`, el mapeo de errores de dominio a HTTP y el composition root.

- `src/index.ts` hace `export default app` (formato zero-config de Vercel).
- `scripts/build.ts` empaqueta `src/index.ts` en `dist/index.js`: incluye los paquetes del workspace y deja externas las dependencias npm de este `package.json`. `vercel.json` le indica a Vercel que use `dist`.
- Dev: `bun run dev` sirve el export default con `bun --watch` en http://localhost:3000.

No debe:

- Contener reglas de negocio: van en `core`. La api traduce HTTP ↔ casos de uso.
- Usar APIs exclusivas de Bun en `src/`: en Vercel corre en Node.
- Sacar `hono` de las dependencias externas del bundle: Vercel detecta el entrypoint buscando el import de `hono`.
- Usar en runtime una dependencia npm sin declararla aquí: si no está en este `package.json`, termina dentro del bundle en vez de quedar externa.
