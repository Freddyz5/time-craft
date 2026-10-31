# Verificación manual en teléfonos reales

El e2e (`apps/e2e`) recorre los 8 pasos del flujo en Chrome, pero hay cosas que solo se ven en un teléfono de verdad: el push con la app cerrada, el sonido y la vibración, Google, y dos padres tocando a la vez. Esta lista cubre eso.

**Cuándo:** completa en `dev` antes de cada release; después del release, en producción, al menos las secciones 2, 3 y 5.

## Antes de empezar

- [ ] Dos teléfonos Android con Chrome actualizado: uno de un padre y otro del niño. Para la sección 7 hace falta un tercero (el otro padre); sirve también una computadora.
- [ ] En cada teléfono: sonido y vibración activados, sin modo No molestar, y las notificaciones de Chrome permitidas en los ajustes de Android (*Ajustes › Apps › Chrome › Notificaciones*).
- [ ] Ambiente:
  - **dev**: `<WEB_DEV>` (ver [deploy.md](deploy.md)). Tiene Vercel Authentication: en cada teléfono, la primera vez entra con tu cuenta de Vercel. Usa el hogar sembrado en Neon `dev`.
  - **producción**: `<WEB_PROD>`, con la familia real.
- [ ] La api responde: `curl <API>/health` devuelve `{"ok":true,…}`.
- [ ] En la [consola de QStash](https://console.upstash.com/qstash), pestaña **Logs**, a mano para ver las entregas a `<API>/internal/jobs` (deben responder 200).
- [ ] Anota al final, en el registro, la fecha, el ambiente y el commit desplegado.

## 1. Activar las notificaciones

- [ ] **Padre:** entra en `/login`, ve a **Cuentas › Avisos en este dispositivo › Activar avisos** y acepta el permiso de Chrome. Se ve «Avisos activados aquí.».
- [ ] **Niño:** entra en `/nino/entrar` con su usuario y PIN, ve a **Avisos › Activar avisos** y acepta. Se ve «¡Listo! Te vamos a avisar aquí.».
- [ ] En el SQL Editor de Neon (rama del ambiente): `select device_label, created_at from push_subscriptions order by created_at desc limit 5;` muestra una fila nueva por teléfono, con un nombre como «Chrome en Android».

Si el botón dice que el navegador no puede recibir avisos: no es Chrome, es una pestaña de incógnito o el permiso está bloqueado (candado junto a la dirección › Permisos › Notificaciones).

## 2. Push inmediatos, con la app cerrada

Cierra Chrome en los dos teléfonos (quítalo de las apps recientes) y bloquea la pantalla antes de cada paso del otro lado.

- [ ] El niño pide 30 min de Juego. Al padre le llega **«Nueva solicitud»** en segundos. Al tocarla se abre Inicio con la solicitud.
- [ ] El padre la aprueba. Al niño le llega **«¡Solicitud aprobada!»**; al tocarla ve su sesión corriendo.
- [ ] El niño reporta una tarea: al padre le llega **«Tarea reportada»**. El padre la aprueba: al niño le llega **«¡Bono aprobado!»**.
- [ ] Un rechazo con nota: al niño le llega **«Solicitud rechazada»** con la nota como texto.

## 3. Aviso previo y fin, con la app cerrada

Las alarmas programadas viajan por QStash, así que no dependen de que la app esté abierta.

- [ ] En **Reglas**, pon «Aviso antes del final» en **1 min** y guarda.
- [ ] En **Nueva sesión**, escribe **2** minutos de Juego y empieza.
- [ ] Cierra Chrome en los dos teléfonos y bloquea las pantallas.
- [ ] Al minuto, los dos reciben **«Quedan 1 min»**.
- [ ] A los 2 minutos, los dos reciben **«Se acabó el tiempo»**.
- [ ] En los Logs de QStash aparecen las dos entregas con estado 200.
- [ ] Opcional (30 min más): no detengas la sesión. Al padre le llega **«Sesión cerrada automáticamente»** y en Historial aparece «Cerrada sola».
- [ ] Vuelve a dejar el aviso como estaba (5 min por defecto).

Si no llega nada: revisa que la fila de la sección 1 siga en `push_subscriptions` (una suscripción que el servicio de push da por muerta, 404 o 410, se borra sola) y que en QStash el mensaje se haya entregado. Un mensaje con 401 es la protección de Vercel en la api (ver [deploy.md](deploy.md#qstash-y-la-protección-de-vercel)).

## 4. Alarma con la app abierta

Con la app en primer plano, el teléfono suena y vibra al segundo exacto, además del push.

- [ ] Con «Aviso antes del final» en 1 min, empieza una sesión de 2 min y deja **Inicio** abierto en los dos teléfonos, con la pantalla encendida.
- [ ] Al minuto, los dos suenan, vibran y muestran «Quedan 1 min».
- [ ] A los 2 minutos, suenan y vibran otra vez: «Se acabó el tiempo».
- [ ] Una sesión aprobada «más tarde»: a esa hora, con la app del niño abierta, suena «¡Ya puedes empezar!».
- [ ] Con la pestaña en segundo plano (otra app delante), la alarma no suena, pero el push sí llega: es lo esperado (Android congela las pestañas de fondo).
- [ ] Con la sesión en curso, Inicio muestra «La alarma está sin sonido» solo si la pestaña se abrió sin tocarla (por ejemplo, desde un aviso); «Activar sonido» suena una vez y la placa desaparece.
- [ ] En **Cuentas › Sonido de este dispositivo** (padres) y en **Avisos › Sonidos** (niño), elegir un sonido lo hace sonar. Recarga la página: la elección sigue ahí. En otro teléfono, los sonidos siguen siendo los de siempre (se guardan por dispositivo).
- [ ] La lista tiene tres grupos (Suaves, Alarmas, De videojuego). Con el volumen del teléfono al máximo, prueba cada alarma en Alto: se oyen fuerte y ninguna suena rota ni saturada.
- [ ] A los 2 minutos, el fin («Alarma» por defecto) se repite cada 5 segundos hasta tocar la pantalla. Con «Repetir el fin…» apagado, suena una sola vez.
- [ ] Activa «Decir el aviso en voz alta»: dice una frase de ejemplo en español. «Voz» lista las voces en español del teléfono y «Probar» dice la frase con la elegida.
- [ ] Con la voz activada, cada alarma dice su aviso después del sonido («Te queda 1 minuto de Minecraft…»). El fin lo dice completo la primera vez y luego solo «Se acabó…» en cada repetición; tocar la pantalla calla el sonido y la voz.

## 4b. Alarma en la computadora

En la computadora, Chrome no congela una pestaña de fondo: Time Craft abierto detrás de otra ventana sigue sonando. Se prueba en la computadora donde juega el niño.

- [ ] Con «Aviso antes del final» en 1 min, el niño entra en Chrome, activa los avisos en **Avisos** y deja **Inicio** abierto: la placa dice «La alarma suena aquí».
- [ ] Empieza una sesión de 2 min y pon otra ventana a pantalla completa delante de Chrome (o el juego). Al minuto suena el aviso y a los 2 minutos el fin, que se repite hasta volver a la pestaña y tocarla.
- [ ] Cada alarma suena una sola vez aunque lleguen el temporizador de la pestaña y el push.
- [ ] Con la pestaña abierta en otra pantalla (Pedir, Tareas), el push también la hace sonar.
- [ ] Un padre con Time Craft abierto en **Reglas** escucha el timbre cuando el niño pide tiempo, con el aviso «Nueva solicitud» abajo a la derecha.
- [ ] Al cerrar la pestaña con la sesión en curso, Chrome pregunta antes de salir. «Salir» (cerrar sesión) no pregunta.
- [ ] Con «Decir el aviso en voz alta» activado y la pestaña detrás del juego, la voz también se escucha al aviso y al fin. Si Windows no tiene voces en español, «Voz» muestra las de Google (necesitan internet).

## 5. Login con Google

Solo en `dev` y producción (en las previews de PR Google está apagado).

- [ ] Cada padre, en `/login`, toca **Continuar con Google**, elige su cuenta y llega a `/padres`.
- [ ] Con una cuenta de Google que no es de un padre: vuelve a `/login` con «Ese correo de Google no es de un padre de la familia.».
- [ ] Cerrar sesión en **Cuentas** y volver a entrar con Google no pide la contraseña de Time Craft.

## 6. Recuperación con el código de la familia

Cambia de verdad la contraseña de un padre. En producción, ten la contraseña nueva a mano o hazlo con el otro padre presente.

- [ ] Un padre, en **Cuentas › Código de recuperación › Generar uno nuevo**, confirma y guarda el código (se muestra una sola vez).
- [ ] En otro dispositivo, sin sesión, abre `/recuperar`, escribe el correo de un padre, el código y una contraseña nueva dos veces, y toca **Cambiar la contraseña**.
- [ ] Ves «Listo: ya puedes entrar» con un código **nuevo**. Guárdalo: el anterior ya no sirve.
- [ ] Entra en `/login` con la contraseña nueva.
- [ ] Usar otra vez el código anterior da error.
- [ ] Con Google, ese padre sigue entrando igual.

## 7. Dos padres a la vez

- [ ] Los dos padres con **Inicio** abierto en sus teléfonos.
- [ ] El niño pide tiempo: la solicitud aparece en los dos teléfonos en unos segundos (el push la adelanta).
- [ ] Los dos tocan **Aprobar** casi a la vez. Uno ve «Aprobado…»; el otro, «Esta solicitud ya fue respondida, quizá por el otro padre.». Hay **una** sola sesión.
- [ ] Un padre pausa: en el otro teléfono la sesión pasa a «En pausa» en menos de 10 s, con el mismo restante.
- [ ] El otro padre la reanuda y luego la detiene: el primero lo ve en menos de 10 s, y el Historial dice quién la inició y quién la detuvo.
- [ ] Opcional: en un teléfono, adelanta la hora del sistema 5 minutos (*Ajustes › Fecha y hora*, sin hora automática). La cuenta regresiva sigue igual a la del otro teléfono. Vuelve a poner la hora automática.

## 8. App Android

Con la app instalada en los teléfonos ([deploy.md](deploy.md#parte-f-app-android-hito-2), pasos 22 y 23) y los avisos activados en ella. Cierra la app (quítala de recientes) y apaga la pantalla antes de cada paso del otro lado.

- [ ] **Login:** un padre entra con **Continuar con Google** desde la app: aparece el selector de cuentas del teléfono, sin pedir contraseña. El niño entra con usuario y PIN y, al volver a abrir la app, con **Entrar con huella**.
- [ ] **Huella de padres:** al abrir el lado de los padres pide la huella; tras dos minutos fuera de la app la vuelve a pedir. En Cuentas, «Pedir huella al abrir la app» apagado deja de pedirla.
- [ ] **Push inmediatos:** el niño pide tiempo → al padre le suena **«Nueva solicitud»** con la pantalla apagada, con el sonido elegido en Cuentas › Sonido. Tocar el aviso abre Inicio con la solicitud.
- [ ] **Aviso previo y fin** (como la sección 3, con «Aviso antes del final» en 1 min y una sesión de 2 min): con la pantalla apagada, el aviso previo suena aunque el teléfono esté en silencio; el fin enciende la pantalla con **«Se acabó el tiempo»** a pantalla completa y suena hasta tocar **Detener**. Con «Repetir el fin…» apagado en Sonido, suena una vez.
- [ ] **App abierta:** con Inicio delante, el fin suena una sola vez (la notificación del teléfono, no también la pestaña) y la pantalla se actualiza sola.
- [ ] **Sonidos:** cambiar el sonido del fin en Cuentas › Sonido y **Probar la alarma de fin** suena con el nuevo.
- [ ] **Sin internet:** con el modo avión, la app muestra «Sin conexión»; **Reintentar** vuelve al quitarlo.
- [ ] En el SQL Editor de Neon: `select device_label, created_at, last_used_at from native_push_tokens order by created_at desc limit 5;` muestra una fila por teléfono («App en …») con `last_used_at` reciente.

## Registro

| Fecha | Ambiente | Commit | Teléfonos | Resultado y notas |
|---|---|---|---|---|
| | | | | |
