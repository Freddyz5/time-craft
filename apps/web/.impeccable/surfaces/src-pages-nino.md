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
- Escena: teléfono, tableta o la PC de la casa (donde juega), de día o de noche. **Tema claro y oscuro**: sigue al del dispositivo y se puede fijar a mano en Avisos.
- Restricciones: 360 px de ancho mínimo, español tuteando al niño, salida estática, Tailwind 4, polling de 5 s en vivo. El niño nunca ve iniciar, pausar ni detener.

## Decisiones de shape (confirmadas por el usuario)

- El saldo es una **batería de ladrillos**: silueta de batería con borne y celdas-ladrillo de 10 min (Hoy en una fila, Semana a 10 por fila).
- **Mismo mundo, más grande**: ladrillos y cifras más grandes, menos texto, momentos de encaje al aprobarse un pedido o un bono. Sin emojis, sin rojo de castigo.
- Estructura: **tres pestañas** (Inicio, Pedir, Tareas); Avisos desde la campana de la barra superior. Seed key 54e2ca7c (dealt 3, 4, 7; elegida la carta que lideraba).
- Login en `/nino/entrar`, dos pasos (usuario, PIN), teclado numérico grande; el navegador **recuerda el usuario** (nunca el PIN).
- Pedir para empezar: **ladrillos de 10 + el resto** del disponible, sin teclear. Tiempo extra: **hasta 60 min** (6 ladrillos), con motivo obligatorio.
- Rediseño (2026-10-26): interfaz de videojuego, más ladrillo, modo oscuro y más logo. Elegida la opción **C, «Placa de construir»**, la misma que en `/padres`.

## Direction contract

THESIS: El niño lee su tiempo como baterías hechas de ladrillos con volumen, sobre una placa base, y pide armando ladrillos, no escribiendo números. Lo que todavía puede ganar se ve como placa vacía con sus pernos, esperando la pieza. Rechaza el panel infantil de la categoría: anillos de progreso, mascotas, estrellas y confeti de app de recompensas.

OWN-WORLD: La placa de construir de `/padres` a mayor escala: fondo de placa base con pernos, recuadros-placa con pernos en el borde, botones-ladrillo que se hunden, Baloo 2 en títulos y cifras, Nunito en el texto, claro y oscuro. Batería: marco grueso con borne y celdas-ladrillo; verde por usar, amarillo bono, punteado usado, placa con pernos por ganar. Azul Juego, magenta TV, naranja pausa, rojo solo cuando el tiempo se acaba. Pestaña activa en baldosa amarilla.

STORY: El niño abre la app y ve de inmediato si algo está corriendo, si ya puede empezar o cuántos ladrillos le quedan hoy y en la semana. Pide con dos toques, ve la respuesta con la nota de su papá o mamá y sabe qué tarea le da más ladrillos.

FIRST VIEWPORT: A 390 px: barra-placa con el ladrillo del logo a 40 px, «Hola, Mateo» en Baloo 2 y la campana como perno redondo. Si hay sesión, «Ahora» en placa del color de la actividad con la cuenta a 4.5rem en su baldosa y los ladrillos vaciándose; si está programada, «Faltan 12:05 para que puedas empezar». Si no, «Te quedan 35 min hoy» sobre la batería Hoy y la batería Semana, con su recarga, los bonos (amarillos y placa con pernos) y el ladrillo «Pedir tiempo». Abajo, tres pestañas en una placa, la activa en baldosa amarilla.

FORM: Placa de construir, la tercera carta de la ronda de tres opciones; la tirada asignó otra carta (seed key 77536baa) y el usuario eligió esta.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: «arma tu pedido». En Pedir, los ladrillos disponibles se muestran como una fila; tocar uno elige hasta ese (10, 20, 30… y el último vale lo que quede), y los elegidos se levantan y toman el color de la actividad. Al aprobarse, esos ladrillos encajan en la sesión; un bono aprobado encaja en amarillo en la batería de la semana. Los botones-ladrillo se hunden al tocarlos. Con reduced motion, el cambio es instantáneo.

## Briefs por pantalla (shape)

1. **Entrar** (`/nino/entrar`, pública). Paso 1 usuario, paso 2 PIN (el paso 1 se salta si el usuario está recordado, con «¿No eres …? Cambiar»). El PIN se ve como pernos que se llenan (6 huecos, crece hasta 12) y se teclea en un teclado 3×4 de teclas grandes (y con el teclado físico). Estados: enviando, no coinciden (sacudida corta), bloqueado (cuenta regresiva en vivo hasta poder probar, teclado desactivado, pista de pedir a un padre que cambie el PIN), demasiados intentos (esperar un minuto), sesión ya abierta (redirige). Enlace a `/login` para padres y desde `/login` hacia aquí.
2. **Inicio** (`/nino`). Orden: «Ahora» (en curso, en pausa, pasada o programada con cuenta regresiva a «¡Ya puedes empezar!», que suena) → tira del pedido pendiente o de la última respuesta de la última hora (con la nota) → baterías Hoy y Semana con bonos ganados frente al tope y cuándo se recarga cada una, y «Pedir tiempo» (o «Pedir tiempo extra» y «Gana más con tareas» con la cuota agotada) → oferta de avisos mientras estén apagados. Dos columnas en escritorio. Alarma en la pestaña al aviso y al fin.
3. **Pedir** (`/nino/pedir`). Sin pendiente: pasos 1 actividad, 2 cuánto (ladrillos tocables, tope en el disponible de su bolsa), 3 motivo (solo tiempo extra). Con la cuota agotada el flujo es «Tiempo extra» (hasta 60 min). Con pendiente: su caja de piezas, esperando, cuándo expira y «Cancelar pedido». Con sesión abierta: lo explica. Abajo, «Hoy»: pedidos del día con quién respondió, minutos y nota; un rechazo es neutro.
4. **Tareas** (`/nino/tareas`). Medidor de bonos (amarillos ganados + placa con pernos hasta el tope). Catálogo de tareas activas con premio en caja de piezas amarilla, máximo por semana y «¡La hice!» con nota opcional; «Esperando revisión» si ya está reportada; desactivada si llegó al máximo. «Tus reportes de esta semana» con estado y nota del padre.
5. **Avisos** (`/nino/avisos`). Qué llega (aviso previo con sus minutos, fin, ya puedes empezar, respuestas), activar/desactivar en este dispositivo, ayuda si está bloqueado o no es compatible, «Probar el sonido», **tema de este dispositivo (Automático, Claro, Oscuro)** y «Salir».

## Open decisions

- Ninguna abierta.
