# apps/web

Frontend en Astro con salida estática, islas React (una grande por rol: `/padres` y `/nino`) y Tailwind CSS 4. Habla con la api por HTTP en `/api/*`; en Vercel esa ruta se reescribe hacia la api (mismo dominio, cookies first-party, sin CORS).

- Textos de UI en español. El diseño se hace con la skill Impeccable (Fase 5).
- Dev: `bun run dev` en http://localhost:4321.

No debe:

- Contener reglas de negocio ni calcular saldos: los recibe de la api. Solo calcula el restante en vivo del cronómetro a partir de lo que devuelve el servidor.
- Importar `packages/db` ni manejar secretos: todo lo que llega al navegador es público.
- Usar SSR ni un adaptador de Astro: la salida es estática.
- Usar APIs exclusivas de Bun.
