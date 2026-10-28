# Fase 2C-4 — Seguridad y concurrencia complementaria

Fecha de ejecución: 22 de octubre de 2026, America/Lima.

## Resultado

Las cinco carreras seleccionadas y la matriz de autorización pasaron. No se confirmó un defecto productivo ni se modificó SQL productivo, RLS, permisos de usuarios existentes o migraciones.

- Ejecución completa del arnés: **77/77 aserciones PASS**. Incluye preparación, conteo de resultados, estados, versiones, cantidades, auditoría, solapamiento y preservación de datos; no son 77 escenarios distintos.
- Después se reforzó el caso de despacho para utilizar una clave realmente confirmada, en lugar de limitarse a comprobar el guard sobre un pedido cerrado. Se ejecutó solo autorización: **39/39 PASS**, incluyendo replay autorizado y rechazo después de revocación. No se suman ambas cifras porque comparten pruebas. El código de concurrencia no cambió después de su ejecución aprobada.
- Lectura adicional de los diez productos nuevos conservados durante el desarrollo: cada uno mantiene físico **4** y reserva pendiente **0**.

## Entorno e identidad

Proyecto temporal `silsanplexp2c2`, directorio `C:\Users\ADMIN\AppData\Local\Temp\silsanplex-phase2c2-20261021`, API 58121, DB 58122, contenedor `supabase_db_silsanplexp2c2`, volumen `supabase_db_silsanplexp2c2`.

Antes de escribir, el arnés verifica configuración, etiquetas reales de proyecto de DB/Kong, puertos publicados, estado en ejecución, montaje real del volumen y etiqueta de este. Consulta la función viva con `pg_get_functiondef` y exige la comparación de clave corregida y el advisory lock. Todas las consultas se ejecutan en ese contenedor fijo. No se usan credenciales de `backend` ni conexiones a sus puertos. No se iniciaron ni reiniciaron proyectos Docker.

Se reutilizaron las 148 migraciones instaladas. No se ejecutaron resets, migraciones ni reconstrucciones. La identidad temporal se comprobó en el mismo volumen validado por 2C-2/2C-3.

## Cobertura existente frente al incremento

| Contrato | Evidencia anterior | Incremento 2C-4 |
| --- | --- | --- |
| Resultado idéntico/conflictivo, cantidades, evidencia y versiones | 2C-2, idempotencia 35 aserciones | No se repitió la suite histórica |
| Misma clave concurrente, misma entrega y distintas entregas del mismo pedido | 2C-2, concurrencia 34 aserciones | No se repitieron esas carreras |
| Estados, programación, entrega parcial, rechazo | `distribution_deliveries.test.sql`, 173 aserciones | Cancelación contra edición; reprogramación contra resultado |
| Movimiento compartido, sobreasignación, identidad física y empresa | `distribution_delivery_inventory_allocations.test.sql`, 49 aserciones | Conservación de allocations y movimientos durante conflictos |
| Grants, RLS y permisos comerciales | `sales_distribution_authorization.test.sql`, 62 aserciones | Matriz homogénea de las cinco RPC, VIEW sin MANAGE, claves confirmadas tras revocación |
| Respuesta HTTP perdida tras commit | 2C-3, Playwright 1/1 | No se repitió el recorrido React |
| Asignación y despacho simultáneos | Suites existentes de allocation/dispatch | Inspección de cobertura; no reejecutadas |

Las cinco suites de 2C-2 suman 353 aserciones previamente ejecutadas; esa cifra es histórica. Las suites antiguas de concurrencia contienen IDs fijos, limpieza y modificaciones temporales de triggers. No se ejecutaron sobre los fixtures conservados de 2C-3.

## Matriz de autorización efectiva

Las pruebas crean cuatro identidades Auth ficticias independientes, una segunda organización y dos roles nuevos dentro de una única transacción que termina en rollback. El rol VIEW contiene solamente `DISTRIBUTION_VIEW`; el de gestión contiene `DISTRIBUTION_VIEW`, `DISTRIBUTION_MANAGE` e `INVENTORY_MANAGE`. No se cambia la cuenta E2E existente. Se ejecuta `SET LOCAL ROLE anon/authenticated` y se establece el sujeto de cada identidad; las RPC reales conservan SECURITY DEFINER y realizan sus comprobaciones explícitas.

