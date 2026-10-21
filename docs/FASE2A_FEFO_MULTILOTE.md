# Fase 2A — E2E FEFO multilote

Fecha de validación: 21 de octubre de 2026

Repositorio: SILSANPLEX

Escenario: compra inspeccionada, reserva FEFO, despacho y entrega con dos lotes

## Resultado

El escenario `recibe, reserva, despacha y entrega dos lotes mediante FEFO` se ejecutó y pasó en Chromium contra la instancia local Supabase de SILSAN. Las operaciones comerciales se hicieron desde controles reales de React. El test leyó los registros persistidos después de cada etapa usando el cliente autenticado ordinario del fixture; no empleó credenciales de servicio, mocks de negocio, SQL para avanzar etapas ni manipulación del DOM.

El fixture comprobó que los contenedores y puertos locales pertenecen al proyecto Supabase `backend`, ubicado en `backend/`, y que la base contiene exclusivamente la organización `drogueria-silsan`. El producto, proveedor, cliente, almacén y ubicación se aislaron por ejecución mediante referencias aleatorias; el producto se creó sin stock previo y con control de lote y vencimiento.

## Escenario verificado

La última ejecución completa generó la referencia `E2E-OPS-6227E651`, pedido `PED-000023` y dos lotes con fechas calculadas relativamente al día de ejecución:

| Lote | Vencimiento | Recibido | Reservado | Despachado | Asignado a entrega | Saldo físico |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `A-E2E-OPS-6227E651` | 2027-10-21 | 3 | 3 | 3 | 3 | 0 |
| `B-E2E-OPS-6227E651` | 2027-11-20 | 7 | 3 | 3 | 3 | 4 |

El lote A vence 30 días antes que B. La recepción ingresó diez unidades en dos partidas inspeccionadas íntegramente aceptadas. El test comprobó la identidad completa de cada partida: organización, producto, almacén, ubicación, lote y vencimiento.

La cotización se emitió por seis unidades y generó un pedido con almacén elegido explícitamente. La reserva persistida consumió tres unidades del lote A y tres del B, sin depender del orden de filas PostgREST. Después de reservar, el estado fue 10 físicas, 6 reservadas y 4 disponibles. El despacho desde Ventas consumió ambas reservas; creó una salida de tres unidades por lote. Al terminar quedaron 4 físicas, 0 reservadas y 4 disponibles.

Distribución programó una línea de seis unidades y asignó explícitamente tres unidades a cada movimiento de salida. La lectura de trazabilidad verificó el camino entrega → línea → allocation → movimiento físico → reserva → lote, incluyendo fechas, ubicación y cantidades. Las tres transiciones de seguimiento se ejecutaron desde React y la conformidad registró seis unidades recibidas. Programar y confirmar la entrega no agregó movimientos de inventario: se conservaron los cuatro identificadores existentes.

La evidencia JSON mantiene esa distinción: `allocatedToDelivery` informa la asignación de cada lote (3 y 3), mientras que `deliveryLineOutcome.quantityDelivered` informa las seis unidades conformes en la línea comercial. El resultado de conformidad es por línea y no atribuye confirmación individual a cada lote.

Los conteos finales del escenario fueron: una orden de compra, una línea comercial, una recepción, dos partidas e inspecciones, dos entradas, dos reservas consumidas, dos salidas, una entrega, una línea de entrega, dos allocations y un resultado. Los movimientos del producto sumaron cuatro: dos entradas por 3 y 7 y dos salidas por 3 y 3. El resultado persistido tuvo una línea vinculada al pedido con seis unidades entregadas.

La verificación del saldo del lote A se calculó desde sus entradas y salidas persistidas, por lo que no dependió de que una vista de stock muestre una fila con saldo cero.

## Cobertura y límites

