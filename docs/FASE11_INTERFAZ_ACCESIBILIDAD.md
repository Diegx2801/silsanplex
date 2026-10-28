# SILSANPLEX — Fase 1.1: interfaz y accesibilidad

Fecha: 2026-10-21. Base: `df41d90`. Cambios locales, sin commit ni push.

## Correcciones

1. **Pedido:** el diálogo centrado crecía con la dirección manual sin limitar su altura y desplazaba el pie fuera del viewport. Ahora usa `max-h-[90svh]`, contenedor flex y `overflow-hidden`; encabezado y pie no se contraen. El cuerpo del formulario tiene `min-h-0` y desplazamiento vertical propio. Los errores permanecen dentro del contenido desplazable. Se conservan submit, validaciones, estados de carga y gestión de foco de Radix.
2. **Distribución:** el `id="programar-title"` manual sustituía el ID de `DialogPrimitive.Title`, pero `Content` seguía referenciando el generado por Radix. Se elimina únicamente ese ID manual; Radix vuelve a asociar título y diálogo para Programar entrega, Editar planificación y Reprogramar entrega.

## Cobertura automatizada

Se reutiliza el escenario integral y el mismo fixture, parametrizados a 1280×720 y 1440×1080. Compras, recepción, lote/vencimiento, pedido, reserva, despacho, programación y entrega usan operaciones reales desde React. Las verificaciones persistentes se realizan desde Node con el usuario autenticado y las comprobaciones existentes de identidad de la instancia local SILSAN.

- Dirección manual, diálogo completo y ambos botones dentro del viewport.
- Pedido: Escape cierra y restaura el foco; Enter reabre; Tab y Shift+Tab recorren el pie y respetan el confinamiento de foco. Confirmación mediante Enter a 720 y clic normal a 1080.
- Los tres títulos de Distribución se localizan mediante `getByRole('dialog', { name: ..., exact: true })`.
- Editar planificación se cierra mediante Escape. Reprogramar se abre mediante Enter y se cancela con Tab y Enter sin guardar cambios.
- Para habilitar legítimamente Reprogramar se registra una recepción parcial real de 2 unidades y después una recepción adicional de 2. Se comprueban exactamente dos resultados, sus líneas y suma 4; un único documento, reserva, entrega y asignación; dos movimientos de inventario. Saldo final: físico 6, reservado 0, disponible 6, recibido 10, despachado y entregado 4.
- No hay clics forzados, modificaciones del DOM ni mocks de operaciones centrales. La lectura de validez HTML es diagnóstica y no modifica el formulario.

## Alcance y observaciones

Archivos de esta fase: los dos componentes indicados, `frontend/tests/e2e/operational-flow.spec.ts` y este informe. El fixture operativo, los tres fixtures SQL con cambios previos, `useOperacionesVenta.test.tsx`, el informe de Fase 1 y `.codex/hooks.json` se conservan mediante comparación SHA-256 con la línea base.

En las primeras ejecuciones fallaron aserciones nuevas de restauración de foco al botón externo de Distribución: sus diálogos controlados no tienen un `DialogPrimitive.Trigger` asociado. Es una limitación previa, fuera de los dos defectos autorizados; no se cambió esa lógica. El pedido sí tiene restauración comprobada. Otras iteraciones corrigieron expectativas del test sobre el estado que permite reprogramar y el nombre real «Registrar recepción adicional».

No se repiten pruebas SQL: los únicos cambios productivos son estructura/clases de presentación y asociación del título de Radix. No cambian servicios, RPC, contratos, permisos, esquema, migraciones ni reglas transaccionales. La evidencia SQL histórica permanece en `VALIDACION_SQL_E2E_2026-10-21.md`; no se atribuye una nueva ejecución SQL a esta fase.

## Validación efectiva

Comandos ejecutados desde `frontend` mediante RTK. Los logs quedan en `output/` sin agregar a Git.

| Comando | Resultado efectivo | Evidencia |
| --- | --- | --- |
| `npm run test:e2e:typecheck` | PASS, código 0 | `output/fase11-typecheck.log` |
| `npm run test:e2e:local -- operational-flow.spec.ts` | PASS, 2/2, 30.1 s | `output/fase11-integral-final.log` |
| `npm run test:e2e:local` | PASS, 25/25, 1.6 min | `output/fase11-e2e-full.log` |
| `npm test` | PASS, 578 pruebas / 88 archivos | `output/fase11-vitest.log` |
| `npm run lint -- --deny-warnings` | PASS, código 0 | `output/fase11-lint.log` |
| `npm run build` | PASS, código 0 | `output/fase11-build.log` |
| `git diff --check` | PASS | Sin errores de whitespace |

| Viewport | Flujo integral focalizado | Confirmación del pedido | Accesibilidad |
| --- | --- | --- | --- |
| 1280×720 | PASS, 14.1 s | Enter; ambos botones completamente dentro del viewport | Tres nombres de Distribución y navegación de teclado aprobados |
| 1440×1080 | PASS, 13.9 s | Clic normal; ambos botones completamente dentro del viewport | Tres nombres de Distribución y navegación de teclado aprobados |

Las capturas `pedido-viewport.png` y los JSON de trazabilidad se generan por caso bajo `frontend/test-results/`. La inspección visual confirmó pie accesible y contenido desplazable a 720, y disposición correcta a 1080. El build conserva el aviso previo de bundle de Distribución de 505.41 kB; lint no produjo warnings. Los mensajes de RTK sobre hooks y de Node sobre FORCE_COLOR son avisos del entorno, no errores de las validaciones.

La suite completa repitió satisfactoriamente ambos flujos integrales (14.2 s a 1280×720 y 14.4 s a 1440×1080). Copias de las capturas finales: `output/fase11-1280x720.png` y `output/fase11-1440x1080.png`. No se detectaron regresiones en las comprobaciones ejecutadas. La limitación de restauración de foco de Distribución descrita arriba queda pendiente fuera de este alcance.

## Estado final de Git

Rama `main`, HEAD `df41d90`, sin diferencia de commits respecto de la referencia local `origin/main` (0/0). Índice vacío. Se mantienen los cambios previos y los archivos sin seguimiento; `.codex/` y `output/` no se agregaron al índice. Sin commits, push, resets, eliminación de datos ni cambios de seguridad o migraciones.
