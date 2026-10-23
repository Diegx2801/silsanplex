# Regresión Playwright general posterior a 2C

## Inventario previo a la ejecución

HEAD inicial `c68dbd9e892a654e83c57b38857475f3ef5a45a7`, rama `main`, índice vacío, 12 commits ahead y 0 behind de la referencia local `origin/main`. Sin cambios tracked iniciales. Se preservan `.codex/hooks.json` y los cinco archivos de evidencia existentes en `output/`.

| Archivo | Casos | Módulos y dependencias | Escrituras / particularidades |
| --- | ---: | --- | --- |
| auth.spec.ts | 9 | Auth, sesión, usuarios; admin, miembro y recuperación independientes; Edge admin-users real | Cambia contraseña de recuperación y revoca una sesión del miembro; dos respuestas de admin-users interceptadas para comprobar interfaz/401 |
| customers.spec.ts | 6 | Clientes, direcciones, importación CSV/XLSX; admin | Crea/edita clientes y direcciones únicos; autocompletado RUC interceptado, no demuestra proveedor externo real |
| inventory-fefo.spec.ts | 1 | Inventario, kardex, FEFO, transferencia, valorización | Consume fixture nuevo de 13 unidades: lotes 3/6/4, costes 10/20/30 y fechas futuras; no reutilizable tras consumo |
| operational-flow.spec.ts | 2 | Compras, recepción, ventas, inventario, distribución | Operaciones React reales a 1280×720 y 1440×1080; maestros únicos por caso |
| operational-fefo-multilot.spec.ts | 1 | Integración FEFO multilote completa | Compra 10, reserva/despacha/entrega 6; maestros únicos |
| operational-partial-deliveries.spec.ts | 1 | Distribución, dos entregas, replay después de respuesta perdida | Salida 6, entregas 2 y 4; RPC real antes de cortar respuesta, comprobación de UUID y persistencia |
| repairs.spec.ts | 6 | Reparaciones, catálogos remotos, reservas, consumo, revisiones, entrega | Identidad independiente; catálogo 1001 clientes/productos con IDs fijos de prueba, desactiva cliente 1001; dos variantes de recuperación; respuestas perdidas después de RPC real |
| sales.spec.ts | 1 | Cotización y validación de campos | Necesita cliente E2ECAT0001 y producto FEFO; no confirma documento |
| **Total** | **27** | Un worker, reintentos automáticos deshabilitados | Sin mocks nuevos de éxito comercial |

Todos los flujos usan `VITE_SUPABASE_URL`; se debe fijar a `http://127.0.0.1:58121` tanto en Vite como en Playwright y clientes Node. El modo normal carga variables locales de backend y no es admisible en esta intervención.

## Infraestructura inspeccionada

Proyecto temporal `silsanplexp2c2`, directorio autorizado `C:\Users\ADMIN\AppData\Local\Temp\silsanplex-phase2c2-20261021`. API 58121, PostgreSQL 58122; contenedores etiquetados por proyecto, volumen original `supabase_db_silsanplexp2c2`, creado el 21/10/2026. PostgreSQL 17.6; 148 migraciones instaladas, última `20261021120000`. Organización única activa `51fff05d-4ac5-4e1f-8fe9-c286d422601d`, slug `drogueria-silsan`.

Auth, Kong y PostgreSQL saludables; Edge Runtime activo con bind de funciones al directorio temporal, pero sin fuentes de funciones en ese directorio. Se requiere copiar exclusivamente fuentes versionadas de Edge Functions al bind temporal, conservando JWT y la configuración; no reconstruir ni migrar bases. El contenedor vector reinicia (aviso de infraestructura de logs, pendiente de clasificación).

Existe la identidad ficticia `phase2c3.runner@example.invalid`, 14 productos, 14 clientes, 14 pedidos, 28 entregas, 20 resultados y 28 movimientos. Deben conservarse intactos. No se rotará ni reutilizará la contraseña de esa cuenta.

## Plan seguro

Preparar cuatro cuentas ficticias nuevas por ejecución y roles apropiados, sin actualizar cuentas anteriores; catálogo fijo solo si no existe, abortando ante colisiones. Crear inventario FEFO nuevo mediante sesión ordinaria. Credenciales solo en memoria del runner y procesos hijos, sin escribir `.env`. Verificar función instalada contra la migración versionada; conservar snapshots de filas anteriores para comprobar ausencia de cambios. Añadir barrera de red para todas las páginas/contextos y comprobación del módulo Vite antes de cualquier login.

