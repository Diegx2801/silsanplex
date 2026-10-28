# Revisión de SILSANPLEX — 21 de octubre de 2026

> Actualización posterior: las validaciones SQL/E2E que aquí se describen como
> bloqueadas o fallidas se completaron tras recuperar la instancia y corregir
> fixtures de fechas. Resultado final: 147/147 migraciones aplicadas, 3.181
> pruebas SQL aprobadas y 23 E2E aprobadas. Véase
> [Validación SQL y E2E](./VALIDACION_SQL_E2E_2026-10-21.md).

## Alcance y límites

Revisión de estructura, documentación, rutas, estado de Git, configuración de
hooks, scripts de validación, módulos operativos y pruebas automatizadas.
No equivale a una auditoría exhaustiva de seguridad ni a aceptación funcional en
producción. Las pruebas SQL y de navegador no pudieron completarse por el entorno
local. No se modificaron esquemas ni se reiniciaron bases de otros proyectos.

## Git y actualización

- Rama: `main`; remoto: `https://github.com/Diegx2801/silsanplex.git`.
- Se ejecutó `git fetch origin`; `HEAD...origin/main` devolvió `0 0`.
- Último commit local y remoto: `df41d90`, trazabilidad de lotes por entrega.
- Commits anteriores: `29ee8ed` (despacho físico), `c55adc7` (contrato de
  entregas), `7a0fefd` (idempotencia de devoluciones a proveedores), `653dbcb`
  (pruebas de recepción inspeccionada).
- No había commits remotos nuevos por incorporar. No se creó ni publicó un commit.
- `.codex/` y `output/` ya estaban sin seguimiento antes de esta revisión.

## Arquitectura y estado funcional

El proyecto existente usa React 19, TypeScript, Vite, Tailwind, React Router,
TanStack Query, React Hook Form y Zod. El backend es Supabase con PostgreSQL,
Auth, RLS, RPC y Edge Functions. No requiere un cambio de stack.

Las páginas están en `frontend/src/app/paginas`; los módulos separan estado,
modelos, servicios y componentes. Autenticación y usuarios viven en `features`.
El backend contiene 147 migraciones y 95 archivos de pruebas SQL; estas cifras
describen archivos existentes, no pruebas ejecutadas ni aprobadas.

| Área | Evidencia del repositorio | Pendiente de validación o implementación |
| --- | --- | --- |
| Acceso y usuarios | Auth, permisos, administración y pruebas unitarias/E2E | Ejecutar E2E contra la base correcta; verificar configuración de correo del despliegue |
| Productos | Catálogo, importación, exportación y servicios persistentes | Validación integral de importaciones y permisos con SQL/E2E |
| Inventario | Stock, lotes, FEFO, Kardex, almacenes, ubicaciones y transferencias | Ejecutar pruebas SQL de integridad y concurrencia y E2E |
| Proveedores y compras | Persistencia, historial de precios, comparación, desempeño, recepción inspeccionada y devoluciones | Verificar flujo transaccional completo en base local |
| Clientes y ventas | Clientes, cotizaciones persistentes, pedidos, reservas y despachos | Validar venta y despacho reales con Playwright y SQL |
| Reparaciones | Estados, diagnóstico, cotización, repuestos y pruebas técnicas | Validar integración, permisos y concurrencia en base local |
| Distribución | Programación, resultados y asignación de movimientos/lotes | Verificar en ejecución los contratos de los tres últimos commits |
| Reportes | Ruta generada con `ModuloPendientePage` | Implementar consultas, filtros, permisos y exportaciones |
| Configuración | Ruta generada con `ModuloPendientePage` | Definir parámetros y construir mantenimiento autorizado |
| Caja y cuentas corrientes | Pendientes en el plan; no hay módulo dedicado en la navegación revisada | Definir reglas y desarrollar flujo financiero; no confundir venta con cobro |

## Los cinco hooks que requieren aprobación

