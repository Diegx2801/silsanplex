# Inventario: transferencias y valorización

Validación local del 15 de octubre de 2026. Alcance aprobado: transferencias entre almacenes y entre ubicaciones del mismo almacén; simplificación del formulario y total del movimiento en Kardex. Sin rediseñar compras, ventas ni ajustes.

## Implementado

- Posición de origen explícita: ubicación, lote, vencimiento y condición se recuperan del stock existente. No se sustituyen por FEFO durante el traslado.
- Destino activo explícito, diferente del origen; admite el mismo almacén si cambia la ubicación.
- Referencia automática del servidor y revisión previa con cantidad capturada y equivalencia en unidad base.
- Conversión autoritativa en servidor, respeto de reservas y conservación de cantidad/valor globales. Salida y entrada atómicas, con la captura histórica de unidad en ambas.
- UUID estable por intento para evitar duplicados en reintentos; bloqueo de doble clic y errores visibles.
- Kardex destaca el importe contabilizado y mantiene el costo por unidad base como información secundaria.
- Se conservaron componentes, estilos y patrones del proyecto. Se verificó el resumen en escritorio y móvil sin ejecutar transferencias sobre datos operativos.

## Salvedades encontradas

1. Existen saldos históricos de Paracetamol (`PROD-00001`) expresados en Caja y Unidad para una misma posición. Las transferencias bloquean posiciones incompatibles en origen o destino. Los alias reconocidos de una misma unidad no constituyen una conversión. No se modificó el historial ni se asumió una equivalencia retroactiva: la conciliación necesita una decisión separada.
2. La batería global de base de datos ejecutó 103 archivos y 3393 comprobaciones, pero no quedó completamente verde. Los seis archivos que reportaron fallos son:
   - `authorization_permissions.test.sql`: expectativas de permisos sin `INVENTORY_EXPORT`.
   - `inventory_kardex_determinism.test.sql`: expectativas de saldo acumulado distintas de la vista vigente por posición/lote.
   - `inventory_kardex_history_permissions.test.sql`: contrato anterior sin columnas de captura y código de error anterior para servicios.
   - `purchasing.test.sql`: entrada de prueba sin costo unitario.
   - `sales_quotes_persistence.test.sql`: fecha fija de cotización vencida.
   - `service_inventory_guard.test.sql`: expectativa de código de error anterior para productos de tipo servicio.

Estos archivos no se modificaron dentro de este trabajo. Sus fallos impiden afirmar que la batería global completa está aprobada; no deben ocultarse cambiando reglas del producto para satisfacer expectativas antiguas.

## Comprobaciones específicas

- Resultado: 214 pruebas de Inventario/Reportes y 73 comprobaciones SQL específicas aprobadas; TypeScript, Vite y lint correctos.
- Pruebas de interfaz, contrato, servicio y estado de Inventario/Reportes.
- Pruebas SQL de posición exacta, mismo almacén, lote posterior sin sustitución, unidades capturadas, reservas, estados sanitarios, vencidos, permisos, folio e idempotencia.
- Pruebas con dos sesiones: entrada manual simultánea, salida FEFO simultánea, reintento concurrente y competencia por el saldo de origen.
- Compilación TypeScript/Vite y lint. Persiste el aviso previo de tamaño del paquete de Distribución, fuera del alcance.
- Las pruebas nuevas SQL usan una transacción con rollback o un tenant de prueba fijo con limpieza al terminar. No se reinició ni se sembró de nuevo la base de datos.
