# SILSANPLEX — Fase 2B: diagnóstico de despachos y entregas parciales

**Fecha de auditoría:** 2026-10-21
**Alcance:** inspección estática, de solo lectura. No se ejecutaron consultas de escritura, SQL tests, Playwright, Vitest ni comandos Docker; no se alteraron bases, pedidos, hooks ni datos de prueba.

## Conclusión ejecutiva

- **A — Un movimiento de salida repartido entre dos entregas:** soportado por PostgreSQL y expuesto por React. La prueba SQL ya divide un mismo movimiento entre dos entregas distintas; falta recorrer ese contrato desde React y validar el estado agregado del pedido después de cada entrega.
- **B — Dos despachos físicos separados por sus entregas:** Ventas y su RPC permiten dos consumos parciales sucesivos. El orden exacto `despachar 2 → entregar 2 → despachar 4 → entregar 4` está bloqueado tanto en React como en PostgreSQL. React no ofrece el pedido parcial; además, el trigger `guard_distribution_order_fulfillment` rechaza insertar la primera entrega mientras quede cualquier bien sin despachar. El límite por cantidad de la RPC no reemplaza esa validación de elegibilidad.
- No hace falta cambiar reglas productivas para probar A. Se recomienda implementar primero un E2E para A. B requiere decidir si se quiere cambiar el orden operativo admitido por React antes de probar ese recorrido exacto.

## Estado de Git

Estado observado al inicio:

| Elemento | Estado |
|---|---|
| Rama | `main` |
| HEAD | `8c812d7e244f16456d12be66766866f1c5f9c3ff` |
| Referencia local `origin/main` | `df41d90` |
| Diferencia contra esa referencia local | 3 commits ahead, 0 behind; la referencia remota no se actualizó con `fetch` durante esta auditoría |
| Índice | Vacío |
| Cambio tracked previo | `M frontend/tests/e2e/operational-flow.spec.ts` (3 inserciones para buscar el pedido por número antes de inspeccionar Distribución) |
| Archivos previos sin seguimiento | `.codex/hooks.json`, `output/fase1-focused-evidence.json`, `output/fase1-full-evidence.json`, `output/fase11-1280x720.png`, `output/fase11-1440x1080.png`, `output/pdf/AUDITORIA_OFICIAL_SILSANPLEX.pdf`, `docs/FASE2A_FEFO_MULTILOTE.md`, `frontend/tests/e2e/operational-fefo-multilot.spec.ts` |

`git diff --check` y `git diff --cached --check` terminaron sin errores antes de crear este informe. No se hizo `git add`, commit, push ni fetch. Los archivos previos de Fase 2A, `.codex/` y `output/` se conservaron fuera del índice; `PED-000017` y `PED-000021` no se consultaron ni modificaron.

## Contrato de despacho parcial

La implementación efectiva está en `dispatch_order_from_reservations_unchecked` de `backend/supabase/migrations/20260908193607_a5_service_completion.sql`, llamada por el wrapper autorizado de `20260929145934_d2_consolidate_order_dispatch_contract.sql`.

| Pregunta | Capacidad real y evidencia |
|---|---|
| ¿Varias salidas físicas para una línea? | **Sí.** Cada llamada consume hasta la cantidad solicitada de las reservas activas. Si queda saldo, la reserva sigue `active`; una llamada posterior puede consumirlo. La selección recorre las reservas por vencimiento FEFO y crea un movimiento por cada fragmento consumido. (`a5_service_completion.sql`, alrededor de las líneas 1127–1222). |
| ¿2 y después 4 para un pedido de 6? | **Sí en el contrato de base de datos y en Ventas.** La RPC no exige que cada llamada complete la línea: comprueba que la cantidad solicitada no exceda el saldo activo. El SQL test existente demuestra un parcial de 6 seguido por el saldo 4 en una línea de 10; el test de finalización también cubre cantidades parciales antes del cierre. No encontré una prueba que use exactamente pedido 6 / llamadas 2 y 4. (`order_dispatch_from_reservations.test.sql`, líneas 93–145; `service_order_completion.test.sql`, líneas 181–188). |
| Estado tras el primer parcial | **Venta `registrada`, pedido `confirmado`.** `a5_finalize_order_completion` solo cambia la venta a `despachada` y el pedido a `atendido` cuando se consumió toda la cantidad de bienes y se completaron los servicios. El SQL test verifica ambos estados tras el parcial y los terminales después de completar el saldo. El estado logístico separado del pedido sigue pendiente hasta que exista despacho o actividad de Distribución. |
| Identidad de cada salida | No hay cabecera de despacho independiente. Cada `inventory_movements` identifica `source_type='order-dispatch'`, `source_id=order_item_id`, `reservation_id`, producto, almacén, ubicación, lote y vencimiento. `ORDER_DISPATCHED` conserva por operación `operation_key`, `movement_ids` y allocations. D2 materializa en movimientos nuevos `PED:<pedido>|OP:<operation_key>` como referencia documental. |
| Sobreconsumo y duplicados | **Protegidos.** Se bloquea el pedido y las reservas, se compara la cantidad solicitada con la suma pendiente de reservas `active`, se actualiza `quantity_consumed` y se marca `consumed` solo al agotarse. Una clave operativa repetida con el mismo pedido y las mismas cantidades devuelve el resultado anterior; si cambian los items, falla con `ORDER_OPERATION_KEY_REUSED`. Para cada despacho parcial distinto se requiere una clave nueva. |
| Interfaz React | **Sí para parciales sucesivos.** `DialogoDespachoPersistente` inicializa el campo con el saldo, admite `0..pendiente`, omite líneas en cero y manda la cantidad al servicio real. `PanelOperacionesVenta` muestra “Despachar bienes” cuando la venta sigue `registrada` y queda cantidad física pendiente; el servicio llama la RPC. La prueba de componente cubre el payload parcial y evita doble envío, pero no prueba dos llamadas contra PostgreSQL. |

