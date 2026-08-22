import { CirclePower, TriangleAlert } from 'lucide-react'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'

import { Button } from '@/components/ui/button'
import type { Producto } from '@/modulos/productos/modelo/producto'

interface DialogoConfirmacionEstadoProps {
  abierto: boolean
  producto: Producto
  cambiandoEstado: boolean
  alCambiarApertura: (abierto: boolean) => void
  alConfirmar: () => void
  alRestaurarFoco: () => void
}

export function DialogoConfirmacionEstado({
  abierto,
  producto,
  cambiandoEstado,
  alCambiarApertura,
  alConfirmar,
  alRestaurarFoco,
}: DialogoConfirmacionEstadoProps) {
  const seDesactivara = producto.activo
  const accion = seDesactivara ? 'Desactivar' : 'Activar'

  return (
    <AlertDialogPrimitive.Root
      open={abierto}
      onOpenChange={alCambiarApertura}
    >
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-60 bg-foreground/30 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <AlertDialogPrimitive.Content
          className="fixed start-1/2 top-1/2 z-70 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border bg-background p-5 shadow-xl outline-none sm:p-6"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <div
            className={`grid size-10 place-items-center rounded-full ${
              seDesactivara
                ? 'bg-destructive/10 text-destructive'
                : 'bg-accent text-primary'
            }`}
          >
            {seDesactivara ? (
              <TriangleAlert aria-hidden="true" className="size-5" />
            ) : (
              <CirclePower aria-hidden="true" className="size-5" />
            )}
          </div>

          <AlertDialogPrimitive.Title className="mt-5 text-xl font-semibold tracking-[-0.025em]">
            {accion} producto
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">
            {seDesactivara ? (
              <>
                <strong className="font-medium text-foreground">
                  {producto.descripcion}
                </strong>{' '}
                dejará de estar disponible para nuevos movimientos. Su
                información permanecerá registrada y podrás activarlo después.
              </>
            ) : (
              <>
                <strong className="font-medium text-foreground">
                  {producto.descripcion}
                </strong>{' '}
                volverá a estar disponible para los flujos operativos del
                sistema.
              </>
            )}
          </AlertDialogPrimitive.Description>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel asChild>
              <Button type="button" variant="outline" size="lg">
                Cancelar
              </Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button
                type="button"
                variant={seDesactivara ? 'destructive' : 'default'}
                size="lg"
                disabled={cambiandoEstado}
                onClick={alConfirmar}
              >
                {accion} producto
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}
