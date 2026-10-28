# Fase 2C — Auditoría de idempotencia, concurrencia y autorización

**Fecha:** 2026-10-21. **Alcance:** diagnóstico de los contratos actuales de Distribución, sin cambios de lógica productiva, migraciones, RLS, permisos, datos ni cuentas.

## Conclusión ejecutiva

La función instalada `record_distribution_delivery_outcome(jsonb)` confirma un defecto de idempotencia **P2**: para una clave ya usada en una organización solo compara `failure_category`. Si la categoría coincide —incluidos los resultados de éxito, donde es `NULL`— devuelve el ID anterior aunque la solicitud cambie de entrega, estado, fecha, evidencia, incidencias o cantidades. No duplica la fila, pero puede aceptar como exitosa una solicitud que no se persistió.

Los contratos de programación y despacho tienen comparaciones más estrictas: guardar una entrega compara el tipo y el `jsonb` completo; despacho compara organización, pedido y líneas solicitadas; ambos serializan reintentos con locks. La asignación física también tiene una prueba SQL con dos sesiones independientes. No encontré una prueba equivalente de concurrencia para resultados de entrega ni para dos entregas distintas del mismo pedido.

Las RPC examinadas sí aplican autorización dentro de `SECURITY DEFINER`: las cinco son ejecutables por `authenticated`, no por `anon`, usan `search_path` vacío y tienen guards de identidad y permisos en el código. Las lecturas requieren `DISTRIBUTION_VIEW`; las escrituras de Distribución requieren `DISTRIBUTION_MANAGE`; el despacho requiere además `INVENTORY_MANAGE`. No encontré una ruta de lectura cruzada entre organizaciones en las consultas revisadas.

La ACL del archivo E2E es demasiado amplia para contener contraseñas: `BUILTIN\Usuarios` puede leerlo y `Usuarios autentificados` puede modificarlo. El preparador escribe con `mode: 0o600`, pero no configura ACL de NTFS; por tanto, no garantiza un archivo restringido en Windows.

## 1. Estado Git y entorno inspeccionado

Al inicio: rama `main`, HEAD `425d91f93647fdc15f9c1f383dae920a0a7c61c6`, índice vacío y ningún cambio tracked pendiente. `git fetch origin` terminó correctamente. `origin/main` sigue en `df41d90c2da0ddb5570de4497d582c01afe03556`; la referencia remota no se actualizaba desde 2026-09-29 13:38:51 -05:00. El conteo es **6 ahead, 0 behind**. Los seis commits locales siguen presentes; no se hizo commit ni push.

Antes de crear este informe, los únicos untracked conocidos eran `.codex/hooks.json` y los artefactos bajo `output/` (evidencias JSON, capturas y PDF). Se preservaron y quedaron fuera de Git. Este informe es el único archivo nuevo de esta intervención y permanece sin seguimiento.

La instancia local corresponde al proyecto Supabase de este checkout: `backend/supabase/config.toml` define `project_id = "backend"`; `rtk docker ps` mostró los contenedores `supabase_*_backend`, incluidos Kong en 54321 y PostgreSQL en 54322. La base reporta 147 migraciones aplicadas y la versión más reciente `20260929154604`. `supabase migration list --local` encontró 147 archivos SQL locales, 147 versiones aplicadas y **cero diferencias** entre ambas listas. La consulta a la base fue de solo lectura. El contenedor `supabase_vector_backend` aparecía reiniciándose; `supabase_db_backend` estaba saludable.

## 2. Contratos efectivos

La definición de resultados creada en `20260922233000` fue envuelta en `20260923103000` para clasificar rechazos. La última redefinición es la de `20260925120000_support_independent_distribution_shipments.sql`; no existe una redefinición posterior de esa RPC. Esa misma definición se verificó en la base local mediante `pg_get_functiondef`.

