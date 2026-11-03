# Gestión de Reparaciones

## Costo real de reparación — R14

La sección **Costo real de reparación** registra evidencia de costos incurridos:
repuestos consumidos, servicios externos, mano de obra interna y otros gastos.
Las cotizaciones son precios comerciales y no se usan para calcular este costo.
Tampoco se deducen salarios, horas trabajadas ni tarifas desde tiempos calendario,
diagnósticos, soluciones o pruebas.

### Estados, alcance y corte

- **Costo no determinado** (`undetermined`): todavía no hay fuentes acreditadas
  ni una revisión vigente que justifique un costo cero. Ausencia de registros no
  significa gratuidad.
- **Costo parcial registrado** (`partial`): existen importes acreditados, pero
  falta revisar el alcance, quedan fuentes pendientes, hay bases incompatibles o
  cambiaron las fuentes después de la revisión anterior.
- **Costo real confirmado** (`confirmed`): un usuario con capacidad específica
  confirmó expresamente el alcance completo de las fuentes económicas a una
  fecha de corte generada por PostgreSQL después de bloquear la reparación.
  No significa pago, factura, cierre contable ni finalización técnica.

La revisión declara cada categoría como completa cuando tiene fuentes, o no
aplicable cuando no las tiene, con evidencia y justificación obligatorias. Un
alcance sin fuentes solo puede confirmar cero mediante esa declaración explícita
y una moneda indicada. Los importes manuales cero también requieren evidencia;
un cero heredado de inventario permanece desconocido.

La huella de revisión contiene las identidades y revisiones económicas, no el
estado, técnico asignado ni eventos técnicos. Un nuevo consumo, servicio, gasto,
corrección o anulación invalida la revisión anterior. Añadir y luego anular una
línea tampoco reactiva una revisión antigua. Una reasignación, prueba, entrega o
cambio técnico sin cambios económicos conserva la revisión. El historial mantiene
la evidencia y el corte anteriores, aunque ya no estén vigentes.

### Monedas, bases y precisión

PEN y USD permanecen separados: no hay moneda por defecto para inventario,
conversión automática ni uso del tipo de cambio de una cotización. Una revisión
completa multimoneda puede estar confirmada con subtotales PEN/USD y `total: null`;
la interfaz indica que no existe un total único.

Las bases son incluye impuestos (`tax_inclusive`), sin impuestos
(`tax_exclusive`) y no afecto/no aplica (`not_applicable`). Esta última es neutral
si se combina con una sola base gravada. Dos bases gravadas diferentes se muestran
por separado y bloquean la confirmación; no se inventa un impuesto para conciliarlas.

Los registros manuales admiten importes finitos no negativos de hasta dos
decimales y 16 dígitos enteros; el costo externo conserva su límite existente de
12 dígitos enteros. PostgreSQL usa `numeric`, conserva el producto exacto de la
cantidad consumida por su costo unitario histórico (hasta siete decimales) y suma
sin redondeo intermedio. Los importes de las RPC viajan como texto decimal. La
interfaz no los suma con `Number`: muestra todos los decimales significativos,
con un mínimo de dos, sin recortar fracciones ni perder enteros grandes.

### Procedencia y originales

Una reserva sin consumo no es costo incurrido. Cada consumo se cuenta una vez,
contrastando su snapshot con el movimiento de salida y la cantidad acumulada del
repuesto. Los consumos de una reserva posteriormente cancelada permanecen. Una
inconsistencia del ledger o del movimiento bloquea la confirmación.

La acreditación de inventario admite únicamente buckets de entradas de compra
físicas, documentadas y homogéneas en moneda/base, con recepción, orden, producto,
almacén, ubicación, cantidad y costo coherentes. Reconstruye el promedio anterior
al consumo usando `ledger_sequence` y exige que coincida con el costo guardado.
Conserva el corte y las referencias de procedencia. Entradas posteriores no
revaloran consumos ya acreditados. FEFO sigue siendo selección física, no un
costeo monetario FIFO.

La acreditación comprueba ambos padres de la línea recibida: su línea de orden
debe pertenecer a la misma orden que la cabecera de recepción. Contrasta producto,
costo y snapshot tributario de la línea, almacén de cabecera/partida, ubicación,
estado de entrada disponible, lote y vencimiento. La comparación de lote conserva
la regla canónica del bucket (`lower(coalesce(lot,''))`), sin equiparar lotes o
vencimientos distintos. Un documento contradictorio expone el pendiente
`inventory_documentary_inconsistent`: la verificación se rechaza atómicamente y
el alcance completo queda bloqueado, conservando los subtotales independientes.

