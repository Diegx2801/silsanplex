# Fase 1 — integración operativa de SILSANPLEX

## Inspección inicial (21 de octubre de 2026)

HEAD `df41d90c2da0ddb5570de4497d582c01afe03556`, coincidente con `origin/main`
tras fetch. Se revisaron los cambios locales previos en
`useOperacionesVenta.test.tsx`, `inventory_kardex_determinism.test.sql` y
`sales_quotes_persistence.test.sql`: corrigen fixtures dependientes de fechas y
no se modificarán en esta fase. También existen `.codex/hooks.json`, dos
informes locales anteriores y `output/pdf/AUDITORIA_OFICIAL_SILSANPLEX.pdf` sin
seguimiento. No se incorporará ninguno al índice de Git.

El informe `VALIDACION_SQL_E2E_2026-10-21.md` aporta antecedentes. La inspección
actual confirmó etiqueta Docker del directorio `silsanplex/backend`, contenedor
`supabase_db_backend`, organización `Droguería SILSAN S.A.C.` y 147 migraciones.

## Matriz de integración inspeccionada antes de implementar

| Etapa / pantalla | Hook / servicio | Persistencia y tablas principales | Transición / autorización | Evidencia previa y brecha |
| --- | --- | --- | --- | --- |
| Compra — `ComprasPage`, `DialogoCompra` | `useCompras`, `guardarCompraPersistente` | `save_purchase_order`; `purchase_orders`, `purchase_order_items` | Nuevo → `borrador`; `PURCHASES_MANAGE` | `purchasing.test.sql`, `compraService.test.ts`; sin E2E de creación real |
| Emisión — confirmación en Compras | `emitirCompraPersistente` | `issue_purchase_order`; encabezado, auditoría | `borrador` → `emitida`; `PURCHASES_MANAGE` | SQL de compras; sin cruce UI con recepción |
| Recepción — `DialogoConfirmacionRecepcion` | `recibirCompraPersistente` | `receive_purchase_order_partial_inspected`; `purchase_receipts`, `purchase_receipt_items`, `purchase_receipt_inspections`, `purchase_receipt_inspection_details`, `purchase_receipt_inspection_reasons`, `inventory_movements`, `audit_events` | Emitida → recibida al completar cantidades; `PURCHASES_RECEIVE` | Suites de inspección, idempotencia y concurrencia; falta compra UI → saldo del lote |
| Inventario — `InventarioPage` | `useInventario`, servicios/read models de inventario | Movimientos de recepción; vistas `inventory_balances` y resúmenes | Entrada aceptada aumenta físico y disponible; `INVENTORY_VIEW` | E2E FEFO parte de stock preparado; no parte de una compra recibida |
| Cotización — `VentasPage`, `DialogoCotizacion` | `useCotizacionesPersistentes`, `cotizacionesService` | `save_sales_quote`, `issue_sales_quote`; `sales_quotes`, `sales_quote_items` | Nuevo → `borrador` → `emitida`; `SALES_MANAGE` | SQL de persistencia; E2E anterior solo selecciona y valida campos |
| Pedido y reserva — `DialogoSeleccionAlmacenPedido` | `useOperacionesVenta`, `crearPedidoPersistente` | `create_order_with_fulfillment`; `orders`, `order_items`, `inventory_reservations`, cotización | Cotización → `aceptada`; pedido `confirmado`, reserva FEFO; `SALES_MANAGE` | SQL de contrato, reserva y concurrencia; falta conversión UI integrada |
| Venta — `PanelOperacionesVenta`, `DialogoRegistroVenta` | `registrarVentaPersistente` | `create_sale_from_order`; `sales`, `sale_items` | Venta `registrada`; `SALES_MANAGE` | SQL de ventas; sin E2E de comprobante seguido de despacho |
| Despacho — `DialogoDespachoPersistente` | `despacharVentaPersistente` | `dispatch_order_from_reservations`; salida en `inventory_movements`, consumo de reservas, pedido/venta | Bienes despachados, reserva consumida, físico reducido; UI requiere `DISTRIBUTION_MANAGE` + `INVENTORY_MANAGE`, RPC exige autorización de inventario | SQL de despacho/reservas y carrera; sin recorrido UI hasta entrega |
| Programación — `DistribucionPage` | `useProgramacionesEntrega`, `guardarEntrega` | `save_distribution_delivery`; `distribution_deliveries`, `distribution_delivery_items`, `distribution_delivery_inventory_allocations` | Nuevo → `programado`; requiere despacho completo y asignación explícita; `DISTRIBUTION_MANAGE` | SQL de allocations y concurrencia; sin E2E de selección del movimiento/lote |
| Traslado y entrega — Distribución, `DialogoResultadoEntrega` | `actualizarEstado`, `registrarResultadoEntrega` | `save_distribution_delivery`, `record_distribution_delivery_outcome`; estados/historial, `distribution_delivery_outcomes`, `distribution_delivery_outcome_lines` | `programado` → `preparando` → `en_curso` → `en_destino` → `entregado`; `DISTRIBUTION_MANAGE` | SQL de entregas/resultados; falta conexión UI con compra y salida originales |

