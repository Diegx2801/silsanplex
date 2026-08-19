# Plan diario de trabajo — SILSANPLEX

Periodo inicial: **19 de agosto al 6 de noviembre de 2026**
Jornada de planificación: **lunes a viernes**
Estado: plan inicial sujeto a revisión cada viernes.

## Objetivo del ciclo

Construir un primer flujo operativo trazable y seguro para ambas empresas:

`acceso → empresa → usuarios → productos → inventario → compras → recepción → clientes → cotización/pedido → venta → salida → caja → reportes`

Este calendario asume una línea principal de desarrollo. Cada tarea se considera terminada cuando incluye validaciones, permisos, pruebas relevantes y documentación mínima. La integración con SUNAT, la facturación electrónica completa y contabilidad avanzada quedan para una fase posterior.

## Estado actual confirmado

- Base React + TypeScript + Vite disponible.
- Supabase incorporado con migraciones, funciones y pruebas iniciales.
- Autenticación y administración multiempresa de usuarios implementadas inicialmente.
- Catálogo temporal de productos, importación y dashboard administrativo inicial disponibles.
- Inventario y compras cuentan con un primer flujo local; ventas, caja y reportes todavía no tienen flujo funcional completo.

## Semana 1 — Alineación y estabilización (19–21 de agosto)

### Miércoles 19

- [x] Revisar el alcance funcional, roles y reglas de negocio entregados.
- [x] Contrastar los requerimientos con el estado real del repositorio.
- [x] Definir el orden de implementación y crear este plan diario.
- [x] Diagnosticar la pantalla blanca y añadir un estado de configuración recuperable.
- [x] Instalar y levantar Docker, WSL 2 y Supabase local.
- [x] Configurar el frontend y validar el acceso del administrador local.
- [x] Implementar filtros, ordenamiento y paginación del catálogo temporal.
- [x] Implementar ficha de detalle y confirmación segura de estado del producto.
- [x] Exportar a Excel el catálogo filtrado con resumen operativo.
- [x] Construir el MVP local de inventario con movimientos y stock calculado.
- [x] Implementar proveedores, compras multiproducto y recepción local conectada a inventario.
- [ ] Crear la matriz de trazabilidad REQ-001 a REQ-088.

### Jueves 20

- [ ] Ejecutar el entorno completo de Supabase y frontend en local.
- [ ] Validar login, recuperación/establecimiento de contraseña y cierre de sesión.
- [ ] Validar alta, edición, deshabilitación y listado de usuarios.
- [ ] Registrar defectos y decisiones pendientes encontrados.

### Viernes 21

- [ ] Corregir defectos críticos del flujo de acceso y usuarios.
- [ ] Confirmar roles iniciales y permisos por módulo con el responsable funcional.
- [ ] Añadir verificación automatizada del flujo crítico disponible.
- [ ] Realizar revisión semanal y ajustar el siguiente bloque.

## Semana 2 — Empresas, sesión y autorización (24–28 de agosto)

### Lunes 24

- [ ] Diseñar el modelo definitivo de empresas, sucursales y membresías.
- [ ] Definir aislamiento multiempresa y políticas RLS.

### Martes 25

- [ ] Implementar migraciones de empresas y sucursales.
- [ ] Crear datos semilla para SERSISAN S.A.C. y Droguería SILSAN S.A.C.

### Miércoles 26

- [ ] Implementar selector de empresa y persistencia segura durante la sesión.
- [ ] Mostrar claramente la empresa activa en la interfaz.

### Jueves 27

- [ ] Aplicar autorización por rol en navegación, rutas y operaciones.
- [ ] Probar aislamiento entre empresas y accesos denegados.

### Viernes 28

- [ ] Completar pruebas de REQ-001 a REQ-005 y REQ-076 a REQ-079.
- [ ] Documentar decisiones de seguridad y realizar demo semanal.

## Semana 3 — Catálogo de productos persistente (31 de agosto–4 de septiembre)

### Lunes 31

- [ ] Diseñar productos, líneas, sublíneas, marcas y unidades de medida.
- [ ] Definir códigos únicos, estados y reglas multiempresa.

### Martes 1

- [ ] Crear migraciones, restricciones, índices y políticas RLS del catálogo.
- [ ] Añadir pruebas de base de datos.

### Miércoles 2

- [ ] Conectar listado, búsqueda, alta y edición de productos con Supabase.
- [ ] Incorporar validaciones de negocio y estados de carga/error.

### Jueves 3

- [ ] Persistir costos y precios de venta con control de permisos.
- [ ] Implementar imágenes de producto mediante Storage.

