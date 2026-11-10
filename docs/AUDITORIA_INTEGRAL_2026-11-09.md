# SILSANPLEX: consolidación y auditoría integral

Fecha de referencia: 9 de noviembre de 2026, America/Lima.

## Alcance y veredicto

La base remota revisada es `e606634a5a67f3a65b7e929a8c926f14bc1a0084`.
Se inspeccionaron código, migraciones, políticas, servicios, rutas, pruebas y CI;
se ejecutaron flujos con Auth, PostgreSQL, PostgREST, Edge y navegador en proyectos
desechables. No se modificaron bases persistentes ni se emitieron documentos fiscales.

**Apta para continuar desarrollo con los bloqueos registrados; no aprobada para
desplegar el sistema completo en producción.** Hay una brecha reproducida de
revocación de sesión, facturación exclusivamente sandbox y ausencia de caja/tesorería.
Una compilación o una suite aprobada no certifican funciones que no cubren.

Esta es una auditoría transversal con cobertura explícita, no una certificación
exhaustiva de cada archivo ni de la configuración hospedada. Los dos proyectos
del conector Supabase disponible pertenecen a otras aplicaciones; no se accedió
a sus tablas. No se pudo contrastar el esquema de un despliegue SILSANPLEX real.

## Estado inicial y preservación

- Rama inicial: `codex/fase-ux-2c-compras`, HEAD `71e7329`, sincronizada con su remoto.
- `main` local: `82f3df5`; después de fetch quedó 29 commits detrás del remoto.
- Sin modificaciones rastreadas ni conflictos detectados.
- Archivos locales sin seguimiento: `.codex/`, `output/`,
  `docs/PLAN_PUBLICACION_POST_2C.md`, `docs/ROTACION_CREDENCIALES_E2E_LOCAL.md`.
  Permanecen intactos, sin incorporarse a commits.
- Un worktree inicial. Se creó `silsanplex-audit-20261109` en rama
  `codex/consolidacion-auditoria-20261109` para aislar instalación, cambios y pruebas.
- Se actualizó `main` local por fast-forward a `e606634`, conservando las ramas
  antiguas. No se hizo reset, force-push, eliminación de ramas ni limpieza de archivos.
- Los stacks existentes `backend` y `silsanplexp2c2` no fueron reiniciados ni reseteados.

## Ramas, PR y cambios incorporados previamente

La consulta paginada de los 79 PR existentes devolvió **78 fusionados, uno cerrado
sin fusionar, cero abiertos y cero Draft**. Los históricos SUNAT ya no eran Draft;
no había una autorización anterior pendiente que pudiera reutilizarse.

| PR | Contenido ya presente en main |
|---|---|
| #59, #61 | Persistencia fiscal sandbox y consulta fiscal |
| #60 | Correcciones de dependencias Zod/fast-uri |
| #68, #72, #75 | Mínimo privilegio y validación/CI fiscal reconciliados |
| #76, #77 | Costos reales de reparación y ajustes sobre posiciones existentes |
| #78 | Flujo de facturación sandbox y contrato futuro PSE; no emisión real |
| #79–#82 | UX responsive, ventas, reparaciones y compras |
| #83 | Lecturas de auditoría condicionadas a sesión activa |
| #84 | Consumo de repuestos con calendario de Lima y concurrencia |
| #85 | Rechazos de compras, alertas, kardex, distribución y reparación |

Todos los refs remotos salvo `origin/feature/almacen-persistente` son ancestros de
`origin/main`. Las excepciones locales se analizaron con ancestry y `git cherry`:

| Referencia/commit | Decisión |
|---|---|
| `codex/c3-pre-rebase-7453d51` / `7453d51` | Patch equivalente ya incorporado; no duplicar |
| `codex/issue62-reconciliation-main-6860879` / `27f00b8` | Solo historia de reconciliación, sin patch nuevo según git cherry |
| `codex/issue68-authprovider-503-test` / `a0c4c63` | Mejora válida de regresión; cherry-pick como `44de8c5` |
| `feature/almacen-persistente` / `cda7fa5` | Mantener aislado: implementación antigua de agosto, no equivalente y con contratos/UX reemplazados posteriormente |
| PR #69 / `14878fb` | Cerrado de prueba de ruleset; su descripción exige no fusionarlo; no funcionalidad pendiente |

La distribución vigente sí persiste y pasó los flujos operativos. Eso no demuestra
que cada intención del commit antiguo `cda7fa5` esté cubierta: requeriría una
comparación funcional específica antes de rescatar cualquier diferencia.

