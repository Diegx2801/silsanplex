# Cierre de Fases 1/1.1 y preparación de Fase 2A

Fecha: 2026-10-21. Repositorio: `Diegx2801/silsanplex`.

## Estado y límites de esta revisión

- Rama `main`; HEAD `df41d90c2da0ddb5570de4497d582c01afe03556`.
- `git fetch origin` ejecutado correctamente. `HEAD...origin/main`: **0 delante, 0 detrás**. `df41d90..HEAD`: sin commits.
- Los cambios desde esa base están en el árbol de trabajo. Índice vacío; no se preparó ningún archivo.
- Se encontraron **6 archivos tracked modificados** y **12 archivos untracked individuales** antes de crear este informe. Este informe agrega un untracked: 13 al finalizar; los directorios agrupados de `git status` contienen los archivos detallados abajo.
- `git diff --check`: sin errores. Git avisa de normalización LF/CRLF en dos archivos; no es un error de whitespace.
- No se ejecutaron pruebas funcionales nuevas en esta revisión. Los resultados 25 E2E, 578 Vitest y 3.181 aserciones SQL corresponden a las ejecuciones documentadas de las fases anteriores; no son una ejecución del escenario 2A.
- No se escribió en bases, no se arrancaron/detuvieron proyectos Docker, no se modificaron hooks, migraciones, lógica de negocio ni archivos previos. Solo se crea este documento. Sin commit ni push.

## Inventario completo de cambios útiles y separación lógica

### Correcciones anteriores de fixtures

Tracked modificados:

1. `backend/supabase/tests/database/inventory_kardex_determinism.test.sql`: vencimientos relativos a `current_date + 30/60/90`, manteniendo el orden FEFO. No cambia el algoritmo.
2. `backend/supabase/tests/database/sales_quotes_persistence.test.sql`: calendario `America/Lima`, vigencias relativas y dos aserciones adicionales para borrador vencido/emisión rechazada; plan 35 → 37.
3. `frontend/src/modulos/ventas/estado/useOperacionesVenta.test.tsx`: fecha de negocio controlada y caso de cotización vencida; restauración de spies al terminar.
4. `backend/supabase/tests/database/purchase_receipt_inspection.test.sql`: limita dos recuentos de auditoría a la organización del fixture. **Es aislamiento del test, no una corrección de fechas**. Evita que los documentos E2E persistentes contaminen el recuento global.

### Integración operativa de Fase 1

Untracked:

- `frontend/tests/e2e/fixtures/operational.ts`: identidad local SILSAN, login, maestros aislados por intento, observación de RPC reales, consultas autenticadas de saldos.
- `frontend/tests/e2e/operational-flow.spec.ts`: recorrido real de compra a entrega. Su contenido actual también incorpora Fase 1.1.
- `docs/FASE1_INTEGRACION_OPERATIVA.md`: diagnóstico, matriz y evidencia histórica de Fase 1.

### Interfaz y accesibilidad de Fase 1.1

Tracked modificados:

- `frontend/src/modulos/ventas/componentes/DialogoSeleccionAlmacenPedido.tsx`: altura acotada, cuerpo desplazable y encabezado/pie sin contracción; no cambian handlers ni validaciones.
- `frontend/src/app/paginas/DistribucionPage.tsx`: eliminación exclusiva del ID manual del título para recuperar la asociación de Radix.

Untracked o compartidos con Fase 1:

- `frontend/tests/e2e/operational-flow.spec.ts`: dos viewports, navegación por teclado, nombres accesibles de los tres diálogos, recepción parcial/adicional real para habilitar Reprogramar legítimamente.
- `docs/FASE11_INTERFAZ_ACCESIBILIDAD.md`: correcciones y validaciones finales de Fase 1.1.

Otros documentos untracked de cierre:

- `docs/REVISION_SILSAN_2026-10-21.md`: revisión anterior, con actualización que distingue bloqueos iniciales y validación posterior.
- `docs/VALIDACION_SQL_E2E_2026-10-21.md`: evidencia histórica de 147 migraciones, 95 archivos SQL, 3.181 aserciones, concurrencia y E2E previos a las fases 1/1.1.
- `docs/CIERRE_FASES_1_11_PREPARACION_2A.md`: este informe.

