# SUNAT Fase 2B — Primer bloque de consulta sandbox

Fecha: 24/10/2026. Estado: **primer bloque implementado y probado unitariamente; Fase 2B completa pendiente**. Sin commit, push, migraciones, conexiones a bases locales ni emisión tributaria.

## Alcance derivado de los contratos existentes

Los informes 0/1 no contienen una especificación cerrada denominada «Fase 2B». La Fase 0 separa persistencia, generación/firma, transporte/conciliación y UI/consulta; no autoriza saltar de persistencia a emisión real. La Fase 1, §11, admite expresamente un primer incremento UI sandbox y propone `VistaPreviaFiscal` y `DetalleComprobante`. Fase 2A aporta seis RPC y estados internos `prepared/frozen`.

Se selecciona como **primer bloque autónomo** la base frontend de consulta por UUID de documento: modelo del DTO, servicio de lectura y hook React. Es una dependencia de los futuros paneles; todavía no hay pantalla, ruta ni botón conectado. No se implementan formularios de preparación/configuración/revisión/confirmación, ni adaptadores, XML, firma, CDR, workers, impresión tributaria o transporte. No se declara la Fase 2B terminada.

## Arquitectura y contratos

`useComprobanteSandbox(documentId)` → `consultarComprobanteSandbox(org, doc, signal)` → cliente Supabase ordinario → `get_electronic_document(organization_id, document_id)` → validación del DTO sandbox.

