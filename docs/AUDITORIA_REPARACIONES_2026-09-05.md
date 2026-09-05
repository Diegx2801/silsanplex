# Auditoría de Reparaciones — 2026-09-05

## Dictamen

No recomendar todavía la liberación general a producción. El flujo principal
funciona localmente y la duplicación R-AUD-01 ya está corregida y cubierta con
regresiones de cierre y recarga. Los catálogos todavía tienen un
límite que impide operar con registros válidos fuera de la primera página.

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

### R-AUD-02 — P1 para catálogos grandes: clientes y productos truncados

Las opciones se ordenan y limitan a 1.000 registros. Los selectores filtran las
opciones ya descargadas; no existe una búsqueda remota que permita alcanzar el
registro 1.001. Un cliente o producto activo puede quedar fuera del registro de
reparaciones y de la selección de repuestos, aunque exista stock.

Referencias: `frontend/src/modulos/reparaciones/servicios/reparacionesService.ts:839`
y `:860`. Verificación por lectura del contrato de consulta; no se cargó un
catálogo de 1.001 registros durante esta auditoría.

Corrección: selectores con búsqueda remota paginada y resolución por ID de la
opción actual. Validar el registro 1.001 y referencias históricas inactivas.

### R-AUD-03 — P2: detalle e historial pueden quedar incompletos

Las consultas de diagnósticos, repuestos, pruebas, eventos, líneas de todas las
cotizaciones y consumos no recorren páginas. La API local tiene `max_rows=1000`.
En particular, las líneas se consultan para todas las versiones juntas: al
superar el límite, una versión puede mostrar menos líneas que las que explican
sus totales. El control de versión consistente no detecta esta truncación.

Referencias: `frontend/src/modulos/reparaciones/servicios/reparacionesService.ts:694`,
`:754`, `:779`; `backend/supabase/config.toml:19`.

Corrección: paginar historiales y cargar las líneas por cotización seleccionada,
con conteos que permitan detectar resultados incompletos. Hallazgo estático;
no se ejecutó una prueba de volumen de historial.

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

### R-AUD-05 — P2: falta un flujo operativo para habilitar técnicos no administradores

P1-06 ahora exige la capacidad explícita `REPAIRS_PERFORM_TECHNICAL` y la concede
inicialmente solo a `ADMIN`. Es una mejora de autorización, pero no se añadió un
rol técnico asignable desde la administración ni una interfaz de concesión de
capacidades. La habilitación de otros roles requiere configuración de backend.
No conviene resolver el alta de técnicos concediéndoles administración completa.

Referencia: `backend/supabase/migrations/20260904030000_require_repair_technical_capability.sql:11`;
catálogo permitido en `backend/supabase/functions/admin-users/schemas.ts`.

Pendiente de definición operativa: rol técnico con permisos mínimos y su alta
desde la administración, o un procedimiento explícito de concesión soportado.
No impide una operación limitada a administradores ya autorizados.

## Cobertura P1-10 incorporada durante este trabajo

`frontend/tests/e2e/repairs.spec.ts` ejecuta cinco escenarios contra Supabase real:

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

Cada caso crea datos nuevos y usa una identidad local exclusiva de Reparaciones.
La suite se integra en el workflow E2E existente. Los historiales persistidos de
las ejecuciones locales se conservan; los UUID/referencias nuevos evitan que los
casos dependan de limpiarlos o de un orden entre casos.

Esta cobertura no equivale a todos los escenarios de negocio: cancelación y
liberación de reservas, catálogos grandes, restricciones
de técnicos y contrato service_role también deben mantenerse en la matriz de
regresión. Existen pruebas SQL para varias de esas reglas, pero no todas tienen
recorrido de navegador.

## Condiciones para liberar

Validación ejecutada en este trabajo: **1.640 pruebas SQL aprobadas**, **15 E2E
aprobados (3 de Reparaciones)**, comprobación de tipos E2E y scripts del backend,
lint y build del frontend correctos. Después de corregir R-AUD-01 se volvieron a
ejecutar los cinco E2E de Reparaciones y sus seis nuevas pruebas unitarias:
todos aprobados. Las regresiones ahora exigen ausencia de duplicación.

- R-AUD-01 resuelto para cierre/reapertura del diálogo y recarga de la pestaña.
- Resolver R-AUD-02 antes de admitir catálogos mayores de 1.000 registros.
- Resolver o aceptar explícitamente los pendientes P2 según volumen y operación.
- Revisar y subir estos cambios, ejecutar CI sobre el commit final y comprobar
  que el resultado sea obligatorio para integrar la rama.
- Aplicar las migraciones en el entorno de destino y validar allí una reparación
  controlada. Las pruebas locales no demuestran que producción esté migrada.
