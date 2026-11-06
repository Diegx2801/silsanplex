# D01 — Lectura de auditoría y sesiones revocadas

Base de revisión: `30f28fc142948b58dd7dae60b477cf815be54032`.

## Causa y alcance

Un JWT emitido por Auth puede seguir siendo criptográficamente válido después
de revocar su sesión. La política `audit_events_select_admin` comprobaba
administrador y organización, pero no la existencia de esa sesión.

La corrección reutiliza `public.current_auth_session_is_active()`, que contrasta
el `session_id` del JWT y `auth.uid()` con `auth.sessions`. No cambia Auth, el
significado de administrador ni la resolución de permisos.

La migración aditiva
`20261106010000_require_active_session_for_audit_reads.sql` modifica **la misma
política**, conservando su rol, comando y alcance de organización. No añade una
política permisiva alternativa, nuevos permisos ni grants.

Tres RPC existentes proyectan campos de `audit_events` como `SECURITY DEFINER`:

- `list_distribution_delivery_status_history`.
- `list_distribution_inventory_movements`.
- `list_distribution_delivery_inventory_trace`.

Su ejecución como propietario elude la RLS de la tabla; por ello también exigen
la sesión activa, conservando `DISTRIBUTION_VIEW`, filtros de organización,
firmas, columnas, volatilidad, `search_path` y privilegios. Sus consultas de
negocio se mantienen idénticas. Los comandos internos que escriben auditoría no
se sustituyen ni se convierten en lectores públicos de la bitácora general.

## Contraprueba real de actualización

En un Supabase desechable se obtuvo un JWT firmado mediante inicio de sesión
real. Tras revocarlo mediante Auth, se conservó **el mismo access token**, aún
no vencido:

| Consulta | Antes de D01 | Después de D01 |
|---|---|---|
| SQL authenticated: auditoría | 1 fila | 0 filas |
| SQL authenticated: reparación | 0 filas | 0 filas |
| REST de auditoría con JWT revocado | HTTP 200, 1 fila | HTTP 200, `[]` |
| REST del helper con ese JWT | HTTP 200, `false` | HTTP 200, `false` |

HTTP 200 demuestra que la infraestructura admitió el JWT; la ausencia de filas
después de la migración procede de PostgreSQL/RLS, no de un 401 del gateway.
Una sesión nueva del mismo administrador sigue leyendo la fila y no reactiva
el token revocado. La actualización conserva literalmente los registros de
negocio/historial comparados y los privilegios públicos.

## Regresiones permanentes

- `backend/supabase/tests/database/audit_session_access.test.sql`: administrador
  activo, revocado, usuario ordinario, otra organización, retirada del rol ADMIN,
  sesión inexistente, ausente o perteneciente a otro usuario, claims no vencidos,
  reintentos, nueva sesión, proyecciones RPC, RLS, ausencia de permisos nuevos e
  historia inalterada. Todo queda dentro de una transacción con rollback.
- `frontend/tests/accessory-e2e/audit-session.spec.ts`: JWT firmado real, cierre
  de sesión mediante Auth, contraste SQL/REST, reintentos, rechazo HTTP 403 de
  las tres proyecciones y aislamiento/revocación administrativa.
- El runner aislado incorpora ambos archivos; los modos especializados R13/R14/R28
  mantienen su alcance existente. No se eliminan ni se relajan pruebas anteriores.
- Seis suites SQL antiguas crean ahora sesiones de sus propios usuarios y claims
  completos para los casos que esperan lecturas autorizadas. Sus aserciones y
  planes permanecen iguales; una identidad simulada sin sesión ya no representa
  un caso autorizado.

## Validación reproducible

Desde `frontend`, con dependencias instaladas y Docker disponible:

```text
npm run test:repairs:isolated -- --all-sql --workflow-e2e
npm run test:repairs:isolated -- --checks-only --edge-checks
```

El runner genera un proyecto Supabase exclusivo, valida contenedor/volumen,
no carga `.env` empresariales y destruye sus recursos al terminar. No se deben
usar comandos de reset/migración sobre un proyecto de trabajo o empresarial
para reproducir estos casos.

### Resultado local del bloque — 6 de noviembre de 2026

- SQL completo: **122 suites / 4.666 aserciones**; incluye las 39 nuevas de D01.
- Frontend completo: **1.103 pruebas / 136 archivos**, sin fallos.
- Se conservan los **68 E2E anteriores** y pasan las **2 regresiones SQL/HTTP**
  adicionales de D01; total 70, sin omitidas, fallos ni flaky.
- Lint SQL sin hallazgos; lint frontend sin errores/advertencias; tipos de
  frontend/E2E/scripts backend y build correctos. La advertencia de chunks grandes
  del build permanece como condición previa, no bloqueante.
- Checks y 25 pruebas Edge relacionadas correctos.
- Upgrade real desde el esquema publicado: mismo JWT revocado aún vigente,
  auditoría REST de una fila a `[]`, SQL de una a cero filas; historia comparada
  y ACLs iguales. Una sesión nueva conserva la lectura autorizada.
- Probe sobre fixtures operativos reales: sesión activa obtiene cinco entradas
  de historial y una traza; con sesión revocada las tres proyecciones rechazan
  con `42501 / DISTRIBUTION_FORBIDDEN`. La revocación del probe se revierte.

La primera ejecución SQL detectó seis fixtures sin sesión. Se corrigió únicamente
su preparación de sesiones/claims y se repitió la batería integrada completa;
los planes y las aserciones anteriores no se redujeron.

Evidencia local fuera de Git: `%TEMP%/opencode/silsanplex-d01-20261106/`.
No se aplicó la migración a proyectos empresariales ni se publicó el cambio.

## Compatibilidad con R39 pendiente

Esta corrección es independiente del trabajo R39 no integrado. R39 debe reconocer
que la política existente ya exige sesión activa y conservar las guardas de las
proyecciones; no debe añadir otra política permisiva, restaurar el predicado
antiguo ni reescribir historia. No se implementan metadata, snapshots, paginación,
reportes R40 ni otros hallazgos de la auditoría en este bloque.
