import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { fechaActualPeru, formatearFechaCalendarioPeru } from '@/lib/fechas'
import { SelectorProductoInventario } from '@/modulos/inventario/componentes/SelectorProductoInventario'
import { useBucketsAjusteStock } from '@/modulos/inventario/estado/useBucketsAjusteStock'
import {
  etiquetasEstadoStock,
  type Almacen,
  type UbicacionAlmacen,
} from '@/modulos/inventario/modelo/almacen'
import {
  cantidadDisponibleAjusteStock,
  claveBucketAjusteStock,
  crearMotivoAjusteStock,
  esquemaFormularioAjusteStock,
  type BucketAjusteStock,
  type DatosFormularioAjusteStock,
  type DatosMovimientoInventario,
} from '@/modulos/inventario/modelo/inventario'
import type { ContextoAccionInventario } from '@/modulos/inventario/modelo/contextoAccionInventario'
import type { ProductoInventarioOpcion } from '@/modulos/inventario/modelo/productoInventarioRead'
import {
  buscarAlmacenesMovimientoInventario,
  listarAlmacenesAjusteStock,
} from '@/modulos/inventario/servicios/inventarioService'

const hoy = fechaActualPeru
const formatoCantidad = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 })

interface DialogoAjusteStockProps {
  abierto: boolean
  organizationId: string
  almacenes: readonly Almacen[]
  ubicaciones: readonly UbicacionAlmacen[]
  contexto?: ContextoAccionInventario | null
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosMovimientoInventario) => Promise<string | undefined>
  alRestaurarFoco: () => void
}

interface ConfirmacionAjusteStock {
  datos: DatosFormularioAjusteStock
  bucket: BucketAjusteStock
}

function descripcionBucket(bucket: BucketAjusteStock) {
  const lote = bucket.lote ? `Lote ${bucket.lote}` : 'Sin lote'
  const vencimiento = bucket.fechaVencimiento
    ? `vence ${formatearFechaCalendarioPeru(bucket.fechaVencimiento)}`
    : 'sin vencimiento'
  return `${bucket.ubicacionCodigo} · ${lote} · ${vencimiento} · ${etiquetasEstadoStock[bucket.estadoStock]}`
}

