# Backend de SILSANPLEX

Supabase administra autenticación, datos multiempresa, RLS, funciones y auditoría.

Durante el MVP, cada identidad puede tener una sola membresía activa. Una
organización representa un cliente de la plataforma; sus administradores no
pueden crear otras organizaciones. Los permisos efectivos se derivan de los
roles en PostgreSQL y deben aplicarse también mediante RLS o RPC en cada módulo
operativo que se incorpore.

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

## E2E local de autenticación

Las pruebas de Playwright requieren dos identidades confirmadas y separadas:
un administrador y un miembro con rol `VENTAS`. No utilizan invitaciones ni
Mailpit; su objetivo es validar sesiones y autorización con datos reproducibles.

1. Añadir en `backend/.env.local` valores exclusivos de desarrollo para:
   `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_MEMBER_EMAIL` y
   `E2E_MEMBER_PASSWORD`.
2. Iniciar Supabase local y aplicar las migraciones.
3. Desde `frontend/`, ejecutar:

```bash
npm run test:e2e:local
```

Ese comando ejecuta primero `backend/npm run e2e:prepare`, crea o actualiza
ambas identidades en Supabase local, les asigna `ADMIN` y `VENTAS` en la
organización configurada y genera `frontend/.env.e2e.local`. El archivo contiene
credenciales locales, está ignorado por Git y no debe compartirse.

El aprovisionamiento tiene una guardia estricta: solo admite
`http://127.0.0.1:54321`, `localhost` o `::1` con ese puerto. Nunca debe usarse
contra un proyecto Supabase remoto. Tampoco imprime las contraseñas.

Playwright falla de inmediato cuando faltan credenciales; ya no convierte esa
configuración incompleta en pruebas omitidas. El resultado esperado del archivo
`auth.spec.ts` es `5 passed` y `0 skipped`.

En CI no se ejecuta el aprovisionamiento local. Las cuatro variables E2E se
configuran como secretos del entorno y `npm run test:e2e` consume esos valores.
