# D06 — Calendario Lima de reservas, FEFO y consumo de Reparaciones

Base: `de313af054d08182f972afab750fe0af944620ba`, que integra D01 mediante PR #83.

## Defecto reproducido

Para `2026-11-07T00:30:00Z`, Lima todavía está en el día 6. Antes de D06,
bajo una sesión UTC, un lote con vencimiento `2026-11-06`:

- conservaba su stock físico y reservas, pero aparecía como vencido/no asignable;
- desaparecía de candidatos FEFO, permitiendo seleccionar el lote del día 7;
- rechazaba tanto una reserva nueva como el consumo de una reserva existente;
- y un consumo permitido de otro lote persistía `operation_date=2026-11-07`,
  aunque `consumed_at` correspondía al día 6 en Lima.

La contraprueba inversa, con el instante `2026-11-07T05:30:00Z` y sesión en
Honolulu, permitía consumir el lote del día 6 aunque ya fuera día 7 en Lima.
Se comprobaron RPC reales, no solo la diferencia entre dos expresiones DATE.

## Semántica temporal

La fecha de vencimiento es una **fecha civil**: el lote es válido durante todo
su último día en Lima. Se conservan `expiration_date >= business_date` para
elegibilidad y `< business_date` para vencimiento. NULL conserva las reglas del
producto: no se introduce un vencimiento ni se relaja el control obligatorio.

La fecha comercial se obtiene de:

```sql
(pg_catalog.transaction_timestamp() AT TIME ZONE 'America/Lima')::date
```

Se conserva el ancla original de transacción de `CURRENT_DATE`/`now()`.
`consumed_at`, `inventory_movements.created_at` y la auditoría siguen siendo
instantes absolutos del servidor. No se convierten ni reescriben timestamps.

Esperar un bloqueo no transforma la transacción en una operación de otro día:
la fecha comercial y los timestamps siguen referidos a su inicio, no al commit.
Una RPC nueva tiene su propio inicio; un replay confirmado recupera la identidad,
fecha y costo originales sin evaluar otra vez la vigencia actual del lote.

No hay fecha arbitraria enviada por el frontend ni GUC de reloj en producción.
La sesión del cliente puede usar UTC, Honolulu o Kiritimati sin cambiar el
resultado para el mismo instante. No se cambia globalmente TimeZone.

## Migración y alcance

`20261107010000_repair_consumption_lima_calendar.sql` reemplaza únicamente las
lecturas `CURRENT_DATE` de cuatro funciones efectivas:

- `reserve_repair_part_unchecked(jsonb)`.
- `consume_repair_part_unchecked(jsonb)`.
- `inventory_bucket_state(uuid,uuid,uuid,uuid,text,text,date)`.
- `assert_inventory_fefo_bucket(uuid,uuid,uuid,date)`.

Y de las proyecciones compartidas:

- `inventory_bucket_availability`.
- `inventory_fefo_candidates`.
- `inventory_expiration_alerts`.

Las dos primeras son necesarias para que selector, planificación y validación de
reserva no sigan ocultando el lote válido. La tercera deriva del mismo bucket y
es consumida por `almacenService.ts`: sus días/rango deben concordar con el
`expiration_state` corregido, evitando mostrar "-1 día" para un lote aún válido.
No se añade un reporte ni una funcionalidad R40.

La migración usa las definiciones efectivas y comprueba el número esperado de
lecturas de fecha antes de reemplazarlas; un contrato inesperado detiene la
actualización. Conserva owner, ACL, firmas/defaults/resultados, volatilidad y
configuración de funciones; las vistas mantienen `security_invoker` y ACL.
El deparse de vistas usa un search_path local vacío para cualificar relaciones.

No añade grants ni helpers públicos. Se usa una expresión explícita en las
vistas para no conceder EXECUTE sobre el helper privado `fecha_negocio_peru()`.
La expresión comparte con ese helper el instante de transacción y Lima.

## Integridad y otros consumidores

- No se altera la aritmética física, los locks, FEFO, reservas o validadores de
  cantidad. Consumir una reserva no vuelve a seleccionar otra posición.
- No se cambian costos unitarios, monedas, documentos de compra o valoraciones.
- R14 conserva evidencia, procedencia y revisiones; una moneda no acreditada
  continúa desconocida hasta su verificación documental explícita.
- El Kardex conserva movimientos y secuencias anteriores; solo los nuevos
  consumos usan la fecha comercial corregida.
