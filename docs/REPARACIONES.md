# Gestión de Reparaciones

## Alcance

El módulo `Reparaciones` permite registrar órdenes de servicio y seguirlas desde
la recepción del equipo hasta la entrega. La lista usa paginación y filtros
server-side sobre `public.repair_list`; el detalle consulta diagnósticos,
versiones de cotización, repuestos, consumos, pruebas y eventos.

Las colecciones del detalle se recorren en páginas de 500 filas con conteo
exacto y orden estable. Si el número recuperado no coincide con el conteo, la
carga falla de forma explícita. Los consumos agrupan hasta 100 IDs de repuesto
por consulta. Las cotizaciones cargan todas sus cabeceras y solo las líneas de la
versión vigente al abrir el detalle. El selector de versiones solicita las líneas
de una cotización histórica bajo demanda, paginadas por su `quote_id`, y conserva
el resultado en caché para inspecciones posteriores.

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
salida atómica mediante `consume_repair_part`. Creación, guardado o revisión de
cotizaciones y reserva de repuestos persisten datos, versión y `operation_key` en
`sessionStorage` antes del RPC. La intención se aísla por organización, usuario,
reparación y comando, y se recupera al cerrar, reabrir o recargar la pestaña. Solo
una confirmación o un rechazo definitivo elimina el pendiente. La reserva conserva
lote y vencimiento; no se permite reservar ni consumir un bucket vencido.

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
de repuestos.

El selector de almacenes de la reserva también usa búsqueda remota y páginas de
25 registros. Las ubicaciones activas se consultan paginadas dentro de un único
almacén; FEFO continúa eligiendo la ubicación asignable de la reserva. El detalle
resuelve almacén y ubicación directamente por organización e ID, sin filtrar por
estado, para mostrar correctamente referencias históricas inactivas. Los técnicos
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
permiso y organización activos. Registrar una solución exige simultáneamente
`REPAIRS_CHANGE_STATUS` y `REPAIRS_PERFORM_TECHNICAL`; el responsable se resuelve
desde `technician_id`, el técnico asignado o el actor y se valida con la misma
capacidad antes de modificar la reparación. Las integraciones con `service_role`
deben enviar `technician_id` cuando la reparación todavía no tiene técnico asignado.

Despliegue: aplicar `20260905010000_add_repair_technician_role.sql`, desplegar
la Edge Function `admin-users` y publicar el frontend. La asignación utiliza
las operaciones existentes de administración y queda en su auditoría.
## Precio mínimo de repuestos

Las cotizaciones conservan `exchange_rate_to_pen`, expresado como PEN por una
unidad de la moneda cotizada. En PEN el valor es siempre `1`; en USD debe enviarse
un valor positivo explícito. PostgreSQL convierte cada precio unitario a su valor
final en PEN, incluyendo el impuesto cuando corresponde, y lo compara sin
redondeo previo con `products.minimum_sale_price`.

Cada línea de repuesto conserva el mínimo PEN vigente y el precio comparable
calculado. Cambios posteriores en el catálogo o en el tipo de cambio no alteran
documentos ya guardados. Las cotizaciones USD heredadas siguen siendo legibles
con tipo de cambio nulo, identificado en la interfaz como histórico no registrado;
deben indicar un tipo de cambio si vuelven a editarse.

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

## Accesorios del equipo — R06/R33

Los accesorios son pertenencias en custodia, independientes del inventario y de
los repuestos. La migración `20261029010000_repair_accessory_control.sql` incorpora
`repair_accessories` y `repair_accessory_returns`. Los saldos se derivan de las
devoluciones append-only; nunca se modifica stock ni FEFO al recibir o devolver
accesorios.

En **Datos adicionales de recepción** se pueden registrar hasta 100 accesorios,
con nombre y cantidad entera positiva (máximo 1.000.000 por fila), condición y
observaciones opcionales. La orden y su listado se crean en la misma transacción
idempotente. `Notas de recepción` conserva observaciones generales del equipo.

Las notas históricas no se interpretan. `accessories_reviewed_at IS NULL` indica
que no hay revisión estructurada; una recepción explícita con lista vacía es
válida y no crea obligaciones. Los pendientes antiguos en `sessionStorage`
conservan la omisión del campo y su fingerprint original.

