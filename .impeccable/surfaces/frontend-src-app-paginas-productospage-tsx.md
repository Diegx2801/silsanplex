---
version: 1
slug: "frontend-src-app-paginas-productospage-tsx"
primary_target: "frontend/src/app/paginas/ProductosPage.tsx"
related_targets: ["frontend/src/app/paginas/ImportarProductosPage.tsx","frontend/src/modulos/productos/componentes/DialogoProducto.tsx","frontend/src/modulos/productos/modelo/producto.ts","frontend/src/modulos/productos/modelo/analisisImportacion.ts","frontend/src/modulos/productos/servicios/lectorArchivosProductos.ts"]
---

# Productos

## Alcance y modo

Superficie Operate para que administración encuentre, registre, edite y active o desactive productos esenciales sin replicar la complejidad del sistema anterior.

## Tarea y contenido

- La acción primaria es registrar un producto.
- La búsqueda cubre código, código de barras, descripción y laboratorio; el filtro separa estados.
- El registro comienza vacío y solo muestra información ingresada por el usuario.
- El guardado es temporal en `sessionStorage` hasta conectar Supabase.

## Dirección y comportamiento

Extiende «Kardex vivo» con una tabla de registro en escritorio, filas apiladas en móvil y un formulario lateral que protege el foco. La transición del panel es el momento de movimiento principal.

## Revisión previa de importación

La ruta de importación es una extensión Operate del registro de productos, no una importación real. Convierte dos archivos `.xlsx` seleccionados localmente —catálogo de productos y precios— en un parte plano y auditable. El análisis ocurre en el navegador, no sube archivos, no escribe en `sessionStorage`, no modifica el catálogo y no simula un guardado futuro. La superficie debe identificarse de forma persistente como **SOLO VISTA PREVIA**.

### Entrada y límites

- Requiere ambos archivos antes de habilitar el análisis; cada selector mantiene etiqueta, descripción de columnas esperadas y nombre del archivo elegido.
- Acepta únicamente `.xlsx` de hasta 5 MB, con una hoja llamada `data` y los encabezados esperados para cada archivo.
- Cambiar cualquiera de los archivos invalida y retira el resultado anterior. Limpiar restablece selectores, errores y resultados sin efectos externos.
- La lectura asíncrona usa un estado ocupado textual («Analizando…») y deshabilita reenvíos mientras trabaja.

### Parte de resultados

- El encabezado distingue explícitamente entre **correcciones requeridas** y **estructura apta para continuar a revisión**. Aprobar la estructura no equivale a importar ni a validar reglas comerciales.
- Las cuatro métricas —filas de productos, códigos únicos, filas de precios y códigos relacionados— solo pueden proceder de los archivos actualmente seleccionados. Son evidencia local del análisis, no indicadores operativos ni datos persistidos.
- Los hallazgos se agrupan por regla y muestran nivel, explicación, cantidad, unidad y hasta tres ejemplos cuando existen. Los ejemplos son muestras para localizar el problema, no una enumeración exhaustiva.
- Los niveles tienen semántica estable: `bloqueo` impide una importación segura futura, `advertencia` exige revisión y `informativo` dimensiona una condición sin bloquear. Etiqueta e icono acompañan siempre al tono; el color no comunica el nivel por sí solo.
- Si no hay hallazgos, la interfaz afirma únicamente que no encontró observaciones con las reglas actuales. No promete que los datos sean correctos ni que estén listos para guardarse.

### Reglas de análisis actuales

- Bloquear códigos de producto asociados a nombres distintos y precios cuyo código no existe en el catálogo seleccionado.
- Advertir filas de precio idénticas repetidas, precios en cero, variantes conocidas de una misma unidad, nombres con espacios sobrantes y productos sin filas de precio.
- Informar presentaciones sin código de barras sin volver obligatorio ese dato.
- Normalizar comparaciones recortando espacios y usando mayúsculas en locale `es-PE`; no corregir ni transformar silenciosamente los archivos fuente.
- No inferir precio, IGV, unidad canónica ni vínculo entre registros cuando la evidencia es ambigua.

### Composición, responsive y accesibilidad

- La selección conserva el patrón `ledger-sheet`: cabecera, dos filas de archivo y pie de acciones con una explicación visible sobre privacidad y ausencia de escritura.
- Las métricas son celdas contiguas de un mismo registro, no tarjetas independientes: una columna en móvil, dos desde `sm` y cuatro desde `xl`.
- Cada hallazgo es una fila dividida; la cantidad pasa al borde final desde `lg` y permanece bajo el detalle en anchos menores.
- Errores de formato o lectura usan `role="alert"`. La finalización, el fallo y el reinicio se anuncian mediante una región `role="status"` con `aria-live="polite"`.
- Los selectores nativos conservan asociación por `label`; los iconos son decorativos y el estado ocupado mantiene texto legible además del spinner.
- El único movimiento propio es el giro funcional del indicador durante la lectura y debe obedecer la reducción global de movimiento.

**Regla del parte, no de la promesa.** Todo número o veredicto visible debe poder reconstruirse desde los dos archivos seleccionados y las reglas documentadas; nunca presentar el análisis como importación ejecutada, validación empresarial completa o persistencia.

## Decisiones pendientes

Confirmar si el precio base incluye IGV, los catálogos controlados de clasificación y presentación, cuáles campos opcionales serán obligatorios para la empresa, el mapeo definitivo entre ambos archivos, las reglas de normalización autorizadas y el flujo transaccional de la futura importación.
