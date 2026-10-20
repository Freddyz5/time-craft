---
version: 1
slug: "src-pages-nino"
primary_target: "src/pages/nino"
related_targets: ["src/pages/nino/entrar.astro"]
---

# Área del niño (/nino) y su entrada (/nino/entrar)

## Scope

- Modo: **Operate**. El niño (9 años) viene a mirar cuánto le queda, pedir tiempo y ganar bonos, y se va.
- Rutas: `/nino/entrar` (pública, usuario + PIN) y la isla React de `/nino` con enrutado interno: Inicio, Pedir, Tareas, Avisos. Mismo mundo y misma base técnica que `/padres`.
- Escena: teléfono, tableta o la PC de la casa (donde juega), en una habitación iluminada. Tema claro.
- Restricciones: 360 px de ancho mínimo, español tuteando al niño, salida estática, Tailwind 4, polling de 5 s en vivo. El niño nunca ve iniciar, pausar ni detener.

## Decisiones de shape (confirmadas por el usuario)

- El saldo es una **batería de ladrillos**: silueta de batería con borne y celdas-ladrillo de 10 min (Hoy en una fila, Semana a 10 por fila).
- **Mismo mundo, más grande**: ladrillos y cifras más grandes, menos texto, momentos de encaje al aprobarse un pedido o un bono. Sin emojis, sin rojo de castigo.
- Estructura: **tres pestañas** (Inicio, Pedir, Tareas); Avisos desde la campana de la barra superior. Seed key 54e2ca7c (dealt 3, 4, 7; elegida la carta que lideraba).
- Login en `/nino/entrar`, dos pasos (usuario, PIN), teclado numérico grande; el navegador **recuerda el usuario** (nunca el PIN).
- Pedir para empezar: **ladrillos de 10 + el resto** del disponible, sin teclear. Tiempo extra: **hasta 60 min** (6 ladrillos), con motivo obligatorio.

## Direction contract

THESIS: El niño lee su tiempo como baterías hechas de ladrillos que se gastan y se recargan, y pide armando ladrillos, no escribiendo números. Rechaza el panel infantil de la categoría: anillos de progreso, mascotas, estrellas y confeti de app de recompensas.

OWN-WORLD: El manual de armado de 5a a mayor escala: fondo azul pálido, recuadros blancos de 12 px con borde de 1,5 px, tinta casi negra, Rubik con cifras tabulares. Batería: contorno de tinta grueso con borne y celdas-ladrillo; verde por usar, amarillo bono, contorno punteado usado, hueco liso por ganar. Azul Juego, magenta TV, naranja pausa, rojo solo cuando el tiempo se acaba. Pestañas con dos pernos amarillos.

STORY: El niño abre la app y ve de inmediato si algo está corriendo, si ya puede empezar o cuántos ladrillos le quedan hoy y en la semana. Pide con dos toques, ve la respuesta con la nota de su papá o mamá y sabe qué tarea le da más ladrillos.

FIRST VIEWPORT: A 360 px: barra blanca con la marca, «Hola, Mateo» y la campana. Si hay sesión, «Ahora» con la etiqueta de actividad, una cuenta regresiva de 4.5rem y la fila de ladrillos vaciándose; si está programada, «Faltan 12:05 para que puedas empezar». Si no, el titular «Te quedan 40 min hoy» sobre la batería Hoy y la batería Semana, con su recarga y «Pedir tiempo» en tinta. La tira del pedido o de la última respuesta va debajo de «Ahora». Abajo, tres pestañas de 64 px.

FORM: Tres pestañas (Inicio, Pedir, Tareas) dentro del manual de ladrillos; tercera de mi lista ordenada, repartida por la tirada como líder; seed key 54e2ca7c.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: «arma tu pedido». En Pedir, los ladrillos disponibles se muestran como una fila; tocar uno elige hasta ese (10, 20, 30… y el último vale lo que quede), y los elegidos se levantan y toman el color de la actividad. Al aprobarse, esos ladrillos encajan en la sesión; un bono aprobado encaja en amarillo en la batería de la semana. Con reduced motion, el cambio es instantáneo.

## Briefs por pantalla (shape)

1. **Entrar** (`/nino/entrar`, pública). Paso 1 usuario, paso 2 PIN (el paso 1 se salta si el usuario está recordado, con «¿No eres …? Cambiar»). El PIN se ve como pernos que se llenan (6 huecos, crece hasta 12) y se teclea en un teclado 3×4 de teclas grandes (y con el teclado físico). Estados: enviando, no coinciden (sacudida corta), bloqueado (cuenta regresiva en vivo hasta poder probar, teclado desactivado, pista de pedir a un padre que cambie el PIN), demasiados intentos (esperar un minuto), sesión ya abierta (redirige). Enlace a `/login` para padres y desde `/login` hacia aquí.
2. **Inicio** (`/nino`). Orden: «Ahora» (en curso, en pausa, pasada o programada con cuenta regresiva a «¡Ya puedes empezar!», que suena) → tira del pedido pendiente o de la última respuesta de la última hora (con la nota) → baterías Hoy y Semana con bonos ganados frente al tope y cuándo se recarga cada una, y «Pedir tiempo» (o «Pedir tiempo extra» y «Gana más con tareas» con la cuota agotada) → oferta de avisos mientras estén apagados. Dos columnas en escritorio. Alarma en la pestaña al aviso y al fin.
3. **Pedir** (`/nino/pedir`). Sin pendiente: pasos 1 actividad, 2 cuánto (ladrillos tocables, tope en el disponible de su bolsa), 3 motivo (solo tiempo extra). Con la cuota agotada el flujo es «Tiempo extra» (hasta 60 min). Con pendiente: su caja de piezas, esperando, cuándo expira y «Cancelar pedido». Con sesión abierta: lo explica. Abajo, «Hoy»: pedidos del día con quién respondió, minutos y nota; un rechazo es neutro.
4. **Tareas** (`/nino/tareas`). Medidor de bonos (amarillos ganados + huecos hasta el tope). Catálogo de tareas activas con premio en caja de piezas amarilla, máximo por semana y «¡La hice!» con nota opcional; «Esperando revisión» si ya está reportada; desactivada si llegó al máximo. «Tus reportes de esta semana» con estado y nota del padre.
5. **Avisos** (`/nino/avisos`). Qué llega (aviso previo con sus minutos, fin, ya puedes empezar, respuestas), activar/desactivar en este dispositivo, ayuda si está bloqueado o no es compatible, «Probar el sonido» y «Salir».

## Open decisions

- Ninguna abierta. Sin modo oscuro en la v1.