| Operación | Definición efectiva | Persistencia y control transaccional |
|---|---|---|
| Programar/editar entrega | `save_distribution_delivery(jsonb)`, wrapper D3 de `20260929154604` sobre el contrato D1. | `distribution_command_operations` usa clave primaria `(organization_id, operation_key)`, guarda tipo, payload y resultado, y bloquea reintentos con advisory lock. El replay exige mismo tipo y payload JSONB. D1 bloquea entrega y pedido; D3 bloquea movimientos por UUID ascendente antes de comparar el saldo asignado. No genera movimientos físicos. |
| Registrar resultado | `record_distribution_delivery_outcome(jsonb)`, última definición en `20260925120000`, líneas 302–579. | `distribution_delivery_outcomes` tiene UNIQUE `(organization_id, operation_key)` y FK compuesta `(organization_id, delivery_id)`. Resultado, evidencia e incidencias se guardan en outcomes; cantidades, en `distribution_delivery_outcome_lines`. La actualización de la entrega y sus líneas ocurre en una transacción. |
| Consultar movimientos disponibles | `list_distribution_inventory_movements(uuid,uuid,uuid)`, D3. | Filtra por organización, pedido y movimientos `salida` de `order-dispatch`; resta allocations de entregas no canceladas y excluye la entrega que se está editando. Es lectura, no una reserva nueva. |
| Consultar trazabilidad | `list_distribution_delivery_inventory_trace(uuid,uuid)`, D3. | Lee allocations persistidas y las relaciona con movimientos dentro de la organización. |
| Despachar reservas | Wrapper `dispatch_order_from_reservations(jsonb)` de `20260929145934`, sobre la implementación interna `20260908193607`. | Advisory lock por organización/clave; bloqueo del pedido, venta, líneas y reservas; ordena reservas FEFO y crea una salida por bucket consumido. La auditoría guarda cantidades, reservas y movimientos. |

La tabla `distribution_delivery_outcomes` conserva una fila por operación y una restricción de unicidad organizacional, pero **la restricción no define por sí sola equivalencia del payload**. La comparación real del RPC es el factor determinante y es insuficiente.

## 3. Matriz de idempotencia

| Operación | Alcance de la clave y equivalencia efectiva | Reintento idéntico | Misma clave con payload distinto |
|---|---|---|---|
| Guardar entrega | `(organización, operation_key)`; `command_type` y payload JSONB completos. La clave es opcional en la RPC, aunque la UI siempre la genera. | Devuelve el mismo ID. | Lanza `DISTRIBUTION_OPERATION_KEY_REUSED`. |
| Reprogramar | Misma tabla común; tipo `reschedule_distribution_delivery`, payload completo. La RPC exige clave. | Devuelve el mismo ID antes de validar de nuevo la versión. | Lanza conflicto de clave si cambia el payload. |
| Registrar resultado | `(organización, operation_key)` en outcomes; compara **solo `failure_category`**. La RPC exige clave. | Devuelve el mismo ID. | Solo rechaza si cambia la categoría. Los demás campos no participan en la identidad. |
| Despachar | Advisory lock `(organización, operation_key)` y auditoría. Para el mismo pedido compara `requested_items`; una clave ya usada en otra operación/pedido entra en conflicto. | Devuelve el ID del pedido y no repite el despacho. | Cambiar cantidades solicitadas falla; cambiar `sale_id` o fecha con el mismo pedido y mismas líneas no forma parte de la comparación encontrada. |

La igualdad de JSONB de programación incluye arrays y valores, aunque el orden de las propiedades de un objeto JSONB no importa. Para despacho, la identidad persistida es más estrecha que el payload completo: se comparan las líneas pedidas, no todo el sobre de la RPC.

### Casos A–F de `record_distribution_delivery_outcome`

