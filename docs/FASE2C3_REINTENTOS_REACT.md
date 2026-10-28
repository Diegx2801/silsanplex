# SILSANPLEX — Fase 2C-3: reintentos de resultados desde React

Fecha: 22 de octubre de 2026

## Validación final: PASS real

El bloqueo del preflight temporal quedó resuelto y el escenario 2C-3 se ejecutó contra PostgreSQL corregido. Última ejecución: **1/1 Playwright PASS en 17,2 s**, sin retries. Los apartados dentro del histórico inferior describen el bloqueo anterior, ya resuelto.

### Identidad del destino y preflight

Proyecto exclusivo `silsanplexp2c2`, directorio autorizado `C:\Users\ADMIN\AppData\Local\Temp\silsanplex-phase2c2-20261021`, API `127.0.0.1:58121`, DB `58122` y volumen real `supabase_db_silsanplexp2c2`. Se conservó el volumen existente, las 148 migraciones y la función corregida 2C-2. No se reiniciaron contenedores ni se aplicaron migraciones durante este desbloqueo.

La CLI global 2.109.0 que creó los contenedores no registró `com.supabase.cli.workdir`. La ausencia se comprobó con `docker inspect`; no se inventó ni agregó una etiqueta. Solo el destino opt-in temporal permite esa ausencia. Un valor de directorio presente e incompatible sigue siendo rechazado. El entorno habitual sigue exigiendo su etiqueta de directorio.

La compensación es obligatoria: directorio autorizado exacto, config con proyecto y puertos, contenedores activos con etiquetas reales del proyecto, bindings API/DB, volumen montado real y sus etiquetas, conexión efectiva mediante `docker exec ... psql`, definición instalada de la RPC con corrección y locks, organización única esperada, identidad ficticia autenticada y membresía activa. Cualquier fallo aborta el recorrido antes de crear maestros.

Antes de preparar Auth, el runner repite las verificaciones de contenedores, configuración, volumen, SQL y organización y contrasta API/DB con `supabase status`. No usa el preparador habitual.

### Preparación mínima y repetible

Nuevo runner `frontend/scripts/run-phase2c3-e2e.mjs`, ejecutado desde frontend:

```text
node scripts/run-phase2c3-e2e.mjs
```

Solo crea o actualiza `phase2c3.runner@example.invalid`, con contraseña aleatoria nueva generada en memoria, una membresía en la organización temporal existente y el rol `E2E_PHASE2C3`. Las preparaciones repetidas reutilizaron el mismo usuario: recuento Auth final **1**, único rol asignado **E2E_PHASE2C3**. No se guardaron contraseñas ni claves administrativas en archivos.

El rol contiene 15 permisos para consultar/gestionar clientes, proveedores, productos, compras, inventario, ventas y distribución, incluida recepción. No incluye gestión de usuarios ni reparación. La política de auditoría requiere ADMIN; por eso la comprobación de auditorías se hace con consultas SQL de solo lectura desde el proceso del test, sobre IDs de esta ejecución, sin elevar el navegador ni alterar RLS.

La clave administrativa temporal se obtiene en memoria mediante `supabase status` y solo se utiliza para preparar cuenta, membresía y rol. El navegador recibe la clave pública temporal y una sesión ordinaria. Los maestros y documentos comerciales los crea el fixture/React existente, con referencias únicas; no se copió información desde `backend`.

### Destino efectivo del navegador

El runner transmite a Playwright y a su servidor Vite recién iniciado (`CI=true`, sin reutilizar servidor) la URL temporal y clave pública. El fixture descarga el módulo transformado `/src/lib/supabase.ts` servido por Vite y exige que contenga `http://127.0.0.1:58121`. Antes del login instala una barrera de red: aborta peticiones a puertos 54321/54322 y cualquier petición Auth/REST cuyo origen no sea la API temporal. Las rutas de interceptación del resultado conservan esta barrera mediante fallback. El cliente de persistencia también usa la URL temporal verificada.