## Resultados

Comando desde frontend: rtk node scripts/run-isolated-regression-e2e.mjs.

El runner invoca Playwright --list y después test --retries=0 --reporter=list,json, con un worker Chromium. No activa pretest:e2e ni el preparador habitual. JSON y adjuntos quedan exclusivamente en output/, fuera del índice.

| Ejecución | Resultado efectivo | Evidencia / causa |
| --- | --- | --- |
| Preparación inicial | Abortada antes de crear usuarios | Código del rol con minúsculas violaba roles_code_format; corregido a mayúsculas |
| e576523fd072 | 27 descubiertos/ejecutados: 26 PASS, 1 FAIL, 0 SKIP, 0 flaky; 179,549 s | FEFO buscaba el código del almacén anterior a su normalización a mayúsculas. Conservación de fixtures previos PASS. output/isolated-regression-e576523fd072/results.json |
| Primera preparación con catálogo independiente | Abortada antes de insertar catálogo | Documento OTHER de 23 caracteres superaba límite 20; se redujo el prefijo y añadió validación previa. Se conservaron las cuatro identidades ficticias creadas, sin borrarlas ni rotarlas |
| 2a2488803c15 | Playwright: 27 PASS, 0 FAIL, 0 SKIP, 0 flaky; 194,158 s | output/isolated-regression-2a2488803c15/results.json. El wrapper terminó con ENOBUFS en su lectura final de conservación por superar 1 MB; esa comprobación no fue PASS |
| d8c6fe4989c5 | 27 ejecutados: 25 PASS, 2 FAIL, 0 SKIP, 0 flaky; 235,827 s | Fallos en ambos viewports de operational-flow al esperar Nueva cotización más de 15 s. Conservación de fixtures PASS. output/isolated-regression-d8c6fe4989c5/results.json |
| 1d2176835e58, archivos definitivos | **27 PASS, 0 FAIL, 0 SKIP, 0 flaky; 257,983 s** | Runner terminó con exit 0; conservación de fixtures PASS. output/isolated-regression-1d2176835e58/results.json. Duración del wrapper después del discovery, incluida verificación final: 262,704 s |

Los fallos detectados corresponden a preparación/infraestructura nueva, no a reglas productivas. Se corrigieron exclusivamente runner y parametrización de fixtures. El lector admite ahora 64 MB y no imprime stdout de comandos fallidos, que podría contener claves o filas.

## Preparación efectiva y seguridad

El nuevo runner verifica configuración, etiquetas CLI/Compose, contenedores activos, puertos, volumen/montaje original, red exclusiva de Edge, ruta del bind de funciones y SUPABASE_URL=http://kong:8000 interno. La etiqueta CLI workdir sigue ausente: no se falsifica; se conservan las comprobaciones independientes de 2C-3.

Comprueba las 148 migraciones ya instaladas y compara exactamente pg_proc.prosrc con el cuerpo de la migración versionada 20261021120000_fix_distribution_outcome_idempotency.sql, normalizando solo saltos de línea y bordes. No ejecuta migraciones. Obtiene las claves temporales desde supabase status --workdir <temporal> -o json, sin mostrarlas ni guardarlas.

Consulta efectiva adicional: save_distribution_delivery(jsonb), record_distribution_delivery_outcome(jsonb), list_distribution_inventory_movements(uuid,uuid,uuid), list_distribution_delivery_inventory_trace(uuid,uuid) y dispatch_order_from_reservations(jsonb) mantienen SECURITY DEFINER, search_path vacío, anon sin EXECUTE y authenticated con EXECUTE. Es una inspección de catálogo, no una repetición de la matriz de autorización 2C-4.

Se copiaron únicamente fuentes versionadas .ts/.json/.lock de las Edge Functions al bind temporal existente; se excluyen node_modules y secretos. Ante un archivo divergente el runner aborta. No se cambió configuración Docker ni se reinició ningún contenedor. Se verificaron respuestas 401 sin sesión en admin-users, ruc-lookup y dni-lookup. admin-users se invocó además realmente con sesión autorizada y devolvió al administrador ficticio esperado; también atendió las lecturas reales de las pruebas Auth.

