# SILSANPLEX

Sistema web de gestión logística y comercial para Droguería SILSAN S.A.C.

El proyecto busca centralizar productos, almacenes, lotes, inventario, compras,
ventas y distribución, manteniendo como prioridades la trazabilidad, la
seguridad y la consistencia de los datos.

## Estado actual

El proyecto se encuentra en su etapa inicial. Actualmente solo está preparada
la base del frontend con React, TypeScript y Vite.

La integración con Supabase y los módulos funcionales se implementarán en
fases posteriores.

## Estructura

```text
silsanplex/
├── frontend/      Aplicación web
├── CODEX.md       Contexto y reglas de desarrollo
├── .gitignore
└── README.md
```

Las carpetas de backend y documentación adicional se crearán cuando sean
necesarias.

## Frontend

Requisitos:

- Node.js
- npm

Instalación y ejecución:

```bash
cd frontend
npm install
npm run dev
```

Verificaciones disponibles:

```bash
npm run lint
npm run build
```

## Flujo de trabajo

- `main`: código estable.
- `develop`: integración del desarrollo.
- `feature/*`: nuevas funcionalidades.
- `fix/*`: correcciones.

No se deben implementar módulos completos ni introducir nuevas dependencias
sin revisar primero [CODEX.md](./CODEX.md).
