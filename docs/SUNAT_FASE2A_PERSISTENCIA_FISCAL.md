# SUNAT Fase 2A — Persistencia fiscal e idempotencia

Fecha: 23/10/2026. Contrato: `CPE-PE-DOM-PEN-1`, según `SUNAT_FASE1_CONTRATO_FISCAL.md`.

## Dictamen y límites

**Implementado y probado el incremento de persistencia sandbox. Última ejecución: 146/146 comprobaciones PASS, con 11 carreras entre sesiones PostgreSQL independientes.** No constituye habilitación para producción ni emisión tributaria. El lint SQL estricto por warnings sigue teniendo observaciones, detalladas más abajo; no se declara aprobado sin warnings.

Se implementaron seis tablas, seis RPC operativas, un predicado de lectura RLS y helpers privados. Preparar no numera; confirmar congela y numera internamente, con un trabajo durable bloqueado. No existe XML, firma, adaptador PSE/OSE, transporte, worker, cron ni estado de aceptación SUNAT.

**`backend` no fue migrado:** conserva 148 migraciones. La temporal `silsanplexp2c2` pasó de 148 a 149 aplicando exclusivamente la migración nueva, una sola vez. No se reconstruyeron las 148 anteriores.

## 1. Git inicial y final

- Rama `main`, HEAD `64a9868fc739c8e8bd4be1791b7d7230e626d6e6`.
- Referencia local `origin/main`: 13 ahead / 0 behind. No fetch, commit ni push.
- Índice vacío y ningún archivo tracked modificado, tanto al inicio como al final.
- Conservados los informes anteriores sin seguimiento, `.codex/` y `output/`.
- Archivos nuevos de esta intervención: la migración, suite SQL, runner Python e informe indicados en la sección 12. Permanecen sin staging.

## 2. Entorno verificado

| Comprobación | Evidencia |
|---|---|
| Proyecto | `silsanplexp2c2` en `%LOCALAPPDATA%\Temp\silsanplex-phase2c2-20261021\supabase\config.toml` |
| DB | `supabase_db_silsanplexp2c2`, activo; PostgreSQL interno 5432, publicado en 58122 |
| API | `supabase_kong_silsanplexp2c2`, activo; 8000 publicado en 58121 |
| Etiquetas | `com.supabase.cli.project` y `com.docker.compose.project` = `silsanplexp2c2` |
| Volumen | Montaje real `supabase_db_silsanplexp2c2` en `/var/lib/postgresql/data`; etiqueta de proyecto coincidente |
| Conexión | `current_database() = postgres`, `current_setting('port') = 5432`, usando el contenedor exacto verificado |
| Historia inicial | 148 versiones coincidentes con las migraciones anteriores del repositorio |
| Distribución existente | Función corregida 2C-2, con advisory lock y rechazo de reutilización incompatible |
| Datos iniciales | 21 usuarios Auth y 44 outcomes de Distribución; ninguno reutilizado como fixture fiscal |

El runner tiene destino fijo y no admite URL ni nombre de contenedor alternativos. Verifica configuración, Docker, puertos, volumen, historia y función 2C-2 antes de crear fixtures. No usa secretos, preparadores E2E ni conexiones a 54321/54322.

La suite SQL vive fuera del descubrimiento automático de `supabase test db`. Además exige un marcador de sesión que establece el runner verificado. Una invocación directa sin marcador se probó y abortó con `CPE_TEST_REQUIRES_VERIFIED_ISOLATED_RUNNER` antes de crear fixtures. El marcador es protección contra ejecución accidental; la identidad real la verifica Python con Docker, configuración y PostgreSQL.

## 3. Migración y modelo

Archivo: `20261023061225_electronic_fiscal_sandbox_persistence.sql`.

SHA-256: `df0c339852499b2717a5cfd00d822b06128ff970610fb0f74db08a15c242de01`.

Creado mediante `supabase migration new electronic_fiscal_sandbox_persistence --workdir backend`, que solamente creó el archivo. Este comando no aplicó SQL a `backend`.