La RPC vuelve a validar autorización: exige usuario autenticado y `DISTRIBUTION_MANAGE` más `INVENTORY_MANAGE`; la prueba SQL de autorización incluye roles sin esos permisos. El cliente React solo expone la acción si la página recibe el callback habilitado por permisos.

## Contrato de entregas parciales o múltiples

La migración `20260925120000_support_independent_distribution_shipments.sql` elimina el índice único histórico por pedido y normaliza cantidades en `distribution_delivery_items`. Esto permite varias filas de entrega para el mismo pedido. D1 añade claves compuestas de identidad/FK por entrega y pedido; no reintroduce unicidad por pedido.

| Pregunta | Capacidad real y evidencia |
|---|---|
| ¿Varias entregas por pedido? | **Sí.** Cada envío tiene su propio `distribution_deliveries.id`, datos de ruta y cantidades de `distribution_delivery_items`. La RPC resta las cantidades de otras entregas no canceladas al validar la línea. |
| ¿Un movimiento repartido entre entregas? | **Sí.** D3 registra allocations por `(organization_id, delivery_id, order_line_id, inventory_movement_id)`. Como `delivery_id` participa en la clave, el mismo movimiento puede tener allocations en varias entregas. La RPC bloquea las filas del movimiento y exige que las cantidades acumuladas en entregas no canceladas no superen `inventory_movements.quantity`. |
| ¿2 y 4 desde una salida de 6? | **Sí por contrato de allocations.** La primera entrega puede asignar 2 y la segunda usar el saldo 4; la prueba SQL actual lo demuestra con otras cantidades (una salida de 60 se reparte en 50/10). **Pero crear una entrega nueva requiere haber despachado todos los bienes del pedido.** `guard_distribution_order_fulfillment` en `20260922230000_gate_distribution_on_goods_dispatch.sql` rechaza con `DISTRIBUTION_ORDER_NOT_DISPATCHED` si queda saldo físico de cualquier línea. |
| ¿Movimiento de varios lotes en un envío? | **Sí.** Cada línea del envío debe completar exactamente su cantidad con allocations de movimientos físicos de salida del mismo `order_line_id`, todos con reserva. Las cantidades se seleccionan explícitamente, no por FEFO en Distribución. La prueba D3 cubre más de un movimiento por envío y el E2E FEFO local asigna dos movimientos a una sola entrega. |
| Pendiente de programación | React calcula despachado desde las reservas consumidas y resta lo asignado a entregas no canceladas por línea. La lectura `list_distribution_inventory_movements` calcula, por movimiento, cantidad física menos allocations activas de otras entregas. La RPC vuelve a comprobar los límites; una entrega cancelada libera allocations sin mover el inventario. |
| Pendiente de conformidad | `record_distribution_delivery_outcome` acumula los resultados anteriores **de esa entrega y línea**. No permite superar la cantidad asignada a ese envío. `entregado` exige completar el saldo de la entrega; `entrega_parcial` requiere una cantidad positiva menor que el saldo; `rechazado` exige incidencias y no admite cantidades recibidas. React permite “Registrar recepción adicional” después de un resultado parcial. |
| Estado global del pedido | La última proyección de `sync_order_fulfillment_from_delivery` suma resultados de todas las entregas del pedido y compara el recibido con la cantidad total de bienes. Con 2 de 6 recibidas tras la primera entrega completa, el pedido queda `partially_fulfilled`; al llegar a 6 de 6 queda `delivered`. `orders.status` comercial permanece `atendido`; `sales.status` permanece `despachada`. |
| Trazabilidad | `list_distribution_delivery_inventory_trace` devuelve entrega, pedido, línea, movimiento, cantidad asignada, lote, vencimiento, ubicación, reserva y operación. `distribution_delivery_outcome_lines` persiste solo `order_line_id` y `quantity_delivered`: no incluye `inventory_movement_id` ni lote. Por eso el modelo no prueba qué lote recibió el cliente dentro de una conformidad parcial por línea; el informe y el futuro E2E no deben afirmar esa relación directa. |
| Fallo/cancelación | Un rechazo se registra como resultado clasificado sin cantidad recibida y puede reprogramarse. Un plan en estados cancelables libera allocations; no crea ni borra movimientos. Tras una entrega parcial, la ruta puede reanudarse/reprogramarse y admitir recepción adicional, pero el estado parcial no permite tratar la entrega como un plan nuevo cancelado. Las transiciones se validan en base y React expone las acciones permitidas. |

