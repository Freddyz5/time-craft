---
name: Time Craft
description: El tiempo de pantalla de un niño, armado y gastado en ladrillos, como en un manual de armado.
colors:
  page: "#dce7f0"
  sheet: "#ffffff"
  sheet-sunk: "#f2f6fa"
  rule: "#b9c9d7"
  rule-strong: "#6d8397"
  ink: "#15191e"
  ink-soft: "#46535f"
  ink-faint: "#5f6c78"
  balance: "#00852b"
  balance-tint: "#dcefe2"
  balance-ink: "#006622"
  bonus: "#f5cd2f"
  bonus-tint: "#fdf2c4"
  bonus-ink: "#6b5300"
  game: "#0055bf"
  game-tint: "#dde8f8"
  tv: "#9b2c7e"
  tv-tint: "#f5e1ef"
  pause: "#fe8a18"
  pause-tint: "#ffe9d2"
  pause-ink: "#8a4300"
  stop: "#c91a09"
  stop-tint: "#fbe2de"
  ghost: "#7a8fa3"
  focus: "#0055bf"
typography:
  display:
    fontFamily: "Rubik Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  step-number:
    fontFamily: "Rubik Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
  headline:
    fontFamily: "Rubik Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  headline-sm:
    fontFamily: "Rubik Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Rubik Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Rubik Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Rubik Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Rubik Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  callout: "12px"
  control: "10px"
  segment: "7px"
  pill: "9999px"
spacing:
  "1": "4px"
  "1.5": "6px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "{colors.sheet-sunk}"
  button-quiet:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "48px"
  button-pause:
    backgroundColor: "{colors.pause}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "48px"
  button-danger:
    backgroundColor: "{colors.stop}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "48px"
  button-sm:
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
  callout:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.callout}"
    padding: "16px"
  callout-pause:
    backgroundColor: "{colors.pause-tint}"
  callout-stop:
    backgroundColor: "{colors.stop-tint}"
  callout-bonus:
    backgroundColor: "{colors.bonus-tint}"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "48px"
  segmented:
    backgroundColor: "{colors.sheet-sunk}"
    rounded: "{rounded.control}"
    padding: "4px"
  segmented-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.segment}"
    height: "40px"
  activity-tag:
    textColor: "{colors.sheet}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  parts-box:
    backgroundColor: "{colors.sheet-sunk}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  tab-bar-item:
    textColor: "{colors.ink-faint}"
    typography: "{typography.caption}"
    height: "64px"
  tab-bar-item-active:
    textColor: "{colors.ink}"
---

# Design System: Time Craft

## Overview

**Creative North Star: "El manual de armado"**

Time Craft dibuja el tiempo como piezas de un manual de armado de ladrillos: un fondo azul pálido de manual, recuadros blancos de borde fino gris acero y tinta casi negra, y encima ladrillos de frente con sus pernos que llevan todo el color. Cada ladrillo vale 10 minutos. El saldo, la sesión en vivo, una solicitud o el premio de una tarea se leen contando ladrillos, sin leer párrafos. Los flujos de varios pasos se numeran como las páginas de un manual.

El sistema es denso pero tranquilo: el color vive en los ladrillos y en un puñado de estados, y los recuadros quedan blancos. Rechaza la estética del panel de control parental de la categoría: anillos de progreso, escudos y tarjetas grises con un único acento azul. Solo tema claro en la v1 (se usa en habitaciones iluminadas); los tokens separan tinta y fondo para poder sumar un tema oscuro sin rehacerlos.

La gramática es solo la de un manual de ladrillos genérico: no hay marcas, logos ni nombres de ninguna juguetera, y la paleta evoca colores de ladrillo sin citar a nadie.

**Key Characteristics:**
- Ladrillos de frente (dos pernos, 40×26) como única unidad visual de tiempo: 1 ladrillo = 10 min.
- Sólido = disponible; contorno punteado = usado; el ladrillo en uso se vacía desde arriba.
- Un trabajo por color: verde saldo, amarillo bonos, azul Juego, magenta TV, naranja pausa, rojo fin, exceso y acciones que cortan.
- Recuadros blancos de 12 px con borde de 1,5 px sobre azul pálido; sombra suave, nunca dura.
- Rubik en todo, cifras tabulares, números de paso en 800.
- Iconos Lucide de trazo 2.

## Colors

Una base fría de manual (azul pálido, blanco, gris acero, tinta casi negra) y seis colores de ladrillo saturados, cada uno con un solo trabajo.

