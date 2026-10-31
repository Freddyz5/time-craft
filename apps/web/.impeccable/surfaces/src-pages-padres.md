---
version: 1
slug: "src-pages-padres"
primary_target: "src/pages/padres"
related_targets: ["src/pages/login.astro","src/pages/recuperar.astro"]
---

# Área de padres (/padres) y páginas públicas (/login, /recuperar)

## Scope

- Modo: **Operate**. Los padres vienen a hacer algo y irse.
- Rutas: `/login`, `/recuperar` (públicas) y la isla React de `/padres` con enrutado interno: Inicio, Nueva sesión, Historial, Reglas, Bonos, Cuentas. `/` redirige según el rol.
- Escena física: un padre mira el teléfono Android en la cocina o la oficina iluminadas, y también en el sofá o en la cama de noche. Por eso hay **tema claro y oscuro**: sigue al del teléfono y se puede fijar a mano en Cuentas.
- Restricciones: 360 px de ancho mínimo, español con tuteo, salida estática, Tailwind 4, polling de 5 s en las vistas en vivo.

## Decisiones de shape (confirmadas por el usuario)

- En Inicio, las **solicitudes pendientes van arriba de todo**: expiran a los 15 min.
- Una sesión en pausa se destaca como «pausada hace rato» desde los **30 min**.
- **Un ladrillo = 10 min.** Si un límite es tan alto que la fila no cabe, el ladrillo vale más (20, 30 o 60 min) y la leyenda lo dice.
- Reglas: cuota global **y** límites opcionales por actividad, con historial de políticas (endpoint nuevo).
- Rediseño (2026-10-26): el usuario pidió una interfaz de videojuego, más presencia del ladrillo, modo oscuro y más presencia del logo. De tres opciones eligió la **C, «Placa de construir»**.

## Direction contract

THESIS: Toda la app está hecha de piezas de construir: el tiempo se arma y se gasta en ladrillos con volumen sobre una placa base, y cada recuadro, botón y pestaña es una pieza. Rechaza el panel de control parental (anillos, escudos, tarjetas grises con un acento azul) y el manual plano de la versión anterior.

OWN-WORLD: Fondo de placa base con pernos (gris claro de día, carbón de noche). Recuadros como placas de plástico con una fila de pernos en el borde superior y un canto de 6 px abajo. Botones como ladrillos con dos pernos que se hunden al tocarlos. «Ahora» en una placa del color de la actividad, con la cuenta en una baldosa impresa y la sesión como torre de ladrillos. Baloo 2 en títulos y cifras, Nunito en el texto. Verde saldo, amarillo bono y marca, azul Juego, magenta TV, naranja pausa, rojo fin. Los dos temas salen de los mismos tokens.

STORY: El padre abre la app y ve si hay algo que responder, qué está corriendo y cuántos ladrillos le quedan al niño hoy y en la semana. Pausa, detiene o aprueba con un toque, y confía en que el otro padre ve lo mismo.

FIRST VIEWPORT: A 390 px, una barra-placa con el ladrillo amarillo del logo a 40 px, «Time Craft», el nombre del niño y un perno redondo «+». Si hay solicitudes, van primero. Luego «Ahora»: placa azul de Juego (magenta de TV) con 12:59 en su baldosa a 4.5rem, la torre de la sesión al lado, «Termina a las 19:46» y los ladrillos Pausar (naranja) y Detener (blanco). Debajo, «Le quedan 38 min hoy» con Hoy y Semana en ladrillos con volumen. Abajo, la barra de pestañas es una placa con pernos y la activa es una baldosa amarilla. En escritorio, riel lateral de placa y dos columnas.

FORM: Placa de construir, la tercera carta de la ronda de tres opciones; la tirada asignó otra carta (seed key 77536baa) y el usuario eligió esta.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: «la pieza que se hunde». Cada botón es un ladrillo: al tocarlo baja 3 px y su canto se achica, como una pieza que encaja. El ladrillo en uso se vacía desde arriba y, al gastarse, se suelta (salto corto) y queda punteado. Al aprobar un bono, sus ladrillos amarillos encajan en la semana. Con reduced motion, todo es instantáneo.

## Briefs por pantalla (shape)

