# Fase 2C-5 — Validación final y preparación de cierre

Fecha: 22 de octubre de 2026, America/Lima.

## Dictamen

Las correcciones están implementadas y las validaciones focalizadas actuales pasan. Se recomienda aprobar su revisión e integración en commits locales separados. **No se declara listo para producción ni se autoriza publicación/despliegue**: faltan el tratamiento de la ACL de credenciales, la regresión E2E general en un entorno compatible y el despliegue autorizado/verificado de la migración y configuración del destino.

No se detectó un fallo funcional nuevo que justificara modificar código productivo. En esta fase solo se crea este informe; los archivos de 2C-1 a 2C-4 se conservan intactos.

## Estado Git e inventario

Rama `main`, HEAD `425d91f93647fdc15f9c1f383dae920a0a7c61c6`. Índice vacío; ahead 6 / behind 0 respecto de la referencia local `origin/main`. No se hizo fetch en esta intervención ni se afirma haber comprobado novedades remotas.

Los seis commits locales existentes son `15c4d5b`, `5cdd5b6`, `8c812d7`, `213c877`, `112e349` y `425d91f`; corresponden al cierre previo y permanecen sin alteraciones.

### Tracked modificados

| Archivo | Alcance |
| --- | --- |
| `frontend/src/modulos/distribucion/componentes/DialogoResultadoEntrega.tsx` | 2C-3: conserva comando incierto, payload y clave; permite replay tras refresco; editar inicia otra operación |
| `frontend/tests/e2e/fixtures/operational.ts` | 2C-3: destino temporal opt-in, comprobaciones independientes obligatorias y barrera de red |
| `frontend/tests/e2e/operational-partial-deliveries.spec.ts` | 2C-3: respuesta perdida tras commit real, replays y conflictos; conservación y auditoría |

### Nuevos candidatos a versionar

| Archivo | Fase |
| --- | --- |
| `docs/FASE2C_AUDITORIA_INTEGRIDAD.md` | 2C-1 |
| `backend/supabase/migrations/20261021120000_fix_distribution_outcome_idempotency.sql` | 2C-2 |
| `backend/supabase/tests/database/distribution_outcome_idempotency.test.sql` | 2C-2 |
| `backend/supabase/tests/database/distribution_outcome_concurrency.test.sql` | 2C-2 |
| `docs/FASE2C2_CORRECCION_IDEMPOTENCIA.md` | 2C-2 |
| `frontend/src/modulos/distribucion/componentes/DialogoResultadoEntrega.test.tsx` | 2C-3 |
| `frontend/scripts/run-phase2c3-e2e.mjs` | 2C-3 |
| `docs/FASE2C3_REINTENTOS_REACT.md` | 2C-3 |
| `backend/scripts/test-phase2c4.py` | 2C-4 |
| `docs/FASE2C4_SEGURIDAD_CONCURRENCIA.md` | 2C-4 |
| `docs/FASE2C5_VALIDACION_FINAL.md` | 2C-5 |

Todos estos cambios pertenecen al alcance autorizado. Los informes conservan evidencia histórica, que debe distinguirse de la ejecución actual.

### Preservados y excluidos

`.codex/hooks.json` y cinco evidencias bajo `output/` siguen sin seguimiento y fuera del índice. No son candidatos a ningún commit. `.env.e2e.local`, `dist/` y `test-results/` están ignorados por Git. No se añadieron logs ni credenciales. Se revisaron los diffs tracked y los nuevos archivos fuente; el escaneo de literales JWT y `sb_secret_` en los candidatos fuente no encontró coincidencias. Los scripts usan referencias a variables/credenciales temporales en memoria; no deben confundirse esas referencias con secretos guardados.

## Validaciones ejecutadas ahora

Los comandos de frontend se ejecutaron desde `frontend/`, con prefijo RTK.

