# Auditoría de Reparaciones — 2026-09-05

## Dictamen

No recomendar todavía la liberación general a producción. El flujo principal
funciona localmente y R-AUD-01 a R-AUD-05 ya están corregidos y cubiertos por
regresiones.

Alcance: código de Reparaciones, contratos RPC, permisos, inventario asociado,
cotizaciones, historial, concurrencia y pruebas locales. No se evaluaron otros
módulos como productos completos ni se inspeccionaron datos, despliegues o reglas
de protección de ramas de producción. Esta revisión no certifica ausencia de
otros defectos.

## Pendientes encontrados

### R-AUD-01 — P1 corregido: se perdía la clave de creación al cerrar después de un timeout

**Reproducido con Chromium y PostgreSQL reales.** Se envía `create_repair`, se
espera la respuesta exitosa del servidor y se sustituye solo esa respuesta por
un 504. El usuario cancela el diálogo, vuelve a abrirlo e introduce los mismos
datos. El segundo POST lleva otra `operation_key` y quedan **dos reparaciones**
con la misma referencia. La unicidad del backend funciona; el cliente pierde
la identidad de la intención pendiente.

Referencia: `frontend/src/modulos/reparaciones/componentes/DialogoReparacion.tsx:187`.
El patrón de reinicio también existe en `DialogoRepuesto.tsx:80` y
`DialogoCotizacion.tsx:107`; la reproducción de esta auditoría se realizó sobre
creación, no se afirma haber reproducido los otros dos casos.

Corrección implementada: `estado/creacionPendiente.ts` conserva datos y clave en
`sessionStorage`, separados por organización y usuario, antes del RPC. El diálogo
recupera esos datos al reabrirse o después de recargar. Una respuesta ambigua
impide enviar otros datos hasta confirmar el intento original. Solo entonces se
elimina el pendiente y se permite una nueva creación intencional. Los errores
definitivos del primer intento permiten corregirlo; los rechazos de un reintento
ambiguo conservan la clave. Un fallo de almacenamiento impide enviar el RPC.

Verificado: dos E2E permanentes reproducen el 504 posterior al commit, cierran y
reabren o recargan, y exigen mismo payload, clave, ID devuelto y una sola fila.
Seis pruebas unitarias cubren persistencia, aislamiento, errores y nuevas
intenciones. El alcance de persistencia es la pestaña actual y sus recargas;
no cubre cerrar definitivamente la pestaña, borrar su almacenamiento ni otro
dispositivo. Reservas y cotizaciones conservan su implementación anterior.

### R-AUD-02 — P1 corregido: clientes y productos paginados

El problema original ordenaba y limitaba las opciones a 1.000 registros. Los
selectores filtraban solo lo descargado y no podían alcanzar el registro 1.001.

Corrección implementada: clientes y productos usan búsqueda remota y páginas de
25 elementos, con un máximo de 50 por petición en el servicio. Las consultas
ordenan de forma estable, devuelven el total y aplican `range`; la carga inicial
ya no descarga el catálogo completo. El selector compartido se usa al registrar
o editar una reparación, en productos de cotización y al reservar repuestos.

La opción actual se consulta directamente por organización e ID, sin exigir que
siga activa. Así una reparación o cotización histórica conserva y muestra su
referencia aunque esté fuera de la primera página o haya sido desactivada. Las
nuevas selecciones continúan limitadas a registros activos.

Verificado con 1.001 clientes y 1.001 productos reales en Supabase local: el E2E
comprueba posición mayor a 1.000, carga inicial acotada, cambio de página,
búsqueda remota, creación, edición después de desactivar el cliente y selección
del mismo producto como repuesto con stock FEFO. Las pruebas unitarias validan
los rangos de la página 41, filtros remotos, resolución directa de referencias
inactivas y conservación de la selección entre respuestas.

### R-AUD-03 — P2 corregido: detalle e historial completos

El problema original consultaba diagnósticos, repuestos, pruebas, eventos,
líneas y consumos sin recorrer páginas. La API local tiene `max_rows=1000`, por
lo que una respuesta exitosa podía omitir filas. Además, las líneas se pedían
para todas las versiones de cotización en un único `in(...)`.

Corrección implementada: las colecciones del detalle se leen en páginas de 500
filas con orden estable y conteo exacto. El servicio exige que la suma de las
páginas coincida con el conteo; una respuesta incompleta genera error en vez de
presentar un historial truncado. Los IDs de repuestos se agrupan en lotes de 100
para paginar consumos sin construir un filtro de URL excesivo.

Las cabeceras de cotización se conservan como historial, pero solo se consultan
las líneas de la cotización vigente seleccionada. La consulta de líneas también
es paginada y queda disponible por organización e ID para una selección concreta.

La prueba de volumen simula el límite de página y exige recuperar la fila 1.001
en diagnósticos, repuestos, pruebas, eventos, consumos y líneas. También comprueba
que la cotización histórica no provoque otra carga de líneas y que la consulta
use `quote_id`, no un `in(...)` con todas las versiones.

Validación final de R-AUD-03: **1.941 pruebas SQL**, **320 pruebas unitarias del
frontend** —incluidas **66 de Reparaciones**— y los **6 E2E de Reparaciones**
aprobados. También pasaron build, lint, tipos del frontend y de los E2E, y tipos
de los scripts del backend.

### R-AUD-04 — P2 corregido: identificación del ciclo vigente