Cada preparación crea cuatro cuentas nuevas regression.<runId>.<rol>@example.invalid. No utiliza ni actualiza phase2c3.runner@example.invalid, contraseñas previas o usuarios de backend. Las credenciales aleatorias viven solo en memoria y variables de procesos hijos. La clave administrativa permanece en el preparador; se eliminan variables administrativas heredadas antes de lanzar Vite/Playwright. No se escribe ningún archivo .env.

| Identidad | Acceso temporal |
| --- | --- |
| admin | Rol ADMIN existente, necesario para Control de usuarios y regresión operativa |
| member | VENTAS, sin administración de usuarios |
| recovery | VENTAS independiente; el caso de contraseña modifica exclusivamente esta cuenta nueva |
| repairs | Rol propio E2E_REG_REPAIRS_<runId>, con permisos REPAIRS_VIEW/CREATE/UPDATE/ASSIGN/CHANGE_STATUS/APPROVE_QUOTE/USE_PARTS/DELIVER/PERFORM_TECHNICAL, CUSTOMERS_VIEW/MANAGE, PRODUCTS_VIEW/MANAGE e INVENTORY_VIEW/MANAGE |

Se insertan membresías nuevas únicamente en la organización temporal comprobada. No se elimina ni reemplaza ningún rol o membresía previa. La revocación cierra solamente una sesión nueva de member; no es una rotación de credenciales anteriores.

FEFO se prepara mediante sesión ordinaria del administrador ficticio: producto nuevo, dos almacenes y tres entradas reales 3/6/4, costes 10/20/30, vencimientos futuros de 12/13/14 meses. Se usa el código de almacén persistido. La fecha operativa y el navegador se alinean con America/Lima para evitar entradas fechadas mañana después de medianoche UTC.

El catálogo de Reparaciones tiene IDs fijos por defecto en backend. En modo aislado se parametrizan IDs, nombres y prefijo, con UUID aleatorios y prefijo propio que respeta los 20 caracteres máximos del documento. Las primeras preparaciones completas crearon 1001 clientes y productos. El runner definitivo cuenta los registros activos anteriores a su objetivo: si ya hay al menos 1000, los utiliza exclusivamente en lectura para verificar paginación y agrega solo dos clientes y productos propios (0001 para Ventas y 1001 para desactivación/referencias históricas). En otro caso prepara 1001. Así puede repetirse sin sobrescribir ni reactivar el cliente 1001 anterior y sin multiplicar innecesariamente el catálogo. Se aborta ante colisión; no hay upsert.

Identidades preparadas en esta intervención: cuatro cuentas por cada prefijo e576523fd072, d41c29a6c3d7 (preparación de catálogo fallida), 2a2488803c15, d8c6fe4989c5 y 1d2176835e58; 20 cuentas ficticias nuevas en total. Se preserva la cuenta original: 21 cuentas temporales, ninguna empresarial. En la última ejecución se preservan las 17 identidades existentes antes de prepararla. No se eliminaron fixtures de intentos fallidos.

Antes de cada ejecución se conservan snapshots en memoria de filas existentes de products, customers, orders, order_items, sales, purchase_orders, distribution_deliveries, distribution_delivery_items, distribution_delivery_inventory_allocations, distribution_delivery_outcomes, distribution_delivery_outcome_lines, inventory_movements, inventory_reservations, organization_memberships, user_roles, roles y role_permissions. Al finalizar se exige que sigan presentes con idéntico contenido, mediante SHA-256; se contrastan email y updated_at de usuarios Auth previos. No se imprimen ni respaldan contenidos.

## Verificación del destino real

Los ocho specs usan fixtures/test.ts. En modo aislado, antes de cualquier login o creación de maestros:

- Ejecuta el preflight de operational.ts para silsanplexp2c2.
- Exige VITE_SUPABASE_URL exactamente http://127.0.0.1:58121.
- Lee el módulo servido /src/lib/supabase.ts y comprueba que Vite inyectó 58121, sin 54321.
- Instala una barrera en el contexto: aborta backend:54321/54322 y destinos HTTP externos. Auth, REST, Functions y Storage solo se admiten en el origen temporal.
- Observa solicitudes de todas las pestañas y exige cero destinos prohibidos. Se bloquean service workers para que no eludan las rutas.

Los clientes Node y la revocación por APIRequestContext utilizan el mismo entorno verificado. React recibe solo clave pública temporal y sesiones ordinarias. Playwright omite los .env locales con SILSAN_PHASE2C2_E2E=1; Vite hereda variables explícitas y no reutiliza un servidor previo (CI=true).

