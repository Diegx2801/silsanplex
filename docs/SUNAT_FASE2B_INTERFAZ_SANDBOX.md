# SUNAT Fase 2B — Segundo bloque: interfaz de consulta sandbox

Fecha: 24/10/2026. Base local: `98a753e5e87571ae99eba04ddf5be455e5ffcd63`. Estado: **interfaz de lectura implementada y probada con fixtures; integración PostgreSQL y E2E fiscal real pendientes**. Este informe registra el estado previo al cierre local; no se autoriza push.

## Pantalla y navegación

Se agrega `/facturacion-sandbox`, cargada mediante lazy import, dentro de `ProtectedRoute` y `AppLayout`. Sigue la convención de los módulos existentes y utiliza `PermissionRoute(BILLING_VIEW)`. La entrada «Fiscal sandbox» aparece en Control únicamente con ese permiso. Se excluye la nueva ruta del generador de placeholders; no se reconstruye el router ni se modifica la navegación de Ventas.

La búsqueda acepta UUID de documento, normaliza mediante el esquema ya existente y consulta solo al enviar el formulario. No coloca snapshots, datos del comprador ni credenciales en URL o almacenamiento persistente. «Consultar» repite la lectura si se envía el mismo UUID; «Limpiar consulta» cancela la observación anterior, vacía el detalle y devuelve el foco al campo.

La vista muestra:

- Aviso permanente: **«Prueba local, sin envío y sin validez tributaria»**.
- Emisor, comprador y direcciones guardados en el snapshot, sin consultar sus maestros actuales.
- Tipo 01/03, serie, número interno cuando existe, fecha declarada y moneda.
- Estado `prepared` como «Preparado · sin número» y `frozen` como «Congelado · confirmación interna». Ninguno se presenta como aceptado por SUNAT.
- Productos, cantidad, unidad, precio comercial, unitarios neto/bruto, bases, IGV y totales.
- Pago contado o crédito, pendiente declarado, pago declarado y cuotas existentes.
- Referencias de venta, versión, hash y confirmación interna en un detalle desplegable nativo.

Los importes se renderizan como texto original, con tabular-nums. No se usa Number, Intl.NumberFormat ni cálculos tributarios en los componentes. Los textos del snapshot se escapan con React; no se utiliza HTML inyectado. No hay preparación, revisión, confirmación, XML, firma, PDF tributario, envío ni llamadas a proveedores.

## Acceso y separación de datos

La ruta y el menú usan el mecanismo de permisos existente. La página también comprueba sesión, usuario, organización, carga de acceso y BILLING_VIEW antes de montar el formulario. La consulta se instancia con una key de componente por organización/usuario, de modo que el cambio desmonta formulario y detalle anteriores. Perder sesión o permiso desmonta toda la consulta inmediatamente.

Se reutilizan, sin modificaciones, modelo, servicio y hook del primer bloque. Estos mantienen query keys por organización/ambiente/documento/usuario, AbortSignal, ausencia de placeholderData entre tenants, gcTime 0, errores tipados y verificación de identidad de la respuesta. Una consulta fallida o una denegación backend no muestra datos anteriores. Los reintentos son exclusivamente lecturas mediante `get_electronic_document`, con la sesión ordinaria.

Esto prueba comportamiento frontend. **No acredita autorización real contra PostgreSQL, RLS o revocación instantánea no comunicada al navegador**. Esas barreras corresponden a la RPC existente y requieren integración real aislada. No se concedieron permisos, modificaron roles ni agregaron bypass administrativos.

## Estados y accesibilidad

Se implementan estados inicial, acceso en comprobación, sin sesión, sin permiso, carga, UUID inválido, documento no disponible, RPC ausente, fallo recuperable y resultado. Los errores desconocidos muestran un texto genérico; no se imprimen diagnósticos internos. El reintento no transforma una respuesta inválida en éxito.

El formulario utiliza label/for, requerido semántico, descripción y error asociados, aria-invalid, submit nativo y foco en el campo ante error o limpieza. Se conservan los estilos de foco del sistema y el aviso de sandbox tiene nombre accesible. Carga y resultado disponen de status; errores de alert. Los estados tienen texto, además de color.

Las tablas tienen caption, encabezados scope y regiones desplazables alcanzables con Tab. En móvil el scroll horizontal pertenece a la tabla, no a la página. Cuotas largas disponen de región desplazable propia. No se añaden diálogos ni trampas de foco. La comprobación es básica: no se declara una auditoría WCAG exhaustiva ni una prueba manual con lector de pantalla.

## Pruebas ejecutadas

| Comando / comprobación | Resultado |
|---|---|
| `rtk proxy npm test -- src/app/paginas/ComprobanteSandboxPage.test.tsx` | **20/20 PASS** |
| `rtk proxy npm test` | **652/652 PASS**, 93 archivos: 632 de la base + 20 nuevos casos |
| `rtk proxy npm run lint -- --deny-warnings` | PASS, repetido tras añadir el script UI |
| `rtk proxy npm run test:e2e:typecheck` | PASS |
| `rtk proxy npm run build` | PASS, incluye typecheck frontend; conserva aviso previo de chunk >500 kB |
| `rtk proxy node --check scripts/test-fiscal-sandbox-ui.mjs` | PASS |
| `rtk proxy node scripts/test-fiscal-sandbox-ui.mjs` | **3/3 escenarios UI PASS**, con Chromium y respuestas ficticias |
| Detector de diseño sobre los dos componentes nuevos | Sin hallazgos mecánicos |
| `git diff --check` y whitespace de archivos nuevos | PASS |

Se corrigieron durante el desarrollo tres errores de tipado de la prueba: import no utilizado y uso de `exact` no admitido por getByRole. No se cambiaron expectativas comerciales ni lógica existente para obtener PASS. El primer montaje temporal del fixture cayó en el fallback del índice de Vite; se corrigió el orden del middleware de pruebas, sin modificar la aplicación.