La consulta de pruebas ahora solicita `test_cycle_number`. El detalle obtiene
`current_test_cycle_number` de `repairs` junto con la comprobación final de
`lock_version`, conservando el reintento del detalle si hay cambios concurrentes.
La pantalla separa los resultados del ciclo vigente del historial, identifica
cada ciclo y conserva las pruebas antiguas con ciclo nulo como historia sin
ciclo identificado. Un ciclo nuevo sin pruebas no hereda aprobaciones antiguas.

Referencias: `frontend/src/modulos/reparaciones/servicios/reparacionesService.ts:722`
y `frontend/src/modulos/reparaciones/componentes/DetalleReparacion.tsx:546`.

Validación: 58 pruebas unitarias de Reparaciones y los cinco E2E aprobados,
además de build, lint y tipos E2E. El recorrido completo incluye aprobación y
fallo del ciclo 1, bloqueo de salida, retrabajo, ciclo 2 vacío, bloqueo por falta
de prueba vigente, aprobación del ciclo 2 y entrega. La pantalla muestra los
resultados anteriores separados de los actuales durante ese recorrido.
No requiere migraciones nuevas: utiliza las columnas del contrato existente.

### R-AUD-05 — P2 corregido: técnicos asignables sin administración

La migración `20260905010000_add_repair_technician_role.sql` incorpora el rol
`TECNICO_REPARACIONES` con exactamente `REPAIRS_VIEW`, `REPAIRS_CHANGE_STATUS`
y `REPAIRS_PERFORM_TECHNICAL`. El formulario existente de usuarios permite
seleccionarlo al invitar y editar; la Edge Function acepta el mismo código.
Se reutilizan `roles`, `role_permissions` y `user_roles`, sin cambiar las
concesiones de ADMIN ni los validadores de capacidad técnica.

Las pruebas SQL ejercitan asignación y edición desde administración, consulta
con RLS, diagnóstico, solución, prueba y cambio de estado con la sesión del
técnico. También comprueban el rechazo de usuarios sin permiso, la revocación
de capacidad y la denegación de administración al actor técnico. Las pruebas
del formulario y de la Edge Function cubren el rol en creación y edición.

Validación: 1.661 pruebas SQL, 68 pruebas frontend de Usuarios/Reparaciones,
19 pruebas de Edge Functions y cinco E2E de Reparaciones aprobados; build,
lint y tipos del frontend, E2E, scripts y Edge Functions correctos. Los E2E
existentes conservan la sesión ADMIN; la sesión técnica se valida contra
PostgreSQL en la suite SQL. Para habilitarlo en otro entorno se deben aplicar
la migración, desplegar `admin-users` y publicar el frontend.

## Cobertura P1-10 incorporada durante este trabajo

`frontend/tests/e2e/repairs.spec.ts` ejecuta seis escenarios contra Supabase real:

1. Creación, asignación, diagnóstico, borrador, envío, aprobación, reserva,
   consumo, solución, prueba y entrega. Simula respuesta perdida **después** de
   confirmar creación, borrador, reserva y consumo. Comprueba payload idéntico,
   stock físico/reservado/asignable, ausencia de duplicados y bloqueo de entrega
   sin prueba aprobada.
2. Dos pestañas con una versión obsoleta: rechaza la acción sin sobrescribir la
   transición confirmada por la otra pestaña.
3. Rechazo y revisión con respuesta perdida: conserva el actor, dos versiones y
   una sola cotización vigente.
4. Creación con respuesta perdida y cierre/reapertura sin duplicación.
5. Creación con respuesta perdida y recarga sin duplicación.
6. Catálogos de 1.001 clientes y productos con carga inicial acotada, búsqueda,
   paginación, edición histórica inactiva y selección remota de repuesto.

Cada caso crea datos nuevos y usa una identidad local exclusiva de Reparaciones.
La suite se integra en el workflow E2E existente. Los historiales persistidos de
las ejecuciones locales se conservan; los UUID/referencias nuevos evitan que los
casos dependan de limpiarlos o de un orden entre casos.

Esta cobertura no equivale a todos los escenarios de negocio: cancelación y
liberación de reservas, restricciones de técnicos y contrato service_role
también deben mantenerse en la matriz de
regresión. Existen pruebas SQL para varias de esas reglas, pero no todas tienen
recorrido de navegador.

## Condiciones para liberar

Validación final de R-AUD-02: **1.941 pruebas SQL**, **318 pruebas unitarias del
frontend** y los **6 E2E de Reparaciones** aprobados. También pasaron build,
lint, tipos del frontend y de los E2E, y tipos de los scripts del backend. El
E2E de catálogo usa Supabase y Chromium reales con 1.001 registros por maestro.

- R-AUD-01 resuelto para cierre/reapertura del diálogo y recarga de la pestaña.
- R-AUD-02 resuelto para clientes, productos, cotizaciones y repuestos.
- R-AUD-03 resuelto mediante páginas verificadas y líneas por cotización vigente.
- Resolver o aceptar explícitamente los pendientes P2 según volumen y operación.
- Revisar y subir estos cambios, ejecutar CI sobre el commit final y comprobar
  que el resultado sea obligatorio para integrar la rama.
- Aplicar las migraciones en el entorno de destino y validar allí una reparación
  controlada. Las pruebas locales no demuestran que producción esté migrada.
