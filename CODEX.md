# SILSANPLEX — Contexto de desarrollo

## 1. Propósito

SILSANPLEX es un sistema web de gestión logística y comercial para Droguería
SILSAN S.A.C. Su objetivo es digitalizar y centralizar los procesos de
productos, inventario, almacenes, lotes, proveedores, compras, clientes,
cotizaciones, pedidos, ventas, distribución, usuarios, auditoría, reportes y
alertas.

El sistema debe ser modular, seguro y mantenible. La integridad de la
información tiene prioridad sobre la cantidad de pantallas implementadas.

## 2. Estado actual

El repositorio está en una etapa inicial. Existe la base del frontend con:

```text
React
TypeScript
Vite
```

Supabase se implementará posteriormente. Hasta recibir una indicación expresa,
no se debe inicializar su CLI, crear migraciones ni programar autenticación,
RLS, funciones PostgreSQL o Edge Functions.

`backend/supabase/` existe únicamente como carpeta reservada y versionable. No
representa una instalación ni una conexión con un proyecto de Supabase.

Tampoco se debe comenzar prematuramente con productos, login o dashboard.

## 3. Alcance funcional

El núcleo de la primera versión seguirá este flujo:

```text
Proveedor
  → Orden de compra
  → Recepción
  → Almacén
  → Inventario
  → Cotización
  → Pedido
  → Venta
  → Despacho
  → Distribución
  → Cliente
```

La facturación electrónica, SUNAT, contabilidad completa y los estados
financieros son fases posteriores. No deben implementarse antes de estabilizar
el núcleo logístico.

## 4. Stack acordado

### Frontend

```text
React
TypeScript
Vite
React Router
TanStack Query
React Hook Form
Zod
Zustand
Tailwind CSS
shadcn/ui
Supabase JS
```

### Backend

```text
Supabase
PostgreSQL
Supabase Auth
Supabase Storage
Row Level Security
PostgreSQL Functions
Supabase Edge Functions
```

No agregar Express, NestJS, Laravel o Django sin una necesidad técnica
justificada.

### Despliegue previsto

```text
Frontend: Vercel
Backend y base de datos: Supabase
Repositorio: GitHub
```

## 5. Arquitectura del repositorio

Estructura objetivo:

```text
silsanplex/
├── frontend/
├── backend/
│   └── supabase/
├── docs/
├── .gitignore
├── README.md
└── CODEX.md
```

`backend/supabase/` contiene migraciones, pruebas de base de datos y Edge
Functions. `backend/scripts/` contiene únicamente operaciones internas y
herramientas reproducibles de desarrollo; nunca deben exponerse al navegador.
No crear otros árboles de carpetas vacíos ni mezclar código frontend y backend.

## 6. Arquitectura del frontend

La aplicación se organizará por funcionalidades. La estructura se incorporará
de forma incremental:

```text
frontend/src/
├── app/
├── assets/
├── components/
│   ├── ui/
│   └── layout/
├── modulos/
├── hooks/
├── lib/
├── services/
├── store/
├── types/
├── utils/
├── App.tsx
└── main.tsx
```

Cada módulo podrá contener sus propias páginas, componentes, hooks, servicios,
esquemas y tipos. No crear componentes gigantes ni carpetas globales con
responsabilidades mezcladas.

El dominio del negocio se nombra en español y los conceptos técnicos estándar
pueden conservarse en inglés. Los nombres de archivos y rutas no utilizarán
tildes, `ñ`, espacios ni caracteres especiales.

## 7. Reglas de TypeScript y React

- Mantener TypeScript estricto.
- Evitar `any` salvo justificación concreta.
- Mantener interfaces y respuestas de datos correctamente tipadas.
- No duplicar innecesariamente tipos generados desde la base de datos.
- Separar UI, lógica de negocio y acceso a datos.
- No ejecutar consultas de datos directamente desde componentes visuales si
  pueden vivir en un servicio.