Las operaciones de programación y resultado requieren `DISTRIBUTION_MANAGE`; las lecturas de movimientos/traza requieren `DISTRIBUTION_VIEW`. Las RPC se conceden a `authenticated`, no a `anon`, y las pruebas de autorización verifican estos límites.

### Idempotencia y concurrencia

- Los despachos usan una `operation_key` por intento lógico. El mismo intento debe repetir la misma clave y cantidades; un segundo despacho real requiere una clave distinta. La concurrencia SQL prueba dos despachos incompatibles en sesiones distintas: uno gana, el otro obtiene `ORDER_DISPATCH_EXCEEDS_RESERVED` y no se duplica el movimiento (`order_dispatch_concurrency.test.sql`, 11 aserciones).
- `save_distribution_delivery` usa una tabla de comandos y compara el payload al repetir una clave; el test verifica que el retry idéntico conserve una sola entrega. Cada nueva entrega o transición requiere clave propia y las ediciones usan `expected_lock_version`.
- El resultado de entrega también usa clave única por organización. El RPC devuelve el resultado existente al repetir la clave si coincide la categoría de fallo, pero no compara el pedido de entrega, estado, fecha, evidencia ni cantidades. La UI mantiene la clave durante el retry sin cambios y la regenera al editar campos. **Riesgo de contrato:** un consumidor distinto que reutilice la clave con payload diferente y la misma categoría podría recibir un ID previo como éxito sin aplicar el nuevo resultado. La cobertura existente prueba retry idéntico, no ese conflicto. No bloquea escenario A, pero conviene conservar claves distintas por resultado y considerar un test de conflicto antes de ampliar clientes del RPC.
- `distribution_allocation_concurrency.test.sql` (10 aserciones) hace competir dos entregas de 70 contra un saldo de línea/movimiento de 100; solo una se persiste. Hay locking de pedido y movimiento, versión optimista de entrega y límites por cantidad. No encontré una prueba concurrente que registre resultados de dos entregas distintas para la misma línea y compruebe su agregación final.

## Diagnóstico de escenarios

| Escenario | PostgreSQL | React | Dictamen |
|---|---|---|---|
| **A. Despacho único 6; entregar 2 y luego 4 desde el mismo movimiento** | Soportado por allocations independientes y suma acotada por movimiento. El SQL existente prueba la división del movimiento con 50/10, no las cantidades objetivo ni los resultados de ambas entregas. | Soportado: después de despachar los 6, React permite crear una entrega parcial, elegir el movimiento y asignar la cantidad. Tras conformarla, el pedido continúa `partially_fulfilled` y los 4 no asignados vuelven a estar disponibles para otra entrega. | **Candidato recomendado y compatible con reglas actuales.** Una entrega de 2 queda `entregado` en su ámbito; el pedido queda parcialmente cumplido. La segunda de 4 lleva el total global a `delivered`. Inventario termina en 4 físicos, 0 reservados; programar/confirmar no añade movimientos. |
| **B. Despachar 2; entregar 2; despachar 4; entregar 4** | Los dos despachos parciales sí son válidos en `dispatch_order_from_reservations`. La creación de la primera entrega se rechaza por el trigger `guard_distribution_order_fulfillment`, porque las reservas consumidas suman 2 de 6; devuelve `DISTRIBUTION_ORDER_NOT_DISPATCHED`. | También queda filtrado antes de abrir el diálogo: `pedidoListoParaProgramarDistribucion` exige que cada bien esté despachado por la cantidad completa del pedido y sin pendiente. | **No está soportado como recorrido completo en ese orden.** El bloqueo es una regla vigente de elegibilidad compartida entre backend y React, no una limitación de inventario de la allocation individual. Si se despachan primero 2 y luego 4, y después se crean entregas 2 y 4, el recorrido es compatible, pero ya no reproduce B. No se propone cambiar la regla en esta auditoría. |

