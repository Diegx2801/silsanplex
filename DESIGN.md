---
name: SILSANPLEX
description: Sistema administrativo sobrio y trazable, expresado como un kardex vivo.
colors:
  paper: "#fafaf7"
  ink: "#1d2724"
  surface: "#ffffff"
  registry-green: "#16705a"
  registry-green-foreground: "#ffffff"
  sidebar-paper: "#f3f5f2"
  secondary-wash: "#e7edea"
  secondary-ink: "#26332f"
  muted-wash: "#eef2ef"
  muted-ink: "#66736e"
  navigation-ink: "rgb(29 39 36 / 70%)"
  active-wash: "#dce9e4"
  active-ink: "#174a3e"
  ledger-line: "#cbd7d1"
  input-line: "#bccac4"
  ready-wash: "#dcefe7"
  ready-ink: "#0e5946"
  pending-wash: "#f4e7c6"
  pending-ink: "#79520d"
  review-wash: "#e5eae7"
  review-ink: "#4f5c57"
typography:
  display:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.75rem"
  body:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
  body-compact:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  navigation:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
  status:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
  label:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.68rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.08em"
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  pill: "9999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.25rem"
  xl: "1.5rem"
  section: "2.5rem"
components:
  navigation-item:
    backgroundColor: "transparent"
    textColor: "{colors.navigation-ink}"
    typography: "{typography.navigation}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "2.5rem"
  navigation-item-active:
    backgroundColor: "{colors.active-wash}"
    textColor: "{colors.active-ink}"
    typography: "{typography.navigation}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "2.5rem"
  ledger-sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "0"
  field-control:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "2.5rem"
  button-primary:
    backgroundColor: "{colors.registry-green}"
    textColor: "{colors.registry-green-foreground}"
    typography: "{typography.navigation}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2.25rem"
  product-drawer:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "0"
    width: "min(100%, 48rem)"
  status-ready:
    backgroundColor: "{colors.ready-wash}"
    textColor: "{colors.ready-ink}"
    typography: "{typography.status}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.625rem"
  status-pending:
    backgroundColor: "{colors.pending-wash}"
    textColor: "{colors.pending-ink}"
    typography: "{typography.status}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.625rem"
  status-review:
    backgroundColor: "{colors.review-wash}"
    textColor: "{colors.review-ink}"
    typography: "{typography.status}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.625rem"
---

# Design System: SILSANPLEX

## Overview

**Creative North Star: "Kardex vivo"**

SILSANPLEX se comporta como una hoja de registro que permanece activa: papel claro, tinta oscura, líneas finas y señales verdes que permiten ubicar el estado y la ruta de trabajo sin ruido decorativo. La dirección fue implementada desde código con la semilla `f06ddb99`; favorece una densidad moderada, lectura rápida y trazabilidad visible en un contexto administrativo de escritorio.

La expresión es operativa antes que promocional. La jerarquía nace de títulos directos, etiquetas compactas, divisores y alineaciones tabulares; no de grandes estadísticas, gradientes ni tarjetas de dashboard. La identidad es deliberadamente provisional: debe poder recibir el logotipo y la paleta corporativa aprobados sin cambiar el modelo de composición.

**Key Characteristics:**

- Superficies claras con contraste de tinta y líneas de registro.
- Verde reservado para orientación, estados positivos y acciones relevantes.
- Contenido factual, auditable y explícito sobre dependencias pendientes.
- Navegación modular estable, con adaptación móvil accesible.
- Densidad moderada y ritmo compacto para trabajo administrativo prolongado.

## Colors

La paleta combina papel cálido, tinta verde-negra y lavados minerales; el verde de registro funciona como señal escasa, no como relleno dominante.

### Primary

- **Verde de registro:** identifica navegación activa, foco, numeración operativa, selección y estados positivos. Es un acento provisional, no un color corporativo confirmado.

### Secondary

- **Lavado de navegación:** acompaña estados hover y activos sin competir con el contenido.
- **Tinta secundaria:** mantiene legibilidad en controles y texto auxiliar de mayor importancia.

### Tertiary

- **Ámbar pendiente:** comunica dependencias o trabajo aún no resuelto sin presentarlo como error.
- **Gris de revisión:** señala información que requiere confirmación externa.

