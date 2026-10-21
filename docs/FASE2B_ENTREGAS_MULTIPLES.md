# Fase 2B — Entregas múltiples a partir de una salida física

Fecha de ejecución: 21 de octubre de 2026
Repositorio SILSANPLEX · rama `main` · base local `8c812d7e244f16456d12be66766866f1c5f9c3ff`

## Resultado

El nuevo E2E demostró desde React que un pedido despachado completamente puede programarse en dos entregas independientes de 2 y 4 unidades. Ambas allocations reutilizaron el mismo movimiento físico de salida por 6 unidades; las cantidades asignadas y conformadas sumaron 6, el pedido pasó de `partially_fulfilled` a `delivered`, y Distribución no generó movimientos de inventario.

El escenario se ejecutó focalizado y dentro de la suite completa. En la primera recuperación, la preparación estándar resolvió los tres fallos anteriores, pero reveló un cuarto fallo en una expectativa posicional del E2E de clientes (26/27). Tras hacer que ese test localizara la dirección por su etiqueta visible, una segunda ejecución estándar terminó con **27/27 PASS**. El recorrido funcional y la suite completa quedaron probados.

## Escenario y persistencia comprobada

El fixture `operationalFixture` validó antes del recorrido que Supabase se ejecutaba en `localhost:54321`, que los contenedores pertenecían al proyecto Supabase `backend` en el directorio de SILSAN y que existía una sola organización activa, `drogueria-silsan`. El escenario usó esa misma comprobación y un token autenticado ordinario para leer persistencia. No usó service role desde el navegador, mocks de negocio, SQL para avanzar etapas, clics forzados ni limpieza de datos.

En la ejecución de la suite completa se generó la referencia `E2E-OPS-3C9CDFB0`, pedido `PED-000039`, producto `64e38630-aba7-4ca0-adc1-48f72f09484d`.

| Documento/registro | Identidad | Cantidad y estado comprobados |
|---|---|---|
| Compra | `68d8e934-0f91-474d-8417-85d72d2d4d06` | 1 línea, 10 unidades; recibida |
| Recepción | `34267fea-0edd-42e3-840f-bb15f185be05` | 1 partida inspeccionada, aceptada íntegramente; lote `LOT-E2E-OPS-3C9CDFB0`, vencimiento futuro |
| Cotización | `d93d2a66-af56-466a-96c9-b04130b373c5` | 1 línea de 6; emitida y aceptada al crear el pedido |
| Pedido / línea | `05ab00b8-bbf9-42d6-bb8a-dd45f8ab370f` / `bca61464-2a04-4088-9026-b420f001e429` | 6 unidades; reserva de 6 completamente consumida |
| Venta | `8196f42f-54fd-436d-a727-e4f67d1b5cf5` | Despachada; sin movimiento adicional al programar o conformar entregas |
| Reserva | `bf87021e-1804-4fd0-b418-d8121e49e137` | Histórica 6, consumida 6, pendiente activa 0 |
| Entrada | `60db3b20-8390-4bac-a353-7560a4c7080f` | 10 unidades |
| Salida física compartida | `792a9769-fc69-4557-82f4-2692b7530844` | 6 unidades; `source_type=order-dispatch`, enlazada a la línea y reserva anteriores |
| Entrega 1 | `3b5ee03a-48b0-4efb-9f4e-f07a11e0f450`; guía `T001-93691477`; referencia `E2E-OPS-3C9CDFB0-ENVIO-1` | Línea 2, allocation 2 del movimiento compartido, conformidad 2; `entregado` |
| Entrega 2 | `29c8bee3-7584-4105-a3da-9e5c2d3a4f03`; guía `T002-93691477`; referencia `E2E-OPS-3C9CDFB0-ENVIO-2` | Línea 4, allocation 4 del mismo movimiento, conformidad 4; `entregado` |

La primera entrega dejó el pedido con `fulfillment_status=partially_fulfilled`, la venta `despachada` y 4 unidades disponibles para programar y entregar. El formulario de la segunda programación expuso máximo 4 en la línea y en la asignación del lote. La segunda conformidad completó 6/6 y cambió el pedido a `delivered`; el estado comercial del pedido continuó `atendido`.

La verificación de trazabilidad persistida fue:

`entrega → distribution_delivery_items → distribution_delivery_inventory_allocations → inventory_movements → inventory_reservations`