## Commits propuestos, sin ejecutarlos

**Orden recomendado: tres commits.** Cada lista es una lista explícita de inclusión. No usar `git add .` ni añadir directorios completos.

### 1. `test: stabilize date fixtures and scope receipt audit assertions`

Archivos exactos:

```text
backend/supabase/tests/database/inventory_kardex_determinism.test.sql
backend/supabase/tests/database/sales_quotes_persistence.test.sql
frontend/src/modulos/ventas/estado/useOperacionesVenta.test.tsx
backend/supabase/tests/database/purchase_receipt_inspection.test.sql
```

Conjunto independiente del código de interfaz y basado en reglas ya existentes en HEAD. Incluye tres correcciones temporales y una de aislamiento, diferenciadas arriba.

### 2. `test: cover operational flow with responsive and accessible dialogs`

Archivos exactos:

```text
frontend/tests/e2e/fixtures/operational.ts
frontend/tests/e2e/operational-flow.spec.ts
frontend/src/modulos/ventas/componentes/DialogoSeleccionAlmacenPedido.tsx
frontend/src/app/paginas/DistribucionPage.tsx
docs/FASE1_INTEGRACION_OPERATIVA.md
docs/FASE11_INTERFAZ_ACCESIBILIDAD.md
```

**Agrupa técnicamente Fases 1 y 1.1.** El spec es nuevo y solo existe localmente su versión final, que exige los arreglos de viewport y nombres accesibles. Publicarlo primero sin esos dos componentes dejaría una revisión con pruebas fallidas. No se propone reconstruir su versión antigua ni separar artificialmente hunks del archivo nuevo. El fixture importa únicamente dependencias ya presentes; no necesita cambios en package/configuración.

El commit 1 debe preceder la validación SQL completa después de las pruebas E2E: los documentos persistidos de recepción hacen relevante el recuento de auditoría por organización.

### 3. `docs: record validation closure and multilot FEFO test scope`

Archivos exactos:

```text
docs/REVISION_SILSAN_2026-10-21.md
docs/VALIDACION_SQL_E2E_2026-10-21.md
docs/CIERRE_FASES_1_11_PREPARACION_2A.md
```

Los resultados históricos se interpretan cronológicamente: 23 E2E antes del integral, 24 en Fase 1, 25 en Fase 1.1. Estos documentos no reemplazan la comprobación final del contenido preparado cuando se autoricen commits.

### Exclusiones obligatorias

No incluir ninguno de estos untracked:

```text
.codex/hooks.json
output/fase1-focused-evidence.json
output/fase1-full-evidence.json
output/fase11-1280x720.png
output/fase11-1440x1080.png
output/pdf/AUDITORIA_OFICIAL_SILSANPLEX.pdf
```

También quedan fuera los logs ignorados, `.env*` reales, capturas, trazas, reportes de Playwright, build y dependencias. `.codex/` y `output/` **no están excluidos globalmente por el .gitignore actual**: podrían entrar con una inclusión indiscriminada. No se cambia `.gitignore` en esta revisión.

Se inspeccionó el diff tracked y el contenido de los archivos de prueba/documentación propuestos. No se encontraron credenciales literales ni secretos: una búsqueda de firmas de claves privadas, tokens conocidos y JWT sobre los 12 archivos útiles iniciales no produjo coincidencias. El fixture lee credenciales del entorno y mantiene el token ordinario en memoria de Node; no introduce claves privilegiadas al navegador ni al informe. Es una revisión estática del conjunto propuesto, no un escaneo de todo el historial. Los artefactos excluidos no se certifican como publicables.

## Diagnóstico FEFO multilote

El escenario **A=3, B=7, pedido=6** es compatible con el código inspeccionado, bajo estas condiciones: producto `good`, controles de lote/vencimiento activos, almacén y ubicación activos de la misma organización, ambos lotes `available`, fechas futuras, cantidad aceptada igual a recibida y ningún otro stock/reserva para el producto de prueba.

