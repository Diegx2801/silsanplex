import { Ban } from 'lucide-react'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { Compra } from '@/modulos/compras/modelo/compras'

interface DialogoConfirmacionAnulacionProps {
  abierto: boolean
  compra: Compra
  alCambiarApertura: (abierto: boolean) => void
  alConfirmar: (motivo: string) => Promise<string | undefined>
  alRestaurarFoco: () => void
}

export function DialogoConfirmacionAnulacion({
  abierto,
  compra,
  alCambiarApertura,
  alConfirmar,
  alRestaurarFoco,
}: DialogoConfirmacionAnulacionProps) {
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const [motivo, setMotivo] = useState('')

  const confirmar = async () => {
    setError('')
    if (motivo.trim().length < 5) {
      setError('Ingresa un motivo de al menos 5 caracteres.')
      return
    }
    setProcesando(true)
    const resultado = await alConfirmar(motivo.trim())
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
          className="fixed start-1/2 top-1/2 z-70 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border bg-background p-5 shadow-xl outline-none sm:p-6"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <div className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
            <Ban aria-hidden="true" className="size-5" />
          </div>
          <AlertDialogPrimitive.Title className="mt-5 text-xl font-semibold tracking-[-0.025em]">
            Anular orden de compra
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">
            La orden {compra.serie}-{compra.numero} quedará cerrada y ya no podrá editarse, emitirse ni recibirse. El inventario ya recibido no se alterará.
          </AlertDialogPrimitive.Description>
          <label className="mt-5 block">
            <span className="field-label">Motivo *</span>
            <textarea className="field-control min-h-20" maxLength={240} value={motivo} onChange={(evento) => setMotivo(evento.target.value)} placeholder="Explica por qué se cancela el saldo pendiente" />
          </label>
          {error ? (
            <p role="alert" className="mt-4 border-s-4 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel asChild>
              <Button type="button" variant="outline" size="lg" disabled={procesando}>
                Conservar orden
              </Button>
            </AlertDialogPrimitive.Cancel>
            <Button type="button" variant="destructive" size="lg" disabled={procesando} onClick={() => void confirmar()}>
              {procesando ? 'Anulando…' : 'Anular orden'}
            </Button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}
