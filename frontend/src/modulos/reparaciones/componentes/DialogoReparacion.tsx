import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { type ComponentProps, useEffect, useId, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  datosReparacionInicial,
  esquemaDatosReparacion,
  prioridadesReparacion,
  validarNumeroSerie,
  type DatosReparacion,
  type ConsultaCatalogoReparacion,
  type OpcionClienteReparacion,
  type OpcionProductoReparacion,
  type ResultadoCatalogoReparacion,
  type Reparacion,
} from '@/modulos/reparaciones/modelo/reparacion'
import { SelectorCatalogoReparacion } from './SelectorCatalogoReparacion'
import { FormularioAccesoriosRecepcion } from './FormularioAccesoriosRecepcion'

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
        aria-describedby={error || ayuda ? `${controlId}-ayuda` : undefined}
        {...props}
      />
      {error ? <p id={`${controlId}-ayuda`} className="field-error">{error}</p> : ayuda ? <p id={`${controlId}-ayuda`} className="field-help">{ayuda}</p> : null}
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
  totalClientes?: number
  totalProductos?: number
  clienteActual?: OpcionClienteReparacion | null
  productoActual?: OpcionProductoReparacion | null
  buscarClientes?: (consulta: ConsultaCatalogoReparacion) => Promise<ResultadoCatalogoReparacion<OpcionClienteReparacion>>
  buscarProductos?: (consulta: ConsultaCatalogoReparacion) => Promise<ResultadoCatalogoReparacion<OpcionProductoReparacion>>
  resolverCliente?: (id: string) => Promise<OpcionClienteReparacion | null>
  resolverProducto?: (id: string) => Promise<OpcionProductoReparacion | null>
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
  totalClientes = clientes.length,
  totalProductos = productos.length,
  clienteActual,
  productoActual,
  buscarClientes,
  buscarProductos,
  resolverCliente,
  resolverProducto,
  datosCreacionPendiente,
  alCambiarApertura,
  alGuardar,
  alRestaurarFoco,
}: DialogoReparacionProps) {
  const [mensaje, setMensaje] = useState('')
  const [datosAdicionalesAbiertos, setDatosAdicionalesAbiertos] = useState(false)
  const [productoSeleccionadoExplicitamente, setProductoSeleccionadoExplicitamente] = useState(false)
  const [productoRemoto, setProductoRemoto] = useState<OpcionProductoReparacion | null>(null)
  const operacionCreacion = useRef<{ firma: string; clave: string } | null>(null)
  const formulario = useForm<DatosReparacion>({
    resolver: zodResolver(esquemaDatosReparacion),
    defaultValues: reparacion ? datosReparacionInicial(reparacion) : datosCreacionPendiente ?? { ...datosReparacionInicial(null), accesorios: [] },
  })
  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = formulario
  const productoId = watch('productoId')
  const tipoSolicitante = watch('tipoSolicitante') ?? 'customer'
  const tipoEquipo = watch('tipoEquipo') ?? 'catalog'
  const numeroSerie = watch('numeroSerie')
  const esGarantia = watch('esGarantia')
  const referenciaGarantia = watch('referenciaGarantia')
  const productosDisponibles = productoActual && !productos.some((item) => item.id === productoActual.id)
    ? [productoActual, ...productos] : productos
  const producto = productoRemoto?.id === productoId
    ? productoRemoto
    : productosDisponibles.find((item) => item.id === productoId)
  const productoEsReferenciaOriginal = Boolean(
    reparacion && productoId === reparacion.productoId,
  )
  const productoEsConocido = tipoEquipo === 'external' || productoEsReferenciaOriginal || Boolean(producto)
  const controlaSerie = productoEsReferenciaOriginal
    ? reparacion?.serialControlSnapshot ?? false
    : producto?.serialControl ?? false
  const clienteHistorico: OpcionClienteReparacion | null = reparacion?.clienteId
    ? { id: reparacion.clienteId, nombre: reparacion.clienteNombreSnapshot,
      nombreComercial: '', documento: reparacion.clienteDocumentoSnapshot, activo: false }
    : null
  const productoHistorico: OpcionProductoReparacion | null = reparacion?.productoId
    ? { id: reparacion.productoId, codigo: reparacion.productoCodigoSnapshot,
      descripcion: reparacion.productoDescripcionSnapshot, unidadMedida: '',
      serialControl: reparacion.serialControlSnapshot, controlLote: false,
      controlVencimiento: false, activo: false }
    : null

  useEffect(() => {
    if (
      identidadEditable
      && tipoEquipo !== 'external'
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
    tipoEquipo,
  ])

  useEffect(() => {
    operacionCreacion.current = null
    setProductoRemoto(null)
    setProductoSeleccionadoExplicitamente(false)
  }, [abierto, reparacion?.id])

  useEffect(() => {
    if (errors.prioridad || errors.fechaEstimadaEntrega || errors.notas
      || errors.referenciaCliente || errors.referenciaGarantia || errors.esGarantia || errors.accesorios) {
      setDatosAdicionalesAbiertos(true)
    }
  }, [errors])

  const guardar = async (datos: DatosReparacion) => {
    if (identidadEditable && !productoEsConocido) {
      setError('productoId', { message: 'Selecciona un producto activo' })
      return
    }
    const errorSerie = identidadEditable && tipoEquipo !== 'external'
      ? validarNumeroSerie(datos.numeroSerie, controlaSerie)
      : undefined
    if (errorSerie) {
      setError('numeroSerie', { message: errorSerie })
      return
    }

    setMensaje('')
    // Old pending intents must keep the exact absence of the new collection.
    const { accesorios, ...datosSinAccesorios } = datos
    const datosNormalizados = {
      ...(datosCreacionPendiente && !Object.hasOwn(datosCreacionPendiente, 'accesorios') ? datosSinAccesorios : { ...datosSinAccesorios, ...(accesorios !== undefined ? { accesorios } : {}) }),
      numeroSerie:
        identidadEditable && tipoEquipo !== 'external' && productoSeleccionadoExplicitamente && !controlaSerie
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
            <input type="hidden" {...register('documentoVentaId')} />
            <section aria-labelledby="reparacion-identificacion" className="px-5 py-6 sm:px-7">
              <div className="mb-5 border-b pb-3">
                <h2 id="reparacion-identificacion" className="font-semibold">Identificación del servicio</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {identidadEditable
                    ? reparacion
                      ? 'Puedes conservar las referencias de la orden; cualquier reemplazo debe estar activo.'
                      : 'Elige quién solicita la atención y cómo identificar el equipo. No se creará stock del equipo recibido.'
                    : 'Información conservada de la recepción de la orden.'}
                </p>
              </div>
              {!identidadEditable && reparacion ? (
                <>
                  <p className="mb-5 border border-primary/25 bg-primary/5 px-4 py-3 text-sm leading-6 text-muted-foreground sm:col-span-2">
                    El solicitante, el equipo y la serie ya no pueden modificarse porque la atención tiene historial o evidencia registrada.
                  </p>
                  <input type="hidden" {...register('clienteId')} />
                  <input type="hidden" {...register('productoId')} />
                  <input type="hidden" {...register('numeroSerie')} />
                  <input type="hidden" {...register('tipoSolicitante')} />
                  <input type="hidden" {...register('areaSolicitante')} />
                  <input type="hidden" {...register('tipoEquipo')} />
                  <input type="hidden" {...register('descripcionEquipoExterno')} />
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <div className="border bg-muted/20 px-4 py-3">
                      <dt className="field-label">{tipoSolicitante === 'internal' ? 'Área solicitante' : 'Cliente'}</dt>
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
                  <label htmlFor="reparacion-solicitante-tipo" className="field-label">Solicitante *</label>
                  <select id="reparacion-solicitante-tipo" className="field-control" {...register('tipoSolicitante')}>
                    <option value="customer">Cliente</option><option value="internal">Área interna de SILSAN</option>
                  </select>
                </div>
                {tipoSolicitante === 'internal' ? <CampoTexto etiqueta="Área solicitante *" placeholder="Ej. Almacén o Administración" error={errors.areaSolicitante?.message} {...register('areaSolicitante')} /> : <Controller name="clienteId" control={control} render={({ field }) =>
                  <SelectorCatalogoReparacion id="reparacion-cliente" etiqueta="Cliente *"
                    etiquetaBusqueda="Buscar cliente" valor={field.value}
                    opcionesIniciales={clientes} totalInicial={totalClientes}
                    opcionActual={clienteActual ?? clienteHistorico} buscar={buscarClientes}
                    resolver={resolverCliente}
                    representar={(cliente) => `${cliente.nombre} · ${cliente.documento}${cliente.activo === false ? ' (referencia histórica)' : ''}`}
                    alCambiar={field.onChange} error={errors.clienteId?.message}
                    deshabilitado={cargandoOpciones} textoVacio="Selecciona un cliente" />
                } />}
                <div>
                  <label htmlFor="reparacion-equipo-tipo" className="field-label">Identificación del equipo *</label>
                  <select id="reparacion-equipo-tipo" className="field-control" {...register('tipoEquipo')}>
                    <option value="catalog">Producto del catálogo</option><option value="external">Equipo fuera del catálogo</option>
                  </select>
                </div>
                {tipoEquipo === 'external' ? <CampoTexto etiqueta="Equipo recibido *" placeholder="Marca, modelo e identificación" error={errors.descripcionEquipoExterno?.message} {...register('descripcionEquipoExterno')} /> : <Controller name="productoId" control={control} render={({ field }) =>
                  <SelectorCatalogoReparacion id="reparacion-producto" etiqueta="Producto o equipo *"
                    etiquetaBusqueda="Buscar producto o equipo" valor={field.value}
                    opcionesIniciales={productos} totalInicial={totalProductos}
                    opcionActual={productoActual ?? productoHistorico} buscar={buscarProductos}
                    resolver={resolverProducto}
                    representar={(item) => `${item.codigo} · ${item.descripcion}${item.activo === false ? ' (referencia histórica)' : ''}`}
                    alCambiar={(valor, opcion) => {
                      setProductoRemoto(opcion)
                      setProductoSeleccionadoExplicitamente(true)
                      field.onChange(valor)
                    }}
                    error={errors.productoId?.message} deshabilitado={cargandoOpciones}
                    textoVacio="Selecciona un producto" />
                } />}
                {tipoEquipo === 'external' || controlaSerie || (productoEsReferenciaOriginal && Boolean(numeroSerie)) ? (
                  <CampoTexto
                    etiqueta={`Número de serie${tipoEquipo !== 'external' && controlaSerie ? ' *' : ' (si existe)'}`}
                    autoComplete="off"
                    placeholder="Serie del equipo recibido"
                    error={errors.numeroSerie?.message}
                    ayuda={tipoEquipo === 'external' ? 'Registra la serie impresa si el equipo dispone de ella.' : controlaSerie
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

            <section aria-label="Problema reportado" className="border-t px-5 py-6 sm:px-7">
              <CampoArea
                etiqueta="Problema reportado *"
                rows={4}
                placeholder="Describe la falla, síntoma o motivo de ingreso"
                error={errors.problema?.message}
                {...register('problema')}
              />
              <p className="mt-3 text-sm text-muted-foreground">
                {reparacion
                  ? 'La fecha de recepción y el código se conservan. Puedes revisar los datos adicionales a continuación.'
                  : 'El código y la fecha de recepción se asignan automáticamente. La prioridad inicial es Normal.'}
              </p>
            </section>

            <details
              className="border-t px-5 py-5 sm:px-7"
              open={datosAdicionalesAbiertos}
              onToggle={(evento) => setDatosAdicionalesAbiertos(evento.currentTarget.open)}
            >
              <summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Datos adicionales de recepción
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">Accesorios, fecha estimada, prioridad y atención en garantía, cuando correspondan.</p>
              <div className="mt-5">
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
                  etiqueta="Notas de recepción"
                  rows={3}
                  placeholder="Condición física del equipo u observaciones generales"
                  error={errors.notas?.message}
                  {...register('notas')}
                />
                <CampoTexto
                  etiqueta="Referencia del cliente"
                  autoComplete="off"
                  placeholder="Ticket, llamada o referencia externa"
                  error={errors.referenciaCliente?.message}
                  {...register('referenciaCliente')}
                />
                <div className="sm:col-span-2">
                  <OpcionBinaria
                    etiqueta="Atención en garantía"
                    descripcion="Marca esta opción si el equipo ingresa para una atención cubierta por garantía."
                    disabled={Boolean(reparacion)}
                    {...register('esGarantia')}
                  />
                </div>
                {esGarantia || (reparacion && referenciaGarantia) ? (
                  <CampoTexto
                    etiqueta="Referencia de garantía"
                    autoComplete="off"
                    placeholder="N.º de garantía o autorización"
                    error={errors.referenciaGarantia?.message}
                    {...register('referenciaGarantia')}
                  />
                ) : <input type="hidden" {...register('referenciaGarantia')} />}
              </div>
              </div>
              {!reparacion ? <FormularioAccesoriosRecepcion formulario={formulario} bloqueado={Boolean(datosCreacionPendiente)} /> : <p className="mt-4 text-sm text-muted-foreground">Los accesorios se corrigen desde su sección en el detalle de la reparación.</p>}
            </details>

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