### Neutral

- **Papel operativo:** fondo principal de la aplicación y base de lectura prolongada.
- **Superficie blanca:** reserva para hojas de registro y capas que necesitan separación tonal.
- **Tinta principal:** texto, iconografía y encabezados.
- **Tinta silenciada:** descripciones, metadatos y contexto secundario.
- **Línea de kardex:** bordes, divisores de filas y límites estructurales.

### Named Rules

**The Green Is a Signal Rule.** El verde aparece para orientar o confirmar; no debe cubrir grandes superficies ni convertirse en decoración.

**The Provisional Brand Rule.** Ningún color actual debe describirse como corporativo hasta que Droguería SILSAN S.A.C. apruebe su identidad.

**The Status Has Meaning Rule.** Verde significa listo o positivo, ámbar significa pendiente y gris significa por confirmar; no intercambiar estos tonos por variedad estética.

## Typography

**Display Font:** Geist Variable (con `sans-serif` como respaldo)  
**Body Font:** Geist Variable (con `sans-serif` como respaldo)  
**Label/Mono Font:** pila monoespaciada del sistema

**Character:** Geist aporta neutralidad contemporánea y alta legibilidad a una interfaz de operación. La monoespaciada aparece solo en rótulos, índices y datos tabulares para evocar el registro sin convertir toda la aplicación en una terminal.

### Hierarchy

- **Display** (semibold, tamaño base documentado en tokens, interletraje cerrado): título principal de una página. Desde `640px` aumenta a `2.25rem`.
- **Title** (semibold): títulos de secciones, registros y paneles laterales.
- **Body** (regular, interlineado amplio): explicaciones y contexto; limitar bloques narrativos a aproximadamente `68ch`.
- **Body Compact** (regular): filas, navegación, estados secundarios y metadatos.
- **Label** (medium, mayúsculas y espaciado abierto): encabezados de grupos, numeración y marcas operativas breves.

### Named Rules

**The Operational Voice Rule.** Los títulos describen una tarea, área o estado real; no usan lenguaje promocional ni promesas.

**The Mono as Instrument Rule.** La monoespaciada sirve para índices, códigos, rótulos y cifras tabulares, nunca para párrafos completos.

## Layout

La composición base es un shell administrativo. En escritorio, una navegación lateral persistente de `18rem` ocupa el borde inicial; el área de trabajo se desplaza en la misma medida y conserva una cabecera contextual sticky de `4rem`. El contenido principal queda centrado, crece hasta `96rem` y usa márgenes internos que progresan de `1rem` a `1.5rem` y `2.5rem` según el ancho.

El contenido se organiza como registros y franjas, no como mosaico indiscriminado de tarjetas. La página de inicio demuestra el patrón: encabezado legible, hoja principal con filas divisorias, columna secundaria de ruta y una franja inferior para información aún no configurada. Esta composición es una expresión del sistema; nuevas pantallas deben conservar la lógica de registro, pero adaptar columnas y prioridades al flujo real de cada módulo.

Responsive sigue los breakpoints activos de Tailwind: `sm` a `640px`, `md` a `768px`, `lg` a `1024px` y `xl` a `1280px`. Por debajo de `lg`, el sidebar desaparece y se abre como diálogo lateral modal desde la cabecera. Las grillas de filas colapsan a flujo vertical; la columna secundaria solo se separa a partir de `xl`. El ancho mínimo soportado por la base es `320px`.

El registro de productos concreta esta adaptación con dos representaciones semánticas del mismo conjunto. Desde `md`, una tabla de siete columnas conserva un ancho mínimo de `58rem` y permite desplazamiento horizontal antes que comprimir códigos, precios o acciones. Por debajo de `md`, cada producto se apila como una fila-artículo: código, descripción y estado dominan; laboratorio y precio forman un bloque descriptivo; editar y activar o desactivar pasan a acciones textuales de ancho equivalente. Los filtros se apilan en móvil y, desde `md`, distribuyen búsqueda flexible y estado en una columna estable de `13rem`.