### Resultado persistido y trazabilidad

Última referencia `E2E-OPS-95B6CC47`, pedido temporal `PED-000003`, UUID `617ae053-29c8-4a75-a738-521baf58b0d1`.

- Primera entrega `b7aa107f-8bbe-42f1-822d-c365b343a0a4`: 2 unidades. Clave original y replay `aa39dbfb-0c36-433b-b250-cb16a187d754`; ambos devolvieron outcome `a7c87e17-0313-4d35-ad53-1177766e3654`.
- Segunda entrega `75ae0a6c-7054-4e18-a882-ce7f002a2e2b`: 4 unidades. Cambiar evidencia produjo otra clave y HTTP 400; cambiar después la cantidad produjo una tercera clave distinta y otro rechazo, manteniendo el diálogo y su alerta visibles.
- Se ejecutó la RPC real con `route.fetch()`; solo después de su respuesta confirmada se abortó la respuesta al navegador. El replay idéntico conservó payload y UUID, y cerró el diálogo al recibir éxito real.
- Los conflictos de cantidad/evidencia con la clave original devolvieron `DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED`. Ninguna solicitud incompatible se presentó como éxito.
- Por entrega: 1 outcome, 1 línea, 1 auditoría; las solicitudes rechazadas y el replay no incrementaron `lock_version`. Ambas versiones finales fueron **5** y ambos estados `entregado`; pedido final `delivered`.
- Conteos por recorrido: 1 compra/línea/recepción/partida, 1 cotización, 1 pedido/línea, 1 venta, 1 reserva consumida; 2 movimientos físicos (entrada 10, salida 6); 2 entregas/líneas/allocations/outcomes/líneas de outcome. Dos auditorías de resultado.
- Movimiento compartido `f9ae6776-bef8-4228-8d27-59e87aa0eba3`: allocations 2+4. Recibido 10, despachado 6, programado 6, conformado 6, pendiente 0, stock físico 4, reserva pendiente 0. Ninguna entrega generó un movimiento adicional.

### Validaciones ejecutadas y alcance

| Comprobación | Resultado |
| --- | --- |
| Runner focalizado, ejecución final | PASS: 1 test, 17,2 s |
| Dos ejecuciones previas durante el ajuste | PASS: 1 test cada una; se conservaron sus datos ficticios |
| `npm run test:e2e:typecheck` | PASS después del último cambio |
| `npm run lint -- --deny-warnings` | PASS después del último cambio |
| `git diff --check` | PASS |
| Lectura PostgreSQL final | 1 cuenta, rol específico, 2 entregas terminales versión 5, pedido delivered, 2 auditorías |

Vitest 580/580 y build corresponden a la validación anterior; no se repitieron por estos cambios de infraestructura de prueba. No se ejecutó la suite Playwright general ni una regresión SQL: esta intervención valida el caso focalizado 2C-3, sin cambios de lógica productiva ni SQL. No demuestra concurrencia adicional ni autorizaciones negativas. La evidencia histórica 353/353 SQL 2C-2 permanece como antecedente.

### Archivos y Git final

En este desbloqueo se modificaron `frontend/tests/e2e/fixtures/operational.ts`, `frontend/tests/e2e/operational-partial-deliveries.spec.ts` y este informe; se creó `frontend/scripts/run-phase2c3-e2e.mjs`. Los cambios anteriores de React, unitarias y 2C-2 se conservaron.

Rama `main`, HEAD `425d91f93647fdc15f9c1f383dae920a0a7c61c6`, ahead 6 / behind 0 respecto de la referencia local `origin/main`, índice vacío. Sin commit ni push. `.codex/`, `output/` y los archivos pendientes permanecen fuera del índice. Los tres recorridos dejaron sus datos ficticios en el proyecto temporal; no se borraron. No se enviaron operaciones a `backend`.

<details>
<summary>Histórico de implementación y bloqueo anterior (superado)</summary>

