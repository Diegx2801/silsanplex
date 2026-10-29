import type { CapturaUnidadMovimiento } from '../modelo/capturaUnidadMovimiento'

const formatoCaptura = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 9 })
const formatoBase = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 })

interface Props extends CapturaUnidadMovimiento {
  cantidad: number
  unidadMedida?: string
  signo?: '+' | '−' | ''
  className?: string
}

export function CantidadMovimiento({ cantidad, unidadMedida, cantidadCapturada, unidadCapturada, factorConversion, signo = '', className }: Props) {
  const capturaValida = cantidadCapturada !== undefined && Number.isFinite(cantidadCapturada)
    && cantidadCapturada > 0 && Boolean(unidadCapturada?.trim())
    && factorConversion !== undefined && Number.isFinite(factorConversion) && factorConversion > 0
  const mostrarEquivalencia = capturaValida && (factorConversion !== 1
    || unidadCapturada?.trim().toLocaleLowerCase('es-PE') !== unidadMedida?.trim().toLocaleLowerCase('es-PE'))

  return (
    <div>
      <p className={className ?? 'font-mono tabular-nums'}>
        {signo}{capturaValida ? formatoCaptura.format(cantidadCapturada!) : formatoBase.format(cantidad)}{' '}
        <span className="font-sans text-xs font-normal text-muted-foreground">
          {capturaValida ? unidadCapturada : unidadMedida || 'unid.'}
        </span>
      </p>
      {mostrarEquivalencia ? (
        <p className="mt-1 text-xs text-muted-foreground">Equivale a {formatoBase.format(cantidad)} {unidadMedida || 'unid.'}</p>
      ) : null}
    </div>
  )
}