- Usar TanStack Query para estado de servidor.
- Reservar Zustand para estado global del cliente.
- Usar React Hook Form y Zod para formularios.
- Proporcionar estados claros de carga, éxito y error.
- Bloquear acciones repetidas mientras una operación crítica se procesa.
- Mostrar mensajes comprensibles y conservar el detalle técnico para
  diagnóstico.

## 8. Principios del dominio

### Productos

Un producto describe el catálogo, no el saldo de inventario. No guardar stock
ni fecha de vencimiento directamente en `products`.

Información conceptual:

```text
Código
Código de barras
Nombre
Descripción
Tipo
Línea
Sublínea
Marca
Unidad de medida
Estado
```

### Inventario

El saldo debe distinguir:

```text
Producto
Almacén
Ubicación
Lote
Cantidad física
Cantidad reservada
Cantidad disponible
```

Debe cumplirse:

```text
cantidad_disponible = cantidad_fisica - cantidad_reservada
```

No permitir cantidades negativas accidentalmente. Toda reducción debe validar
disponibilidad dentro de una operación segura.

### Lotes y vencimientos

Un producto puede tener múltiples lotes con cantidades y vencimientos
diferentes. Los lotes son entidades independientes y forman parte de la
trazabilidad del inventario.

### Almacenes y ubicaciones

El sistema debe soportar múltiples almacenes y ubicaciones internas. Un saldo
de inventario debe identificar como mínimo producto, almacén, ubicación y lote.

### Movimientos

Toda entrada o salida física debe crear un movimiento. Nunca modificar stock
sin trazabilidad.

Tipos conceptuales:

```text
PURCHASE_IN
SALE_OUT
TRANSFER_IN
TRANSFER_OUT
ADJUSTMENT_IN
ADJUSTMENT_OUT
RETURN_IN
RETURN_OUT
```

Cada movimiento debe responder:

```text
Qué producto y lote se movió
Cuánto se movió
Desde dónde y hacia dónde
Cuándo y por qué
Qué documento lo originó
Qué usuario lo realizó
Cuál era el stock anterior y cuál quedó después
```

Los movimientos confirmados no deben editarse o eliminarse libremente. Las
correcciones deben preservar el historial.

### Compras y recepciones

Las compras se gestionan mediante órdenes con detalles relacionales. Una orden
puede tener recepciones parciales.

Confirmar una recepción deberá ejecutarse transaccionalmente y, como mínimo:

1. Validar la orden y sus cantidades pendientes.
2. Registrar la recepción y sus detalles.
3. Registrar o asociar los lotes.
4. Actualizar el inventario.
5. Crear movimientos.
6. Actualizar el estado de la orden.
7. Registrar auditoría.

### Cotizaciones, pedidos y ventas

Una cotización aceptada puede convertirse en pedido. Confirmar un pedido puede
reservar inventario. No se debe vender más cantidad disponible salvo que exista
una regla de negocio aprobada expresamente.

La estrategia de selección de lotes —manual, FIFO o FEFO— todavía no está
definida y no debe asumirse.

### Distribución

Los despachos deben relacionarse con el pedido, transporte, vehículo,
transportista, fechas, dirección, estado, observaciones y usuario responsable.

## 9. Usuarios, permisos y seguridad futura

La autenticación utiliza Supabase Auth y los datos adicionales del usuario
viven en `profiles`. Cada identidad tiene como máximo una membresía activa en
el MVP; las membresías inactivas se conservan como historial.

Roles iniciales previstos:

```text
ADMIN
GERENCIA
LOGISTICA
ALMACEN
COMPRAS
VENTAS
CONTABILIDAD
```

Los permisos son capacidades extensibles asociadas a roles. Ocultar botones en
React no constituye autorización: la protección real debe existir en RLS y en
las funciones que ejecuten operaciones sensibles. Solo se agregará una
capacidad cuando exista una regla funcional confirmada.

Nunca exponer claves privadas o `service_role` en el frontend. Los archivos de
entorno locales deben permanecer ignorados por Git.

## 10. Transacciones y auditoría