| Comando | Resultado efectivo |
| --- | --- |
| `node node_modules/typescript/bin/tsc -b --pretty false` | PASS, exit 0; typecheck frontend |
| `npm run test:e2e:typecheck` | PASS, exit 0 |
| `npm run lint -- --deny-warnings` | PASS, exit 0, sin warnings de lint |
| `npm test` | PASS: 89 archivos, 580/580 pruebas, 10,88 s |
| `npm run build` | PASS: `tsc -b && vite build`, exit 0 |
| `node scripts/run-phase2c3-e2e.mjs` | PASS: Playwright 1/1, 17,3 s, sin retries |
| `python backend/scripts/test-phase2c4.py --authorization-only` desde raíz | PASS: 39/39; rollback y conservación de filas previas |
| `git diff --check` | PASS |
| Inspección ACL con `icacls frontend/.env.e2e.local` | Ejecutada; riesgo confirmado, sin modificaciones |
| Comparación cuerpo SQL local/instalado, catálogo de grants y UNIQUE | Coincidencia exacta y permisos esperados |

### Avisos de build

Vite advierte que algún chunk minificado supera 500 kB. `DistribucionPage` mide 505,75 kB, gzip 154,65 kB; `xlsx` queda en 492,52 kB. Es una mejora de rendimiento posterior: revisar imports y separación de código con mediciones. No es error de compilación, pérdida de integridad ni motivo para cambiar arquitectura en esta fase. No se silenció aumentando el umbral.

El build de validación contiene `http://127.0.0.1:54321` en el asset de autenticación, derivado de la configuración local. Construir un artefacto para producción requiere variables del destino y validarlas antes de publicar. Este build no se usó para operaciones contra `backend`: el E2E arranca un servidor Vite separado con URL temporal verificada.

Los avisos `NO_COLOR`/`FORCE_COLOR` del proceso Playwright son de presentación de consola y no alteran el resultado del test.

## E2E final y compatibilidad de infraestructura

El runner volvió a verificar directorio/configuración, proyecto `silsanplexp2c2`, contenedores DB/Kong, bindings 58121/58122, volumen original y etiquetas, función corregida y organización única. Se usó la cuenta ficticia `phase2c3.runner@example.invalid` con rol específico, sin ADMIN. El runner actualiza únicamente su contraseña temporal en memoria y su configuración de pruebas; no utiliza ni modifica las credenciales del archivo habitual.

El proceso de preparación mantuvo la clave administrativa fuera del navegador. El fixture comprobó el módulo Supabase transformado servido por Vite y bloqueó peticiones a 54321/54322 o Auth/REST fuera de `http://127.0.0.1:58121`. La falta de etiqueta `workdir` se admite únicamente en el destino temporal tras comprobar las identidades independientes; el modo `backend` conserva su exigencia estricta.

Evidencia de la ejecución actual:

- Referencia `E2E-OPS-984C35A9`; pedido temporal `PED-000014`, UUID `43e417ae-d7cf-4ce6-850e-64dedb905188`.
- Entregas `9d368e85-4f2a-4927-98c9-5ee499c33194` y `8d430758-39fd-49be-aac7-27761a83e96c`, cantidades 2 y 4, ambas `entregado`.
- Clave inicial/replay `1e9b519e-0a3f-474a-b814-9dc49daf0838`, mismo UUID de outcome `e23ffdab-14f5-4457-b7b9-b52555e248f4`.
- El RPC se ejecutó realmente antes de abortar la respuesta HTTP. El replay conservó payload, resultado y versión; los conflictos de cantidad/evidencia se rechazaron sin éxito aparente. Editar evidencia o cantidad generó claves distintas.
- Dos outcomes, dos líneas y dos auditorías de resultado; no hubo versiones ni movimientos adicionales por reintentos/rechazos. Entrada 10, salida 6, físico final 4, reserva pendiente 0; dos movimientos totales y dos allocations sobre la misma salida.
- La programación y conformidad sumaron 6; la conformidad se comprobó por línea, sin atribuirle un lote directo que el modelo no registra.

La suite Playwright general **no se ejecutó ahora**. El runner focalizado reutiliza una sola identidad para variables de otros roles y un marcador vacío de fixtures FEFO: no equivale a preparar toda la suite. Autenticación general necesita identidades independientes y modifica la contraseña de recuperación; Inventario necesita productos/lotes/almacenes y datos base64 por intento; Reparaciones necesita sus maestros y permisos. Los otros flujos operativos llaman `operationalFixture(page)` con destino habitual y rechazan el puerto 58121. También debe revisarse la disponibilidad de las Edge Functions declaradas en la configuración temporal.