Se conserva la organización obtenida de `useAuth`; el consumidor del hook no puede elegir otro tenant. La llamada utiliza la sesión y cliente existentes, sin credenciales administrativas ni otro destino configurado. No se crean RPC ni cambios SQL. La interfaz `rpc` sigue el contrato documentado por [Supabase](https://supabase.com/docs/reference/javascript/rpc), consultado el 24/10/2026.

| Operación existente de Fase 2A | Permiso efectivo en SQL | Uso en este bloque |
|---|---|---|
| `get_electronic_document` | `BILLING_VIEW` | Única RPC invocada |
| `prepare_electronic_document` | `BILLING_PREPARE` | Pendiente |
| `revise_electronic_document` | `BILLING_PREPARE` | Pendiente |
| `confirm_electronic_document` | `BILLING_ISSUE` | Pendiente |
| `save_electronic_issuer_profile` | `BILLING_CONFIGURE` | Pendiente |
| `configure_electronic_series` | `BILLING_CONFIGURE` | Pendiente |

Se registra únicamente el literal `BILLING_VIEW` en el catálogo TypeScript. No se cambian roles, asignaciones, dependencias de permisos, selector general de usuarios, `SALES_MANAGE` ni comportamiento de ADMIN. `AuthProvider.hasPermission` sigue consultando permisos efectivos cargados del backend.

La barrera frontend es de navegación/visualización, no reemplaza autorización: la RPC de 149 valida sesión activa, organización y permiso antes de leer; sus grants/RLS siguen intactos. No se volvieron a probar esos controles SQL en esta intervención. La pertenencia organizacional y el UUID de la respuesta también se contrastan con la consulta para evitar presentar un DTO cruzado por error de integración.

## Modelo y estados

- Contrato `CPE-PE-DOM-PEN-1`, ambiente `sandbox`, modalidad `local_test`, moneda PEN y operación 0101.
- Tipos 01/03 y prefijo F/B correspondiente. Estados admitidos: `prepared` y `frozen`. Se rechazan estados de firma/envío/aceptación como si fueran sandbox válidos.
- `prepared`: identidad fiscal null y sin datos de confirmación.
- `frozen`: identidad congruente con RUC/tipo/serie/número del snapshot y confirmación interna completa, incluido `NONE_SANDBOX`.
- Totales, cantidades, precios, tasas, correlativos y versiones permanecen strings. Se validan escalas de los casts SQL y límites bigint sin pasar por Number. No se recalculan IGV, cuotas, totales ni hashes en React.
- Las líneas y pago se leen del snapshot; no se reconstruye el receptor desde el maestro actual. La lectura crea una representación separada del DTO de entrada, pero no prueba por sí misma inmutabilidad de PostgreSQL.
- El esquema rechaza campos no previstos en el snapshot en vez de descartarlos silenciosamente. Una futura versión fiscal requiere adaptar explícitamente el lector.
- El aviso disponible para las futuras pantallas es «Prueba local, sin envío y sin validez tributaria»; aún no hay una pantalla que lo muestre.

La validación frontend comprueba forma, precisión e identidad de la respuesta. La autoridad sobre checksum de RUC, aplicabilidad tributaria, sumas exactas, snapshots persistidos y validación fiscal continúa en PostgreSQL. No se inventan nuevos máximos de líneas comerciales; el contrato SQL actual no fija uno.

## Caché, errores, concurrencia e idempotencia

La query key incluye organización, ambiente, documento y usuario, sin tokens. Solo se habilita con sesión, usuario, acceso cargado, referencias válidas y BILLING_VIEW. No se usa placeholderData de otro tenant. Se propaga AbortSignal al cliente PostgREST; una respuesta tardía de la consulta cancelada no reemplaza los datos de la organización nueva.

No se muestran datos cuando el permiso visible desaparece, se cierra sesión o la consulta queda en error, incluso si React Query conserva datos de una lectura previa. Los reintentos manuales se bloquean sin acceso y no hay reintentos automáticos. `gcTime: 0` elimina queries sin observadores; los datos permanecen solo en memoria durante su uso. La limpieza de sesión general de AuthProvider se conserva.

No se afirma revocación instantánea de permisos no notificada al navegador: el backend revalida cada lectura. Tampoco se afirma cancelación de una transacción PostgreSQL por abortar HTTP; esta RPC es de lectura.

Errores públicos tipados: referencia inválida, sin acceso, documento no disponible, RPC no instalada, fallo de consulta y respuesta incompatible. No se exponen detalles SQL ni excepciones internas. Una respuesta HTTP exitosa con DTO incorrecto es un error, no aceptación fiscal.

Este bloque no crea operationKey: no hay comando mutante que repetir. No consume correlativos, cambia versiones, crea outbox ni toca ventas/inventario/distribución. Las garantías concurrentes/idempotentes de confirmación continúan siendo las de Fase 2A; **no se declaran nuevamente ejecutadas**. Los futuros formularios necesitarán clave/payload estable, nueva clave ante cambios, control expectedVersion y reconciliación de respuesta perdida, antes de conectarse a confirmar sandbox.

## Validaciones ejecutadas

Todos los comandos se ejecutaron en el worktree nuevo; ninguno inició Supabase, Docker ni un preparador E2E.

| Comando / comprobación | Resultado efectivo |
|---|---|
| `rtk proxy npm ci` desde frontend | PASS; manifiestos intactos |
| `rtk proxy npm test -- src/modulos/facturacion` | Primera ejecución 49/49; ampliada a 52 pruebas finales, incluidas en la suite completa |
| `rtk proxy npm test` | **632/632 PASS**, 92 archivos: 580 de la rama fiscal + 52 nuevas |
| `rtk proxy npx tsc -b --pretty false` | PASS después de sustituir una parameter property no admitida por erasableSyntaxOnly |
| `rtk proxy npm run lint -- --deny-warnings` | PASS |
| `rtk proxy npm run test:e2e:typecheck` | PASS |
| `rtk proxy npm run build` | PASS, incluye typecheck frontend; conserva aviso previo de chunk >500 kB |
| 52 nuevas pruebas con alias temporal hacia Zod 4.6.7 del worktree de seguridad | **52/52 PASS**; solo sustitución en memoria del resolver de Vitest, sin editar dependencias ni incorporar PR #60 |
| `rtk proxy npm audit --audit-level=high --omit=dev` | **FAIL preexistente: 2 hallazgos**, Zod 3.25.76 alto y fast-uri 3.1.8 moderado; pendientes de PR #60 |
| `rtk proxy git diff --check` | PASS; revisión adicional de whitespace en archivos nuevos |

La suite completa usa variables Supabase ficticias solo de proceso, dirigidas al puerto cerrado 1 de loopback. No se copiaron archivos .env ni credenciales. Los tests nuevos mockean el transporte o el servicio según la capa: son unitarios; no representan resultados de integración contra una instancia real.

La primera ampliación de la suite de hooks detectó un fallo de cleanup del test sin QueryClient; se corrigió inicializando el cliente en beforeEach y se repitió la suite completa. No fue un defecto productivo ni se ocultó una aserción funcional.

Cobertura nueva: DTO prepared/frozen, boleta identificada/crédito, precisión decimal, bigint superior al entero seguro de JS, fecha imposible, estados/ambientes incompatibles, tenant/documento cruzados, identidad incoherente, campos desconocidos, errores sin diagnósticos internos, cancelación, cache por usuario/tenant, pérdida de acceso visible y rechazo backend tras datos previos.

## Pendiente y dependencias

1. Integrar por autorización separada PR #59 y PR #60. Este worktree depende de la rama fiscal, no incorpora el commit de seguridad y conserva sus dependencias heredadas. El ensayo con Zod 4 no sustituye la validación completa después de integrar ambos PR.
2. Verificar consulta real con sesión ordinaria autorizada y migraciones 149/150 en un destino aislado, sin crear o modificar datos empresariales. Ninguna base fue consultada o modificada aquí.
3. Definir y conectar panel/detalle sandbox, mensajes de carga/error/sin permiso y accesibilidad. No se agregó entrada a navegación ni se modificó Ventas.
4. Diseñar formularios y recuperación de comandos prepare/revise/confirm sin duplicar autorización ni cálculos. Configuración de perfiles/series y selector de direcciones requiere su propio bloque.
5. E2E real sandbox con datos ficticios, ambas resoluciones, teclado, permisos y respuesta perdida. No se ejecutó Playwright ni se repitieron SQL; no cambió SQL ni se habilitó una pantalla.
6. Generación/firma/transporte necesitan contratos y autorización posteriores. Este trabajo no desbloquea emisión real ni determina proveedor fiscal.

## Archivos y estado Git

Base publicada verificada: `407d0b5a46724fe0b5dce4b267b3ddade66cb206`, rama fiscal del PR #59. Rama nueva local: `codex/sunat-fase2b-consulta-sandbox`, en un worktree independiente. HEAD permanece en la base, sin commits nuevos y sin staging.

Modificado: `frontend/src/features/auth/permissions.ts` (un literal).

Nuevos:

- `frontend/src/modulos/facturacion/modelo/comprobanteSandbox.ts`
- `frontend/src/modulos/facturacion/modelo/comprobanteSandbox.test.ts`
- `frontend/src/modulos/facturacion/servicios/comprobantesSandboxService.ts`
- `frontend/src/modulos/facturacion/servicios/comprobantesSandboxService.test.ts`
- `frontend/src/modulos/facturacion/estado/useComprobanteSandbox.ts`
- `frontend/src/modulos/facturacion/estado/useComprobanteSandbox.test.tsx`
- `frontend/src/modulos/facturacion/__fixtures__/comprobanteSandbox.ts`
- Este informe.

Migraciones conservadas sin cambios: 149 SHA-256 `df0c339852499b2717a5cfd00d822b06128ff970610fb0f74db08a15c242de01`; 150 SHA-256 `ff0d192543f389de8391a72507de5f217407287e60a4b8295fae4606f9bcb670`.

Se preservan las 37 rutas pendientes y los tres archivos privados del checkout fiscal original; su integridad se verifica por SHA-256 sin publicar sus contenidos. PR #59, PR #60 y main no reciben cambios. No hay commit, push ni fusión.
