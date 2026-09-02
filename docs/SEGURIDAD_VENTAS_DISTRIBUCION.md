# Seguridad de Ventas y Distribución

## Permisos

| Permiso | Alcance |
| --- | --- |
| `SALES_VIEW` | Consulta de cotizaciones, pedidos y ventas persistentes. |
| `SALES_MANAGE` | Crear pedidos y ventas; modificar o cancelar pedidos. |
| `DISTRIBUTION_VIEW` | Consulta de entregas y seguimiento. Ya existía. |
| `DISTRIBUTION_MANAGE` | Programar, editar y actualizar entregas. Ya existía. |

Asignación vigente:

- `ADMIN`: `SALES_VIEW`, `SALES_MANAGE`, `DISTRIBUTION_VIEW`, `DISTRIBUTION_MANAGE`.
- `VENTAS`: `SALES_VIEW`, `SALES_MANAGE`.
- `GERENCIA`: `SALES_VIEW`.
- `LOGISTICA`: `SALES_VIEW`, `DISTRIBUTION_VIEW`, `DISTRIBUTION_MANAGE`; conserva `INVENTORY_MANAGE`.

`LOGISTICA` recibe `SALES_VIEW` como dependencia operativa para consultar pedidos y ventas desde Distribución y ejecutar el despacho. No recibe `SALES_MANAGE`.

## Reglas de backend

- `orders`, `order_items`, `sales` y `sale_items` requieren `SALES_VIEW`; `DISTRIBUTION_VIEW` también permite su lectura mínima como dependencia del flujo de distribución.
- Crear pedido, crear venta, modificar pedido y cancelar pedido requieren `SALES_MANAGE`.
- Despachar requiere simultáneamente `DISTRIBUTION_MANAGE` e `INVENTORY_MANAGE`, porque consume reservas y registra salidas de inventario.
- Guardar una entrega requiere `DISTRIBUTION_MANAGE`.
- Las RPCs conservan la identidad desde `auth.uid()` y validan el permiso contra la organización recibida; no confían en permisos enviados por el frontend.
