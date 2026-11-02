# RESULTADO DE IMPLEMENTACIÓN R06-R33 — SILSANPLEX

## A. Resumen ejecutivo

**R06 y R33 están implementados y verificados para las reglas aprobadas.**

Se implementó recepción estructurada, consulta, correcciones previas a la primera
devolución, anulación auditada, devoluciones parciales/totales, saldos derivados,
entrega ordinaria bloqueada por pendientes, excepción independiente autorizada y
regularización posterior sin reabrir la reparación. Cancelación/rechazo conservan
las pertenencias pendientes y permiten su devolución mediante custodia.

Las notas históricas permanecen intactas. No se crean accesorios inferidos ni
devoluciones ficticias. Los accesorios no participan en stock, FEFO o repuestos.

| Validación | Resultado |
|---|---|
| Unitarias del frontend completo | **935 aprobadas, 123 archivos** |
| Reparaciones y su página, incluidas en el total | **186 aprobadas, 20 archivos** |
| SQL general | **113 suites, 3.807 aserciones, PASS** |
| Reparaciones | **23 suites, 994 aserciones, PASS** |
| Permisos generales | **29 aserciones, PASS** |
| E2E de Reparaciones | **16 aprobados: 6 originales + 10 nuevos** |
| Lint frontend | **0 errores, 0 warnings** |
| Lint del esquema migrado | **Sin errores ni warnings** |
| TypeScript frontend, tipos E2E y scripts backend | **PASS** |
| Build frontend | **PASS**, con advertencia de tamaño de chunks existente |
| Migración sobre esquema anterior con datos históricos ficticios | **PASS** |

No quedaron defectos funcionales reproducidos pendientes dentro del alcance.
La rectificación de una devolución ya confirmada queda fuera del flujo ordinario,
conforme a la decisión de no introducir un procedimiento complejo de reversión.
No se desplegó a producción ni se ejecutó GitHub Actions remoto.

## B. Git y archivos

- Rama: `feat/repairs-accessory-control`.
- HEAD base y actual: `69865cc6897894bc1b167b41dec75445c2090362`.
- Remoto: `https://github.com/Diegx2801/silsanplex.git`.
- Se ejecutó `git fetch --all --prune`: `main` y `origin/main` coincidían.
- La rama se creó desde `main` limpia; no había trabajo local ajeno.
- Los cambios permanecen en el árbol de trabajo, sin preparar para commit.
- **No se hizo commit, push, merge, rebase ni Pull Request.**
- `frontend/tests/e2e/repairs.spec.ts` conserva los seis escenarios originales sin
  modificaciones de expectativas ni desactivaciones.
- Ninguna migración histórica fue modificada.

### Archivos existentes modificados

```text
.github/workflows/inventory-e2e.yml
backend/supabase/tests/database/authorization_permissions.test.sql
backend/supabase/tests/database/repair_technical_updates.test.sql
backend/supabase/tests/database/repairs.test.sql
docs/REPARACIONES.md
frontend/package.json
frontend/src/features/auth/permissions.ts
frontend/src/modulos/reparaciones/componentes/DetalleReparacion.test.tsx
frontend/src/modulos/reparaciones/componentes/DetalleReparacion.tsx
frontend/src/modulos/reparaciones/componentes/DialogoReparacion.test.tsx
frontend/src/modulos/reparaciones/componentes/DialogoReparacion.tsx
frontend/src/modulos/reparaciones/modelo/reparacion.ts
frontend/src/modulos/reparaciones/servicios/reparacionesService.ts
frontend/tsconfig.e2e.json
frontend/vitest.config.ts
```

### Archivos nuevos