| Entidad | Responsabilidad e invariantes |
|---|---|
| `electronic_issuer_profiles` | RUC con validación de dígito, nombre identificado `SANDBOX`, domicilio estructurado, establecimiento y hash de reglas. Ambiente `sandbox`, modalidad `local_test`, `production_enabled=false` por CHECK. Versión de configuración. RUC de un perfil existente no cambia mediante RPC. |
| `electronic_document_series` | Perfil del mismo tenant, RUC, tipo 01/03, serie Fxxx/Bxxx, contador transaccional y versión de configuración. UNIQUE global `(environment,issuer_ruc,document_type,series)` evita dos propietarios operativos para la misma identidad. |
| `electronic_documents` | Venta del mismo tenant, serie/perfil vinculados por FK compuesta, solicitud normalizada, snapshot/hash, pago y totales tipados. UNIQUE venta/ambiente impide un segundo original incluso con otra clave. Identidad fiscal global incluye RUC, ambiente, tipo, serie y número. |
| `electronic_document_items` | FK compuesta documento/venta y `sale_items` de esa misma venta/organización. Cantidades, precios, valores fiscales, impuestos y snapshot por línea; sin duplicar una línea comercial. |
| `electronic_document_commands` | Comando canónico, hash, respuesta original y referencia al documento cuando corresponde. UNIQUE organización/ambiente/clave, incluyendo operación en la comparación. Inmutable. |
| `electronic_document_outbox` | Un único `sandbox_hold` por documento, `state=blocked`, `attempts=0`. No existe operación para consumirlo o desbloquearlo. Inmutable en esta fase. |

Todos los objetos nuevos están separados del modelo logístico. No se alteraron tablas, funciones, triggers ni políticas existentes de Inventario o Distribución.

Las relaciones compuestas impiden referencias entre organizaciones. Se reutilizan `organizations`, `profiles`, `customers`, `customer_addresses`, `products`, `measurement_units`, `sales`, `sale_items` y `audit_events`; no se crea otro catálogo de clientes, unidades o auditoría.

Un constraint trigger diferible comprueba, al finalizar la transacción, sumas por afectación/impuesto/total, correspondencia del arreglo de snapshots de líneas y hash del documento. Triggers rechazan cambios o eliminación de documentos congelados, sus líneas, comandos y outbox. No hay DML directo para usuarios autenticados.

## 4. RPC y autorización

| RPC | Permiso | Contrato mínimo |
|---|---|---|
| `save_electronic_issuer_profile(jsonb)` | BILLING_CONFIGURE | `organizationId,environment,operationKey,id,expectedVersion,ruc,legalName,fiscalAddress,establishmentCode,ruleSetHash,testOnly`. Creación: versión `"0"`; actualización: versión vigente. `testOnly=true`. |
| `configure_electronic_series(jsonb)` | BILLING_CONFIGURE | `organizationId,environment,operationKey,id,expectedVersion,issuerProfileId,documentType,series,nextNumber,enabled`. Identidad de serie inmutable; contador nunca retrocede. |
| `prepare_electronic_document(jsonb)` | BILLING_PREPARE | DTO PrepareCpe de Fase 1 sin referencias legales opcionales, todavía no implementadas. Lee venta/líneas y crea borrador sin consumir número. |
| `revise_electronic_document(jsonb)` | BILLING_PREPARE | `organizationId,environment,operationKey,documentId,expectedVersion,request`. `request` es el DTO de preparación sin necesidad de clave interna. Revisa fecha, dirección fiscal, pago y versiones de configuración; no cambia venta, perfil o serie de identidad. |
| `confirm_electronic_document(jsonb)` | BILLING_ISSUE | `organizationId,environment,operationKey,documentId,expectedVersion`. Revalida origen/configuración, congela y numera atómicamente. |
| `get_electronic_document(uuid,uuid)` | BILLING_VIEW | Organización/documento → respuesta y snapshot; otro tenant o permiso insuficiente no obtiene datos. |

Configuración devuelve `{id,version}`. Las operaciones de documento devuelven `{documentId,state,snapshotHash,version,fiscalIdentity}`; esta última es null antes de confirmar. Los enteros de versión y número se serializan como strings.

Las cuatro capacidades se agregaron solamente al catálogo. No se asignan a ADMIN, SALES_MANAGE ni a ningún rol empresarial. Las pruebas asignan permisos directos únicamente a usuarios ficticios de organizaciones nuevas.