| Caso | Resultado según la función vigente | Evidencia/implicación |
|---|---|---|
| A — Misma entrega, estado, fecha, evidencia y cantidades | Devuelve el ID existente y no crea otro outcome. | Confirmado por la ruta de replay y la restricción UNIQUE. El test serial actual prueba un replay equivalente. |
| B — Misma clave, cambia cantidad | Devuelve el ID previo si la categoría de incidencia no cambia. | **Hallazgo confirmado:** la nueva cantidad no se valida ni persiste; el llamador recibe éxito aparente con el resultado anterior. |
| C — Misma clave, evidencia distinta | Igual que B: devuelve el ID previo cuando la categoría coincide. | La constancia no se compara. Incidencias y fecha tampoco. |
| D — Misma clave, otra entrega de la misma organización | Devuelve el ID del resultado anterior, si la categoría coincide. | **Hallazgo confirmado:** no compara `delivery_id`; puede identificarse como resultado de otra entrega. No crea un outcome nuevo. |
| E — Misma clave, estado distinto | `entregado` y `entrega_parcial` tienen categoría `NULL` y se aceptan como replay uno del otro. `rechazado` necesita categoría; misma categoría devuelve el anterior y categoría distinta falla. | La lista de estados válidos se comprueba **después** de buscar la clave existente. Un estado no válido como `fallido`, con categoría `NULL` y una clave de éxito existente, también puede devolver el ID previo antes de ser validado. |
| F — Misma clave, otra organización | Las claves están aisladas por organización. Una clave igual en otra organización es una operación independiente; la autorización se comprueba antes de consultar el replay. | No hay filtración entre organizaciones por esa clave. Un ID de entrega ajeno a la organización se rechaza al no encontrar la entrega, salvo el caso de replay incorrecto dentro de la misma organización descrito en D. |

En el código instalado, la consulta de replay de resultados filtra por organización y clave y luego solo ejecuta `existing_failure_category is distinct from failure_category_value`. No compara entrega, estado, fecha, evidencia, incidencias, líneas ni cantidades. Para solicitudes nuevas sí se validan estados, cantidades por línea, destino alcanzado, `lock_version` y estado de conciliación.

### Comportamiento de la interfaz ante reintentos

`DialogoResultadoEntrega` mantiene una clave mientras se reintenta sin editar y genera otra al cambiar campos o cantidades. Esto hace que el flujo ordinario de UI envíe el mismo payload al reintentar y una clave nueva cuando el usuario cambia el resultado. No sustituye la garantía de la RPC: una repetición directa del contrato, un cliente futuro o un reintento que no preserve exactamente esa regla sigue expuesto. La UI ignora el UUID devuelto por la RPC y trata cualquier respuesta sin error como éxito.

## 4. Matriz de concurrencia

| Escenario | Garantía observada en el código | Prueba existente | Estado del diagnóstico |
|---|---|---|---|
| Dos asignaciones compiten por el mismo saldo físico | D1 serializa por pedido; D3 bloquea los movimientos en orden UUID y vuelve a sumar allocations después del lock. El límite es `allocated + solicitado <= movement.quantity`. | `distribution_allocation_concurrency.test.sql` usa dos sesiones `dblink` y una barrera; dos allocations de 70 contra 100 producen una ganadora y una rechazada. | Cobertura real de concurrencia en el archivo. No ejecutada en esta auditoría por su limpieza con `COMMIT`, borrados con triggers deshabilitados y creación/eliminación de `dblink`. |
| Dos resultados sobre la misma entrega | El RPC bloquea la fila de entrega y exige `expectedLockVersion`; la primera transacción incrementa la versión. Una solicitud concurrente con la versión anterior debe recibir `DISTRIBUTION_VERSION_CONFLICT`. Un reintento posterior encuentra la clave antes del lock. | `distribution_deliveries.test.sql` cubre serialmente replay y versión obsoleta; no crea sesiones simultáneas de outcomes. | Protección estática confirmada; la carrera real y el replay de la solicitud que pierde la carrera no están probados. |
| Resultados concurrentes de dos entregas del mismo pedido | Cada resultado bloquea su entrega. El trigger de sincronización bloquea el pedido y agrega outcomes de todas las entregas para proyectar `partially_fulfilled` o `delivered`. | No se encontró prueba `dblink` de outcomes en dos entregas. | El lock del pedido parece serializar la proyección y la consulta agregada; la secuencia concurrente no fue reproducida. |
| Cancelación simultánea con cambio de programación | Cambios de una entrega usan lock de fila y versión optimista; las transiciones de estado se validan en el contrato. Una versión obsoleta falla. | Hay pruebas seriales de transiciones, reprogramación y versiones; no carrera de sesiones. | No hay evidencia de un deadlock; no está demostrado por prueba simultánea. |
| Reintento simultáneo con misma clave de resultado | Outcomes no toman advisory lock por clave. Si ambas llamadas ven clave ausente y usan la misma versión, una puede registrar el resultado y la otra encontrará la versión actualizada y fallará por conflicto de versión. La ruta de `unique_violation` es una defensa secundaria. | No hay test de concurrencia de outcomes con la misma clave. | No se espera duplicado por versión/UNIQUE, pero la segunda llamada concurrente no tiene garantizado devolver el mismo ID. |
| Misma clave y payload diferente en simultáneo | La transacción ganadora define el resultado; la perdedora con versión obsoleta normalmente falla por versión. Si luego reintenta, la comparación incompleta puede devolver el ID ganador aunque el payload no coincida. | No hay prueba `dblink` para esta condición. | Riesgo derivado del defecto de idempotencia; no se reprodujo en runtime. |

