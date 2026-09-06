# Gestión de Reparaciones

## Alcance

El módulo `Reparaciones` permite registrar órdenes de servicio y seguirlas desde
la recepción del equipo hasta la entrega. La lista usa paginación y filtros
server-side sobre `public.repair_list`; el detalle consulta diagnósticos,
versiones de cotización, repuestos, consumos, pruebas y eventos.

Las colecciones del detalle se recorren en páginas de 500 filas con conteo
exacto y orden estable. Si el número recuperado no coincide con el conteo, la
carga falla de forma explícita. Los consumos agrupan hasta 100 IDs de repuesto
por consulta. Las cotizaciones cargan todas sus cabeceras, pero las líneas se
solicitan únicamente para la versión vigente seleccionada y se paginan por su
`quote_id`.

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

Los selectores de clientes y productos consultan el catálogo activo de la
organización mediante búsqueda remota y páginas de 25 registros. El servicio
limita cada petición a 50 filas. Al editar, la referencia guardada se resuelve
por organización e ID aunque esté fuera de la página actual o se encuentre
inactiva; permanece visible como referencia histórica, pero no se ofrece como
nueva selección. Esta misma consulta paginada se usa en cotizaciones y reservas
de repuestos. Almacenes y ubicaciones muestran registros activos. Los técnicos
se obtienen mediante `list_repair_technicians`.

## Productos serializados

`products.serial_control` se refleja como `serialControl` en el modelo de
productos. Cuando está activo, el formulario de reparación exige el número de
serie y la base de datos vuelve a validar esa regla. El campo también aparece en
el detalle del producto y en la exportación del catálogo. En la importación de
productos se acepta la columna opcional `ControlSerie`.

## Habilitar técnicos

En Administración de usuarios, al invitar o editar una cuenta, seleccionar
**Técnico de reparaciones** (`TECNICO_REPARACIONES`). Para una cuenta dedicada
exclusivamente al trabajo técnico, dejar seleccionado solo ese rol: los permisos
de los distintos roles de una cuenta se acumulan.

El rol permite consultar reparaciones de la organización, figurar como técnico
asignado, registrar diagnósticos, soluciones y pruebas, y ejecutar las transiciones
permitidas por `REPAIRS_CHANGE_STATUS` (incluida cancelación según el contrato
existente). No concede `USERS_MANAGE`, asignación de técnicos, creación/edición
comercial, aprobación de cotizaciones, gestión de repuestos ni entrega. ADMIN
conserva sus permisos. La capacidad técnica requiere cuenta, membresía, rol,
permiso y organización activos.

Despliegue: aplicar `20260905010000_add_repair_technician_role.sql`, desplegar
la Edge Function `admin-users` y publicar el frontend. La asignación utiliza
las operaciones existentes de administración y queda en su auditoría.
## Precio mínimo pendiente

P1C no aplica `products.minimum_sale_price` a las cotizaciones de Reparaciones.
El catálogo expresa ese mínimo como precio final por unidad base en PEN, mientras
que Reparaciones admite cotizaciones en PEN y USD y todavía no conserva un
snapshot de tipo de cambio adecuado. El enforcement debe abordarse en una fase
separada después de definir y persistir ese snapshot; no se debe comparar usando
un tipo de cambio vigente ni convertir documentos históricos.

## Validación local

El detalle muestra el número del ciclo de pruebas vigente y sus resultados
separados del historial. Al volver a entrar en pruebas después de un retrabajo,
el nuevo ciclo empieza sin resultados. Las aprobaciones anteriores no habilitan
la entrega; las pruebas antiguas sin ciclo identificado se conservan como
historial. El E2E principal verifica fallo, retrabajo, nuevo ciclo y entrega.

El E2E de catálogos prepara 1.001 clientes y productos deterministas y verifica
que la pantalla cargue solo una página, permita avanzar y buscar en el servidor,
registre el elemento 1.001, resuelva un cliente histórico inactivo al editar y
encuentre el producto desde el selector de repuestos.

Los E2E de Reparaciones están en `frontend/tests/e2e/repairs.spec.ts`. Desde
`frontend`, ejecutar `npm run test:e2e:local -- repairs.spec.ts` para preparar
identidades locales y probar el flujo en Chromium, o `npm run test:e2e:local`
para ejecutar toda la suite. El preparador genera `E2E_REPAIRS_EMAIL` y
`E2E_REPAIRS_PASSWORD` en `.env.e2e.local`; no se versionan credenciales.
`npm run test:e2e:typecheck` comprueba los tipos de las pruebas.

La cobertura y los pendientes de liberación se detallan en
`AUDITORIA_REPARACIONES_2026-09-05.md`.

Desde `frontend`:

```bash
npm run lint
npm run test -- --reporter=default
npm run build
```

La migración y las pruebas SQL del backend son el contrato de datos del módulo y
no deben modificarse desde el frontend.
