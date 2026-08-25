# Supabase Logística V1

## Alcance

Esta versión preparó la infraestructura PostgreSQL de SILSANPLEX sin modificar
React ni migrar entonces los módulos operativos. El módulo Productos se conectó
posteriormente a `public.products` mediante el Commit 2; Inventario, Compras y
Ventas no forman parte de esa migración.

Las migraciones nuevas son:

- `backend/supabase/migrations/20260821190000_create_logistics_foundation.sql`
- `backend/supabase/migrations/20260821191000_secure_logistics_foundation.sql`
- `backend/supabase/migrations/20260821230000_extend_products_catalog.sql`

El contrato activo y canónico es `public.products`, `public.warehouses`,
`public.warehouse_locations` e `public.inventory_movements`. La migración
`20260825000000_consolidate_inventory_data_model.sql` converge los datos del
modelo alterno, conserva su traza y retira `productos`, `almacenes`,
`ubicaciones`, `lotes` y `movimientos_inventario`.

Los maestros `marcas`, `lineas`, `sublineas` y `unidades_medida` permanecen
disponibles. Sus valores se proyectan a los campos textuales de `products`
durante la convergencia y podrán normalizarse en una evolución independiente.

## Tablas creadas

| Tabla | Propósito | Organización |
|---|---|---|
| `marcas` | Marcas o laboratorios del catálogo | `organization_id` obligatorio |
| `lineas` | Líneas de producto | `organization_id` obligatorio |
| `sublineas` | Subdivisiones de una línea | `organization_id` y `linea_id` |
| `unidades_medida` | Unidades y abreviaturas | `organization_id` obligatorio |
| `productos` | Catálogo empresarial | `organization_id` obligatorio |
| `almacenes` | Almacenes físicos o lógicos | `organization_id` obligatorio |
| `ubicaciones` | Ubicaciones internas de almacén | `organization_id` y `almacen_id` |
| `lotes` | Lotes y fechas de producto | `organization_id` y `producto_id` |
| `movimientos_inventario` | Registro append-only para kardex | `organization_id`, producto, almacén y usuario |

## Relaciones

```text
organizations
├── marcas
├── lineas
│   └── sublineas
├── unidades_medida
├── productos
│   ├── marca opcional
│   ├── linea opcional
│   ├── sublinea opcional, compatible con la línea elegida
│   └── unidad_medida opcional
├── almacenes
│   └── ubicaciones
├── lotes
│   └── producto
└── movimientos_inventario
    ├── producto
    ├── almacen
    ├── ubicacion opcional
    └── lote opcional
```

Las relaciones entre organización y entidad se implementan con claves foráneas
compuestas cuando una entidad depende de otra. Esto impide, por ejemplo, que un
producto de una organización use una marca, línea, unidad, lote o almacén de
otra organización.

## Decisiones tomadas

### Multiempresa

Se respeta el modelo actual: una identidad puede tener como máximo una
membresía activa. El aislamiento se basa en `organization_id` y en la función
existente `public.is_organization_member(uuid)`.

### Ubicaciones

Aunque el modelo funcional mínimo solo requiere `almacen_id`, `ubicaciones`
conserva también `organization_id`. Esto permite aplicar RLS directamente y
validar relaciones tenant-safe sin depender de joins en cada política.

### Nombres y códigos

- Los nombres de mantenedores son únicos por organización sin distinguir
  mayúsculas, minúsculas ni espacios externos.
- El código interno de producto es único por organización con la misma
  normalización.
- El código de barras, cuando existe, también es único por organización.
- El número de lote es único por producto dentro de una organización.
- `productos` conserva `presentacion`, `registro_sanitario` y `control_lote`
  para mantener compatibilidad con el catálogo temporal existente. La tabla no
  impone todavía reglas fiscales, regulatorias ni de venta bajo receta.

### Estados y eliminación

Las tablas de catálogo usan `estado` para baja lógica. No se conceden permisos
de `DELETE` a `authenticated` ni a `service_role` sobre estas tablas mediante
esta migración. La eliminación física no debe romper documentos históricos.

### Actores y auditoría

`marcas` y `productos` tienen `created_by` y `updated_by`, como parte del
contrato solicitado. Los cambios de todas las tablas nuevas se registran en la
estructura existente `audit_events` usando triggers. El actor se obtiene de
`auth.uid()` cuando existe.