`inventory_balances` es un modelo de lectura; no se escribirá directamente.
Los permisos indicados corresponden a acciones; las rutas y lecturas tienen
sus permisos VIEW y las RPC verifican la organización en el backend.

## Diseño del escenario nuevo

Preparar mediante sesión ordinaria del administrador E2E únicamente maestros
nuevos y exclusivos: producto físico con lote/vencimiento, proveedor, cliente y
almacén. Stock inicial cero. Recibir 10 unidades, vender/reservar/despachar 4 y
entregar esas 4. Resultado esperado: 6 físicas, 0 reservadas y 6 disponibles.

Todas las operaciones centrales se harán desde React. Las comprobaciones
persistidas usarán PostgREST con el mismo token ordinario del navegador; no
habrá service role, SQL mutante ni mocks de negocio. Un guard de Node comprobará
instancia Docker, directorio y puertos locales antes de preparar datos.

Los IDs de documento, producto, lote y almacén serán únicos por intento. Se
mantendrán los documentos de prueba para preservar auditoría y reproducibilidad;
no se borrará el historial ni se reseteará la instancia. Los intentos posteriores
usarán otros IDs y no dependerán del resultado del anterior.

## Estado de implementación y validación

### Implementado y probado en ejecución individual

- `frontend/tests/e2e/fixtures/operational.ts`: comprobación de identidad Docker
  de base/API y puertos, login ordinario, maestros únicos, observación de RPC
  reales y consultas de saldos bajo RLS. Las consultas Docker son solo SELECT.
- `frontend/tests/e2e/operational-flow.spec.ts`: recorrido completo por la UI,
  ocho pasos de comprobación, persistencia y comprobación final de unicidad.
- Ejecución individual aprobada: `npx playwright test operational-flow.spec.ts`,
  1 prueba aprobada en 14,6 s (12,6 s de escenario).
- Ejecución completa de navegador: `npm run test:e2e:local`, **24 aprobadas**,
  0 fallidas, 0 omitidas, 1,3 minutos. El escenario nuevo volvió a pasar dentro
  de la suite, después de las pruebas de autenticación, clientes e inventario.

El fixture `E2E-OPS-F4E3B3E3` del primer éxito recibió 10 unidades del lote
`LOT-E2E-OPS-F4E3B3E3`, con vencimiento `2027-10-21`, y entregó 4.
La evidencia contiene los UUID reales de compra, cotización, pedido, línea,
reserva, salida, entrega y resultado en `output/fase1-focused-evidence.json`.
Las cantidades de esa evidencia solo se escriben después de aprobar las
aserciones de base de datos del escenario.
El segundo éxito, dentro de la suite completa, fue `E2E-OPS-36F3B351`, pedido
`6498ade4-1483-4dc3-a157-87e45d33ad8e`, entrega
`3af68182-7541-4ca3-85ed-1845dfb45a35`. Sus IDs y saldos están en
`output/fase1-full-evidence.json`; también queda un attachment en los resultados
ignorados de Playwright. La repetición exitosa usa datos distintos del primer éxito.

### Matriz de cobertura nueva

| Comprobación | Cobertura previa | Nueva evidencia |
| --- | --- | --- |
| Compra y recepción desde interfaz | SQL y componentes, sin este cruce E2E | Creación/emisión/recepción por React; `draft` → `issued` → `received`; una recepción y un detalle |
| Stock del lote recibido | E2E FEFO con stock preparado | Un movimiento `purchase-receipt` de 10, lote/vencimiento/ubicación persistidos, saldo 10/0/10 y fila visible en Inventario |
| Cotización → pedido | SQL; E2E de campos | Guardar y emitir por React, convertir mediante `create_order_with_fulfillment`, cotización `aceptada`, una línea de pedido de 4 |
| Reserva real | SQL de reservas/concurrencia | Una reserva activa de 4 del lote recibido; físico/reservado/disponible = 10/4/6 |
| Venta y salida | SQL de venta y despacho | Venta por React sin reducir stock; despacho consume la reserva y genera una salida de 4; saldo 6/0/6 |
| Asignación entrega/línea/movement | SQL de allocations/concurrencia | Selección explícita del lote en Distribución; un allocation enlaza entrega, pedido, línea, movimiento de salida y cantidad 4 |
| Traslado y conformidad | SQL de estados/resultados | Avance por los botones de la UI, resultado de 4 recibido con constancia, entrega `entregado`, pedido `delivered` y venta `despachada` |
| Conservación y duplicados | Pruebas por contrato | Dos movimientos físicos en total (10 entrada, 4 salida), una reserva, un pedido, una venta, una entrega, una línea/asignación y un resultado sin duplicados |

