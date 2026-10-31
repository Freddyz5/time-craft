---
name: Time Craft
description: El tiempo de pantalla de un niño, armado y gastado en ladrillos sobre una placa de construir, de día y de noche.
colors:
  page: "#dde2e9"
  page-stud: "#e7eaef"
  page-rim: "#cdd3dc"
  sheet: "#ffffff"
  sheet-side: "#c2c9d4"
  sheet-sunk: "#eef1f5"
  raised: "#ffffff"
  raised-side: "#aeb6c2"
  rule: "#d3d9e2"
  rule-strong: "#7d8796"
  ink: "#171a20"
  ink-side: "#000000"
  ink-soft: "#454d5a"
  ink-faint: "#5a6372"
  on-ink: "#ffffff"
  balance: "#1f9a45"
  balance-tint: "#dcf1e2"
  balance-ink: "#146c30"
  bonus: "#ffc800"
  bonus-side: "#b38c00"
  bonus-tint: "#fff3c4"
  bonus-ink: "#6b5300"
  game: "#2468d6"
  game-side: "#164a9e"
  game-tint: "#dfe9fa"
  tv: "#c2338f"
  tv-side: "#8a1f63"
  tv-tint: "#f8e1f0"
  pause: "#ff8c1a"
  pause-side: "#b35c00"
  pause-tint: "#ffe9d2"
  pause-ink: "#8a4300"
  stop: "#d82626"
  stop-side: "#8f1414"
  on-stop: "#ffffff"
  stop-tint: "#fbe2de"
  stop-ink: "#8f1414"
  ghost: "#9aa3b2"
  socket: "#cfd6df"
  focus: "#1f66d1"
  page-dark: "#1b1e24"
  page-stud-dark: "#242830"
  page-rim-dark: "#16181d"
  sheet-dark: "#2a2e36"
  sheet-side-dark: "#121418"
  sheet-sunk-dark: "#1f2228"
  raised-dark: "#3a3f49"
  raised-side-dark: "#15171b"
  rule-dark: "#3c414c"
  rule-strong-dark: "#79808e"
  ink-dark: "#f3f4f7"
  ink-side-dark: "#a3a9b4"
  ink-soft-dark: "#b8bfcb"
  ink-faint-dark: "#98a0ae"
  on-ink-dark: "#16191f"
  balance-dark: "#2fb355"
  balance-tint-dark: "#183323"
  balance-ink-dark: "#74d891"
  bonus-dark: "#ffcd1a"
  bonus-side-dark: "#a37f00"
  bonus-tint-dark: "#3a3214"
  bonus-ink-dark: "#ffd95a"
  game-dark: "#2f72dc"
  game-side-dark: "#1a4aa0"
  game-tint-dark: "#1d2a44"
  tv-dark: "#c93a96"
  tv-side-dark: "#7d1f5d"
  tv-tint-dark: "#3a1f33"
  pause-dark: "#ff9a2e"
  pause-side-dark: "#a85500"
  pause-tint-dark: "#3d2a14"
  pause-ink-dark: "#ffb866"
  stop-dark: "#ff6b6b"
  stop-side-dark: "#a32424"
  on-stop-dark: "#2a0505"
  stop-tint-dark: "#3d1a1a"
  stop-ink-dark: "#ff8a8a"
  ghost-dark: "#6a7180"
  socket-dark: "#3d424d"
  focus-dark: "#7aaeff"
  plastic-white: "#ffffff"
typography:
  display:
    fontFamily: "Baloo 2 Variable, ui-rounded, ui-sans-serif, system-ui, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  display-sm:
    fontFamily: "Baloo 2 Variable, ui-rounded, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
  hero:
    fontFamily: "Baloo 2 Variable, ui-rounded, ui-sans-serif, system-ui, sans-serif"
    fontSize: "4.25rem"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Baloo 2 Variable, ui-rounded, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1.25
  headline-sm:
    fontFamily: "Baloo 2 Variable, ui-rounded, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.25
  title:
    fontFamily: "Baloo 2 Variable, ui-rounded, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.25
  title-sm:
    fontFamily: "Baloo 2 Variable, ui-rounded, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Nunito Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Nunito Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Nunito Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.5
  caption:
    fontFamily: "Nunito Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    lineHeight: 1.4
