---
version: 1
slug: "frontend-src-components-layout-applayout-tsx"
primary_target: "frontend/src/components/layout/AppLayout.tsx"
related_targets: ["frontend/src/index.css","frontend/src/app/navegacion.ts","frontend/src/app/paginas/InicioPage.tsx"]
---

# Layout administrativo

## Dirección

Usar la dirección provisional «Kardex vivo»: una interfaz sobria de operación logística inspirada en hojas de registro, con estructura clara, densidad moderada y trazabilidad visible. La identidad corporativa definitiva sigue pendiente.

## Reglas visuales

- Fondo papel `#FAFAF7`, texto `#1D2724`, acento `#16705A` y líneas `#CBD7D1`.
- Priorizar bordes finos, filas y etiquetas compactas; evitar tarjetas genéricas, gradientes y sombras decorativas.
- Reservar el verde para navegación activa, estados positivos y acciones relevantes.
- Mantener jerarquía tipográfica directa, legible y sin titulares promocionales.

## Comportamiento

- El sidebar es persistente en escritorio y se convierte en diálogo modal en móvil.
- El menú móvil debe atrapar el foco, cerrarse con Escape y devolver el foco al disparador.
- Respetar `prefers-reduced-motion`; la animación se limita a transiciones funcionales del menú.
- No mostrar métricas, acciones frecuentes ni datos simulados mientras no exista una fuente confiable.

## Límites actuales

Supabase, autenticación, permisos y lógica de módulos todavía no están implementados. Los nombres de rutas pueden mantenerse, pero las prioridades operativas y la identidad visual se revisarán con la empresa.
