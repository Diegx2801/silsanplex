import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { useCandidatosFefo } from '@/modulos/inventario/estado/useCandidatosFefo'
import type { Almacen, UbicacionAlmacen } from '@/modulos/inventario/modelo/almacen'
import type { CandidatoFefo } from '@/modulos/inventario/modelo/inventario'
import {
  esquemaDatosConsumoParte,
  esquemaDatosReservaParte,
  type ConsultaCatalogoReparacion,
  type DatosConsumoParte,
  type DatosReservaParte,
  type OpcionProductoReparacion,
  type ResultadoCatalogoReparacion,
  type ParteReparacion,
  type Reparacion,
} from '@/modulos/reparaciones/modelo/reparacion'
import type { ConsumoPartePendiente, ReservaPartePendiente } from '@/modulos/reparaciones/estado/creacionPendiente'
import { SelectorCatalogoReparacion } from './SelectorCatalogoReparacion'

interface DialogoReservaParteProps {
  abierto: boolean
  reparacion: Reparacion
  productos: readonly OpcionProductoReparacion[]
  totalProductos?: number
  buscarProductos?: (consulta: ConsultaCatalogoReparacion) => Promise<ResultadoCatalogoReparacion<OpcionProductoReparacion>>
  resolverProducto?: (id: string) => Promise<OpcionProductoReparacion | null>
  almacenes: readonly Almacen[]
  totalAlmacenes?: number
  buscarAlmacenes?: (consulta: ConsultaCatalogoReparacion) => Promise<ResultadoCatalogoReparacion<Almacen>>
  resolverAlmacen?: (id: string) => Promise<Almacen | null>
  ubicaciones: readonly UbicacionAlmacen[]
  operacionPendiente?: ReservaPartePendiente | null
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosReservaParte, operationKey: string) => Promise<string | undefined>
}