1. **Login** (`/login`, pública). Un padre entra en segundos. Primero «Continuar con Google» (solo si el entorno lo tiene) y debajo correo + contraseña. Estados: enviando, credenciales incorrectas, demasiados intentos, Google con un correo que no es de un padre (`?error=`). Con sesión ya abierta, redirige. Tiene un enlace al código de recuperación. Una columna de 400 px como máximo, con la marca y una fila corta de ladrillos como único adorno.
2. **Inicio** (`/padres`). Orden: aviso de pausa larga (≥30 min) → solicitudes pendientes, que se aprueban dentro del mismo recuadro (minutos con un selector que no pasa de lo pedido, empezar ahora o a una hora de hoy, nota opcional) o se rechazan con nota → «Ahora»: sesión en vivo (pausar, reanudar, detener con confirmación) o programada (adelantar, cancelar) o vacío con «Nueva sesión» → saldo en ladrillos por bolsa (global y por actividad): hoy, semana con bonos en amarillo y cuándo se recarga → reportes de tareas (aprobar con minutos o rechazar con nota). Si este teléfono no tiene avisos, una tarjeta tranquila para activarlos. Consulta cada 5 s y suena y vibra al aviso y al fin; mientras esté por delante, una placa bajo «Ahora» dice si la pestaña puede sonar («La alarma está sin sonido» con «Activar sonido» hasta el primer toque; en la computadora, «La alarma suena en esta pestaña»: déjala abierta en Inicio).
3. **Nueva sesión** (`/padres/sesion`). Pasos numerados: 1 actividad, 2 minutos (selector más atajos de 15, 30, 45 y 60, con tope en lo disponible de su bolsa, en ladrillos), 3 cuándo (ahora o una hora de hoy). Con la cuota agotada, el flujo pasa a «Tiempo extra», con motivo obligatorio (override). Si ya hay una sesión abierta, lo explica y lleva a Inicio.
4. **Reglas** (`/padres/reglas`). Cuota global: diario, semanal, tope de bonos, aviso previo y «el exceso se descuenta del día siguiente». Límites por actividad: cada actividad usa la cuota global o tiene los suyos. Historial de políticas, de la más nueva a la más vieja, con quién y cuándo. Guardar crea una política nueva y aplica a toda la semana, y la pantalla lo dice.
5. **Bonos** (`/padres/bonos`). Catálogo: activas primero, desactivadas plegadas. Se crea y se edita en el mismo lugar (nombre, descripción, minutos, máximo por semana). Desactivar pide confirmación.
6. **Cuentas** (`/padres/cuentas`). Niño: crear la cuenta (nombre, usuario, PIN) si no existe; si existe, restablecer el PIN (también lo desbloquea), ver si está bloqueado y ver o cerrar sus dispositivos, uno a uno o todos. Otro padre: restablecer su contraseña. Yo: cambiar mi contraseña, avisos en este dispositivo, **sonido de este dispositivo** (uno por alarma, de una lista en grupos Suaves, Alarmas y De videojuego: quedan pocos minutos, se acabó, solicitudes y tareas; decir el aviso en voz alta, con la voz a elegir; volumen; repetir el fin hasta tocar la pantalla; la pista de dejar Time Craft abierto en la computadora), **tema de este dispositivo (Automático, Claro, Oscuro)**, cerrar sesión. Código de recuperación: cuándo se creó y regenerarlo con confirmación; el código se muestra una sola vez, con copiar.
7. **Historial** (`/padres/historial`). Semana actual por defecto, con flechas a semanas anteriores. Uso por actividad en ladrillos, sesiones agrupadas por día (horas, consumido, cómo terminó, pausas, si usó tiempo extra), tiempo extra dado con su motivo, solicitudes rechazadas (más las expiradas y canceladas, aparte) y reportes revisados.
8. **Recuperar** (`/recuperar`, pública). Correo, código y nueva contraseña dos veces. Al terminar muestra el código nuevo una sola vez, con copiar y el aviso de guardarlo, y lleva al login. El límite de intentos se explica sin culpas.

## Open decisions

- Ninguna abierta. El tema por defecto sigue al del sistema; la elección manual se guarda en el dispositivo.
