# Validación SQL y E2E de SILSANPLEX — 21 de octubre de 2026

## Instancia y restricciones

Se trabajó únicamente sobre Supabase local de SILSAN, identificado por:

- Contenedor PostgreSQL: `supabase_db_backend`.
- Etiqueta Docker `com.supabase.cli.workdir`:
  `C:\Diego\sistemas\VS CODE\silsanplex\backend`.
- Volumen: `supabase_db_backend`.
- Organización confirmada: `Droguería SILSAN S.A.C.`.
- PostgreSQL 17.6, base `postgres`, puerto local 54322.
- API local en `http://127.0.0.1:54321`.

No se ejecutaron resets, eliminaciones de volúmenes, operaciones sobre bases
ajenas, commits ni push. Las pruebas crean sus fixtures; las suites de
concurrencia usan conexiones independientes y limpian sus datos de prueba.
El aprovisionamiento E2E prepara usuarios y registros de desarrollo de SILSAN.

## Migraciones

Se ejecutó `npm run db:migrate -- --local`, que no encontró migraciones
pendientes. Después se comparó el conjunto completo de versiones de los
archivos con `supabase_migrations.schema_migrations`:

| Comprobación | Resultado |
| --- | --- |
| Archivos de migración | 147 |
| Versiones aplicadas | 147 |
| Archivos pendientes de aplicar | 0 |
| Versiones aplicadas sin archivo local | 0 |
| Última versión | `20260929154604` |
| `npm run db:lint` | Aprobado; sin errores de esquema |

No se volvieron a ejecutar migraciones ya registradas ni se reconstruyó la base.
Esta validación confirma el estado de la instancia conservada; no sustituye un
ensayo de instalación desde cero en una base vacía independiente.

## SQL: resultado final

`supabase test db --local`: **95 archivos, 3.181 pruebas, resultado PASS**
(40 segundos en esta ejecución). Los 95 archivos del directorio de pruebas
aparecen aprobados en el registro final.

### Correcciones de fixtures

La ejecución inicial terminó con FAIL: seis aserciones en Kardex y una
interrupción de la suite de cotizaciones por `SALES_QUOTE_EXPIRED`.

- `inventory_kardex_determinism.test.sql`: los tres lotes del escenario ahora
  vencen a 30, 60 y 90 días de la ejecución. Antes, el primer lote vencía el
  15 de octubre de 2026, por lo que FEFO lo excluía correctamente.
- `sales_quotes_persistence.test.sql`: fechas relativas y calendario
  `America/Lima`, conservando la vigencia de 14 días. Se añadieron dos aserciones
  para guardar un borrador histórico vencido e impedir su emisión.

La prueba específica de exclusión de lotes vencidos permanece en
`inventory_fefo_core.test.sql`. No se cambiaron migraciones, funciones
productivas, políticas RLS ni reglas de negocio para hacer pasar las pruebas.

Primero pasaron los dos archivos corregidos (53 aserciones) y después se ejecutó
de nuevo la suite completa. La diferencia de aserciones respecto de la ejecución
inicial también refleja que la suite de cotizaciones ya no termina antes de tiempo.

## Concurrencia

Las **21 suites que usan `dblink_send_query` pasaron** dentro de la ejecución
completa. Se revisaron conexiones asíncronas, barreras mediante bloqueos y
aserciones de resultados en los escenarios existentes. Cubren:

- Inventario por bucket y cambios concurrentes de maestros.
- Reservas y modificaciones de pedidos; despachos que compiten por existencias.
- Importación de productos, cambio a servicio y precios mínimos.
- Recepciones, inspección e idempotencia de compras.
- Devoluciones a proveedores e idempotencia con operaciones simultáneas.
- Reparaciones: identidad, versiones optimistas, cotizaciones y pruebas técnicas.
- Numeración de pedidos y cumplimiento de servicios puros o mixtos.
- Asignación de movimientos a entregas de distribución.

Entre las aserciones revisadas están que ambos despachos alcancen una barrera,
que la carrera no duplique movimientos, que una devolución conjunta de 10+1
no exceda lo recibido y que líneas independientes puedan completarse.

Estos son escenarios funcionales de concurrencia, no una prueba de carga o una
garantía sobre todas las intercalaciones posibles en producción.

## Aislamiento por organización

La consulta de metadatos encontró **60 tablas públicas con `organization_id`
y RLS habilitado en las 60**. No encontró tablas de ese conjunto sin RLS.
Esto se complementó con pruebas bajo rol `authenticated` y distintas identidades;
tener RLS habilitado por sí solo no demostraría aislamiento.

Pasaron, entre otras, las suites de autorización, permisos directos, modelos de
lectura de inventario, autorización de ventas/distribución, cotizaciones,
clientes, usuarios, productos, compras, entregas y reparaciones. Los casos
revisados incluyen:

- Invisibilidad de buckets y cotizaciones de otra organización.
- Rechazo de consultas RPC con un `organization_id` ajeno.
- Permisos directos que no se propagan entre organizaciones.
- Usuarios de consulta que no pueden ejecutar escrituras o despachos.
- Referencias comerciales entre organizaciones y acceso sin permisos.

La evidencia corresponde a las políticas y rutas cubiertas por las pruebas
actuales; no constituye una auditoría exhaustiva de seguridad.

## E2E

`npm run test:e2e:typecheck`: aprobado.

`npm run test:e2e:local`: **23 aprobadas, 0 fallidas y 0 omitidas**, usando
Chromium y un trabajador, con aprovisionamiento local completado (1,1 minutos).
La ejecución se inició después de finalizar la suite SQL para evitar interferencia
entre sus fixtures.

| Área | Casos aprobados |
| --- | --- |
| Autenticación, sesiones y permisos de usuarios | 9 |
| Clientes e importación | 6 |
| FEFO multilote, Kardex y valoración | 1 |
| Reparaciones, reintentos, respuesta perdida y dos pestañas | 6 |
| Selección y validaciones del formulario de cotización | 1 |

Se ejecutaron todas las E2E existentes. Su cobertura no equivale a un recorrido
completo de compra → venta → distribución: por ejemplo, la E2E de ventas actual
se concentra en el formulario de cotización. Tampoco certifica proveedores
externos reales que los escenarios sustituyen por respuestas controladas.

Después de las pruebas se confirmó que sigue existiendo únicamente la
organización SILSAN y que no quedan esquemas cuyo nombre coincida con los
esquemas auxiliares de concurrencia consultados. Las 147 migraciones permanecen
registradas y los contenedores de los otros proyectos continúan detenidos.
`git diff --check` pasó y HEAD sigue en `df41d90`.

## Evidencias locales

Los registros están en `output/`:

- `sql-suite-baseline-2026-10-21.log`: fallos iniciales.
- `sql-fixtures-focused-2026-10-21.log`: validación de fixtures corregidos.
- `sql-suite-final-2026-10-21.log`: suite completa aprobada.
- `db-lint-2026-10-21.log`: comprobación del esquema.
- `e2e-typecheck-2026-10-21.log`: comprobación de tipos E2E.
- `e2e-final-2026-10-21.log`: ejecución final de navegador.

Los cambios quedan locales y sin commit, según la instrucción del usuario.