En B, después del primer despacho físico, las pruebas indican `sales.status='registrada'`, `orders.status='confirmado'` y la reserva conserva el saldo activo. El botón de Ventas puede volver a ejecutarse para consumir el saldo. Al completar los bienes (y los servicios, si hubiera), la venta pasa a `despachada` y el pedido a `atendido`. El obstáculo concreto aparece al crear una entrega: lo hacen cumplir el trigger SQL y, de forma concordante, el filtro de React.

## Cobertura automatizada existente

| Cobertura | Evidencia actual | Límite respecto a Fase 2B |
|---|---|---|
| Parcial y segundo despacho | `order_dispatch_from_reservations.test.sql` (37 aserciones) ejecuta 6 y después 4 de una línea de 10; verifica sale/order intermedios, referencias, reservas, saldos, retry y estados terminales. `service_order_completion.test.sql` prueba parciales adicionales en un pedido mixto. | SQL directo; no recorre dos despachos desde React ni usa el pedido exacto de 6. |
| Despacho en React | `PanelOperacionesVenta.test.tsx` verifica que el formulario manda un valor parcial y bloquea doble submit. | Callback simulado; no integra la RPC/DB ni prueba el segundo despacho real. |
| Una salida en múltiples entregas | `distribution_delivery_inventory_allocations.test.sql` (49 aserciones) crea dos entregas para el mismo pedido y asigna el mismo movimiento 50/10; también prueba varias salidas por una entrega, sumas, lectura de traza, idempotencia y cancelación. | SQL directo; no recorre la UI ni registra conformidad de ambas entregas. |
| Cantidades y resultados | `distribution_deliveries.test.sql` (173 aserciones) prueba recepción parcial, recepción adicional, rechazo, exceso, cierre incompleto, reintentos y estados en una entrega. En la línea 342 también verifica que una venta con despacho parcial no pueda programarse (`DISTRIBUTION_ORDER_NOT_DISPATCHED`). | No prueba dos documentos de entrega de un mismo pedido ni el agregado parcial/global entre ambos. |
| E2E actual | `operational-flow.spec.ts` recorre despacho completo y una entrega con recepción parcial y adicional sobre la misma entrega. `operational-fefo-multilot.spec.ts` (cambio local sin commit) recorre despacho FEFO completo y una entrega asignada a dos movimientos. | Ambos son un despacho completo y un documento de entrega por pedido. No prueban dos entregas ni dos despachos parciales secuenciales. |
| Concurrencia | `order_dispatch_concurrency.test.sql` (11) y `distribution_allocation_concurrency.test.sql` (10) ejecutan sesiones `dblink` separadas y prueban que no se sobreconsuma reserva ni saldo de distribución. | No son E2E React; no cubren resultados concurrentes de varios envíos ni el caso de dos envíos 2/4. |
| Elegibilidad/servicios | `pedidosProgramables.test.ts` prueba que un bien totalmente despachado puede programarse cuando el pedido está `partially_fulfilled`, que se resta lo reservado por otros envíos y que los cancelados liberan saldo. `distribucionService.test.ts` comprueba el mapeo de resultados. | Unit tests; no validan múltiples entregas persistidas en la aplicación real. |
| Permisos | `sales_distribution_authorization.test.sql` prueba que los permisos requeridos se validan en RPC y que `anon` no ejecuta despacho/programación. | No es una prueba E2E con usuarios de permisos distintos. |

No ejecuté estos tests durante esta auditoría; lo anterior identifica cobertura en el árbol fuente, no un PASS nuevo.

## Estrategia mínima recomendada para implementar A