Stock manual, transferencias, reclasificaciones, mezclas de monedas/bases, ceros
históricos y entradas sin respaldo suficiente no se certifican con una etiqueta
de moneda y una nota: permanecen pendientes. No se reescribe ni se revalora el
inventario para resolverlos. La migración no hace backfill económico especulativo.

Un servicio externo pendiente de retorno tiene costo desconocido. El costo
declarado al retorno conserva importe y moneda originales y requiere evidencia
de su base económica. **Revisar costo externo** agrega una revisión trazable y
reemplaza el importe efectivo, sin sumar el original otra vez ni cambiar proveedor,
custodia o fechas. No registra un pago. Mano de obra y otros gastos se corrigen o
anulan mediante sucesores inmutables con motivo, respaldo, actor y fecha servidor.
Las referencias deben identificar documento y línea: una referencia ya registrada
no se puede usar para crear otra raíz económica en la misma reparación.

Los costos pueden registrarse o corregirse después de entrega, cancelación,
garantía o devolución sin reparar. Esas acciones económicas no reabren la orden
ni cambian R28, finalización técnica R13, entrega física o fechas de garantía.
Una devolución sin reparar tampoco implica costo cero.

### Capacidades y contrato técnico

`REPAIRS_VIEW` permite consultar costos de las reparaciones autorizadas, con RLS
por organización. Las lecturas económicas no conceden acceso general a inventario
o compras. Se mantienen los alcances existentes de consulta del módulo.

Las capacidades **Registrar y revisar costos reales**
(`REPAIRS_MANAGE_ACTUAL_COST`) y **Confirmar revisión de costos reales**
(`REPAIRS_CONFIRM_ACTUAL_COST`) son distintas; ambas dependen de `REPAIRS_VIEW`.
Gestionar no concede confirmar y confirmar no concede gestionar. No forman parte
de “Operar reparaciones” ni se asignan automáticamente a ADMIN, VENTAS o técnicos.
El propietario debe asignarlas expresamente desde Administración de usuarios a
una cuenta operativa. El mecanismo administrativo existente no permite permisos
directos en cuentas ADMIN; se conserva esa regla.

La migración aditiva `20261101010000_repair_actual_cost.sql` crea
`repair_actual_cost_entries`, `repair_cost_source_reviews` y
`repair_actual_cost_reviews`, append-only y sin DML directo para clientes. Las RPC
de escritura son `record_repair_actual_cost`, `revise_repair_actual_cost`,
`verify_repair_cost_source`, `revise_repair_external_cost` y
`confirm_repair_actual_cost_review`. Exigen usuario autenticado, sesión activa,
organización, permiso efectivo, clave de operación y versión del agregado; el
actor y las fechas de registro se resuelven en servidor. `incurred_on` es una fecha
declarada no futura en Lima, distinta de la fecha servidor de registro.

Los comandos revalidan sesión/capacidad antes del replay; una repetición exacta
conserva resultado, versión, eventos y auditoría. La intención se guarda por
organización/usuario/reparación en `sessionStorage` antes de enviar, y se recupera
con datos, clave y versión originales tras recarga o pérdida de respuesta. Un
fallo de almacenamiento impide el envío. `service_role` no ejecuta estas RPC ni
existe una excepción por rol ADMIN.

`get_repair_actual_cost_summaries` recibe hasta 50 IDs de la página visible en
una sola llamada. `get_repair_actual_cost_detail` obtiene resumen, fuentes e
historial bajo una única sentencia/snapshot, con páginas de hasta 50 registros
(25 en la UI). El resumen agrega todas las fuentes en SQL, incluso más de 100;
no suma páginas cargadas en el navegador. Ambas secciones son de carga diferida.
Los conteos y la consulta paginada técnica existentes no evalúan el costo real.

### Validación aislada R14

Desde `frontend`, el runner conserva copias, credenciales y evidencia en un
proyecto Supabase descartable exclusivo, separado de las bases de trabajo:

