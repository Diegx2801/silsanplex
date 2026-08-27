# Consolidación del modelo de inventario

## Contrato canónico

El contrato canónico de catálogo e inventario es:

- `public.products`
- `public.warehouses`
- `public.warehouse_locations`
- `public.inventory_movements`

El frontend, Compras y las RPC de inventario ya utilizaban este contrato. Las
tablas `productos`, `almacenes`, `ubicaciones` y `movimientos_inventario` se
retiran en la migración posterior
`20260826010000_retire_spanish_legacy_model.sql`. `lotes` se conserva
temporalmente y queda vinculado al catálogo canónico mediante
`lotes_product_canonical_fk`.

Los maestros `marcas`, `lineas`, `sublineas` y `unidades_medida` no son un
segundo libro de inventario y se conservan para una normalización futura del
catálogo.

## Reglas de reconciliación

La migración se ejecuta dentro de una transacción y toma bloqueos exclusivos
sobre ambos contratos para impedir escrituras concurrentes.

- Un producto legado coincide con uno canónico por organización y código sin
  distinguir mayúsculas ni espacios externos. Si no coincide, se crea y se
  preserva su UUID cuando no está ocupado.
- Los códigos que no cumplen el formato canónico reciben un código estable
  `LEG-<hash>`. El código original permanece en el snapshot de trazabilidad.
- Un almacén coincide por organización y nombre normalizado. Los almacenes y
  ubicaciones nuevas preservan su UUID cuando es posible y reciben códigos
  estables `LEG-<hash>`.
- Cada almacén dispone de una ubicación `GENERAL`. Las ubicaciones legadas se
  migran de forma independiente.
- El stock mínimo del producto legado se proyecta a
  `product_warehouse_settings` para cada almacén legado de la organización.
- Los tipos de movimiento se traducen al vocabulario canónico de entrada,
  salida y ajustes. El UUID, actor, fecha, cantidad, costo, lote y vencimiento
  se preservan siempre que el contrato destino lo permite.
- `saldo_anterior`, `saldo_nuevo` y las referencias documentales permanecen en
  la traza. El saldo operativo se calcula desde el libro canónico append-only.

Los límites más estrictos del contrato canónico pueden acortar el valor
operativo de nombre, lote o descripción. El valor completo nunca se pierde:
queda en `source_snapshot`.

## Trazabilidad y seguridad

`public.legacy_model_migration_trace` guarda una fila por cada registro retirado
con:

- tabla e ID de origen;
- organización;
- tabla, ID o clave canónica de destino;
- resolución (`matched`, `migrated` o `represented`);
- snapshot JSON completo del registro original;
- fecha de migración.

La tabla no se expone a `anon`, `authenticated` ni `service_role`, y un trigger
impide `UPDATE` y `DELETE`. Debe consultarse solo mediante acceso administrativo
directo a PostgreSQL. `audit_events` registra además un resumen
`DATA_MODEL_CONSOLIDATED` por organización.

Ejemplo de verificación administrativa:

```sql
select legacy_table, resolution, count(*)
from public.legacy_model_migration_trace
group by legacy_table, resolution
order by legacy_table, resolution;
```

Antes de ejecutar los `DROP`,
`20260826010000_retire_spanish_legacy_model.sql` verifica que cada fila origen
tenga traza, que cada ID destino exista, que no queden FKs, vistas o funciones
dependientes y que el contrato canónico conserve sus RPC, RLS, policies y
triggers. Cualquier diferencia aborta y revierte toda la transacción.

## Despliegue y recuperación

Antes de desplegar en un entorno con datos reales:

1. Crear un backup verificable de PostgreSQL.
2. Ejecutar `supabase migration list` y verificar la historia remota. Se
   corrigieron dos colisiones de versión renombrando las segundas migraciones a
   `20260821230001` y `20260821233001`; si ese SQL se aplicó manualmente en el
   entorno, primero debe alinearse la historia con `supabase migration repair`.
3. Medir filas de las cuatro tablas que se retirarán, filas de `lotes` y espacio
   disponible.
4. Programar una ventana de mantenimiento, porque se toman bloqueos exclusivos.
5. Aplicar la migración y comparar los conteos con la traza.
6. Validar existencias, kardex y una recepción/transferencia por organización.
7. Ejecutar en `frontend/` `npm run test`, `npm run lint`, `npm run build` y las
   pruebas E2E para confirmar que React no mantiene accesos al contrato retirado.

Entre el backfill y el retiro no deben ejecutarse escrituras sobre las tablas
legacy. La migración de retiro compara los snapshots por registro y aborta si
detecta cambios; `lotes.producto_id` es la única columna legacy normalizada por
el backfill. El trigger de `lotes` también actualiza `updated_at`; ambas
columnas se validan por separado contra la clave canónica trazada y el resto
del snapshot original.

Si la migración falla antes del `COMMIT`, PostgreSQL restaura automáticamente el
estado anterior. Después de un despliegue exitoso, la recuperación completa del
modelo retirado requiere restaurar el backup previo; la traza permite investigar
y reconstruir registros concretos, pero no reemplaza una copia de seguridad.

La migración de retiro no elimina `lotes`. Antes de eliminar esa tabla en una
evolución futura debe existir un modelo canónico de lotes que conserve el
producto, número de lote, fecha de fabricación, vencimiento e identidad
histórica.
