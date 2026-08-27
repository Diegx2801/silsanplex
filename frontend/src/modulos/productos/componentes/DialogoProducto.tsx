import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { type ComponentProps, useId } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  afectacionesIgv,
  esquemaProducto,
  productoInicial,
  type DatosProducto,
  type Producto,
} from '@/modulos/productos/modelo/producto'

interface CampoTextoProps extends ComponentProps<'input'> {
  etiqueta: string
  error?: string
  ayuda?: string
}

function CampoTexto({
  etiqueta,
  error,
  ayuda,
  id: idRecibido,
  ...props
}: CampoTextoProps) {
  const idGenerado = useId()
  const id = idRecibido ?? idGenerado
  const descripcionId = error || ayuda ? `${id}-descripcion` : undefined

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-describedby={descripcionId}
        aria-invalid={Boolean(error)}
        className="field-control"
        {...props}
      />
      {error ? (
        <p id={descripcionId} className="field-error">
          {error}
        </p>
      ) : ayuda ? (
        <p id={descripcionId} className="field-help">
          {ayuda}
        </p>
      ) : null}
    </div>
  )
}

interface OpcionBinariaProps extends ComponentProps<'input'> {
  etiqueta: string
  descripcion: string
}

function OpcionBinaria({
  etiqueta,
  descripcion,
  id: idRecibido,
  ...props
}: OpcionBinariaProps) {
  const idGenerado = useId()
  const id = idRecibido ?? idGenerado

  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 border-t py-4 first:border-t-0"
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-primary"
        {...props}
      />
      <span>
        <span className="block text-sm font-medium">{etiqueta}</span>
        <span className="mt-1 block text-sm leading-5 text-muted-foreground">
          {descripcion}
        </span>
      </span>
    </label>
  )
}

interface DialogoProductoProps {
  abierto: boolean
  producto: Producto | null
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosProducto, productoId?: string) => Promise<string | undefined>
  alRestaurarFoco: () => void
}

