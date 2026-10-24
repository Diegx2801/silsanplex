# SUNAT Fase 2A — Corrección de advertencias SQL

Fecha de ejecución: 23/10/2026. Contrato conservado: `CPE-PE-DOM-PEN-1`.

## Resultado

**Implementado y probado en `silsanplexp2c2`: 13 → 0 advertencias en el lint estricto del schema `electronic_private`, 0 errores y 146/146 comprobaciones de regresión PASS, incluidas 11 carreras entre sesiones PostgreSQL independientes.** Se comprobaron además 12 equivalencias de resultados de helpers antes/después.

Se creó y aplicó exclusivamente en el proyecto temporal la migración prospectiva `20261023135019_electronic_fiscal_helper_sql_lint.sql`. El entorno temporal tiene 150 migraciones; el persistente `backend` conserva 148. No se reescribió la migración 149 ni se modificaron los fixtures o el runner existentes.

El informe `SUNAT_FASE2A_PERSISTENCIA_FISCAL.md` se conserva íntegro como evidencia de la ejecución original con 13 warnings. Este documento resuelve ese pendiente técnico; no habilita emisión tributaria ni modifica los límites sandbox de la fase.

## Git y conservación inicial

- Inicio: rama `main`, HEAD `f8c101d932263c63fafdc23eabcf48ad7c25af09`, índice vacío y sin modificaciones tracked.
- Se registraron rutas y SHA-256 de los 43 archivos sin seguimiento y tres archivos privados ignorados. No se publican sus contenidos ni sus hashes de credenciales.
- Se creó `fix/sunat-fase2a-sql-lint` conservando todos los archivos previos.
- La migración 149 conserva SHA-256 `df0c339852499b2717a5cfd00d822b06128ff970610fb0f74db08a15c242de01`.

## Matriz de las 13 advertencias originales

Las líneas indicadas son las líneas del cuerpo PL/pgSQL que informó el lint original, no números de línea del archivo completo. Todas son nivel `warning`. Las de volatilidad reportaron SQLSTATE `00000`; las de asignación, `42804`.

| ID | Función / línea del cuerpo | Causa comprobada | Corrección | Verificación posterior |
|---|---|---|---|---|
| W01 | `date_value`, 6, asignación a `d` | Conversión de texto a fecha mediante `date_in`, catalogada STABLE; wrapper IMMUTABLE. | `ALTER FUNCTION ... STABLE`. Cuerpo intacto. | Lint 0; equivalencias de fecha; regresión. |
| W02 | `date_value`, 7, IF | `to_char` está catalogada STABLE. | Misma corrección de volatilidad. | Lint 0; equivalencias con tres configuraciones. |
| W03 | `address`, 3, inicio de bloque | Inicialización de `v` por conversión implícita de texto a jsonb. | `'{}'::jsonb`. | Lint 0; dirección normalizada idéntica. |
| W04 | `address`, 8, asignación a `v` | `jsonb_build_object` es STABLE; wrapper IMMUTABLE. | Wrapper STABLE. | Lint 0; equivalencias; snapshots y regresión. |
| W05 | `payment`, 3, inicio de bloque | Inicialización de `parts` mediante conversión implícita a jsonb. | `'[]'::jsonb`. | Lint 0; crédito, cuotas y regresión. |
| W06 | `payment`, 3, inicio de bloque | Inicialización de `seen` mediante conversión implícita a text[]. | `'{}'::text[]`. | Lint 0; duplicados de cuotas siguen rechazados. |
| W07 | `payment`, 17, asignación a `parts` | `jsonb_build_array` es STABLE; wrapper IMMUTABLE. | Wrapper STABLE. | Lint 0; crédito ordenado idéntico y regresión. |
| W08 | `payment`, 21, RETURN | `jsonb_build_object` es STABLE. | Wrapper STABLE, coherente también con `date_value`. | Lint 0; importes y pagos probados. |
| W09 | `request`, 3, inicio de bloque | Inicialización implícita de `parts` como jsonb. | `'[]'::jsonb`. | Lint 0; comando canónico idéntico. |
| W10 | `request`, 18, asignación a `parts` | Constructor JSON de volatilidad STABLE. | Wrapper STABLE. | Lint 0; orden canónico de cuotas y replay. |
| W11 | `request`, 20, asignación a `pay` | `jsonb_build_object` STABLE. | Wrapper STABLE. | Lint 0; representación de pago idéntica. |
| W12 | `request`, 22, asignación a `v` | Constructor JSON STABLE y dependencia de `date_value`. | Wrapper STABLE, sin cambiar normalización. | Lint 0; claves, idempotencia y regresión. |
| W13 | `snapshot`, 8, inicio de bloque | Inicialización implícita de `items` como jsonb. | `'[]'::jsonb`; conserva VOLATILE. | Lint 0; snapshots, locks y conservación. |