En **Accesorios recibidos y devolución**, `REPAIRS_UPDATE` permite altas,
correcciones y anulaciones explícitas con motivo antes de cualquier devolución y
en estados no terminales. No se reemplaza toda la colección ni se borran filas.
Después de devolver, las correcciones ordinarias de recepción quedan bloqueadas.
Una devolución confirmada no dispone de eliminación ni rectificación implícita.

`REPAIRS_DELIVER` permite devoluciones parciales o totales, también en órdenes
canceladas/rechazadas y después de una entrega excepcional, sin reabrir la orden.
Los responsables y fechas provienen de la sesión y del servidor. Estos comandos
nuevos requieren un usuario autenticado; no aceptan actores delegados mediante
`service_role`.

### Contratos

- `create_repair(jsonb)` admite `accessories` opcional con filas
  `{name, quantity_received, received_condition?, observations?}`. Omitir el campo
  conserva el contrato anterior; `[]` registra una recepción revisada sin filas.
- `save_repair_accessories(jsonb)` recibe organización, reparación, versión,
  `operation_key` y un **patch** `accessories`. Sin `id` agrega; con `id` corrige;
  `{id, void: true, reason}` anula. `[]` no borra accesorios existentes.
- `update_repair(jsonb)` conserva la edición anterior. Si incluye `accessories`,
  exige también `operation_key` y audita/guarda todo atómicamente.
- `record_repair_accessory_return(jsonb)` recibe `returns` con
  `{accessory_id, quantity, observation?}`. Rechaza sobredevoluciones y conserva
  cada devolución real.
- `deliver_repair_with_accessories(jsonb)` admite devoluciones simultáneas y
  entrega ordinaria o excepción. Reutiliza los gates técnicos actuales.
- `get_repair_accessories(uuid, uuid)` devuelve revisión, versión, accesorios,
  saldos y devoluciones completas bajo el permiso de consulta.

Los comandos nuevos tienen replay persistente por organización y operación. Un
payload distinto con la misma clave se rechaza. Todos bloquean el agregado y
avanzan `lock_version` una sola vez por operación; el frontend conserva intención,
clave y versión antes del envío. Hay recuperación de entrega pendiente incluso
cuando el primer intento ya dejó la orden entregada.

### Política de entrega

La entrega ordinaria, incluida la RPC anterior `deliver_repair`, rechaza
accesorios estructurados pendientes. Esto no cambia el gate compartido para
marcar la orden lista para entrega.

La excepción exige simultáneamente `REPAIRS_DELIVER` y
`REPAIRS_AUTHORIZE_ACCESSORY_EXCEPTION`, un motivo no vacío y confirmación
explícita en la interfaz. El permiso especial se concede inicialmente solo a
`ADMIN` y no es asignable mediante la selección operativa ordinaria de usuarios.
La autorización comprueba permisos efectivos, nunca nombres de rol en React.

`ACCESSORY_DELIVERY_EXCEPTION` conserva motivo, actor y snapshot de pendientes.
No simula devoluciones. La regularización posterior usa la RPC de custodia,
mantiene `delivered` y conserva tanto el evento original como el posterior.

### Pruebas aisladas

Desde `frontend/`, con Docker y dependencias instaladas:

```text
npm run test:repairs:isolated
npm run test:repairs:isolated -- --sql-only --upgrade
npm run test:repairs:isolated -- --sql-only --all-sql
npm run test:repairs:isolated -- --checks-only
```

El runner crea un proyecto exclusivo, verifica su contenedor/volumen y usa los
puertos 59321/59322/59325. No carga `.env` empresariales, no reutiliza el servidor
5173 y no resetea bases existentes. Conserva logs, TAP, JSON y capturas en un
directorio temporal; elimina solo sus recursos desechables verificados.

Las pruebas nuevas de navegador viven en `frontend/tests/accessory-e2e/` y se
ejecutan mediante este runner y el workflow E2E, separadas de Vitest. Se ejecutan
también los seis escenarios originales de `tests/e2e/repairs.spec.ts`.

El resultado y las evidencias locales están en
`RESULTADO_R06_R33_ACCESORIOS.md`.
