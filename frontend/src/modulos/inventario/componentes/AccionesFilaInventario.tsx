import { ArrowUpFromLine, Plus } from 'lucide-react'
import type { MouseEvent } from 'react'

import { Button } from '@/components/ui/button'

interface Props {
  producto: string
  ajusteDeshabilitado?: boolean
  ajusteSinDisponible?: boolean
  movimientoDeshabilitado?: boolean
  onAjustar: (evento: MouseEvent<HTMLButtonElement>) => void
  onMovimiento: (evento: MouseEvent<HTMLButtonElement>) => void
}

export function AccionesFilaInventario({
  producto,
  ajusteDeshabilitado = false,
  ajusteSinDisponible = false,
  movimientoDeshabilitado = false,
  onAjustar,
  onMovimiento,
}: Props) {
  return (
    <div className="flex min-w-max flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Ajustar stock de ${producto}`}
        title={ajusteSinDisponible ? 'No hay cantidad disponible para descontar' : undefined}
        disabled={ajusteDeshabilitado}
        onClick={onAjustar}
      >
        <ArrowUpFromLine aria-hidden="true" />
        Ajustar
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Registrar movimiento para ${producto}`}
        disabled={movimientoDeshabilitado}
        onClick={onMovimiento}
      >
        <Plus aria-hidden="true" />
        Movimiento
      </Button>
    </div>
  )
}
