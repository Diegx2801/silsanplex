import { PackageCheck } from 'lucide-react'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'

import { Button } from '@/components/ui/button'
import {
  calcularTotalesCompra,
  type Compra,
} from '@/modulos/compras/modelo/compras'

const formatoMoneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

interface DialogoConfirmacionRecepcionProps {
  abierto: boolean
  compra: Compra
  alCambiarApertura: (abierto: boolean) => void
  alConfirmar: () => void
  alRestaurarFoco: () => void
}

export function DialogoConfirmacionRecepcion({
  abierto,
  compra,
  alCambiarApertura,
  alConfirmar,
  alRestaurarFoco,
}: DialogoConfirmacionRecepcionProps) {
  const totales = calcularTotalesCompra(
    compra.lineas,
    compra.preciosIncluyenIgv,
  )

  return (
    <AlertDialogPrimitive.Root
      open={abierto}
      onOpenChange={alCambiarApertura}
    >
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
            <PackageCheck aria-hidden="true" className="size-5" />
          </div>
          <AlertDialogPrimitive.Title className="mt-5 text-xl font-semibold tracking-[-0.025em]">
            Confirmar recepción
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">
            Se generará una entrada de inventario por cada producto y la compra
            quedará bloqueada para edición. Esta acción no se puede deshacer en
            el flujo actual.
          </AlertDialogPrimitive.Description>

          <dl className="mt-5 divide-y border bg-muted/25 text-sm">
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">Documento</dt>
              <dd className="font-mono uppercase">
                {compra.serie}-{compra.numero}
              </dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">Proveedor</dt>
              <dd className="text-end font-medium">{compra.proveedorNombre}</dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">Destino</dt>
              <dd>{compra.almacen}</dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">Productos</dt>
              <dd className="font-mono tabular-nums">{compra.lineas.length}</dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3 font-semibold">
              <dt>Total</dt>
              <dd className="font-mono tabular-nums">
                {formatoMoneda.format(totales.total)}
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel asChild>
              <Button type="button" variant="outline" size="lg">
                Revisar compra
              </Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button type="button" size="lg" onClick={alConfirmar}>
                Recibir mercadería
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}
