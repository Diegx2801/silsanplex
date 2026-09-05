import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  esquemaDatosCotizacion,
  lineaCotizacionInicial,
  tiposLineaCotizacion,
  type CotizacionReparacion,
  type DatosCotizacion,
  type OpcionProductoReparacion,
  type Reparacion,
} from '@/modulos/reparaciones/modelo/reparacion'

function formatoMoneda(valor: number, moneda: 'PEN' | 'USD') {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: moneda,
  }).format(valor)
}

function redondear(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

function datosIniciales(cotizacion: CotizacionReparacion | null): DatosCotizacion {
  return {
    id: cotizacion?.estado === 'draft' ? cotizacion.id : undefined,
    moneda: cotizacion?.moneda ?? 'PEN',
    preciosIncluyenImpuesto: cotizacion?.preciosIncluyenImpuesto ?? false,
    tasaImpuesto: cotizacion ? String(cotizacion.tasaImpuesto) : '0',
    lineas: cotizacion?.lineas.length
      ? cotizacion.lineas.map((linea) => ({
          tipo: linea.tipo,
          productoId: linea.productoId ?? '',
          descripcion: linea.descripcion,
          cantidad: String(linea.cantidad),
          precioUnitario: String(linea.precioUnitario),
          gravable: linea.gravable,
        }))
      : [lineaCotizacionInicial()],
  }
}

interface DialogoCotizacionProps {
  abierto: boolean
  reparacion: Reparacion
  cotizacion: CotizacionReparacion | null
  esRevision?: boolean
  productos: readonly OpcionProductoReparacion[]
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosCotizacion, enviar: boolean, operationKey: string) => Promise<string | undefined>
}