Requisito pendiente: preparar infraestructura temporal completa para esas suites, separar cuentas/fixtures y optar explícitamente por el destino aislado en los casos que lo necesiten, manteniendo barreras de red e identidad. No se ejecutó `npm run test:e2e:local` ni el preparador de `backend`. El anterior 27/27 general es antecedente; no se presenta como regresión final del contenido actual.

## Revisión SQL y regresiones seguras

La única migración pendiente es prospectiva: `20261021120000_fix_distribution_outcome_idempotency.sql`, SHA-256 `cfc2063a2353c9330da9a5cd6fee0bb0d71895ebec2b0bc7e95894901eec2691`. Su cuerpo de función coincide exactamente con `pg_proc.prosrc` instalado en el volumen temporal, normalizando saltos de línea y bordes. No hay diffs tracked sobre migraciones históricas.

- La identidad compara organización, clave, entrega, resultado, categoría, fecha, evidencia, incidencias y líneas deterministas ordenadas por `orderLineId` con precisión `numeric(14,3)`.
- Las dos rutas de replay verifican equivalencia. La recuperación de `unique_violation` se limita a `distribution_delivery_outcomes_operation_key`; no transforma otras violaciones en éxito.
- La restricción instalada es `UNIQUE (organization_id, operation_key)`.
- Advisory lock por organización/clave; luego entrega/versionado y pedido antes de triggers agregados. La versión obsoleta no impide un replay idéntico ya confirmado.
- Autorización explícita antes del replay; filtros organizacionales en consultas y persistencia.
- Las cinco RPC auditadas conservan `SECURITY DEFINER`, `search_path` vacío, anon sin EXECUTE y authenticated con EXECUTE sujeto al guard interno.
- No se altera esquema de outcomes ni datos históricos. La comparación reconstruye el contenido persistido; no necesita backfill ni una huella redundante.

Se reejecutó únicamente el modo seguro de autorización 2C-4: 39 aserciones, identidades/roles transaccionales con rollback, replays válidos de programación/resultados/despacho y rechazos después de revocación. Incluye comparación antes del rollback para detectar efectos comerciales y conservación después de este. No cambia usuarios ni roles previos.

Las 353 aserciones SQL de 2C-2 y las cinco carreras de 2C-4 son evidencia anterior compatible con el mismo cuerpo SQL instalado; no se reejecutaron aquí. Las suites históricas con IDs fijos, limpieza o modificación de triggers se excluyeron del volumen conservado. Incluso la suite dedicada de idempotencia contiene modificaciones temporales de triggers, por lo que no se ejecutó automáticamente. La regresión SQL completa requiere otra base totalmente desechable, identidad/puertos/volúmenes propios y autorización para su preparación. No se construyó ni se repitieron las 148 migraciones.

## Revisión de credenciales y ACL

El archivo ignorado `frontend/.env.e2e.local` contiene cuatro pares de variables de acceso y los fixtures de inventario. Se inspeccionaron nombres y presencia, nunca valores. No contiene variables de clave administrativa en las entradas observadas. No se intentó autenticar contra `backend` para probar vigencia de esas contraseñas; no se afirma que se haya verificado su validez actual.

ACL efectiva observada:

| Principal | Permiso heredado |
| --- | --- |
| BUILTIN/Administradores | Full control |
| NT AUTHORITY/SYSTEM | Full control |
| BUILTIN/Usuarios | Read/Execute |
| NT AUTHORITY/Usuarios autentificados | Modify |

**Riesgo confirmado P2 del entorno de desarrollo:** otros usuarios locales pueden leer credenciales y usuarios autenticados pueden cambiar la configuración. Si las credenciales siguen vigentes, permiten intentar acceso a la instancia local con los permisos de esas cuentas. El preparador habitual usa `writeFileSync(..., mode: 0o600)`, que no establece por sí solo una DACL NTFS restringida; no se ejecutó ese preparador.