### Viernes 4

- [ ] Adaptar la importación masiva al catálogo persistente.
- [ ] Probar duplicados, errores parciales y REQ-006 a REQ-013.

## Semana 4 — Inventario y trazabilidad (7–11 de septiembre)

### Lunes 7

- [ ] Diseñar almacenes, ubicaciones, lotes y movimientos de inventario.
- [ ] Acordar reglas pendientes sobre lotes, vencimientos y stock negativo.

### Martes 8

- [ ] Implementar migraciones e índices del núcleo de inventario.
- [ ] Crear función transaccional para registrar movimientos.

### Miércoles 9

- [ ] Construir consulta de existencias por empresa, almacén y producto.
- [ ] Añadir búsqueda, filtros y paginación.

### Jueves 10

- [ ] Implementar historial de movimientos y detalle trazable.
- [ ] Restringir ajustes de stock según permisos.

### Viernes 11

- [ ] Probar concurrencia, integridad y aislamiento de inventario.
- [ ] Validar REQ-014 a REQ-017 y realizar demo semanal.

## Semana 5 — Proveedores y clientes (14–18 de septiembre)

### Lunes 14

- [ ] Diseñar maestro compartido de terceros y datos fiscales/contacto.
- [ ] Definir validaciones de RUC/DNI sin depender todavía de integraciones externas.

### Martes 15

- [ ] Implementar proveedores: migraciones, RLS, listado y búsqueda.
- [ ] Implementar alta y edición con auditoría.

### Miércoles 16

- [ ] Completar pruebas y permisos de proveedores.
- [ ] Validar REQ-018 a REQ-021.

### Jueves 17

- [ ] Implementar clientes: listado, búsqueda, alta y edición.
- [ ] Preparar selector reutilizable de clientes para operaciones comerciales.

### Viernes 18

- [ ] Completar pruebas de REQ-034 a REQ-037.
- [ ] Revisar UX, accesibilidad y demo semanal de maestros.

## Semana 6 — Compras y recepción (21–25 de septiembre)

### Lunes 21

- [ ] Diseñar compra, detalle, estados y relación con proveedor.
- [ ] Definir reglas de edición/anulación y numeración documental.

### Martes 22

- [ ] Implementar migraciones y API transaccional de compras.
- [ ] Crear registro de compra con múltiples productos.

### Miércoles 23

- [ ] Implementar listado, filtros, consulta y edición autorizada de compras.
- [ ] Validar totales y documentos duplicados.

### Jueves 24

- [ ] Implementar recepción física total o parcial en almacén.
- [ ] Generar movimientos de entrada trazables desde la compra.

### Viernes 25

- [ ] Probar compra → recepción → actualización de stock.
- [ ] Validar REQ-022 a REQ-033 y realizar demo semanal.

## Semana 7 — Cotizaciones y pedidos (28 de septiembre–2 de octubre)

### Lunes 28

- [ ] Diseñar cotizaciones, detalles, vigencia, estados y numeración.
- [ ] Crear migraciones y permisos.

### Martes 29

- [ ] Implementar creación y edición de cotizaciones.
- [ ] Incorporar selección de cliente, productos y precios.

### Miércoles 30

- [ ] Implementar consulta, filtros, detalle y cambio de estado de cotizaciones.
- [ ] Preparar documento digital imprimible inicial.

### Jueves 1

- [ ] Implementar conversión de cotización a pedido.
- [ ] Crear listado y seguimiento de pedidos.

### Viernes 2

- [ ] Probar REQ-038 a REQ-044 y permisos de Ventas.
- [ ] Realizar revisión y demo semanal.

## Semana 8 — Ventas y comprobantes internos (5–9 de octubre)

### Lunes 5

- [ ] Diseñar venta, detalle, tipos de documento, estados y numeración interna.
- [ ] Definir reglas de precios, impuestos y anulación que requieren aprobación.

### Martes 6

- [ ] Implementar registro transaccional de ventas.
- [ ] Permitir origen desde pedido o registro directo autorizado.

### Miércoles 7

- [ ] Implementar consulta de ventas y comprobante digital interno.
- [ ] Añadir filtros por cliente, fecha, documento y estado.

### Jueves 8

- [ ] Implementar estados preparados para una futura integración SUNAT.
- [ ] Añadir auditoría y restricciones de modificación/anulación.

### Viernes 9

- [ ] Probar REQ-045 a REQ-052 sin envío real a SUNAT.
- [ ] Revisar totales, permisos y demo semanal.