Los procesos que modifican varias entidades no deben realizarse como llamadas
independientes desde el navegador. Operaciones como recibir compras, confirmar
pedidos, reservar o transferir stock deberán ejecutarse mediante funciones
transaccionales en PostgreSQL o, cuando corresponda, Edge Functions.

Toda operación sensible deberá registrar:

```text
Usuario
Acción
Entidad
ID del registro
Valor anterior
Valor nuevo
Fecha y hora
```

## 11. Datos e historial

- Preferir relaciones mediante claves foráneas.
- Usar eliminación lógica para información comercial o logística con historial.
- Guardar timestamps del servidor en UTC y presentarlos en hora local.
- Registrar `created_at` y `updated_at` cuando corresponda.
- Usar `numeric` o `decimal` para importes; nunca `float`.
- Los documentos históricos conservarán los valores comerciales necesarios
  para que cambios posteriores en catálogos no alteren su significado.
- No guardar detalles relacionales de órdenes, cotizaciones o ventas como JSON
  cuando correspondan tablas de detalle.

## 12. UI y experiencia de usuario

SILSANPLEX es un sistema administrativo. Priorizar:

- Claridad y velocidad.
- Tablas legibles.
- Búsqueda y filtros eficientes.
- Estados visuales consistentes.
- Formularios comprensibles.
- Confirmación de operaciones sensibles.
- Accesibilidad.
- Escritorio como experiencia principal sin perder responsive design.

No utilizar gráficos decorativos ni animaciones innecesarias.

## 13. Orden de desarrollo

1. Configuración del proyecto, autenticación, usuarios, roles, permisos y layout.
2. Productos, categorías, líneas, sublíneas, marcas, unidades y precios.
3. Almacenes, ubicaciones, lotes, inventario, movimientos y vencimientos.
4. Proveedores, órdenes de compra, recepciones e ingreso a almacén.
5. Clientes, cotizaciones, pedidos, reservas y ventas.
6. Despacho, distribución, guías y vehículos.
7. Reportes, auditoría, alertas y exportaciones.
8. Facturación electrónica, SUNAT, integraciones y contabilidad.

Este orden solo cambia mediante una indicación expresa.

## 14. Decisiones pendientes

No asumir reglas críticas todavía no definidas:

- Alcance de una o varias empresas.
- Unidades de compra, almacenamiento y venta.
- Productos que requieren lote o vencimiento.
- Selección manual, FIFO o FEFO de lotes.
- Política de stock negativo.
- Reglas de precios, impuestos y monedas.
- Aprobación y cancelación de documentos.
- Numeración de documentos.
- Alcance de usuarios por almacén.

Estas decisiones deberán resolverse antes de implementar el área afectada.

## 15. Reglas de ejecución

Antes de modificar código:

1. Leer este documento.
2. Revisar la estructura existente y los archivos relacionados.
3. Respetar las tecnologías, arquitectura y convenciones actuales.
4. No crear automáticamente módulos que aún no correspondan.
5. Evitar modificar archivos ajenos a la tarea.
6. Mantener cambios pequeños, verificables y revisables.
7. No introducir dependencias sin necesidad.
8. Ejecutar lint, pruebas y compilación en proporción al cambio.
9. No inventar reglas de negocio.
10. Explicar brevemente las decisiones importantes.

No introducir microservicios, CQRS, event sourcing, Kafka, Redis, Kubernetes u
otra infraestructura compleja sin una necesidad real.

Antes de una funcionalidad nueva, determinar:

```text
A qué módulo pertenece
Qué entidad modifica
Si afecta inventario u otras tablas
Si requiere transacción
Si requiere auditoría
Qué permiso necesita
Si debe ejecutarse desde frontend o backend
```

La separación esperada es:

```text
UI
  → lógica frontend
  → servicios
  → Supabase
  → reglas de negocio
  → PostgreSQL
```

El objetivo es construir un sistema logístico estable, trazable y fácil de
mantener, no simplemente completar pantallas.