### Alcance del navegador de pruebas

`test-fiscal-sandbox-ui.mjs` monta los componentes reales con AppLayout y los guards existentes, usando un AuthContext ficticio y el cliente Supabase ordinario. Vite no carga archivos .env y el destino API está fijado al puerto cerrado 1 de loopback. Playwright intercepta únicamente la RPC de lectura y devuelve el DTO ficticio; el resto de HTTP solo puede continuar hacia el servidor local de la vista, en 5185. Cualquier otra solicitud se bloquea y hace fallar la prueba. No se inicia Supabase, Docker, el preparador E2E, ni se instala Chromium o dependencia alguna.

El script requiere Node 24 y Chromium previamente instalado para la versión Playwright del proyecto. Usa un directorio temporal nuevo para el entrypoint, resultados JSON y capturas; lo informa al terminar y cierra servidor/navegador en finally. Los artefactos son ficticios y quedan fuera de Git, sin rutas personales fijas dentro del script.

| Resolución | Estado de fixture | Resultado |
|---|---|---|
| 1280×720 | prepared | Tab hasta el UUID; Enter valida y consulta; foco en botones y tabla; limpiar devuelve foco; sin overflow global |
| 1440×1080 | frozen | Mismas comprobaciones; confirmación interna diferenciada |
| 390×844 | frozen | Mismas comprobaciones; ArrowRight desplaza realmente la tabla; sin overflow global |

En cada escenario se interceptó una única solicitud POST de lectura con la organización ficticia esperada. Cero solicitudes inesperadas y cero errores de página. Se inspeccionaron capturas desktop y móvil. **Estos tres escenarios son pruebas de componentes/UI, no Playwright E2E fiscal con PostgreSQL**.

Las pruebas Vitest mockean el servicio, pero usan el hook real. Cubren snapshots, precisión textual, contado/crédito, aviso, carga/cancelación, UUID inválido, errores/reintento, denegación, cambio de organización/usuario, pérdida de sesión/permiso, escape de HTML y guard real de la nueva ruta. Los valores monetarios extremos en una prueba son un control de renderizado textual, no una operación fiscal válida confirmada.

## Pendientes y riesgos

1. Consulta real de documentos en PostgreSQL aislado con las migraciones 149/150 y sesiones con/sin permiso. No se ejecutó SQL ni se modificó ninguna base.
2. E2E fiscal real de interfaz y permisos; no se sustituye con las respuestas interceptadas del script UI.
3. Integración autorizada de PR #59 y PR #60. Esta rama mantiene dependencias y lockfiles de su base fiscal, incluido el bloqueo de auditoría runtime documentado en el primer bloque. No se actualizan aquí.
4. Controles fiscales mutantes y recuperación de respuestas perdidas de esos comandos pertenecen a otro incremento; no se conectaron.
5. No hay selector/listado de documentos ni búsqueda por serie/número: la RPC actual de este bloque consulta un UUID. No se inventaron nuevos endpoints.
6. El entorno persistente todavía no ofrece las RPC 149/150 según el contexto previo; una visita debe mostrar el error de disponibilidad, no activar migraciones automáticamente. Ese estado de base no se volvió a consultar aquí.

## Archivos y Git

Modificados: `frontend/src/app/navegacion.ts` y `frontend/src/app/router/router.tsx`.

Nuevos:

- `frontend/src/app/paginas/ComprobanteSandboxPage.tsx`
- `frontend/src/app/paginas/ComprobanteSandboxPage.test.tsx`
- `frontend/src/modulos/facturacion/componentes/DetalleComprobanteSandbox.tsx`
- `frontend/scripts/test-fiscal-sandbox-ui.mjs`
- Este informe.

Rama: `codex/sunat-fase2b-consulta-sandbox`. HEAD conservado en `98a753e5e87571ae99eba04ddf5be455e5ffcd63`, sin staging ni commit de este bloque. No se modifican archivos del primer bloque, migraciones, manifiestos, lockfiles, main o los PR abiertos. Las 37 rutas pendientes, tres archivos privados y hashes de 149/150 del checkout fiscal original se conservan. Sin push ni fusión.

## Auditoría de cierre local

Se revisaron íntegramente los siete candidatos, la ruta protegida, el filtrado del menú, el hook y servicio reutilizados y sus pruebas. Sin defectos relevantes que impidan el cierre local: se conserva la lectura exclusiva por RPC, el aislamiento de la caché y del componente por organización/usuario, la ocultación al perder acceso, la cancelación y protección ante respuestas tardías, los errores saneados y los decimales textuales. El control frontend no sustituye autorización PostgreSQL.

Validaciones repetidas antes del commit: Vitest 652/652 en 93 archivos; pantalla 20/20; Chromium con fixtures 3/3 en 1280×720, 1440×1080 y 390×844; typecheck E2E; lint con --deny-warnings; build con typecheck frontend; node --check del runner. Todas PASS. El build conserva el aviso previo de chunk superior a 500 kB. Las tres peticiones observadas fueron POST de lectura para la organización y documento ficticios esperados; solicitudes inesperadas y errores de página: cero.

El runner cierra su servidor y navegador y conserva únicamente artefactos ficticios en un directorio temporal propio. No ejecuta limpieza de directorios ajenos ni borra recursos. No se han ejecutado SQL ni E2E fiscales reales, ni se han conectado bases persistentes.

Los hashes del primer bloque, las migraciones 149/150 y las 37 rutas pendientes y tres archivos privados del checkout original permanecen intactos. Índice inicialmente vacío; el cierre queda limitado a estos siete archivos y al mensaje autorizado en español.