El alta y la edición comparten un panel lateral derecho de ancho completo hasta `48rem`. Su cabecera y pie permanecen estructuralmente separados mientras solo el cuerpo del formulario desplaza; en móvil, las acciones del pie se apilan con la acción primaria antes de Cancelar, y desde `sm` se alinean al borde final. Este patrón evita una ficha multipestaña y mantiene la tarea en una sola secuencia de Identificación, Información comercial y sanitaria, y Control operativo.

**The Desktop-First, Essential-Everywhere Rule.** La densidad y navegación priorizan escritorio, pero ninguna función esencial puede quedar inaccesible o depender de una columna fija en pantallas pequeñas.

**The Record Before Dashboard Rule.** Si no hay datos confiables, mostrar estructura, estado o preparación verificable; nunca rellenar el espacio con métricas ficticias.

## Elevation & Depth

El sistema es plano por defecto. La profundidad se comunica mediante fondos tonales, bordes finos y divisores; las hojas de registro no tienen sombra. Las sombras se reservan para capas funcionalmente elevadas: el panel modal móvil usa una sombra amplia y el enlace de salto la usa únicamente cuando recibe foco. La cabecera sticky aplica un desenfoque sutil sobre un fondo casi opaco para conservar contexto durante el desplazamiento.

### Shadow Vocabulary

- **Capa modal:** `0 25px 50px -12px rgb(0 0 0 / 0.25)`, solo para separar la navegación móvil del contenido bloqueado por el overlay.
- **Formulario lateral:** sombra estructural amplia sobre un overlay de tinta al 25%, solo mientras el alta o la edición bloquean el registro subyacente.
- **Acceso de teclado:** `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`, solo cuando el enlace “Saltar al contenido principal” se vuelve visible.

### Named Rules

**The Flat Registry Rule.** Las superficies permanentes se separan con líneas y tono; una sombra implica elevación o foco funcional real.

## Shapes

La geometría principal es recta y registral. Hojas, secciones y filas conservan bordes rectos; los radios medianos se reservan para objetivos interactivos compactos, como enlaces de navegación y botones de icono. Las etiquetas de estado son cápsulas para diferenciarse de las celdas y facilitar el escaneo.

El formulario lateral conserva esquinas rectas y un borde inicial fino, porque es una extensión temporal del registro y no una tarjeta flotante. Sus campos usan bordes finos, radio mediano y una altura mínima de `2.5rem`; el foco y el error refuerzan el contorno en lugar de cambiar la silueta.

Los bordes son finos y estructurales. No introducir contenedores redondeados anidados ni siluetas decorativas que debiliten la lectura de filas, columnas y secuencias.

**The Straight Sheet Rule.** El contenido de registro usa esquinas rectas; el redondeo comunica interacción compacta o estado, no una tarjeta genérica.

## Components

### Navigation

- **Sidebar:** papel secundario, borde final fino, ancho estable y scroll interno independiente cuando la lista crece.
- **Group labels:** monoespaciadas, compactas, en mayúsculas y con interletraje abierto.
- **Items:** altura mínima táctil de `2.5rem`, radio mediano, icono al inicio y texto de peso medio.
- **Active state:** lavado verde, tinta verde profunda, icono acentuado y un punto final que no depende únicamente del color.
- **Hover / Focus:** lavado suave en hover; anillo visible de dos píxeles con `focus-visible`.
- **Mobile:** diálogo lateral con overlay, bloqueo del fondo, foco atrapado, cierre con Escape y devolución del foco al disparador mediante Radix Dialog.

### Icon Buttons

- **Shape:** objetivo cuadrado de `2.25rem` con radio mediano.
- **Color:** icono silenciado en reposo y tinta principal sobre lavado suave en hover.
- **Focus:** anillo visible de dos píxeles; cada control conserva un nombre accesible aunque el icono sea decorativo.

### Buttons

- **Primary:** verde de registro con texto blanco, radio grande y altura de `2.25rem`; se reserva para registrar o confirmar el guardado.
- **Outline:** fondo de papel y borde estructural; sirve para cancelar y para las acciones explícitas de edición y estado en móvil.
- **Ghost:** sin relleno en reposo y con lavado mineral en hover; se usa para acciones compactas dentro de la tabla de escritorio.
- **States:** todos conservan foco visible, respuesta activa de un píxel y atenuación inequívoca cuando están deshabilitados.