export function DialogoProducto({
  abierto,
  producto,
  alCambiarApertura,
  alGuardar,
  alRestaurarFoco,
}: DialogoProductoProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosProducto>({
    resolver: zodResolver(esquemaProducto),
    defaultValues: producto
      ? {
          ...producto,
          sublinea: producto.sublinea ?? '',
          costo: producto.costo ?? '',
        }
      : { ...productoInicial },
  })

  const guardar = async (datos: DatosProducto) => {
    const error = await alGuardar(datos, producto?.id)

    if (error) {
      setError('codigo', { message: error })
      return
    }

    alCambiarApertura(false)
  }

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 end-0 z-50 flex w-full max-w-3xl flex-col border-s bg-background shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <DialogPrimitive.Title className="text-xl font-semibold tracking-[-0.025em]">
                {producto ? 'Editar producto' : 'Registrar producto'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 max-w-[60ch] text-sm leading-6 text-muted-foreground">
                Completa los datos esenciales. Los campos opcionales podrán
                ampliarse cuando se confirme el flujo de la empresa.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar formulario"
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>

          <form
            id="formulario-producto"
            className="min-h-0 flex-1 overflow-y-auto"
            onSubmit={handleSubmit(guardar)}
          >
            <section aria-labelledby="identificacion-title" className="px-5 py-6 sm:px-7">
              <div className="mb-5 border-b pb-3">
                <h2 id="identificacion-title" className="font-semibold">
                  Identificación
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Los campos marcados con * son obligatorios.
                </p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <CampoTexto
                  etiqueta="Código interno *"
                  autoFocus
                  autoComplete="off"
                  placeholder="Ej. PROD-001"
                  error={errors.codigo?.message}
                  {...register('codigo')}
                />
                <CampoTexto
                  etiqueta="Código de barras"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Opcional"
                  error={errors.codigoBarras?.message}
                  {...register('codigoBarras')}
                />
                <div className="sm:col-span-2">
                  <CampoTexto
                    etiqueta="Nombre o descripción *"
                    autoComplete="off"
                    placeholder="Nombre con el que se reconocerá el producto"
                    error={errors.descripcion?.message}
                    {...register('descripcion')}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="descripcion-ampliada" className="field-label">
                    Descripción ampliada
                  </label>
                  <textarea
                    id="descripcion-ampliada"
                    rows={5}
                    className="field-control min-h-28 resize-y"
                    placeholder="Características, composición, uso, conservación u otras observaciones"
                    aria-invalid={Boolean(errors.descripcionAmpliada)}
                    aria-describedby={
                      errors.descripcionAmpliada
                        ? 'descripcion-ampliada-error'
                        : undefined
                    }
                    {...register('descripcionAmpliada')}
                  />
                  {errors.descripcionAmpliada ? (
                    <p id="descripcion-ampliada-error" className="field-error">
                      {errors.descripcionAmpliada.message}
                    </p>
                  ) : null}
                </div>
                <CampoTexto
                  etiqueta="Línea"
                  autoComplete="off"
                  placeholder="Opcional"
                  error={errors.categoria?.message}
                  {...register('categoria')}
                />
                <CampoTexto
                  etiqueta="Sublínea"
                  autoComplete="off"
                  placeholder="Opcional"
                  error={errors.sublinea?.message}
                  {...register('sublinea')}
                />
                <CampoTexto
                  etiqueta="Marca"
                  autoComplete="organization"
                  placeholder="Opcional"
                  error={errors.laboratorio?.message}
                  {...register('laboratorio')}
                />
                <CampoTexto
                  etiqueta="Presentación"
                  autoComplete="off"
                  placeholder="Ej. Caja x 20 tabletas"
                  error={errors.presentacion?.message}
                  {...register('presentacion')}
                />
                <CampoTexto
                  etiqueta="Unidad de medida"
                  autoComplete="off"
                  placeholder="Ej. Unidad, caja o frasco"
                  error={errors.unidadMedida?.message}
                  {...register('unidadMedida')}
                />
              </div>
            </section>

            <section aria-labelledby="comercial-title" className="border-t px-5 py-6 sm:px-7">
              <div className="mb-5">
                <h2 id="comercial-title" className="font-semibold">
                  Información comercial y sanitaria
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  El precio y la afectación de IGV quedan visibles para revisión;
                  aún no participan en ventas ni facturación.
                </p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <CampoTexto
                  etiqueta="Costo base (S/)"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  ayuda="Déjalo vacío si todavía no está confirmado."
                  error={errors.costo?.message}
                  {...register('costo')}
                />
                <div>
                  <label htmlFor="afectacion-igv" className="field-label">
                    Afectación de IGV
                  </label>
                  <select
                    id="afectacion-igv"
                    className="field-control"
                    aria-invalid={Boolean(errors.afectacionIgv)}
                    {...register('afectacionIgv')}
                  >
                    {afectacionesIgv.map((opcion) => (
                      <option key={opcion.valor || 'sin-definir'} value={opcion.valor}>
                        {opcion.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>
                <CampoTexto
                  etiqueta="Precio de venta base (S/)"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  ayuda="Déjalo vacío si todavía no está confirmado."
                  error={errors.precioVenta?.message}
                  {...register('precioVenta')}
                />
                <CampoTexto
                  etiqueta="Precio mínimo permitido (S/)"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  ayuda="Debe ser menor o igual al precio de venta base."
                  error={errors.precioMinimo?.message}
                  {...register('precioMinimo')}
                />
                <CampoTexto
                  etiqueta="Stock máximo global"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="Sin límite"
                  ayuda="Referencia global; los mínimos continúan definidos por almacén."
                  error={errors.stockMaximo?.message}
                  {...register('stockMaximo')}
                />
                <div className="sm:col-span-2">
                  <CampoTexto
                    etiqueta="Registro sanitario"
                    autoComplete="off"
                    placeholder="Opcional"
                    error={errors.registroSanitario?.message}
                    {...register('registroSanitario')}
                  />
                </div>
              </div>
            </section>

            <section aria-labelledby="dimensiones-title" className="border-t px-5 py-6 sm:px-7">
              <div className="mb-5">
                <h2 id="dimensiones-title" className="font-semibold">
                  Dimensiones y peso
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Medidas de la presentación comercial, útiles para almacenamiento y despacho.
                </p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <CampoTexto etiqueta="Ancho (cm)" inputMode="decimal" placeholder="0.000" error={errors.anchoCm?.message} {...register('anchoCm')} />
                <CampoTexto etiqueta="Alto (cm)" inputMode="decimal" placeholder="0.000" error={errors.altoCm?.message} {...register('altoCm')} />
                <CampoTexto etiqueta="Largo (cm)" inputMode="decimal" placeholder="0.000" error={errors.largoCm?.message} {...register('largoCm')} />
                <CampoTexto etiqueta="Peso (kg)" inputMode="decimal" placeholder="0.000" error={errors.pesoKg?.message} {...register('pesoKg')} />
              </div>
            </section>

            <section aria-labelledby="control-title" className="border-t px-5 py-6 sm:px-7">
              <h2 id="control-title" className="mb-2 font-semibold">
                Control operativo
              </h2>
              <OpcionBinaria
                etiqueta="Controlar por lote"
                descripcion="Agrupa las existencias por número de lote."
                {...register('controlLote')}
              />
              <OpcionBinaria
                etiqueta="Controlar vencimiento"
                descripcion="Exige y supervisa fechas de vencimiento, independientemente del lote."
                {...register('controlVencimiento')}
              />
              <OpcionBinaria
                etiqueta="Controlar por número de serie"
                descripcion="Exige un número de serie al registrar equipos en reparaciones."
                {...register('serialControl')}
              />
              <OpcionBinaria
                etiqueta="Venta con receta"
                descripcion="Identifica productos que requieren esta condición comercial."
                {...register('ventaReceta')}
              />
              <OpcionBinaria
                etiqueta="Producto activo"
                descripcion="Permite utilizarlo cuando se conecten los módulos operativos."
                {...register('activo')}
              />
            </section>
          </form>

          <footer className="flex flex-col-reverse gap-3 border-t bg-background px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="outline" size="lg">
                Cancelar
              </Button>
            </DialogPrimitive.Close>
            <Button
              type="submit"
              form="formulario-producto"
              size="lg"
              disabled={isSubmitting}
            >
              {producto ? 'Guardar cambios' : 'Registrar producto'}
            </Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