export function DialogoReservaParte({
  abierto,
  reparacion,
  productos,
  totalProductos = productos.length,
  buscarProductos,
  resolverProducto,
  almacenes,
  totalAlmacenes = almacenes.length,
  buscarAlmacenes,
  resolverAlmacen,
  ubicaciones,
  operacionPendiente,
  alCambiarApertura,
  alGuardar,
}: DialogoReservaParteProps) {
  const primerAlmacen = almacenes[0]?.id ?? ''
  const primeraUbicacion = ubicaciones.find((item) => item.almacenId === primerAlmacen)?.id ?? ''
  const [mensaje, setMensaje] = useState('')
  const [productoRemoto, setProductoRemoto] = useState<OpcionProductoReparacion | null>(null)
  const [almacenRemoto, setAlmacenRemoto] = useState<Almacen | null>(null)
  const operacion = useRef<{ firma: string; clave: string } | null>(null)
  const [seleccionEnviada, setSeleccionEnviada] = useState<{
    productoId: string; almacenId: string; candidato: CandidatoFefo
  } | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DatosReservaParte>({
    resolver: zodResolver(esquemaDatosReservaParte),
    defaultValues: {
      productoId: productos[0]?.id ?? '',
      almacenId: primerAlmacen,
      ubicacionId: primeraUbicacion,
      estadoStock: 'available',
      lote: '',
      fechaVencimiento: '',
      cantidadSolicitada: '1',
      notas: '',
    },
  })
  const productoId = watch('productoId')
  const producto = productoRemoto?.id === productoId
    ? productoRemoto : productos.find((item) => item.id === productoId)
  const almacenId = watch('almacenId')
  const { candidatos, cargando: cargandoFefo, error: errorFefo } =
    useCandidatosFefo(productoId, almacenId, abierto)
  const conservaSeleccion = seleccionEnviada?.productoId === productoId
    && seleccionEnviada?.almacenId === almacenId
  const candidatoFefo = conservaSeleccion ? seleccionEnviada.candidato : candidatos[0]

  useEffect(() => {
    // Una recarga del catálogo no debe borrar una operación pendiente de reintento.
    if (abierto && operacion.current) return
    operacion.current = abierto && operacionPendiente
      ? { firma: JSON.stringify(operacionPendiente.datos), clave: operacionPendiente.clave }
      : null
    const ubicacionPendiente = operacionPendiente
      ? ubicaciones.find((item) => item.id === operacionPendiente.datos.ubicacionId)
      : undefined
    setSeleccionEnviada(abierto && operacionPendiente ? {
      productoId: operacionPendiente.datos.productoId,
      almacenId: operacionPendiente.datos.almacenId,
      candidato: {
        productoId: operacionPendiente.datos.productoId,
        almacenId: operacionPendiente.datos.almacenId,
        ubicacionId: operacionPendiente.datos.ubicacionId,
        ubicacionCodigo: ubicacionPendiente?.codigo ?? 'RECUPERADA',
        ubicacionNombre: ubicacionPendiente?.nombre ?? 'Ubicación de la operación pendiente',
        lote: operacionPendiente.datos.lote,
        fechaVencimiento: operacionPendiente.datos.fechaVencimiento,
        cantidadAsignable: Number(operacionPendiente.datos.cantidadSolicitada),
        costoPromedio: 0,
        ordenFefo: 0,
      },
    } : null)
    setProductoRemoto(null)
    setAlmacenRemoto(null)
    if (abierto) {
      reset(operacionPendiente?.datos ?? {
        productoId: productos[0]?.id ?? '',
        almacenId: primerAlmacen,
        ubicacionId: primeraUbicacion,
        estadoStock: 'available',
        lote: '',
        fechaVencimiento: '',
        cantidadSolicitada: '1',
        notas: '',
      })
    }
  }, [abierto, operacionPendiente, primeraUbicacion, primerAlmacen, productos, reset, ubicaciones])

  useEffect(() => {
    if (!productoId && productos[0]) setValue('productoId', productos[0].id)
  }, [productoId, productos, setValue])

  useEffect(() => {
    if (!almacenId && primerAlmacen) setValue('almacenId', primerAlmacen)
  }, [almacenId, primerAlmacen, setValue])

  useEffect(() => {
    setValue('ubicacionId', candidatoFefo?.ubicacionId ?? '')
    setValue('lote', candidatoFefo?.lote ?? '')
    setValue('fechaVencimiento', candidatoFefo?.fechaVencimiento ?? '')
  }, [
    candidatoFefo?.fechaVencimiento,
    candidatoFefo?.lote,
    candidatoFefo?.ubicacionId,
    setValue,
  ])

  const guardar = async (datos: DatosReservaParte) => {
    if (producto?.controlLote && !datos.lote.trim()) {
      setError('lote', { message: 'Este producto requiere indicar un lote' })
      return
    }
    if (producto?.controlVencimiento && !datos.fechaVencimiento) {
      setError('fechaVencimiento', { message: 'Este producto requiere indicar un vencimiento' })
      return
    }
    setMensaje('')
    const firma = JSON.stringify(datos)
    if (operacion.current?.firma !== firma) {
      operacion.current = { firma, clave: crypto.randomUUID() }
    }
    if (candidatoFefo) {
      setSeleccionEnviada({ productoId, almacenId, candidato: candidatoFefo })
    }
    const error = await alGuardar(datos, operacion.current.clave)
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
        <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-[70] max-h-[92svh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-background shadow-xl outline-none">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <DialogPrimitive.Title className="text-xl font-semibold">Reservar repuesto</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">{reparacion.codigo} · La reserva no genera movimiento de inventario.</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar reserva" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="size-5" /></button></DialogPrimitive.Close>
          </header>
          <form id="formulario-reserva-parte" className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-7" onSubmit={handleSubmit(guardar)}>
            <div className="sm:col-span-2">
              <Controller name="productoId" control={control} render={({ field }) =>
                <SelectorCatalogoReparacion id="reserva-producto" etiqueta="Producto *"
                  etiquetaBusqueda="Buscar repuesto" valor={field.value}
                  opcionesIniciales={productos} totalInicial={totalProductos}
                  opcionActual={productoRemoto} buscar={buscarProductos}
                  resolver={resolverProducto}
                  representar={(item) => `${item.codigo} · ${item.descripcion}`}
                  alCambiar={(valor, opcion) => { setProductoRemoto(opcion); field.onChange(valor) }}
                  error={errors.productoId?.message} textoVacio="Selecciona un producto" />
              } />
            </div>
            <div>
              <label htmlFor="reserva-cantidad" className="field-label">Cantidad solicitada *</label>
              <input id="reserva-cantidad" type="number" min="0.001" max={candidatoFefo?.cantidadAsignable} step="0.001" className="field-control" aria-invalid={Boolean(errors.cantidadSolicitada)} {...register('cantidadSolicitada')} />
              <p className="field-help">{producto?.unidadMedida ? `Cantidad en ${producto.unidadMedida} · unidad base del producto.` : 'Selecciona un producto para conocer su unidad base.'}</p>
              {errors.cantidadSolicitada ? <p className="field-error">{errors.cantidadSolicitada.message}</p> : null}
            </div>
            <div className="sm:col-span-2">
              <Controller name="almacenId" control={control} render={({ field }) =>
                <SelectorCatalogoReparacion id="reserva-almacen" etiqueta="Almacén *"
                  etiquetaBusqueda="Buscar almacén" valor={field.value}
                  opcionesIniciales={almacenes} totalInicial={totalAlmacenes}
                  opcionActual={almacenRemoto} buscar={buscarAlmacenes}
                  resolver={resolverAlmacen}
                  representar={(item) => `${item.codigo} · ${item.nombre}${item.activo ? '' : ' (inactivo)'}`}
                  alCambiar={(valor, opcion) => { setAlmacenRemoto(opcion); field.onChange(valor) }}
                  error={errors.almacenId?.message} textoVacio="Selecciona un almacén" />
              } />
            </div>
            <input type="hidden" {...register('estadoStock')} />
            <input type="hidden" {...register('ubicacionId')} />
            <input type="hidden" {...register('lote')} />
            <input type="hidden" {...register('fechaVencimiento')} />
            <section aria-label="Stock seleccionado" className="sm:col-span-2 border bg-muted/35 px-4 py-3 text-sm leading-6">
              <p className="font-medium">Lote seleccionado automáticamente</p>
              {candidatoFefo ? <>
                <p className="text-muted-foreground">{candidatoFefo.ubicacionCodigo} · {candidatoFefo.ubicacionNombre} · Disponible</p>
                <p className="text-muted-foreground">{candidatoFefo.lote || 'Sin lote'} · {candidatoFefo.fechaVencimiento ? `Vence ${candidatoFefo.fechaVencimiento}` : 'Sin vencimiento'}</p>
                <p className="mt-1">{candidatoFefo.cantidadAsignable} {producto?.unidadMedida || '(unidad base pendiente de consultar)'} disponibles en esta posición.</p>
                <p className="field-help">Se utiliza primero el lote disponible que vence más pronto.</p>
              </> : <p role={errorFefo ? 'alert' : 'status'} className="text-muted-foreground">{cargandoFefo ? 'Consultando existencias disponibles…' : errorFefo || 'No hay stock disponible para reservar en este almacén.'}</p>}
              {errors.ubicacionId ? <p className="field-error">{errors.ubicacionId.message}</p> : null}
              {errors.lote ? <p className="field-error">{errors.lote.message}</p> : null}
              {errors.fechaVencimiento ? <p className="field-error">{errors.fechaVencimiento.message}</p> : null}
            </section>
            <details className="sm:col-span-2" open={errors.notas ? true : undefined}>
              <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Agregar una nota</summary>
              <div className="mt-3">
              <label htmlFor="reserva-notas" className="field-label">Notas</label>
              <textarea id="reserva-notas" rows={3} className="field-control resize-y py-2" placeholder="Referencia interna de la reserva" aria-invalid={Boolean(errors.notas)} {...register('notas')} />
              {errors.notas ? <p className="field-error">{errors.notas.message}</p> : null}
              </div>
            </details>
          </form>
          {operacionPendiente ? (
            <p role="status" className="border-t bg-primary/5 px-5 py-3 text-sm text-primary sm:px-7">
              Se recuperó una reserva pendiente. Reintenta la misma operación antes de realizar cambios.
            </p>
          ) : null}
          {mensaje ? <p role="alert" className="border-t bg-destructive/10 px-5 py-3 text-sm text-destructive sm:px-7">{mensaje}</p> : null}
          <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <DialogPrimitive.Close asChild><Button type="button" variant="outline" size="lg">Cancelar</Button></DialogPrimitive.Close>
            <Button type="submit" form="formulario-reserva-parte" size="lg" disabled={isSubmitting || !almacenId || cargandoFefo || !candidatoFefo}>{operacionPendiente ? 'Reintentar reserva' : 'Reservar repuesto'}</Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

interface DialogoConsumoParteProps {
  abierto: boolean
  parte: ParteReparacion
  unidadMedida: string
  operacionPendiente?: ConsumoPartePendiente | null
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosConsumoParte, operationKey: string) => Promise<string | undefined>
}

export function DialogoConsumoParte({
  abierto,
  parte,
  unidadMedida,
  operacionPendiente,
  alCambiarApertura,
  alGuardar,
}: DialogoConsumoParteProps) {
  const saldo = Math.max(0, parte.cantidadSolicitada - parte.cantidadConsumida)
  const [mensaje, setMensaje] = useState('')
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DatosConsumoParte>({
    resolver: zodResolver(esquemaDatosConsumoParte),
    defaultValues: { cantidad: String(saldo) },
  })
  const operacion = useRef<{ datos: DatosConsumoParte; clave: string } | null>(null)

  useEffect(() => {
    if (abierto) {
      if (operacion.current) return
      operacion.current = operacionPendiente
        ? { datos: operacionPendiente.datos, clave: operacionPendiente.clave } : null
      reset(operacionPendiente?.datos ?? { cantidad: String(saldo) })
      setMensaje('')
    } else {
      operacion.current = null
    }
  }, [abierto, parte.id, saldo, reset, operacionPendiente])

  const guardar = async (datos: DatosConsumoParte) => {
    const cantidad = Number(datos.cantidad)
    const esReintento = operacion.current?.datos.cantidad === datos.cantidad
    if (!esReintento && cantidad > saldo) {
      setError('cantidad', { message: `El saldo pendiente es ${saldo} ${unidadMedida}` })
      return
    }
    setMensaje('')
    if (!esReintento) operacion.current = { datos, clave: crypto.randomUUID() }
    const error = await alGuardar(datos, operacion.current!.clave)
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
        <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border bg-background shadow-xl outline-none">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5">
            <div><DialogPrimitive.Title className="text-xl font-semibold">Consumir repuesto</DialogPrimitive.Title><DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">{parte.productoDescripcionSnapshot} · Saldo pendiente: {saldo} {unidadMedida || '(unidad base pendiente de consultar)'}</DialogPrimitive.Description></div>
            <DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar consumo" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="size-5" /></button></DialogPrimitive.Close>
          </header>
          <form id="formulario-consumo-parte" className="px-5 py-6" onSubmit={handleSubmit(guardar)}>
            <label htmlFor="consumo-cantidad" className="field-label">Cantidad a consumir *</label>
            <input id="consumo-cantidad" type="number" min="0.001" max={operacionPendiente ? undefined : saldo} step="0.001" className="field-control" readOnly={Boolean(operacionPendiente)} aria-invalid={Boolean(errors.cantidad)} {...register('cantidad')} />
            {errors.cantidad ? <p className="field-error">{errors.cantidad.message}</p> : <p className="field-help">Cantidad en {unidadMedida || 'la unidad base del producto'}. Se descontará del inventario y quedará registrada en el Kardex.</p>}
            {operacionPendiente ? <p role="status" className="mt-3 text-sm text-muted-foreground">Hay un consumo pendiente de confirmar. Reinténtalo para consultar su resultado sin duplicarlo.</p> : null}
          </form>
          {mensaje ? <p role="alert" className="border-t bg-destructive/10 px-5 py-3 text-sm text-destructive">{mensaje}</p> : null}
          <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end">
            <DialogPrimitive.Close asChild><Button type="button" variant="outline">Cancelar</Button></DialogPrimitive.Close>
            <Button type="submit" form="formulario-consumo-parte" disabled={isSubmitting || (!operacionPendiente && saldo <= 0) || !unidadMedida}>{operacionPendiente ? 'Reintentar consumo' : 'Confirmar consumo'}</Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