Los dos specs operativos que elegían backend implícitamente optan explícitamente por isolated-phase2c2 cuando el flag vale 1. Se contrasta el correo ficticio autorizado y su membresía única. Los checks estrictos de identidad del entorno habitual permanecen intactos.

## Archivos modificados

Nuevos:

- frontend/scripts/run-isolated-regression-e2e.mjs: identidad, preparación ficticia, Edge temporal, ejecución y conservación.
- frontend/tests/e2e/fixtures/test.ts: preflight y barrera común.
- docs/REGRESION_E2E_GENERAL_POST_2C.md: este informe.

Modificados:

- frontend/playwright.config.ts: modo aislado sin cargar .env locales, timezone y bloqueo de service workers.
- frontend/tests/e2e/fixtures/operational.ts: exporta preflight existente y contrasta identidad ficticia explícita.
- Los ocho frontend/tests/e2e/*.spec.ts: import del fixture protegido; operational-flow y operational-fefo-multilot optan por destino aislado; repairs y sales parametrizan catálogo aislado. operational-flow espera explícitamente que Nueva cotización esté habilitada (45 s) y usa Control+Home antes del clic normal, sin force, DOM artificial ni JavaScript. No cambian operaciones ni expectativas comerciales.

Specs exactos: auth.spec.ts, customers.spec.ts, inventory-fefo.spec.ts, operational-flow.spec.ts, operational-fefo-multilot.spec.ts, operational-partial-deliveries.spec.ts, repairs.spec.ts y sales.spec.ts, todos bajo frontend/tests/e2e/.

## Hallazgo de rendimiento y sincronización

Riesgo P3 confirmado para este entorno: Ventas depende del catálogo completo de clientes antes de habilitar Nueva cotización. VentasPage deshabilita el botón si clientesActivos o productosActivos están vacíos; useClientes llama listarClientesActivos, que pagina de 500 en 500 mediante listarTodosLosClientes. Con el catálogo preservado de más de 3000 clientes se superaron 15 segundos en los dos viewports; el snapshot de fallo ya mostraba el control habilitado cerca del límite. En 1440×1080 hubo también una intercepción del clic por el header sticky en ese límite.

La corrección E2E separa la espera de disponibilidad del presupuesto de acción y vuelve al inicio mediante teclado antes del clic normal. No afirma que se haya optimizado la aplicación ni convierte una respuesta fallida en éxito. La mejora de carga inicial de Ventas queda pendiente fuera de esta regresión. Los asserts de diálogo, foco, confirmación accesible, persistencia y stock se mantienen.

La última ejecución midió 15 727 ms y 15 766 ms hasta habilitar Nueva cotización, por encima del antiguo presupuesto de 15 s. Los escenarios completos pasaron a 1280×720 (31,5 s) y 1440×1080 (31,1 s), sin clics forzados.

## Evidencia definitiva por módulo

| Archivo | Ejecutados | PASS | FAIL | SKIP |
| --- | ---: | ---: | ---: | ---: |
| auth.spec.ts | 9 | 9 | 0 | 0 |
| customers.spec.ts | 6 | 6 | 0 | 0 |
| inventory-fefo.spec.ts | 1 | 1 | 0 | 0 |
| operational-fefo-multilot.spec.ts | 1 | 1 | 0 | 0 |
| operational-flow.spec.ts | 2 | 2 | 0 | 0 |
| operational-partial-deliveries.spec.ts | 1 | 1 | 0 | 0 |
| repairs.spec.ts | 6 | 6 | 0 | 0 |
| sales.spec.ts | 1 | 1 | 0 | 0 |
| **Total** | **27** | **27** | **0** | **0** |

Discovery y JSON coinciden: 27 casos en 8 archivos, todos con estado passed, sin reintentos ni casos flaky. Inicio UTC 2026-10-23T03:47:26.026Z (22:47 del 22/10 en Lima).

El escenario 2C-3 produjo el mismo outcome 774c8572-7da3-4ca9-88c0-bb7f8459ffe4 en ambos intentos con operationKey 8025174f-e6fd-4dd2-bd07-0315c31b763a; persistieron un outcome y una línea tras el replay y tras rechazar variantes incompatibles. La modificación de evidencia cambió la clave y recibió 400 después de que el primer comando quedara confirmado; no se presentó como éxito. Las dos entregas finales tienen cantidades 2/4, stock físico 4, reserva pendiente 0 y únicamente dos movimientos del producto (entrada/salida).

El wrapper definitivo verificó conservación de todas sus filas de referencia en 17 tablas y de las 17 identidades Auth preexistentes a esa preparación. Ningún test registró un destino prohibido. No se modificó backend: las escrituras se hicieron exclusivamente mediante la API 58121, dentro de silsanplexp2c2.

## Validaciones finales

| Comando desde frontend | Resultado efectivo |
| --- | --- |
| rtk node scripts/run-isolated-regression-e2e.mjs | Exit 0, 27/27 PASS y conservación PASS |
| rtk npm run test:e2e:typecheck | PASS |
| rtk npm run lint -- --deny-warnings | PASS, sin warnings |
| rtk npm test | PASS, 89 archivos, 580/580 pruebas; 10,93 s |
| rtk node --check scripts/run-isolated-regression-e2e.mjs | PASS |
| rtk git diff --check, desde raíz | PASS |

Durante el desarrollo, lint detectó el nombre use del callback Playwright como hook React dentro de try/finally. Se renombró a runTest; la ejecución final de lint está limpia. Avisos NO_COLOR/FORCE_COLOR del runner son de presentación de consola y no afectan pruebas. Git advierte conversión LF/CRLF en operational.ts; no hay errores de whitespace.

No se ejecutaron build ni SQL: solo cambió infraestructura y código de pruebas, sin archivos productivos, contratos SQL o dependencias nuevas. La rama POSIX/NTFS y la ACL real no se alteraron; no correspondía repetir ni modificar esa corrección.

## Estado Git y conclusión

Rama main, HEAD final conservado c68dbd9e892a654e83c57b38857475f3ef5a45a7. Referencia local origin/main df41d90c2da0ddb5570de4497d582c01afe03556: 12 ahead / 0 behind, sin fetch/pull. Índice vacío, sin commits nuevos ni push.

Diez archivos tracked modificados y tres archivos nuevos de esta intervención, enumerados arriba. Se mantienen intactos los archivos iniciales de .codex/ y output/; se agregan evidencias locales de las cuatro ejecuciones bajo output/isolated-regression-<runId>/, todas fuera del índice. No se incluyeron credenciales, respaldos, .env, logs, fuentes Edge temporales ni artefactos en staging. No se cambió ACL, Docker, migraciones ni hooks.

**Probado:** regresión general completa y recuperación 2C-3 contra PostgreSQL corregido, con conservación de fixtures. **Corregido:** preparación del runner, partición de catálogos y sincronización de readiness en los dos viewports. **Pendiente:** mejora del tiempo de carga inicial de Ventas, proveedor RUC externo, observabilidad de vector y puertas de publicación/despliegue previas. No hay casos Playwright de esta suite omitidos o pendientes. No se inicia otra fase.

## Límites y riesgos residuales

- Se conservan interceptaciones preexistentes: RUC comprueba autocompletado con respuesta controlada, no disponibilidad ni credenciales DECOLECTA; dos casos Auth prueban interfaz con respuestas controladas. No se añadieron mocks de éxito comercial.
- Compras, inventario, cotizaciones, reservas, despacho, reparaciones y distribución ejecutan operaciones reales. Las pérdidas de respuesta se simulan después de una RPC confirmada.
- La suite es serial: no reemplaza pruebas SQL concurrentes 2C-2/2C-4 ni demuestra nuevas carreras, carga o aislamiento multiempresa.
- No se repitieron 148 migraciones, suites SQL ni pruebas NTFS. No cambiaron código productivo, SQL/RPC, RLS o protección ACL. No corresponde repetir build por cambios exclusivamente E2E.
- Vector temporal reiniciando: riesgo de observabilidad sin intervenir; no se declara validado el envío de logs. API/Auth/PostgreSQL/Edge necesarios sí se verificaron.
- Los fixtures se acumulan deliberadamente, sin limpieza ni resets. El runner crea cuentas nuevas y no guarda credenciales para futuros reintentos; el consumo de stock y cambio de contraseña requieren datos nuevos al repetir.
- El runner focalizado histórico 2C-3 exigía una única identidad Auth: ahora podría rechazar las nuevas cuentas por su guard estricto. No se lo debilitó ni ejecutó. El escenario 2C-3 se ejecuta dentro de la regresión general.
- No se aplicó la migración a backend ni se autoriza publicación o despliegue.
