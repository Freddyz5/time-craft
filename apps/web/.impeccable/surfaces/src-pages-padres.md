---
version: 1
slug: "src-pages-padres"
primary_target: "src/pages/padres"
related_targets: ["src/pages/login.astro","src/pages/recuperar.astro"]
---

# Área de padres (/padres) y páginas públicas (/login, /recuperar)

## Scope

- Modo: **Operate**. Los padres vienen a hacer algo y irse.
- Rutas: `/login`, `/recuperar` (públicas) y la isla React de `/padres` con enrutado interno: Inicio, Nueva sesión, Historial, Reglas, Bonos, Cuentas. `/` redirige según el rol. `/nino` queda como página mínima hasta la Fase 5b, que reutiliza esta base y este mundo.
- Escena física: un padre mira el teléfono Android en la cocina o la oficina iluminadas, a veces en el sofá de noche. Por eso el tema es **claro** (sin modo oscuro en la v1).
- Restricciones: 360 px de ancho mínimo, español con tuteo, salida estática, Tailwind 4, polling de 5 s en las vistas en vivo.

## Decisiones de shape (confirmadas por el usuario)

- En Inicio, las **solicitudes pendientes van arriba de todo**: expiran a los 15 min.
- Una sesión en pausa se destaca como «pausada hace rato» desde los **30 min**.
- **Un ladrillo = 10 min.** Si un límite es tan alto que la fila no cabe, el ladrillo vale más (20, 30 o 60 min) y la leyenda lo dice.
- Reglas: cuota global **y** límites opcionales por actividad, con historial de políticas (endpoint nuevo).

## Direction contract

THESIS: El tiempo de pantalla se arma y se gasta en ladrillos, como en un manual de armado: cada ladrillo son 10 minutos, los flujos son pasos numerados y todo se entiende casi sin leer. Rechaza el panel de control parental de la categoría: anillos de progreso, escudos y tarjetas grises con un acento azul.

OWN-WORLD: Fondo azul pálido de manual, recuadros blancos de borde fino gris azulado y esquinas de 12 px, tinta casi negra. Ladrillos de frente con sus pernos: sólido es tiempo disponible y contorno punteado es tiempo ya usado. Cada color tiene un trabajo: verde el saldo, amarillo los bonos, azul Juego, magenta TV, naranja la pausa, rojo el fin, el exceso y las acciones que cortan. Rubik autohospedada en todo, cifras tabulares, números de paso en 800. Iconos Lucide de trazo 2.

STORY: El padre abre la app y ve si hay algo que responder, qué está corriendo y cuántos ladrillos le quedan al niño hoy y en la semana. Pausa, detiene o aprueba con un toque, y confía en que el otro padre ve lo mismo.

FIRST VIEWPORT: A 360 px, arriba hay una barra blanca con la marca (ladrillo 2×2 amarillo), «Time Craft» y el nombre del niño. Si hay solicitudes, van primero, como recuadros de piezas («Pide 3 ladrillos · Juego»). Luego viene «Ahora»: la actividad, una cuenta regresiva grande, la fila de ladrillos de la sesión colocándose y los botones Pausar y Detener. Si no hay sesión, ese bloque lleva «Nueva sesión» como acción primaria. Debajo, Hoy y Semana como filas de ladrillos con «le quedan 40 min», y abajo las pestañas. En escritorio hay un riel lateral y dos columnas.

FORM: Manual de armado de ladrillos, dirección fijada por el usuario en la segunda tirada (registro audaz), fuera de mi lista ordenada; seed key 29e4144a.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: «soltar el ladrillo». Cada 10 minutos consumidos, el ladrillo en uso se desprende: pasa de sólido a contorno con un salto corto hacia arriba (180 ms, ease-out). El ladrillo en curso se va vaciando de a poco. Al aprobar un bono, sus ladrillos amarillos se encajan en la semana. Con reduced motion, el cambio es instantáneo.

## Briefs por pantalla (shape)

1. **Login** (`/login`, pública). Un padre entra en segundos. Primero «Continuar con Google» (solo si el entorno lo tiene) y debajo correo + contraseña. Estados: enviando, credenciales incorrectas, demasiados intentos, Google con un correo que no es de un padre (`?error=`). Con sesión ya abierta, redirige. Tiene un enlace al código de recuperación. Una columna de 400 px como máximo, con la marca y una fila corta de ladrillos como único adorno.
2. **Inicio** (`/padres`). Orden: aviso de pausa larga (≥30 min) → solicitudes pendientes, que se aprueban dentro del mismo recuadro (minutos con un selector que no pasa de lo pedido, empezar ahora o a una hora de hoy, nota opcional) o se rechazan con nota → «Ahora»: sesión en vivo (pausar, reanudar, detener con confirmación) o programada (adelantar, cancelar) o vacío con «Nueva sesión» → saldo en ladrillos por bolsa (global y por actividad): hoy, semana con bonos en amarillo y cuándo se recarga → reportes de tareas (aprobar con minutos o rechazar con nota). Si este teléfono no tiene avisos, una tarjeta tranquila para activarlos. Consulta cada 5 s y suena y vibra al aviso y al fin.
3. **Nueva sesión** (`/padres/sesion`). Pasos numerados: 1 actividad, 2 minutos (selector más atajos de 15, 30, 45 y 60, con tope en lo disponible de su bolsa, en ladrillos), 3 cuándo (ahora o una hora de hoy). Con la cuota agotada, el flujo pasa a «Tiempo extra», con motivo obligatorio (override). Si ya hay una sesión abierta, lo explica y lleva a Inicio.
4. **Reglas** (`/padres/reglas`). Cuota global: diario, semanal, tope de bonos, aviso previo y «el exceso se descuenta del día siguiente». Límites por actividad: cada actividad usa la cuota global o tiene los suyos. Historial de políticas, de la más nueva a la más vieja, con quién y cuándo. Guardar crea una política nueva y aplica a toda la semana, y la pantalla lo dice.
5. **Bonos** (`/padres/bonos`). Catálogo: activas primero, desactivadas plegadas. Se crea y se edita en el mismo lugar (nombre, descripción, minutos, máximo por semana). Desactivar pide confirmación.
6. **Cuentas** (`/padres/cuentas`). Niño: crear la cuenta (nombre, usuario, PIN) si no existe; si existe, restablecer el PIN (también lo desbloquea), ver si está bloqueado y ver o cerrar sus dispositivos, uno a uno o todos. Otro padre: restablecer su contraseña. Yo: cambiar mi contraseña, avisos en este dispositivo, cerrar sesión. Código de recuperación: cuándo se creó y regenerarlo con confirmación; el código se muestra una sola vez, con copiar.
7. **Historial** (`/padres/historial`). Semana actual por defecto, con flechas a semanas anteriores. Uso por actividad en ladrillos, sesiones agrupadas por día (horas, consumido, cómo terminó, pausas, si usó tiempo extra), tiempo extra dado con su motivo, solicitudes rechazadas (más las expiradas y canceladas, aparte) y reportes revisados.
8. **Recuperar** (`/recuperar`, pública). Correo, código y nueva contraseña dos veces. Al terminar muestra el código nuevo una sola vez, con copiar y el aviso de guardarlo, y lleva al login. El límite de intentos se explica sin culpas.

## Open decisions

- Sin modo oscuro en la v1 (escena con luz). Si se pide, los tokens ya separan la tinta del fondo.