```text
backend/supabase/migrations/20261029010000_repair_accessory_control.sql
backend/supabase/tests/database/repair_accessories.test.sql
backend/supabase/tests/database/repair_accessories_security.test.sql
backend/supabase/tests/database/repair_accessory_returns.test.sql
backend/supabase/tests/database/repair_z_accessories_concurrency.test.sql
docs/RESULTADO_R06_R33_ACCESORIOS.md
frontend/scripts/test-repair-accessories.mjs
frontend/src/modulos/reparaciones/componentes/AccesoriosReparacion.test.tsx
frontend/src/modulos/reparaciones/componentes/AccesoriosReparacion.tsx
frontend/src/modulos/reparaciones/componentes/DetalleEventoAccesorio.tsx
frontend/src/modulos/reparaciones/componentes/DialogoEntregaAccesorios.test.tsx
frontend/src/modulos/reparaciones/componentes/DialogoEntregaAccesorios.tsx
frontend/src/modulos/reparaciones/componentes/FormularioAccesoriosRecepcion.test.tsx
frontend/src/modulos/reparaciones/componentes/FormularioAccesoriosRecepcion.tsx
frontend/src/modulos/reparaciones/componentes/TablaAccesorios.tsx
frontend/src/modulos/reparaciones/estado/useAccesoriosReparacion.ts
frontend/src/modulos/reparaciones/modelo/accesorios.test.ts
frontend/src/modulos/reparaciones/modelo/accesorios.ts
frontend/src/modulos/reparaciones/servicios/accesoriosService.test.ts
frontend/src/modulos/reparaciones/servicios/accesoriosService.ts
frontend/tests/accessory-e2e/repair-accessories.spec.ts
```

Son 15 archivos existentes modificados y 21 nuevos, incluido este informe.

## C. Base de datos

### Migración

`20261029010000_repair_accessory_control.sql`, aditiva. El historial pasa de 167
a 168 migraciones.

### Entidades e integridad

- `repair_accessories`: identidad estable, organización/reparación, nombre,
  cantidad entera recibida, condición, observaciones, actor/nombre/fecha de
  registro, actualización y anulación lógica con motivo.
- `repair_accessory_returns`: devoluciones físicas append-only, accesorio,
  organización/reparación, cantidad, actor/nombre, fecha, observación y operación.
- `repairs.accessories_reviewed_at`: nullable; distingue datos históricos sin
  revisión estructurada de una recepción revisada, incluso vacía.
- Cantidades entre 1 y 1.000.000; nombre no vacío de hasta 160 caracteres;
  condición hasta 500 y observaciones/motivos hasta 2.000.
- FK compuesta de accesorio a reparación y de devolución a accesorio, incluyendo
  organización y reparación. No se pueden mezclar IDs de órdenes/empresas.
- Índices por organización, reparación, accesorio y orden temporal.
- Unicidad de operación/accesorio en devoluciones, además del ledger del comando.
- Saldos calculados desde la suma de devoluciones; no hay saldo editable paralelo.
- La suma se valida transaccionalmente bajo el bloqueo de la reparación.
- No hay eliminación física ordinaria de accesorios ni de devoluciones.

### RLS y permisos

Ambas tablas tienen RLS de lectura mediante sesión activa y `REPAIRS_VIEW`.
Las escrituras directas están revocadas, incluido `service_role`; se utilizan RPC.

Nuevo permiso: **`REPAIRS_AUTHORIZE_ACCESSORY_EXCEPTION`**. Se concede inicialmente
solo a `ADMIN`; `is_directly_assignable=false` impide incorporarlo silenciosamente
a la selección de capacidades operativas. Ventas, Almacén y Técnico no reciben
este permiso. La autorización usa permisos efectivos.

### Auditoría

Eventos: `ACCESSORY_RECEIVED`, `ACCESSORY_UPDATED`, `ACCESSORY_VOIDED`,
`ACCESSORY_RETURNED`, `ACCESSORY_DELIVERY_EXCEPTION`. Se reutiliza
`record_repair_event` para escribir evento y auditoría enlazados, con actor real,
fecha del servidor, IDs, operación, cantidades, valores anteriores/nuevos y
motivo/snapshot de pendientes cuando corresponde. Los eventos y devoluciones no
son editables libremente.

## D. RPC y reglas