### Primary
- **Verde Saldo** (balance): el tiempo todavía disponible. Ladrillos de Hoy y Semana en Inicio, el interruptor encendido, el aviso de éxito. Su tinta (balance-ink) y su tinte (balance-tint) sirven para texto y fondo de los avisos de éxito.

### Secondary
- **Amarillo Bono** (bonus): minutos ganados con tareas, en la pared de la semana, en la caja de piezas de un reporte y en el recuadro tintado de un reporte por revisar. También es el color de la marca (ladrillo 2×2 con una aguja de reloj), de los pernos de la pestaña activa y de la selección de texto. Texto sobre tinte amarillo: bonus-ink.
- **Azul Juego** (game) y **Magenta TV** (tv): los colores de actividad. Pintan los ladrillos de una sesión, la etiqueta de actividad en «Ahora» y el círculo del icono al elegir actividad. Una actividad sin color propio usa ink-soft con un icono genérico.

### Tertiary
- **Naranja Pausa** (pause): el botón Pausar, el recuadro de una sesión pausada (pause-tint con borde pause) y el titular de «pausada hace rato» (pause-ink).
- **Rojo Fin** (stop): la cuenta regresiva pasada de tiempo, los ladrillos de exceso, los errores y los botones que cortan. El tinte (stop-tint) es el fondo de recuadros y avisos de error.

### Neutral
- **Azul Manual** (page): el fondo de toda la app y el estado activo del riel lateral.
- **Hoja** (sheet): recuadros, barras y campos.
- **Hoja Hundida** (sheet-sunk): fondos de cajas internas (caja de piezas, código de recuperación, selector segmentado) y el hover de controles claros.
- **Regla** (rule) y **Regla Fuerte** (rule-strong): el borde de los recuadros y el borde de controles interactivos (botón secundario, campos, stepper).
- **Tinta** (ink), **Tinta Suave** (ink-soft), **Tinta Tenue** (ink-faint): texto principal, secundario (estados, leyendas, pistas) y terciario (placeholder, pestañas inactivas).
- **Fantasma** (ghost): el contorno punteado de un ladrillo usado.
- **Foco** (focus): anillo de foco de 3 px y cursor de texto; coincide con el azul de Juego.

### Named Rules
**The One Job Rule.** Cada color de ladrillo tiene un solo trabajo: verde saldo, amarillo bonos, azul Juego, magenta TV, naranja pausa, rojo fin, exceso y acciones que cortan. Un color nunca se usa como decoración ni para otro significado.

**The Red Is Earned Rule.** El rojo aparece solo cuando algo se acaba o se corta. «Detener» es un botón secundario mientras la sesión corre y pasa a rojo solo cuando se pasó del tiempo o la pausa ya es larga; en el diálogo de confirmación, la acción que corta va en rojo.

**The White Callout Rule.** Los recuadros son blancos; el tinte de un recuadro informa el único estado que reporta (pausa, fin, bono) y nada más.

## Typography

**Display Font:** Rubik Variable (autohospedada con @fontsource, con ui-sans-serif y system-ui de respaldo)
**Body Font:** Rubik Variable
**Label/Mono Font:** la misma, con cifras tabulares (`tabular`) en minutos, relojes, conteos y códigos.

**Character:** Una sola familia redondeada y amable, que va de 400 en el texto a 800 en la cuenta regresiva y los números de paso. El peso hace la jerarquía; no hay segunda familia.

### Hierarchy
- **Display** (800, 3.5rem, 1, -0.02em, tabular): la cuenta regresiva de «Ahora». Solo ahí.
- **Step number** (800, 2rem, 1, tabular): el número de paso de un flujo (Nueva sesión: 1 actividad, 2 minutos, 3 cuándo).
- **Headline** (700, 1.75rem, 1.25, -0.01em): el h1 de cada pantalla.
- **Headline sm** (700, 1.5rem, -0.01em): el titular del saldo («Le quedan 38 min hoy») y el h1 de las páginas públicas.
- **Title** (600, 1.25rem, 1.25): títulos de recuadro y de sección, títulos de paso y de diálogo.
- **Body** (400, 1rem, 1.5): texto corrido; etiquetas de campo y botones en 500.
- **Body sm** (400, 0.9375rem): pistas, errores de campo, estados bajo una fila de ladrillos.
- **Caption** (500 en pestañas, 400 en leyendas; 0.8125rem): las etiquetas de la barra de pestañas y la leyenda «1 ladrillo = 10 min».

### Named Rules
**The Tabular Figures Rule.** Toda cifra que cambia o se compara (minutos, relojes, conteos, PIN, código) lleva cifras tabulares para no bailar.