function DetalleStock({
  bucket,
  cantidad,
  positivo = false,
}: {
  bucket: BucketAjusteStock
  cantidad: number
  positivo?: boolean
}) {
  const disponible = cantidadDisponibleAjusteStock(bucket)
  const stockEsperado = positivo ? bucket.cantidadFisica + cantidad : bucket.cantidadFisica - cantidad

  return (
    <div className="border bg-muted/25 px-4 py-4" aria-label="Detalle del stock seleccionado">
      <div className="flex items-start gap-3">
        <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="font-medium">{bucket.almacenNombre} · {bucket.ubicacionNombre}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {bucket.lote ? `Lote ${bucket.lote}` : 'Sin lote'} ·{' '}
            {bucket.fechaVencimiento
              ? `Vence ${formatearFechaCalendarioPeru(bucket.fechaVencimiento)}`
              : 'Sin vencimiento'}{' '}
            · {etiquetasEstadoStock[bucket.estadoStock]}
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Stock físico</dt>
          <dd className="mt-1 font-mono font-semibold tabular-nums">
            {formatoCantidad.format(bucket.cantidadFisica)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Stock reservado</dt>
          <dd className="mt-1 font-mono font-semibold tabular-nums">
            {formatoCantidad.format(bucket.cantidadReservada)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            {positivo ? 'Saldo no reservado' : 'Disponible para descontar'}
          </dt>
          <dd className="mt-1 font-mono font-semibold tabular-nums">
            {formatoCantidad.format(disponible)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Stock esperado</dt>
          <dd className="mt-1 font-mono font-semibold tabular-nums">
            {Number.isFinite(cantidad) && cantidad > 0
              ? formatoCantidad.format(stockEsperado)
              : '—'}
          </dd>
        </div>
      </dl>
    </div>
  )
}

export function DialogoAjusteStock({
  abierto,
  organizationId,
  almacenes,
  ubicaciones,
  contexto = null,
  alCambiarApertura,
  alGuardar,
  alRestaurarFoco,
}: DialogoAjusteStockProps) {
  const queryClient = useQueryClient()
  const productoInicialId = contexto?.producto.id ?? ''
  const posicionInicial = contexto?.posicion
  const almacenInicialId = posicionInicial?.almacenId ?? ''
  const bucketInicial = posicionInicial
    ? claveBucketAjusteStock({
        almacenId: posicionInicial.almacenId,
        ubicacionId: posicionInicial.ubicacionId,
        estadoStock: posicionInicial.estado,
        lote: posicionInicial.lote,
        fechaVencimiento: posicionInicial.fechaVencimiento,
      })
    : ''
  const [producto, setProducto] = useState<ProductoInventarioOpcion | null>(contexto?.producto ?? null)
  const [almacenOpcion, setAlmacenOpcion] = useState<ComboboxOption | null>(() => {
    const encontrado = almacenes.find((item) => item.id === almacenInicialId)
    return encontrado
      ? { value: encontrado.id, label: `${encontrado.codigo} · ${encontrado.nombre}` }
      : null
  })
  const [confirmacion, setConfirmacion] = useState<ConfirmacionAjusteStock | null>(null)
  const [errorGuardado, setErrorGuardado] = useState('')
  const [guardando, setGuardando] = useState(false)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<DatosFormularioAjusteStock>({
    resolver: zodResolver(esquemaFormularioAjusteStock),
    defaultValues: {
      productoId: productoInicialId,
      tipoAjuste: 'ajuste-negativo',
      almacenId: almacenInicialId,
      bucketKey: bucketInicial,
      cantidad: '',
      unidadEntradaId: contexto?.producto.unidadBaseId,
      factorConversionEsperado: 1,
      observacion: '',
    },
  })

  const productoId = watch('productoId')
  const tipoAjuste = watch('tipoAjuste')
  const almacenId = watch('almacenId')
  const bucketKey = watch('bucketKey')
  const cantidad = watch('cantidad')
  const unidadEntradaId = watch('unidadEntradaId')
  const { buckets, cargando, consultando, error } = useBucketsAjusteStock(
    productoId,
    almacenId,
    organizationId,
  )
  const almacenSeleccionado = useMemo(
    () => almacenes.find((almacen) => almacen.id === almacenId && almacen.activo),
    [almacenId, almacenes],
  )
  const opcionesAlmacenSeleccionado = useMemo<ComboboxOption[]>(
    () => almacenOpcion ? [almacenOpcion] : almacenSeleccionado
      ? [{ value: almacenSeleccionado.id, label: `${almacenSeleccionado.codigo} · ${almacenSeleccionado.nombre}` }]
      : [],
    [almacenOpcion, almacenSeleccionado],
  )
  const cargarAlmacenesAjuste = useCallback(async (busqueda: string): Promise<ComboboxOption[]> => {
    if (tipoAjuste === 'ajuste-positivo') {
      const items = await queryClient.fetchQuery({
        queryKey: ['inventory-movement-warehouses', organizationId, productoId, 'all', busqueda],
        queryFn: () => buscarAlmacenesMovimientoInventario(organizationId, productoId, null, busqueda),
        staleTime: 5_000,
      })
      return items.map((item) => ({
        value: item.id,
        label: `${item.codigo} · ${item.nombre}`,
        keywords: [item.codigo, item.nombre],
      }))
    }
    const respuesta = await queryClient.fetchQuery({
      queryKey: ['inventory-adjustment-warehouses', organizationId, productoId, busqueda],
      queryFn: () => listarAlmacenesAjusteStock(organizationId, productoId, busqueda),
      staleTime: 5_000,
    })
    return respuesta.items.map((almacen) => ({
      value: almacen.id,
      label: `${almacen.codigo} · ${almacen.nombre}`,
      secondaryText: `Stock no reservado: ${formatoCantidad.format(almacen.cantidadDescontable)} ${producto?.unidadMedida || 'unidades'}`,
      keywords: [almacen.codigo, almacen.nombre],
    }))
  }, [organizationId, producto?.unidadMedida, productoId, queryClient, tipoAjuste])
  const ubicacionesActivas = useMemo(
    () => new Set(
      ubicaciones
        .filter((ubicacion) => ubicacion.activa && ubicacion.almacenId === almacenId)
        .map((ubicacion) => ubicacion.id),
    ),
    [almacenId, ubicaciones],
  )
  const bucketsActivos = useMemo(
    () => buckets.filter((bucket) => ubicacionesActivas.has(bucket.ubicacionId)),
    [buckets, ubicacionesActivas],
  )
  const bucketsVisibles = useMemo(
    () => bucketsActivos.filter((bucket) => tipoAjuste === 'ajuste-positivo'
      || cantidadDisponibleAjusteStock(bucket) > 0),
    [bucketsActivos, tipoAjuste],
  )
  const opcionesBuckets = useMemo<ComboboxOption[]>(
    () => bucketsVisibles.map((bucket) => {
      const descontable = cantidadDisponibleAjusteStock(bucket)
      return {
        value: claveBucketAjusteStock(bucket),
        label: descripcionBucket(bucket),
        secondaryText: [
          `${formatoCantidad.format(descontable)} ${bucket.unidadMedida || 'unidades'} disponibles para descontar`,
          `${formatoCantidad.format(bucket.cantidadFisica)} físico`,
          `${formatoCantidad.format(bucket.cantidadReservada)} reservado`,
        ].join(' · '),
        keywords: [
          bucket.ubicacionNombre,
          bucket.almacenCodigo,
          bucket.lote,
          bucket.fechaVencimiento,
          etiquetasEstadoStock[bucket.estadoStock],
        ],
      }
    }),
    [bucketsVisibles],
  )
  const bucketSeleccionado = useMemo(
    () => bucketsVisibles.find((bucket) => claveBucketAjusteStock(bucket) === bucketKey) ?? null,
    [bucketKey, bucketsVisibles],
  )
  const unidadEntrada = producto?.unidadesEntrada?.find((unidad) => unidad.id === unidadEntradaId)
    ?? producto?.unidadesEntrada?.[0]
  const factorConversion = unidadEntrada?.factorConversion ?? 1
  const cantidadNumero = Number(cantidad) * factorConversion
  const tipoAjusteAnterior = useRef(tipoAjuste)
  const ubicacionAnterior = useRef({ productoId: productoInicialId, almacenId: almacenInicialId })

  useEffect(() => {
    if (
      ubicacionAnterior.current.productoId === productoId
      && ubicacionAnterior.current.almacenId === almacenId
    ) return
    ubicacionAnterior.current = { productoId, almacenId }
    setValue('bucketKey', '')
    setValue('cantidad', '')
    setConfirmacion(null)
    setErrorGuardado('')
  }, [almacenId, productoId, setValue])

  useEffect(() => {
    if (tipoAjusteAnterior.current === tipoAjuste) return
    tipoAjusteAnterior.current = tipoAjuste
    setValue('bucketKey', '')
    setValue('cantidad', '')
    setConfirmacion(null)
    setErrorGuardado('')
    setValue('almacenId', '', { shouldDirty: true })
    setAlmacenOpcion(null)
  }, [setValue, tipoAjuste])

  useEffect(() => {
    if (consultando || error || !bucketKey || bucketSeleccionado) return
    setValue('bucketKey', '')
    setValue('cantidad', '')
  }, [bucketKey, bucketSeleccionado, consultando, error, setValue])

  const seleccionarProducto = (nextValue: string, opcion?: ProductoInventarioOpcion) => {
    setValue('productoId', nextValue, { shouldValidate: true })
    setValue('almacenId', '', { shouldDirty: true })
    setValue('unidadEntradaId', opcion?.unidadBaseId, { shouldDirty: true })
    setValue('factorConversionEsperado', opcion?.unidadesEntrada?.find((unidad) => unidad.id === opcion.unidadBaseId)?.factorConversion ?? 1, { shouldDirty: true })
    setProducto(opcion ?? null)
    setValue('bucketKey', '')
    setValue('cantidad', '')
    setConfirmacion(null)
    setErrorGuardado('')
    setAlmacenOpcion(null)
  }

  const prepararConfirmacion = (datos: DatosFormularioAjusteStock) => {
    const unidadSeleccionada = producto?.unidadesEntrada?.find((unidad) => unidad.id === datos.unidadEntradaId)
      ?? producto?.unidadesEntrada?.[0]
    const cantidadSolicitada = Number(datos.cantidad) * (unidadSeleccionada?.factorConversion ?? 1)
    if (!bucketSeleccionado) {
      setError('bucketKey', { type: 'validate', message: 'Selecciona la posición de stock que vas a ajustar' })
      return
    }
    if (datos.tipoAjuste === 'ajuste-negativo') {
      const cantidadDisponible = cantidadDisponibleAjusteStock(bucketSeleccionado)
      if (cantidadSolicitada > cantidadDisponible) {
        setError('cantidad', {
          type: 'validate',
          message: `La cantidad no puede superar el disponible actual (${formatoCantidad.format(cantidadDisponible)})`,
        })
        return
      }
    }
    setErrorGuardado('')
    setConfirmacion({ datos, bucket: bucketSeleccionado })
  }

  const confirmarAjuste = async () => {
    if (!confirmacion || guardando) return
    setGuardando(true)
    setErrorGuardado('')
    const { datos, bucket } = confirmacion
    let errorRegistro: string | undefined
    try {
      errorRegistro = await alGuardar({
        productoId: datos.productoId,
        tipo: datos.tipoAjuste,
        cantidad: datos.cantidad,
        almacen: bucket.almacenNombre,
        almacenId: bucket.almacenId,
        ubicacionId: bucket.ubicacionId,
        estadoStock: bucket.estadoStock,
        // El RPC toma el costo promedio bajo bloqueo del bucket. No enviarlo evita
        // revalorar la existencia con un costo leído antes de una operación concurrente.
        lote: bucket.lote,
        fechaVencimiento: bucket.fechaVencimiento,
        fechaOperacion: hoy(),
        unidadEntradaId: datos.unidadEntradaId || producto?.unidadBaseId,
        factorConversionEsperado: datos.factorConversionEsperado ?? unidadEntrada?.factorConversion ?? 1,
        motivo: crearMotivoAjusteStock(datos.observacion),
      })
    } catch {
      errorRegistro = 'No se pudo registrar el ajuste. Inténtalo nuevamente.'
    }
    setGuardando(false)
    if (errorRegistro) {
      setErrorGuardado(errorRegistro)
      return
    }

    alCambiarApertura(false)
  }

  const unidadConfirmada = producto?.unidadesEntrada?.find((unidad) => unidad.id === confirmacion?.datos.unidadEntradaId)
  const cantidadConfirmada = confirmacion
    ? Number(confirmacion.datos.cantidad) * (unidadConfirmada?.factorConversion ?? 1)
    : 0

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed start-1/2 top-1/2 z-50 max-h-[92svh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-background shadow-xl outline-none"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <DialogPrimitive.Title className="text-xl font-semibold tracking-[-0.025em]">
                Ajustar stock
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                Corrige una diferencia entre el stock registrado y el stock real. El cambio quedará en el historial.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar ajuste de stock"
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>

          {confirmacion ? (
            <section className="space-y-5 px-5 py-6 sm:px-7" aria-label="Confirmación del ajuste">
              <div className="flex items-start gap-3 border border-[#d9c7a3] bg-[#fbf6e9] px-4 py-4 text-sm leading-6 text-[#6b4b12]">
                <AlertTriangle aria-hidden="true" className="mt-1 size-4 shrink-0" />
                <p>
                  Se {confirmacion.datos.tipoAjuste === 'ajuste-positivo' ? 'aumentarán' : 'descontarán'}{' '}
                  <strong>{formatoCantidad.format(cantidadConfirmada)} {confirmacion.bucket.unidadMedida || producto?.unidadMedida || 'unidades'}</strong>{' '}
                  de <strong>{confirmacion.bucket.productoDescripcion}</strong> en{' '}
                  <strong>{confirmacion.bucket.almacenNombre}</strong> · {descripcionBucket(confirmacion.bucket)}.
                </p>
              </div>
              <DetalleStock
                bucket={confirmacion.bucket}
                cantidad={cantidadConfirmada}
                positivo={confirmacion.datos.tipoAjuste === 'ajuste-positivo'}
              />
              <p className="text-sm leading-6 text-muted-foreground">
                Se conservarán lote, vencimiento, condición y costo de la posición. El historial registrará la
                {' '}diferencia, la observación (si agregaste una) y el usuario responsable.
              </p>
              {errorGuardado ? (
                <p role="alert" className="field-error border border-destructive/30 bg-destructive/5 px-4 py-3">
                  {errorGuardado}
                </p>
              ) : null}
            </section>
          ) : (
            <form
              id="formulario-ajuste-stock"
              className="space-y-5 px-5 py-6 sm:px-7"
              onSubmit={handleSubmit(prepararConfirmacion)}
            >
              <div>
                <input type="hidden" {...register('productoId')} />
                <SelectorProductoInventario
                  id="producto-ajuste-stock"
                  name="producto-selector-ajuste-stock"
                  etiqueta="Producto"
                  organizationId={organizationId}
                  value={productoId}
                  selectedOption={producto}
                  error={errors.productoId?.message}
                  autoSeleccionarPrimeraOpcion={false}
                  onValueChange={seleccionarProducto}
                />
              </div>

              <div>
                <label htmlFor="tipo-ajuste-stock" className="field-label">Tipo de ajuste *</label>
                <select
                  id="tipo-ajuste-stock"
                  className="field-control"
                  {...register('tipoAjuste')}
                >
                  <option value="ajuste-positivo">Aumentar stock</option>
                  <option value="ajuste-negativo">Descontar stock</option>
                </select>
                <p className="field-help">Corrige una diferencia de conteo en una posición existente. Las recepciones y salidas se registran en Movimientos.</p>
              </div>

              <input type="hidden" {...register('almacenId')} />
              <Combobox
                key={`${organizationId}:${productoId}:${tipoAjuste}`}
                id="almacen-ajuste-stock"
                label="Almacén"
                value={almacenId}
                options={opcionesAlmacenSeleccionado}
                onChange={(valor, opcion) => {
                  setAlmacenOpcion(opcion ?? null)
                  setValue('almacenId', valor, { shouldValidate: true, shouldDirty: true })
                  setValue('bucketKey', '', { shouldDirty: true })
                  setValue('cantidad', '', { shouldDirty: true })
                  setConfirmacion(null)
                  setErrorGuardado('')
                }}
                loadOptions={cargarAlmacenesAjuste}
                placeholder={productoId ? 'Buscar por código o nombre' : 'Selecciona primero un producto'}
                helperText={tipoAjuste === 'ajuste-negativo'
                  ? 'Busca un almacén con stock disponible para descontar.'
                  : 'Busca el almacén donde está la posición que necesitas corregir.'}
                error={errors.almacenId?.message}
                required
                disabled={!productoId}
                minSearchLength={1}
                noOptionsMessage="Selecciona primero un producto."
                noResultsMessage={tipoAjuste === 'ajuste-negativo'
                  ? 'No hay almacenes con stock no reservado que coincidan.'
                  : 'No hay almacenes activos que coincidan.'}
                loadingMessage="Buscando almacenes…"
              />

              <div>
                <input type="hidden" {...register('bucketKey')} />
                <Combobox
                  id="bucket-ajuste-stock"
                  label="Ubicación, lote y condición"
                  value={bucketKey}
                  options={opcionesBuckets}
                  onChange={(valor) => {
                    setValue('bucketKey', valor, { shouldValidate: true, shouldDirty: true })
                    setValue('cantidad', '', { shouldDirty: true })
                    setConfirmacion(null)
                  }}
                  placeholder={
                    !productoId
                      ? 'Selecciona primero un producto'
                      : !almacenId
                        ? 'Selecciona un almacén para consultar stock'
                      : cargando
                        ? 'Consultando existencias…'
                        : bucketsVisibles.length
                          ? 'Busca por ubicación, lote o vencimiento'
                          : tipoAjuste === 'ajuste-negativo' && bucketsActivos.length
                            ? 'Todo el stock está reservado'
                            : 'No hay stock físico en este almacén'
                  }
                  helperText={error || !almacenId || !bucketsVisibles.length
                    ? undefined
                    : tipoAjuste === 'ajuste-negativo'
                      ? 'Selecciona la posición exacta; el stock reservado no se puede descontar.'
                      : 'Selecciona la posición encontrada. Se conservarán su lote, vencimiento, condición y costo.'}
                  error={errors.bucketKey?.message ?? (error ? 'No se pudieron consultar las existencias. Vuelve a intentarlo.' : undefined)}
                  required
                  disabled={!productoId || !almacenId || cargando || bucketsVisibles.length === 0}
                  noOptionsMessage={
                    !productoId
                      ? 'Selecciona primero un producto.'
                      : !almacenId
                        ? 'Selecciona un almacén para consultar las posiciones de stock.'
                      : cargando
                        ? 'Consultando existencias…'
                        : tipoAjuste === 'ajuste-negativo' && bucketsActivos.length
                          ? 'Todo el stock físico está reservado; no hay unidades para descontar.'
                          : 'No hay posiciones con stock físico en este almacén.'
                  }
                  noResultsMessage="No se encontraron ubicaciones o lotes con esos datos."
                  maxVisibleOptions={50}
                />
                {!error && productoId && almacenId && !cargando && bucketsVisibles.length === 0 ? (
                  <p className="field-help">
                    {tipoAjuste === 'ajuste-negativo' && bucketsActivos.length
                      ? 'Todo el stock de este almacén está reservado.'
                      : 'Si encontraste stock donde el sistema registra cero, ingrésalo como movimiento de entrada con sus datos de lote y costo.'}
                  </p>
                ) : null}
              </div>

              {bucketSeleccionado ? (
                <DetalleStock
                  bucket={bucketSeleccionado}
                  cantidad={cantidadNumero}
                  positivo={tipoAjuste === 'ajuste-positivo'}
                />
              ) : null}

              <div>
                <label htmlFor="cantidad-ajuste-stock" className="field-label">Cantidad a {tipoAjuste === 'ajuste-positivo' ? 'aumentar' : 'descontar'} *</label>
                <input
                  id="cantidad-ajuste-stock"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  max={tipoAjuste === 'ajuste-negativo' && bucketSeleccionado
                    ? Math.floor((cantidadDisponibleAjusteStock(bucketSeleccionado) / factorConversion) * 1000) / 1000
                    : undefined}
                  className="field-control"
                  aria-invalid={Boolean(errors.cantidad)}
                  {...register('cantidad')}
                />
                {errors.cantidad ? (
                  <p className="field-error">{errors.cantidad.message}</p>
                ) : (
                  <p className="field-help">
                    Ingresa la diferencia, no el total contado. {unidadEntrada?.nombre || producto?.unidadMedida || 'Unidades'} · máximo 3 decimales.
                  </p>
                )}
              </div>
              {(producto?.unidadesEntrada?.length ?? 0) > 1 ? (
                <div>
                  <label htmlFor="unidad-ajuste-stock" className="field-label">Unidad de medida *</label>
                  <select
                    id="unidad-ajuste-stock"
                    className="field-control"
                    value={unidadEntradaId ?? producto?.unidadBaseId ?? ''}
                    onChange={(evento) => {
                      const unidad = producto?.unidadesEntrada?.find((opcion) => opcion.id === evento.target.value)
                      setValue('unidadEntradaId', evento.target.value || undefined, { shouldDirty: true })
                      setValue('factorConversionEsperado', unidad?.factorConversion ?? 1, { shouldDirty: true })
                    }}
                  >
                    {producto?.unidadesEntrada?.map((unidad) => (
                      <option key={unidad.id} value={unidad.id}>{unidad.nombre}</option>
                    ))}
                  </select>
                  {unidadEntrada && unidadEntrada.factorConversion !== 1 ? (
                    <p className="field-help">1 {unidadEntrada.nombre} equivale a {unidadEntrada.factorConversion} {producto?.unidadMedida}.</p>
                  ) : null}
                </div>
              ) : null}

              <div>
                <label htmlFor="observacion-ajuste-stock" className="field-label">Observación (opcional)</label>
                <textarea
                  id="observacion-ajuste-stock"
                  rows={3}
                  maxLength={120}
                  placeholder="Agrega un detalle útil para la trazabilidad"
                  className="field-control py-2"
                  aria-invalid={Boolean(errors.observacion)}
                  aria-describedby={errors.observacion ? 'observacion-ajuste-stock-error' : undefined}
                  {...register('observacion')}
                />
                {errors.observacion ? (
                  <p id="observacion-ajuste-stock-error" role="alert" className="field-error">{errors.observacion.message}</p>
                ) : null}
              </div>

            </form>
          )}

          <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            {confirmacion ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={guardando}
                  onClick={() => {
                    setConfirmacion(null)
                    setErrorGuardado('')
                  }}
                >
                  Volver a editar
                </Button>
                <Button type="button" size="lg" disabled={guardando} onClick={() => void confirmarAjuste()}>
                  {guardando ? 'Registrando ajuste...' : 'Confirmar ajuste'}
                </Button>
              </>
            ) : (
              <>
                <DialogPrimitive.Close asChild>
                  <Button type="button" variant="outline" size="lg">Cancelar</Button>
                </DialogPrimitive.Close>
                <Button type="submit" form="formulario-ajuste-stock" size="lg">
                  Revisar ajuste
                </Button>
              </>
            )}
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