## Arquitectura y base de datos

- React 19/TypeScript/Vite/Tailwind; React Query para datos, formularios y servicios
  separados por módulo. Rutas lazy, guardas de permisos y estados de carga/error.
- Backend efectivo: Supabase Auth, PostgreSQL con RPC/RLS, Storage y Edge Functions
  `admin-users`, `ruc-lookup`, `dni-lookup`. No hay servidor Express/Nest ni Spring.
- Operaciones sensibles resueltas en PostgreSQL con transacciones, claves de
  operación, versiones optimistas y locks; la UI no es la barrera de seguridad.
- **180 migraciones** aplicadas a una base nueva. En el catálogo aislado:
  **81 tablas públicas, cero sin RLS, cero funciones SECURITY DEFINER públicas
  ejecutables por anon, cero índices inválidos y cero vistas públicas sin
  security_invoker**. Esto no equivale a demostrar que toda política es correcta.
- PK/FK compuestas, restricciones de estados/cantidades y snapshots históricos
  mantienen relaciones de organización y trazabilidad en los caminos probados.
- Deuda: múltiples redefiniciones históricas de RPC, helpers `unchecked` y wrappers,
  páginas/servicios extensos. Para revisar seguridad debe reconstruirse la definición
  final, sus privilegios y todos sus consumidores, no solo buscar la primera migración.
- No se modificó el historial de migraciones ni se añadió un cambio de esquema.
- README inicial y backend describían un sistema y permisos anteriores; se actualizaron.

## Estado por módulo

| Módulo | Evidencia de comportamiento | Estado y límites |
|---|---|---|
| Autenticación/usuarios | Login, cambio de contraseña, foco, sesión revocada, permisos y Edge; regresión de invitación | Funcional en caminos probados; brecha de revocación en consumidores operativos fuera de Edge |
| Productos | Servicios persistentes, importación, validación y selección después del registro 1000 | Funcional; permisos/Storage de productos requieren endurecer sesión |
| Inventario/almacenes | FEFO multilote, kardex, disponibilidad/reservas, valorización y movimientos reales | Funcional en escenarios cubiertos; no benchmark de carga productiva ni conciliación de datos reales |
| Compras/proveedores | Orden→emisión→recepción inspeccionada→stock; tests SQL de parciales/rechazos y retornos | Funcional en escenarios cubiertos; emisión de orden no es emisión fiscal ni pago |
| Ventas | Cotización→pedido→reserva→venta→despacho, cantidades y trazabilidad | Funcional en escenarios cubiertos; sin libro de cobros ni ciclo completo de devoluciones fiscales |
| Distribución | Entregas múltiples, parciales, resultado idempotente, respuesta perdida y consumo físico único | Funcional en escenarios cubiertos; no equivale a guía electrónica SUNAT real |
| Reparaciones | R06/R33 accesorios, no reparable, pruebas técnicas, garantías al entregar, R13/R14 costos y permisos | Amplia evidencia SQL/E2E; costos documentados no son caja/contabilidad |
| SUNAT | Preparación, snapshot, serie/correlativo interno, consulta, permisos y simulación local | Parcial: solo sandbox; no XML firmado, transporte PSE/SUNAT, CDR oficial ni contingencia productiva |
| Caja/finanzas | Existen importes, vencimientos, costos y JSON de condiciones de pago | No hay módulo completo de cobros/pagos, libro de caja ni conciliación bancaria |
| Reportes/auditoría | Kardex y movimientos persistentes; D01 prueba lecturas revocadas y tenant | Funcional en consultas probadas; no certificación de reportes contables |
| UX | Pruebas de formularios, errores recuperables y E2E en Chromium | Evidencia automatizada; no prueba de empleados, dispositivos físicos o accesibilidad exhaustiva |

No se atribuye funcionalidad de caja ni aceptación tributaria al hecho de guardar
una venta o descargar un recibo simulado. XML, firma, envío, CDR y consulta oficial
requieren implementación/contrato externo y pruebas sandbox del proveedor elegido.

## Hallazgos y correcciones