## Resultado

Se añadió al recorrido E2E de entregas parciales una ruta explícita para probar la pérdida de respuesta de `record_distribution_delivery_outcome` contra una instancia aislada que tenga instalada la corrección 2C-2. La ruta normal de Fase 2B conserva su comportamiento. El nuevo recorrido requiere `SILSAN_PHASE2C2_E2E=1` y falla antes de iniciar sesión o crear datos si la instancia no cumple las comprobaciones del fixture.

También se corrigió el ciclo de vida de la clave en React. El diálogo inicia el formulario al abrirse o cambiar de entrega, no al refrescar sus líneas o resultados. Si falla una operación, conserva la carga normalizada y la clave para reenviar exactamente el mismo comando. Si el usuario edita el formulario, descarta la carga pendiente y genera una clave nueva.

La implementación y sus pruebas unitarias se mantienen aprobadas, pero el E2E real de esta fase sigue **bloqueado por el control de identidad del entorno**. Se recuperó el proyecto temporal `silsanplexp2c2` con su volumen original y se volvió a verificar la función corregida. El fixture detiene la prueba porque los contenedores DB y Kong no declaran la etiqueta `com.supabase.cli.workdir` que exige `operationalFixture`. La prueba abortó antes del login y antes de cualquier RPC comercial. No se probó contra `backend`.

## Flujo que cubre el E2E

El test reutiliza `operational-partial-deliveries.spec.ts` para evitar duplicar la compra, recepción, reserva, despacho y configuración de las entregas ya existentes.

1. El usuario registra desde React el resultado de la primera entrega.
2. El interceptor usa `route.fetch()` para ejecutar el RPC real. Cuando PostgreSQL responde con éxito y el UUID, aborta únicamente la respuesta que iba al navegador.
3. React deja abierto el diálogo, presenta el error de transporte y conserva formulario y `operationKey`.
4. El usuario vuelve a confirmar sin editar. La segunda petición debe llevar el mismo payload y clave; PostgreSQL debe responder con el mismo UUID. El test comprueba una fila de resultado, una línea y que `lock_version` no vuelva a avanzar.
5. Con esa clave ya confirmada, el test envía solicitudes autenticadas reales con cantidad y evidencia incompatibles. Ambas deben devolver `DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED` y no cambiar filas, líneas, versión ni stock.
6. Para la segunda entrega, el test vuelve a perder la respuesta tras el commit, cambia la evidencia y confirma otra vez. El manejador del diálogo debe haber generado otra clave; PostgreSQL debe rechazar ese comando distinto sobre la entrega ya confirmada y React debe mostrar el error sin cerrar el diálogo ni aparentar éxito.

Las pruebas unitarias del diálogo también simulan que una lectura posterior ya refleja la entrega completa mientras el formulario continúa abierto. Comprueban que el botón permite el replay guardado y que reenvía la misma carga y clave. La prueba de edición comprueba que cambiar primero la evidencia y luego la cantidad genera una clave nueva en cada operación.

El hook entrega al servicio la `operationKey` recibida del diálogo. `registrarResultadoEntrega` valida el resultado y reenvía explícitamente esa misma clave dentro del payload RPC; su valor aleatorio por defecto solo aplica a otros llamadores que omitan el argumento. No fue necesario cambiar el servicio ni el contrato de la RPC.

La llamada conflictiva adicional usa el cliente autenticado ordinario del fixture; no usa `service_role`. Las solicitudes de negocio que producen resultados se ejecutan realmente en PostgreSQL. El único comportamiento simulado es descartar la respuesta HTTP original después de que la RPC real finalizó correctamente.

## Identidad y protección del entorno

Se mantuvo la ruta por defecto de `operationalFixture`, que exige `backend`, `localhost:54321`, PostgreSQL `54322`, el directorio del repositorio y la organización SILSAN esperada. Para la verificación 2C-3 se añadió un destino separado, opt-in y más estricto. Antes de autenticar o crear maestros, valida:

- `SILSAN_PHASE2C2_E2E=1` y URL local por puerto `58121`.
- `project_id` y puertos API/PostgreSQL del `supabase/config.toml` indicado por `E2E_PHASE2C2_WORKDIR`.
- Etiquetas de proyecto y directorio, estado y puertos de los contenedores DB/Kong.
- Volumen `supabase_db_silsanplexp2c2` y su etiqueta de proyecto.
- La definición instalada obtenida mediante `pg_get_functiondef`, incluyendo marcadores de comparación de payload, serialización y restricción idempotente.
- La única organización SILSAN esperada y la membresía activa del usuario autenticado.

La instancia usada fue `C:\Users\ADMIN\AppData\Local\Temp\silsanplex-phase2c2-20261021`, proyecto Docker `silsanplexp2c2`, API `127.0.0.1:58121` y PostgreSQL `127.0.0.1:58122`. Los contenedores tienen la etiqueta de proyecto correcta; PostgreSQL monta el volumen `supabase_db_silsanplexp2c2`, que conserva sus etiquetas de proyecto. La configuración local declara los mismos puertos e ID de proyecto. Después del inicio, DB, Kong y Auth figuraban saludables; Auth y REST devolvieron HTTP 200. Vector quedó en reinicio continuo y no participa en este escenario.

La CLI local del repositorio es 2.115.0. Su inicio normal falló antes de crear contenedores porque la configuración temporal declara `functions.admin-users`, pero no existe `supabase/functions/admin-users/index.ts` en ese directorio; también falló al excluir `edge-runtime`. No se copiaron funciones ni se alteró esa configuración. Se inició el mismo proyecto con la CLI global 2.109.0 que había generado el entorno; el comando terminó correctamente y el log tuvo cero líneas de aplicación de migraciones. La parada normal se hizo sin `--no-backup`: el volumen de base de datos siguió existiendo con el mismo nombre y etiquetas.

`supabase migration list --local` mostró las 148 versiones locales iguales a las aplicadas, hasta `20261021120000`; no había migraciones pendientes. En la base viva, `pg_get_functiondef('public.record_distribution_delivery_outcome(jsonb)')` confirmó la definición corregida con `DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED`, el advisory lock, la restricción de clave idempotente y el bloqueo de versión de entrega. No se reinstaló ni modificó ninguna migración.

Después de recuperar el entorno, las cuentas de Auth y membresías seguían en cero; productos y proveedores también seguían en cero. Ya existía una organización SILSAN y dos eventos de auditoría de preparación del almacén. No se crearon cuentas, credenciales, productos, documentos ni movimientos para este intento. Los valores de acceso usados en el preflight fueron marcadores ficticios solo en el proceso y no se guardaron en archivos. La instancia persistente `backend` continuó activa en `54321/54322`; no se le enviaron solicitudes ni escrituras.

## Archivos modificados

- `frontend/tests/e2e/operational-partial-deliveries.spec.ts`: simulación de respuesta perdida posterior al RPC real, replay inalterado, payloads incompatibles y evidencia editada.
- `frontend/tests/e2e/fixtures/operational.ts`: destino aislado opt-in con validaciones de config, contenedores, volumen y función SQL; el modo existente permanece como predeterminado.
- `frontend/src/modulos/distribucion/componentes/DialogoResultadoEntrega.tsx`: conserva el comando incierto y permite su replay tras refrescos de datos; una edición crea una nueva operación.
- `frontend/src/modulos/distribucion/componentes/DialogoResultadoEntrega.test.tsx`: regresiones unitarias para replay tras refresco y rotación de clave al editar evidencia y cantidad.
- `docs/FASE2C3_REINTENTOS_REACT.md`: este informe.

El único código productivo modificado es el estado local del diálogo de Distribución. No se modificaron migraciones, RLS, permisos ni contratos de la RPC.

## Validaciones

