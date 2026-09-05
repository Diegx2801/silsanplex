import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { type ComponentProps, useEffect, useId, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  datosReparacionInicial,
  esquemaDatosReparacion,
  prioridadesReparacion,
  validarNumeroSerie,
  type DatosReparacion,
  type OpcionClienteReparacion,
  type OpcionProductoReparacion,
  type Reparacion,
} from '@/modulos/reparaciones/modelo/reparacion'

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
  const descripcionId = error || ayuda ? `${id}-ayuda` : undefined

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {etiqueta}
      </label>
      <input
        id={id}
        className="field-control"
        aria-describedby={descripcionId}
        aria-invalid={Boolean(error)}
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

interface CampoAreaProps extends ComponentProps<'textarea'> {
  etiqueta: string
  error?: string
  ayuda?: string
}

function CampoArea({ etiqueta, error, ayuda, id, ...props }: CampoAreaProps) {
  const idGenerado = useId()
  const controlId = id ?? idGenerado

  return (
    <div>
      <label htmlFor={controlId} className="field-label">
        {etiqueta}
      </label>
      <textarea
        id={controlId}
        className="field-control min-h-24 resize-y py-2"
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error ? <p className="field-error">{error}</p> : ayuda ? <p className="field-help">{ayuda}</p> : null}
    </div>
  )
}

interface OpcionBinariaProps extends ComponentProps<'input'> {
  etiqueta: string
  descripcion: string
}

function OpcionBinaria({ etiqueta, descripcion, id: idRecibido, ...props }: OpcionBinariaProps) {
  const idGenerado = useId()
  const id = idRecibido ?? idGenerado

  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 border-t py-4 first:border-t-0">
      <input id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" {...props} />
      <span>
        <span className="block text-sm font-medium">{etiqueta}</span>
        <span className="mt-1 block text-sm leading-5 text-muted-foreground">{descripcion}</span>
      </span>
    </label>
  )
}

interface DialogoReparacionProps {
  abierto: boolean
  reparacion: Reparacion | null
  identidadEditable: boolean
  clientes: readonly OpcionClienteReparacion[]
  productos: readonly OpcionProductoReparacion[]
  cargandoOpciones?: boolean
  datosCreacionPendiente?: DatosReparacion
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (
    datos: DatosReparacion,
    reparacionId: string | undefined,
    identidadEditable: boolean,
    operationKey: string | undefined,
  ) => Promise<string | undefined>
  alRestaurarFoco: () => void
}