No se usa `page.route`, respuestas de negocio simuladas, SQL para avanzar etapas
ni claves privilegiadas en la prueba. Los maestros se preparan por API con la
sesión ordinaria. Las operaciones centrales solo ocurren al pulsar controles de React.

## Defectos productivos encontrados, sin corregir

### P2 — Confirmación del pedido fuera del viewport a 1280×720

- Archivo: `frontend/src/modulos/ventas/componentes/DialogoSeleccionAlmacenPedido.tsx:132`.
- Reproducción: emitir una cotización, crear pedido con modalidad Entrega al
  cliente, seleccionar almacén y usar una dirección manual. A 1280×720, el botón
  Confirmar pedido queda en `x=709,609; y=747,5; alto=32`, fuera de la ventana.
- Causa: contenido fijo y centrado que puede superar el alto disponible, sin
  `max-height` ni desplazamiento interno. Los campos son válidos, pero el clic
  normal no alcanza el botón y no se envía la RPC.
- Evidencia: `output/fase1-operational-attempt7.log`, con bounding box y timeout.
- Propuesta mínima: limitar el alto con `max-h-[90svh]` y habilitar scroll interno
  (o separar header/footer y cuerpo desplazable como en Distribución).
- Estado: **bloqueado en ese viewport**, corrección productiva **pendiente**.
  El E2E de éxito se ejecuta explícitamente a 1440×1080, sin `force`, clic por JS
  ni omisión de la creación del pedido. No certifica la variante de 720 px.

### P2 — Diálogo de programación sin nombre accesible

- Archivo: `frontend/src/app/paginas/DistribucionPage.tsx:772–775`.
- Reproducción: programar un envío desde un pedido despachado e inspeccionar
  `aria-labelledby` del diálogo y el `id` del título.
- Evidencia en ejecución: `aria-labelledby="radix-_r_5_"`, mientras que el título
  tiene `id="programar-title"`. Se registra en los logs del escenario.
- Causa: el título reemplaza el ID de Radix sin enlazar Content al ID nuevo.
  La consulta por rol y nombre Programar entrega no encuentra el diálogo.
- Propuesta mínima: conservar el ID de Radix o declarar en Content
  `aria-labelledby="programar-title"` de forma consistente.
- Estado: interacción visual **disponible**, nombre accesible **pendiente**.
  La prueba acota el diálogo por su encabezado visible; no modifica el DOM.

### P2 de pruebas — Auditoría de recepción contada globalmente

- Archivo: `backend/supabase/tests/database/purchase_receipt_inspection.test.sql`.
- Reproducción: ejecutar el E2E de compra/recepción y después la suite SQL sobre
  la misma base local conservada. La aserción 26 esperaba 1 evento de inspección
  completada y observó 12.
- Causa: la prueba cambia a `postgres` y cuenta auditorías de todas las
  organizaciones, sin restringirlas a su fixture. Las recepciones reales E2E de
  SILSAN son datos ajenos al escenario SQL y no deberían afectar su expectativa.
- Evidencia: `output/fase1-sql-full.log`, con 3.181 aserciones ejecutadas y ese
  único fallo. No se trata de una duplicación productiva: el E2E verifica la
  unicidad por IDs de su flujo, producto y organización.
- Corrección aplicada **solo en tests**: limitar las aserciones de auditoría
  completada/corregida a la organización ficticia
  `c4c00000-0000-4000-8000-000000000001`. No se borra historial de SILSAN.
- Verificación focalizada: 1 archivo, **53 aserciones aprobadas**.

## Riesgos y escenarios pendientes

- La prueba nueva cubre un bien, un lote, recepción aceptada completa, despacho
  completo y entrega completa. Quedan pendientes variantes integrales con
  recepción parcial/rechazada, varios lotes, FEFO entre lotes, varios envíos,
  entrega parcial/fallida, devolución física y servicios mixtos.
