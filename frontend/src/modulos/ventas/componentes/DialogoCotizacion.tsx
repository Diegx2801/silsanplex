import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useFieldArray, useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import type { Cliente } from '@/modulos/clientes/modelo/cliente'
import type { Producto } from '@/modulos/productos/modelo/producto'
import {
  calcularTotalesCotizacion,
  cotizacionAFormulario,
  esquemaDatosCotizacion,
  type Cotizacion,
  type DatosCotizacion,
} from '@/modulos/ventas/modelo/cotizacion'

const formatoMoneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

function fechaEnDias(dias: number) {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

interface DialogoCotizacionProps {
  abierto: boolean
  cotizacion: Cotizacion | null
  clientes: readonly Cliente[]
  productos: readonly Producto[]
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (
    datos: DatosCotizacion,
    cotizacionId?: string,
  ) => string | undefined
  alRestaurarFoco: () => void
}

export function DialogoCotizacion({
  abierto,
  cotizacion,
  clientes,
  productos,
  alCambiarApertura,
  alGuardar,
  alRestaurarFoco,
}: DialogoCotizacionProps) {
  const primerProducto = productos[0]
  const valoresIniciales: DatosCotizacion = cotizacion
    ? cotizacionAFormulario(cotizacion)
    : {
        clienteId: clientes[0]?.id ?? '',
        fechaEmision: fechaEnDias(0),
        fechaValidez: fechaEnDias(7),
        preciosIncluyenIgv: true,
        observacion: '',
        lineas: [
          {
            productoId: primerProducto?.id ?? '',
            cantidad: '1',
            precioUnitario: primerProducto?.precioVenta ?? '',
          },
        ],
      }
  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosCotizacion>({
    resolver: zodResolver(esquemaDatosCotizacion),
    defaultValues: valoresIniciales,
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'lineas' })
  const lineas = watch('lineas')
  const preciosIncluyenIgv = watch('preciosIncluyenIgv')
  const totales = calcularTotalesCotizacion(
    lineas.map((linea) => ({
      cantidad: Number(linea.cantidad) || 0,
      precioUnitario: Number(linea.precioUnitario) || 0,
    })),
    preciosIncluyenIgv,
  )

  const guardar = (datos: DatosCotizacion) => {
    const error = alGuardar(datos, cotizacion?.id)
    if (error) {
      setError('root', { message: error })
      return
    }
    alCambiarApertura(false)
  }

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 end-0 z-50 flex w-full max-w-4xl flex-col border-s bg-background shadow-xl outline-none"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <DialogPrimitive.Title className="text-xl font-semibold tracking-[-0.025em]">
                {cotizacion ? 'Editar cotización' : 'Nueva cotización'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                Define cliente, vigencia, productos y precios antes de emitir.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar cotización"
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>

          <form
            id="formulario-cotizacion"
            className="min-h-0 flex-1 overflow-y-auto"
            onSubmit={handleSubmit(guardar)}
          >
            <section className="px-5 py-6 sm:px-7" aria-labelledby="datos-cotizacion">
              <div className="mb-5 border-b pb-3">
                <h2 id="datos-cotizacion" className="font-semibold">
                  Datos comerciales
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  La numeración se asignará al guardar el borrador.
                </p>
              </div>
              <div className="grid gap-5 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <label htmlFor="cliente-cotizacion" className="field-label">
                    Cliente *
                  </label>
                  <select
                    id="cliente-cotizacion"
                    autoFocus
                    className="field-control"
                    aria-invalid={Boolean(errors.clienteId)}
                    {...register('clienteId')}
                  >
                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.numeroDocumento} · {cliente.nombreRazonSocial}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="emision-cotizacion" className="field-label">
                    Emisión *
                  </label>
                  <input
                    id="emision-cotizacion"
                    type="date"
                    className="field-control"
                    {...register('fechaEmision')}
                  />
                </div>
                <div>
                  <label htmlFor="validez-cotizacion" className="field-label">
                    Válida hasta *
                  </label>
                  <input
                    id="validez-cotizacion"
                    type="date"
                    className="field-control"
                    aria-invalid={Boolean(errors.fechaValidez)}
                    {...register('fechaValidez')}
                  />
                  {errors.fechaValidez ? (
                    <p className="field-error">{errors.fechaValidez.message}</p>
                  ) : null}
                </div>
                <label className="flex items-center gap-3 sm:self-end sm:pb-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    {...register('preciosIncluyenIgv')}
                  />
                  <span className="text-sm font-medium">Precios incluyen IGV</span>
                </label>
              </div>
            </section>

            <section className="border-t px-5 py-6 sm:px-7" aria-labelledby="productos-cotizacion">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b pb-3">
                <div>
                  <h2 id="productos-cotizacion" className="font-semibold">
                    Productos cotizados
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    El precio base se propone desde el catálogo y puede ajustarse.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    append({
                      productoId: primerProducto?.id ?? '',
                      cantidad: '1',
                      precioUnitario: primerProducto?.precioVenta ?? '',
                    })
                  }
                >
                  <Plus aria-hidden="true" /> Agregar producto
                </Button>
              </div>

              <div className="space-y-4">
                {fields.map((field, indice) => {
                  const erroresLinea = errors.lineas?.[indice]
                  const productoSeleccionado = productos.find(
                    (producto) => producto.id === lineas[indice]?.productoId,
                  )
                  const registroProducto = register(
                    `lineas.${indice}.productoId`,
                  )

                  return (
                    <article key={field.id} className="border bg-muted/20 p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <h3 className="font-mono text-xs tracking-[0.06em] text-muted-foreground uppercase">
                          Producto {indice + 1}
                        </h3>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={fields.length === 1}
                          aria-label={`Quitar producto ${indice + 1}`}
                          onClick={() => remove(indice)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr]">
                        <div>
                          <label className="field-label">Producto *</label>
                          <select
                            className="field-control"
                            aria-label={`Producto ${indice + 1}`}
                            {...registroProducto}
                            onChange={(evento) => {
                              registroProducto.onChange(evento)
                              const producto = productos.find(
                                (item) => item.id === evento.target.value,
                              )
                              setValue(
                                `lineas.${indice}.precioUnitario`,
                                producto?.precioVenta ?? '',
                                { shouldValidate: true },
                              )
                            }}
                          >
                            {productos.map((producto) => (
                              <option key={producto.id} value={producto.id}>
                                {producto.codigo} · {producto.descripcion}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="field-label">Cantidad *</label>
                          <input
                            inputMode="decimal"
                            className="field-control"
                            aria-label={`Cantidad del producto ${indice + 1}`}
                            aria-invalid={Boolean(erroresLinea?.cantidad)}
                            {...register(`lineas.${indice}.cantidad`)}
                          />
                          {erroresLinea?.cantidad ? (
                            <p className="field-error">{erroresLinea.cantidad.message}</p>
                          ) : null}
                        </div>
                        <div>
                          <label className="field-label">Precio unitario *</label>
                          <input
                            inputMode="decimal"
                            className="field-control"
                            aria-label={`Precio unitario del producto ${indice + 1}`}
                            aria-invalid={Boolean(erroresLinea?.precioUnitario)}
                            {...register(`lineas.${indice}.precioUnitario`)}
                          />
                          {erroresLinea?.precioUnitario ? (
                            <p className="field-error">
                              {erroresLinea.precioUnitario.message}
                            </p>
                          ) : null}
                          {productoSeleccionado?.precioMinimo ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Mínimo permitido:{' '}
                              {formatoMoneda.format(
                                Number(productoSeleccionado.precioMinimo),
                              )}
                            </p>
                          ) : null}
                        </div>
                        <div>
                          <span className="field-label">Importe</span>
                          <p className="flex h-9 items-center border px-3 font-mono text-sm font-semibold tabular-nums">
                            {formatoMoneda.format(
                              (Number(lineas[indice]?.cantidad) || 0) *
                                (Number(lineas[indice]?.precioUnitario) || 0),
                            )}
                          </p>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>

            <section className="grid gap-5 border-t px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div>
                <label htmlFor="observacion-cotizacion" className="field-label">
                  Condiciones u observaciones
                </label>
                <textarea
                  id="observacion-cotizacion"
                  rows={4}
                  className="field-control py-2"
                  placeholder="Entrega, forma de pago u otra condición comercial"
                  {...register('observacion')}
                />
              </div>
              <dl className="border bg-muted/25 px-4 py-2">
                <div className="flex justify-between gap-4 border-b py-3 text-sm">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="font-mono">{formatoMoneda.format(totales.subtotal)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b py-3 text-sm">
                  <dt className="text-muted-foreground">IGV</dt>
                  <dd className="font-mono">{formatoMoneda.format(totales.igv)}</dd>
                </div>
                <div className="flex justify-between gap-4 py-3 font-semibold">
                  <dt>Total</dt>
                  <dd className="font-mono">{formatoMoneda.format(totales.total)}</dd>
                </div>
              </dl>
            </section>

            {errors.root ? (
              <p role="alert" className="border-t px-5 py-4 text-sm text-destructive sm:px-7">
                {errors.root.message}
              </p>
            ) : null}
          </form>

          <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="outline" size="lg">
                Cancelar
              </Button>
            </DialogPrimitive.Close>
            <Button
              type="submit"
              form="formulario-cotizacion"
              size="lg"
              disabled={isSubmitting}
            >
              {cotizacion ? 'Guardar cambios' : 'Guardar borrador'}
            </Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