Las seis RPC y el predicado RLS utilizan `SECURITY DEFINER`, owner `postgres`, `search_path=''` y nombres cualificados. Se revocó ejecución a PUBLIC/anon/service_role y se concedió a authenticated. El schema `electronic_private` y sus helpers no tienen acceso para clientes. Los triggers que necesitan verificar otras filas son definers privados con search_path vacío.

Cada RPC valida `auth.uid()`, `session_id` existente mediante `is_auth_session_active`, organización activa, membresía/perfil activos y permiso efectivo **antes de recuperar un replay**. RLS SELECT exige BILLING_VIEW y sesión activa; no basta con conocer una UUID. Authenticated solamente tiene SELECT en las tablas fiscales; tampoco service_role recibe DML en ellas en esta fase.

## 5. Datos fiscales y cálculo

- Tipos 01 factura y 03 boleta identificada; PEN y operación onerosa ordinaria 0101.
- Factura: receptor RUC válido y dirección FISCAL explícita del mismo cliente/tenant, con ubigeo. Boleta: RUC, DNI o CE identificado; OTHER y datos incompletos se rechazan.
- Emisor: domicilio estructurado con línea, distrito, provincia, departamento, ubigeo y país PE. Nombres de emisores ficticios obligatoriamente comienzan con `SANDBOX `.
- Reglas fijadas al hash del libro revisado en Fase 1: `cb5e871cfe3b81abea7faf25b156e5d35b21e8c4837979350919926612da73b6`.
- La venta debe estar `calculated`; pendientes, legacy, precio cero o total cero no producen confirmación.
- Gravado incluido: base `round(round(q*p,2)/1.18,2)`, impuesto = importe − base. Excluido: base `round(q*p,2)`, impuesto `round(base*.18,2)`. Exonerado/inafecto: impuesto cero. Tributos/afectaciones 1000/10, 9997/20 y 9998/30.
- PostgreSQL numeric es autoritativo. Importes a dos decimales; unitarios fiscales a diez; cantidad/precio conservan las escalas comerciales. Se comprueba reconstrucción exacta de base y total redondeados, sin ajustar centavos.
- Totales de las tres bases, subtotal, IGV y total deben coincidir exactamente con `sales`. La RPC no corrige ni modifica la venta.
- Unidad fiscal tomada de `measurement_units` mediante el producto, activa y consistente con el texto comercial. Perfil inicial admite NIU, ZZ, KGM, LTR y MTR; otras unidades o correspondencias ambiguas se rechazan, no se convierten silenciosamente.
- Contado explícito o crédito con pendiente positivo ≤ total, cuotas únicas Cuota001..Cuota999, importes positivos exactamente a dos decimales, vencimientos posteriores a emisión y suma exacta del pendiente. `paidAtIssue` es información declarada, no crea cobranza.
- Sin descuentos/cargos/anticipos/gratuidades/detracciones/retenciones ni moneda distinta; propiedades no soportadas se rechazan.

El snapshot contiene emisor, receptor/dirección, producto/código/descripción/unidad, precio comercial, cantidades, valores fiscales, impuestos, pago, reglas y referencias comerciales. La confirmación incorpora número, actor, timestamp, hora Lima y `taxValidity=NONE_SANDBOX`.

No se consultó SUNAT para validar la situación real de ningún RUC. Validación formal y fixtures ficticios no sustituyen confirmación contable, catálogo territorial oficial completo ni habilitación real del emisor. Esos controles siguen siendo puertas de una futura emisión productiva.

## 6. Numeración e idempotencia

Orden de confirmación:

1. Sesión/tenant/permiso, validación del comando y advisory lock transaccional organización/sandbox/clave.
2. Comando previo: mismo contenido normalizado y operación → respuesta guardada; distinto → `CPE_OPERATION_KEY_REUSED`.
3. Lock FOR UPDATE venta → documento → serie. Verificación de versión, estado y original único.
4. Locks SHARE de emisor, cliente, dirección, líneas, productos y unidades; nueva construcción del snapshot y comparación con el borrador.
5. UPDATE transaccional de `next_number`, con límite 99999999 y devolución del anterior. No secuencia fiscal ni MAX+1.
6. Documento congelado, outbox, comando y auditoría en la misma transacción.

La versión de serie representa **configuración**; asignar un número modifica el contador bajo lock, sin invalidar las preparaciones de otras ventas por sí solo. Cambiar configuración sí incrementa su versión. Incluso con versión de configuración vigente, un intento de rebajar el contador se rechaza.