| Validación | Resultado | Alcance |
| --- | --- | --- |
| `npm run test:e2e:typecheck` | PASS | Aprobado durante la implementación y repetido durante esta validación. |
| `npm run lint -- --deny-warnings` | PASS | Oxlint sin warnings; aprobado durante la implementación y repetido ahora. |
| `npm test -- --run src/modulos/distribucion/componentes/DialogoResultadoEntrega.test.tsx` | PASS, 2 pruebas | Cobertura focalizada del componente; callback simulado para validar estado React, sin simular el éxito del backend. |
| `npm test` | PASS, 89 archivos / 580 pruebas | Suite Vitest; no ejecuta operaciones contra Supabase. |
| `npm run build` | PASS | Build de producción. Vite mostró el aviso de un chunk mayor de 500 kB. |
| `supabase migration list --local --workdir <proyecto temporal>` | PASS | 148 migraciones locales y aplicadas coinciden; ninguna pendiente. |
| Inicio del proyecto temporal | PASS | Solo `silsanplexp2c2`; volumen conservado; cero líneas de migración aplicada. `backend` permaneció sin cambios. |
| Verificación de `pg_get_functiondef` | PASS | Función corregida 2C-2 y sus marcadores de identidad/locks presentes en PostgreSQL temporal. |
| `playwright.cmd test tests/e2e/operational-partial-deliveries.spec.ts --grep "divide dos entregas y recupera una respuesta perdida del resultado" --retries=0` | BLOQUEADO, 1 test abortado en preflight | Ejecutado con `SILSAN_PHASE2C2_E2E=1`, `E2E_PHASE2C2_WORKDIR` al directorio temporal y URL `http://127.0.0.1:58121`. Error: `La identidad o los puertos de supabase_db_silsanplexp2c2 no corresponden a SILSAN.` No se observó solicitud de token de Auth ni RPC de negocio. |
| SQL 2C-2 | NO REPETIDA | No se modificó SQL ni backend. La ejecución anterior aislada de 353/353 se conserva como antecedente. |

No se ejecutó `npm run test:e2e:local` ni `test:e2e:prepare`, pues el preparador estándar apunta a la instancia persistente. No se ejecutó Playwright contra `backend`, no se copiaron datos empresariales y no se modificó el estado de Auth o los datos comerciales del proyecto temporal.

## Limitaciones y pasos pendientes

- **Implementado:** manejo de replay pendiente en React, test E2E condicional y verificaciones fail-closed para el destino temporal identificado.
- **Probado:** typecheck E2E, lint, Vitest (incluidas 2 pruebas del diálogo) y build, todos con resultado PASS.
- **Bloqueado:** el fixture exige que los contenedores DB y Kong tengan `com.supabase.cli.workdir` igual al directorio temporal. Esa etiqueta está ausente en ambos, aun cuando se confirmó por separado ID de proyecto, puertos, volumen y base instalada. El test falla cerrado antes de iniciar sesión. No se debe saltar ni falsificar esta comprobación.
- **Pendiente:** proporcionar el proyecto temporal con sus contenedores creados por una CLI compatible que registre la etiqueta de directorio y con cuentas/membresías ficticias exclusivas. La configuración temporal actual también carece de fuentes para las Edge Functions declaradas, por lo que la CLI local 2.115.0 no puede iniciarla. Una vez resueltos ambos requisitos sin cambiar el fixture, repetir el mismo test focalizado. No usar `npm run test:e2e:local`, ya que invoca el preparador de la instancia persistente.

Sin Playwright real no se declara probada la recuperación de respuesta perdida ni el resultado final 2C-3.

## Estado de Git

Se conservaron los seis commits locales existentes, sin commit ni push. El índice permanece vacío. Los cambios de esta fase son locales; `.codex/`, `output/` y los archivos pendientes de 2C-2 se conservaron fuera del índice. La ejecución Playwright generó su archivo de contexto de error bajo `frontend/test-results/`; no se añadió al índice.

</details>
\n
