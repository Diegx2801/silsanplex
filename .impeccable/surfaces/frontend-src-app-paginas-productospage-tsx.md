---
version: 1
slug: "frontend-src-app-paginas-productospage-tsx"
primary_target: "frontend/src/app/paginas/ProductosPage.tsx"
related_targets: ["frontend/src/modulos/productos/componentes/DialogoProducto.tsx","frontend/src/modulos/productos/modelo/producto.ts"]
---

# Productos

## Alcance y modo

Superficie Operate para que administración encuentre, registre, edite y active o desactive productos esenciales sin replicar la complejidad del sistema anterior.

## Tarea y contenido

- La acción primaria es registrar un producto.
- La búsqueda cubre código, código de barras, descripción y laboratorio; el filtro separa estados.
- El registro comienza vacío y solo muestra información ingresada por el usuario.
- El guardado es temporal en `sessionStorage` hasta conectar Supabase.

## Dirección y comportamiento

Extiende «Kardex vivo» con una tabla de registro en escritorio, filas apiladas en móvil y un formulario lateral que protege el foco. La transición del panel es el momento de movimiento principal.

## Decisiones pendientes

Confirmar si el precio base incluye IGV, los catálogos controlados de clasificación y presentación, y cuáles campos opcionales serán obligatorios para la empresa.