La normalización convierte UUID, fechas y versiones según contrato; exige decimales strings canónicos, rechaza exponentes/NaN/precisión excedida, ordena cuotas por id y líneas por `saleItemId`. Ausencia/null de dirección opcional equivalen. No se ignoran diferencias materiales. La clave es más estricta que una UNIQUE por operación: reutilizarla en otra operación del mismo tenant también entra en conflicto.

Replay devuelve la respuesta original de **ese comando**, no una reconstrucción contra maestros actuales. `get_electronic_document` consulta el estado actual. Un replay confirmado conserva UUID, identidad, versión y hash originales aunque el primer comando haya incrementado la versión del documento o haya cambiado posteriormente el cliente. Se sigue exigiendo autorización vigente.

No hay captura genérica de unique_violation que transforme un conflicto en éxito. CHECK/UNIQUE/FK constituyen defensa adicional. Tras commit no se recicla número; un rollback anterior al commit sí revierte el contador. Los identificadores secuenciales globales de auditoría pueden tener huecos por rollback, comportamiento normal distinto del correlativo fiscal transaccional.

## 7. Estados

Documento: `prepared → frozen`, exclusivamente sandbox. Frozen es una confirmación interna inmutable sin validez tributaria. No están permitidos signed, submitted, accepted, rejected SUNAT ni contingencia.

Outbox: solo `blocked`, acción `sandbox_hold`, cero intentos. Se impide cambiarlo o eliminarlo; el transporte y su ciclo de leases necesitarán una fase autorizada posterior.

No se implementó abandono/reemplazo de borradores ni cambio de su identidad venta/perfil/serie. La revisión permitida no sirve para modificar un confirmado.

## 8. Pruebas efectivamente ejecutadas

Último comando focalizado, con todos los archivos definitivos (ruta del intérprete normalizada a python para publicación; equivale al intérprete validado en la ejecución):

```powershell
rtk proxy python backend/scripts/test-sunat-phase2a.py
```

**146/146 PASS, 0 FAIL.** Desglose: 97 aserciones SQL seriales, 47 comprobaciones de carreras/persistencia/conservación y 2 comprobaciones generales de identidad/conservación. No se presentan como 146 tests E2E ni como 146 aserciones pgTAP.

La suite serial completa se ejecuta dentro de BEGIN/ROLLBACK. Las carreras usan transacciones comprometidas de tenants nuevos, conservando sus fixtures. En cada carrera se comprueban PID distintos y espera real de locks mediante `pg_stat_activity`; en C05 se comprueba progreso independiente sin esperar al otro tenant.

| Caso | Ejecución y resultado |
|---|---|
| C01 | Dos confirmaciones idénticas simultáneas: misma respuesta; un número, comando, auditoría fiscal, línea y outbox. PASS. |
| C02 | Misma clave, versión/payload diferente: un ganador y `CPE_OPERATION_KEY_REUSED`; sin efectos adicionales. También conflicto serial con otro documentId. PASS. |
| C03 | Dos claves para confirmar el mismo documento: una confirmación. Dos preparaciones simultáneas de la misma venta: un original y `CPE_ORIGINAL_EXISTS`. PASS. |
| C04 | Dos ventas, misma serie: 1 y 2; siguiente 3, sin duplicados. PASS. |
| C05 | Dos organizaciones/series, misma UUID operativa: identidades y contadores independientes; una confirmación por tenant. RLS y RPC rechazan cruces. PASS. |
| C06 | Configuración deshabilita antes de confirmar; configuración cambia versión antes de confirmar; confirmación precede intento de retroceso. Tres carreras, rechazo esperado y contador/estado/auditoría consistentes. PASS. |
| C07 | Trigger de prueba provoca fallo después del contador/documento al insertar outbox. Rollback íntegro; siguiente confirmación usa el número original. Trigger creado y revertido únicamente dentro de la transacción serial. PASS. |
| C08 | Se revoca BILLING_ISSUE y se reintenta clave confirmada: 42501, sin cambios. Sesión revocada tampoco permite lectura RLS. PASS serial; no se afirma carrera concurrente de revocación. |
| C09 | Cambio de cliente gana primero: CPE_SOURCE_CHANGED sin número. Confirmación gana primero: el cambio espera, snapshot congelado conserva nombre anterior. Dos carreras. PASS. |
| C10 | Número 99999999 permitido; siguiente agotado, sin efectos parciales. PASS serial. |

