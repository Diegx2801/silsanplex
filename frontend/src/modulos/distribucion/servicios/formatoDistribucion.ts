const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

/**
 * Formatea fechas ISO de distribución sin construir ni mostrar una fecha
 * inválida cuando una entrega histórica todavía no tiene fecha real.
 */
export function formatearFechaDistribucion(
  valor: string | null | undefined,
  sinFecha = 'Sin fecha',
) {
  if (!valor) return sinFecha

  const fecha = new Date(`${valor}T12:00:00`)
  return Number.isNaN(fecha.getTime()) ? sinFecha : formatoFecha.format(fecha)
}