```sh
npm run test:repairs:isolated -- --sql-only --upgrade-actual-cost
npm run test:repairs:isolated -- --actual-cost-only
npm run test:repairs:isolated -- --all-sql --workflow-e2e
npm run test:repairs:isolated -- --checks-only --edge-checks
npm run test:repairs:isolated -- --sql-only --benchmark-actual-cost
```

La actualización prepara consumos y servicios reales en el esquema previo y
comprueba que fuentes, eventos, R13 y garantía no cambian ni se infieren costos.
Después de guardar esa evidencia, restablece únicamente su proyecto descartable
para ejecutar las suites de regresión con su baseline de inventario vacío.
Las suites R14 cubren precisión, procedencia, permisos/RLS, replay, correcciones,
alcance y carreras entre edición, confirmación, consumo y retorno de proveedor.
El runner normal incorpora los E2E R14 junto a Reparaciones, R06/R33, R28 y R13.

El E2E administrativo utiliza la pantalla real de Usuarios y la Edge Function
`admin-users` del proyecto descartable: configura una cuenta operativa sin
capacidades económicas, comprueba rechazos y después registra/confirma con los
permisos asignados. Su CORS permite únicamente el origen del navegador aislado;
no modifica las reglas CORS publicadas ni asigna permisos por nombre de rol.

El historial económico muestra importe/moneda y base anteriores y de cada revisión,
valor efectivo vigente o registro histórico, y las cuatro categorías de alcance
de cada confirmación con su vigencia. Los datos se obtienen de las mismas tablas
inmutables, incluyendo predecesores situados fuera de la página actual.

El benchmark guarda 48 planes `EXPLAIN (ANALYZE, BUFFERS)` con sesión/RLS, tres
repeticiones, 1.200 órdenes, páginas de 10 con OFFSET 10 y 5/100/500 fuentes
económicas, además de 500 eventos técnicos de ruido. Contrasta conteo y página
técnica, página con resumen batch y detalle económico. Comprueba importes exactos,
equivalencia ante ruido y rollback sin organización sintética residual. No define
un SLA de producción ni cambia los contratos de autorización.

La ampliación mixta conserva esos 48 planes y agrega 60: página con las columnas
reales del frontend, página + batch, detalle, conteo y RPC real de verificación de
procedencia, tres repeticiones. En un segundo rollback hay 1.200 órdenes, 20 con
cinco fuentes reales y una orden de la página visible que crece a 100/500 fuentes,
aproximadamente un cuarto de cada categoría. Compras, recepciones, reservas,
consumos y servicios se crean por sus RPC; se incluyen stock sin origen monetario
acreditado, servicios sin base verificada y revisiones sucesivas. Una referencia
decimal independiente comprueba subtotales e IDs solicitados. El escenario con
ruido agrega 500 eventos técnicos por orden activa y exige equivalencia económica.
Se guardan 108 planes, medianas y composición de fixtures; no se deduce un SLA.

## Finalización técnica — R13

La finalización técnica se registra al pasar válidamente de `testing` a
`ready_for_delivery`, después de superar el gate técnico existente. Aprobar una
prueba no finaliza por sí solo la reparación. La fecha canónica es `created_at`
del mismo evento `STATUS_CHANGED`, generado por PostgreSQL; no existe una fecha
editable ni una columna duplicada en `repairs`.

La metadata versión 1 conserva ciclo, técnico asignado y nombres históricos
disponibles del técnico y del actor. El actor se conserva en `actor_user_id` y el
identificador en el propio `repair_events.id`; no se crea otro evento de cierre.
La auditoría de cambio de estado conserva esa misma metadata.

`repair_list`, con `security_invoker`, expone `technical_completion` y
`first_technical_completion`. La proyección invoker `repair_technical_completions`
respeta RLS y recorre eventos por ID, no por timestamps. Devuelve IDs bigint como
texto. En listo/entregado conserva la finalización verificable; al volver a
reparación retira su vigencia inmediatamente, aunque todavía no haya aumentado
el contador del ciclo. La primera finalización verificable permanece histórica.
Eventos sin cambio de estado no invalidan la finalización. Los históricos sin
evidencia suficiente, con ciclos contradictorios o pruebas ambiguas devuelven
NULL. No se reconstruyen fechas desde entrega, devolución, actualización o pruebas.
Los responsables históricos desconocidos nunca se rellenan con el técnico actual.

