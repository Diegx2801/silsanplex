# Frontend de SILSANPLEX

Aplicación web construida con React, TypeScript y Vite.

## Comandos

```bash
npm install
npm run dev
npm run lint
npm run test
npm run build
npm run test:e2e:local
npm run preview
```

`test:e2e:local` prepara un administrador y un miembro en Supabase local antes
de ejecutar Playwright. Las credenciales se leen de `backend/.env.local` y se
copian a `frontend/.env.e2e.local`, un archivo ignorado por Git. Consulta el
flujo y sus restricciones en [backend/README.md](../backend/README.md#e2e-local-de-autenticación).

`test:e2e` no aprovisiona identidades. Está destinado a CI o a un entorno ya
preparado y exige las cuatro variables documentadas en `.env.e2e.example`. Si
falta alguna, la configuración falla; no se omiten silenciosamente los casos
autenticados.

## Estado

La plantilla demostrativa de Vite fue retirada. Por el momento, la aplicación
incluye la infraestructura base de navegación, caché de servidor, formularios,
estado global y componentes visuales. Los módulos funcionales se incorporarán
de forma incremental.

El módulo inicial de Productos permite registrar, buscar, editar y cambiar el
estado de productos durante la sesión del navegador. Esta persistencia es
temporal y se reemplazará por Supabase cuando la empresa entregue sus accesos.

El layout administrativo utiliza provisionalmente la dirección visual
`Kardex vivo`. Los recursos de marca se reemplazarán cuando la empresa confirme
su identidad corporativa.

Supabase ya respalda autenticación y control de usuarios. Los módulos operativos
continúan con persistencia temporal en la sesión hasta incorporar sus tablas,
RLS y operaciones transaccionales.

Consulta el [contexto de desarrollo](../CODEX.md) antes de realizar cambios.