- Las funciones de Compras/Ventas/Distribución no se reescriben. Las elegibilidades
  que usan las vistas compartidas reciben la misma regla local de vencimiento.
- No se modifican D01, R13, R28, accesorios, garantías ni sus eventos.
- Transferencias, reclasificaciones, fallbacks de fecha declarada de movimientos
  manuales y la vista legacy `inventory_alerts` tienen lecturas de calendario
  independientes. No se corrigen automáticamente en D06; requieren un alcance
  separado. No se cambian sus fechas de movimiento por esta migración.

No hay backfill. Se conservan incluso fechas históricas que se hubieran
registrado con el calendario anterior. La disponibilidad derivada del último
día se corrige, sin modificar existencias físicas, reservas ni ledger al migrar.

## Regresiones permanentes

`repair_consumption_lima_calendar.test.sql` prueba seis instantes, incluyendo
antes/después de medianoche UTC, las 00:30 UTC y antes/después de medianoche Lima,
en UTC, Honolulu y Kiritimati. Invoca las firmas públicas bajo authenticated:
disponibilidad, alertas, FEFO, reservas nuevas/existentes, consumos parciales,
movimiento y fecha, timestamp absoluto, auditoría/versionado, replay días después,
conflicto de clave, atomicidad, exceso de cantidad, permisos, tenant y R14.

La prueba incluye fixtures `.sql.fixture` que instrumentan **solo las lecturas
de reloj de esos objetos y defaults de evidencia**, dentro de BEGIN/ROLLBACK.
El mismo instante emula CURRENT_DATE conforme al timezone del llamador y permite
que las expresiones explícitas de Lima conserven su zona. No se cambian las
validaciones, cantidades, seguridad o firmas. No se usa SET TIME ZONE Lima para
hacer pasar los casos. No es una simulación de todo el reloj de PostgreSQL/Auth:
complementa las pruebas reales y se revierte al terminar.

`repair_consumption_lima_calendar_concurrency.test.sql` usa conexiones dblink
solapadas, UTC/Kiritimati y la RPC pública autenticada. Comprueba replay, conflicto
optimista, un movimiento/evento/auditoría, costo exacto y coherencia entre DATE y
el timestamptz persistido. Solo su teardown elimina fixtures propios y restaura
todos los triggers, después de las aserciones, siguiendo el patrón existente.

## Validación aislada

Desde frontend, con dependencias y Docker:

```text
npm run test:repairs:isolated -- --all-sql --workflow-e2e
npm run test:repairs:isolated -- --checks-only --edge-checks
```

La actualización se comprueba además reconstruyendo el esquema publicado,
preparando compras/consumos y una revisión R14 confirmada en USD, y aplicando
solo D06. Se comparan literalmente datos y metadatos/grants. Un consumo posterior
sin instrumentación verifica la fecha contra `consumed_at` en Lima.

Evidencia local fuera de Git: `%TEMP%/opencode/silsanplex-d06-20261107/`.
No se utilizan bases empresariales ni se publica el cambio en este bloque.

## Resultados locales del bloque

- SQL final completo: **124 suites / 5.176 aserciones**; D06 aporta 486 de
  calendario/integridad y 24 de concurrencia real.
- Frontend: **1.103 pruebas / 136 archivos**, sin fallos.
- E2E/integración: **70 correctos**, incluidos workflow operativo, accesorios,
  R28, R13, R14 y las dos regresiones HTTP D01; sin omitidos ni flaky.
- Edge relacionadas: **25 pruebas** y checks correctos.
- Lint SQL/frontend, tipos frontend/E2E/scripts backend y build correctos.
  Permanece la advertencia previa de chunks grandes del build.
- Actualización histórica final: datos y metadatos/grants iguales, incluida una
  revisión R14 confirmada en USD. Sin backfill ni revaloración.
- Consumo posterior sin reloj instrumentado: `consumed_at` y `created_at`
  `2026-11-07T01:03:01.840822Z`, fecha comercial `2026-11-06`, costo unitario
  `7.1234`. La prueba terminó con rollback.
- Comparación de 25 funciones efectivas: solo las cuatro indicadas cambian sus
  lecturas de fecha; las otras permanecen iguales. TimeZone de base sigue UTC y
  no quedan referencias al reloj de prueba en funciones públicas.

Se completó una batería preliminar y se repitió la integrada al cerrar la
coherencia de alertas. La última pasada SQL completa comprueba además el fixture
explícito de lote sin vencimiento. Los E2E usan exactamente la misma migración
de producción que esa última pasada SQL. No se redujeron pruebas existentes.