Para cada entrega, `list_distribution_delivery_inventory_trace` devolvió el movimiento, lote, ubicación, almacén, cantidad asignada y reserva originales. Los resultados se comprobaron por entrega y línea mediante `distribution_delivery_outcomes` y `distribution_delivery_outcome_lines`. Esa tabla registra `order_line_id` y cantidad recibida; no atribuye directamente la conformidad del cliente a un movimiento o lote.

| Conservación final | Valor comprobado |
|---|---:|
| Recibido | 10 |
| Reserva histórica consumida | 6 |
| Despachado físicamente | 6 |
| Programado en las dos entregas | 2 + 4 = 6 |
| Asignado al movimiento compartido | 2 + 4 = 6 (no excede su cantidad 6) |
| Confirmado por resultado de línea | 2 + 4 = 6 |
| Pendiente de entrega | 0 |
| Stock físico final | 4 |
| Reserva pendiente | 0 |
| Movimientos del producto | 2: una entrada y una salida |
| Documentos de distribución | 2 entregas, 2 líneas, 2 allocations y 2 resultados |

Se compararon los identificadores del ledger antes de programar, después de cada programación, después de la primera conformidad y al final. En todos los puntos se conservaron exactamente la entrada y la salida originales.

## Cobertura y límites

- **Éxito funcional:** probado en UI real desde compra y recepción hasta las dos entregas, con comprobación de estados y persistencia.
- **Conservación y ausencia de duplicados en este recorrido:** probadas con conteos, cantidades, identidad compartida del movimiento, suma de allocations y comparación de IDs del ledger.
- **Idempotencia, concurrencia y autorizaciones:** no se prueban con este E2E. No deben considerarse cubiertas por el caso de éxito.
- **Sobreasignación/rechazo del caso límite:** el test confirma que las asignaciones exitosas suman 6 y no sobrepasan la salida de 6; no intenta enviar una séptima unidad ni duplicar una solicitud.
- No se modificó código productivo, contratos SQL, permisos, migraciones ni RLS. No se repitieron pruebas SQL porque el cambio se limitó a un E2E y documentación.

## Validaciones ejecutadas

| Comando | Resultado efectivo |
|---|---|
| `npm run test:e2e:typecheck` | PASS (`tsc --project tsconfig.e2e.json`) |
| `npx playwright test tests/e2e/operational-partial-deliveries.spec.ts --project=chromium` | PASS, 1/1 en la validación final; referencia `E2E-OPS-01F69A30`, pedido `PED-000040` |
| `npx playwright test --project=chromium` | 24 PASS / 3 FAIL de 27; el nuevo caso, `operational-fefo-multilot.spec.ts` y `operational-flow.spec.ts` pasaron, incluidos 1280×720 y 1440×1080 |
| `npm run test:e2e:local` (primera ejecución de recuperación) | La preparación estándar terminó; 26 PASS / 1 FAIL de 27. Pasaron las tres pruebas originales que fallaban; falló la expectativa posicional de direcciones en `customers.spec.ts` |
| `npm run test:e2e:local` (segunda ejecución de recuperación) | PASS, 27/27. Ejecutó `pretest:e2e` y preparó fixtures una vez antes de la suite |
| `npm test` | PASS, 88 archivos y 578 pruebas |
| `npm run lint -- --deny-warnings` | PASS, sin warnings |
| `npm run build` | PASS; Vite emitió una advertencia de tamaño para el chunk de Distribución (505.41 kB), sin fallar el build |
| `git diff --check` | PASS |

Los tres fallos de la suite completa fueron:

1. `auth.spec.ts`: el ingreso de la prueba de cambio de contraseña no llegó a `/` en 10 s (`page.waitForURL`), al iniciar con la identidad E2E de recuperación.
2. `inventory-fefo.spec.ts`: no encontró la fila de stock del fixture `E2E-FEFO-D428294084` / `LOTE-E2E-A`, esperada con cantidad 3.
3. `repairs.spec.ts`: el catálogo remoto no ofreció la opción esperada `E2ECAT1001` (`e0000000-0000-4000-8000-0000000003e9`).

La primera ejecución directa con `npx playwright test` había omitido `pretest:e2e`, por eso inició con fixtures locales desincronizados. La inspección previa confirmó que el preparador apuntaba a los contenedores Supabase con proyecto `backend` en este repositorio y a la única organización local activa `Droguería SILSAN S.A.C.` (`drogueria-silsan`). Las cuatro cuentas destino eran `@silsan.local`, con nombres E2E, una sola membresía activa en esa organización y roles esperados; los 1001 clientes y 1001 productos de catálogo tenían IDs reservados `E2ECAT`, creador E2E y organización correcta. No se encontró una cuenta ni un registro de esos fixtures perteneciente a otro usuario u organización.

