# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Los dos padres** (usuarios de la Fase 5a). Abren la app desde el teléfono (Android + Chrome), casi siempre con prisa y en medio de otra cosa: cocinando, en el trabajo, fuera de casa. También desde el navegador de escritorio. Lo que más hacen es **revisar el saldo y el historial** del niño y **controlar la sesión en vivo** (ver cuánto queda, pausar para la cena, detener). Además responden las solicitudes que les llegan por push, inician sesiones directas, ajustan reglas y tareas de bono y administran las cuentas.
- **El niño, de 9 años** (Fase 5b, misma base técnica). Entra con usuario + PIN desde cualquier navegador. Ve su saldo y el cronómetro de su sesión, y pide: empezar, tiempo extra o bonos por tareas. Nunca inicia, pausa ni detiene nada.

## Product Purpose

Time Craft lleva la cuenta del tiempo de pantalla de un niño (Minecraft en una PC, YouTube en una TV LG) con cuotas diarias y semanales tipo «créditos». Lo usan los dos padres y el niño, cada uno desde su teléfono o navegador y desde cualquier lugar.

Funciona bien cuando cualquiera de los padres sabe de un vistazo cuánto le queda al niño y qué está pasando ahora, y puede actuar en segundos. Y cuando el niño sabe cuánto tiene y cómo ganar más, sin discusiones.

## Positioning

No es un control parental que espía ni bloquea: en la versión 1 no detecta el juego ni la TV, todo se registra a mano. Es una cuenta compartida y transparente: el servidor es la fuente de verdad del cronómetro, así que padres y niño ven exactamente los mismos números. El saldo nunca se guarda, se calcula a partir de las sesiones. El niño pide y los padres deciden, y las reglas están a la vista de todos.

## Operating Context

- Registro manual: un padre inicia, pausa y detiene las sesiones. Una sesión puede empezar ahora o programarse para más tarde en el mismo día.
- Estados de una sesión: programada → en curso ⇄ pausada → terminada; una programada también puede cancelarse. Solo hay una abierta por niño. Una pausa no consume, pero bloquea nuevas sesiones.
- Si nadie la detiene, el servidor cierra la sesión sola al pasar el margen de cierre automático (30 min por defecto) y avisa a los padres.
- Push (Web Push) para el aviso previo, el fin, el cierre automático, las solicitudes y los reportes de tareas. Con la app abierta, además suena y vibra en el segundo exacto.
- Los clientes consultan cada 5–10 s. Los dos padres pueden actuar a la vez: gana el primero y el otro ve que ya estaba resuelto.
- Las solicitudes del niño expiran a los 15 minutos sin respuesta. Solo hay una pendiente a la vez.
- Los días y las semanas se calculan en la zona horaria de la familia (America/Guayaquil por defecto), y el día de inicio de semana es configurable.

## Capabilities and Constraints

- Vocabulario: saldo; disponible (lo menor entre lo que queda del día y de la semana); bonos y tope semanal de bonos; aviso previo; sesión programada, en curso o pausada; solicitud (empezar o tiempo extra); tiempo extra dado por un padre (override, siempre con motivo y en una sesión nueva); reporte de tarea; código de recuperación.
- Reglas: una cuota global (Juego y TV comparten la bolsa) y, opcionalmente, límites propios por actividad. Cambiar un límite crea una política nueva y conserva el historial. La política vigente aplica a toda la semana en curso.
- Los bonos suman a la bolsa semanal hasta un tope y no suben el límite diario. El exceso cuenta: se descuenta el tiempo real consumido.
- Cuentas: los padres entran con Google (en dev y producción) o con correo y contraseña, sin registro público. Un padre crea la cuenta del niño, restablece su PIN y cierra sus sesiones de login, y puede restablecer la contraseña del otro padre. El código de recuperación de la familia es el último recurso. En la versión 1 no se envían correos.
- Técnica: Astro estático con islas React y Tailwind, sin SSR. Todo corre en planes gratuitos (Vercel Hobby, Neon Free, QStash Free).
- Fuera de la versión 1: detección del juego o la TV, planificación por parte del niño, que el niño termine antes por su cuenta, logros y rachas.

## Brand Commitments

- Nombre: **Time Craft**. Logo: un ladrillo amarillo 2×2 con la aguja de un reloj (`brand/mark.svg`; con el nombre en `brand/logo.svg` y `brand/logo-dark.svg`). Estilo de videojuego de piezas de construir, con ladrillos genéricos: nunca el nombre, el logo ni la tipografía de una marca de juguetes.
- Tema claro y oscuro, a elección de cada dispositivo (por defecto, el del sistema).
- Voz: clara y calmada, en español y tuteando (como los textos de push que ya existen). Nunca un tono de vigilancia, castigo o alarma innecesaria: se habla de acuerdos y de tiempo disponible, no de control.

## Evidence on Hand

- No hay pantallas, datos reales, testimonios ni métricas. El seed crea la familia, los dos padres, el niño, las actividades Juego y TV y una política global por defecto (60 min al día, 300 a la semana).
- No hay que inventar clientes, cifras de uso ni promesas que el producto no cumple (por ejemplo, detección automática).

## Product Principles

1. **Un vistazo basta.** El saldo y la sesión en vivo se entienden sin leer párrafos, en el teléfono y con una mano.
2. **Transparencia, no vigilancia.** Padres y niño ven los mismos números y las mismas reglas, y el lenguaje es de acuerdo, no de castigo.
3. **Actuar en segundos.** Las acciones frecuentes (pausar, detener, aprobar) quedan a un toque. Las que no se pueden deshacer piden confirmación.
4. **El servidor manda.** La interfaz nunca inventa ni recalcula saldos: muestra lo que devuelve la api y solo calcula el restante en vivo, corregido por la hora del servidor.
5. **Calma por defecto.** Se avisa cuando importa (aviso previo, fin, una pausa olvidada), sin ruido el resto del tiempo.
