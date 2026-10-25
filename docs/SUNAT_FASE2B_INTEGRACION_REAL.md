# SUNAT Fase 2B — Tercer bloque: consulta fiscal real aislada

Fecha: 24/10/2026. Rama `codex/sunat-fase2b-consulta-sandbox`.
HEAD inicial y final: `459f4976050ba431ed5fa45a574ae53e1e4b7fb4`.

**Implementado y probado:** integración de lectura mediante Auth, JWT, PostgREST,
decodificador TypeScript y aplicación React reales. Sin cambios de código
productivo, dependencias, migraciones o PR. Sin commit ni push.

## Entorno e identidad

Runner: `frontend/scripts/test-fiscal-sandbox-integration.mjs`.
Comando desde frontend:

```text
rtk proxy node scripts/test-fiscal-sandbox-integration.mjs
```

Ejecución final: **exit 0 / PASS**.

| Recurso | Valor verificado |
|---|---|
| Proyecto nuevo | `silsan-fiscal-read-4588800bd2b4` |
| API / PostgreSQL / shadow | 59221 / 59222 / 59220 |
| Vite | `http://127.0.0.1:5197` |
| Volumen DB exclusivo | `supabase_db_silsan-fiscal-read-4588800bd2b4` |
| Contenedores | DB, Kong, Auth, PostgREST y Storage del proyecto nuevo |
| Historial | 150 versiones, idénticas al manifiesto ordenado del repositorio |
| Directorio | Nuevo `mkdtemp` del sistema, con propietario lógico y config verificables |
| Datos de prueba | Dos organizaciones ficticias A/B y tres lectores Auth nuevos |

Antes del arranque se comprueban puertos libres, ausencia de recursos con el nuevo
ID, endpoint Docker local y hashes del repositorio. El arranque utiliza una copia
temporal sin seeds ni enlaces remotos. Tras verificar etiquetas reales de proyecto,
puertos y montaje del volumen nuevo, copia las 150 migraciones y ejecuta únicamente
`migration up --local` sobre ese directorio. No usa reset, reparación de historial,
restauraciones ni copias de datos de bases existentes.

Cada consulta administrativa de fixtures/evidencia vuelve a comprobar identidad,
configuración, volumen, etiquetas, puertos y hashes. Estas consultas no pueden
seleccionar un destino mediante variables de entorno o argumentos de conexión.

Los constructores SQL de fixtures se reutilizan de la Fase 2A, sin ejecutar su
suite serial, carreras o limpieza. Crean datos comerciales y actores de preparación
ficticios; las sesiones SQL sintéticas de esos constructores sirven **solo para
preparar documentos**. Las comprobaciones de lectura utilizan tres usuarios creados
por Auth Admin en esta instancia nueva y sesiones/JWT emitidos por Auth real:
lector A con BILLING_VIEW, lector A sin ese permiso y lector B con BILLING_VIEW.
No se concede gestión fiscal a estos lectores. No se copian credenciales reales.

Los secretos administrativos permanecen en memoria del proceso de preparación.
El navegador recibe únicamente la clave pública local y las credenciales ficticias
que introduce en el formulario de login. No se crean archivos .env ni estados Auth
exportados, trazas con contraseñas o certificados.

## PostgreSQL, PostgREST y contrato TypeScript

**18 comprobaciones nombradas PASS** en la ejecución final, incluyendo integridad.

| Caso real | Resultado |
|---|---|
| Lector A / prepared de A | DTO aceptado por `leerComprobanteSandbox`, sin identidad numerada |
| Lector A / frozen de A | DTO aceptado; número 1 coherente con snapshot; NONE_SANDBOX |
| Precisión de ambos documentos | Total 118.00, base 100.00, IGV 18.00 y cantidad 1.000 como strings |
| Lector A sin BILLING_VIEW / RPC | HTTP 403, SQLSTATE 42501, sin datos |
| Lector B / organización A | HTTP 403, SQLSTATE 42501, sin datos |
| Lector B / documento A usando organización B | HTTP 400, P0001 / CPE_DOCUMENT_NOT_FOUND |
| UUID inexistente de A | HTTP 400, P0001 / CPE_DOCUMENT_NOT_FOUND |
| Sin sesión de usuario | HTTP 401, 42501 |
| JWT inválido | HTTP 401, PGRST301 |
| SELECT ordinario con RLS, documento ajeno | Cero filas |
| SELECT ordinario con RLS, lector sin permiso | Cero filas |
| Lector B / su documento | Prepared válido para organización B |
| Fingerprint fiscal/comercial antes y después de API y navegador | Igualdad íntegra |

El contrato RLS oculta filas mediante `can_view_electronic_documents`; la RPC
rechaza explícitamente la falta de autorización. No se impone el mismo código de
error a estos dos mecanismos distintos.

IDs ficticios de la ejecución final, eliminados con su volumen:

- Prepared A: `bfb0bee7-6907-4596-b987-b6070e966c9f`.
- Frozen A: `203b8978-8c99-44e6-ac1a-90a0e8e5bf13`.
- Prepared B: `c7a50851-8205-449e-99c9-8b3e15420140`.

## Playwright real

**Un recorrido completo PASS, con seis grupos de comprobaciones.** No son seis
tests independientes ni parte de la suite comercial de 27 pruebas. Usa Chromium,
la entrada/router/AuthProvider reales de la aplicación y seis RPC fiscales reales.
No sustituye, cumple ni fabrica respuestas Auth o fiscales.

1. Login A, menú/ruta protegida, UUID inválido sin RPC, consulta prepared real,
   importes originales y aviso «Prueba local, sin envío y sin validez tributaria».
2. Consulta frozen real, numeración interna coherente, crédito y cuota persistida.
3. Tab/Enter, limpieza con retorno de foco, documento inexistente con error real.
4. Vista 390×844: sin overflow global; tabla desplazable con ArrowRight. El resto
   del recorrido usa 1280×720.
5. Cierre A e inicio B en el mismo contexto: sin detalle/campo anterior; rechazo
   del documento A y lectura del documento B.
6. Login sin permiso: menú fiscal oculto, URL directa redirigida a Inicio y ningún
   detalle fiscal visible; cierre final de sesión.

El frontend actual no tiene selector de organización: el cambio A/B se prueba
mediante sesiones de usuarios distintos con una única membresía activa, sin
añadir selectores ni mutar membresías durante la consulta.

HTTP solo puede continuar hacia los orígenes nuevos de Vite/API. Un WebSocket solo
puede conectarse al Vite del propio test. Cualquier otro destino se bloquea y hace
fallar la ejecución. Service Workers bloqueados. Resultado: **cero solicitudes
inesperadas y cero errores de página**. Vite no carga archivos .env.

## Conservación y limpieza

Estado anterior/posterior a las lecturas, idéntico:

- 3 documentos, 3 líneas, 8 comandos fiscales.
- 1 trabajo outbox, bloqueado y sin transporte.
- Series con siguientes correlativos 1 y 2, sin avance por consulta.
- Fingerprints idénticos de perfiles, series, documentos, líneas, comandos, outbox,
  auditoría CPE, ventas/detalles, pedidos/detalles, movimientos, reservas y entregas.

La limpieza valida nuevamente la identidad y ausencia de recursos preexistentes
entre sus candidatos. Ejecuta stop con eliminación de datos **solo del proyecto
aleatorio creado por esta ejecución**, nunca --all. Comprueba ausencia de sus
contenedores y volúmenes, conserva los IDs y montajes previos de otros contenedores
y los metadatos de todos los volúmenes previos. Elimina exclusivamente su directorio
mkdtemp después de resolver y verificar su ruta, marcador y configuración.

Resultado final de limpieza: **PASS**. Sin conexiones SQL/REST a backend o
silsanplexp2c2; no se volvió a consultar su historial para afirmar conservación.

## Incidencias de construcción del test

No se detectaron defectos productivos. Se corrigieron en los nuevos scripts:

- Expectativa RLS incorrecta: se esperaba 42501 en SELECT, pero el contrato filtra
  filas. La RPC sí conservó 42501 en todos los casos correspondientes.
- Docker devuelve los montajes en orden variable: se comparan ordenados por destino.
- El WebSocket loopback de Vite provocó una excepción en un callback. Ahora se
  permite solo ese origen y los destinos inesperados se cierran/registran, sin
  lanzar desde el callback. El proyecto interrumpido se eliminó tras verificar
  manualmente su nombre, config, volumen y etiquetas; no quedaron recursos suyos.
- Un selector `<article>` genérico incluía tarjetas de Inicio. Se utiliza el nombre
  accesible «Detalle fiscal sandbox», sin cambiar la aplicación ni ocultar errores.

Las ejecuciones preliminares fallidas no cuentan como PASS. Sus recursos nuevos
también quedaron eliminados. La auditoría de cierre posterior corrigió únicamente
el finalizador y añadió pruebas de fallos, según se detalla al final del informe.

## Validaciones adicionales

| Comando desde frontend | Resultado efectivo |
|---|---|
| `rtk proxy node --test scripts/lib/check-fiscal-integration-environment.mjs` | 8/8 PASS, sin Docker ni DB |
| `rtk proxy npm test` | 652/652 PASS, 93 archivos |
| `rtk proxy npm run lint -- --deny-warnings` | PASS |
| `rtk proxy npm run test:e2e:typecheck` | PASS |
| `rtk proxy npm run build` | PASS; incluye tsc -b de frontend |
| `rtk proxy git diff --check` y whitespace de archivos nuevos | PASS |
| `npm audit --audit-level=high --omit=dev` | FAIL heredado: Zod alta y fast-uri moderada |

Build conserva el aviso previo de chunk mayor de 500 kB. Esta rama mantiene Zod
3.25.76 y fast-uri 3.1.8; no se cambian dependencias ni lockfiles. La corrección del
PR #60 sigue siendo una dependencia de integración segura. No se consultó ni cambió
el estado remoto de ninguno de los PR durante este trabajo.