rounded:
  segment: "6px"
  control: "8px"
  callout: "10px"
  battery: "14px"
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
    textColor: "{colors.on-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
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
    textColor: "{colors.on-stop}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "48px"
  button-light:
    backgroundColor: "{colors.plastic-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "48px"
  button-quiet:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "48px"
  button-sm:
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
  plate:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.callout}"
    padding: "16px"
  plate-pause:
    backgroundColor: "{colors.pause-tint}"
  plate-stop:
    backgroundColor: "{colors.stop-tint}"
  plate-balance:
    backgroundColor: "{colors.balance-tint}"
  plate-game:
    backgroundColor: "{colors.game}"
    textColor: "{colors.plastic-white}"
  plate-tv:
    backgroundColor: "{colors.tv}"
    textColor: "{colors.plastic-white}"
  input-slot:
    backgroundColor: "{colors.sheet-sunk}"
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
    textColor: "{colors.on-ink}"
    rounded: "{rounded.segment}"
    height: "40px"
  tile-on:
    backgroundColor: "{colors.bonus}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  tab-bar-item:
    textColor: "{colors.ink-faint}"
    typography: "{typography.caption}"
    height: "72px"
  tab-bar-item-child:
    textColor: "{colors.ink-faint}"
    height: "80px"
  step-tile:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.control}"
    size: "40px"
  battery:
    backgroundColor: "{colors.sheet-sunk}"
    rounded: "{rounded.battery}"
    padding: "10px 8px 8px"
  parts-box:
    backgroundColor: "{colors.sheet-sunk}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  pin-key:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "64px"
  activity-tag:
    textColor: "{colors.plastic-white}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
---

# Design System: Time Craft

## Overview

**Creative North Star: "La placa de construir"**

Toda la app está hecha de piezas de construir. El suelo es una placa base con pernos en una rejilla de 24 px (gris claro de día, carbón de noche); cada recuadro es una placa de plástico con una fila de pernos en el borde superior y un canto de 6 px abajo; cada botón es un ladrillo con dos pernos que se hunde al tocarlo. El tiempo se arma y se gasta en ladrillos con volumen: cada ladrillo vale 10 minutos, y el saldo, la sesión en vivo, una solicitud o el premio de una tarea se leen contando ladrillos, sin leer párrafos.

El color vive en los ladrillos y en las placas que informan un estado; las demás placas son de plástico neutro. «Ahora», mientras corre una sesión, es la única placa grande de color: la del color de su actividad, con la cuenta impresa en una baldosa oscura y la sesión como torre de ladrillos blancos. El sistema rechaza el panel de control parental de la categoría (anillos de progreso, escudos, tarjetas grises con un único acento azul) y el manual plano de la versión anterior.

Hay dos temas, claro y oscuro, que salen de los mismos tokens: el oscuro redefine cada valor bajo `[data-theme="dark"]` y nunca agrega piezas propias. Por defecto sigue al sistema; cada dispositivo elige Automático, Claro u Oscuro, y el tema se aplica antes del primer pintado. La gramática es la de unas piezas de construir genéricas: sin marcas, logos ni nombres de ninguna juguetera. El área del niño es la misma placa a mayor escala.

**Key Characteristics:**
- Placa base con pernos bajo todo; recuadros como placas con pernos arriba y canto de 6 px abajo.
- Botones-ladrillo con dos pernos que bajan 3 px al tocarlos mientras el canto se achica de 4 px a 1 px.
- Ladrillos de frente (40×26, dos pernos) como única unidad visual de tiempo: 1 ladrillo = 10 min.
- Sólido = disponible; contorno punteado = usado; el ladrillo en uso se vacía desde arriba; la tira de placa con sus pernos = lo que todavía se puede ganar.
- Un trabajo por color: verde saldo, amarillo bono y marca, azul Juego, magenta TV, naranja pausa, rojo fin.
- Baloo 2 en títulos y cifras, Nunito en el texto; cifras tabulares.
- Claro y oscuro desde los mismos tokens.
- Iconos Lucide de trazo 2.