Fuente: `.codex/hooks.json`, configuración local sin seguimiento Git. Pertenecen
a Token Optimizer y al ciclo de trabajo de Codex; no son hooks de React ni
operaciones de negocio de SILSAN.

| Evento | Comando de destino | Propósito según configuración/código leído |
| --- | --- | --- |
| SessionStart | `codex_hook_bridge.py session-start` | Comprobación del optimizador y recuperación de contexto según inicio de sesión |
| UserPromptSubmit | `codex_hook_bridge.py user-prompt-submit` | Contexto y sugerencias del optimizador al enviar un mensaje |
| Stop | `measure.py session-end-flush --trigger stop --quiet --defer` | Solicitar el registro diferido de métricas al terminar |
| SubagentStart | `codex_hook_bridge.py subagent-start` | Registrar apertura de subagente y advertir acumulación |
| SubagentStop | `codex_hook_bridge.py subagent-stop` | Registrar cierre de subagente |

El JSON es válido y Python existe. Los scripts de destino del optimizador
también existen. Sin embargo, los cinco comandos dependen del mismo ejecutor:
`C:\Users\ADMIN\.codex\hooks\run.py`, que no existe.

Se reprodujo el fallo invocando Python con esa ruta: código de salida 2,
`can't open file ... [Errno 2] No such file or directory`. Por tanto, aprobar
la definición actual no resuelve su funcionamiento. `Stop` y `SubagentStop`
además redirigen la salida a `NUL`, dificultando ver errores.

La documentación oficial establece que los hooks no administrados nuevos o
modificados requieren revisión y confianza sobre su definición exacta. Se
omiten hasta que el usuario los aprueba. Esto explica el aviso, pero no implica
que los comandos sean correctos ni que SILSAN esté bloqueado.
Fuente: [Hooks — revisión y confianza](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks).

Acción pendiente: restaurar el ejecutor desde la instalación correspondiente
del optimizador o corregir los comandos con el mecanismo de ejecución adecuado;
después probar los cinco eventos y revisar/aprobar la definición final en Codex.
No se alteró la configuración ni se aprobó confianza automáticamente. La revisión
de estos scripts fue estática y parcial; no certifica todos sus efectos indirectos.

## Resultados de pruebas

| Verificación | Resultado |
| --- | --- |
| Vitest inicial | 575 aprobadas, 2 fallidas, 88 archivos |
| Vitest tras corrección del test | 578 aprobadas, 0 fallidas, 88 archivos |
| Lint frontend `--deny-warnings` | Aprobado |
| Compilación frontend | Aprobada; advertencia por fragmento de Distribución superior a 500 kB |
| Tipos E2E | Aprobados |
| Tipos de scripts backend | Aprobados |
| Edge Functions | Comprobación de tipos y 24 pruebas aprobadas: 12 administración, 8 RUC, 4 DNI |
| Pruebas SQL | Bloqueadas: conexión rechazada a `127.0.0.1:54322` |
| Playwright local | Preparación fallida: no se encuentra `public.organizations` en la caché del esquema; no se ejecutaron los escenarios de navegador |
| Auditoría npm backend, solo runtime | 0 vulnerabilidades informadas |
| Auditoría npm frontend, solo runtime | 1 vulnerabilidad baja informada en DOMPurify; ninguna alta/crítica informada |

### Corrección realizada

`useOperacionesVenta.test.tsx` usaba una cotización válida hasta el 30 de
septiembre de 2026 junto con el reloj real. Después de esa fecha, dos escenarios
de éxito dejaban de crear el pedido por la validación correcta de vencimiento.

Se fijó la fecha de negocio mediante un espía restaurado después de cada test y
se añadió un escenario que verifica el rechazo de cotizaciones vencidas, sin
llamar a la RPC ni al callback de aceptación. No se cambió la lógica productiva.

### Bloqueo del entorno local