La preparación se ejecutó dos veces en total, ambas exclusivamente mediante `npm run test:e2e:local`; cada invocación ejecutó `pretest:e2e` una vez. En cada preparación se sincronizaron las cuatro identidades E2E y sus membresías/roles, se hizo upsert de los mismos 1001 clientes y 1001 productos del catálogo de reparaciones, se crearon tres productos FEFO de prueba, seis almacenes y nueve movimientos de entrada; también se reescribió `frontend/.env.e2e.local` con las credenciales E2E y los fixtures actuales. El preparador no hizo reset ni borró historial empresarial; el único borrado de filas en código es la sustitución de `user_roles` filtrada por cada ID de usuario E2E y la organización SILSAN. Las pruebas crearon además datos comerciales identificados con referencias E2E; no se ejecutó limpieza ni se modificó `PED-000017` o `PED-000021`.

### Causa de los fallos y corrección

1. `auth.spec.ts`: la prueba de recuperación no alcanzó `/` con el estado previo de la identidad de prueba. El preparador volvió a sincronizar la contraseña de esa cuenta con el entorno E2E y la dejó confirmada; la prueba pasó tanto en la primera suite preparada como en la segunda. El registro previo no capturó una respuesta de autenticación que permita afirmar cuál atributo de la identidad estaba desincronizado, por lo que la causa confirmada es la falta de preparación de la cuenta/entorno, sin atribuirlo a un defecto de autenticación productivo.
2. `inventory-fefo.spec.ts`: el entorno anterior apuntaba al fixture codificado de producto/lotes que no estaba presente. La preparación creó nuevos productos, almacenes, existencias por lote y actualizó el valor `E2E_INVENTORY_FIXTURES_BASE64`; la prueba pasó en ambas suites preparadas.
3. `repairs.spec.ts`: antes de preparar, el registro fijo `E2ECAT1001` existía en la organización correcta pero estaba inactivo. El upsert del catálogo E2E lo activó con el resto de atributos esperados; todas las pruebas de reparaciones pasaron en ambas suites preparadas.
4. `customers.spec.ts`: la primera suite preparada falló porque el test asumía que la segunda dirección insertada siempre estaría en `data-address-index="1"`. La consulta de `customer_addresses` anidada no define orden; el contexto de error mostraba “Almacén secundario” en el primer artículo y el campo de índice 1 contenía “Av. Principal 100”. Una consulta de solo lectura confirmó ambos registros persistidos correctamente: principal (`is_default=false`) y secundaria (`is_default=true`). Se corrigió exclusivamente el selector E2E para localizar el artículo por “Almacén secundario”; la prueba pasó y la segunda suite quedó 27/27. No se cambió el servicio ni el modelo de datos.

No se repitieron SQL, Vitest, lint o build: la recuperación solo cambió datos locales de fixtures E2E y un selector de Playwright, sin cambiar lógica, RPC, esquema, RLS ni permisos. Los resultados Vitest/lint/build ya registrados arriba pertenecen a la validación previa de Fase 2B, no a esta recuperación. No se imprimieron contraseñas ni tokens. Se observó que la ACL NTFS de `frontend/.env.e2e.local` permite lectura a usuarios locales autenticados; el archivo contiene únicamente las credenciales de estas cuentas de prueba y claves públicas/fixtures E2E, pero la ACL permanece como riesgo local pendiente de endurecimiento.

## Archivos y Git

Archivo nuevo de esta fase: `frontend/tests/e2e/operational-partial-deliveries.spec.ts`. Este informe es el otro archivo nuevo. Para la recuperación se modificó únicamente el selector de direcciones de `frontend/tests/e2e/customers.spec.ts`; se conservó el cambio previo de `frontend/tests/e2e/operational-flow.spec.ts`. No se modificó el E2E ni el informe de Fase 2A, el fixture común, las migraciones, RLS ni código productivo.

Estado final: rama `main`, HEAD `8c812d7e244f16456d12be66766866f1c5f9c3ff`, tres commits por delante de la referencia local `origin/main`, índice vacío. Se conservan sin seguimiento los archivos y carpetas previos `.codex/`, `output/`, `docs/FASE2A_FEFO_MULTILOTE.md`, `docs/FASE2B_DIAGNOSTICO_PARCIALES.md` y `frontend/tests/e2e/operational-fefo-multilot.spec.ts`; el cambio tracked previo de `frontend/tests/e2e/operational-flow.spec.ts` también se conserva. El nuevo E2E y este informe permanecen sin seguimiento. No se hizo commit ni push.