## Colors

Una base neutra de plástico gris (placa base, placas blancas o carbón, tinta) y seis colores de ladrillo saturados, cada uno con un solo trabajo. Cada color de ladrillo tiene su canto (`-side`, el plástico en sombra), su tinte (fondo de una placa que informa) y, cuando lleva texto, su tinta (`-ink`). Los valores de los dos temas están en el frontmatter: la clave sin sufijo es el tema claro; la clave con `-dark` es el mismo token en el tema oscuro.

### Primary
- **Verde Saldo** (balance): el tiempo todavía disponible. Los ladrillos de Hoy y Semana, el interruptor encendido, el aviso de éxito y, del lado del niño, la placa tintada de un «sí» a su pedido (balance-tint con canto balance). balance-ink para texto sobre su tinte.

### Secondary
- **Amarillo Bono** (bonus): minutos ganados con tareas (la cola amarilla del muro de la semana, el medidor de bonos, la caja de piezas de un reporte, la placa de un reporte por revisar) y el color de la marca: el ladrillo del logo, la baldosa de la pestaña activa, los pernos que se llenan en el PIN del niño y la selección de texto. Su canto (bonus-side) da el volumen de la baldosa activa.
- **Azul Juego** (game) y **Magenta TV** (tv): los colores de actividad. Pintan los ladrillos de una sesión, la etiqueta de actividad y, mientras la sesión corre, toda la placa de «Ahora» (cara del color, canto `-side`). Una actividad sin color propio usa ink-soft en sus ladrillos.

