export interface CapturaUnidadMovimiento {
  cantidadCapturada?: number
  unidadCapturada?: string
  factorConversion?: number
}

export function leerCapturaUnidadMovimiento(fila: {
  entered_quantity?: number | string | null
  entered_unit_of_measure?: string | null
  unit_conversion_factor?: number | string | null
}): CapturaUnidadMovimiento {
  const cantidad = Number(fila.entered_quantity)
  const factor = Number(fila.unit_conversion_factor)
  const unidad = fila.entered_unit_of_measure?.trim()
  if (!Number.isFinite(cantidad) || cantidad <= 0 || !unidad || !Number.isFinite(factor) || factor <= 0) return {}
  return { cantidadCapturada: cantidad, unidadCapturada: unidad, factorConversion: factor }
}
