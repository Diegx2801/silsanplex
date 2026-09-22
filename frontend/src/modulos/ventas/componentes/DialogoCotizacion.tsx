import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useMemo, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { fechaPeruEnDias } from '@/lib/fechas'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import type { Cliente } from '@/modulos/clientes/modelo/cliente'
import type { Producto } from '@/modulos/productos/modelo/producto'
import {
  calcularTotalesCotizacion,
  obtenerPrecioMinimoCotizacion,
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
  return fechaPeruEnDias(dias)
}

interface DialogoCotizacionProps {
  abierto: boolean
  cotizacion: Cotizacion | null
  clientes: readonly Cliente[]
  productos: readonly Producto[]
  buscarClientes?: (busqueda: string) => Promise<readonly Cliente[]>
  buscarProductos?: (busqueda: string) => Promise<readonly Producto[]>
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (
    datos: DatosCotizacion,
    cotizacionId?: string,
  ) => string | undefined | Promise<string | undefined>
  alRestaurarFoco: () => void
}

export function DialogoCotizacion({
  abierto,
  cotizacion,
  clientes,
  productos,
  buscarClientes,
  buscarProductos,
  alCambiarApertura,
  alGuardar,
  alRestaurarFoco,
}: DialogoCotizacionProps) {
  const [productosRemotos, setProductosRemotos] = useState<readonly Producto[]>([])
  const catalogoProductos = useMemo(() => {
    const porId = new Map(productos.map((producto) => [producto.id, producto]))
    productosRemotos.forEach((producto) => porId.set(producto.id, producto))
    return [...porId.values()]
  }, [productos, productosRemotos])
  const valoresIniciales: DatosCotizacion = cotizacion
    ? cotizacionAFormulario(cotizacion)
    : {
        clienteId: '',
        fechaEmision: fechaEnDias(0),
        fechaValidez: fechaEnDias(7),
        preciosIncluyenIgv: true,
        observacion: '',
        lineas: [
          {
            productoId: '',
            cantidad: '1',
            precioUnitario: '',
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
  const clienteId = watch('clienteId')
  const preciosIncluyenIgv = watch('preciosIncluyenIgv')
  const snapshotsPorProducto = new Map(
    (cotizacion?.lineas ?? []).map((linea) => [linea.productoId, linea.afectacionIgv]),
  )
  const afectacionPorProducto = (productoId: string) => {
    const snapshot = snapshotsPorProducto.get(productoId)
    if (snapshot) return snapshot
    return catalogoProductos.find((producto) => producto.id === productoId)?.afectacionIgv || 'por-definir'
  }
  const lineasConAfectacionPendiente = lineas.flatMap((linea, indice) => {
    if (!linea.productoId) return []
    const producto = catalogoProductos.find((item) => item.id === linea.productoId)
    const afectacion = afectacionPorProducto(linea.productoId)
    if (afectacion !== 'por-definir') return []
    return [{
      indice,
      descripcion: producto?.descripcion ?? 'Producto seleccionado',
    }]
  })
  const totales = calcularTotalesCotizacion(
    lineas.map((linea) => ({
      cantidad: Number(linea.cantidad) || 0,
      precioUnitario: Number(linea.precioUnitario) || 0,
      afectacionIgv: afectacionPorProducto(linea.productoId),
    })),
    preciosIncluyenIgv,
  )
  const errorLineas = errors.lineas?.message ?? errors.lineas?.root?.message
  const clientesDisponibles = clientes.filter(
    (cliente) => cliente.activo || cliente.id === clienteId,
  )
  const opcionesClientes: ComboboxOption[] = clientesDisponibles.map((cliente) => ({
    value: cliente.id,
    label: cliente.nombreRazonSocial,
    secondaryText: [cliente.numeroDocumento, cliente.nombreComercial]
      .filter(Boolean)
      .join(' · '),
    keywords: [
      cliente.numeroDocumento,
      cliente.nombreRazonSocial,
      cliente.nombreComercial,
      cliente.contacto,
      cliente.email,
      cliente.telefono,
    ],
    disabled: !cliente.activo,
  }))

  const guardar = async (datos: DatosCotizacion) => {
    const error = await alGuardar(datos, cotizacion?.id)
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
          className="fixed start-1/2 top-1/2 z-50 flex max-h-[92svh] w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background shadow-xl outline-none sm:w-[calc(100%-3rem)]"
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
                  <Controller
                    control={control}
                    name="clienteId"
                    render={({ field }) => (
                      <Combobox
                        id="cliente-cotizacion"
                        label="Cliente"
                        value={field.value}
                        options={opcionesClientes}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        loadOptions={buscarClientes ? async (busqueda) => (await buscarClientes(busqueda)).map((cliente) => ({
                          value: cliente.id,
                          label: cliente.nombreRazonSocial,
                          secondaryText: [cliente.numeroDocumento, cliente.nombreComercial].filter(Boolean).join(' · '),
                          keywords: [cliente.numeroDocumento, cliente.nombreRazonSocial, cliente.nombreComercial, cliente.contacto, cliente.email, cliente.telefono],
                          disabled: !cliente.activo,
                        })) : undefined}
                        placeholder="Buscar cliente…"
                        helperText="Documento, nombre o razón social."
                        error={errors.clienteId?.message}
                        required
                        noOptionsMessage="No hay clientes activos disponibles."
                      />
                    )}
                  />
                </div>
                <div>
                  <label htmlFor="emision-cotizacion" className="field-label">
                    Emisión *
                  </label>
                  <input
                    id="emision-cotizacion"
                    type="date"
                    className="field-control"
                    aria-invalid={Boolean(errors.fechaEmision)}
                    {...register('fechaEmision')}
                  />
                  {errors.fechaEmision ? (
                    <p className="field-error">{errors.fechaEmision.message}</p>
                  ) : null}
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
                      productoId: '',
                      cantidad: '1',
                      precioUnitario: '',
                    })
                  }
                >
                  <Plus aria-hidden="true" /> Agregar producto
                </Button>
              </div>

              {errorLineas ? (
                <p role="alert" className="field-error mb-4">
                  {errorLineas}
                </p>
              ) : null}

              <div className="space-y-4">
                {fields.map((field, indice) => {
                  const erroresLinea = errors.lineas?.[indice]
                  const productoSeleccionado = catalogoProductos.find(
                    (producto) => producto.id === lineas[indice]?.productoId,
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
                          <Controller
                            control={control}
                            name={`lineas.${indice}.productoId`}
                            render={({ field: campo }) => {
                              const productoActualId = lineas[indice]?.productoId
                              const opcionesProductos: ComboboxOption[] = catalogoProductos
                                .filter(
                                  (producto) =>
                                    (producto.activo || producto.id === productoActualId) &&
                                    !lineas.some(
                                      (linea, otroIndice) =>
                                        otroIndice !== indice &&
                                        linea.productoId === producto.id,
                                    ),
                                )
                                .map((producto) => ({
                                  value: producto.id,
                                  label: `${producto.codigo} · ${producto.descripcion}`,
                                  secondaryText: `${producto.tipo === 'service' ? 'Servicio' : 'Producto físico'} · Unidad: ${producto.unidadMedida || 'Sin unidad'}`,
                                  keywords: [
                                    producto.codigo,
                                    producto.codigoBarras,
                                    producto.descripcion,
                                    producto.laboratorio,
                                    producto.presentacion,
                                    producto.unidadMedida,
                                  ],
                                  disabled: !producto.activo,
                                }))

                              return (
                                <Combobox
                                  id={`producto-cotizacion-${field.id}`}
                                  label={`Producto ${indice + 1}`}
                                  value={campo.value}
                                  options={opcionesProductos}
                                  onChange={(value) => {
                                    campo.onChange(value)
                                    const producto = catalogoProductos.find((item) => item.id === value)
                                    setValue(
                                      `lineas.${indice}.precioUnitario`,
                                      producto?.precioVenta ?? '',
                                      { shouldValidate: true, shouldDirty: true },
                                    )
                                  }}
                                  onBlur={campo.onBlur}
                                  loadOptions={buscarProductos ? async (busqueda) => {
                                    const resultados = await buscarProductos(busqueda)
                                    setProductosRemotos((actuales) => {
                                      const porId = new Map(actuales.map((item) => [item.id, item]))
                                      resultados.forEach((item) => porId.set(item.id, item))
                                      return [...porId.values()]
                                    })
                                    return resultados
                                      .filter((producto) => (producto.activo || producto.id === productoActualId) && !lineas.some((linea, otroIndice) => otroIndice !== indice && linea.productoId === producto.id))
                                      .map((producto) => ({
                                      value: producto.id,
                                      label: `${producto.codigo} · ${producto.descripcion}`,
                                      secondaryText: `${producto.tipo === 'service' ? 'Servicio' : 'Producto físico'} · Unidad: ${producto.unidadMedida || 'Sin unidad'}`,
                                      keywords: [producto.codigo, producto.codigoBarras, producto.descripcion, producto.laboratorio, producto.presentacion, producto.unidadMedida],
                                      disabled: !producto.activo,
                                      }))
                                  } : undefined}
                                  placeholder="Buscar producto…"
                                  helperText="Código, nombre o barras."
                                  error={erroresLinea?.productoId?.message}
                                  required
                                  noOptionsMessage="No hay productos activos disponibles."
                                />
                              )
                            }}
                          />
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
                          {productoSeleccionado && obtenerPrecioMinimoCotizacion(productoSeleccionado, preciosIncluyenIgv) !== null ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Mínimo permitido:{' '}
                              {formatoMoneda.format(
                                obtenerPrecioMinimoCotizacion(productoSeleccionado, preciosIncluyenIgv)!,
                              )}
                              {productoSeleccionado.afectacionIgv === 'gravado' && !preciosIncluyenIgv ? ' sin IGV' : ' final'}
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
              <div className="space-y-4">
                {lineasConAfectacionPendiente.length ? (
                  <aside
                    role="status"
                    aria-live="polite"
                    className="border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-950"
                  >
                    <p className="font-medium">Falta definir la afectación de IGV.</p>
                    <p className="mt-1">
                      El borrador puede guardarse, pero la cotización no podrá emitirse hasta clasificar estos productos en el catálogo.
                    </p>
                    <ul className="mt-2 list-disc space-y-1 ps-5">
                      {lineasConAfectacionPendiente.map(({ indice, descripcion }) => (
                        <li key={`${indice}-${descripcion}`}>Producto {indice + 1}: {descripcion}</li>
                      ))}
                    </ul>
                  </aside>
                ) : null}
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
              </div>
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
