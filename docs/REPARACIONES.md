# Gestión de Reparaciones

## Alcance

El módulo `Reparaciones` permite registrar órdenes de servicio y seguirlas desde
la recepción del equipo hasta la entrega. La lista usa paginación y filtros
server-side sobre `public.repair_list`; el detalle consulta diagnósticos,
versiones de cotización, repuestos, consumos, pruebas y eventos.

La ruta es `/reparaciones` y se carga de forma lazy. La navegación y la ruta
requieren `REPAIRS_VIEW`.

## Flujo

Los estados del dominio son:

`received`, `diagnosis`, `quote_pending`, `waiting_customer_approval`,
`quote_approved`, `in_repair`, `awaiting_parts`, `testing`,
`ready_for_delivery`, `delivered`, `cancelled`, `rejected` y `warranty`.

Los cambios comunes usan `change_repair_status`. Las acciones especializadas
usan sus propias RPC:

- `create_repair` y `update_repair` para los datos de la orden.
- `assign_repair` para asignar un técnico activo.
- `record_repair_diagnosis` para cada diagnóstico.
- `save_repair_quote` para borradores, envío y nuevas versiones.
- `approve_repair_quote` y `reject_repair_quote` para la respuesta del cliente.

  Estos dos RPC requieren el JWT de un usuario `authenticated`, una sesión activa
  y el permiso `REPAIRS_APPROVE_QUOTE` en la organización solicitada. El actor de
  aprobación o rechazo se obtiene de `auth.uid()` y queda registrado en la
  cotización y su historial. `service_role` no tiene permiso de ejecución, incluso
  si su JWT incluye `sub`; no existe un contrato de actor delegado para estos RPC.
  Las integraciones deben transmitir la sesión del usuario autorizado. Esta regla
  también mantiene el control de versión mediante `requested_expected_lock_version`.
- `reserve_repair_part`, `consume_repair_part` y `cancel_repair_part` para repuestos.
- `record_repair_test` para las pruebas previas a la entrega.
- `deliver_repair` y `cancel_repair` para cerrar la orden.

Reservar un repuesto no crea un movimiento de inventario. Consumirlo genera una
salida atómica mediante `consume_repair_part` y envía un `operation_key` UUID
generado al abrir el diálogo para permitir reintentos idempotentes. La reserva
conserva lote y vencimiento; no se permite reservar ni consumir un bucket vencido.

## Seguridad

El `organization_id` se obtiene desde `useAuth().access?.organizationId`. Todas
las lecturas del módulo filtran explícitamente por organización. Las escrituras
se realizan mediante RPC protegidas por los permisos `REPAIRS_*`; no se deben
añadir mutaciones directas sobre las tablas del módulo.

Los catálogos de clientes, productos, almacenes y ubicaciones solo muestran
registros activos de la organización actual. Los técnicos se obtienen mediante
`list_repair_technicians`.

## Productos serializados

`products.serial_control` se refleja como `serialControl` en el modelo de
productos. Cuando está activo, el formulario de reparación exige el número de
serie y la base de datos vuelve a validar esa regla. El campo también aparece en
el detalle del producto y en la exportación del catálogo. En la importación de
productos se acepta la columna opcional `ControlSerie`.

## Validación local

Desde `frontend`:

```bash
npm run lint
npm run test -- --reporter=default
npm run build
```

La migración y las pruebas SQL del backend son el contrato de datos del módulo y
no deben modificarse desde el frontend.
