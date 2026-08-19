import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useFieldArray, useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  calcularTotalesCompra,
  compraAFormulario,
  esquemaDatosCompra,
  type Compra,
  type DatosCompra,
  type Proveedor,
} from '@/modulos/compras/modelo/compras'
import type { Producto } from '@/modulos/productos/modelo/producto'

const formatoMoneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})
const hoy = () => new Date().toISOString().slice(0, 10)

interface DialogoCompraProps {
  abierto: boolean
  compra: Compra | null
  proveedores: readonly Proveedor[]
  productos: readonly Producto[]
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosCompra, compraId?: string) => string | undefined
  alRestaurarFoco: () => void
}

export function DialogoCompra({
  abierto,
  compra,
  proveedores,
  productos,
  alCambiarApertura,
  alGuardar,
  alRestaurarFoco,
}: DialogoCompraProps) {
  const valoresIniciales: DatosCompra = compra
    ? compraAFormulario(compra)
    : {
        proveedorId: proveedores[0]?.id ?? '',
        tipoDocumento: 'factura',
        serie: '',
        numero: '',
        fechaEmision: hoy(),
        fechaVencimientoPago: '',
        almacen: 'Almacén principal',
        preciosIncluyenIgv: true,
        observacion: '',
        lineas: [
          {
            productoId: productos[0]?.id ?? '',
            cantidad: '1',
            costoUnitario: '',
            lote: '',
            fechaVencimiento: '',
          },
        ],
      }
  const {
    control,
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosCompra>({
    resolver: zodResolver(esquemaDatosCompra),
    defaultValues: valoresIniciales,
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'lineas' })
  const lineas = watch('lineas')
  const preciosIncluyenIgv = watch('preciosIncluyenIgv')
  const totales = calcularTotalesCompra(
    lineas.map((linea) => ({
      cantidad: Number(linea.cantidad) || 0,
      costoUnitario: Number(linea.costoUnitario) || 0,
    })),
    preciosIncluyenIgv,
  )

  const guardar = (datos: DatosCompra) => {
    const error = alGuardar(datos, compra?.id)
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
                {compra ? 'Editar compra' : 'Registrar compra'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                Registra el documento y sus productos. El inventario cambiará
                únicamente cuando confirmes la recepción.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar compra"
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>

          <form
            id="formulario-compra"
            className="min-h-0 flex-1 overflow-y-auto"
            onSubmit={handleSubmit(guardar)}
          >
            <section aria-labelledby="documento-compra" className="px-5 py-6 sm:px-7">
              <div className="mb-5 border-b pb-3">
                <h2 id="documento-compra" className="font-semibold">
                  Documento de compra
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Los campos marcados con * son obligatorios.
                </p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2 lg:col-span-4">
                  <label htmlFor="proveedor-compra" className="field-label">
                    Proveedor *
                  </label>
                  <select
                    id="proveedor-compra"
                    className="field-control"
                    aria-invalid={Boolean(errors.proveedorId)}
                    {...register('proveedorId')}
                  >
                    {proveedores.map((proveedor) => (
                      <option key={proveedor.id} value={proveedor.id}>
                        {proveedor.numeroDocumento} · {proveedor.razonSocial}
                      </option>
                    ))}
                  </select>
                  {errors.proveedorId ? (
                    <p className="field-error">{errors.proveedorId.message}</p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor="tipo-documento-compra" className="field-label">
                    Tipo *
                  </label>
                  <select
                    id="tipo-documento-compra"
                    className="field-control"
                    {...register('tipoDocumento')}
                  >
                    <option value="factura">Factura</option>
                    <option value="boleta">Boleta</option>
                    <option value="guia">Guía</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="serie-compra" className="field-label">
                    Serie *
                  </label>
                  <input
                    id="serie-compra"
                    autoFocus
                    autoComplete="off"
                    placeholder="F001"
                    className="field-control uppercase"
                    aria-invalid={Boolean(errors.serie)}
                    {...register('serie')}
                  />
                  {errors.serie ? (
                    <p className="field-error">{errors.serie.message}</p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor="numero-compra" className="field-label">
                    Número *
                  </label>
                  <input
                    id="numero-compra"
                    autoComplete="off"
                    className="field-control"
                    aria-invalid={Boolean(errors.numero)}
                    {...register('numero')}
                  />
                  {errors.numero ? (
                    <p className="field-error">{errors.numero.message}</p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor="emision-compra" className="field-label">
                    Emisión *
                  </label>
                  <input
                    id="emision-compra"
                    type="date"
                    className="field-control"
                    {...register('fechaEmision')}
                  />
                </div>
                <div>
                  <label htmlFor="vencimiento-pago-compra" className="field-label">
                    Vencimiento de pago
                  </label>
                  <input
                    id="vencimiento-pago-compra"
                    type="date"
                    className="field-control"
                    {...register('fechaVencimientoPago')}
                  />
                </div>
                <div>
                  <label htmlFor="almacen-compra" className="field-label">
                    Almacén de recepción *
                  </label>
                  <input
                    id="almacen-compra"
                    autoComplete="off"
                    className="field-control"
                    aria-invalid={Boolean(errors.almacen)}
                    {...register('almacen')}
                  />
                  {errors.almacen ? (
                    <p className="field-error">{errors.almacen.message}</p>
                  ) : null}
                </div>
              </div>
            </section>

            <section aria-labelledby="productos-compra" className="border-t px-5 py-6 sm:px-7">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b pb-3">
                <div>
                  <h2 id="productos-compra" className="font-semibold">
                    Productos y costos
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cada producto debe aparecer una sola vez.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    append({
                      productoId: productos[0]?.id ?? '',
                      cantidad: '1',
                      costoUnitario: '',
                      lote: '',
                      fechaVencimiento: '',
                    })
                  }
                >
                  <Plus aria-hidden="true" />
                  Agregar producto
                </Button>
              </div>

              <div className="space-y-4">
                {fields.map((field, indice) => {
                  const producto = productos.find(
                    (item) => item.id === lineas[indice]?.productoId,
                  )
                  const erroresLinea = errors.lineas?.[indice]

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
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                        <div className="sm:col-span-2 lg:col-span-2">
                          <label className="field-label">Producto *</label>
                          <select
                            className="field-control"
                            aria-label={`Producto ${indice + 1}`}
                            aria-invalid={Boolean(erroresLinea?.productoId)}
                            {...register(`lineas.${indice}.productoId`)}
                          >
                            {productos.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.codigo} · {item.descripcion}
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
                          <label className="field-label">Costo unitario *</label>
                          <input
                            inputMode="decimal"
                            className="field-control"
                            aria-label={`Costo unitario del producto ${indice + 1}`}
                            aria-invalid={Boolean(erroresLinea?.costoUnitario)}
                            {...register(`lineas.${indice}.costoUnitario`)}
                          />
                          {erroresLinea?.costoUnitario ? (
                            <p className="field-error">
                              {erroresLinea.costoUnitario.message}
                            </p>
                          ) : null}
                        </div>
                        <div>
                          <label className="field-label">
                            Lote {producto?.controlLote ? '*' : ''}
                          </label>
                          <input
                            className="field-control"
                            aria-label={`Lote del producto ${indice + 1}`}
                            placeholder={producto?.controlLote ? 'Obligatorio' : 'Opcional'}
                            {...register(`lineas.${indice}.lote`)}
                          />
                        </div>
                        <div>
                          <label className="field-label">Vencimiento</label>
                          <input
                            type="date"
                            className="field-control"
                            aria-label={`Vencimiento del producto ${indice + 1}`}
                            {...register(`lineas.${indice}.fechaVencimiento`)}
                          />
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>

            <section className="grid gap-5 border-t px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div>
                <label htmlFor="observacion-compra" className="field-label">
                  Observación
                </label>
                <textarea
                  id="observacion-compra"
                  rows={4}
                  className="field-control py-2"
                  {...register('observacion')}
                />
                <label className="mt-4 flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    {...register('preciosIncluyenIgv')}
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      Los costos incluyen IGV
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      El subtotal y el IGV se separarán desde el total ingresado.
                    </span>
                  </span>
                </label>
              </div>
              <dl className="border bg-muted/25 px-4 py-2">
                <div className="flex justify-between gap-4 border-b py-3 text-sm">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="font-mono tabular-nums">
                    {formatoMoneda.format(totales.subtotal)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-b py-3 text-sm">
                  <dt className="text-muted-foreground">IGV</dt>
                  <dd className="font-mono tabular-nums">
                    {formatoMoneda.format(totales.igv)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-3 font-semibold">
                  <dt>Total</dt>
                  <dd className="font-mono tabular-nums">
                    {formatoMoneda.format(totales.total)}
                  </dd>
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
              form="formulario-compra"
              size="lg"
              disabled={isSubmitting}
            >
              {compra ? 'Guardar cambios' : 'Guardar borrador'}
            </Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