### Cards / Containers

- **Ledger sheet:** superficie blanca, borde fino, esquina recta y sin sombra.
- **Rows:** divisores de una sola línea, padding adaptable y columnas alineadas solo cuando el ancho lo permite.
- **Internal padding:** normalmente `1.25rem` en móvil y `1.5rem` desde `sm`.
- **Route rail:** borde superior verde de dos píxeles y secuencia numerada, sin caja envolvente adicional.

### Status Labels

- **Style:** cápsula compacta, texto de peso medio y altura mínima de `1.5rem`.
- **Ready:** lavado verde y tinta verde profunda.
- **Pending:** lavado ámbar y tinta marrón.
- **Review:** lavado gris mineral y tinta neutra.
- **Content:** el texto debe nombrar el estado; el color nunca es el único portador de significado.

### Product Registry

- **Desktop table:** desde `md`, muestra Código, Producto, Laboratorio, Presentación, Precio base, Estado y Acciones. Los códigos y precios usan cifras monoespaciadas y tabulares; categoría permanece como segundo nivel del nombre.
- **Mobile rows:** por debajo de `md`, usa artículos apilados y listas descriptivas, no una tabla visualmente exprimida. Conserva las acciones esenciales como botones con icono y texto.
- **Search and filter:** la búsqueda recorre código interno, código de barras, descripción y laboratorio; el filtro separa todos, activos e inactivos. El conteo visible siempre expresa resultado filtrado frente al total.
- **Empty states:** distingue entre catálogo realmente vacío y búsqueda sin coincidencias. Solo el primer caso ofrece registrar desde el propio estado vacío.
- **Status changes:** activar o desactivar actualiza la etiqueta textual y anuncia el resultado; no elimina el producto ni simula una operación de inventario.

### Inputs / Fields

- **Style:** etiqueta persistente encima, control de `2.5rem`, fondo de papel, borde de entrada y radio mediano. El placeholder aporta formato o ejemplo, nunca sustituye la etiqueta.
- **Focus:** borde verde y anillo visible translúcido; los campos inválidos usan borde y anillo destructivos.
- **Help and error:** ayuda y error ocupan la misma zona bajo el control. Cada mensaje se vincula mediante `aria-describedby`, y el control inválido expone `aria-invalid`.
- **Current required fields:** Código interno y Nombre o descripción. El código admite hasta 30 caracteres; la descripción, entre 2 y 160 después de recortar espacios.
- **Current optional fields:** Código de barras (50), Categoría o línea (80), Laboratorio o marca (100), Presentación (100), Unidad de medida (40), Registro sanitario (80), Afectación de IGV y Precio de venta base. Los máximos entre paréntesis son caracteres.
- **Commercial validation:** el precio puede quedar vacío o usar un importe no negativo con hasta dos decimales. La afectación de IGV permanece explícitamente en Por definir, Gravado, Exonerado o Inafecto; no inferir si el precio incluye IGV.
- **Organization uniqueness:** el código interno es único dentro de los productos de la organización, sin distinguir mayúsculas y minúsculas; el conflicto se presenta sobre el campo Código interno.

### Product Form

- **Structure:** un único diálogo lateral para registrar y editar, dividido por líneas en Identificación, Información comercial y sanitaria, y Control operativo.
- **Defaults:** un producto nuevo no precarga datos factuales: los campos textuales, el precio y la afectación de IGV comienzan vacíos. Controlar por lote y Producto activo comienzan seleccionados, mientras Venta con receta comienza desmarcada.
- **Control options:** las opciones binarias combinan checkbox, etiqueta y explicación completa; no usan switches sin contexto.
- **Scrolling:** cabecera y pie permanecen visibles como límites del panel; únicamente la secuencia de campos tiene desplazamiento vertical.
- **Persistent storage:** altas, ediciones y cambios de estado se escriben en `public.products` mediante Supabase. La organización activa se valida en RLS y los valores se validan contra las restricciones del catálogo.
- **Scope:** el catálogo persiste y se comparte dentro de la organización autorizada; los módulos que todavía usan persistencia temporal deben identificarse de forma explícita y no presentarse como datos empresariales definitivos.

