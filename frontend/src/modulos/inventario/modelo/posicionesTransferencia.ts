import type { BucketAjusteStock } from './inventario'
import { claveBucketAjusteStock } from './inventario'

// Aliases recognized by normalized_measurement_unit_code in the database.
// This only compares identity; quantities are never converted here.
const aliases: Record<string, string> = {
  UND: 'UNIT',
  UNIDAD: 'UNIT',
  CAJA: 'BOX',
  CJA: 'BOX',
  PAQUETE: 'PACK',
  PAQ: 'PACK',
  PQT: 'PACK',
  PAR: 'PAIR',
  PIEZA: 'PIECE',
  FRASCO: 'BOTTLE',
  BOLSA: 'BAG',
  ROLLO: 'ROLL',
  DOCENA: 'DOZEN',
  CIENTO: 'HUNDRED',
  MILLAR: 'THOUSAND',
  LITRO: 'LITER',
  LITROS: 'LITER',
  GALON: 'GALLON',
  GALONES: 'GALLON',
  KILO: 'KILOGRAM',
  KILOS: 'KILOGRAM',
  KILOGRAMO: 'KILOGRAM',
  METRO: 'METER',
  METROS: 'METER',
  'METRO CUBICO': 'CUBIC_METER',
  'METROS CUB': 'CUBIC_METER',
  BALDE: 'BUCKET',
  SERVICIO: 'SERVICE',
}
function identidadUnidad(unidad: string) {
  const texto = unidad
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleUpperCase('es-PE')
  return aliases[texto] ?? texto
}

export function prepararPosicionesTransferencia(
  buckets: readonly BucketAjusteStock[],
  unidadBase: string,
) {
  const clavesInconsistentes = new Set(
    buckets
      .filter(
        (item) =>
          identidadUnidad(item.unidadMedida) !== identidadUnidad(unidadBase),
      )
      .map(claveBucketAjusteStock),
  )
  const porPosicion = new Map<string, BucketAjusteStock>()
  for (const bucket of buckets) {
    const clave = claveBucketAjusteStock(bucket)
    if (clavesInconsistentes.has(clave)) continue
    const anterior = porPosicion.get(clave)
    porPosicion.set(
      clave,
      anterior
        ? {
            ...anterior,
            cantidadFisica: anterior.cantidadFisica + bucket.cantidadFisica,
            // Reservations identify the position, not its legacy unit alias.
            cantidadReservada: Math.max(
              anterior.cantidadReservada,
              bucket.cantidadReservada,
            ),
          }
        : { ...bucket, unidadMedida: unidadBase },
    )
  }
  return { posiciones: [...porPosicion.values()], clavesInconsistentes }
}
