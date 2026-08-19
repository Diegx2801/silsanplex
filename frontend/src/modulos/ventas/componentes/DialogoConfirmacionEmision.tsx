import { Send } from 'lucide-react'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'

import { Button } from '@/components/ui/button'
import {
  calcularTotalesCotizacion,
  type Cotizacion,
} from '@/modulos/ventas/modelo/cotizacion'

const formatoMoneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

interface DialogoConfirmacionEmisionProps {
  abierto: boolean
  cotizacion: Cotizacion
  alCambiarApertura: (abierto: boolean) => void
  alConfirmar: () => void
  alRestaurarFoco: () => void
}

export function DialogoConfirmacionEmision({
  abierto,
  cotizacion,
  alCambiarApertura,
  alConfirmar,
  alRestaurarFoco,
}: DialogoConfirmacionEmisionProps) {
  const total = calcularTotalesCotizacion(
    cotizacion.lineas,
    cotizacion.preciosIncluyenIgv,
  ).total

  return (
    <AlertDialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-60 bg-foreground/30" />
        <AlertDialogPrimitive.Content
          className="fixed start-1/2 top-1/2 z-70 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border bg-background p-5 shadow-xl outline-none sm:p-6"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <div className="grid size-10 place-items-center rounded-full bg-accent text-primary">
            <Send aria-hidden="true" className="size-5" />
          </div>
          <AlertDialogPrimitive.Title className="mt-5 text-xl font-semibold tracking-[-0.025em]">
            Emitir {cotizacion.numero}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">
            La cotización de <strong className="font-medium text-foreground">{cotizacion.clienteNombre}</strong>{' '}
            por <strong className="font-medium text-foreground">{formatoMoneda.format(total)}</strong> quedará bloqueada para edición.
          </AlertDialogPrimitive.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel asChild>
              <Button type="button" variant="outline" size="lg">Revisar</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button type="button" size="lg" onClick={alConfirmar}>Emitir cotización</Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}
