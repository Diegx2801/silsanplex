import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  esquemaDatosVenta,
  type DatosVenta,
  type PedidoVenta,
} from '@/modulos/ventas/modelo/operacionVenta'

const hoy = () => new Date().toISOString().slice(0, 10)

interface DialogoRegistroVentaProps {
  abierto: boolean
  pedido: PedidoVenta
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosVenta) => string | undefined | Promise<string | undefined>
}

export function DialogoRegistroVenta({
  abierto,
  pedido,
  alCambiarApertura,
  alGuardar,
}: DialogoRegistroVentaProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosVenta>({
    resolver: zodResolver(esquemaDatosVenta),
    defaultValues: {
      tipoDocumento: 'factura',
      serie: '',
      numeroDocumento: '',
      fechaVenta: hoy(),
      almacen: 'Almacén principal',
    },
  })

  const guardar = async (datos: DatosVenta) => {
    const error = await alGuardar(datos)
    if (error) return setError('root', { message: error })
    alCambiarApertura(false)
  }

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
        <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 border bg-background shadow-xl outline-none">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <DialogPrimitive.Title className="text-xl font-semibold">Registrar venta</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                {pedido.numero} · {pedido.clienteNombre}. El stock se descontará al despachar.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button type="button" aria-label="Cerrar" className="grid size-9 place-items-center rounded-md hover:bg-muted">
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>
          <form className="px-5 py-6 sm:px-7" onSubmit={handleSubmit(guardar)}>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="tipo-documento-venta" className="field-label">Comprobante *</label>
                <select id="tipo-documento-venta" className="field-control" {...register('tipoDocumento')}>
                  <option value="factura">Factura</option>
                  <option value="boleta">Boleta</option>
                  <option value="nota-venta">Nota de venta</option>
                </select>
              </div>
              <div>
                <label htmlFor="fecha-venta" className="field-label">Fecha *</label>
                <input id="fecha-venta" type="date" className="field-control" {...register('fechaVenta')} />
              </div>
              <div>
                <label htmlFor="serie-venta" className="field-label">Serie *</label>
                <input id="serie-venta" autoFocus autoComplete="off" placeholder="F001" className="field-control uppercase" aria-invalid={Boolean(errors.serie)} {...register('serie')} />
                {errors.serie ? <p className="field-error">{errors.serie.message}</p> : null}
              </div>
              <div>
                <label htmlFor="numero-venta" className="field-label">Número *</label>
                <input id="numero-venta" autoComplete="off" placeholder="000001" className="field-control" aria-invalid={Boolean(errors.numeroDocumento)} {...register('numeroDocumento')} />
                {errors.numeroDocumento ? <p className="field-error">{errors.numeroDocumento.message}</p> : null}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="almacen-venta" className="field-label">Almacén de despacho *</label>
                <input id="almacen-venta" autoComplete="off" className="field-control" aria-invalid={Boolean(errors.almacen)} {...register('almacen')} />
                {errors.almacen ? <p className="field-error">{errors.almacen.message}</p> : null}
              </div>
            </div>
            {errors.root ? <p role="alert" className="mt-5 border-s-4 border-destructive bg-destructive/10 px-4 py-3 text-sm">{errors.root.message}</p> : null}
            <footer className="mt-6 flex justify-end gap-3 border-t pt-5">
              <DialogPrimitive.Close asChild><Button type="button" variant="outline">Cancelar</Button></DialogPrimitive.Close>
              <Button type="submit" disabled={isSubmitting}>Registrar venta</Button>
            </footer>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
