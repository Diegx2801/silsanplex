# Backend de SILSANPLEX

Supabase administra autenticación, datos multiempresa, RLS, funciones y auditoría.

## Desarrollo local

1. Copiar `.env.example` como `.env.local` y definir una contraseña local de al menos 8 caracteres.
2. Ejecutar `npm install`, `npm run db:start` y `npm run db:reset`.
3. Ejecutar `npm run dev:create-admin`.
4. Ejecutar `npm run env:frontend` y arrancar el frontend.

`dev:create-admin` solo admite una URL local. Crea una identidad confirmada mediante Supabase Auth Admin API y la asigna como administrador de SILSAN. No utiliza correo ni Inbucket.

## Alta de un nuevo cliente

`npm run provision:client-admin` es una operación interna de la plataforma, no una función visible para los administradores de clientes. Requiere en `.env.local` la URL y clave privada del entorno, `PUBLIC_APP_URL`, nombre/slug de la organización y datos del administrador.

El comando crea la organización, invita al primer administrador y lo vincula exclusivamente a esa organización. En producción debe configurarse SMTP y la URL de redirección autorizada. Nunca se ejecuta desde el navegador ni se comparte la clave privada.

Después del alta, ese administrador gestiona los usuarios de su empresa desde Control de Usuarios. Las validaciones del backend y RLS impiden que vea o modifique usuarios de otros clientes.

## Ciclo de vida de usuarios

- `Invitación pendiente`: todavía no estableció contraseña; el administrador puede reenviar la invitación.
- `Activo`: aceptó la invitación; el administrador puede enviar recuperación de contraseña.
- `Inactivo`: conserva historial y auditoría, pero no puede acceder a la organización.

Las invitaciones se abren en otro perfil del navegador o en incógnito para no reemplazar la sesión del administrador que las creó.

## Validación

```bash
npm run db:reset
npm run db:lint
npm test
```

Para cambios de autenticación también se debe validar el frontend con lint, pruebas, build y E2E.