La configuración identifica el proyecto Supabase como `backend`, con API en
54321 y PostgreSQL en 54322. `supabase status` confirma que no existe
`supabase_db_backend`. Docker muestra contenedores de otros proyectos
(`vamelstore` y `vamelgroupshardening`). La causa exacta de la respuesta de la API
en 54321 requiere comprobar puertos y configuración antes de aprovisionar usuarios.

Pendiente: aislar el proyecto/puertos, iniciar Supabase de SILSAN y aplicar sus
migraciones en una base de pruebas identificada. Después ejecutar `db:lint`,
las 95 suites SQL y `test:e2e:local`. No ejecutar un reset sobre una instancia
compartida ni considerar estos controles aprobados por tener tests unitarios verdes.

## Pendientes priorizados

1. **Entorno reproducible:** resolver la instancia local correcta para completar
   SQL, concurrencia y E2E. Añadir una comprobación de identidad/esquema de SILSAN
   antes de preparar fixtures sobre los puertos locales compartidos.
2. **Hooks:** reparar la dependencia ausente y probarlos antes de confiar en su
   definición final; son independientes del funcionamiento de la aplicación.
3. **Documentación:** actualizar README, CODEX, PRODUCT y PLAN_TRABAJO. CODEX
   describe Supabase como futuro y algunas reglas como indefinidas pese a que ya
   hay código, migraciones y pruebas; el plan tampoco refleja todos los avances.
4. **Alcance funcional pendiente:** Reportes, Configuración y flujo de caja/cobros;
   establecer criterios de aceptación antes de implementar.
5. **Dependencias:** revisar y actualizar DOMPurify compatible con sus consumidores
   según el lockfile; confirmar alcance de los avisos sin asumir explotación.
6. **Carga de Distribución:** diferir la carga de exportadores PDF u otros módulos
   pesados cuando se usen; comprobar el resultado con una compilación posterior.
7. **Aceptación:** contrastar el sistema con una matriz actualizada de requisitos
   y un recorrido completo compra → recepción → reserva → venta → despacho →
   entrega, incluidos permisos de otras empresas y operaciones parciales.

Los siguientes pasos quedan documentados; esta revisión no implementa módulos
nuevos ni declara listo el sistema para producción sin las validaciones pendientes.

## Actualización: Docker cambiado a SILSAN

Por indicación del usuario se detuvieron los contenedores de `vamelstore` y
`vamelgroupshardening` conservando sus contenedores y volúmenes. Se ejecutó
`npm run db:start` desde `backend/`, reutilizando `supabase_db_backend`.

Se confirmó mediante SQL la organización `Droguería SILSAN S.A.C.`, las 147
migraciones aplicadas y la última versión `20260929154604`. El identificador
interno se conserva como `backend` para reutilizar sus datos existentes.
También se regeneró `frontend/.env.local` con la configuración pública de esta
instancia. API: `http://127.0.0.1:54321`; Studio: `http://127.0.0.1:54323`.

La preparación de usuarios y fixtures E2E terminó correctamente. Playwright
ejecutó **23 pruebas y todas pasaron**, incluidos autenticación, clientes,
inventario FEFO, reparaciones y formulario de ventas (53,7 segundos).

El bloqueo de conexión descrito anteriormente quedó resuelto. La nueva ejecución
de la suite SQL terminó con error: se observaron seis aserciones fallidas en
`inventory_kardex_determinism.test.sql` (selección FEFO, saldos y transferencia)
y `SALES_QUOTE_EXPIRED` en `sales_quotes_persistence.test.sql`. Estos resultados
requieren investigar los fixtures y sus fechas antes de atribuirlos a una
regresión productiva. No se modificó lógica SQL durante el cambio de proyecto.

El contenedor `supabase_vector_backend` se reinicia porque su recolector no
consigue conectar con la fuente de logs de Docker. PostgreSQL, Auth, API y Studio
están activos; queda pendiente reparar la recolección de logs local.
