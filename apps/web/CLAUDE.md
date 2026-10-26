# apps/web

Frontend en Astro con salida estática, islas React (una grande por rol: `/padres` y `/nino`) y Tailwind CSS 4. Habla con la api por HTTP en `/api/*`; en Vercel esa ruta se reescribe hacia la api (mismo dominio, cookies first-party, sin CORS). En desarrollo, el proxy de Vite (`astro.config.ts`) hace lo mismo hacia `http://localhost:3000` (o `API_DEV_URL`).

- Textos de UI en español, tuteando. El diseño se hace con la skill Impeccable: `PRODUCT.md` (producto), `DESIGN.md` (sistema visual) y `.impeccable/surfaces/` (brief y contrato de dirección de cada superficie). El mundo visual es un manual de armado de ladrillos: un ladrillo sólido es tiempo disponible y uno punteado es tiempo usado (1 ladrillo = 10 min).
- Dev: `bun run dev` sirve la web en http://localhost:4321 y la api en http://localhost:3000. Con el proxy, `BETTER_AUTH_URL` del `.env` de la raíz tiene que ser `http://localhost:4321`.
- Variables: la web lee el `.env` de la raíz (`vite.envDir`) y, en Vercel, `process.env`. Solo usa las que declara el schema de `astro:env` (`VAPID_PUBLIC_KEY` y `GOOGLE_CLIENT_ID`, ambas públicas, se fijan en el build). Si Google no está configurado, el login no muestra el botón.
- `vercel.ts`: configuración del proyecto de Vercel (build con turbo, salida `dist`) y la reescritura de `/api/*` hacia `API_ORIGIN`: la api de producción en Production y la de dev en Preview (cada preview de PR habla con la api de dev). Es `vercel.ts` y no `vercel.json` porque el destino depende del ambiente; si falta `API_ORIGIN`, el build falla. Su `ignoreCommand` (`scripts/vercel-ignore.mjs`) salta el build cuando el cambio solo llega a la web a través de la api: de ella solo usa los tipos. Si la web empieza a importar código (no tipos) de otro paquete del workspace, decláralo en su `package.json` y no lo marques `--type-only`. El paso a paso está en [docs/deploy.md](../../docs/deploy.md).

## Estructura

- `src/pages/`: una página por ruta. `padres/[...path].astro` y `nino/[...path].astro` generan un HTML por pantalla del enrutado interno (`getStaticPaths`), así un reload o el enlace de un push abren la pantalla correcta. `/` redirige según el rol. `/login` es la entrada de los padres y `/nino/entrar` la del niño (una ruta estática, que gana a `nino/[...path]`).
- `src/parents/`: la isla de padres (`ParentsApp.tsx`: guard, shell y rutas con wouter bajo `/padres`) y sus pantallas: Inicio (`Home.tsx` y `home/`), Nueva sesión, Historial, Reglas, Bonos y Cuentas.
- `src/child/`: la isla del niño (`ChildApp.tsx`: guard, shell y rutas bajo `/nino`) y sus pantallas: Inicio (`Home.tsx`, `home/`: baterías de ladrillos y «Ahora» de solo lectura), Pedir (`Ask.tsx`, `ask/BrickPicker.tsx`), Tareas y Avisos. `requests.tsx` reúne el pedido pendiente y las respuestas; `errors.ts` dice los errores con la voz del niño y cae a `lib/errors.ts`. El niño nunca ve iniciar, pausar ni detener.
- `src/entry/`: las islas públicas: login de padres, login del niño (`ChildLoginPage.tsx` y el teclado `PinPad.tsx`; el navegador recuerda el usuario, nunca el PIN), recuperación y redirección por rol.
- `src/components/`: piezas compartidas por las dos islas: controles (`ui.tsx`), toasts, la marca y los pernos de la pestaña activa (`brand.tsx`), los ladrillos (`bricks.tsx`, con el muro de la semana y el hueco «por ganar»), el título de paso numerado, el marco de pantalla completa y los providers.
- `src/lib/`: cliente tipado `hc<AppType>` y `call()` (`api.ts`, con los errores de la api como `ApiError`), Better Auth (`auth.ts`), TanStack Query (`queries.ts`, consulta cada 5 s en las vistas en vivo), comandos con toast (`useCommand.ts`), guard de rol (`guard.ts`, cada rol con su login), reloj del servidor (`clock.ts`), cuenta regresiva (`timer.ts`), alarma de la pestaña (`alarm.ts`), Web Push (`push.ts`), textos de error (`errors.ts`) y formatos en la zona de la familia (`format.ts`).
- `public/sw.js`: service worker de Web Push (muestra el aviso, abre la página al tocarlo y avisa a la pestaña abierta). `public/manifest.webmanifest` e `icons/`.

## Tiempo real

- El servidor manda: la web nunca calcula saldos. Solo cuenta el restante en vivo a partir del inicio, la duración y las pausas que devuelve la api, con la hora del servidor (`serverTime` en cada respuesta del cronómetro corrige el desfase del reloj del teléfono).
- Polling de 5 s con TanStack Query, solo con la pestaña visible. Un push con la pestaña abierta refresca todo al instante.
- La alarma de la pestaña suena (Web Audio) y vibra al aviso previo y al fin, en las dos islas; del lado del niño, también cuando una sesión programada le deja empezar. Complementa al push, no lo reemplaza: Android congela los timers de las pestañas en segundo plano.

No debe:

- Contener reglas de negocio ni calcular saldos: los recibe de la api. Solo calcula el restante en vivo del cronómetro a partir de lo que devuelve el servidor.
- Importar `packages/db` ni manejar secretos: todo lo que llega al navegador es público. De la api solo importa tipos (`AppType`).
- Usar SSR ni un adaptador de Astro: la salida es estática.
- Usar APIs exclusivas de Bun.
- Copiar el contrato de dirección de `.impeccable/` al código o a cualquier archivo que llegue al navegador.
