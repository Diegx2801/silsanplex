---
version: 1
slug: "frontend-src-app-paginas-iniciopage-tsx"
primary_target: "frontend/src/app/paginas/InicioPage.tsx"
related_targets: ["frontend/src/app/paginas/ProductosPage.tsx", "frontend/src/app/router/router.tsx", "frontend/src/app/navegacion.ts", "frontend/src/modulos/productos/modelo/producto.ts"]
---

# Centro de operaciones

## Alcance y modo

Dashboard administrativo MVP en modo Operate. Extiende «Kardex vivo» como una portada de orientación: resume únicamente el catálogo temporal disponible, ofrece accesos a las tareas implementadas y declara con precisión qué módulos y dependencias siguen pendientes. No es un tablero de rendimiento empresarial.

## Verdad de datos

- Las únicas cifras admitidas son Total registrado, Activos e Inactivos, calculadas desde los productos válidos de la sesión actual mediante `resumirProductos`.
- El total es la longitud del registro temporal; Activos cuenta productos con `activo: true`; Inactivos es la diferencia entre ambos. Las tres cifras deben permanecer matemáticamente reconciliables.
- La fuente es `sessionStorage`, bajo el alcance ya documentado para Productos. Si la clave no existe, es ilegible o no satisface el esquema vigente, el resumen parte de cero.
- La etiqueta **Sesión local**, el subtítulo sobre datos temporales y el texto explicativo bajo el conteo deben permanecer visibles. Las cifras no representan inventario, ventas, compras, valorización, demanda ni información compartida por otros usuarios.
- No agregar gráficos, tendencias, variaciones, porcentajes, alertas de stock, actividad reciente ni métricas operativas hasta disponer de una fuente empresarial confiable y reglas confirmadas.

**Regla de las tres cifras.** Cada número de la portada debe poder reconstruirse directamente desde el catálogo temporal de la sesión; si necesita una fuente o regla aún inexistente, no pertenece al dashboard.

## Accesos y flujo

- **Registrar producto** es la acción primaria. Navega a `/productos?nuevo=1` y abre el mismo formulario lateral del registro; no crea datos por anticipado.
- **Abrir catálogo** navega a `/productos` y conserva el catálogo temporal existente.
- **Revisar importación** navega a `/productos/importar`. Es una vista previa local que analiza archivos y nunca guarda ni modifica productos.
- El “Siguiente paso recomendado” depende solo de si el total temporal es cero: sin productos invita a revisar los archivos exportados; con productos invita a compararlos antes de diseñar la migración. No es una recomendación personalizada ni una prioridad empresarial confirmada.
- Los accesos deben seguir siendo enlaces reales para conservar apertura en nueva pestaña, historial y semántica de navegación.

## Estado factual del sistema

- Productos se muestra como **Disponible** porque el registro temporal, la edición, el cambio de estado y la revisión previa de archivos existen en esta etapa.
- Inventario se muestra **Por definir**; almacenes, ubicaciones, lotes y movimientos todavía no tienen reglas implementadas.
- Compras y Ventas se muestran **Planificado**. El texto nombra su alcance previsto, pero no implica avance, fecha ni disponibilidad.
- Solo los módulos realmente disponibles reciben un acceso desde la lista. Un nombre presente en la navegación global no convierte al módulo en operativo.
- La base de datos permanece pendiente de credenciales empresariales de Supabase. Usuarios y permisos permanece pendiente de roles y responsabilidades confirmados por la empresa.
- Al avanzar la implementación, actualizar etiqueta, explicación y disponibilidad en el mismo cambio que habilita la capacidad; nunca anticipar estados para completar visualmente la lista.

**Regla del estado demostrable.** Disponible significa utilizable en el producto actual; Planificado y Por definir describen alcance, no porcentaje de progreso ni promesa de entrega.

## Composición y responsive

- El encabezado combina título, explicación de alcance y la etiqueta Sesión local; no usa un saludo personalizado ni una fecha ornamental.
- El resumen del catálogo es una sola `ledger-sheet`: cabecera, tres celdas contiguas, explicación contextual y pie de acciones. Las cifras no se presentan como tarjetas KPI independientes.
- Las celdas del resumen se apilan en móvil y forman tres columnas desde `sm`. Los números usan tipografía monoespaciada y cifras tabulares para facilitar comparación.
- Desde `xl`, el contenido usa una columna flexible y un riel secundario de `22rem`: primero catálogo y siguiente paso; después estado de módulos y dependencias. Por debajo de `xl`, cada bloque vuelve al flujo vertical.
- Las acciones del resumen se apilan en orden visual primario-secundario en móvil y se alinean al borde final desde `sm`.
- Las filas de módulos apilan estado y acceso en móvil; desde `sm` separan información y controles sin comprimir el detalle.
- Mantener bordes, divisores y fondos tonales del sistema. No introducir sombras decorativas, gradientes ni una cuadrícula genérica de cards.

## Accesibilidad y movimiento

- Resumen, módulos y paneles laterales usan títulos asociados mediante `aria-labelledby`; cada módulo es un artículo y cada icono puramente visual permanece oculto al árbol de accesibilidad.
- El acceso de icono a un módulo disponible incluye nombre accesible y `title`; las acciones principales conservan icono y texto visible.
- Los estados siempre incluyen texto dentro de la etiqueta; verde, ámbar y gris no son la única señal.
- La portada no añade animación propia. Solo hereda las transiciones funcionales de controles y diálogos, junto con la política global de `prefers-reduced-motion`.
- El orden de lectura debe coincidir con el orden visual al colapsar: resumen, siguiente paso, módulos y dependencias.

## Límites y decisiones pendientes

- Supabase, autenticación, permisos por rol y datos multiusuario no están conectados; la portada no debe sugerir lo contrario.
- La revisión de archivos no es una importación y el catálogo de sesión no es persistencia definitiva.
- Las prioridades administrativas, los módulos que deben aparecer en portada y los siguientes pasos empresariales requieren validación con Droguería SILSAN S.A.C.
- Cuando existan fuentes reales, definir antes de ampliar el dashboard: propietario de cada métrica, fórmula, rango temporal, actualización, permisos y comportamiento ante datos ausentes o parciales.