## Archivos, Git y límites

Cuatro archivos nuevos, sin staging:

- `frontend/scripts/lib/fiscal-integration-environment.mjs`.
- `frontend/scripts/lib/check-fiscal-integration-environment.mjs`.
- `frontend/scripts/test-fiscal-sandbox-integration.mjs`.
- Este informe.

Sin modificaciones tracked, commits ni push. Los dos bloques previos, las 37 rutas
pendientes y tres archivos privados del checkout original conservan sus hashes.
Migraciones 149/150 intactas:

- 149: `df0c339852499b2717a5cfd00d822b06128ff970610fb0f74db08a15c242de01`.
- 150: `ff0d192543f389de8391a72507de5f217407287e60a4b8295fae4606f9bcb670`.

**Dictamen: apto para revisión y commit local del bloque de pruebas.** No equivale
a publicación o emisión fiscal real. No prueba concurrencia nueva, revocación
inmediata no comunicada al navegador, lectores de pantalla exhaustivos o entrega
de documentos SUNAT. No se ejecutó nuevamente la suite comercial completa ni las
146 comprobaciones fiscales; se probaron las lecturas/autorización solicitadas.

Un cierre abrupto del sistema/proceso puede impedir finally; el directorio conserva
su marcador para permitir una inspección antes de cualquier limpieza manual. No
hay una limpieza global automática de proyectos con nombres parecidos.

Fuentes técnicas consultadas: [Supabase CLI](https://supabase.com/docs/reference/cli/supabase-start),
[Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser),
[observabilidad](https://supabase.com/docs/guides/observability) y changelog oficial
al 24/10/2026. Los contratos del proyecto prevalecen para RLS y errores fiscales.

## Auditoría previa al commit local

La revisión confirmó que los tres lectores se autentican contra Auth real y usan
la clave pública más su JWT al consultar PostgREST. El cliente administrativo solo
crea identidades ficticias; no ejecuta las lecturas que acreditan autorización.
El navegador monta el router real, continúa solicitudes hacia la API efímera y no
contiene ningún `route.fulfill` ni respuesta fiscal fabricada. Se contrastaron las
18 aserciones y los seis grupos con la salida exit 0 de la ejecución anterior.
El historial de 150 versiones se verificó antes de fixtures contra el manifiesto
ordenado; las migraciones 149/150 mantienen sus hashes originales.

### Hallazgo P2 de limpieza, corregido y probado

El finalizador anterior esperaba primero browser.close y server.close sin capturar
sus errores. Una excepción ordinaria en cualquiera omitía environment.cleanup,
dejando recursos efímeros activos pese a haber entrado en finally. Se reprodujo
ejecutando el cuerpo exacto del finalizador con dobles de prueba, sin Docker, DB,
procesos ni archivos temporales: browser.close fallido produjo cero llamadas a
server.close y cleanup; server.close fallido produjo cero llamadas a cleanup.

Se extrajo closeFiscalTestResources en el helper ya autorizado. Cada cierre se
intenta de forma independiente, incluyendo limpieza verificada del entorno. La
función devuelve solo nombres de etapas fallidas; nunca mensajes con secretos.
El runner marca exit 1 ante cualquier fallo y distingue fallo de navegador/sesión
de fallo en la limpieza. También detecta errores devueltos por signOut, que antes
podían pasar inadvertidos. No se cambió la preparación, permisos, RPC, lecturas,
aserciones fiscales, destinos o criterios de propiedad de recursos.

**Pruebas finales: 13/13 PASS**: las ocho de aislamiento originales y cinco nuevas
de cierre. Cubren fallos de sesión, navegador y servidor, ruta satisfactoria, fallo
de cleanup y error de sesión devuelto sin excepción. Siempre se intenta cleanup;
su rechazo por identidad insegura continúa siendo un fallo y no se elude.

Se repitieron Vitest 652/652 (93 archivos), typecheck E2E, build con typecheck
frontend y lint sin warnings; todos PASS. Tras corregir exclusivamente el cierre,
se repitieron las 13 pruebas del helper, node --check y lint: PASS. Las pruebas
frontend ya ejecutadas no dependen de ese helper Node.

No se recreó el proyecto ni se repitieron SQL/PostgREST/Playwright en esta auditoría.
Los 18 controles y seis grupos reales corresponden a la ejecución anterior,
conservada como evidencia; el finalizador corregido se validó con inyección de
fallos y cierre satisfactorio sin recursos reales. Tampoco se afirma haber
reproducido un arranque parcial real de Docker: se revisaron sus guardas, que
rechazan limpiar recursos de identidad no demostrable y exigen inspección manual.

Dictamen posterior a la corrección: **apto para commit local de los cuatro archivos**.
La auditoría runtime sigue pendiente de integrar PR #60; no equivale a aprobación
para producción. No se inicia ningún bloque adicional ni se publica la rama.
