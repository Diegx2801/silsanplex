# Reparaciones: atención ampliada

Validación local: 28 de octubre de 2026. Complementa el primer bloque, conservando su flujo técnico, reservas, permisos y concurrencia.

## Alcance implementado

- Solicitante cliente o área interna; equipo del catálogo o descripción externa. Solo se piden los campos de la opción elegida. Un equipo recibido no crea producto, cliente ni stock ficticio.
- Identidad y snapshots persistentes, compatibles con órdenes anteriores. Correcciones bloqueadas tras historial técnico o evidencia. La recepción en garantía existente no se confunde con la garantía posterior al trabajo.
- Envío y retorno de equipo con proveedor activo de la organización. Fechas reales de custodia asignadas por el servidor, fecha prevista si se acordó, costo total y moneda al retornar. Una sola custodia abierta por orden. No crea compra, pago ni movimiento de inventario.
- La custodia pendiente aparece en el siguiente paso aunque la sección esté plegada. El servidor bloquea pruebas, preparación de entrega y cierre mientras el equipo no haya retornado.
- Garantía de servicio explícita: días y cobertura, editable antes de entregar; la promesa existente no cambia después de la entrega. Inicio y fin se derivan de la entrega real, sin cobertura inventada por defecto.
- Adjuntos privados PDF/JPEG/PNG/WebP de hasta 5 MiB, permisos por organización y orden, descarga firmada durante 60 segundos. Evidencia sin sobrescritura/borrado desde la interfaz; registro auditado y versión de orden incrementada.
- Servicio externo, garantía y adjuntos plegados para no recargar la atención habitual. Cargas diferidas; formularios con errores, estados de espera y reintentos persistentes para los nuevos comandos. Reintentos de creación anteriores conservan su intención y huella originales.

## Arquitectura y contratos

Cinco migraciones incrementales añaden identidad ampliada, tablas de custodia/garantía/evidencia, RLS y guardas de integridad. No se reinició la base.

Los RPC existentes `create_repair`/`update_repair` conservan su firma JSON. Los nuevos comandos `send_repair_external_service`, `receive_repair_external_service` y `configure_repair_service_warranty` exigen organización, orden, clave de operación y versión esperada. Las escrituras directas de custodia/garantía permanecen denegadas.

Servicios frontend separados para atención complementaria y archivos; el detalle monta secciones independientes. No se añadió dependencia nueva ni se cambió el contrato de consumo de inventario.

## Verificación

- 132 pruebas de frontend del módulo y de su página aprobadas (15 archivos).
- 821 verificaciones de datos de Reparaciones aprobadas (19 archivos), incluidas concurrencia, permisos, stock e idempotencia.
- TypeScript, build y lint del alcance; lint PostgreSQL público sin errores. Build conserva la advertencia existente de chunk grande en Distribución.
- Suite general: 796 aprobadas y 2 fallidas antes de la última prueba adicional. Ambas fallas son las previamente existentes en `useOperacionesVenta.test.tsx`, cuyos datos de cotización vencieron; no se tocaron Ventas ni se ocultaron esas fallas.
- Navegador a 1003 × 892 y 390 × 844: recepción cliente/catálogo e interna/externa, campos condicionales, cierre sin guardar y sin desborde horizontal (390 px de contenido para 390 px de pantalla). Capturas excluidas de Git en `playwright-report/screenshots/`.
- Servicio externo, garantía, adjuntos y detalle se comprobaron con pruebas automatizadas de componentes/servicios y datos. No se creó una reparación completa persistente ni se subieron archivos reales para la comprobación visual.

## Límites operativos explícitos

- La garantía registra una promesa y sus fechas; no automatiza la aceptación de futuros reclamos ni reemplaza su evaluación técnica.
- El costo externo no genera contabilidad, compra ni pago. La aprobación de cotización y el flujo técnico siguen siendo los existentes.
- Los adjuntos no incluyen antivirus ni limpieza automática de objetos huérfanos. Si Storage recibe bytes pero falla definitivamente su registro, el objeto queda privado y no consultable; el usuario recibe un aviso para comprobar la lista antes de reintentar. Antes de una exposición pública masiva se debe incorporar escaneo/cuarentena y reconciliación administrativa de almacenamiento.
- La aceptación visual y una prueba operativa completa con los catálogos de SILSAN siguen pendientes de la validación del usuario. Esta entrega no certifica el resto del ERP como finalizado.