export function DialogoReparacion({
  abierto,
  reparacion,
  identidadEditable,
  clientes,
  productos,
  cargandoOpciones = false,
  datosCreacionPendiente,
  alCambiarApertura,
  alGuardar,
  alRestaurarFoco,
}: DialogoReparacionProps) {
  const [mensaje, setMensaje] = useState('')
  const [productoSeleccionadoExplicitamente, setProductoSeleccionadoExplicitamente] = useState(false)
  const operacionCreacion = useRef<{ firma: string; clave: string } | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosReparacion>({
    resolver: zodResolver(esquemaDatosReparacion),
    defaultValues: reparacion ? datosReparacionInicial(reparacion) : datosCreacionPendiente ?? datosReparacionInicial(null),
  })
  const productoId = watch('productoId')
  const numeroSerie = watch('numeroSerie')
  const producto = productos.find((item) => item.id === productoId)
  const productoEsReferenciaOriginal = Boolean(
    reparacion && productoId === reparacion.productoId,
  )
  const productoEsConocido = productoEsReferenciaOriginal || Boolean(producto)
  const controlaSerie = productoEsReferenciaOriginal
    ? reparacion?.serialControlSnapshot ?? false
    : producto?.serialControl ?? false
  const clienteHistorico = reparacion && !clientes.some((cliente) => cliente.id === reparacion.clienteId)
    ? reparacion
    : null
  const productoHistorico = reparacion && !productos.some((item) => item.id === reparacion.productoId)
    ? reparacion
    : null
  const registroProducto = register('productoId')

  useEffect(() => {
    if (
      identidadEditable
      && productoSeleccionadoExplicitamente
      && productoEsConocido
      && !controlaSerie
      && numeroSerie
    ) {
      setValue('numeroSerie', '')
    }
  }, [
    controlaSerie,
    identidadEditable,
    numeroSerie,
    productoEsConocido,
    productoSeleccionadoExplicitamente,
    setValue,
  ])

  useEffect(() => {
    operacionCreacion.current = null
  }, [abierto, reparacion?.id])

  const guardar = async (datos: DatosReparacion) => {
    if (identidadEditable && !productoEsConocido) {
      setError('productoId', { message: 'Selecciona un producto activo' })
      return
    }
    const errorSerie = identidadEditable
      ? validarNumeroSerie(datos.numeroSerie, controlaSerie)
      : undefined
    if (errorSerie) {
      setError('numeroSerie', { message: errorSerie })
      return
    }

    setMensaje('')
    const datosNormalizados = {
      ...datos,
      numeroSerie:
        identidadEditable && productoSeleccionadoExplicitamente && !controlaSerie
          ? ''
          : datos.numeroSerie,
    }
    const firma = JSON.stringify(datosNormalizados)
    if (!reparacion && operacionCreacion.current?.firma !== firma) {
      operacionCreacion.current = { firma, clave: crypto.randomUUID() }
    }
    const error = await alGuardar(
      datosNormalizados,
      reparacion?.id,
      identidadEditable,
      reparacion ? undefined : operacionCreacion.current!.clave,
    )
    if (error) {
      if (error.toLocaleLowerCase('es-PE').includes('serie')) {
        setError('numeroSerie', { message: error })
      } else {
        setMensaje(error)
      }
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
          {!reparacion && datosCreacionPendiente ? <p role="status" className="border-b bg-muted px-5 py-3 text-sm">Se recuperó un registro pendiente de confirmar. Reintenta con estos datos antes de iniciar otra reparación.</p> : null}
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <DialogPrimitive.Title className="text-xl font-semibold tracking-[-0.025em]">
                {reparacion ? `Editar ${reparacion.codigo}` : 'Registrar reparación'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 max-w-[58ch] text-sm leading-6 text-muted-foreground">
                Registra el equipo recibido y la información necesaria para seguir su atención.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar formulario de reparación"
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>

          <form
            id="formulario-reparacion"
            className="min-h-0 flex-1 overflow-y-auto"
            onSubmit={handleSubmit(guardar)}
          >
            <section aria-labelledby="reparacion-identificacion" className="px-5 py-6 sm:px-7">
              <div className="mb-5 border-b pb-3">
                <h2 id="reparacion-identificacion" className="font-semibold">Identificación del servicio</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {identidadEditable
                    ? reparacion
                      ? 'Puedes conservar las referencias de la orden; cualquier reemplazo debe estar activo.'
                      : 'Cliente y producto deben estar activos en la organización.'
                    : 'Información conservada de la recepción de la orden.'}
                </p>
              </div>
              {!identidadEditable && reparacion ? (
                <>
                  <p className="mb-5 border border-primary/25 bg-primary/5 px-4 py-3 text-sm leading-6 text-muted-foreground sm:col-span-2">
                    El cliente, el producto y la serie ya no pueden modificarse porque la atención tiene historial operativo.
                  </p>
                  <input type="hidden" {...register('clienteId')} />
                  <input type="hidden" {...register('productoId')} />
                  <input type="hidden" {...register('numeroSerie')} />
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <div className="border bg-muted/20 px-4 py-3">
                      <dt className="field-label">Cliente</dt>
                      <dd className="text-sm font-medium">{reparacion.clienteNombreSnapshot}</dd>
                      <dd className="mt-1 text-xs text-muted-foreground">{reparacion.clienteDocumentoSnapshot}</dd>
                    </div>
                    <div className="border bg-muted/20 px-4 py-3">
                      <dt className="field-label">Producto o equipo</dt>
                      <dd className="text-sm font-medium">{reparacion.productoDescripcionSnapshot}</dd>
                      <dd className="mt-1 font-mono text-xs text-muted-foreground">{reparacion.productoCodigoSnapshot}</dd>
                    </div>
                    <div className="border bg-muted/20 px-4 py-3 sm:col-span-2">
                      <dt className="field-label">Número de serie</dt>
                      <dd className="font-mono text-sm">{reparacion.numeroSerie || 'No aplica'}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="reparacion-cliente" className="field-label">Cliente *</label>
                  <select id="reparacion-cliente" className="field-control" aria-invalid={Boolean(errors.clienteId)} {...register('clienteId')}>
                    <option value="">{cargandoOpciones ? 'Cargando clientes…' : 'Selecciona un cliente'}</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.nombre} · {cliente.documento}
                      </option>
                    ))}
                    {clienteHistorico ? (
                      <option value={clienteHistorico.clienteId}>
                        {clienteHistorico.clienteNombreSnapshot} · {clienteHistorico.clienteDocumentoSnapshot} (referencia de la orden)
                      </option>
                    ) : null}
                  </select>
                  {errors.clienteId ? <p className="field-error">{errors.clienteId.message}</p> : null}
                </div>
                <div>
                  <label htmlFor="reparacion-producto" className="field-label">Producto o equipo *</label>
                  <select
                    id="reparacion-producto"
                    className="field-control"
                    aria-invalid={Boolean(errors.productoId)}
                    {...registroProducto}
                    onChange={(evento) => {
                      setProductoSeleccionadoExplicitamente(true)
                      void registroProducto.onChange(evento)
                    }}
                  >
                    <option value="">{cargandoOpciones ? 'Cargando productos…' : 'Selecciona un producto'}</option>
                    {productos.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.codigo} · {item.descripcion}
                      </option>
                    ))}
                    {productoHistorico ? (
                      <option value={productoHistorico.productoId}>
                        {productoHistorico.productoCodigoSnapshot} · {productoHistorico.productoDescripcionSnapshot} (referencia de la orden)
                      </option>
                    ) : null}
                  </select>
                  {errors.productoId ? <p className="field-error">{errors.productoId.message}</p> : null}
                </div>
                {controlaSerie || (productoEsReferenciaOriginal && Boolean(numeroSerie)) ? (
                  <CampoTexto
                    etiqueta={`Número de serie${controlaSerie ? ' *' : ''}`}
                    autoComplete="off"
                    placeholder="Serie del equipo recibido"
                    error={errors.numeroSerie?.message}
                    ayuda={controlaSerie
                      ? 'La regla de serie conservada al recibir la orden exige este dato.'
                      : 'La serie histórica se conservará mientras mantengas el producto original.'}
                    {...register('numeroSerie')}
                  />
                ) : (
                  <div className="flex items-end sm:col-span-2">
                    <p className="w-full border border-dashed px-4 py-3 text-sm leading-6 text-muted-foreground">
                      {productoEsConocido
                        ? 'Este producto no controla números de serie. La reparación se registrará sin serie.'
                        : 'Selecciona un producto para saber si se debe registrar una serie.'}
                    </p>
                  </div>
                )}
                </div>
              )}
            </section>

            <section aria-labelledby="reparacion-recepcion" className="border-t px-5 py-6 sm:px-7">
              <div className="mb-5">
                <h2 id="reparacion-recepcion" className="font-semibold">Recepción y prioridad</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">La fecha de recepción la asigna el servidor; la fecha estimada sí puede ajustarse.</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="reparacion-prioridad" className="field-label">Prioridad *</label>
                  <select id="reparacion-prioridad" className="field-control" {...register('prioridad')}>
                    {prioridadesReparacion.map((prioridad) => (
                      <option key={prioridad.valor} value={prioridad.valor}>{prioridad.etiqueta}</option>
                    ))}
                  </select>
                </div>
                <CampoTexto
                  etiqueta="Fecha estimada de entrega"
                  type="date"
                  error={errors.fechaEstimadaEntrega?.message}
                  {...register('fechaEstimadaEntrega')}
                />
                <CampoArea
                  etiqueta="Problema reportado *"
                  rows={5}
                  placeholder="Describe la falla, síntoma o motivo de ingreso"
                  error={errors.problema?.message}
                  {...register('problema')}
                />
                <CampoArea
                  etiqueta="Notas de recepción"
                  rows={5}
                  placeholder="Accesorios recibidos, condición física u observaciones"
                  error={errors.notas?.message}
                  {...register('notas')}
                />
              </div>
            </section>

            <section aria-labelledby="reparacion-comercial" className="border-t px-5 py-6 sm:px-7">
              <div className="mb-5">
                <h2 id="reparacion-comercial" className="font-semibold">Referencias comerciales y garantía</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Estos datos quedan asociados a la orden para facilitar la comunicación con el cliente.</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <CampoTexto
                  etiqueta="Referencia del cliente"
                  autoComplete="off"
                  placeholder="Ticket, llamada o referencia externa"
                  error={errors.referenciaCliente?.message}
                  {...register('referenciaCliente')}
                />
                <CampoTexto
                  etiqueta="ID de documento de venta"
                  autoComplete="off"
                  placeholder="UUID opcional"
                  ayuda="Solo si la orden proviene de una venta registrada."
                  error={errors.documentoVentaId?.message}
                  {...register('documentoVentaId')}
                />
                <CampoTexto
                  etiqueta="Referencia de garantía"
                  autoComplete="off"
                  placeholder="N.º de garantía o autorización"
                  error={errors.referenciaGarantia?.message}
                  {...register('referenciaGarantia')}
                />
                <div className="sm:col-span-2">
                  <OpcionBinaria
                    etiqueta="Atención en garantía"
                    descripcion="Inicia la orden en estado de garantía para distinguirla del flujo comercial regular."
                    disabled={Boolean(reparacion)}
                    {...register('esGarantia')}
                  />
                </div>
              </div>
            </section>

          </form>

          {mensaje ? <p role="alert" className="border-t bg-destructive/10 px-5 py-3 text-sm text-destructive sm:px-7">{mensaje}</p> : null}
          <footer className="flex flex-col-reverse gap-3 border-t bg-background px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="outline" size="lg">Cancelar</Button>
            </DialogPrimitive.Close>
            <Button type="submit" form="formulario-reparacion" size="lg" disabled={isSubmitting || cargandoOpciones}>
              {reparacion ? 'Guardar cambios' : 'Registrar reparación'}
            </Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