Balance: ocho warnings de volatilidad y cinco de conversión. No se suprimieron advertencias ni se redujo el nivel del lint.

## Análisis de volatilidad, dependencias e invariantes

Se consultó el catálogo PostgreSQL instalado: `date_in`, `to_char`, `jsonb_build_object` y `jsonb_build_array` son STABLE. Mantener sus wrappers como IMMUTABLE ofrecía al optimizador una garantía más fuerte que la de sus dependencias. Aunque el perfil restringe fechas a ISO y los JSON a tipos conocidos, no se introdujo una reimplementación del parser ni de los constructores para forzar inmutabilidad.

`date_value`, `address`, `payment` y `request` quedan STABLE. Son validadores/normalizadores sin lecturas de tablas ni escrituras, de modo que el cambio de visibilidad MVCC asociado a la categoría no altera sus consultas de datos. `snapshot` conserva VOLATILE: lee y bloquea maestros para construir un snapshot coherente. Las RPC mutantes también conservan VOLATILE.

Se revisaron los llamadores en `pg_proc.prosrc`: `payment`, `request`, `snapshot`, `prepare_electronic_document`, `revise_electronic_document` y `save_electronic_issuer_profile`. Se contrastaron dependencias catalogadas y los textos efectivos de índices y constraints. No hay índices ni CHECKs que utilicen los cinco helpers afectados; no corresponde reconstruir índices ni recalcular filas. La ausencia de referencias en `pg_depend` no se utilizó por sí sola como prueba, porque las llamadas en cuerpos PL/pgSQL también requieren inspección.

La comprobación exacta de cuerpos mostró exclusivamente los cinco casts explícitos. El cuerpo de `date_value` no cambió y los otros 21 cuerpos de funciones fiscales capturados permanecen intactos. No se cambiaron formatos, errores, precisión, redondeo, reglas de cuotas, canonización, hashes, estados, locks, numeración ni reglas de replay.

`CREATE OR REPLACE` se usa solo en las cuatro funciones que necesitan un cast; `ALTER FUNCTION` corrige la categoría de `date_value`. Se verificaron OID, propietario, ACL, SECURITY DEFINER y `search_path` de las 26 funciones fiscales capturadas. Se conservaron también tablas, RLS, políticas, índices y constraints. No hay nuevos GRANT/REVOKE ni modificaciones de Inventario o Distribución.

