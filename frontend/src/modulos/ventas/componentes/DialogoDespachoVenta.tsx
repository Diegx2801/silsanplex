import { zodResolver } from '@hookform/resolvers/zod'
import { PackageCheck, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useFieldArray, useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import type { Producto } from '@/modulos/productos/modelo/producto'
import {
  esquemaDatosDespacho,
  type DatosDespacho,
  type Venta,
} from '@/modulos/ventas/modelo/operacionVenta'

const hoy = () => new Date().toISOString().slice(0, 10)

interface DialogoDespachoVentaProps {
  abierto: boolean
  venta: Venta
  productos: readonly Producto[]
  alCambiarApertura: (abierto: boolean) => void
  alConfirmar: (datos: DatosDespacho) => string | undefined
}

export function DialogoDespachoVenta({
  abierto,
  venta,
  productos,
  alCambiarApertura,
  alConfirmar,
}: DialogoDespachoVentaProps) {
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosDespacho>({
    resolver: zodResolver(esquemaDatosDespacho),
    defaultValues: {
      fechaDespacho: hoy(),
      lineas: venta.lineas.map((linea) => ({
        lineaVentaId: linea.id,
        lote: '',
        fechaVencimiento: '',
      })),
    },
  })
  const { fields } = useFieldArray({ control, name: 'lineas' })

  const confirmar = (datos: DatosDespacho) => {
    const error = alConfirmar(datos)
    if (error) return setError('root', { message: error })
    alCambiarApertura(false)
  }

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
        <DialogPrimitive.Content className="fixed inset-y-0 end-0 z-50 flex w-full max-w-3xl flex-col border-s bg-background shadow-xl outline-none">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <DialogPrimitive.Title className="text-xl font-semibold">Confirmar despacho</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                {venta.numeroInterno} · salida desde {venta.almacen}. Se validará todo antes de descontar stock.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar" className="grid size-9 place-items-center rounded-md hover:bg-muted"><X aria-hidden="true" className="size-5" /></button></DialogPrimitive.Close>
          </header>
          <form className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7" onSubmit={handleSubmit(confirmar)}>
            <div className="max-w-xs">
              <label htmlFor="fecha-despacho" className="field-label">Fecha de despacho *</label>
              <input id="fecha-despacho" type="date" className="field-control" {...register('fechaDespacho')} />
            </div>
            <section className="mt-6 space-y-4" aria-label="Productos a despachar">
              {fields.map((field, indice) => {
                const linea = venta.lineas[indice]
                const producto = productos.find((item) => item.id === linea.productoId)
                return (
                  <article key={field.id} className="border p-4">
                    <input type="hidden" {...register(`lineas.${indice}.lineaVentaId`)} />
                    <div className="flex flex-wrap justify-between gap-2">
                      <div><p className="font-mono text-xs text-primary">{linea.productoCodigo}</p><h3 className="mt-1 font-medium">{linea.productoDescripcion}</h3></div>
                      <p className="font-mono text-sm font-semibold">{linea.cantidad} {linea.unidadMedida}</p>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`lote-${linea.id}`} className="field-label">Lote {producto?.controlLote ? '*' : '(opcional)'}</label>
                        <input id={`lote-${linea.id}`} autoComplete="off" className="field-control" {...register(`lineas.${indice}.lote`)} />
                      </div>
                      <div>
                        <label htmlFor={`vencimiento-${linea.id}`} className="field-label">Vencimiento del lote</label>
                        <input id={`vencimiento-${linea.id}`} type="date" className="field-control" {...register(`lineas.${indice}.fechaVencimiento`)} />
                      </div>
                    </div>
                  </article>
                )
              })}
            </section>
            {errors.root ? <p role="alert" className="mt-5 border-s-4 border-destructive bg-destructive/10 px-4 py-3 text-sm">{errors.root.message}</p> : null}
            <footer className="mt-6 flex justify-end gap-3 border-t pt-5">
              <DialogPrimitive.Close asChild><Button type="button" variant="outline">Cancelar</Button></DialogPrimitive.Close>
              <Button type="submit" disabled={isSubmitting}><PackageCheck aria-hidden="true" /> Confirmar y descontar stock</Button>
            </footer>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
