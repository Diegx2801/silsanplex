import { Send } from 'lucide-react'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { Compra } from '@/modulos/compras/modelo/compras'

interface DialogoConfirmacionEmisionProps {
  abierto: boolean
  compra: Compra
  alCambiarApertura: (abierto: boolean) => void
  alConfirmar: () => Promise<string | undefined>
  alRestaurarFoco: () => void
}

const formatoMoneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

export function DialogoConfirmacionEmision({
  abierto,
  compra,
  alCambiarApertura,
  alConfirmar,
  alRestaurarFoco,
}: DialogoConfirmacionEmisionProps) {
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')

  const confirmar = async () => {
    setError('')
    setProcesando(true)
    const resultado = await alConfirmar()
    setProcesando(false)
    if (resultado) {
      setError(resultado)
      return
    }
    alCambiarApertura(false)
  }

  return (
    <AlertDialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-60 bg-foreground/30" />
        <AlertDialogPrimitive.Content
          className="fixed start-1/2 top-1/2 z-70 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 border bg-background p-5 shadow-xl outline-none sm:p-6"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <div className="grid size-10 place-items-center rounded-full bg-accent text-primary">
            <Send aria-hidden="true" className="size-5" />
          </div>
          <AlertDialogPrimitive.Title className="mt-5 text-xl font-semibold tracking-[-0.025em]">
            Emitir orden de compra
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">
            La orden pasará a estado emitida. Ya no podrás editarla; solo podrás registrar su recepción o anular el saldo pendiente.
          </AlertDialogPrimitive.Description>

          <dl className="mt-5 grid gap-3 border bg-muted/25 px-4 py-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Documento</dt>
              <dd className="mt-1 font-mono font-medium uppercase">{compra.serie}-{compra.numero}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Proveedor</dt>
              <dd className="mt-1 font-medium">{compra.proveedorNombre}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Almacén</dt>
              <dd className="mt-1">{compra.almacen}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Total</dt>
              <dd className="mt-1 font-mono font-semibold tabular-nums">
                {compra.total === null || compra.total === undefined ? 'Pendiente' : formatoMoneda.format(compra.total)}
              </dd>
            </div>
          </dl>

          {error ? (
            <p role="alert" className="mt-4 border-s-4 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel asChild>
              <Button type="button" variant="outline" size="lg" disabled={procesando}>
                Cancelar
              </Button>
            </AlertDialogPrimitive.Cancel>
            <Button type="button" size="lg" disabled={procesando} onClick={() => void confirmar()}>
              {procesando ? 'Emitiendo…' : 'Confirmar emisión'}
            </Button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}