| Etapa | Implementación comprobada | Implicación para 2A |
| --- | --- | --- |
| Compra | `DialogoCompra.tsx`, `compraService.ts`, `save_purchase_order` / `issue_purchase_order` | Una compra de 10 unidades, una línea comercial. No duplicar líneas de compra para representar los lotes. |
| Recepción | `DialogoConfirmacionRecepcion.tsx:97` y botón «Dividir lote»; `recibirCompraPersistente`, RPC `receive_purchase_order_partial_inspected` | Una recepción con dos partidas de la misma línea, cantidades 3 y 7, lotes y fechas distintos. Cada partida lleva inspección; la suma recibida no puede superar 10. |
| Persistencia de recepción | `20260928233000_e4c_purchase_receipt_inspection.sql` | Un encabezado de recepción, dos `purchase_receipt_items`, dos inspecciones vigentes, dos entradas; solo la cantidad aceptada incrementa stock. |
| Candidatos FEFO | `inventory_fefo_candidates` en `20260829163705_implement_inventory_fefo_primitives.sql:9` | Filtra `available`, asignable positivo y vencimiento no pasado; orden por fecha ASC NULLS LAST, lote normalizado y ubicación dentro de organización/producto/almacén. |
| Planificación | `inventory_fefo_allocation_plan` redefinido en `20260904220811_prevent_service_inventory.sql:170` | Asigna `least(disponible, cantidad restante)`; para 6 resulta A=3, B=3. No confundirlo con la versión histórica inicial. |
| Reserva | `reserve_order_item_fefo_quantity` en `20260901230000_modify_release_order_reservations.sql:82`; `reserve_order_item_fefo` en `20260908193607_a5_service_completion.sql:121` | Reserva por bucket y línea, con bloqueo de ámbito y sin movimientos físicos. Dos reservas activas de 3, físico total 10 y asignable 4. |
| Concurrencia | `lock_inventory_fefo_scope` redefinido en `20260917151430_d1b1_serialize_inventory_master_writers.sql:86` | Bloqueo de maestros y advisory transaccional por ámbito; no se deduce una nueva validación concurrente del E2E serial. |
| Venta y despacho | `ventasService.ts`, `dispatch_order_from_reservations`; wrapper en `20260929145934_d2_consolidate_order_dispatch_contract.sql:116`, primitiva en `20260908193607_a5_service_completion.sql:963` | Venta registrada no consume stock; despacho itera reservas por FEFO, produce dos salidas de 3 con `reservation_id`, `source_id=order_items.id`, lote y vencimiento; ambas reservas quedan consumidas. Requiere permisos de Distribución e Inventario y cálculo tributario válido. |
| Distribución | `DistribucionPage.tsx`, `distribucionService.ts`, `save_distribution_delivery`, `list_distribution_inventory_movements`, `list_distribution_delivery_inventory_trace` | Asignación explícita 3 a cada movimiento en una línea de entrega de 6. No genera nuevas salidas. D3 impide duplicados, exceso y movimientos de otra línea/organización. |
| Entrega | `DialogoResultadoEntrega.tsx`, `record_distribution_delivery_outcome` | Conformidad completa de 6 por línea. El resultado no guarda `inventory_movement_id`; la trazabilidad a los lotes se comprueba uniendo entrega → línea/asignaciones → dos movimientos → reservas → buckets recibidos. |

Las referencias SQL describen el estado reconstruido desde las migraciones del repositorio, incluyendo redefiniciones. No se comparó en esta tarea el cuerpo de funciones de una instancia desplegada.

### Saldos y cantidades esperados

| Momento | Físico A/B | Reserva pendiente A/B | Asignable A/B | Físico / reservado / asignable global |
| --- | --- | --- | --- | --- |
| Recibido | 3 / 7 | 0 / 0 | 3 / 7 | 10 / 0 / 10 |
| Pedido reservado y venta registrada | 3 / 7 | 3 / 3 | 0 / 4 | 10 / 6 / 4 |
| Despachado | 0 / 4 | 0 / 0 | 0 / 4 | 4 / 0 / 4 |
| Programado y entregado | 0 / 4 | 0 / 0 | 0 / 4 | 4 / 0 / 4 |