Crear un E2E nuevo `frontend/tests/e2e/operational-partial-deliveries.spec.ts` con una sola línea física de 6 unidades y un único movimiento de salida. Reutilizar `frontend/tests/e2e/fixtures/operational.ts` sin modificarlo: valida fail-closed los puertos/contenedores y la única organización SILSAN, autentica con la sesión ordinaria del navegador, y proporciona `checked`, `mutate`, `selectRemote` y `expectStock`. Las operaciones de compra, recepción, cotización, pedido, venta, despacho, programación y resultado siguen ejecutándose con los controles React; las consultas autenticadas se usan solo para comprobar persistencia.

Pasos y verificaciones:

1. Comprar/recibir 10 unidades, crear pedido de 6, registrar la venta y despachar 6. Comprobar una salida física de 6 vinculada a su línea y reserva; stock físico 4 y reserva pendiente 0.
2. En React programar una primera entrega de 2 asignada al movimiento original; recorrer preparación, traslado y destino, y registrar conformidad total de esa entrega. Comprobar una cabecera, línea y allocation de 2; outcome de la línea por 2; estado de la entrega `entregado`; estado logístico del pedido `partially_fulfilled`; saldo aún programable de 4.
3. Programar la segunda entrega de 4 desde el mismo movimiento y conformarla desde React. Comprobar segunda cabecera/línea/allocation, misma identidad de movimiento, suma de allocations igual a 6 sin exceder la salida, outcome de línea por 4 y pedido `delivered`.
4. Comprobar cantidades globales: recibido 10, reservas históricas consumidas 6, salidas 6, asignado a entregas 6, conformado 6, saldo físico 4, reserva pendiente 0. Comparar los IDs de `inventory_movements` antes y después de Distribución: la programación y la conformidad no crean salidas nuevas.
5. Verificar que existan exactamente dos entregas, dos líneas, dos allocations y dos resultados terminales sin duplicados. Como el pedido aparece en más de un artículo de seguimiento, localizar cada entrega por su guía/referencia propia y no solo por número de pedido.

La traza que puede afirmarse es `delivery → distribution_delivery_items → distribution_delivery_inventory_allocations → inventory_movements → inventory_reservations`. El resultado se verifica como `delivery → distribution_delivery_outcomes → distribution_delivery_outcome_lines → order_line_id/cantidad`; no atribuir un lote concreto a una cantidad recibida por línea.

No se propone tocar lógica productiva ni migraciones para A. Si además se desea comprobar por separado la proyección de `orders.fulfillment_status` al sumar varias entregas, agregar una aserción SQL aislada a `distribution_deliveries.test.sql` (o una suite específica de cumplimiento multi-entrega); hoy la lógica existe, pero la suite de resultados solo cubre varios resultados dentro de una entrega.

## Riesgos y validaciones para la siguiente intervención

- La prueba de A es representativa y no depende de una regla nueva. La cobertura principal que falta es E2E real de dos documentos de entrega, saldo reutilizado y transición `partially_fulfilled → delivered`.
- No tratar como entregado el saldo programado, ni como reservado un saldo histórico ya consumido. Verificar por separado: despacho (reservas consumidas/movimientos), programación (delivery items/allocations), recepción (outcome lines) y saldo global del pedido.
- La conformidad es por línea de entrega y no identifica lotes de forma directa. Si se exige trazabilidad de lote **hasta la recepción confirmada**, el contrato actual no guarda esa atribución en `distribution_delivery_outcome_lines`.
- Para B exacto, se requiere una decisión de producto y un cambio coordinado del guard SQL y del filtro React para admitir la programación de un subconjunto ya despachado; no presentar esa secuencia como cubierta ni cambiar la regla silenciosamente.
- Antes de ejecutar la futura prueba E2E, conservar la comprobación de instancia exclusiva de SILSAN del fixture. No ejecutar resets ni suites SQL sobre instancias compartidas; las suites SQL actuales contienen preparación/limpieza de organizaciones de prueba y no se ejecutaron aquí.
- Validaciones para la implementación futura: typecheck E2E, Playwright focalizado de A, suite Playwright, Vitest, lint sin warnings, build, `git diff --check` y SQL focalizado de despacho parcial, allocations multi-entrega, resultados y concurrencia si se agrega cobertura SQL. Informar cada resultado ejecutado de forma independiente.

## Estado final

El único archivo creado en esta intervención es `docs/FASE2B_DIAGNOSTICO_PARCIALES.md`. No se modificaron archivos productivos, migraciones ni tests existentes. Los cambios tracked/untracked previos permanecen intactos; este informe queda nuevo y sin seguimiento. HEAD permanece en `8c812d7e244f16456d12be66766866f1c5f9c3ff`, rama `main`, índice vacío, 3 commits ahead de la referencia local `origin/main`. No se realizó commit ni push.
