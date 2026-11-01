# Contexto: Time Craft · Hito 2 (app Android)

## Qué es

Una app Android para los dos padres y el niño, todos con teléfonos Android. Hace sonar las alarmas con la pantalla apagada, deja entrar con Google y abrir con la huella. Se instala a mano (APK) y no cuesta nada.

**Por qué:** con la pantalla apagada, un aviso web suena una sola vez con el sonido del sistema, no se repite, no usa los sonidos de Time Craft y respeta el modo silencio. El ahorro de batería además lo puede retrasar. La api ya mandaba el push con urgencia alta y 15 minutos de vida: es un límite del navegador, no un error, y solo una app propia lo resuelve.

**No entra:** iPhone (la cuenta de Apple cuesta 99 USD al año y rompe la regla de planes gratuitos), Play Store, detectar Minecraft o la TV (pasan a los hitos siguientes, como estaba en la idea original).

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Tecnología | Capacitor 8, solo Android (`apps/mobile`) | Reutiliza la web sin reescribir la UI |
| Qué muestra | La web publicada (`server.url`, `TIMECRAFT_WEB_URL` al construir) | Mismo origen: la cookie de sesión y `/api/*` funcionan como en el navegador, y cada release de la web llega a la app sin APK nuevo. Capacitor lo desaconseja para tiendas; para una app privada instalada a mano es aceptable |
| Avisos | Firebase Cloud Messaging (HTTP v1), mensajes solo de datos | El servicio propio de la app arma cada notificación con los sonidos del teléfono, incluso con la app cerrada |
| Servidor | `FcmNotifier`, un segundo adaptador del puerto `Notifier`, junto a Web Push (`FanOutNotifier`) | Core solo suma los tokens de la app: las alarmas siguen el mismo camino (QStash → api → push) y el servidor sigue decidiendo |
| Tokens | Tabla nueva `native_push_tokens` | Migración que solo agrega: compatible hacia atrás |
| Sonidos | Los del catálogo de la web (`sounds.ts`) convertidos a WAV (`bun run sounds`), un canal de Android por tipo de aviso y sonido | El canal no puede cambiar su sonido: elegir otro sonido crea otro canal |
| Alarma de fin | `AlarmService` (servicio en primer plano) en el stream de alarma, como la pestaña: el sonido, la voz y otra vez cada 5 segundos, hasta que alguien la detenga o pasen 5 minutos (si el teléfono eligió repetirla). Pantalla completa sobre el bloqueo (`AlarmActivity`) con «Terminar sesión» en los teléfonos de los padres (termina la sesión, como «Detener» en la web) o «Silenciar» en el del niño, y «Abrir Time Craft», que primero pide desbloquear el teléfono. El aviso lleva el mismo botón. Si Android no deja arrancar el servicio, el canal repite el sonido (`FLAG_INSISTENT`) | Como un despertador. El aviso previo y «ya puedes empezar» también van por el stream de alarma: No molestar deja pasar las alarmas por defecto |
| Detener en todos lados | Detener el fin en cualquier dispositivo de la familia (padres o niño: «Terminar sesión» o «Silenciar», tocar la pestaña o la app, abrirla desde el aviso), o detener la sesión después de su fin, hace que la api mande `alarm_stopped` a todos: el teléfono se calla aunque la app esté cerrada, y en el navegador el aviso cambia por «Alarma detenida» sin sonido | La alarma suena en todos a la vez y se calla en todos a la vez |
| Voz | La de Android (texto a voz, en español) lee la alarma tras el sonido si el teléfono eligió «Decir el aviso en voz alta»; «Probar» también la usa | El WebView no tiene las voces del navegador |
| Pestaña en la app | El reloj de la página hace sonar el teléfono al segundo exacto (`TimeCraft.ring`) y el push que llega después no vuelve a sonar; con la app cerrada suena el push | Sin esperar al push con la app abierta, y la misma alarma nunca suena dos veces |
| Login de padres | Google con el selector de cuentas del teléfono (Credential Manager, `@capgo/capacitor-social-login`) → ID token → Better Auth `signIn.social` con `idToken` | Google bloquea su página de login dentro de una app. La audiencia del token es el cliente web de siempre |
| Huella | `@capgo/capacitor-native-biometric`. Padres: bloquea su lado al abrir y tras 2 minutos fuera (se puede apagar en Cuentas). Niño: tras entrar con el PIN, el teléfono lo guarda cifrado (Keystore de Android) y la huella lo libera | Nadie aprueba tiempo desde el teléfono de un padre; nadie recuerda otra contraseña |
| Plugin propio | `TimeCraftPlugin` (Java): token, permiso de avisos, sonidos elegidos, ajustes de batería y pantalla completa, prueba de la alarma | El plugin de push de Capacitor no entrega mensajes de datos con la app cerrada |
| Distribución | APK firmado en GitHub Actions (`android.yml`), adjunto al GitHub Release `mobile-v…` | Gratis. Cada APK lleva la misma llave, o el teléfono no actualiza |
| Versión | `apps/mobile` tiene su versión semántica, como la web y la api | Solo sus propios cambios la suben: los de la web llegan solos |
| Código nativo | Java (no Kotlin) | Es lo que genera Capacitor; no hace falta otro plugin de Gradle |

## Fases (una sola rama, `feat/h2-android-app`)

1. **Definir el hito:** este documento.
2. **App base:** `apps/mobile` con Capacitor, la web publicada, iconos de la marca, pantalla de arranque y página «Sin conexión».
3. **Google y huella:** login nativo de padres, bloqueo con huella y huella en vez del PIN para el niño.
4. **Avisos en el servidor:** tabla, casos de uso, ruta `/api/native-push-tokens`, `FcmNotifier` y `FCM_SERVICE_ACCOUNT`.
5. **Avisos con sonido:** registro del token en la app, canales con los sonidos y la página correcta al tocar el aviso.
6. **Alarma que insiste:** `FLAG_INSISTENT`, pantalla completa y la lista de Cuentas/Avisos (batería, pantalla completa, prueba).
7. **Construir e instalar:** `android.yml`, el release `mobile-v…` y la guía (`docs/deploy.md` parte F, `docs/verificacion-manual.md` sección 8).
8. **Ajustes tras probar en los teléfonos** (`feat/h2-alarm-sync`): detener la alarma en todos lados, la voz en la app, sonar al segundo exacto con la app abierta, el release de la api al final y una `FCM_SERVICE_ACCOUNT` mal puesta que ya no tumba la api.

## Lo que configuras a mano

`docs/deploy.md`, parte F: proyecto de Firebase, cliente Android en Google Cloud, `FCM_SERVICE_ACCOUNT` en Vercel, variables y secretos de GitHub, la llave de firma y la instalación en cada teléfono.

## Puntos a vigilar

- Algunas marcas (Samsung, Xiaomi) duermen las apps en segundo plano aunque la batería esté «sin restricciones»: la guía de cada teléfono lo cubre.
- Si se pierde la llave de firma, hay que desinstalar la app y volver a instalarla (y registrar el SHA-1 nuevo en Google Cloud).
- Los plugins de Capgo son de terceros: versiones fijas; revisar su changelog antes de subirlas.
- La app sin internet muestra «Sin conexión» (igual que la web: sin servidor no hay saldo).