Reservas consumidas: dos filas, cada una `quantity=3`, `quantity_consumed=3`, `status='consumed'`. No deben confundirse esas cantidades históricas con la reserva pendiente, que es cero.

El bucket A puede no aparecer en la pantalla de stock al agotarse. Verificar cero con el saldo persistente/ledger, no exigir una fila visible que la vista deliberadamente omite. Identificar buckets por organización, producto, almacén, ubicación, lote y vencimiento; no solo por nombre del lote.

## Cobertura existente y brechas

| Evidencia existente | Cobertura real | Brecha para el recorrido propuesto |
| --- | --- | --- |
| `inventory_fefo_core.test.sql` (plan 43) | Candidatos, vencidos/no asignables, salida/transferencia atómica multilote | No recorre compras, pedido y entrega desde React. |
| `order_inventory_reservation.test.sql` (plan 31) | Una línea con dos reservas, falta de stock, rollback y reintentos | No valida ambos lotes recibidos mediante inspección UI. |
| `order_dispatch_from_reservations.test.sql` (plan 37) | Dos lotes, consumo, referencia, vínculo línea/reserva/movimiento y retry sin duplicados | No verifica todo el recorrido de interfaz. |
| `distribution_delivery_inventory_allocations.test.sql` (plan 49) | Dos movimientos físicos de una línea, asignaciones explícitas y lectura de traza, sumas, restricciones y resultados | Fixtures backend; no prueba el operador asignando ambos lotes desde React tras su compra. |
| `purchase_receipt_inspection.test.sql` (plan 53) | Aceptación/rechazo, inspecciones y vínculo con receipt item, auditoría y aislamiento | No une por sí sola compras inspeccionadas y FEFO comercial multilote de extremo a extremo. |
| `distribution_deliveries.test.sql` | Persistencia/estados y resultados de entrega | Falta unirlo al escenario 3+7 → 6 desde React. |
| `order_inventory_reservation_concurrency.test.sql` (11), `order_dispatch_concurrency.test.sql` (11), `distribution_allocation_concurrency.test.sql` (10), `purchase_receipt_inspection_concurrency.test.sql` (16) | Sesiones independientes y contención de reserva, despacho, asignación o recepción | El escenario 2A serial no sustituye estas suites ni demuestra nuevas carreras. |
| `frontend/tests/e2e/inventory-fefo.spec.ts:124` | Stock A=3, B=6, C=4; salida 5 consume A=3+B=2; transferencia posterior, kardex y valorización | Stock preparado por fixtures; no compra inspeccionada ni reserva comercial/Distribución. |
| `frontend/tests/e2e/operational-flow.spec.ts` | Compra→recepción→pedido/reserva→venta/despacho→entrega, un lote, dos viewports; parcial/adicional para accesibilidad | Asume una reserva, una salida y una asignación. No debe convertirse ciegamente a multilote cambiando constantes. |

Los planes citados se leyeron en los archivos; no son resultados nuevos de ejecución. Las suites aprobadas previas se documentan en `VALIDACION_SQL_E2E_2026-10-21.md` y `FASE11_INTERFAZ_ACCESIBILIDAD.md`.

## Alcance mínimo recomendado de Fase 2A — pendiente de confirmar

Crear solamente:

1. `frontend/tests/e2e/operational-fefo-multilot.spec.ts`.
2. `docs/FASE2A_FEFO_MULTILOTE.md` para escenario, validación efectiva y hallazgos.