| ID | Severidad | Causa y evidencia | Situación |
|---|---|---|---|
| S01 | Media, bloqueo de despliegue | `has_organization_permission` y el helper optimizado resuelven membresía/permisos sin validar `auth.sessions`; productos, archivos de productos y despacho tienen recorridos afectados | Pendiente; no se introdujo cambio central de alto alcance sin adaptar y validar todos sus consumidores |
| S02 | Media | `createUser` llamaba Auth Admin/invite antes de `admin_create_user_membership`; rechazar después no revierte el correo | Corregido en rama: guardia `resolve_admin_organization` antes de Auth Admin y validación posterior conservada; cinco pruebas nuevas + E2E real |
| D01 | Crítica/alta en herramientas según npm, sin explotación de app demostrada | Lockfile inicial: 21 avisos, 1 crítico/9 altos/10 moderados/1 bajo; runtime cero | Actualización compatible sin force: quedan 6 (4 moderados/2 bajos), todos dev; runtime cero |
| T01 | Baja | Una copia sin `.env.local` fallaba en 11 suites al importar cliente Supabase | Corregido: variables ficticias fijas solo en Vitest; no requiere ni hereda credenciales de proyecto |
| P01 | Media, rendimiento | Plan aislado de repair_list con 1.200 reparaciones/6.000 eventos: listado 370,987 ms y count 732,227 ms en primera ejecución | Investigar proyecciones/agregados y conteo; medición local sin SLA ni extrapolación a producción |
| P02 | Baja, rendimiento | Chunk Distribución ~505 kB minificado, XLSX ~492 kB; advertencia build | Pendiente separación de importaciones pesadas/exportación bajo demanda |
| Q01 | Baja | Pruebas aprobadas emiten `Query data cannot be undefined` por mocks incompletos de compras/fiscal | Pendiente mejorar fixtures; no se demostró fallo equivalente en servicio real |
| F01 | Alta para objetivo de producto | Facturación no implementa emisión fiscal real | Bloqueo de despliegue como facturador; mantener sandbox explícito |
| F02 | Alta para objetivo de producto | Falta caja/tesorería/conciliación | Bloqueo para operación financiera integral; no inventar reglas de negocio |

No se confirmó una vulnerabilidad crítica de aplicación ni pérdida de datos.
La severidad de npm corresponde a dependencias; no es prueba de que esos vectores
sean explotables en el bundle del navegador. Los seis avisos residuales provienen
de tooling shadcn/registry/ts-morph/minimatch/deepmerge. La sugerencia `--force`
incluye un cambio mayor/downgrade y no se ejecutó.

Reproducción de S01 en el PostgreSQL desechable, con usuario/organización/producto
propios de la transacción: sesión activa → `session=true, permission=true`;
eliminada la fila de `auth.sessions` → `session=false, permission=true`;
UPDATE del producto con actor válido → **1 fila modificada**; ROLLBACK → **0
organizaciones residuales**. La primera tentativa omitía `updated_by` y RLS la
rechazó correctamente; se corrigió el fixture y se reprodujo la brecha de sesión.
La ruta de despacho y Storage se sustentan además en sus políticas/definiciones;
no se enviaron comprobantes ni se manipularon objetos persistentes.

La consulta DNI carece del límite local existente en RUC. Se registra como revisión
pendiente de cuotas/controles externos, no como vulnerabilidad pública confirmada.
La unicidad global de RUC/ambiente/tipo/serie fiscal fue contrastada con el diseño
documentado; no se clasificó automáticamente como fallo de aislamiento.

## Pruebas y procedencia

### Ejecutadas localmente antes del conjunto final

- Baseline: 1.138/1.138 Vitest en 137 archivos con variables ficticias.
- Sin configuración ficticia, primera ejecución: 126 suites pasaron, 11 no cargaron;
  no eran 11 fallos funcionales de negocio. La corrección T01 elimina esa dependencia.
- Después de incorporar el test HTTP 503 y T01: 1.138/1.138 en 137 archivos con
  `npm run test` sin configuración local.
- Edge: 32 pruebas existentes (13 admin, 8 RUC, 4 DNI, 7 simulador); después
  de S02, admin pasa 18/18, incluidas cinco nuevas.
- Runner fiscal Python: 65/65; guards del entorno fiscal Node: 18/18.
- Lint sin warnings, typecheck frontend/E2E/scripts y build aprobados.
- Primera corrida desechable: 180 migraciones, lint SQL sin errores,
  35 suites SQL / 2.369 aserciones; 27 E2E generales + 10 accesorios + 9 no reparable
  + 3 finalización técnica + 5 costo real + 2 auditoría = **56 E2E aprobados**.
- El flujo de entregas parciales probó recibido=10, despachado=6, entregado=6,
  stock físico final=4 y reservas pendientes=0; el reintento no duplicó movimientos.

### Conjunto final de esta rama

