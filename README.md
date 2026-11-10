# SILSANPLEX

Sistema web de gestión logística y comercial para Droguería SILSAN S.A.C.

El proyecto busca centralizar productos, almacenes, lotes, inventario, compras,
ventas y distribución, manteniendo como prioridades la trazabilidad, la
seguridad y la consistencia de los datos.

## Estado actual

El proyecto implementa autenticación, usuarios, productos, inventario, compras,
clientes, ventas, distribución, reparaciones y reportes sobre React, TypeScript,
Vite y Supabase/PostgreSQL. Las operaciones críticas utilizan RPC transaccionales
y políticas de acceso en la base de datos.

Facturación electrónica funciona únicamente como sandbox: prepara y congela
comprobantes, administra series de prueba y simula resultados locales. No firma
XML, no transmite a SUNAT/PSE ni obtiene CDR oficiales. Caja y tesorería completas
siguen pendientes. La auditoría y sus límites están en
[el informe de consolidación](docs/AUDITORIA_INTEGRAL_2026-11-09.md).

## Estructura

```text
silsanplex/
├── backend/
│   ├── scripts/   Aprovisionamiento local y de clientes
│   └── supabase/  Migraciones, pruebas y Edge Functions
├── frontend/      Aplicación web
├── CODEX.md       Contexto y reglas de desarrollo
├── PRODUCT.md     Verdad de producto y restricciones vigentes
├── DESIGN.md      Sistema visual y decisiones de interfaz
├── .gitignore
└── README.md
```

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
npm run test
npm run lint
npm run build
npm run test:e2e:local
```

El último comando requiere Supabase local y las identidades E2E configuradas en
`backend/.env.local`. Aprovisiona fixtures y ejecuta las pruebas operativas y de
autenticación; modifica el entorno local configurado. Para validar sin reutilizar
stacks existentes, ejecutar desde `frontend`:

```bash
node scripts/test-repair-accessories.mjs --workflow-e2e --all-sql --checks
```

Este runner crea un proyecto Supabase desechable con identidad y puertos propios,
valida migraciones y SQL, ejecuta E2E y elimina únicamente sus recursos. Requiere
Docker y las dependencias backend/frontend instaladas. Las pruebas unitarias
usan configuración ficticia y no necesitan credenciales locales.

## Backend

Consulta [backend/README.md](./backend/README.md) para iniciar Supabase local,
crear el administrador de desarrollo, validar el módulo y conocer el flujo
controlado de alta de nuevos clientes.

## Flujo de trabajo

- `main`: código estable.
- `develop`: integración del desarrollo.
- `feature/*`: nuevas funcionalidades.
- `fix/*`: correcciones.

No se deben implementar módulos completos ni introducir nuevas dependencias
sin revisar primero [CODEX.md](./CODEX.md).
