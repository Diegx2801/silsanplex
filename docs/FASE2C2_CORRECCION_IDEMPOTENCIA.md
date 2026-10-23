# Fase 2C-2 — Corrección de idempotencia de resultados de entrega

Fecha: 21 de octubre de 2026
Repositorio: `Diegx2801/silsanplex`
HEAD: `425d91f93647fdc15f9c1f383dae920a0a7c61c6` (`main`)

## Estado

- **Implementado:** comparación completa del payload de resultado, serialización por organización y clave, y bloqueo anticipado del pedido para resultados de entregas concurrentes.
- **Probado:** cinco suites SQL en Supabase desechable; 353 aserciones en total. La suite de concurrencia usa dos sesiones PostgreSQL independientes mediante `dblink`.
- **Bloqueado:** nada para los escenarios focalizados ejecutados.
- **Pendiente:** ejecutar la suite SQL completa y desplegar la migración mediante el flujo de publicación habitual. No se hizo ninguna de esas acciones en esta intervención.

## Causa raíz y estrategia

La función efectiva devolvía el resultado encontrado cuando coincidía `failure_category`, sin comprobar entrega, estado, fecha, evidencia, incidencias ni cantidades. Su manejador genérico de `unique_violation` también podía devolver el UUID existente aunque la violación proviniera de otra restricción. Por tanto, una clave reutilizada con otro comando podía aparentar éxito.

La auditoría confirmó que `distribution_delivery_outcomes` conserva organización, entrega, clave, estado, categoría, fecha, evidencia e incidencias; `distribution_delivery_outcome_lines` conserva línea y cantidad en `numeric(14,3)`. Se eligió reconstruir la identidad desde esas filas existentes. La migración no añade columnas ni duplica payloads.

La identidad compara organización, `operation_key`, entrega, estado, categoría, fecha efectiva, evidencia normalizada, incidencias y líneas. Las líneas se canonicalizan por `orderLineId`, UUID normalizado y precisión persistida; el orden del arreglo no tiene significado. Campos omitidos que el contrato normaliza a valores vacíos o `[]` coinciden con esos valores normalizados; un JSON `null` explícito donde el contrato exige un arreglo sigue siendo inválido. El orden y contenido de las incidencias se comparan como JSONB persistido.

`expectedLockVersion` sigue siendo obligatorio y se valida para comandos nuevos, pero queda fuera de la identidad. Un replay equivalente se resuelve antes de comprobar la versión actual. La búsqueda inicial y la recuperación de conflicto aplican la misma comparación. La recuperación solo maneja la restricción `distribution_delivery_outcomes_operation_key`; las violaciones de otras restricciones se relanzan.

## Hallazgo de concurrencia y corrección

La primera prueba real con dos entregas distintas del mismo pedido reprodujo `40P01 deadlock detected` durante la actualización de `distribution_deliveries`. Cada transacción conservaba el bloqueo exclusivo de su entrega; el trigger `guard_distribution_order_fulfillment` tomaba un bloqueo compartido del pedido y el trigger `sync_order_fulfillment_from_delivery` intentaba escalarlo a exclusivo. Dos sesiones podían completar ese ciclo de escalamiento simultáneamente.

La función ahora bloquea el pedido con `FOR UPDATE` después de bloquear la entrega y antes de insertar el resultado o actualizar el estado. Esto serializa los resultados de distintas entregas del mismo pedido antes de que se activen los triggers. El orden `entrega → pedido` coincide con `save_distribution_delivery`; no se cambiaron esa RPC, los triggers, el despacho ni otras operaciones logísticas.

## Migración y compatibilidad

Archivo creado: `backend/supabase/migrations/20261021120000_fix_distribution_outcome_idempotency.sql`.

La migración reemplaza únicamente `record_distribution_delivery_outcome(jsonb)`. Conserva `SECURITY DEFINER`, `search_path` vacío, autorización `DISTRIBUTION_MANAGE`, grants a `authenticated`, denegación a `anon`, auditoría y respuesta `uuid`. No reescribe resultados históricos ni modifica RLS.

Los resultados históricos se comparan usando sus campos y líneas ya persistidos. Si una fila histórica no permite demostrar equivalencia completa, el RPC no infiere que sea el mismo comando: devuelve `DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED`. No se introdujo una excepción de compatibilidad que convierta una comparación incompleta en éxito.

Archivos nuevos:

- `backend/supabase/migrations/20261021120000_fix_distribution_outcome_idempotency.sql`
- `backend/supabase/tests/database/distribution_outcome_idempotency.test.sql`
- `backend/supabase/tests/database/distribution_outcome_concurrency.test.sql`
- `docs/FASE2C2_CORRECCION_IDEMPOTENCIA.md`

No se modificó frontend, esquema, RLS, grants preexistentes ni migraciones históricas.

## Matriz de reintentos

