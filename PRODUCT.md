# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

El usuario principal de la primera etapa es el personal de administración de
Droguería SILSAN S.A.C. El sistema incorporará posteriormente experiencias y
permisos específicos para gerencia, logística, almacén, compras, ventas y
contabilidad.

## Product Purpose

SILSANPLEX centraliza la gestión logística y comercial de la empresa. Debe
permitir operar productos, inventario, almacenes, lotes, compras, ventas y
distribución con trazabilidad, seguridad y consistencia de datos.

El éxito del producto significa reemplazar procesos fragmentados por flujos
controlados donde cada operación sensible pueda reconstruirse y auditarse.

## Positioning

SILSANPLEX será una aplicación propia y modular adaptada al flujo real de
Droguería SILSAN. Su núcleo diferencial es la trazabilidad integral entre
documentos comerciales, lotes, ubicaciones, movimientos y usuarios.

## Operating Context

Es un sistema administrativo utilizado principalmente desde computadoras de
escritorio durante la jornada laboral. Debe favorecer navegación rápida,
tablas legibles, búsqueda, filtros, formularios claros y confirmaciones para
operaciones sensibles.

El flujo principal previsto es:

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

## Capabilities and Constraints

- Frontend con React, TypeScript y Vite.
- Aplicación orientada a módulos funcionales.
- Supabase respalda autenticación, organizaciones, membresías, roles, permisos
  y auditoría. Los dominios operativos todavía usan persistencia temporal y se
  migrarán incrementalmente a PostgreSQL.
- La primera versión prioriza el núcleo logístico y comercial.
- Facturación electrónica, SUNAT y contabilidad completa son fases posteriores.
- El inventario debe distinguir producto, almacén, ubicación y lote.
- Las operaciones críticas deben ser transaccionales y auditables.
- No se deben inventar reglas de stock, precios, lotes o aprobaciones.
- Las tres acciones administrativas prioritarias al ingresar todavía no están
  definidas; la navegación debe poder cambiar sin reestructurar la aplicación.

## Brand Commitments

El nombre oficial del producto es SILSANPLEX y la organización es Droguería
SILSAN S.A.C.

El logotipo, los colores corporativos y otros recursos de marca están
pendientes de confirmación. Hasta recibirlos, la interfaz debe utilizar una
identidad provisional claramente reemplazable y no presentar colores o símbolos
como oficiales.

## Evidence on Hand

- [CODEX.md](./CODEX.md) contiene el contexto funcional y las reglas de
  desarrollo confirmadas.
- El repositorio contiene una base frontend funcional.
- No existen todavía datos reales, métricas, testimonios, logotipo ni recursos
  corporativos aprobados. La interfaz no debe fabricarlos.

## Product Principles

1. La trazabilidad y la integridad de la información tienen prioridad sobre la
   apariencia visual.
2. Las tareas frecuentes deben poder completarse con rapidez y claridad.
3. La seguridad debe existir en la capa de datos, no solo en la interfaz.
4. Los módulos deben incorporarse incrementalmente sin acoplamiento innecesario.
5. El historial comercial y logístico debe conservarse y poder auditarse.

## Accessibility & Inclusion

La interfaz debe conservar semántica HTML, navegación por teclado, foco visible,
contraste suficiente y comportamiento responsive. La experiencia principal es
de escritorio, pero las funciones esenciales no deben romperse en pantallas
pequeñas.