La corrida final sobre `3a1154674db08d9bebe6ec1d2080fc0595434be2` usó el
lockfile actualizado, la corrección de invitaciones, el E2E nuevo,
`--workflow-e2e --all-sql --checks` y un proyecto nuevo. Terminó con código 0:

- 180 migraciones; SQL lint aprobado y sonda deliberadamente inválida rechazada.
- **125 suites SQL / 5.197 aserciones aprobadas**.
- **57 E2E aprobados**, sin casos omitidos, inesperados ni flaky: 28 generales,
  10 accesorios, 9 no reparable, 3 finalización técnica, 5 costos y 2 auditoría.
- **1.138 Vitest aprobadas** en 137 archivos, Vitest 4.1.12.
- Lint sin warnings, typecheck frontend/E2E/scripts y build Vite 8.3.7 aprobados.
- Edge final: **37 pruebas aprobadas** (18 admin, 8 RUC, 4 DNI, 7 simulador).
- Pruebas visuales de compras y reparaciones: seis viewports cada una
  (360×800, 390×844, 768×1024, 1280×720, 1440×900, 1600×900), sin solicitudes
  externas/errores de página ni desbordamiento, con foco visible; fixtures ficticios.
- Limpieza del proyecto propio completada. Los stacks existentes se conservaron.

Evidencia local de la corrida final:
`%LOCALAPPDATA%/Temp/opencode/silsan-accessories-1j3aUf/evidence/`.
Contiene manifest de migraciones, resultados SQL, JSON E2E, unitarios, lint,
typecheck, build y limpieza. No se adjuntaron trazas ni credenciales al repositorio.
Los cambios de dependencias directas de producción son **cero**; cambiaron
Vite 8.2.1→8.3.7, Vitest 4.1.11→4.1.12 y shadcn 4.18.0→4.23.0, con transitivas
compatibles. `npm ci --ignore-scripts` verificó el lockfile actualizado.

### Evidencia remota existente, distinta de una ejecución local nueva

[Actions 42676179420](https://github.com/Diegx2801/silsanplex/actions/runs/42676179420)
aprobó sobre el SHA exacto `e606634`: seis jobs correctos, 125 suites SQL /
5.197 aserciones, 1.138 Vitest, 21 E2E de flujo principal y suite aislada de
reparaciones; SUNAT transaccional, runner Python/concurrencia y consulta fiscal
aislada aprobaron. Los cierres de recursos propios también aprobaron.

Es evidencia del main inicial auditado, no una aprobación transferible a commits
nuevos. La rama de consolidación debe completar CI propio antes del merge.

### Bloqueadas/no verificadas

- Esquema/datos/configuración real desplegada, backups y restauración.
- Emisión fiscal oficial, XML/firma/CDR/contingencias: sin implementación ni credenciales.
- Caja/conciliación/contabilidad integral: sin módulo completo.
- Pruebas en dispositivos físicos, usuarios reales, carga sostenida y SLA.
- Cero vulnerabilidades no significa auditoría exhaustiva: la revisión de seguridad
  fue parcial y conservó preguntas sobre consumidores y configuración externa.

## Prioridades y criterios para despliegue

1. Cerrar S01 con una política explícita para el actor actual y cubrir roles API,
   RLS de lectura/escritura, Storage y wrappers de RPC. No cambiar indiscriminadamente
   `user_has_organization_permission`, que también consulta capacidades ajenas.
   Regresión: mismo JWT firmado vigente antes/después de revocar, sin lecturas,
   escrituras ni nuevas URLs firmadas, conservando servicio y aislamiento tenant.
2. Validar S02 en CI del SHA final y desplegar después solo el código aprobado;
   no se desplegaron Edge Functions desde esta auditoría.
3. Definir alcance financiero, cobros/pagos, anulaciones/devoluciones y conciliación
   con sus invariantes, idempotencia y auditoría antes de construir caja.
4. Elegir PSE/contrato y diseñar XML/firma, CDR, reintentos/recuperación, correlativos,
   bajas/notas y contingencias. Toda primera validación debe ser sandbox del proveedor.
5. Comparar migraciones/RLS realmente desplegadas y probar backup/restauración en
   aislamiento; revisar índices con consultas y cardinalidades representativas.
6. Resolver deuda de rendimiento medida, avisos dev y mocks ruidosos mediante PR
   pequeños, manteniendo la suite transversal como requisito.

No se migró, desplegó ni reinició un servicio persistente. La integración de código
mediante PR no representa autorización ni certificación de despliegue productivo.