### Page Header

- **Title:** display sobrio con interletraje cerrado.
- **Description:** cuerpo legible, interlineado amplio y longitud controlada.
- **Copy:** explica el alcance real de la pantalla y, cuando corresponde, por qué todavía no hay datos operativos.

### Motion & Accessibility

- Las transiciones existen para la apertura y cierre del menú móvil, la entrada lateral del formulario de producto y los estados interactivos; no hay movimiento ambiental ni decorativo.
- `prefers-reduced-motion: reduce` lleva transiciones y animaciones a `0.01ms`, elimina scroll suave y limita cada animación a una iteración.
- El shell incluye enlace de salto, landmarks semánticos, etiquetas accesibles, iconos ocultos al árbol de accesibilidad y foco visible.
- El formulario lateral atrapa el foco, se cierra con Escape, enfoca primero el Código interno al crear y devuelve el foco al botón exacto que lo abrió. Título, descripción y botón de cierre tienen nombres accesibles.
- En escritorio, la tabla usa encabezados de columna con alcance explícito y cada acción de icono nombra el producto afectado. En móvil, artículos y listas descriptivas conservan relaciones semánticas sin depender de la geometría tabular.
- Los resultados de registrar, editar y cambiar estado se anuncian mediante una región de estado cortés sin interrumpir la tarea.
- Mantener contraste suficiente en todo token nuevo y validar teclado, foco, Escape y restauración del foco al modificar navegación o diálogos.

## Do's and Don'ts

### Do:

- **Do** usar filas, líneas finas, rótulos compactos y alineación tabular para expresar trazabilidad.
- **Do** mantener los tokens de identidad provisional centralizados para reemplazarlos cuando exista marca aprobada.
- **Do** adaptar densidad y columnas al móvil sin ocultar acciones esenciales.
- **Do** usar estados textuales junto al color y mantener foco visible en cada control.
- **Do** conservar la tabla en escritorio y reconstruir sus prioridades como filas apiladas con acciones textuales en móvil.
- **Do** tratar el formulario lateral como una secuencia única, con etiquetas persistentes, ayuda vinculada y errores junto al campo responsable.
- **Do** identificar de forma visible cualquier persistencia temporal y validar los datos almacenados antes de mostrarlos.
- **Do** presentar únicamente datos, estados, rutas y dependencias respaldados por una fuente confiable.
- **Do** dejar espacio arquitectónico para reordenar navegación y prioridades sin reescribir el shell.

### Don't:

- **Don't** inventar métricas, stock, precios, lotes, aprobaciones, acciones frecuentes ni prioridades operativas.
- **Don't** presentar el verde, la tipografía o símbolos provisionales como identidad corporativa oficial.
- **Don't** añadir gradientes, sombras decorativas, grandes rellenos de acento ni cuadrículas de tarjetas genéricas.
- **Don't** usar movimiento ornamental ni ignorar `prefers-reduced-motion`.
- **Don't** depender solo del color, del hover o de una disposición de escritorio para comunicar o completar una tarea.
- **Don't** confundir `sessionStorage` usado por módulos temporales con persistencia definitiva, ni prometer sincronización para dominios que todavía no estén conectados a Supabase.
- **Don't** convertir el formulario esencial en una ficha multipestaña ni hacer obligatorios los campos opcionales antes de confirmar la regla empresarial.
- **Don't** tratar `sale_price` o `minimum_sale_price` como importes sin IGV: ambos son precios finales por unidad base en PEN e incluyen IGV cuando corresponde. No inventar catálogos controlados de clasificación o presentación.
- **Don't** introducir logotipo, fotografía, ilustración o recursos de marca hasta recibir activos y autorización de Droguería SILSAN S.A.C.

### Pending Brand Decisions

- Logotipo oficial, variantes y reglas de zona de seguridad.
- Paleta corporativa aprobada y su relación con los colores semánticos de operación.
- Tipografía corporativa, si difiere de Geist.
- Iconografía, fotografía, ilustración y tono verbal de marca.
- Validación empresarial de las prioridades de navegación y de las acciones administrativas frecuentes.
- Catálogos controlados para clasificación y presentación, y campos opcionales que pasarán a ser obligatorios.