| Caso | Comportamiento comprobado |
|---|---|
| Mismo payload normalizado y misma clave | Devuelve el mismo UUID; no duplica outcome, líneas, auditoría ni versión. |
| UUID de línea en mayúsculas, diferente orden y cantidad equivalente a `numeric(14,3)` | Se considera equivalente. |
| Cantidad distinta | Rechaza con `DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED`. |
| Evidencia, fecha, incidencias o estado distintos | Rechaza con `DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED`. |
| Entrega o categoría distinta | Rechaza con `DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED`. |
| Estado inválido | Devuelve `DISTRIBUTION_OUTCOME_INVALID`; no lo convierte en replay. |
| Misma clave UUID en otra organización autorizada | Crea y devuelve el resultado propio de esa organización; no reutiliza el UUID del primer tenant. |
| Reintento idéntico con versión obsoleta tras el primer resultado | Devuelve el UUID original; no incrementa versión ni agrega efectos. |
| `unique_violation` de otra restricción | Conserva SQLSTATE y mensaje originales; no devuelve un éxito de replay. |

Las comprobaciones de estado confirmaron que los rechazos no agregan outcomes, líneas ni auditorías y no incrementan `lock_version`.

## Matriz de concurrencia

| Escenario con sesiones independientes | Resultado |
|---|---|
| Dos llamadas simultáneas, misma clave y payload | Mismo UUID, un outcome, una línea, una auditoría y un solo incremento de versión. |
| Dos llamadas simultáneas, misma clave y cantidad distinta | Una operación gana; la otra recibe `DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED`; sin efectos duplicados. |
| Claves diferentes y misma entrega/versión | Una operación se confirma y la otra recibe `DISTRIBUTION_VERSION_CONFLICT`. |
| Resultados simultáneos de dos entregas del mismo pedido | Ambos se confirman, ambas entregas quedan terminales y el pedido termina en `delivered`; no se reproduce el deadlock tras el bloqueo anticipado del pedido. |

La suite comprueba que los trabajadores usan PID PostgreSQL distintos. No se extrapola este resultado a todas las operaciones logísticas ni a todas las formas de contención posibles.

## Entorno SQL aislado

Las pruebas se ejecutaron en `C:\Users\ADMIN\AppData\Local\Temp\silsanplex-phase2c2-20261021`, con `project_id = silsanplexp2c2`. Se verificaron sus etiquetas Docker, volumen y puertos exclusivos: API `58121` y PostgreSQL `58122` (los demás puertos también se reservaron para este proyecto). La instancia persistente local SILSAN está etiquetada `backend` y usa API `54321` y PostgreSQL `54322`; los comandos de prueba apuntaron únicamente al proyecto temporal.

Antes de las pruebas, la base temporal tenía las migraciones y datos maestros de instalación, sin usuarios de Auth ni documentos comerciales. Aplicó las 148 migraciones del repositorio, incluida la nueva migración. Tras incorporar el bloqueo anticipado, se volvió a aplicar el archivo de esa misma migración directamente en el contenedor aislado. Al finalizar, una consulta confirmó cero organizaciones, usuarios, entregas, resultados o auditorías de los fixtures de estas suites y ausencia del esquema y trigger temporal de concurrencia.

El proyecto temporal se detuvo con `supabase stop --project-id silsanplexp2c2`; no se usó `--no-backup`, por lo que se conservaron sus volúmenes. La instancia `backend` no se detuvo ni se reinició.

## Validaciones ejecutadas

Todos los comandos de prueba usaron `supabase test db --local --workdir C:\Users\ADMIN\AppData\Local\Temp\silsanplex-phase2c2-20261021 <archivo>` y se ejecutaron sobre los archivos del proyecto temporal.

| Suite | Resultado |
|---|---:|
| `distribution_outcome_idempotency.test.sql` | PASS — 35/35 |
| `distribution_outcome_concurrency.test.sql` | PASS — 34/34, `dblink` en sesiones independientes |
| `distribution_deliveries.test.sql` | PASS — 173/173 |
| `distribution_delivery_inventory_allocations.test.sql` | PASS — 49/49 |
| `sales_distribution_authorization.test.sql` | PASS — 62/62 |
| **Total focalizado** | **PASS — 353/353** |

El recorrido Playwright, Vitest, lint y build no se repitió: el cambio modifica solo el RPC de base de datos y sus suites SQL. No se ejecutó la suite SQL completa.

Durante el desarrollo hubo ejecuciones fallidas del arnés antes de obtener estos resultados: los fixtures requerían datos de transporte y transiciones válidas; algunas aserciones leían auditoría bajo RLS; y `dblink` necesitaba drenar el resultado asíncrono anterior. Se corrigieron los fixtures y las aserciones, sin cambiar reglas productivas. La carrera del pedido descrita arriba sí fue un defecto productivo reproducido y corregido.

## Riesgos residuales y Git

La nueva serialización evita el escalamiento simultáneo de locks observado, pero puede aumentar la espera entre resultados de un mismo pedido; esa contención es necesaria para conservar la proyección agregada. La prueba concurrente cubre los cuatro escenarios de la tabla, no cancelaciones, reprogramaciones ni carreras con todos los comandos logísticos.

Al inicio y al cierre: rama `main`, HEAD `425d91f93647fdc15f9c1f383dae920a0a7c61c6`, índice vacío y sin cambios tracked. Los cuatro archivos enumerados quedan sin seguimiento. Se preservaron los untracked preexistentes `.codex/hooks.json`, `docs/FASE2C_AUDITORIA_INTEGRIDAD.md` y `output/`. No se realizó commit ni push; la referencia local seguía seis commits delante y cero detrás de `origin/main`.