Una discontinuidad conocida queda marcada para toda reconstrucción legacy; entrar
de nuevo a `testing` no borra esa marca. Una certificación explícita versión 1,
generada por el servidor al superar el gate, puede anclar un ciclo posterior
internamente continuo. No valida retrospectivamente el ciclo contradictorio.
Para cierres legacy, una consulta por conjunto exige que todas las pruebas del
ciclo estén aprobadas, tengan exactamente un evento coherente dentro del intervalo
y no existan asociaciones huérfanas o duplicadas, incluso fuera del intervalo.
No se vuelve a exigir que el técnico histórico permanezca activo hoy.

La proyección filtra los eventos sin cambio de estado en SQL y no recorre las
actualizaciones ajenas a R13. Si no existe una entrada a listo, termina sin
reconstruir historia. Las pruebas se verifican por conjunto únicamente cuando se
necesita reconstruir evidencia legacy; no hay una consulta individual por prueba.
No se añaden índices ni cachés de fechas.

La RPC anterior `change_repair_status(uuid,uuid,text,text,bigint)` sigue disponible
sin cambios de firma. El frontend actualizado usa
`change_repair_status_idempotent(jsonb)` para evitar ambigüedades de sobrecarga en
PostgREST. Recibe únicamente organización, reparación, estado, observación,
versión y `operation_key`. Revalida permisos/sesión antes del replay, reutiliza
el ledger y bloquea el agregado: un replay exacto no cambia versión, evento ni
fecha. Claves diferentes con versión obsoleta generan conflicto. La intención
se persiste por organización/usuario/reparación antes del envío y se recupera
con datos, versión y clave originales incluso después de un retrabajo.

El detalle diferencia recepción, estimación calendario, finalización y entrega;
los timestamps se muestran en `America/Lima`. El listado recibe la finalización
en su consulta paginada, sin peticiones de historial por fila. El detalle selecciona
solo `technical_completion_summary`: un objeto con vigente, primera e historial
`verified_technical_completions` calculados una vez. Conserva su comprobación de
versión al terminar la carga. La UI etiqueta como verificables únicamente las
finalizaciones de este contrato SQL, incluidas las legacy; las transiciones
rechazadas permanecen visibles como eventos ordinarios. Los campos anteriores
de la vista siguen disponibles. Los conteos no evalúan las proyecciones.

No reparable y devolución sin reparar no constituyen una reparación completada.
R28 conserva decisión, fecha y responsables propios. Su reevaluación requiere
nuevas pruebas y una nueva entrada válida a listo. La garantía sigue comenzando
exclusivamente en `delivered_at`, nunca en la finalización técnica.

La migración aditiva es `20261031010000_repair_technical_completion.sql`. El runner
descartable ejecuta también las nuevas suites R13. Admite
`--upgrade-technical-completion --sql-only` para aplicar R13 sobre el esquema
anterior con historia real de finalización y comprobar que no se reescriben los
eventos ni se inventan finalizaciones; `--technical-completion-only` ejecuta sus
E2E. Conserva planes `EXPLAIN ANALYZE` con RLS sobre 1.200 órdenes / 6.000 eventos,
dentro de una transacción que se revierte, y mantiene el aislamiento de las suites
operativas, R06/R33 y R28.

`npm run test:repairs:isolated -- --sql-only --benchmark-technical-completion`
compara, con idénticos datos y RLS, la vista anterior a R13, una referencia congelada
de R13 sin corregir y la proyección actual. Mide tres repeticiones de listado
completo (10 filas/OFFSET 10), conteo y detalle con 5, 100 y 500 eventos por orden
recorrida; también mide cierres reales con 500 actualizaciones previas, filtros y
paginación sin OFFSET. Guarda los 104 planes con buffers y sus medianas. Comprueba
igualdad de resultados en los datos válidos, cero reconstrucciones para conteos,
una para el nuevo detalle y un máximo de página más OFFSET para el listado.
La referencia de prueba se instala solo en una transacción descartable. Esta
medición sintética no define un SLA ni modifica la autorización transversal.

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

## No reparable — R28

`20261030010000_repair_non_repairable.sql` añade `non_repairable` (pendiente de
devolución) y `returned_unrepaired` (devuelto sin reparar). La conclusión técnica
se conserva en un evento inmutable, con diagnóstico/snapshot, motivo, técnico y
actor de sesión. `repairs.non_repairable_decision_event_id` identifica la decisión
vigente; su ID se expone como texto para no perder precisión bigint en el navegador.