Corrección propuesta, pendiente de autorización: respaldar la ACL, retirar herencia del archivo, conservar acceso explícito solamente para el SID del propietario de desarrollo, SYSTEM (`S-1-5-18`) y Administradores (`S-1-5-32-544`), y retirar acceso de Usuarios (`S-1-5-32-545`) y Usuarios autenticados (`S-1-5-11`). Comprobar acceso efectivo y que la regeneración conserva la DACL, usando un directorio también restringido si el archivo pudiera reemplazarse. Después, evaluar rotación exclusiva de las cuentas E2E afectadas con autorización. No se ejecutó ningún cambio de ACL ni rotación sobre el entorno habitual.

La ACL es un requisito de seguridad antes de continuar usando/compartiendo esas credenciales. No demuestra una vulnerabilidad de RLS productivo, pero no debe declararse resuelta por tener el archivo en `.gitignore`.

## Compatibilidad y decisión de cierre

| Estado | Evaluación |
| --- | --- |
| Implementado | SQL 2C-2, manejo de replay React, pruebas y herramientas aisladas 2C-3/2C-4 |
| Probado ahora | Frontend 580/580, typechecks, lint, build, E2E corregido 1/1, autorización SQL 39/39 y coincidencia de función |
| Probado anteriormente | SQL focalizado 353/353 y cinco carreras reales 2C-4; resultados no sumados con el refuerzo solapado |
| Pendiente | Suite Playwright general compatible, regresión SQL completa en otra base desechable, tratamiento ACL y gestión de credenciales |
| Bloqueante para producción | Despliegue aprobado/verificado de la migración, build con configuración del destino, cierre de seguridad y validación de regresión pendiente según la puerta de publicación |

2C-1 documenta el defecto original; 2C-2 lo corrige manteniendo el UUID de respuesta y contratos de seguridad; 2C-3 reutiliza el comando idéntico, con claves nuevas al editar; 2C-4 confirma permisos, revocación, aislamiento y las carreras seleccionadas. No hay incompatibilidad observada entre esas fases.

Recomendación: integrar para revisión mediante commits locales trazables; mantener la publicación y producción pendientes de las condiciones anteriores. No se aplicó la migración a `backend` ni se comprobó/desplegó un destino productivo en esta intervención.

## Propuesta de commits, sin staging

1. `docs: record distribution integrity audit`: `docs/FASE2C_AUDITORIA_INTEGRIDAD.md`.
2. `fix(db): enforce delivery outcome payload idempotency`: migración `20261021120000_fix_distribution_outcome_idempotency.sql`, los dos tests SQL `distribution_outcome_idempotency.test.sql` y `distribution_outcome_concurrency.test.sql`, e informe `docs/FASE2C2_CORRECCION_IDEMPOTENCIA.md`.
3. `fix(distribution): preserve delivery outcome retries after response loss`: `DialogoResultadoEntrega.tsx`, su `.test.tsx`, `fixtures/operational.ts`, `operational-partial-deliveries.spec.ts`, `frontend/scripts/run-phase2c3-e2e.mjs` e informe `docs/FASE2C3_REINTENTOS_REACT.md`.
4. `test(db): cover distribution authorization and complementary races`: `backend/scripts/test-phase2c4.py` y `docs/FASE2C4_SEGURIDAD_CONCURRENCIA.md`.
5. `docs: record final distribution validation and release gates`: este informe.

Las rutas abreviadas del grupo 3 son las rutas completas del inventario superior. La separación es viable sin reconstruir versiones antiguas: no hay archivos compartidos entre grupos. El grupo 3 requiere el contrato SQL del 2 para su validación; el arnés del 4 presupone el entorno/identidad ficticia preparados por el 3. El grupo 5 referencia los resultados de todos. Antes de cada futuro commit deberán comprobarse sus rutas staged explícitas y el diff completo; ninguno se ha preparado ahora.

Estado final: índice vacío, cambios anteriores conservados, nuevo informe sin seguimiento, `.codex/`, `output/`, credenciales, logs y artefactos fuera del índice. Sin commit, push ni fase adicional.
