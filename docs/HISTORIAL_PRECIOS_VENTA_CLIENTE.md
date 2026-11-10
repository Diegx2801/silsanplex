# Historial de precios de venta por cliente

## Alcance y fuente de datos

Base: main `4f6d9eb423c6bb7974a99e976f0af3829c728a8b`, 181 migraciones.
La migración nueva `20261110175906_customer_sale_price_history.sql` agrega una
RPC de lectura y dos índices. No copia ni modifica precios ni crea otra tabla
de historial.

Se consultan `sales` y `sale_items`: ventas comerciales `registrada` y
`despachada`, con pedido no cancelado. Una cotización, aunque esté aceptada,
no constituye una venta. Tampoco se afirma que exista un pago conciliado:
este modelo guarda el precio vendido, no acredita el cobro en caja.

Las líneas conservan código, descripción, cantidad, unidad, precio y afectación
tributaria originales. El nombre del cliente se consulta del maestro actual.
El orden es fecha comercial descendente, fecha de registro descendente, UUID
de venta descendente y UUID de línea descendente; los UUID desempatan, no
representan una cronología adicional.

## Contrato y seguridad

`get_customer_sale_price_history(organization, customer, product?, from?, to?,
search?, page_size=21, page_offset=0)`:

- Sesión activa mediante los helpers S01, con SALES_VIEW **y** CUSTOMERS_VIEW.
- SECURITY INVOKER y search_path vacío. RLS original en las cuatro relaciones.
- Todas las relaciones se restringen a la organización y al cliente solicitado.
- Sin EXECUTE para PUBLIC, anon ni service_role; no es una RPC administrativa.
- Fecha inicial/final inclusivas, orden de fechas validado.
- Búsqueda literal de código/descripción históricos, hasta 160 caracteres.
- 1 a 101 filas por consulta; la UI solicita 21, muestra 20 y utiliza una como
  indicador de siguiente página, sin COUNT global.
- Caché por organización, actor, cliente, producto y filtros. Registrar una
  venta invalida los historiales de esa organización.

## Pantallas y comportamiento

- Detalle de cliente: sección **Historial de precios de venta**, búsqueda de
  productos, fechas y paginación. Se conserva el historial de cotizaciones.
- Cotizaciones: referencia automática al último precio, fecha, cantidad, unidad
  y documento; historial desplegable. Consultar no modifica el formulario.
- **Utilizar último precio** exige una acción explícita y SALES_MANAGE.
  Se habilita solo si coinciden moneda, unidad y tratamiento de IGV y el precio
  cumple el mínimo vigente. No hace conversión de unidad, divisas ni impuestos.
  El guardado conserva las validaciones y RPC existentes.
- Registro de venta: consulta por cada producto del pedido, sin modificar
  los precios heredados del pedido ni crear otra vía de edición.
- Estados de carga, vacío, error recuperable y fechas inválidas explícitos.

## Límites verificables del modelo existente

Las ventas/cotizaciones comerciales actuales no tienen columna de moneda ni
de descuento por línea y el adaptador fiscal usa PEN. La RPC informa PEN y
la pantalla aclara que no hay descuento persistido; no infiere descuentos
comparando con el catálogo. USD pertenece a otros modelos, como Compras o
cotizaciones de Reparaciones, y no se mezcla con estas ventas.

No hay un campo de vendedor independiente. Se muestra **Registrado por**
con el UUID verificable de `sales.created_by`; no se atribuye automáticamente
esa identidad al vendedor ni se expone Auth o nombres de terceros.
Una ampliación multimoneda o de vendedores debe modificar el modelo comercial
en otra tarea; este historial no inventa esas capacidades.

## Verificación reproducible

En un checkout con dependencias de los lockfiles:

```text
cd frontend
npm run lint -- --deny-warnings
npm run build
npm test
npm run test:e2e:typecheck
node scripts/test-repair-accessories.mjs --all-sql --workflow-e2e
```

El último comando crea un proyecto desechable, verifica identidad/volumen/puertos,
aplica las 181 migraciones base y la nueva, valida SQL y ejecuta flujos reales.
En Windows, SILSAN_AUDIT_TEMP debe apuntar a una carpeta accesible a Docker,
fuera del repositorio y de AppData virtualizado. No usar db reset ni migrar
los stacks originales.

El CI de Reparaciones conserva todas sus suites y añade la nueva suite SQL
y el E2E del historial. El test de JWT obtiene un token real, consulta con él,
revoca su sesión y vuelve a enviar exactamente ese token no expirado:
espera HTTP 200 antes y HTTP 403 / SQLSTATE 42501 después.

Los artefactos del runner contienen manifiesto SHA-256 de migraciones, logs
de pg_prove, resultados SQL y Playwright y captura del historial de cliente.
Los archivos de resultados locales no se versionan ni contienen credenciales.

Resultados locales de la versión final:

- 182 migraciones aplicadas desde cero (181 base + esta funcionalidad).
- 126 suites SQL, 5.247 aserciones aprobadas; 30 corresponden al historial nuevo.
- 36 E2E aprobados en la repetición final, sin omitidos ni reintentos fallidos.
- La ejecución ampliada anterior aprobó 58 E2E, incluidos los flujos completos
  de compras, inventario, ventas y distribución.
- 1.154 pruebas unitarias/de componentes aprobadas.
- Lint con deny-warnings, typecheck/build, typecheck E2E y scripts backend aprobados.
- SHA-256 de la migración comprobado contra el manifiesto ejecutado:
  `935962d062e73ca1c59755e46472bcce4bccca11bbdf43e39f5b6a653f0ff375`.

El CI remoto se consulta sobre el HEAD del PR; estos resultados locales no
sustituyen sus checks. No se han migrado bases persistentes ni desplegado servicios.

## Rendimiento

La consulta conserva el orden indexado de ventas y realiza búsquedas laterales
por venta. OFFSET 0 impide que el optimizador aplaste esas subconsultas y
evalúe RLS sobre todo el historial antes del LIMIT. No cambia políticas ni
usa SECURITY DEFINER como atajo.

Medición local con 1.000 ventas adicionales del mismo cliente/producto,
usuario authenticated, sesión activa y RLS habilitado, 21 resultados:
consulta inicial 12.716,608 ms; consulta lateral 414,893 ms. Ambos ensayos
crearon datos dentro de una transacción y finalizaron con ROLLBACK. Estos
tiempos dependen del equipo y no constituyen un SLA.

La paginación usa desplazamiento; páginas muy profundas y búsquedas con pocos
resultados pueden recorrer más registros. Si el volumen comercial lo requiere,
se puede evolucionar a cursor sin cambiar la fuente histórica ni la seguridad.