| Contrato | Implementación |
|---|---|
| `create_repair(jsonb)` | Mantiene firma y replay; acepta colección opcional, en la misma transacción |
| `update_repair(jsonb)` | Conserva payload anterior; la colección nueva exige operación idempotente |
| `save_repair_accessories(jsonb)` | Patch explícito: alta, corrección por ID o anulación con motivo |
| `record_repair_accessory_return(jsonb)` | Devolución parcial/total con saldo, permisos, versión y replay |
| `deliver_repair_with_accessories(jsonb)` | Devoluciones y entrega atómicas, ordinaria o excepcional |
| `deliver_repair(uuid,uuid,text,bigint)` | Firma conservada y pendientes protegidos; no permite omitir política |
| `get_repair_accessories(uuid,uuid)` | Lectura de revisión, versión, accesorios, saldos e historial de devoluciones |

Se reutilizan las implementaciones técnicas existentes mediante helpers privados.
Los helpers anteriores y nuevos están revocados como superficie pública.

### Entrega

- Sin pendientes: se aplican los gates técnicos canónicos actuales.
- Con pendientes: la entrega ordinaria se rechaza en PostgreSQL.
- Excepción: exige usuario autenticado activo, ambos permisos y motivo no vacío.
- La excepción guarda una lista explícita de pendientes y no crea devoluciones.
- Después de entregar excepcionalmente se puede devolver el saldo sin cambiar
  `delivered`, `delivered_at` ni generar otra entrega.
- Canceladas y rechazadas admiten devoluciones de custodia sin reabrirse ni usar
  `deliver_repair`. Las revisiones de cotización conservan su contrato.
- El gate compartido de preparación técnica no fue modificado: tener accesorios
  pendientes no impide por sí mismo marcar la orden lista para entrega.

### Concurrencia e idempotencia

Los comandos bloquean el agregado mediante `lock_repair_version`; un escritor
obsoleto falla sin sobrescribir datos. Una operación con varias devoluciones y
entrega avanza la versión una sola vez.

Se usa el ledger existente por organización/operación. El replay con igual payload
devuelve el resultado confirmado; una clave reutilizada con otros datos falla.
La autorización se revisa antes del replay, incluida la revocación del permiso
especial. La intención cliente se guarda antes del RPC y conserva versión y clave
tras una respuesta ambigua.

Los nuevos comandos de custodia requieren sesión de usuario y no aceptan actor
delegado por `service_role`. Los contratos históricos sin accesorios mantienen su
comportamiento anterior.

## E. Frontend

- Recepción: filas adicionales en el apartado actual, con altas, retirada previa
  al guardado, validación por fila y campos opcionales separados de notas.
- Detalle: recibidos, devueltos, pendientes, condición, observaciones, responsable
  y fechas de cada devolución.
- Corrección/anulación: acciones autorizadas en estados no terminales y antes de
  la primera devolución. Se conservan filas e historial.
- Devolución: formulario con saldo, cantidad entera, observación, conflictos y
  recuperación de intención pendiente.
- Entrega: listado de pendientes, devoluciones simultáneas, explicación de bloqueo
  y acción específica de excepción solo con permiso efectivo.
- Excepción: motivo obligatorio y confirmación explícita; no simula devoluciones.
- Regularización: disponible después de entregar excepcionalmente o de cancelar/
  rechazar el servicio, conservando el estado de la reparación.
- Recuperación de entrega: accesible incluso si la respuesta se perdió después
  de que PostgreSQL dejara la orden entregada.
- Historial: nombres de eventos, actor, cambios antes/después, cantidades y
  snapshot/motivo de excepción comprensibles.
- Lecturas fallidas no se presentan como ausencia de accesorios.
- Las creaciones antiguas pendientes mantienen la omisión de la colección; una
  prueba específica comprueba que el formulario no agrega `[]` al fingerprint.

## F. Pruebas unitarias

Todas las filas siguientes están aprobadas. Rutas relativas a
`frontend/src/modulos/reparaciones/`, salvo la página.