Reutilizar sin cambios obligatorios `fixtures/operational.ts`: ya crea producto/cliente/proveedor/almacén/ubicación propios, verifica identidad y expone `checked`, `mutate`, `selectRemote`, `expectStock`. Derivar dos nombres de lote únicos de `f.lot`; usar `f.expiration` (un año futuro) para A y una fecha posterior para B. De esta forma no hace falta modificar preparación global, paquetes, servicios ni fixtures SQL. Mantener intactos el E2E integral actual y sus dos viewports. Si al implementar aparece repetición sustancial, cualquier extracción de helpers deberá conservar esas pruebas y justificarse; no es una dependencia previa de 2A.

Secuencia del nuevo caso:

1. Registrar y emitir compra de 10 unidades desde UI.
2. En recepción, «Dividir lote»: A=3 y B=7, inspeccionadas/aceptadas íntegramente, rechazadas=0; ambos lotes futuros. Completar una recepción real.
3. Verificar encabezado recibido, dos partidas/inspecciones/entradas y saldos 3/7. Restringir todos los SELECT al producto y organización del fixture.
4. Emitir cotización de 6 y crear pedido; comprobar dos reservas de 3, conservación del físico y FEFO por las cantidades/lotes, no por el orden de retorno de PostgREST o timestamps.
5. Registrar venta y despachar 6 por UI. Verificar dos salidas de 3 vinculadas a sus reservas, misma línea y referencia de despacho; reserva pendiente cero, físico A=0 y B=4.
6. Programar una entrega de 6 asignando explícitamente 3 de cada movimiento mediante los controles accesibles «Cantidad del lote …». Verificar dos allocations y sus IDs, una línea de entrega, y traza RPC consistente.
7. Preparar, trasladar, marcar en destino y registrar recepción completa de 6 desde UI; un único resultado y una línea de resultado. Recargar y comprobar estados terminales y toda la cadena de relaciones.
8. Recontar exactamente una compra/línea comercial, una recepción con dos partidas, una cotización/pedido/venta/entrega; dos reservas, dos entradas y dos salidas; dos allocations, un resultado de entrega. Verificar que programar/entregar no modifica el ledger ni genera salidas adicionales.

Este caso base no necesita recepción parcial del cliente ni guardar una reprogramación: esas variantes ya están en 1.1. Empezar en el viewport de escritorio existente, manteniendo la suite 1.1 a 720 y 1080. Ampliar el nuevo caso a ambos tamaños sería cobertura adicional, no necesaria para demostrar el reparto FEFO.

Verificación prevista cuando se autorice implementar: typecheck E2E, caso focalizado, suite Playwright completa, Vitest, lint sin warnings y build. Ejecutar SQL FEFO/reservas/despacho/allocations/recepción y sus suites concurrentes si se amplía cobertura backend o surge un defecto; registrar comandos efectivos. No tratar conteos únicos como demostración de idempotencia ante pérdida de respuesta: un retry real y carreras multilote son ampliaciones separadas de este escenario de éxito.

## Riesgos y restricciones

- Compatibilidad estática confirmada; **2A no implementada ni ejecutada**. Queda por observar el comportamiento real de «Dividir lote» con dos inspecciones y asignación de ambos movimientos en el mismo recorrido.
- El entorno del fixture es intencionalmente local: contenedores/puertos/directorio SILSAN y una organización específica. No relajar esa protección para probar contra otra base ni producción.
- La suite comparte organización y usa un worker. Datos únicos por intento, sin limpiar historial ni depender de documentos de ejecuciones previas.
- Usar fechas futuras relativas y conservar el calendario de negocio; varios tests históricos aún usan fechas fijas futuras y no deben copiarse como patrón.
- Una entrega totalmente conforme permite comprobar la traza completa de ambos lotes asignados. No atribuir una recepción parcial del cliente a un lote concreto: no existe ese vínculo directo en el modelo de resultados actual.
- Permisos, cálculo fiscal, validaciones de inspección y trazabilidad se conservan; ante un defecto, documentar reproducción y propuesta mínima antes de ampliar cambios productivos.
- La restauración del foco al cerrar Distribución sigue siendo una limitación previa documentada de Fase 1.1; no es parte de FEFO.
- No se añaden dependencias, migraciones, RLS, hooks, resets, cambios Docker ni operaciones sobre bases ajenas.
