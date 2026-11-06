# apps/mobile

App Android (hito 2, [docs/contexto-hito-2.md](../../docs/contexto-hito-2.md)): Capacitor 8 alrededor de la web publicada. No tiene pantallas propias salvo la alarma de fin y la página «Sin conexión»: todo lo demás es `apps/web`, que detecta que corre aquí (`apps/web/src/lib/native.ts`).

- Dos apps del mismo código, que se instalan una al lado de la otra: **«Time Craft»** (variante `prod` de Gradle, paquete `app.timecraft`) abre la web de producción, y **«Time Craft Dev»** (variante `dev`, `app.timecraft.dev`, ícono azul con «DEV») la de dev. Su nombre y su ícono están en `android/app/src/dev/res`; el `namespace` y el código Java siguen en `app.timecraft`. Las dos van firmadas con la misma llave.
- `capacitor.config.ts`: `server.url` sale de `TIMECRAFT_WEB_URL` (obligatoria: sin ella `cap sync` falla). Producción para «Time Craft»; el dominio de `dev` o una web local (`http://10.0.2.2:<puerto>` desde el emulador, con la web escuchando en `127.0.0.1`) para «Time Craft Dev». La variante no la elige la URL: cada comando de abajo construye una. Los plugins de Capgo y los proveedores de login (solo Google).
- `android/`: proyecto de Gradle que generó `cap add android`, con el código propio en `app/src/main/java/app/timecraft/`:
  - `TimeCraftPlugin`: el puente con la web (token de FCM, permiso de avisos, sonidos y voz elegidos, ajustes de batería y pantalla completa, `testAlert`, `ring` cuando el reloj de la página llega a una alarma, `stopAlarm` cuando alguien toca la página, `speak` para «Probar» la voz). Eventos `push` y `token`.
  - `TimeCraftMessagingService`: recibe los mensajes de datos de la api aunque la app esté cerrada.
  - `Alerts`: arma cada notificación. Un canal por tipo de aviso y sonido (`tc-<tipo>-<sonido>`); aviso previo, fin y «ya puedes empezar» por el stream de alarma; el fin con pantalla completa y un botón: «Terminar sesión» si el aviso es de los padres (`/api/sessions/:id/stop`) o «Silenciar» si es del niño, que no puede terminarla. La misma alarma (etiqueta y tipo) suena una sola vez en 3 minutos, venga del reloj de la página o del push. `alarm_stopped` (otro dispositivo la detuvo) la calla.
  - `AlarmService`: servicio en primer plano (`mediaPlayback`) que suena como la pestaña: el sonido (el primero lo pone el canal), la voz y, el fin, otra vez cada 5 segundos hasta que lo detengan o pasen 5 minutos. Solo se usa si el teléfono habla o repite el fin; si Android no lo deja arrancar, el canal repite con `FLAG_INSISTENT`.
  - `Speaker` (la voz de Android en español, en el stream de alarma) y `StopSync` (cuando alguien detiene el fin aquí, avisa a la api con la cookie del WebView: termina la sesión o solo calla la alarma, y así se calla en los demás dispositivos).
  - `AlarmActivity` (el fin sobre la pantalla bloqueada; «Abrir Time Craft» pide desbloquear antes de abrir la app, que no se muestra sobre el bloqueo; se cierra sola si la alarma se detiene en otro lado), `StopAlarmReceiver` (el botón del aviso) y `MainActivity` (abre la página del aviso tocado y detiene su alarma).
- `android/app/src/main/res/raw/tc_<id>.wav`: los sonidos del catálogo de la web, generados con `bun run sounds` (`scripts/sounds.ts` y `scripts/synth.ts`, que imitan lo que hace `lib/alarm.ts` con Web Audio). Se commitean; vuelve a generarlos si cambia `apps/web/src/lib/sounds.ts`.
- Iconos: `bun run icons` (`scripts/icons.ts`) desde `apps/web/brand` y `public/icons`, también los de «Time Craft Dev». Se commitean.
- Versión: la de este `package.json` (la escribe el release, `mobile-v…`); Gradle la lee para `versionName` y `versionCode` (1.2.3 → 10203). La de dev lleva `-dev` al final.

## Construir

Java 21 y el SDK de Android (`ANDROID_HOME`; Android Studio lo instala).

```sh
TIMECRAFT_WEB_URL=https://<web-dev> bun run android:debug          # «Time Craft Dev» con la llave de debug: android/app/build/outputs/apk/dev/debug/
TIMECRAFT_WEB_URL=https://<web-dev> bun run android:release:dev    # «Time Craft Dev» firmada: apk/dev/release/
TIMECRAFT_WEB_URL=https://<web-prod> bun run android:release:prod  # «Time Craft» firmada: apk/prod/release/
adb install -r android/app/build/outputs/apk/dev/debug/app-dev-debug.apk
```

- `android/app/google-services.json` (Firebase) y `android/keystore.properties` (la llave) nunca se commitean. Sin el primero la app funciona pero no recibe avisos; sin el segundo el APK release sale sin firmar. En CI los escribe `.github/workflows/android.yml` desde los secretos.
- `google-services.json` tiene que traer las dos apps (`app.timecraft` y `app.timecraft.dev`): si falta la que construyes, Gradle se detiene con «No matching client found». Las dos están en el mismo proyecto de Firebase; cada api solo avisa a los tokens que guarda su base.
- Una app firmada con la llave de release no se actualiza con una de debug del mismo paquete (ni al revés): desinstálala antes.
- La llave de firma es una sola para siempre: con otra, el teléfono no actualiza la app instalada.
- En un build debug, Chrome (`chrome://inspect`) se conecta al WebView.

No debe:

- Tener pantallas o lógica que ya están en la web: la app es la web.
- Pedir permisos que no usa ni tomar datos del teléfono más allá de la marca y el modelo (para la etiqueta del dispositivo).
- Guardar el PIN del niño fuera del Keystore (el plugin biométrico) ni la sesión fuera de las cookies del WebView.