## Semana 9 — Salidas, despacho y guías (12–16 de octubre)

### Lunes 12

- [ ] Diseñar salidas de almacén y su relación con ventas/pedidos.
- [ ] Definir reservas, preparación y entrega sin inventar reglas operativas.

### Martes 13

- [ ] Implementar salida transaccional y actualización de existencias.
- [ ] Impedir stock negativo según la regla aprobada.

### Miércoles 14

- [ ] Implementar historial y trazabilidad de salidas.
- [ ] Probar venta → salida → inventario.

### Jueves 15

- [ ] Implementar registro y consulta básica de guías de remisión.
- [ ] Preparar formato digital interno.

### Viernes 16

- [ ] Probar REQ-053 a REQ-058.
- [ ] Realizar revisión integral del flujo logístico-comercial.

## Semana 10 — Caja y cuentas corrientes (19–23 de octubre)

### Lunes 19

- [ ] Diseñar sesiones de caja, movimientos y responsables.
- [ ] Definir relación con clientes, proveedores y ventas.

### Martes 20

- [ ] Implementar apertura de caja e ingresos/egresos.
- [ ] Aplicar permisos y auditoría.

### Miércoles 21

- [ ] Implementar cierre, arqueo y resumen de caja.
- [ ] Impedir movimientos sobre cajas cerradas.

### Jueves 22

- [ ] Implementar consulta inicial de cuentas corrientes.
- [ ] Añadir filtros y saldos derivados de operaciones registradas.

### Viernes 23

- [ ] Probar REQ-059 a REQ-066 y REQ-070.
- [ ] Realizar demo semanal y revisar controles financieros.

## Semana 11 — Kardex, reportes y configuración (26–30 de octubre)

### Lunes 26

- [ ] Implementar Kardex por producto, almacén, lote y periodo.
- [ ] Verificar saldos acumulados contra movimientos.

### Martes 27

- [ ] Implementar reportes operativos de compras, ventas e inventario.
- [ ] Añadir filtros y exportación controlada.

### Miércoles 28

- [ ] Implementar reporte inicial de utilidad con reglas aprobadas.
- [ ] Documentar el criterio exacto de cálculo.

### Jueves 29

- [ ] Implementar mantenimiento de empresas, sucursales y parámetros generales.
- [ ] Restringir configuración a administradores.

### Viernes 30

- [ ] Probar REQ-067 a REQ-075.
- [ ] Validar rendimiento de consultas y realizar demo semanal.

## Semana 12 — Transferencias, endurecimiento y cierre del ciclo (2–6 de noviembre)

### Lunes 2

- [ ] Diseñar transferencias entre sucursales, estados y recepción.
- [ ] Definir el alcance de pedidos a proveedor frente al módulo de compras.

### Martes 3

- [ ] Implementar creación, despacho y recepción de transferencias.
- [ ] Generar movimientos de inventario trazables en ambos extremos.

### Miércoles 4

- [ ] Probar REQ-083 a REQ-088 y flujos multiempresa/multisucursal.
- [ ] Evaluar REQ-080 a REQ-082 para planificar Producción en el siguiente ciclo.

### Jueves 5

- [ ] Ejecutar pruebas integrales de seguridad, permisos y operaciones críticas.
- [ ] Corregir defectos bloqueantes y revisar accesibilidad/responsive.

### Viernes 6

- [ ] Ejecutar aceptación funcional del ciclo con usuarios responsables.
- [ ] Consolidar documentación, riesgos y pendientes.
- [ ] Preparar despliegue de prueba y plan del siguiente ciclo.

## Ritmo diario de seguimiento

Cada día se actualizará este archivo con:

1. Tareas previstas para el día.
2. Tareas terminadas y evidencia de validación.
3. Bloqueos o decisiones funcionales necesarias.
4. Tareas trasladadas, con su motivo.

Cada viernes se revisará el avance real y se ajustarán las fechas futuras sin reducir pruebas, seguridad ni trazabilidad.

## Decisiones funcionales que deben confirmarse pronto

- Matriz exacta de permisos por rol.
- Alcance de cada usuario sobre empresas y sucursales.
- Uso obligatorio de lotes, fechas de vencimiento y ubicaciones.
- Política de stock negativo, reservas y ajustes.
- Reglas de impuestos, monedas, descuentos, precios y redondeos.
- Numeración y anulación de documentos.
- Flujo real de aprobación de compras, ventas y transferencias.
- Criterio de costo y utilidad para reportes.
- Alcance de producción y productos terminados.
- Proveedor y alcance futuro de facturación electrónica/SUNAT.
