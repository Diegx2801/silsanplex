import type { PrecioVentaHistorico } from '@/modulos/ventas/servicios/historialPreciosService'

// No implicit FX, unit conversion or tax rebasing when reusing a commercial price.
export function precioHistoricoCompatible(
  precio: PrecioVentaHistorico, unidad: string, afectacion: string, incluyeIgv: boolean,
) {
  return precio.currency === 'PEN'
    && Boolean(unidad.trim()) && precio.unit_of_measure?.trim().toUpperCase() === unidad.trim().toUpperCase()
    && ['gravado', 'exonerado', 'inafecto'].includes(afectacion)
    && precio.tax_affectation === afectacion && precio.prices_include_tax === incluyeIgv
}