| Archivo | Pruebas | Resultado | Errores pendientes |
|---|---:|---|---|
| `componentes/AccesoriosReparacion.test.tsx` | 10 | PASS | Ninguno |
| `componentes/AdjuntosReparacion.test.tsx` | 5 | PASS | Ninguno |
| `componentes/AtencionComplementariaReparacion.test.tsx` | 6 | PASS | Ninguno |
| `componentes/DetalleReparacion.test.tsx` | 22 | PASS | Ninguno |
| `componentes/DialogoConsumoParte.test.tsx` | 3 | PASS | Ninguno |
| `componentes/DialogoEntregaAccesorios.test.tsx` | 10 | PASS | Ninguno |
| `componentes/DialogoReparacion.test.tsx` | 13 | PASS | Ninguno |
| `componentes/DialogosIdempotencia.test.tsx` | 9 | PASS | Ninguno |
| `componentes/DialogosRecepcionSimplificada.test.tsx` | 4 | PASS | Ninguno |
| `componentes/FormularioAccesoriosRecepcion.test.tsx` | 8 | PASS | Ninguno |
| `componentes/ResultadosPruebas.test.tsx` | 3 | PASS | Ninguno |
| `componentes/SelectorCatalogoReparacion.test.tsx` | 3 | PASS | Ninguno |
| `estado/creacionPendiente.test.ts` | 14 | PASS | Ninguno |
| `modelo/accesorios.test.ts` | 13 | PASS | Ninguno |
| `modelo/reparacion.test.ts` | 9 | PASS | Ninguno |
| `servicios/accesoriosService.test.ts` | 12 | PASS | Ninguno |
| `servicios/adjuntosReparacionService.test.ts` | 6 | PASS | Ninguno |
| `servicios/atencionComplementariaService.test.ts` | 8 | PASS | Ninguno |
| `servicios/reparacionesService.test.ts` | 22 | PASS | Ninguno |
| `frontend/src/app/paginas/ReparacionesPage.test.tsx` | 6 | PASS | Ninguno |
| **Subtotal Reparaciones** | **186** | **PASS** | **Ninguno** |
| Otros archivos frontend (103) | 749 | PASS | Ningún test fallido |
| **Total frontend (123 archivos)** | **935** | **PASS** | **0 fallidos** |

Las 132 pruebas de la línea base se conservan. Se añadieron 54: 53 en cinco archivos
nuevos y una regresión de fingerprint en el formulario existente.

## G. Pruebas SQL

Resultados de PostgreSQL real/pgTAP, con planes TAP comprobados y salida detallada
conservada. Todos los casos de esta tabla tienen resultado PASS y cero errores.

| Suite | Aserciones | Resultado | Cobertura |
|---|---:|---|---|
| `repair_accessories.test.sql` | 46 | PASS | Recepción, rollback, corrección, anulación, update/replay y notas |
| `repair_accessories_security.test.sql` | 26 | PASS | RLS, dos empresas, IDs cruzados, sesión y permisos independientes |
| `repair_accessory_returns.test.sql` | 57 | PASS | Parciales/totales, entrega, excepción, revocación, cancelación/rechazo e inventario |
| `repair_z_accessories_concurrency.test.sql` | 44 | PASS | Siete carreras reales, dos usuarios/conexiones y replay |
| `repair_attachments.test.sql` | 23 | PASS | Adjuntos e identidad |
| `repair_available_stock.test.sql` | 42 | PASS | Stock permitido de repuestos |
| `repair_command_idempotency.test.sql` | 36 | PASS | Ledger, claves e inmutabilidad |
| `repair_identity_lock.test.sql` | 76 | PASS | Identidad e historial |
| `repair_identity_lock_concurrency.test.sql` | 25 | PASS | Carrera de identidad e historial |
| `repair_inventory_reservations.test.sql` | 48 | PASS | Reservas y consumos |
| `repair_optimistic_concurrency.test.sql` | 34 | PASS | Versión esperada |
| `repair_optimistic_concurrency_concurrency.test.sql` | 11 | PASS | Escritores simultáneos |
| `repair_quote_actor_contract.test.sql` | 22 | PASS | Actor de decisión de cotización |
| `repair_quote_minimum_sale_price.test.sql` | 15 | PASS | Precios mínimos |
| `repair_quote_version_concurrency.test.sql` | 19 | PASS | Revisiones concurrentes |
| `repair_requester_equipment.test.sql` | 39 | PASS | Recepción interna/externa y compatibilidad |
| `repair_service_warranty.test.sql` | 47 | PASS | Custodia externa y garantía |
| `repair_technical_capability.test.sql` | 32 | PASS | Capacidad técnica |
| `repair_technical_updates.test.sql` | 93 | PASS | Edición administrativa/técnica, auditoría y permisos |
| `repair_technician_role.test.sql` | 22 | PASS | Rol técnico |
| `repair_test_cycle_concurrency.test.sql` | 10 | PASS | Prueba frente a preparación de entrega |
| `repair_test_cycles.test.sql` | 66 | PASS | Ciclos y gates vigentes |
| `repairs.test.sql` | 161 | PASS | Contratos y flujo general |
| **Subtotal Reparaciones (23 suites)** | **994** | **PASS** | **821 anteriores + 173 nuevas** |
| `authorization_permissions.test.sql` | 29 | PASS | Matriz efectiva de permisos |
| Otras 89 suites del backend | 2.784 | PASS | Inventario, compras, ventas, distribución, usuarios y maestros |
| **Total (113 suites)** | **3.807** | **PASS** | **Regresión general** |