Referencia técnica: [PostgreSQL 17 — Function Volatility Categories](https://www.postgresql.org/docs/17/xfunc-volatility.html), consultada el 23/10/2026. La documentación diferencia la estabilidad por sentencia de la promesa de inmutabilidad y advierte sobre el plegado prematuro de constantes en planes reutilizados.

## Migración prospectiva y entorno

Archivo nuevo: `backend/supabase/migrations/20261023135019_electronic_fiscal_helper_sql_lint.sql`.

SHA-256: `ff0d192543f389de8391a72507de5f217407287e60a4b8295fae4606f9bcb670`.

Se creó con `supabase migration new ... --workdir backend`, que solo genera el archivo. La aplicación se dirigió expresamente al directorio temporal, nunca a `backend`.

| Comprobación | Evidencia |
|---|---|
| Proyecto temporal | `silsanplexp2c2` |
| Configuración existente | `%LOCALAPPDATA%\Temp\silsanplex-phase2c2-20261021\supabase\config.toml` |
| API / PostgreSQL publicados | 58121 / 58122 |
| Contenedores | `supabase_kong_silsanplexp2c2`, `supabase_db_silsanplexp2c2`; activos |
| Etiquetas | `com.supabase.cli.project` y `com.docker.compose.project`: `silsanplexp2c2` |
| Volumen | `supabase_db_silsanplexp2c2` montado en `/var/lib/postgresql/data`; etiqueta de proyecto verificada |
| Historial anterior | 149 versiones coincidentes con los archivos locales anteriores |
| Historial posterior | 150; nueva versión `20261023135019`, aplicada una sola vez |
| Persistente `backend` | 148, última `20261021120000`; no tiene 149 ni 150 |

Antes de aplicar se ensayó el nuevo DDL dentro de BEGIN/ROLLBACK. Las definiciones efectivamente instaladas después coincidieron exactamente con las ensayadas, manteniendo identidad y permisos.

Se detectó una incidencia previa: la copia de `20261021120000_fix_distribution_outcome_idempotency.sql` conservada en el directorio temporal no incluye el bloque posterior del lock del pedido. La función instalada de Distribución sí coincide íntegramente con el cuerpo aprobado en el repositorio e incluye ese lock. No se sobrescribió, reaplicó ni reparó ese archivo histórico o su historial; se conservaron las huellas de los 149 archivos temporales anteriores. La única migración pendiente y aplicada fue 150. Esta diferencia debe considerarse en un futuro trabajo de reproducción desde archivos de esa carpeta temporal.

## Validaciones ejecutadas

| Comando / comprobación | Resultado efectivo |
|---|---|
| Lint original `--schema electronic_private --level warning --fail-on warning` | Exit 1: 13 warnings, 0 errores |
| Ensayo DDL BEGIN/ROLLBACK | PASS; historial permanece en 149 durante el ensayo |
| `supabase migration up --local --workdir <temporal>` | Exit 0; aplica exclusivamente `20261023135019` |
| Mismo lint estricto después de aplicar | Exit 0: `results: []`, 0 warnings, 0 errores |
| Runner original de Fase 2A, sin modificarlo | Exit 0: 146 PASS, 0 FAIL |
| Equivalencia de cuatro helpers × tres configuraciones | 12 comparaciones PASS, resultados antes/después idénticos |
| Conservación de esquema y permisos | PASS |
| Conservación de filas previas | PASS en las 96 tablas públicas/Auth capturadas |
| Conservación de `backend` | PASS, huellas de 90 tablas e historial idénticos |
| `git diff --check` y revisión de archivos nuevos | PASS |

Comandos principales ejecutados desde la raíz. Para publicación se normalizaron las rutas personales: LOCALAPPDATA representa la ubicación local verificada y python el intérprete validado; se conservan el proyecto, los argumentos y los resultados efectivos:

```powershell
rtk proxy supabase db lint --local --schema electronic_private --level warning --fail-on warning --workdir "$env:LOCALAPPDATA/Temp/silsanplex-phase2c2-20261021"
rtk proxy supabase migration new electronic_fiscal_helper_sql_lint --workdir backend
rtk proxy supabase migration up --local --workdir "$env:LOCALAPPDATA/Temp/silsanplex-phase2c2-20261021"
rtk proxy python backend/scripts/test-sunat-phase2a.py
rtk proxy git diff --check
```

Las 146 comprobaciones son las mismas del runner original: 97 seriales, 47 de concurrencia/persistencia/conservación y dos de preflight/conservación general. No se alteraron expectativas ni se incrementó artificialmente el contador con las comprobaciones auxiliares.

Las 11 carreras verificaron PID distintos y esperas reales observadas mediante `pg_stat_activity`: replay idéntico, misma clave incompatible, dos claves de confirmación del mismo original, dos preparaciones de la misma venta, ventas distintas compartiendo serie, dos organizaciones con la misma clave, tres órdenes entre configuración y confirmación, y dos órdenes entre cambio de cliente y congelación.

La regresión conserva las pruebas de rechazo de permisos, aislamiento, sesión revocada, inmutabilidad, precisión, cálculos incluidos/excluidos, boleta identificada, rollback íntegro, agotamiento de correlativos, snapshots y outbox bloqueado.

Las 12 comparaciones auxiliares ejecutaron `date_value`, `address`, `payment` y `request` con una fecha bisiesta válida, domicilio con espacios a normalizar y crédito de dos cuotas inicialmente desordenadas. Configuraciones: ISO/MDY + America/Lima, German/DMY + UTC y SQL/DMY + Pacific/Auckland. No se modificaron configuraciones globales; todas fueron SET LOCAL y ROLLBACK.

El primer intento de comparación masiva de huellas encontró el límite de argumentos de `jsonb_build_object`; se sustituyó la consulta de lectura por `jsonb_object_agg` de un UNION ALL. No se cambió SQL productivo por ese error del diagnóstico. El control de identidad y conservación quedó completado antes de aplicar.

## Conservación posterior

La migración por sí sola dejó idénticas todas las filas de las 96 tablas públicas/Auth capturadas, incluidos documentos congelados, sus snapshots, números, comandos y trabajos. La regresión permite agregar tenants ficticios y conserva cada fila preexistente mediante multiconjuntos de huellas; no elimina fixtures.

Esta ejecución agregó 12 tenants/usuarios ficticios y 13 documentos sandbox. Estado final temporal: 80 usuarios Auth, 60 organizaciones, 64 documentos fiscales internos (46 frozen y 18 prepared), 46 trabajos bloqueados con cero intentos y los 44 outcomes anteriores de Distribución. Los maestros creados por el runner son exclusivamente de esos nuevos tenants. No se reutilizaron usuarios ni documentos empresariales.

`backend` solo recibió consultas de lectura para verificar conservación; sus 90 tablas capturadas y sus 148 migraciones mantuvieron sus huellas. No se modificaron Docker, credenciales, ACL, usuarios previos ni datos persistentes.

## Alcance y estado final

- **Implementado y probado:** las 13 advertencias originales resueltas, regresión 146/146, 11 carreras, 12 equivalencias auxiliares y conservación verificada.
- **Pendiente:** revisión y commits de los archivos SUNAT; integración en `backend` no autorizada ni ejecutada en esta intervención.
- **Límite del lint:** el resultado 0 corresponde al schema fiscal privado que contenía los 13 avisos. No es una declaración de ausencia de advertencias en todos los schemas históricos de SILSAN.
- **Fuera de alcance:** frontend, XML, firma, SUNAT/PSE/OSE, workers, fase 2B y regresiones históricas que requieren limpieza o recreación. No se ejecutaron Vitest, Playwright ni build porque no cambió código frontend. No se atribuyen resultados anteriores a esta intervención.
- **Bloqueante para producción:** continúan todos los límites sandbox y requisitos fiscales/operativos descritos en las Fases 1/2A; resolver el lint no convierte el documento interno en CPE válido.

Archivos nuevos de esta corrección:

1. `backend/supabase/migrations/20261023135019_electronic_fiscal_helper_sql_lint.sql`.
2. `docs/SUNAT_FASE2A_CORRECCION_SQL_LINT.md`.

Git final: rama `fix/sunat-fase2a-sql-lint`, HEAD `f8c101d932263c63fafdc23eabcf48ad7c25af09`, índice vacío y sin modificaciones tracked. Se conservan los 43 archivos untracked iniciales y sus hashes; con los dos nuevos quedan 45. No se creó commit ni se hizo push.

## Preparación de publicación por Pull Request — 23/10/2026

El estado Git de la sección anterior corresponde al cierre de la corrección, antes de autorizar su publicación. La preparación posterior parte del mismo HEAD de `main`, verificado mediante fetch, y utiliza `feat/sunat-fase2a-sandbox` para reunir exclusivamente los ocho archivos de las Fases 0, 1 y 2A, incluyendo ambas migraciones y sus pruebas.

La revisión para un repositorio público no encontró contraseñas, tokens, claves privadas, UUID empresariales ni datos fiscales reales en esos candidatos. Se sanearon rutas personales y referencias operativas locales innecesarias en los informes; se mantuvieron los nombres de artefactos, fuentes oficiales, fechas, resultados y hashes. Las migraciones 149/150 y los archivos de pruebas conservan sus bytes validados.

Se repitieron el lint estricto focalizado (0 warnings/errores), la regresión original (146/146 PASS, 11 carreras independientes) y las 12 equivalencias de helpers. El runner verificó nuevamente configuración, contenedores, volumen, puertos e historial del proyecto temporal. Los trabajos de outbox permanecen bloqueados y con cero intentos. Se comprobó conservación de filas previas y de la base persistente, que sigue en 148 migraciones.

La secuencia aislada previamente ejecutada fue 148 → 149 → 150, sin reconstruir las migraciones anteriores. GitHub Actions reconstruirá su propia base efímera a partir de los archivos oficiales versionados y ejecutará sus pruebas habituales. Esa comprobación desde cero queda pendiente del resultado efectivo del PR: no se declara PASS anticipadamente. La copia histórica antigua de 2C-2 del directorio temporal no se incorpora al repositorio ni se utiliza como migración oficial.

El runner fiscal dedicado exige la identidad fija `silsanplexp2c2`; no debe ejecutarse automáticamente sobre el proyecto `backend` del runner de CI. Sus 146 comprobaciones locales están separadas de las suites descubiertas por `supabase test db`. No se modifica el workflow ni se reduce esa protección para publicar el incremento.

La publicación no autoriza fusionar el PR ni aplicar las migraciones fiscales a `backend`. Siguen pendientes los datos y decisiones del emisor, modalidad/proveedor, requisitos oficiales completos y las futuras fases de UI, XML, firma y transporte. No existe emisión tributaria real en este incremento.