**Orden de locks observado:** programación/edición y resultados siguen entrega → pedido; asignación D3 bloquea movimientos después y en orden UUID. Despacho bloquea pedido → venta → líneas → reservas FEFO y no toma locks de entregas. No se identificó un ciclo de lock concreto entre estas rutas. La conclusión es estática y no descarta todos los interleavings ni reemplaza las pruebas concurrentes faltantes.

## 5. Autorización y aislamiento organizacional

Las cinco funciones observadas en PostgreSQL local son `SECURITY DEFINER`, tienen `search_path=""`, `EXECUTE` denegado a `anon` y concedido a `authenticated`. El código efectivo y las pruebas catalogadas confirman guards explícitos. RLS complementa las lecturas de tablas, pero no se considera la autorización suficiente de estas funciones porque `SECURITY DEFINER` ejecuta con privilegios del dueño.

| RPC | Autorización efectiva en backend | Alcance de IDs | Cobertura encontrada |
|---|---|---|---|
| `save_distribution_delivery` | Requiere `auth.uid()` y `DISTRIBUTION_MANAGE`. | El contrato D1 consulta pedido/venta en la organización indicada. D3 busca movimientos en esa organización, verifica salida `order-dispatch`, reserva, línea, pedido y auditoría de despacho; FK compuestas refuerzan delivery/order/line. | `sales_distribution_authorization.test.sql`: sin permiso y `DISTRIBUTION_VIEW` no gestionan. `distribution_deliveries.test.sql`: org no autorizada. D3 prueba movimiento de otra organización y línea incorrecta. |
| `record_distribution_delivery_outcome` | Requiere sesión y `DISTRIBUTION_MANAGE`, antes de la búsqueda de clave. | Bloquea entrega por `(organization_id,id)` y exige que cada línea esté asignada a esa entrega. Outcomes y líneas tienen FK compuestas de organización. | Se verifica `anon` sin `EXECUTE`; no se encontró un caso explícito de outcome con ID de entrega de otra organización o sin claim de sesión. Guard y claves foráneas son explícitos en fuente. |
| `list_distribution_inventory_movements` | Requiere sesión y `DISTRIBUTION_VIEW`. | Filtra movimientos por organización; une línea por su organización y pedido. | D3 prueba permiso de otra organización, `anon` sin `EXECUTE` y disponibilidad serial. No se encontró una prueba con rol solo-lectura llamando directamente esta RPC. |
| `list_distribution_delivery_inventory_trace` | Requiere sesión y `DISTRIBUTION_VIEW`. | Filtra allocations y movimientos por organización; la relación está normalizada con FK compuestas. | D3 prueba la traza persistida y visibilidad de allocations; falta matriz específica de RPC con rol `DISTRIBUTION_VIEW` sin gestión. |
| `dispatch_order_from_reservations` | Wrapper público requiere sesión, `DISTRIBUTION_MANAGE` y `INVENTORY_MANAGE`; la función interna vuelve a comprobar sesión y `INVENTORY_MANAGE`. | Pedido, venta, líneas y reservas se buscan con `organization_id`; las reservas solo consumen `source_type='order-item'` de la línea solicitada. | `sales_distribution_authorization.test.sql` prueba `SALES_VIEW` y `DISTRIBUTION_VIEW` sin dispatch; pruebas de dispatch verifican reserva y payload. No se encontró caso exhaustivo que inyecte IDs de reserva/pedido de otra organización en cada ruta. |