Otras pruebas: IGV incluido/excluido, mezcla de tres afectaciones, crédito ordenado canónicamente, fechas inválidas, cuotas duplicadas o mal sumadas, precisión excedida, no finitos/exponentes, borrador/versiones, unidad no soportada, cliente incompatible con factura, boleta DNI, discrepancia con venta, inmutabilidad y outbox bloqueado.

Matriz de capacidades: NONE, solo VIEW, solo PREPARE, solo ISSUE y solo CONFIGURE frente a seis RPC. Las entradas deliberadamente inválidas de las cinco RPC mutantes verifican que el permiso correcto llega a validación y los demás reciben 42501 antes; no se cuentan como 25 operaciones comerciales exitosas. La consulta utiliza un documento real ficticio. Las operaciones completas válidas se ejecutan con el actor de prueba autorizado.

### Otros comandos y resultados

| Comando / comprobación | Resultado real |
|---|---|
| `supabase migration new ... --workdir backend` | Archivo creado; no conexión/escritura DB. |
| Runner `--transactional`, antes de aplicar | 66/66 en la versión de pruebas existente entonces; DDL y fixtures revertidos. La suite se amplió después; el resultado final es 146, no se atribuye el 66 a los archivos finales. |
| `rtk proxy supabase migration up --local --workdir "$env:LOCALAPPDATA/Temp/silsanplex-phase2c2-20261021"` | Aplicó exclusivamente 20261023061225. PASS. |
| Comparación de `pg_get_functiondef`, owners y grants | 26 funciones instaladas idénticas a la migración compilada previamente dentro de rollback. PASS. |
| Lint privado `--level error --fail-on error` en temporal | Exit 0, results vacío; sin errores detectados. |
| Lint privado `--level warning --fail-on warning` en temporal | **Exit 1, 13 warnings, 0 errores. No PASS sin warnings.** |
| Compilación Python mediante `compile(...)`, sin generar pycache | PASS. |
| Invocación SQL sin marcador de runner | Abortó según diseño antes de los fixtures. PASS de la protección. |
| `git diff --check` / índice | Exit 0 / vacío. |
| `git diff --no-index --check -- NUL <cada archivo nuevo>` | Exit 1 por diferencia de archivo nuevo; sin diagnósticos de whitespace. Git avisó conversión futura LF/CRLF para Python y suite. Comprobación adicional de espacios finales/conflictos: ninguno. |

Las 13 advertencias se concentran en date_value, address, payment, request y snapshot: volatilidad STABLE de funciones PostgreSQL llamadas desde helpers declarados IMMUTABLE, y conversión implícita de literales iniciales a jsonb/text[]. Los formatos de entrada usados son estrictos y las ramas probadas pasan; no se ha demostrado un fallo de cálculo por estos avisos. Se dejan visibles para revisar anotaciones y casts antes de una integración más amplia. No se alteró el SQL después de aplicado para ocultarlos ni se reparó el historial.

Durante construcción se corrigieron errores del nuevo DDL antes de aplicarlo y fixtures que incumplían contratos existentes (almacén y formato PED obligatorios, códigos en mayúsculas, identidad fiscal de cliente inmutable). Se creó un cliente DNI nuevo; no se eludió el trigger comercial. La primera carrera C01 falló por contar auditorías de creación de maestros como si fueran fiscales: se separó `fiscalAudits`, conservando también el conteo global y sus verificaciones. No se cambió negocio para obtener PASS.

No se ejecutaron Vitest, build, Playwright, suites SQL históricas ni regresión logística completa: no cambió frontend ni contratos logísticos y varias suites históricas tienen limpieza/IDs fijos incompatibles con conservar este volumen. Los resultados anteriores de 580/27/353 no se presentan como ejecuciones de esta fase.

## 9. Conservación de datos

Antes de aplicar se capturaron hashes de las 89 tablas públicas/Auth anteriores, excepto el catálogo permissions que recibe los cuatro códigos autorizados. Inmediatamente después, los 89 hashes seguían idénticos. Las 26 definiciones/owners/grants nuevos coincidían con el DDL ensayado.

