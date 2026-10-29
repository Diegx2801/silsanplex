# Control de stock: simplificación y validación

Fecha: 19 de octubre de 2026.

## Alcance

- Dos vistas enlazables: Stock mínimo y Vencimientos. Solo se consulta el listado activo.
- Formularios separados para Cambiar condición y Configurar alertas; se conserva el diseño y los componentes existentes.
- Mínimos por producto/almacén, sin atribuir lotes inexistentes al agregado. Cantidades y mínimos con unidad base explícita.
- Vencimientos por posición: ubicación, lote, condición, fecha legible y cantidad/unidad; identidad React incluye condición.
- Limpiar filtros restaura búsqueda, almacén, orden, fechas, estado y paginación de la vista activa.
- La configuración no pierde el borrador al refrescar y ofrece reintento de consulta.
- Cambio de condición desde una posición existente, sin transcribir lote/vencimiento ni pedir documentos/observaciones. Un motivo, cantidad/unidad, disponibilidad no reservada y revisión previa.
- Conversión validada en servidor; captura histórica de unidad y factor en los dos movimientos. Mantiene costo y stock físico total.
- UUID estable por confirmación y reintentos, comprobación de payload y registro privado transaccional. El RPC conserva compatibilidad con integraciones antiguas sin clave; el servicio actual siempre envía clave.

## Validación ejecutada

- Compilación de producción y TypeScript: correctos. Vite conserva avisos de chunks grandes en otros módulos.
- Pruebas de los tres componentes nuevos/modificados: 19 correctas.
- Modelo y servicio de almacenes: 66 pruebas correctas.
- Reejecución final de componentes, hook, modelo y servicio: 88 pruebas correctas, incluida propagación de la clave estable de reclasificación e invalidación de listados.
- Base de datos: 173 comprobaciones correctas en reclasificación (39 nuevas), gestión de almacenes, reservas de reparación y núcleo canónico.
- Batería frontend general: 746 correctas de 748. Dos fallos en `useOperacionesVenta.test.tsx`: la fixture vence el 30 de septiembre de 2026 y el código rechaza correctamente la cotización vencida al ejecutarse en octubre. No se cambió Ventas para ocultar ese problema del test.
- `service_inventory_guard.test.sql` conserva tres expectativas discrepantes de códigos de error en entrada/ajuste/FEFO; su caso de reclasificación pasa. No se modifican esos flujos dentro de este alcance.
- Lint de archivos modificados y detector visual estático: sin hallazgos.
- Navegador local: vistas iniciales, apertura/cierre y adaptación a 390 px revisados. Diálogo sin desbordamiento horizontal, controles y pie accesibles. La base local está vacía; no se crearon productos ni movimientos permanentes para las capturas. Las pruebas de datos usan transacciones revertidas.

## Pendiente de validación del usuario

Con productos y existencias reales de prueba: revisar equivalencias, pasar una cantidad parcial a cuarentena, liberarla, contrastar ambos movimientos en Kardex y comprobar alertas con mínimos/fechas. No equivale a una certificación global de todos los módulos.