| Aspecto | Estado | Evidencia |
| --- | --- | --- |
| Éxito funcional FEFO multilote | Probado | E2E real de punta a punta; A=3 y B=3 reservadas para un pedido de 6. |
| Conservación e idempotencia dentro del escenario | Parcialmente probada | Conteos exactos, movimientos sin duplicados y una sola entrega/resultado. No se repitió una misma operación para probar idempotencia frente a reintentos. |
| Concurrencia | Pendiente para Fase 2A | El escenario es serial. No ejecuta dos reservas o despachos concurrentes. |
| Autorización | Parcial | El flujo usa la sesión autenticada ordinaria de un usuario administrador y confirma su pertenencia a SILSAN. Este escenario no intenta permisos denegados ni aislamiento entre organizaciones. |
| RLS y contratos SQL | Sin cambios | No se modificaron RPC, migraciones, políticas ni contratos SQL. No se repitieron suites SQL. |

La infraestructura previa ya contiene pruebas FEFO y SQL de concurrencia; esos antecedentes no sustituyen nuevas pruebas de idempotencia, concurrencia o autorización para este recorrido integral.

## Validaciones ejecutadas

| Comando | Resultado efectivo |
| --- | --- |
| `npm run test:e2e:typecheck` | PASS, código de salida 0. |
| `npm run test:e2e:local -- operational-fefo-multilot.spec.ts` | PASS, 1/1 en Chromium. |
| `npm run test:e2e:local` | PASS, 26/26 en Chromium, incluida la vista integral a 1280×720 y 1440×1080. |
| `npm test` | PASS en repetición aislada, 88 archivos y 578 pruebas. |
| `npm run lint -- --deny-warnings` | PASS, código de salida 0 y sin warnings de Oxlint. |
| `npm run build` | PASS, código de salida 0. Vite informó que el chunk de `DistribucionPage` supera 500 kB minificado; no bloqueó el build. |
| `git diff --check` | PASS, sin errores de whitespace. |
| Suites SQL | No ejecutadas: no hubo cambios de backend, SQL, migraciones, RLS ni contratos. |

La primera ejecución completa de Playwright fue 25/26: el E2E anterior no encontraba su entrega porque el seguimiento pagina de diez en diez. Se añadió una búsqueda por número de pedido a sus pasos de seguimiento; la repetición completa pasó 26/26. La primera ejecución paralela de Vitest/build/lint fue 577/578 y falló una espera asíncrona de revocación de sesión. La prueba aislada y una ejecución completa posterior de Vitest pasaron. No se cambió código de autenticación.

Para el ajuste final del E2E FEFO se volvieron a ejecutar y aprobar el typecheck E2E, el caso focalizado, la suite completa Playwright (26/26), lint con `--deny-warnings` y `git diff --check`. No se repitieron Vitest, build ni SQL: el ajuste solo añadió una espera a una aserción E2E y clarificó el JSON de evidencia.

## Archivos modificados

- `frontend/tests/e2e/operational-fefo-multilot.spec.ts` — nuevo escenario integral, aserciones persistidas y evidencia JSON adjunta al resultado de Playwright.
- `frontend/tests/e2e/operational-flow.spec.ts` — búsqueda por número de pedido en seguimiento para que las comprobaciones existentes funcionen fuera de la primera página.
- `docs/FASE2A_FEFO_MULTILOTE.md` — este informe.

No se modificó código productivo, fixtures compartidos, migraciones, RPC, RLS ni permisos.

## Datos locales de prueba

No se borraron documentos ni movimientos. Dos intentos de Playwright terminaron después de programar la entrega y antes de completar su seguimiento; quedaron como datos de prueba locales:

- `PED-000017`, referencia `E2E-OPS-63275EE3`, 6 unidades, estado `programado`.
- `PED-000021`, referencia `E2E-OPS-5498DE84`, 4 unidades, estado `programado`.

El test crea referencias aleatorias y no reutiliza esos documentos. Las ejecuciones exitosas posteriores quedaron entregadas. Las pruebas pueden dejar documentos aislados en la base local al interrumpirse, porque este escenario no limpia datos y la tarea prohíbe borrarlos.

## Estado de Git

- Rama: `main`.
- HEAD: `8c812d7e244f16456d12be66766866f1c5f9c3ff` (sin commits nuevos).
- La rama local conserva sus tres commits previos por delante de `origin/main`; no se hizo push.
- Índice: vacío; sin commit ni push durante Fase 2A.
- No se incluyeron `.codex/`, `output/` ni archivos sensibles.