**The Sentence Case Rule.** Sin mayúsculas sostenidas ni espaciado ancho en etiquetas: el único tracking positivo es para el PIN y el código de recuperación, que se dictan carácter por carácter.

## Layout

Móvil primero desde 360 px. En el teléfono: barra superior blanca fija de 56 px (marca, nombre del niño y un botón circular «+» para nueva sesión), contenido con 16 px de margen lateral y barra de pestañas fija abajo (cinco pestañas de 64 px de alto, con el área segura). Desde 1024 px (lg) la barra se cambia por un riel lateral blanco de 16rem con la marca, el niño, «Nueva sesión» como botón y la navegación; el contenido gana 40 px de margen.

Anchos de lectura por pantalla: Inicio llega a 72rem (max-w-6xl) y en escritorio se parte en dos columnas (1.1fr / 1fr: «Ahora» y solicitudes a la izquierda, saldo a la derecha); Reglas, Historial y Bonos usan 48rem; Nueva sesión 42rem; las páginas públicas una columna de 25rem centrada.

Ritmo: la pila de recuadros de una pantalla va a 20 px; dentro de un recuadro, 16 px entre bloques y 8 px entre un rótulo y su fila de ladrillos. Padding de recuadro: 16 px en el teléfono, 20 px desde sm. Las filas de ladrillos son una rejilla de columnas iguales (6 a 12 por fila; la semana en 10 por fila) que se apilan como un muro.

## Elevation & Depth

Profundidad casi plana: los recuadros se separan del fondo azul por el borde de 1,5 px y una sombra ambiental muy suave; lo que flota (diálogos, toasts) lleva una sombra más larga. El volumen de verdad vive dentro de los ladrillos: borde superior iluminado, base sombreada y un filo oscuro translúcido, dibujados en el SVG, no con box-shadow.

### Shadow Vocabulary
- **Callout** (`box-shadow: 0 1px 0 rgb(21 25 30 / 0.04), 0 6px 18px -10px rgb(21 25 30 / 0.22)`): todo recuadro en reposo.
- **Lift** (`box-shadow: 0 2px 4px rgb(21 25 30 / 0.08), 0 14px 28px -14px rgb(21 25 30 / 0.35)`): diálogos de confirmación y toasts.

### Named Rules
**The Soft Paper Rule.** Las sombras son difusas y teñidas de tinta. Nada de sombras duras desplazadas: el relieve es del ladrillo, no del papel.

## Shapes

Esquinas suaves en dos tamaños: 12 px para recuadros, diálogos y toasts, 10 px para controles (botones, campos, stepper, segmentado, caja de piezas), 7 px para la opción interna del segmentado. Pastillas completas solo para la etiqueta de actividad, el botón «+» del teléfono, el selector de niño y el interruptor. Bordes siempre de 1,5 px. El borde punteado es semántico: significa «usado» en los ladrillos y «guárdalo, se muestra una vez» en la caja del código de recuperación.

La silueta propia es el ladrillo de frente con dos pernos; el medio ladrillo tiene un perno. Los pernos reaparecen fuera del ladrillo: dos pernos amarillos sobre la pestaña o fila de navegación activa.

## Components