Tres expectativas anteriores de permisos fueron ampliadas de forma explícita:
las listas ADMIN incorporan la nueva capacidad y el total REPAIRS pasa de 9 a 10.
Se mantienen las comprobaciones exactas de Ventas/Almacén/Técnico; no se debilitaron.

La prueba de inventario usa stock físico no vacío (9 unidades), reserva activa
(3 unidades) y un consumo real de repuesto ya confirmado. Después de registrar y
devolver accesorios compara snapshots completos de stock, reservas, movimientos y
consumos: permanecen idénticos.

La actualización incremental aplicó la migración nueva sobre las 167 anteriores,
con cuatro órdenes históricas ficticias en estados received/delivered/cancelled/
rejected. Sus valores anteriores permanecieron idénticos y no se infirieron filas.
Sobre ese esquema también pasaron 24 suites focalizadas con 1.023 aserciones.

## H. Pruebas E2E reales

Todas se ejecutaron con React, Chromium, Supabase Auth, PostgREST y PostgreSQL
reales. Los seis casos anteriores no fueron modificados. No hay errores pendientes
en estos 16 escenarios.

| Escenario | Resultado | Evidencia / datos comprobados en PostgreSQL |
|---|---|---|
| Nuevo: recepción múltiple y corrección | PASS | Cable ×1, Sensor ×2, Estuche ×1; recarga, mismo ID corregido y evento antes/después |
| Nuevo: sin accesorios | PASS | Lista vacía y entrega tradicional confirmada |
| Nuevo: parcial y completa | PASS | Sensor 2/1/1 y luego 2/2/0; corrección posterior bloqueada |
| Nuevo: bloqueo de entrega | PASS | UI y RPC antigua rechazan pendientes; devolución+entrega atómicas y versión +1 |
| Nuevo: excepción y regularización | PASS | Delivered con 4 unidades pendientes, actor/motivo/evento/auditoría y posterior saldo cero |
| Nuevo: sin permiso especial | PASS | Usuario real con entrega ordinaria no ve excepción y RPC responde 42501 |
| Nuevo: histórico y multiempresa | PASS | Notas intactas, ninguna fila inferida; otro tenant no lee un accesorio estructurado existente |
| Nuevo: dos sesiones/usuarios | PASS | Primera devolución confirma; segunda obsoleta falla sin perder ni duplicar cantidades |
| Nuevo: respuesta perdida de devolución | PASS | Recarga, payload y clave idénticos, una sola devolución persistida |
| Nuevo: respuesta perdida de excepción | PASS | Recuperación estando delivered; motivo/payload originales y un solo evento DELIVERED |
| Original: flujo completo | PASS | Creación, diagnóstico, cotización, reserva, consumo, retrabajo, pruebas y entrega |
| Original: catálogos >1.000 | PASS | Selección remota, referencia histórica inactiva y repuestos |
| Original: creación/reapertura | PASS | Misma operación tras respuesta perdida |
| Original: creación/recarga | PASS | Misma operación e ID tras recarga |
| Original: dos pestañas | PASS | Versión obsoleta rechazada |
| Original: rechazo/revisión | PASS | Historial y una sola cotización vigente |