`distribution_delivery_outcomes` y `distribution_delivery_outcome_lines` tienen RLS y permisos de lectura para authenticated; las escrituras directas están revocadas. `distribution_delivery_items` y las allocations físicas tienen el mismo patrón de lectura bajo `DISTRIBUTION_VIEW`, sin INSERT directo desde authenticated. Las RPC son las puertas de escritura.

**No se encontró evidencia estática de acceso cruzado** en las cinco RPC. La prueba de que esto se mantiene requiere ejecutar una matriz con distintos usuarios y organizaciones en una base de test aislada, especialmente para `record_distribution_delivery_outcome` y los IDs de reservas de despacho.

## 6. Pruebas existentes y brechas

| Suite | Cobertura real que contiene | Brecha / ejecución en esta auditoría |
|---|---|---|
| `distribution_deliveries.test.sql` (plan 173) | Flujo serial de estados, resultados parciales y finales, límites por línea, replay idéntico de outcome, versión obsoleta, permisos y organización. El replay idéntico compara el ID y comprueba que no se cree otra fila. | No prueba el mismo key con cantidad/evidencia/entrega/estado diferentes ni dos sesiones simultáneas. No ejecutada aquí. |
| `distribution_delivery_inventory_allocations.test.sql` (plan 49) | Allocations explícitas, reparto entre entregas, límite físico, replay idéntico de programación, payload de allocation distinto rechazado, foreign movement y trazabilidad. | Son llamadas seriales; no prueba outcome idempotency conflictiva ni dos outcomes concurrentes. No ejecutada aquí. |
| `distribution_allocation_concurrency.test.sql` (plan 10) | Dos sesiones PostgreSQL distintas y carrera real para asignar más que el saldo de un movimiento. | El archivo limpia IDs fijos y confirma esa limpieza antes de la prueba; deshabilita triggers. No ejecutada sobre la base local persistente. |
| `order_dispatch_concurrency.test.sql` (plan 11) | Dos sesiones `dblink` intentan consumir la misma reserva; verifica un ganador, una salida y saldo final. | Hace limpieza con `COMMIT` de IDs fijos y elimina `dblink` si no existía. No ejecutada sobre la base local persistente. |
| `sales_distribution_authorization.test.sql` (plan 62) | Grants, RLS, usuarios `SALES_VIEW`, `DISTRIBUTION_VIEW`, usuario sin permiso y organización distinta; verifica guards de escritura. | No es concurrencia. Cambia `role_permissions` dentro del fixture transaccional. No ejecutada aquí. |
| `order_dispatch_from_reservations.test.sql` | Despacho FEFO, cantidades, referencias/movimientos en auditoría y conflicto serial de operation key al cambiar líneas. | No demuestra pérdida real de respuesta ni reintento de red. No ejecutada aquí. |
| `frontend/tests/e2e/operational-partial-deliveries.spec.ts` | Recorrido exitoso React de una salida compartida por entregas de 2 y 4; el contexto reporta Playwright 27/27. | No cubre reintentos, claves incompatibles, usuarios de solo lectura ni carreras concurrentes. No se volvió a ejecutar en esta auditoría. |