### Buttons
Táctiles y directos, a la medida del pulgar.
- **Shape:** esquinas de control (10 px); 48 px de alto (40 px en tamaño pequeño), texto 500 con icono Lucide a la izquierda.
- **Primary:** tinta sólida con texto blanco, para la acción principal de cada recuadro (Aprobar, Empezar ya, Nueva sesión). Hover un gris más claro (#2a3038), activo negro.
- **Secondary:** blanco con borde regla fuerte; hover hoja hundida.
- **Quiet:** sin fondo ni borde («Ahora no», «Rechazar»).
- **Pause:** naranja con texto en tinta, solo para Pausar.
- **Danger:** rojo con texto blanco, solo para acciones que cortan cuando ya hace falta cortar.
- **Hover / Focus:** transición de color de 150 ms; foco con anillo de 3 px en azul foco y 2 px de separación. Ocupado: el icono cambia por un spinner.

### Chips
- **Etiqueta de actividad:** pastilla del color de la actividad, texto blanco 600 e icono (mando para Juego, televisor para TV).

### Cards / Containers
- **Corner Style:** 12 px.
- **Background:** hoja blanca; con tono, el tinte del único estado que reporta (pausa, fin, bono) y borde del color pleno.
- **Shadow Strategy:** sombra Callout (ver Elevation & Depth).
- **Border:** 1,5 px en regla.
- **Internal Padding:** 16 px, 20 px desde sm.

### Inputs / Fields
- **Style:** 48 px de alto, borde 1,5 px regla fuerte, fondo blanco, esquinas de 10 px; etiqueta 500 arriba y pista en body sm debajo.
- **Focus:** borde azul foco más un halo del 25 %.
- **Error / Disabled:** borde rojo y mensaje rojo con role="alert"; deshabilitado en hoja hundida y tinta tenue.
- **Stepper de minutos:** botones − y + de 48 px a los lados de un campo numérico centrado (600, 1.25rem) con «min» dentro.
- **Segmentado:** opciones de radio en una caja hundida; la elegida en tinta con texto blanco.
- **Interruptor:** pastilla de 52×32; encendido en verde saldo.

### Navigation
- **Teléfono:** barra de pestañas blanca fija abajo, icono de 24 px sobre etiqueta caption; activa en tinta con trazo 2.25 y dos pernos amarillos en el borde superior; inactiva en tinta tenue.
- **Escritorio:** riel lateral; fila activa sobre azul manual con los dos pernos amarillos asomando arriba; hover en hoja hundida.

### Ladrillo (signature)
SVG de 40×26 con dos pernos (uno en el medio ladrillo), filo translúcido y luces y sombras pintadas. Estados: sólido (disponible), vaciándose desde arriba (el ladrillo en uso, solo en cuentas en vivo), contorno punteado en gris fantasma (usado; en montos fijos ya gastados, punteado del color del monto) y rojo (exceso, redondeado hacia arriba). Las filas se arman en rejillas iguales con una leyenda «por usar / bono / usado» y el pie «1 ladrillo = N min». Movimiento: al gastarse un ladrillo, «soltar el ladrillo» (salto de 4 px hacia arriba, 180 ms, ease-out-quick); al entrar un ladrillo nuevo (un bono), encaje desde arriba en 260 ms; nunca en el primer pintado y nada con reduced motion. La carga es una torre de tres ladrillos (verde, amarillo, azul) que caen uno sobre otro.

### Caja de piezas (signature)
Como la lista de piezas de un paso del manual: caja hundida con «3×» ladrillos, «1×» medio ladrillo y «= 25 min» al lado. Se usa para lo que pide el niño y lo que vale una tarea.

### Paso numerado (signature)
Número de paso grande (800) a la izquierda del título del paso, con una pista debajo. Solo en flujos de varios pasos.

### Toasts y diálogos
Toasts en recuadro de 12 px con sombra Lift, abajo al centro en el teléfono (sobre las pestañas) y abajo a la derecha en escritorio; la alarma de aviso y fin va en tinta con borde rojo. Los diálogos de confirmación son `<dialog>` nativos de 26rem, con «Volver» secundario y la acción en rojo o tinta; entran con un ascenso corto de 260 ms.

## Do's and Don'ts

### Do:
- **Do** mostrar el tiempo en ladrillos de 10 min; si un límite no cabe en la fila, sube el valor del ladrillo (20, 30 o 60 min) y escribe «1 ladrillo = N min» en la leyenda.
- **Do** usar sólido para disponible, contorno punteado para usado y medio ladrillo de un perno para medio ladrillo en montos fijos (una solicitud, una tarea, el largo de una sesión).
- **Do** vaciar desde arriba solo el ladrillo en uso de una cuenta en vivo; los montos fijos no se vacían.
- **Do** redondear hacia abajo los minutos consumidos y hacia arriba los que le quedan a una sesión en curso, para que las cifras sumen.
- **Do** pintar el exceso con ladrillos rojos detrás de la fila, redondeados hacia arriba para que cualquier exceso se vea.
- **Do** dar a cada recuadro una sola acción primaria en tinta.
- **Do** acompañar cada fila de ladrillos con su texto (aria-label y cifra «38 min de 1 h»): el dibujo nunca es la única fuente del número.
- **Do** respetar reduced motion: los cambios de ladrillo son instantáneos.

### Don't:
- **Don't** usar anillos de progreso, escudos ni tarjetas grises con un acento azul: es el panel de control parental que este sistema rechaza.
- **Don't** usar el rojo para algo que no termine, se pase o corte.
- **Don't** usar un color de ladrillo fuera de su trabajo, ni como decoración.
- **Don't** nombrar ni imitar una marca de juguetes: solo la gramática del manual.
- **Don't** poner rótulos en mayúsculas espaciadas sobre los títulos ni sombras duras desplazadas.
- **Don't** usar emojis ni caracteres como iconos: los iconos son Lucide de trazo 2.
- **Don't** agregar un tema oscuro en la v1; si llega, se resuelve en los tokens, sin mezclar tinta y fondo.