export function DialogoCotizacion({
  abierto,
  reparacion,
  cotizacion,
  esRevision = false,
  productos,
  alCambiarApertura,
  alGuardar,
}: DialogoCotizacionProps) {
  const [mensaje, setMensaje] = useState('')
  const operacion = useRef<{ firma: string; clave: string } | null>(null)
  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DatosCotizacion>({
    resolver: zodResolver(esquemaDatosCotizacion),
    defaultValues: datosIniciales(cotizacion),
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'lineas' })
  const lineas = watch('lineas')
  const moneda = watch('moneda')
  const preciosIncluyenImpuesto = watch('preciosIncluyenImpuesto')
  const tasa = Number(watch('tasaImpuesto') || 0)
  const bruto = lineas.reduce(
    (total, linea) =>
      total + redondear(Number(linea.cantidad || 0) * Number(linea.precioUnitario || 0)),
    0,
  )
  const brutoGravable = lineas.reduce(
    (total, linea) =>
      total + (linea.gravable ? redondear(Number(linea.cantidad || 0) * Number(linea.precioUnitario || 0)) : 0),
    0,
  )
  const subtotal = preciosIncluyenImpuesto
    ? redondear(bruto - brutoGravable + brutoGravable / (1 + tasa / 100))
    : redondear(bruto)
  const impuesto = preciosIncluyenImpuesto
    ? redondear(bruto - subtotal)
    : redondear((brutoGravable * tasa) / 100)
  const total = redondear(subtotal + impuesto)

  useEffect(() => {
    // Conservar la intención enviada si los datos se refrescan tras un timeout.
    if (abierto && operacion.current) return
    operacion.current = null
    if (abierto) reset(datosIniciales(cotizacion))
  }, [abierto, cotizacion, reset])

  const guardar = async (datos: DatosCotizacion, enviar: boolean) => {
    setMensaje('')
    const firma = JSON.stringify({ datos, enviar })
    if (operacion.current?.firma !== firma) {
      operacion.current = { firma, clave: crypto.randomUUID() }
    }
    const error = await alGuardar(datos, enviar, operacion.current.clave)
    if (error) {
      setMensaje(error)
      return
    }
    alCambiarApertura(false)
  }

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-foreground/30" />
        <DialogPrimitive.Content className="fixed inset-y-0 end-0 z-[70] flex w-full max-w-4xl flex-col border-s bg-background shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <DialogPrimitive.Title className="text-xl font-semibold">{esRevision && cotizacion ? `Crear revisión desde v${cotizacion.version}` : cotizacion ? `Editar cotización v${cotizacion.version}` : 'Crear cotización'}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">{reparacion.codigo} · El servidor calcula subtotal, impuesto y total al guardar.</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar cotización" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="size-5" /></button></DialogPrimitive.Close>
          </header>

          <form id="formulario-cotizacion" className="min-h-0 flex-1 overflow-y-auto" onSubmit={(evento) => evento.preventDefault()}>
            <section className="grid gap-5 border-b px-5 py-6 sm:grid-cols-3 sm:px-7">
              <div>
                <label htmlFor="cotizacion-moneda" className="field-label">Moneda *</label>
                <select id="cotizacion-moneda" className="field-control" {...register('moneda')}>
                  <option value="PEN">Sol peruano (PEN)</option>
                  <option value="USD">Dólar estadounidense (USD)</option>
                </select>
              </div>
              <div>
                <label htmlFor="cotizacion-tasa" className="field-label">Tasa de impuesto (%) *</label>
                <input id="cotizacion-tasa" type="number" min="0" max="100" step="0.0001" className="field-control" {...register('tasaImpuesto')} />
                {errors.tasaImpuesto ? <p className="field-error">{errors.tasaImpuesto.message}</p> : null}
              </div>
              <label htmlFor="cotizacion-precios" className="flex cursor-pointer items-start gap-3 self-end border-t py-3 sm:border-t-0 sm:py-0">
                <input id="cotizacion-precios" type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" {...register('preciosIncluyenImpuesto')} />
                <span><span className="block text-sm font-medium">Precios incluyen impuesto</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">La base y el impuesto se desglosan según esta opción.</span></span>
              </label>
            </section>

            <section aria-labelledby="cotizacion-lineas" className="px-5 py-6 sm:px-7">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id="cotizacion-lineas" className="font-semibold">Líneas de cotización</h2>
                  <p className="mt-1 text-sm text-muted-foreground">La línea de tipo repuesto debe vincularse a un producto activo.</p>
                </div>
                <Button type="button" variant="outline" onClick={() => append(lineaCotizacionInicial())}>
                  <Plus aria-hidden="true" /> Agregar línea
                </Button>
              </div>
              <div className="mt-5 space-y-4">
                {fields.map((field, indice) => {
                  const tipo = lineas[indice]?.tipo ?? 'labor'
                  const errorLinea = errors.lineas?.[indice]
                  return (
                    <article key={field.id} className="border bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-mono text-xs text-muted-foreground">LÍNEA {indice + 1}</p>
                        <Button type="button" variant="ghost" size="icon" disabled={fields.length === 1} aria-label={`Eliminar línea ${indice + 1}`} onClick={() => remove(indice)}>
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-[11rem_minmax(0,1fr)_8rem_10rem]">
                        <div>
                          <label htmlFor={`cotizacion-tipo-${field.id}`} className="field-label">Tipo *</label>
                          <select id={`cotizacion-tipo-${field.id}`} className="field-control" {...register(`lineas.${indice}.tipo`, { onChange: (evento) => { if (evento.target.value !== 'part') setValue(`lineas.${indice}.productoId`, '') } })}>
                            {tiposLineaCotizacion.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
                          </select>
                        </div>
                        {tipo === 'part' ? (
                          <div className="sm:col-span-1 lg:col-span-1">
                            <label htmlFor={`cotizacion-producto-${field.id}`} className="field-label">Producto *</label>
                            <select id={`cotizacion-producto-${field.id}`} className="field-control" aria-invalid={Boolean(errorLinea?.productoId)} {...register(`lineas.${indice}.productoId`, { onChange: (evento) => { const producto = productos.find((item) => item.id === evento.target.value); if (!lineas[indice]?.descripcion && producto) setValue(`lineas.${indice}.descripcion`, producto.descripcion) } })}>
                              <option value="">Selecciona repuesto</option>
                              {productos.map((producto) => <option key={producto.id} value={producto.id}>{producto.codigo} · {producto.descripcion}</option>)}
                            </select>
                            {errorLinea?.productoId ? <p className="field-error">{errorLinea.productoId.message}</p> : null}
                          </div>
                        ) : null}
                        <div className={tipo === 'part' ? 'sm:col-span-2 lg:col-span-1' : 'sm:col-span-2 lg:col-span-2'}>
                          <label htmlFor={`cotizacion-descripcion-${field.id}`} className="field-label">Descripción *</label>
                          <input id={`cotizacion-descripcion-${field.id}`} className="field-control" autoComplete="off" aria-invalid={Boolean(errorLinea?.descripcion)} {...register(`lineas.${indice}.descripcion`)} />
                          {errorLinea?.descripcion ? <p className="field-error">{errorLinea.descripcion.message}</p> : null}
                        </div>
                        <div>
                          <label htmlFor={`cotizacion-cantidad-${field.id}`} className="field-label">Cantidad *</label>
                          <input id={`cotizacion-cantidad-${field.id}`} type="number" min="0.001" step="0.001" className="field-control" aria-invalid={Boolean(errorLinea?.cantidad)} {...register(`lineas.${indice}.cantidad`)} />
                          {errorLinea?.cantidad ? <p className="field-error">{errorLinea.cantidad.message}</p> : null}
                        </div>
                        <div>
                          <label htmlFor={`cotizacion-precio-${field.id}`} className="field-label">Precio unitario *</label>
                          <input id={`cotizacion-precio-${field.id}`} type="number" min="0" step="0.0001" className="field-control" aria-invalid={Boolean(errorLinea?.precioUnitario)} {...register(`lineas.${indice}.precioUnitario`)} />
                          {errorLinea?.precioUnitario ? <p className="field-error">{errorLinea.precioUnitario.message}</p> : null}
                        </div>
                        <label htmlFor={`cotizacion-gravable-${field.id}`} className="flex items-center gap-2 text-sm lg:col-span-2">
                          <input id={`cotizacion-gravable-${field.id}`} type="checkbox" className="size-4 accent-primary" {...register(`lineas.${indice}.gravable`)} />
                          Línea gravable
                        </label>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>

            <section aria-label="Resumen calculado" className="border-t bg-muted/30 px-5 py-5 sm:px-7">
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                 <div><p className="text-muted-foreground">Subtotal estimado</p><p className="mt-1 font-mono font-semibold tabular-nums">{formatoMoneda(subtotal, moneda)}</p></div>
                 <div><p className="text-muted-foreground">Impuesto estimado</p><p className="mt-1 font-mono font-semibold tabular-nums">{formatoMoneda(impuesto, moneda)}</p></div>
                 <div><p className="text-muted-foreground">Total estimado</p><p className="mt-1 font-mono text-lg font-semibold tabular-nums">{formatoMoneda(total, moneda)}</p></div>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">El cálculo visual es orientativo. Los valores persistidos serán los calculados por `save_repair_quote`.</p>
            </section>
          </form>

          {mensaje ? <p role="alert" className="border-t bg-destructive/10 px-5 py-3 text-sm text-destructive sm:px-7">{mensaje}</p> : null}
          <footer className="flex flex-col-reverse gap-2 border-t bg-background px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <DialogPrimitive.Close asChild><Button type="button" variant="outline" size="lg">Cancelar</Button></DialogPrimitive.Close>
            <Button type="button" variant="outline" size="lg" disabled={isSubmitting} onClick={() => void handleSubmit((datos) => guardar(datos, false))()}>Guardar borrador</Button>
            <Button type="button" size="lg" disabled={isSubmitting} onClick={() => void handleSubmit((datos) => guardar(datos, true))()}>Enviar a aprobación</Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