### Movimientos

`movimientos_inventario` es append-only para los roles de aplicación. Tiene
`cantidad`, `saldo_anterior` y `saldo_nuevo`, pero esta migración no calcula esos
valores automáticamente. La operación atómica que valide disponibilidad,
calcule saldos y registre el movimiento pertenece a una futura RPC o Edge
Function.

Se aceptan únicamente los tipos conceptuales ya definidos en `CODEX.md`:
`PURCHASE_IN`, `SALE_OUT`, `TRANSFER_IN`, `TRANSFER_OUT`, `ADJUSTMENT_IN`,
`ADJUSTMENT_OUT`, `RETURN_IN` y `RETURN_OUT`.

No se fija todavía ninguna política sobre:

- stock negativo
- reservas
- FIFO o FEFO
- selección automática de lotes
- conversiones entre unidades
- ajustes positivos o negativos
- documentos comerciales que originan movimientos

## RLS y privilegios

Las tablas nuevas tienen RLS habilitado.

Para miembros activos de la organización se permiten:

- `SELECT` sobre sus propios registros
- `INSERT` dentro de su organización
- `UPDATE` dentro de su organización para mantenedores

En movimientos solo se permiten `SELECT` e `INSERT`. Además, el usuario que
registra el movimiento debe coincidir con `usuario_id = auth.uid()`.

No se conceden permisos directos para escribir `audit_events`; los triggers
registran los cambios con privilegios de servidor.

## Auditoría

Los triggers registran en `audit_events`:

- creación como `LOGISTICS_CREATED`
- modificación como `LOGISTICS_UPDATED`
- eliminación como `LOGISTICS_DELETED` si una operación privilegiada la ejecuta
- tabla y registro afectado
- valores anteriores y nuevos cuando corresponda
- usuario responsable cuando existe una sesión autenticada
- fecha generada por PostgreSQL

Los movimientos solo generan auditoría de creación y no tienen operaciones de
actualización o eliminación para los roles de aplicación.

## Validación pendiente

La validación con `supabase db lint` depende de PostgreSQL local y Docker. Debe
ejecutarse en un entorno con Supabase local activo:

```bash
cd backend
npm run db:start
npm run db:reset
npm run db:lint
```

La prueba añadida en
`backend/supabase/tests/database/logistics_foundation.test.sql` cubre:

- aislamiento entre organizaciones
- referencias compuestas entre tenants
- nombres y códigos duplicados
- inserción de movimientos con usuario incorrecto
- imposibilidad de actualizar o eliminar movimientos
- creación de eventos en `audit_events`

## Futuras migraciones

### Commit 2: persistencia de Productos (completado)

- `frontend/src/modulos/productos/servicios/productosService.ts` consulta y
  modifica `public.products` con `organization_id` explícito.
- El formulario conserva validación Zod y persiste costo, precio, línea, marca,
  sublínea y unidad como datos textuales del contrato actual.
- La migración `20260821230000_extend_products_catalog.sql` añade `cost` y
  `subline` con restricciones de base de datos.
- Se añadieron pruebas unitarias del servicio y pruebas SQL de RLS, CRUD y
  duplicados.

La convergencia del catálogo y del inventario se completó sin convertir aún los
maestros `marcas`, `lineas`, `sublineas` y `unidades_medida` en claves foráneas
del contrato canónico. Esa normalización queda como una evolución posterior y
no requiere mantener tablas duplicadas de productos o inventario.

### Commit 3: núcleo transaccional de Inventario

- Crear RPC para registrar movimientos atómicamente.
- Calcular saldos por producto, almacén, ubicación y lote.
- Definir política de stock negativo y reservas.
- Implementar kardex y correcciones mediante movimientos compensatorios.

### Commit 4: Compras y recepciones

- Crear órdenes, detalles, recepciones parciales y documentos origen.
- Asociar lotes y generar movimientos en una transacción.

### Commit 5: Ventas, despacho y permisos

- Crear pedidos, ventas, despachos y relaciones documentales.
- Definir reservas, disponibilidad y reglas de selección de lotes.
- Aplicar permisos reales por rol y operación.