- Quedan pendientes intentos negativos y respuestas perdidas en cada etapa de
  este recorrido completo. Las suites SQL existentes cubren permisos,
  aislamiento, concurrencia e idempotencia por contrato; el E2E nuevo no los
  reemplaza ni representa una prueba de carga.
- Los datos auditables de desarrollo permanecen en SILSAN, incluidos intentos
  fallidos anteriores. Cada ejecución usa IDs nuevos y los identifica por
  `E2E-OPS-*`. No se borran documentos ni se restablece la instancia.
- El guard requiere Docker local con el proyecto `backend` y exclusivamente la
  organización SILSAN. El test se niega a escribir sobre otra instancia.
- El build conserva la advertencia previa del fragmento de Distribución superior
  a 500 kB; no es un fallo de esta implementación.

## Comandos y estado de cierre

| Comando ejecutado | Resultado efectivo |
| --- | --- |
| `git fetch origin` y comparación HEAD/origin/main | `0 0`; HEAD `df41d90` |
| `npm run test:e2e:typecheck` | PASS después de corregir el tipado del test; repetido sobre la versión final |
| `npx playwright test operational-flow.spec.ts` | 1 PASS; después de los intentos de desarrollo fallidos conservados en logs |
| `npm run test:e2e:local` | 24 PASS, 0 omitidas |
| `npm run test` (frontend) | 578 PASS en 88 archivos |
| `npm run lint -- --deny-warnings` | PASS; repetido tras completar el escenario |
| `npm run build` | PASS; advertencia previa de tamaño del fragmento de Distribución |
| `npm run test:db`, primera ejecución de esta fase | FAIL; 95 archivos/3.181 aserciones, una aserción global de auditoría fallida |
| `supabase test db --local supabase/tests/database/purchase_receipt_inspection.test.sql` | 53 PASS tras aislar la auditoría al fixture |
| `npm run test:db`, repetición final | PASS; 95 archivos, 3.181 aserciones, 40 segundos |
| `git diff --check` | PASS |

No se volvieron a ejecutar las pruebas de Edge Functions en esta fase: no se
modificaron y no son una validación nueva de este entregable.

Cambios nuevos: dos archivos de Playwright y este informe, más la corrección
acotada de la prueba SQL de inspección. Los tres archivos modificados antes de
esta fase y `.codex/hooks.json` mantienen sus hashes iniciales.

La suite SQL final incluye las 21 suites de concurrencia existentes. Una
consulta posterior confirmó RLS activo en las 60 tablas públicas con
`organization_id`. Las comprobaciones de autorización/aislamiento de la suite
SQL pasaron; el E2E nuevo valida el camino autorizado del administrador, no
agrega un recorrido negativo multiusuario de extremo a extremo.

### Estado final

- **Implementado y probado:** primer escenario integral real en escritorio
  1440×1080, repetido exitosamente en ejecución individual y en la suite completa.
- **Bloqueado:** confirmación del pedido con dirección manual a 1280×720 por
  el defecto de layout descrito; no se declara aprobado ese viewport.
- **Pendiente:** correcciones productivas de los dos P2 y las variantes
  integrales enumeradas. No hay etapas del escenario exitoso ejecutadas por SQL.
- **Git:** rama `main`, HEAD `df41d90`, sin commits nuevos, sin push e índice
  vacío. Cuatro archivos tracked modificados: tres cambios anteriores intactos
  y la prueba de inspección modificada en esta fase.
- **Archivos nuevos de esta fase:** este informe, `operational-flow.spec.ts` y
  `fixtures/operational.ts`. Permanecen sin seguimiento. También siguen sin
  seguimiento `.codex/hooks.json`, los dos informes anteriores y `output/`
  (PDF previo y evidencias JSON locales). Los logs `.log` y `frontend/test-results/`
  están ignorados. No se añadió ningún archivo al índice.
- **Sin cambios:** lógica productiva, migraciones, RLS, dependencias y hooks.
  No se ejecutaron resets ni se eliminaron volúmenes o datos de otros proyectos.

Evidencias finales: `output/fase1-e2e-full.log`, `output/fase1-full-evidence.json`,
`output/fase1-vitest.log`, `output/fase1-sql-full.log` (fallo original de auditoría),
`output/fase1-sql-final.log` (PASS), y logs individuales de desarrollo
`output/fase1-operational-attempt*.log`. La traza de IDs permite consultar el
flujo sin incluir contraseñas ni tokens en el informe.
