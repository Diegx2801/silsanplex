# Reparaciones: primer bloque de simplificación

Validación: 20 de octubre de 2026. Alcance: mejorar la atención existente sin cambiar el esquema de datos ni las reglas de negocio del servidor.

## Cambios

- Pantalla principal compacta, filtros restablecibles y estados vacíos diferenciados. El resumen tiene carga y error independientes de la lista.
- Catálogos cargados al abrir los formularios o el detalle, no al entrar a la pantalla.
- Recepción centrada en cliente, equipo y problema. Datos adicionales agrupados; no se solicita escribir un UUID de venta. La edición conserva los datos históricos no visibles.
- Detalle con siguiente acción según estado y permisos, navegación por secciones e historial desplegable. Las validaciones del servidor siguen siendo la autoridad.
- Notas adicionales de diagnóstico y pruebas fuera del recorrido principal. Rechazar y cancelar siguen exigiendo motivo.
- Reserva de repuestos con selección física automática y cantidades expresadas en la unidad base. Se resuelven también productos fuera de la primera página del catálogo.
- Consumos con clave de operación persistida por organización, usuario, reparación y repuesto. Un reintento conserva cantidad y versión originales; no se envía un consumo nuevo si no se puede recuperar la intención pendiente.

## Evidencia

- 103 pruebas aprobadas en 11 archivos del módulo y de su página.
- TypeScript, compilación de producción y lint del alcance aprobados. La compilación advierte sobre chunks grandes existentes fuera de este bloque.
- Revisión en navegador a 968 × 892 y 390 × 844: pantalla vacía, apertura/cierre de recepción, búsqueda sin coincidencias y limpieza de filtros. No se crearon órdenes persistentes.
- El detalle, permisos, conservación de campos y reintentos se validaron mediante pruebas automatizadas; no se ejecutó una reparación completa en la base local vacía.
- Capturas locales excluidas de Git en `playwright-report/screenshots/`.

## Pendiente deliberadamente para el segundo bloque

Equipos externos al catálogo, solicitantes internos, proveedores de servicio externo, evidencias adjuntas y garantía posterior al servicio. Tampoco se añade conversión de unidades alternativas a reservas: este bloque aclara la unidad base admitida por el contrato actual.

La aceptación visual y una prueba operativa completa con catálogos reales quedan a cargo de la validación siguiente; este documento no certifica todo el sistema ni todos los requisitos del PDF como terminados.