| Identidad | save_distribution_delivery | record_distribution_delivery_outcome | list_distribution_inventory_movements | list_distribution_delivery_inventory_trace | dispatch_order_from_reservations |
| --- | --- | --- | --- | --- | --- |
| Anónima | 42501, EXECUTE denegado | 42501, EXECUTE denegado | 42501, EXECUTE denegado | 42501, EXECUTE denegado | 42501, EXECUTE denegado |
| Autenticada sin permisos | 42501 DISTRIBUTION_FORBIDDEN | Igual | Igual | Igual | 42501 ORDER_DISPATCH_FORBIDDEN |
| Solo VIEW | 42501 | 42501 | Lectura permitida | Lectura permitida, identidad de entrega comprobada | 42501 |
| Gestión autorizada | Replay devuelve UUID original | Replay devuelve UUID original | Lectura permitida | Lectura permitida | Replay confirmado devuelve pedido original |
| Gestión en otra empresa, solicitud a empresa A | 42501 | 42501 | 42501 | 42501 | 42501 |
| Gestión retirada antes del reintento | 42501 | 42501 | 42501 | 42501 | 42501 |

Para programación, resultados y despacho, los reintentos posteriores a la revocación utilizan claves previamente confirmadas. La autorización ocurre antes de poder recuperar el resultado idempotente. Los replays autorizados se comparan con el UUID esperado, no solamente con ausencia de excepción.

Las lecturas de movimientos del pedido completamente asignado devuelven cero filas legítimamente; la lectura de trazabilidad devuelve una allocation conocida y exige la entrega exacta. No se confunde ausencia de filas con denegación de autorización.

## Matriz de aislamiento

| Solicitud desde usuario de B | Resultado efectivo |
| --- | --- |
| Organización A explícita | 42501 en las cinco RPC |
| Organización B con ID de pedido de A, lectura de movimientos | Éxito con arreglo vacío |
| Organización B con ID de entrega de A, lectura de trazabilidad | Éxito con arreglo vacío |
| Organización B con comando de programación y referencias de A | P0001 DISTRIBUTION_ORDER_NOT_FOUND |
| Organización B con entrega y clave de resultado de A | P0001 DISTRIBUTION_NOT_FOUND; nunca devuelve el UUID de A |
| Organización B con pedido y clave de despacho de A | P0002 ORDER_DISPATCH_ORDER_NOT_FOUND |

Se compara una instantánea completa de once tablas comerciales antes y después de las llamadas, **antes del rollback**: pedidos, ventas, movimientos, reservas, entregas, partidas, allocations, outcomes, líneas, operaciones idempotentes y auditoría. No hubo efectos de los rechazos ni duplicación por replays. Después del rollback se compara además la totalidad de las tablas observadas, incluidas identidades/roles/membresías, contra su estado previo.

El acceso directo a tablas bajo RLS y los casos de movimiento/reserva ajenos tienen evidencia histórica en las suites de autorización/allocations; no se presentan como pruebas nuevas de esta fase. La matriz nueva ejecuta las RPC bajo roles reales de PostgreSQL, no verifica emisión/validación de tokens de GoTrue ni JWT manipulados.

## Concurrencia ejecutada

Cada carrera usa dos procesos `psql` con conexiones PostgreSQL independientes. La sesión ganadora ejecuta la RPC real y mantiene su transacción abierta tres segundos antes de COMMIT. Se inicia la otra mientras esos locks siguen retenidos; `pg_stat_activity` debe mostrar dos PID distintos y a la segunda esperando un lock. No se deshabilitan triggers ni se reemplazan funciones productivas. Los timeouts impiden esperas indefinidas.

| Carrera | PID de las sesiones en ejecución final | Resultado y efectos |
| --- | --- | --- |
| Cancelación gana a edición, misma entrega/versión | 5376 / 5397 | Cancelado, versión 2; edición P0001 DISTRIBUTION_VERSION_CONFLICT; libera solo sus 3 unidades asignadas; cero outcomes; auditoría +2 |
| Edición gana a cancelación, misma entrega/versión | 5446 / 5468 | Programado, versión 2; cancelación con conflicto; allocations conservadas; cero outcomes; auditoría +1 |
| Resultado gana a reprogramación desde entrega parcial | 5667 / 5688 | Entregado, versión 6; reprogramación con conflicto; exactamente un outcome/línea nuevos; auditoría +2 |
| Reprogramación gana a resultado desde entrega parcial | 5737 / 5757 | Reprogramado, versión 6, fecha nueva; resultado con conflicto; sin outcome/línea adicional; auditoría +2 |
| Resultado de A y cancelación de B, mismo pedido | 5870 / 5891 | Ambos confirman; A entregado versión 5, B cancelado versión 2; pedido partially_fulfilled; 3 unidades asignadas; un outcome/línea; auditoría +4 |