Contratos JSON, todos con `organization_id`, `repair_id`, `operation_key` y
`expected_lock_version`:

- `declare_repair_non_repairable`: exige `diagnosis_id` de la orden y `reason`.
  Solo el técnico asignado activo, con `REPAIRS_CHANGE_STATUS` y
  `REPAIRS_PERFORM_TECHNICAL`, puede confirmar. ADMIN no tiene bypass por rol.
  Las reservas con saldo bloquean; se resuelven mediante los comandos existentes.
- `return_unrepaired_repair`: exige `decision_event_id`; reutiliza `returns`,
  `authorize_exception` y `exception_reason` de accesorios. Requiere
  `REPAIRS_DELIVER`; la excepción exige además el permiso especial de R06/R33.
  Bloquea custodia externa y reservas. No exige pruebas exitosas ni solución
  ficticia: registra `returned_unrepaired_at` sin establecer `delivered_at`.
- `reopen_repair_non_repairable_assessment`: exige `decision_event_id` y `reason`,
  con el mismo técnico/capacidades de declaración. Solo antes de devolver,
  conserva diagnóstico y conclusión anteriores, registra su revocación y vuelve
  a `diagnosis`. Las pruebas anteriores no habilitan un nuevo ciclo.

Las nuevas RPC requieren sesión autenticada real; `anon` y `service_role` no
tienen EXECUTE. Reutilizan el ledger, replay y bloqueo/versionado del agregado.
Las funciones antiguas no permiten entrar por un cambio genérico ni editar una
orden devuelta. La reasignación autorizada sigue disponible antes de devolver,
por ejemplo si el técnico previo se desactiva; no reescribe el técnico original
de la decisión.

La declaración puede coexistir con un envío externo pendiente; el informe del
proveedor requiere adopción por el técnico interno. Su retorno sigue usando la
RPC actual. La devolución de equipo/accesorios es atómica; los pendientes de una
excepción se regularizan después sin reabrir la orden. No se añaden movimientos
de inventario del equipo, devoluciones de stock ni costos totales nuevos.

Una devolución sin reparar no inicia garantía de reparación exitosa. Una promesa
previa se conserva y se muestra como no iniciada por este resultado. Las órdenes
históricas no se reclasifican; los dos campos nuevos quedan nulos. Después de
devolver, una segunda evaluación requiere una nueva recepción.

El detalle permite declarar, reevaluar y devolver según capacidades/asignación;
recupera intenciones y claves tras respuestas ambiguas. Los filtros incluyen ambos
estados y el resumen excluye `returned_unrepaired` de abiertas.

Recuperar no inicia una intención nueva: sin pendiente informa su ausencia. Un
usuario con las capacidades técnicas conserva la posibilidad de confirmar el
replay original después de una reasignación; el servidor sigue exigiendo técnico
asignado para cualquier operación nueva. El historial B1 muestra el diagnóstico
y técnico persistidos, el actor, los motivos y la referencia de revocación,
independientemente del técnico asignado actualmente. Sus IDs se leen como texto
desde PostgREST para conservar la precisión bigint.

Los tres motivos B1 (declaración, reevaluación y excepción) recortan únicamente
blancos de los extremos con el conjunto de `String.trim()` de JavaScript, también
en PostgreSQL. Rechazan motivos visualmente vacíos y mantienen el formato interno
y el límite de 2000 caracteres. No se normalizan ni reescriben motivos históricos.

Validación aislada, desde `frontend/` (Docker y dependencias instalados):

```text
npm run test:repairs:isolated
npm run test:repairs:isolated -- --all-sql --workflow-e2e
npm run test:repairs:isolated -- --sql-only --upgrade-non-repairable
npm run test:repairs:isolated -- --non-repairable-only
```

El comando ordinario del workflow conserva SQL/Reparaciones/accesorios y añade
los nueve recorridos B1. La última opción ejecuta únicamente B1 sobre un proyecto
nuevo, para diagnóstico dirigido. Los informes JSON de cada fase son independientes.
Las pruebas de concurrencia usan sesiones `dblink` solapadas, con teardown acotado
a sus fixtures confirmados; verifican que las organizaciones iniciales no cambien.