Las respuestas perdidas se simulan **después** de que el servidor real confirme el
comando. No se mockea un éxito de persistencia. Los asserts posteriores consultan
las tablas/RPC reales.

## I. Regresiones y alcance de las afirmaciones

- **132 unitarias anteriores:** conservadas y aprobadas; subtotal actual 186.
- **19 suites SQL anteriores / 821 aserciones:** conservadas y aprobadas.
- **6 E2E anteriores:** aprobados y su archivo no fue modificado.
- **Inventario:** snapshots no vacíos idénticos antes/después de custodia; además
  pasa su regresión SQL y unitaria general.
- **Creación/entrega:** contratos anteriores y nuevos aprobados por SQL y E2E.
- **Adjuntos/garantía:** pasan sus suites SQL y unitarias; no se modificó su código.
- **Custodia externa:** pasa la suite SQL vigente; se reutilizan sus guards.
- **Permisos:** pasan tanto la suite general como los casos negativos nuevos.
- **Históricos:** comparación de datos previos/posteriores y E2E de notas sin
  accesorios inferidos.
- No hubo nuevos commits remotos desde el HEAD auditado: el incremento de pruebas
  corresponde a esta implementación, no a cambios de compañeros.

No se afirma una nueva validación de navegador de todos los demás módulos: se
ejecutaron sus unitarias y SQL, pero el conjunto de navegador focalizado fue
Reparaciones. Tampoco se ejecutó la suite Deno de Edge Functions porque Deno no
está instalado en este entorno; no se modificaron Edge Functions.

## J. Evidencias y reproducción

Raíz local:

`C:\Users\USUARIO\AppData\Local\Temp\opencode`

| Ejecución | Directorio bajo esa raíz | Evidencias |
|---|---|---|
| Frontend final + 16 E2E | `silsan-accessories-JJbwDt\evidence` | `unit-results.json`, `unit-tests.log`, `e2e-results.json`, `e2e.log`, `lint.log`, `typecheck.log`, `build.log`, `test-e2e-typecheck.log`, `backend-typecheck.log`, `summary.json` |
| SQL general de 113 suites | `silsan-accessories-oe8zl7\evidence` | `sql-tests.json`, `sql-tests.log`, `sql-lint.log`, `migration-manifest.json`, `migrations-start.log` |
| Actualización incremental | `silsan-accessories-Owb2xD\evidence` | `historical-upgrade.json`, `migrations-upgrade.log`, `sql-tests.json`, `sql-tests.log`, `sql-lint.log` |

La ejecución SQL general indicada aprobó las 3.807 aserciones. En su fase posterior
de tipos encontró una opción `exact` incorrecta en una prueba nueva de Testing
Library; se corrigió y las validaciones completas de frontend posteriores,
incluida JJbwDt, finalizaron correctamente. No se presenta ese error intermedio
como un fallo SQL.

Cada ejecución conserva `git-status.txt`, `git-diff-stat.txt` y, cuando corresponde,
`cleanup.log`. Los archivos de tipos pueden estar vacíos cuando tsc finaliza con
código 0. Las claves locales del log de inicio se redactan.

En JJbwDt también se conserva la revisión final, posterior a escribir este
informe: `git-diff-check.log`, `git-tracked.diff` y `diff-summary.json`. Este último
incluye los archivos nuevos que no aparecen en el diff estadístico ordinario,
con tamaño, número de líneas y SHA-256. El estado final es 15 modificados,
21 nuevos y ninguno preparado para commit.

Capturas finales:

```text
silsan-accessories-JJbwDt/evidence/playwright/
  accessory-e2e-repair-acces-fa980-ección-persistente-auditada-chromium/reception-correction.png
  accessory-e2e-repair-acces-7d3a6--regularización-sin-reabrir-chromium/exception-regularization-history.png
```

Comandos de reproducción desde `frontend/`:

```text
npm run test:repairs:isolated
npm run test:repairs:isolated -- --sql-only --upgrade
npm run test:repairs:isolated -- --sql-only --all-sql
npm run test:repairs:isolated -- --checks-only
```

El runner no lee archivos empresariales de entorno. Crea un proyecto/volumen
exclusivos y usa API 59321, PostgreSQL 59322 y web 59325. El hostname esperado por
las carreras anteriores se asocia solo al PostgreSQL desechable. Se conservan los
logs y se eliminan exclusivamente los recursos propios verificados. No se usó
`db:reset` ni se detuvieron bases preexistentes.

El workflow incorpora la suite aislada nueva y sus artefactos. Esta modificación
está revisada localmente, pero GitHub Actions/Linux no se ejecutó desde esta sesión.

## K. Problemas, riesgos y casos no verificados

### Encontrados y corregidos

- Conservación de la omisión de accesorios en creaciones antiguas pendientes.
- Recuperación de entrega tras un commit confirmado que ya dejó la orden cerrada.
- Clasificación de códigos REPAIR desconocidos como rechazos definitivos, evitando
  tratarlos erróneamente como commits ambiguos.
- Configuración temporal de TypeScript y fuentes de Vite en la copia aislada.
- Portabilidad de fixtures SQL: se hicieron autocontenidos porque el transporte
  de Supabase CLI no incluía el asset auxiliar.
- Lint del esquema ejecutado antes de instalar pgTAP, para no confundir rutinas
  internas de la herramienta de pruebas con funciones de la aplicación.
- Opción de Testing Library incompatible con sus tipos, corregida y revalidada.
- Expectativas exactas de permisos anteriores ampliadas para la capacidad nueva.

### Encontrados y no corregidos por pertenecer a otro alcance

- Warning de Vite por chunks >500 kB, también observado antes de terminar este
  cambio. El build finaliza correctamente.
- Dos mensajes del mock de consultas en `useCompras.test.tsx` sobre datos undefined;
  esa suite sigue aprobada. No se modificó Compras.

### Riesgos no reproducidos / límites de verificación

No se reprodujeron dobles devoluciones, saldos negativos ni sobrescrituras en las
carreras y reintentos cubiertos. No se hizo un ensayo de carga masiva, una prueba
de todos los navegadores ni una certificación integral de accesibilidad.

No se ejecutaron Edge Functions con Deno, GitHub Actions remoto ni despliegues.
Las pruebas locales no certifican que otro entorno tenga aplicada la migración.

### Límites funcionales deliberados

- Cantidades enteras y límites indicados en C.
- Corrección/anulación ordinaria solo antes de devolver y en órdenes no terminales.
- Las devoluciones confirmadas no se borran ni se sobrescriben. Una rectificación
  posterior necesita una decisión funcional adicional.
- Recuperación persistente limitada a la pestaña y sus recargas, según el patrón
  existente de sessionStorage; no cubre borrar almacenamiento o cerrar la pestaña.

## L. Dictamen final

**¿R06 y R33 están implementados y funcionan?** Sí, para las reglas expresamente
aprobadas, con persistencia, política de excepción, regularización y trazabilidad
comprobadas en el software real.

**¿Las pruebas SQL, unitarias y E2E están aprobadas?** Sí: 3.807 aserciones SQL,
935 unitarias y los 16 E2E descritos. También pasan lint, tipos y build. El alcance
no ejecutado está identificado en I y K.

**¿Es seguro preparar el commit y push para revisión?** El cambio está listo para
revisión técnica y posterior autorización explícita. Esta conclusión no autoriza
publicación ni despliegue y no sustituye CI sobre un commit futuro.

**No se realizó commit ni push. La implementación queda detenida para revisión.**