Cada ejecución del runner compara fingerprints de **todas las filas preexistentes** en tablas públicas y auth.users/sessions/refresh_tokens; permite agregar fixtures, pero no perder/modificar filas previas. También compara ventas, líneas, pedidos, inventario, reservas y entregas de los tenants recién creados alrededor de las operaciones fiscales.

Después de las ejecuciones de desarrollo y final: 47 tenants S2A ficticios nuevos, 68 usuarios Auth totales (21 iniciales + 47 ficticios), 44 outcomes de Distribución conservados. En las tablas fiscales quedan 51 documentos internos (14 prepared, 37 frozen) y 37 trabajos blocked con cero intentos. Se conservan deliberadamente también los fixtures de ejecuciones previas; no se borraron documentos para repetir.

En `backend`, el fingerprint agregado de las mismas 89 tablas siguió idéntico al inicio; historial permanece 148 y `electronic_documents` no existe. Solo recibió consultas de conservación. No se modificaron usuarios, credenciales, ACL, datos comerciales ni documentos pendientes anteriores.

La ausencia de transporte se respalda en el alcance del DDL y las rutas invocadas: ningún HTTP/net/worker/cron nuevo, ningún artefacto de emisión y CHECKs que mantienen outbox bloqueado y estados internos. No se afirma una captura global de todo el tráfico de Docker; se prueba el contrato de este incremento, no la ausencia de actividad ajena del entorno.

## 10. Pendientes y riesgos

| Clasificación | Situación |
|---|---|
| Implementado y probado | Persistencia sandbox, cantidades/importes exactos, permisos, RLS, snapshots, confirmación, numeración e idempotencia; 11 carreras seleccionadas. |
| Pendiente técnico | Revisar las 13 advertencias de lint indicadas; no hay aprobación de lint sin warnings. No se declara concurrencia universal: otras combinaciones/aislamientos PostgreSQL no se probaron. |
| Pendiente de producto | UI fiscal, abandono/reemplazo de borradores, referencias legales opcionales, más unidades fiscales y ramas fuera de CPE-PE-DOM-PEN-1. Ninguna se infiere silenciosamente. |
| Fuera de esta fase | C11 reemplazo de rechazados; C12 leases, firma/XML, proveedores, transporte, CDR, conciliación y prueba HTTP perdida desde React fiscal. Replay PostgreSQL probado no se presenta como ese E2E HTTP. |
| Bloqueante para producción | Perfil solo sandbox, datos ficticios; falta confirmación fiscal de SILSAN, modalidad/proveedor, controles oficiales completos, certificados/seguridad operativa, implementación y validación de transporte. No hay comprobantes válidos tributariamente. |

No hubo un defecto confirmado en Inventario o Distribución que requiriera ampliar el alcance. No se inició SUNAT Fase 2B.

## 11. Referencias inspeccionadas

- Informes SUNAT Fases 0/1 y casos C01–C10 de Fase 1.
- Migraciones de ventas/pedidos, cálculo fiscal comercial, clientes/direcciones, unidades, permisos directos y sesiones activas.
- Catálogos instalados, constraints, triggers, grants y funciones de venta/identidad de línea.
- Patrones de `test-phase2c4.py`, fixtures operativos e idempotencia 2C-2, sin ejecutar suites anteriores.
- Configuración temporal, etiquetas/puertos/montajes Docker y volumen.
- [RLS y grants de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), consulta 23/10/2026. La normativa del perfil se referencia al análisis aprobado de Fase 1; esta intervención no hace una nueva homologación normativa.

## 12. Archivos nuevos

1. `backend/supabase/migrations/20261023061225_electronic_fiscal_sandbox_persistence.sql`
2. `backend/scripts/fixtures/electronic_document_persistence.sql`
3. `backend/scripts/test-sunat-phase2a.py`
4. `docs/SUNAT_FASE2A_PERSISTENCIA_FISCAL.md`

Los tres archivos ejecutables inspeccionados no contienen credenciales, claves privadas, JWT ni contenido de .env. Las identidades de prueba usan `example.invalid`; se crean sin contraseña ni copia de usuarios reales. No se añadieron dependencias ni se modificaron archivos productivos anteriores, configuraciones Docker o migraciones históricas.

Estado de cierre: incremento backend probado en infraestructura aislada, con las observaciones explícitas de lint y límites anteriores. Sin commits, sin push y sin despliegue a `backend`.