La reprogramación no es admisible desde una entrega simplemente programada/en ruta: la prueba prepara un resultado parcial real, estado en el que tanto una conformidad adicional como reprogramar son comandos admisibles. Esto evita atribuir a concurrencia un rechazo puramente de workflow.

Cada fixture parte de una entrada de 10, pedido y despacho de 6, con dos entregas de 3. Las carreras conservan exactamente dos movimientos físicos. Se comprobaron outcomes, líneas, allocations, estados, versiones y diferencias exactas de auditoría; las excepciones no dejan escrituras parciales. No se observó deadlock en estos cinco solapamientos.

Orden instalado inspeccionado: programación/editado bloquea entrega, pedido y movements por UUID; resultado toma advisory lock organización/clave, entrega y pedido antes de los triggers agregados. Reprogramar bloquea la entrega y su actualización participa en los triggers de estado. La carrera de entregas relacionadas confirma serialización en el pedido para ese calendario de ejecución; no demuestra ausencia universal de deadlocks.

## Fixtures y conservación

Los fixtures de autorización desaparecen con rollback. Los de concurrencia usan UUID y referencias nuevas y se conservan bajo la organización temporal existente; se crean maestros específicos, stock y documentos con las RPC canónicas. No se reutiliza ni consume stock de los productos anteriores.

Últimos tres pedidos de la ejecución completa:

| Referencia | Pedido UUID |
| --- | --- |
| P2C4-BA3DF156 | 1e47f8a2-ccdb-426b-9c7f-0eb718cb88cb |
| P2C4-2FACA532 | 9831f3db-8162-415b-af16-3c4717ab1346 |
| P2C4-18A38668 | 6ed75115-e678-4955-9c54-af4fb63faddf |

El desarrollo y las ejecuciones progresivas dejaron diez pedidos/productos P2C4 nuevos en total, sin limpieza. Una lectura final confirmó saldo físico 4 y reserva pendiente 0 para los diez. Se comparan todas las filas preexistentes de 22 tablas antes y después de la prueba; la comprobación de conservación aprobó. Los documentos de 2C-3 y los otros fixtures anteriores permanecen intactos.

Durante la construcción del arnés hubo errores de fixture (formato de código en mayúsculas, tipo de documento del cliente, orden del GRANT sobre tabla temporal y valor por defecto de control de lote). Esas preparaciones estaban dentro de BEGIN y fallaron antes de COMMIT; se corrigió únicamente el arnés. No son defectos productivos.

## Comandos y archivos

Desde la raíz del repositorio:

```text
python backend/scripts/test-phase2c4.py
python backend/scripts/test-phase2c4.py --authorization-only
git diff --check
git status --short --untracked-files=all
git diff --cached --name-only
git rev-list --left-right --count origin/main...HEAD
```

Las ejecuciones reales utilizaron el prefijo RTK. La primera modalidad conserva nuevos fixtures; la segunda solo ejecuta autorización con rollback y verifica conservación. Evidencia detallada de esta sesión quedó fuera del repositorio en `%TEMP%/phase2c4-final.log` y `%TEMP%/phase2c4-auth-final.log`; no contienen credenciales y no se añadieron a Git. El arnés imprime cada aserción, resultado SQLSTATE/mensaje y estados persistidos.

Archivos nuevos: `backend/scripts/test-phase2c4.py` y este informe. No se modificó ningún archivo productivo ni archivo previo de 2C-1/2C-2/2C-3. Typecheck frontend, Vitest, build, Playwright y la regresión SQL histórica no se repitieron: esta intervención añade exclusivamente pruebas SQL orquestadas por Python y documentación.

## Defectos, límites y Git

No hay defecto productivo confirmado en los casos ejecutados. Quedan fuera la revocación mientras una RPC ya autorizada está en curso, cambios simultáneos de membresías/RLS, pruebas de carga y calendarios arbitrarios de locks, así como autenticación HTTP negativa completa. Las carreras de misma clave, resultados simultáneos y sobreasignación ya cubiertas no se repitieron. No se extrapola el PASS a todas las combinaciones posibles.

Inicial y final: rama main, HEAD `425d91f93647fdc15f9c1f383dae920a0a7c61c6`, seis commits por delante y cero por detrás de la referencia local origin/main. Índice vacío; `git diff --check` sin errores. Se conservaron los cambios tracked previos y los archivos sin seguimiento de 2C-1/2C-2/2C-3, `.codex/` y `output/`, todos fuera del índice. No hubo commit ni push ni se inició 2C-5.