La presencia de pruebas `dblink` confirma que hay infraestructura de sesiones independientes para **asignación** y **despacho**. No convierte en concurrentes las pruebas seriales de outcomes o programación.

## 7. Seguridad de `frontend/.env.e2e.local`

`icacls frontend/.env.e2e.local` devuelve estas ACE heredadas:

| Grupo/principal | Permiso actual | Efecto |
|---|---|---|
| `BUILTIN\Administradores` | Full Control | Lectura y administración. |
| `NT AUTHORITY\SYSTEM` | Full Control | Acceso del sistema. |
| `BUILTIN\Usuarios` | Read & Execute | Cualquier usuario local de ese grupo puede leer las credenciales. |
| `NT AUTHORITY\Usuarios autentificados` | Modify | Cualquier usuario autenticado localmente puede leer y modificar el archivo. |

El archivo está ignorado por Git (`frontend/.gitignore:13`, `*.local`). Contiene cuatro pares de correo/contraseña para E2E y datos de fixtures codificados en Base64; no contiene URL de Supabase ni `service_role`/`secret key`. `frontend/.env.local` configura la URL `http://127.0.0.1:54321` y una publishable key, sin key privilegiada. Por tanto, los pares se usan como credenciales Auth de la instancia local si las cuentas siguen vigentes; en esta auditoría no inicié sesión ni comprobé contraseñas.

El preparador asigna roles `ADMIN` a E2E_ADMIN y E2E_REPAIRS, y `VENTAS` a E2E_MEMBER y E2E_RECOVERY; busca cuentas existentes y puede actualizar sus contraseñas. No se ejecutó el preparador ni se verificó la identidad actual de esas cuentas.

`writePlaywrightEnvironment` escribe el archivo con `writeFileSync(..., { mode: 0o600 })`, pero no usa `icacls` ni modifica las ACE heredadas. La ACL observada demuestra que el archivo actual no es privado; el `mode` de Node no establece por sí mismo permisos NTFS restrictivos. Si el preparador lo sobrescribe, el archivo conserva la ACL existente; si lo crea, recibe la herencia del directorio. **El preparador no garantiza permisos NTFS estrechos.**

Recomendación para aplicar en otra intervención: ACL explícita que limite lectura/escritura a la cuenta que ejecuta las pruebas, con `SYSTEM` y Administradores según política local; quitar `BUILTIN\Usuarios` y `Usuarios autentificados` de este archivo y evitar heredar permisos amplios. No se cambió la ACL.

## 8. Hallazgos, severidad y evidencia

| ID / severidad | Tipo | Hallazgo | Estado |
|---|---|---|---|
| 2C-01 / P2 | Integridad e idempotencia | El replay de resultado solo compara `failure_category`. Una clave repetida con distintas cantidades, evidencia, fechas, entrega o estado puede devolver un ID anterior como éxito aparente. | **Confirmado** en SQL fuente y definición instalada local (`pg_get_functiondef`). No se hizo una escritura de reproducción porque el defecto es inequívoco por lectura. |
| 2C-02 / P2 | Seguridad local de credenciales | `BUILTIN\Usuarios` puede leer contraseñas E2E y `Usuarios autentificados` puede modificar el archivo. | **Confirmado** por `icacls`; el archivo contiene los campos sensibles, sin imprimir sus valores. ACL sin cambios. |
| 2C-03 / brecha de pruebas | Concurrencia | No hay prueba de sesiones independientes para resultados simultáneos, reintento concurrente de clave igual/diferente, dos resultados de entregas distintas del pedido o cancelación contra programación. | **Brecha confirmada** en el inventario de suites. Los resultados de esas carreras no se reprodujeron. |
| 2C-04 / brecha de pruebas | Autorización | Faltan casos RPC específicos de resultado con usuario sin sesión/sin gestión e IDs ajenos, además de rol solo lectura sobre ambas RPC de consulta. | **Brecha confirmada**; los guards y constraints estáticos están presentes. No hay defecto de autorización probado. |

