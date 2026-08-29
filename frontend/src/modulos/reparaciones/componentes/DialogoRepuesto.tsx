import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { useCandidatosFefo } from '@/modulos/inventario/estado/useCandidatosFefo'
import type { Almacen, UbicacionAlmacen } from '@/modulos/inventario/modelo/almacen'
import {
  esquemaDatosConsumoParte,
  esquemaDatosReservaParte,
  etiquetasEstadoStockReparacion,
  type DatosConsumoParte,
  type DatosReservaParte,
  type OpcionProductoReparacion,
  type ParteReparacion,
  type Reparacion,
} from '@/modulos/reparaciones/modelo/reparacion'

interface DialogoReservaParteProps {
  abierto: boolean
  reparacion: Reparacion
  productos: readonly OpcionProductoReparacion[]
  almacenes: readonly Almacen[]
  ubicaciones: readonly UbicacionAlmacen[]
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosReservaParte) => Promise<string | undefined>
}

export function DialogoReservaParte({
  abierto,
  reparacion,
  productos,
  almacenes,
  ubicaciones,
  alCambiarApertura,
  alGuardar,
}: DialogoReservaParteProps) {
  const primerAlmacen = almacenes[0]?.id ?? ''
  const primeraUbicacion = ubicaciones.find((item) => item.almacenId === primerAlmacen)?.id ?? ''
  const [mensaje, setMensaje] = useState('')
  const {
    register,
    handleSubmit,
    watch,
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
  const producto = productos.find((item) => item.id === productoId)
  const almacenId = watch('almacenId')
  const estadoStock = watch('estadoStock')
  const usarFefo = estadoStock === 'available'
  const { candidatos, cargando: cargandoFefo, error: errorFefo } =
    useCandidatosFefo(productoId, almacenId, abierto && usarFefo)
  const candidatoFefo = candidatos[0]

  useEffect(() => {
    if (abierto) {
      reset({
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
  }, [abierto, primeraUbicacion, primerAlmacen, productos, reset])

  useEffect(() => {
    if (!productoId && productos[0]) setValue('productoId', productos[0].id)
  }, [productoId, productos, setValue])

  useEffect(() => {
    if (!almacenId && primerAlmacen) setValue('almacenId', primerAlmacen)
  }, [almacenId, primerAlmacen, setValue])

  useEffect(() => {
    const ubicacion = ubicaciones.find((item) => item.almacenId === almacenId)
    if (ubicacion) setValue('ubicacionId', ubicacion.id)
  }, [almacenId, setValue, ubicaciones])

  useEffect(() => {
    if (!usarFefo) return
    setValue('ubicacionId', candidatoFefo?.ubicacionId ?? '')
    setValue('lote', candidatoFefo?.lote ?? '')
    setValue('fechaVencimiento', candidatoFefo?.fechaVencimiento ?? '')
  }, [
    candidatoFefo?.fechaVencimiento,
    candidatoFefo?.lote,
    candidatoFefo?.ubicacionId,
    setValue,
    usarFefo,
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
    const error = await alGuardar(datos)
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
              <label htmlFor="reserva-producto" className="field-label">Producto *</label>
              <select id="reserva-producto" className="field-control" aria-invalid={Boolean(errors.productoId)} {...register('productoId')}>
                {productos.length ? productos.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.descripcion}</option>) : <option value="">No hay productos activos</option>}
              </select>
              {errors.productoId ? <p className="field-error">{errors.productoId.message}</p> : null}
            </div>
            <div>
              <label htmlFor="reserva-cantidad" className="field-label">Cantidad solicitada *</label>
              <input id="reserva-cantidad" type="number" min="0.001" max={usarFefo ? candidatoFefo?.cantidadAsignable : undefined} step="0.001" className="field-control" aria-invalid={Boolean(errors.cantidadSolicitada)} {...register('cantidadSolicitada')} />
              {errors.cantidadSolicitada ? <p className="field-error">{errors.cantidadSolicitada.message}</p> : null}
            </div>
            <div>
              <label htmlFor="reserva-estado-stock" className="field-label">Condición del stock *</label>
              <select id="reserva-estado-stock" className="field-control" {...register('estadoStock')}>
                {(Object.keys(etiquetasEstadoStockReparacion) as Array<keyof typeof etiquetasEstadoStockReparacion>).map((estado) => <option key={estado} value={estado}>{etiquetasEstadoStockReparacion[estado]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="reserva-almacen" className="field-label">Almacén *</label>
              <select id="reserva-almacen" className="field-control" aria-invalid={Boolean(errors.almacenId)} {...register('almacenId')}>
                {almacenes.map((almacen) => <option key={almacen.id} value={almacen.id}>{almacen.codigo} · {almacen.nombre}</option>)}
              </select>
              {errors.almacenId ? <p className="field-error">{errors.almacenId.message}</p> : null}
            </div>
            {usarFefo ? <div>
              <label htmlFor="reserva-ubicacion-fefo" className="field-label">Ubicación FEFO *</label>
              <input type="hidden" {...register('ubicacionId')} />
              <input id="reserva-ubicacion-fefo" className="field-control" value={candidatoFefo ? `${candidatoFefo.ubicacionCodigo} · ${candidatoFefo.ubicacionNombre}` : ''} placeholder={cargandoFefo ? 'Consultando...' : 'Sin stock asignable'} readOnly />
              {errors.ubicacionId ? <p className="field-error">{errors.ubicacionId.message}</p> : null}
            </div> : <div>
              <label htmlFor="reserva-ubicacion" className="field-label">Ubicación *</label>
              <select id="reserva-ubicacion" className="field-control" aria-invalid={Boolean(errors.ubicacionId)} {...register('ubicacionId')}>
                {ubicaciones.filter((item) => item.almacenId === almacenId).map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.codigo} · {ubicacion.nombre}</option>)}
              </select>
              {errors.ubicacionId ? <p className="field-error">{errors.ubicacionId.message}</p> : null}
            </div>}
            <div>
              <label htmlFor="reserva-lote" className="field-label">Lote {producto?.controlLote ? '*' : '(opcional)'}</label>
              <input id="reserva-lote" className="field-control" autoComplete="off" placeholder={producto?.controlLote ? 'Obligatorio' : 'Sin lote'} aria-invalid={Boolean(errors.lote)} readOnly={usarFefo} {...register('lote')} />
              {errors.lote ? <p className="field-error">{errors.lote.message}</p> : null}
            </div>
            <div>
              <label htmlFor="reserva-vencimiento" className="field-label">Vencimiento {producto?.controlVencimiento ? '*' : '(opcional)'}</label>
              <input id="reserva-vencimiento" type="date" className="field-control" min={new Date().toISOString().slice(0, 10)} aria-invalid={Boolean(errors.fechaVencimiento)} readOnly={usarFefo} {...register('fechaVencimiento')} />
              {errors.fechaVencimiento ? <p className="field-error">{errors.fechaVencimiento.message}</p> : null}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="reserva-notas" className="field-label">Notas</label>
              <textarea id="reserva-notas" rows={3} className="field-control resize-y py-2" placeholder="Referencia interna de la reserva" aria-invalid={Boolean(errors.notas)} {...register('notas')} />
              {errors.notas ? <p className="field-error">{errors.notas.message}</p> : null}
            </div>
            {usarFefo ? <p className="sm:col-span-2 border bg-muted/35 px-4 py-3 text-sm leading-6 text-muted-foreground">
              {candidatoFefo
                ? `FEFO seleccionó ${candidatoFefo.lote || 'stock sin lote'} · vence ${candidatoFefo.fechaVencimiento || 'sin fecha'} · ${candidatoFefo.cantidadAsignable} asignables.`
                : cargandoFefo
                  ? 'Consultando el primer lote asignable según FEFO...'
                  : errorFefo || 'No existe stock sanitario asignable en este almacén.'}
            </p> : null}
          </form>
          {mensaje ? <p role="alert" className="border-t bg-destructive/10 px-5 py-3 text-sm text-destructive sm:px-7">{mensaje}</p> : null}
          <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <DialogPrimitive.Close asChild><Button type="button" variant="outline" size="lg">Cancelar</Button></DialogPrimitive.Close>
            <Button type="submit" form="formulario-reserva-parte" size="lg" disabled={isSubmitting || !almacenes.length || !ubicaciones.length || (usarFefo && (cargandoFefo || !candidatoFefo))}>Reservar repuesto</Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

interface DialogoConsumoParteProps {
  abierto: boolean
  parte: ParteReparacion
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosConsumoParte, operationKey: string) => Promise<string | undefined>
}

export function DialogoConsumoParte({
  abierto,
  parte,
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
  const operationKey = useRef<string | null>(null)

  useEffect(() => {
    if (abierto) {
      operationKey.current = crypto.randomUUID()
      reset({ cantidad: String(saldo) })
    } else {
      operationKey.current = null
    }
  }, [abierto, parte.id, saldo, reset])

  const guardar = async (datos: DatosConsumoParte) => {
    const cantidad = Number(datos.cantidad)
    if (cantidad > saldo) {
      setError('cantidad', { message: `El saldo pendiente es ${saldo}` })
      return
    }
    setMensaje('')
    const claveOperacion = operationKey.current ?? (operationKey.current = crypto.randomUUID())
    const error = await alGuardar(datos, claveOperacion)
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
            <div><DialogPrimitive.Title className="text-xl font-semibold">Consumir repuesto</DialogPrimitive.Title><DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">{parte.productoDescripcionSnapshot} · Saldo pendiente: {saldo}</DialogPrimitive.Description></div>
            <DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar consumo" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="size-5" /></button></DialogPrimitive.Close>
          </header>
          <form id="formulario-consumo-parte" className="px-5 py-6" onSubmit={handleSubmit(guardar)}>
            <label htmlFor="consumo-cantidad" className="field-label">Cantidad a consumir *</label>
            <input id="consumo-cantidad" type="number" min="0.001" max={saldo} step="0.001" className="field-control" aria-invalid={Boolean(errors.cantidad)} {...register('cantidad')} />
            {errors.cantidad ? <p className="field-error">{errors.cantidad.message}</p> : <p className="field-help">Cada consumo crea un movimiento de salida idempotente.</p>}
          </form>
          {mensaje ? <p role="alert" className="border-t bg-destructive/10 px-5 py-3 text-sm text-destructive">{mensaje}</p> : null}
          <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end">
            <DialogPrimitive.Close asChild><Button type="button" variant="outline">Cancelar</Button></DialogPrimitive.Close>
            <Button type="submit" form="formulario-consumo-parte" disabled={isSubmitting || saldo <= 0}>Confirmar consumo</Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
