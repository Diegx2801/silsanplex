import type { MovimientoKardex } from '../modelo/almacen'

const moneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

type Props = Pick<
  MovimientoKardex,
  | 'cantidadEntrada'
  | 'valorEntrada'
  | 'valorSalida'
  | 'costoUnitario'
  | 'unidadMedida'
>

export function ImporteMovimiento(movimiento: Props) {
  // El importe contable ya está valorizado en el ledger; no se recalcula
  // usando la cantidad capturada en una presentación alternativa.
  const importe =
    movimiento.cantidadEntrada > 0
      ? movimiento.valorEntrada
      : movimiento.valorSalida
  return (
    <>
      <span>{moneda.format(importe)}</span>
      <p className="mt-1 font-sans text-xs text-muted-foreground">
        {moneda.format(movimiento.costoUnitario)}
        {movimiento.unidadMedida
          ? ` por ${movimiento.unidadMedida}`
          : ' por unidad base'}
      </p>
    </>
  )
}