### Tertiary
- **Naranja Pausa** (pause): el ladrillo Pausar y la placa de una sesión en pausa (pause-tint con canto pause); pause-ink para el titular de «pausada hace rato».
- **Rojo Fin** (stop): la cuenta pasada de tiempo, los ladrillos de exceso, los errores, el borde de la alarma y los ladrillos que cortan. stop-tint con canto stop es la placa de un error o un fin; stop-ink su texto. En oscuro el rojo sube a coral (#ff6b6b) con tinta oscura encima (on-stop).

### Neutral
- **Placa Base** (page, page-stud, page-rim): el suelo de toda la app, con su perno y el aro del perno.
- **Placa** (sheet, sheet-side): la cara y el canto de cada recuadro, barra superior, riel y barra de pestañas. En oscuro, la placa (#2a2e36) es más clara que el suelo y su canto casi negro.
- **Placa Hundida** (sheet-sunk): el fondo de lo que está metido en la placa: campos, selector segmentado, batería, caja de piezas, código de recuperación; también el hover de filas y botones sin fondo.
- **Plástico Elevado** (raised, raised-side): la cara y el canto del ladrillo secundario, las teclas del PIN y el perno redondo de la barra (el «+» con sesión abierta, la campana del niño).
- **Regla** (rule) y **Regla Fuerte** (rule-strong): el contorno fino del ladrillo secundario y las divisiones; el borde de campos, del segmentado y de los pernos vacíos.
- **Tinta** (ink, ink-side, on-ink): texto principal y el ladrillo primario (en oscuro, la tinta es casi blanca y el ladrillo primario se vuelve claro con texto oscuro). **Tinta Suave** (ink-soft) para texto secundario, **Tinta Tenue** (ink-faint) para placeholder y pestañas inactivas.
- **Fantasma** (ghost): el contorno punteado de un ladrillo usado.
- **Hueco** (socket): la tira de placa con pernos de un lugar por ganar.
- **Foco** (focus): el anillo de foco de 3 px y el cursor de texto. Sobre una placa de color, el foco pasa a blanco.
- **Plástico Blanco** (plastic-white): blanco fijo en los dos temas, solo sobre una placa de color: el texto de «Ahora» en curso, su etiqueta de actividad invertida, los ladrillos de su torre y el ladrillo Detener (ladrillo claro, canto #aeb6c2).

### Named Rules
**The One Job Rule.** Cada color de ladrillo tiene un solo trabajo: verde saldo, amarillo bono y marca, azul Juego, magenta TV, naranja pausa, rojo fin, exceso y acciones que cortan. Un color nunca se usa como decoración ni para otro significado.

**The Red Is Earned Rule.** El rojo aparece solo cuando algo se acaba o se corta. «Detener» es un ladrillo blanco (sobre la placa de color) o secundario mientras la sesión corre a tiempo, y pasa a rojo solo cuando se pasó del tiempo o la pausa ya es larga; en el diálogo de confirmación, la acción que corta va en rojo.

**The One State Plate Rule.** Una placa es neutra; su cara y su canto se tiñen solo para el único estado que reporta (pausa, fin, bono, el «sí» del niño) y, mientras corre, «Ahora» toma el color de su actividad. Ninguna otra placa lleva color de fondo.

**The Same Tokens Rule.** Los dos temas son los mismos tokens con otro valor. Ningún componente usa un color fijo que no cambie con el tema, salvo el blanco sobre una placa de color y la tinta oscura sobre una cara amarilla o naranja (la baldosa activa, el ladrillo Pausar).

**The Calm No Rule.** Del lado del niño, el rojo queda para dos cosas: el fin de su sesión («¡Se acabó!») y el PIN que no coincide. Un «no» a su pedido o a su tarea es una placa neutra; el bloqueo del PIN es una caja hundida con su cuenta en tinta; un motivo que falta se dice en tinta con un icono de ayuda.

## Typography

**Display Font:** Baloo 2 Variable (autohospedada con @fontsource-variable, con ui-rounded, ui-sans-serif y system-ui de respaldo)
**Body Font:** Nunito Variable (autohospedada con @fontsource-variable, con ui-sans-serif y system-ui de respaldo)

**Character:** Baloo 2 es redonda y pesada, como letras moldeadas en plástico: va en todo h1, h2 y h3, en las cifras grandes y en la marca. Nunito es redonda y abierta para leer: el texto corrido, las etiquetas y los botones, estos en 700.

### Hierarchy
- **Display** (Baloo 2 800, 4.5rem, 1, -0.02em, tabular): las cuentas regresivas de «Ahora» (padres y niño) y «Faltan» del niño. Solo ahí.
- **Display sm** (Baloo 2 800, 3.5rem, 1, -0.02em): «¡Se acabó!» del niño, en rojo.
- **Hero** (Baloo 2 800, 2.75rem en el teléfono, 3.5rem desde sm, 4.25rem desde lg, 1.02, -0.02em): solo el h1 de la landing.
- **Headline** (Baloo 2 800, 2rem, 1.25): el h1 de cada pantalla con pestañas y los h2 de la landing (2.5rem desde sm); también las cifras de las teclas del PIN.
- **Headline sm** (Baloo 2 800, 1.75rem, 1.25): el h1 de las páginas públicas y de Inicio, y el titular del saldo («Le quedan 38 min hoy», 2rem desde sm cuando es el titular principal del niño).
- **Title** (Baloo 2 700, 1.375rem, 1.25): títulos de placa y de sección, títulos de paso, de diálogo y el número de paso en su baldosa.
- **Title sm** (Baloo 2 700, 1.25rem): «Hoy», «Semana» y «Bonos de la semana» sobre sus baterías.
- **Body** (Nunito 400, 1rem, 1.5): texto corrido; etiquetas de campo en 600.
- **Body sm** (Nunito 400, 0.9375rem): pistas, errores de campo, leyendas y estados bajo una fila de ladrillos.
- **Label** (Nunito 700, 1rem): botones, filas de navegación y la etiqueta de actividad.
- **Caption** (Nunito 700, 0.8125rem): las etiquetas de la barra de pestañas de los padres (0.875rem del lado del niño) y «1 ladrillo = N min».

### Named Rules
**The Tabular Figures Rule.** Toda cifra que cambia o se compara (minutos, relojes, conteos, PIN, código, número de paso) lleva cifras tabulares para no bailar.

**The Moulded Titles Rule.** Los títulos y las cifras grandes van en Baloo 2; el texto que se lee, en Nunito. Nunca Baloo 2 en un párrafo ni Nunito en una cuenta.

**The Same World, Larger Rule.** El niño usa las mismas familias, colores y piezas, un paso más grandes: pestañas de 80 px con iconos de 28 px y etiqueta de 0.875rem, teclas del PIN de 64 px con cifras de 2rem. Nunca una familia, un color o una pieza propios.

**The Sentence Case Rule.** Sin mayúsculas sostenidas ni espaciado ancho en etiquetas; el único tracking es el negativo de los títulos grandes.

## Layout

Móvil primero desde 360 px, con un salto en lg (1024 px) y sm (640 px) para el padding.

**Padres.** En el teléfono: barra-placa superior fija de 64 px (marca con el ladrillo de 40 px, nombre del niño y un perno redondo «+» de 44 px), contenido con 16 px de margen lateral y barra de pestañas fija abajo (cinco pestañas de 72 px, en una franja de hasta 32rem, con el área segura). Desde lg, un riel-placa lateral de 17rem con la marca, el niño, «Nueva sesión» como ladrillo y la navegación; el contenido gana 40 px de margen.

**Niño.** Barra-placa superior fija de 64 px (72 px desde lg) con el ladrillo del logo, «Hola, Mateo» en Baloo 2 y la campana como perno redondo. Abajo, tres pestañas de 80 px (Inicio, Pedir, Tareas). Desde lg no hay riel: las pestañas suben a la barra como filas de 44 px, en una franja de 64rem.

Anchos: Inicio de los padres llega a 72rem y en escritorio se parte en dos columnas (1.1fr / 1fr); las demás pantallas usan columnas de 36rem a 48rem; las públicas una columna de 25rem. Del lado del niño, una columna de 36rem; con algo en «Ahora», Inicio se parte en 1.1fr / 1fr con las baterías a la derecha. La landing usa 72rem con un héroe de 1.05fr / 1fr.

Ritmo: la pila de placas de una pantalla va a 20 px (más que el canto de 6 px y los pernos de 7 px, para que nunca se toquen); dentro de una placa, 16 px entre bloques y 8 px entre un rótulo y su fila de ladrillos. Padding de placa: 16 px en el teléfono, 20 px desde sm. Las filas de ladrillos son rejillas de columnas iguales que se apilan como un muro; la torre de la sesión apila columnas de tres ladrillos, cada uno sobre los pernos del de abajo.

## Elevation & Depth

La profundidad es física y de plástico: no hay sombras flotantes de interfaz, hay cantos. Cada pieza tiene una cara y un canto sólido debajo, del color `-side` de su cara, y la sombra difusa solo la apoya sobre el suelo. Lo hundido (campos, segmentado, batería, baldosa de la cuenta) lleva una sombra interior bajo su borde superior. Lo que se toca baja: un ladrillo baja 3 px y su canto se achica, como una pieza que encaja.

### Shadow Vocabulary
- **Plate** (`box-shadow: inset 0 2px 0 rgb(255 255 255 / 0.06), 0 6px 0 var(--plate-side), 0 18px 28px -16px var(--color-shadow)`): toda placa, diálogos incluidos. Los pernos son una fila de 8 px enmascarada sobre el borde superior, del color de la cara.
- **Bar** (`box-shadow: 0 4px 0 var(--color-sheet-side), 0 12px 20px -14px var(--color-shadow)`): la barra superior (el riel lo lleva a la derecha; la barra de pestañas lleva solo la sombra, con los pernos arriba).
- **Brick** (`box-shadow: inset 0 2px 0 rgb(255 255 255 / 0.3), 0 4px 0 var(--brick-side)`; presionado `0 1px 0` con `translateY(3px)`): todo botón-ladrillo.
- **Tile** (`box-shadow: inset 0 2px 0 rgb(255 255 255 / 0.45), 0 3px 0 var(--color-bonus-side)`): la baldosa amarilla activa; con `0 3px 0 var(--color-ink-side)`, la baldosa de tinta del número de paso y la opción elegida del segmentado.
- **Slot** (`box-shadow: inset 0 2px 0 rgb(0 0 0 / 0.07)`): campos y segmentado.
- **Lift** (`box-shadow: 0 4px 0 var(--color-sheet-side), 0 22px 40px -16px var(--color-shadow)`): los toasts; la alarma cambia el canto a rojo.

### Named Rules
**The Plastic Edge Rule.** El volumen es un canto sólido del color en sombra de la pieza (6 px placa, 4 px ladrillo, 3 px baldosa), nunca un borde negro desplazado ni una sombra de otro color. La sombra difusa existe solo para apoyar la pieza.

**The Sinking Brick Rule.** Lo que se toca se hunde (3 px, 120 ms) y no se levanta al pasar el puntero: el hover solo aclara la cara (brightness 1.06). Con reduced motion, el cambio es instantáneo.

## Shapes

Esquinas de plástico moldeado en pocos tamaños: 10 px para placas, diálogos y toasts; 8 px para ladrillos-botón, campos, baldosas, segmentado y caja de piezas; 6 px para la opción elegida del segmentado y los pernos del PIN; 14 px para el marco de la batería. Pastillas completas solo para la etiqueta de actividad, los pernos redondos de la barra («+» y campana), el selector de niño y el interruptor (cuya perilla es un perno visto desde arriba).

El perno es la forma que se repite: dos sobre cada ladrillo-botón (asomando 6 px), una fila sobre cada placa y sobre la barra de pestañas, una fila sobre un ladrillo amarillo en el PIN del niño. El ladrillo de tiempo es un SVG de frente de 40×26 con dos pernos (medio ladrillo: uno), filo translúcido, luz arriba y sombra abajo. El hueco es la tira de placa con sus pernos (socket), sin cuerpo de ladrillo. El borde punteado es semántico: «usado» en los ladrillos y «guárdalo, se muestra una vez» en la caja del código de recuperación. La batería del niño es la única pieza con un marco grueso: 3 px de tinta con su borne.

## Components

### Buttons
Ladrillos con dos pernos, a la medida del pulgar.
- **Shape:** 8 px; 48 px de alto (40 px en tamaño pequeño), Nunito 700 con icono Lucide a la izquierda. Dos pernos de 26 px como máximo asoman 6 px arriba, al 18 % de cada lado.
- **Primary:** ladrillo de tinta con texto on-ink, para la acción principal de cada placa (Aprobar, Empezar ya, Nueva sesión, Entrar).
- **Secondary:** ladrillo de plástico elevado con contorno regla de 1,5 px hacia adentro.
- **Pause:** ladrillo naranja con tinta oscura, solo para Pausar.
- **Danger:** ladrillo rojo, solo para cortar cuando ya hace falta.
- **Light:** ladrillo blanco en los dos temas, solo sobre una placa de color (Detener en «Ahora» en curso).
- **Quiet:** sin ladrillo, solo texto; hover en placa hundida («Ahora no», «Rechazar», «Salir»).
- **Estados:** hover aclara la cara; activo baja 3 px; deshabilitado se vuelve placa hundida con canto regla y tinta tenue; ocupado cambia el icono por un spinner. Foco: anillo de 3 px en azul foco a 2 px.
- **Grande:** la acción principal de una pantalla del niño y los dos accesos de la landing suben a 56 px.

### Chips
- **Etiqueta de actividad:** pastilla del color de la actividad, texto blanco 700 e icono (mando para Juego, televisor para TV). Sobre su propia placa en curso se invierte: blanca con texto del color de la actividad.

### Cards / Containers
- **Corner Style:** 10 px.
- **Background:** placa (sheet); con tono, cara y canto del único estado que reporta; «Ahora» en curso, del color de la actividad.
- **Shadow Strategy:** sombra Plate, con su fila de pernos arriba (ver Elevation & Depth).
- **Border:** ninguno; el canto hace de borde.
- **Internal Padding:** 16 px, 20 px desde sm (la landing, 24 a 40 px).

### Inputs / Fields
- **Style:** ranuras hundidas en la placa: 48 px, fondo placa hundida, borde regla fuerte de 1,5 px, 8 px, sombra Slot. Etiqueta Nunito 600 arriba y pista en body sm debajo.
- **Focus:** borde azul foco más un halo de 3 px al 25 %.
- **Error / Disabled:** borde rojo y mensaje en rojo con role="alert"; deshabilitado en tinta tenue al 70 %.
- **Stepper de minutos:** ladrillos secundarios cuadrados de 48 px con − y + a los lados de una ranura con la cifra en Baloo 2 800 de 1.5rem y «min» dentro.
- **Segmentado:** bandeja hundida; la opción elegida es una baldosa de tinta con su canto.
- **Interruptor:** pastilla hundida de 52×32 con perilla-perno blanca; encendido en verde saldo.
- **Aviso en línea (Notice):** caja de 8 px con borde de 1,5 px: hundida para información, stop-tint para error, balance-tint para éxito.

### Navigation
- **Teléfono, padres:** barra de pestañas-placa con su fila de pernos; cada pestaña es un icono de 22 px sobre caption 700; la activa lleva el icono en una baldosa amarilla de 48×32 (trazo 2.25) y la etiqueta en tinta; la inactiva en tinta tenue.
- **Escritorio, padres:** riel-placa; la fila activa es una baldosa amarilla de 44 px; hover en placa hundida.
- **Niño:** tres pestañas de 80 px con iconos de 28 px en baldosa de 56×36; desde lg, filas de 44 px en la barra superior, la activa en baldosa amarilla. Avisos es la campana, un perno redondo de 44 px que pasa a tinta cuando está abierto.

### Ladrillo (signature)
SVG de 40×26 con dos pernos (uno en el medio ladrillo), filo translúcido, luz en pernos y borde superior y una base sombreada. Estados: sólido (disponible), vaciándose desde arriba (el ladrillo en uso, solo en cuentas en vivo), contorno punteado en gris fantasma (usado; en montos fijos ya gastados, punteado del color del monto), rojo (exceso, redondeado hacia arriba) y hueco (la tira de placa con pernos en socket: por ganar). Movimiento: al gastarse, salto de 4 px (180 ms); al entrar un ladrillo nuevo, encaje desde 8 px arriba (260 ms); los de un pedido recién aprobado encajan uno tras otro con 70 ms de desfase; nunca en el primer pintado salvo ese caso y nada con reduced motion. La carga es una torre de tres ladrillos (verde, amarillo, azul) que caen uno sobre otro.

### «Ahora» en curso (signature)
La placa toma la cara y el canto de su actividad, con texto blanco y foco blanco. La cuenta va en Display sobre una baldosa impresa (negro al 25 % sobre la cara, sombra interior arriba), con la torre de la sesión a la derecha en ladrillos blancos: lo que queda abajo, el que se vacía encima y los usados punteados arriba. Debajo, «Termina a las…» y los ladrillos Pausar (naranja) y Detener (blanco). En pausa vuelve a placa tintada de pausa; pasada de tiempo, a placa neutra con la cuenta en rojo.

### Batería (signature, niño)
Marco de tinta de 3 px con esquinas de 14 px, fondo placa hundida y un borne de tinta a la derecha (8 px, 38 % del alto); los ladrillos son las celdas. Hoy en una fila; la Semana en un muro con el bono sin usar en amarillo al final de lo que queda. Con una sesión abierta, Hoy muestra lo libre en verde y lo que la sesión todavía va a usar en el color de la actividad. Encima la leyenda con muestras; debajo «Se recarga…» con un icono de batería cargando; siempre con su cifra y su aria-label. El medidor de bonos (amarillo ganado y huecos hasta el tope) va debajo.

### Caja de piezas (signature)
Caja hundida de 8 px con «3×» ladrillos, «1×» medio ladrillo y «= 25 min» al lado. Para lo que pide el niño y lo que vale una tarea.

### Paso numerado
El número en una baldosa de tinta de 40 px (Baloo 2 800, 1.375rem, tabular, canto ink-side) a la izquierda del título del paso, con su pista debajo. Solo en flujos de varios pasos y en «Cómo funciona» de la landing (48 px).

### PIN del niño
Una fila de pernos sobre un ladrillo amarillo plano: vacíos en placa hundida con borde regla fuerte, se llenan en amarillo con un brillo a cada número; un PIN que no coincide sacude la fila una vez (360 ms). Teclado 3×4 de ladrillos secundarios de 64 px con cifras en Baloo 2 800 de 2rem, borrar sin ladrillo y «Entrar» como ladrillo primario.

### Toasts y diálogos
Toasts de 10 px con sombra Lift y borde regla, abajo al centro en el teléfono (sobre las pestañas) y abajo a la derecha en escritorio; la alarma va en tinta con borde y canto rojos; lo que trae un push que no es alarma (una solicitud, una respuesta) va en placa con una campana en tinta y se queda hasta cerrarlo si llegó con la pestaña oculta. Los diálogos son `<dialog>` nativos con forma de placa (26rem), «Volver» secundario y la acción en rojo o tinta; entran con un ascenso corto de 260 ms sobre un fondo negro al 55 %.

### Marca
El ladrillo amarillo 2×2 de frente con una aguja de reloj (brand/mark.svg y BrandMark), a 40 px en las barras y 56 px en grande, con «Time Craft» en Baloo 2 800. Es un dibujo fijo: no cambia con el tema.

## Do's and Don'ts

### Do:
- **Do** construir cada recuadro como placa (pernos arriba, canto de 6 px) sobre la placa base, y cada botón como ladrillo que se hunde.
- **Do** mostrar el tiempo en ladrillos de 10 min; si un límite no cabe en la fila, sube el valor (20, 30 o 60 min) y escribe «1 ladrillo = N min».
- **Do** usar sólido para disponible, contorno punteado para usado, medio ladrillo de un perno para medio ladrillo en montos fijos y la tira de placa con pernos solo para lo que todavía se puede ganar.
- **Do** vaciar desde arriba solo el ladrillo en uso de una cuenta en vivo.
- **Do** pintar el exceso con ladrillos rojos, redondeados hacia arriba.
- **Do** dar a cada placa una sola acción primaria en tinta.
- **Do** acompañar cada fila de ladrillos con su texto (aria-label y cifra «38 min de 1 h»).
- **Do** definir todo color como token con un valor por tema; el blanco fijo solo va sobre una placa de color.
- **Do** dar volumen con el canto del color en sombra de la pieza (`-side`).
- **Do** respetar reduced motion: los ladrillos cambian al instante y los botones no se mueven.
- **Do** tintar en verde saldo solo la placa de un «sí»; un «no» va en una placa neutra.

### Don't:
- **Don't** usar anillos de progreso, escudos ni tarjetas grises con un acento azul: es el panel de control parental que este sistema rechaza.
- **Don't** usar el rojo para algo que no termine, se pase o corte.
- **Don't** usar un color de ladrillo fuera de su trabajo, ni como decoración.
- **Don't** nombrar ni imitar una marca de juguetes ni su logo: solo la gramática de las piezas.
- **Don't** usar un borde negro desplazado ni sombras de otro color como relieve: el canto es del color de la pieza.
- **Don't** poner rótulos en mayúsculas espaciadas sobre los títulos.
- **Don't** usar emojis ni caracteres como iconos: los iconos son Lucide de trazo 2.
- **Don't** escribir un color fijo que no cambie con el tema, salvo el blanco sobre una placa de color.
- **Don't** usar el rojo del lado del niño fuera del fin de su sesión y del PIN que no coincide.
- **Don't** usar el hueco para tiempo usado: usado es el contorno punteado.
- **Don't** llevar al área del niño mascotas, estrellas ni confeti de app de recompensas: el premio son ladrillos que encajan.