No se confirmó sobreasignación concurrente de un mismo movimiento ni consumo duplicado por despacho: hay mecanismos de lock en código y pruebas `dblink` dedicadas. La ejecución de dichas pruebas no se atribuye como PASS en este informe.

## 9. Propuesta mínima y orden recomendado

1. **Cerrar la identidad del comando de resultado:** tras autenticar y verificar `DISTRIBUTION_MANAGE`, normalizar la solicitud y comparar en un replay exitoso, como mínimo, organización/clave (scope), entrega, estado, categoría, fecha, evidencia, incidencias y conjunto de pares línea/cantidad. Una clave incompatible debe producir un error explícito y nunca el ID de otra entrega. Los datos de transporte como `expectedLockVersion` deben tratarse de manera deliberada para que un replay confirmado no dependa de una versión ya consumida.
2. **Añadir pruebas seriales de Casos A–F:** verificar ID estable para payload idéntico; conflicto para cada campo de negocio cambiado; no aumento de outcomes/lines; dos organizaciones con la misma clave aisladas; y entrega extranjera no revelada.
3. **Añadir pruebas de concurrencia de outcomes en una base efímera:** misma entrega/same key, misma entrega/keys diferentes, payload conflictivo con la misma key y dos entregas de un pedido con actualización agregada de estado. Comprobar outcomes, líneas y versiones, no solo mensajes de error.
4. **Completar autorización con usuarios independientes:** anon, authenticated sin permiso, `DISTRIBUTION_VIEW` sin gestión, organización distinta y IDs de pedido/entrega/línea/movimiento/reserva extranjeros. Mantener las pruebas de escritura limitadas a una base de pruebas desechable claramente identificada.
5. **Asegurar ACL NTFS del archivo generado:** modificar preparador solo con alcance aprobado y comprobar la ACL tras creación y sobrescritura.

Las correcciones no están implementadas; el primer cambio recomendado es la equivalencia completa del payload de resultado, seguido por sus pruebas de regresión.

## 10. Comandos y comprobaciones realmente ejecutados

| Comprobación | Resultado |
|---|---|
| `git status --short --untracked-files=all`, rama/HEAD, índice | `main`, HEAD esperado, índice vacío, sin cambios tracked previos. |
| `git fetch origin`; comparación con `origin/main` | Correcto; 6 ahead, 0 behind; referencia y fecha indicadas en §1. |
| `git diff --check` | Sin errores en cambios tracked previos. Se repitió después de crear el informe; el informe nuevo también se comprobó por espacios finales. |
| Búsqueda de redefiniciones en `backend/supabase/migrations` | Última definición de outcome en `20260925120000`; no hay redefinición posterior. |
| Supabase CLI `migration list --local` y `db query --local` de solo lectura | 147 archivos y aplicados; cero diferencias; última versión `20260929154604`; verificación de `SECURITY DEFINER`, `search_path` y grants; comparador incompleto confirmado. |
| `rtk docker ps` | Lectura de estado de contenedores locales; DB saludable, vector en reinicio. |
| `icacls frontend/.env.e2e.local` | ACL heredada amplia transcrita en §7; sin modificación. |
| `git check-ignore -v frontend/.env.e2e.local` | Ignorado por `frontend/.gitignore:13` (`*.local`). |
| Pruebas SQL, Playwright, Vitest | **No ejecutadas** en esta auditoría. Las suites de concurrencia contienen limpieza, commits, cambios temporales de triggers y/o administración de `dblink`; no son seguras sobre esta base persistente. El 27/27 de Playwright se registra solo como resultado previo informado en el contexto. |

## 11. Estado Git final

Se creó únicamente este informe. No se modificaron archivos productivos, migraciones, RLS, permisos, bases, cuentas, ACL ni hooks. No se hizo commit ni push. El índice permanece vacío y continúan los seis commits locales delante de `origin/main`. `.codex/` y `output/` siguen excluidos de Git y preservados como untracked.
