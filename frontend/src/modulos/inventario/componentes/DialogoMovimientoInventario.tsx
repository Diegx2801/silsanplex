import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDownToLine, ArrowUpFromLine, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { fechaActualPeru } from '@/lib/fechas'
import { useBucketsAjusteStock } from '@/modulos/inventario/estado/useBucketsAjusteStock'
import { useCandidatosFefo } from '@/modulos/inventario/estado/useCandidatosFefo'
import { SelectorProductoInventario } from '@/modulos/inventario/componentes/SelectorProductoInventario'
import { etiquetasEstadoStock, type Almacen, type UbicacionAlmacen } from '@/modulos/inventario/modelo/almacen'
import type { ContextoAccionInventario } from '@/modulos/inventario/modelo/contextoAccionInventario'
import {
  esquemaDatosMovimientoInventario,
  cantidadDisponibleAjusteStock,
  claveBucketAjusteStock,
  movimientoEsSalida,
  tiposMovimientoEnExistencias,
  tiposMovimientoInventario,
  type DatosMovimientoInventario,
  type TipoMovimientoInventario,
} from '@/modulos/inventario/modelo/inventario'
import type { ProductoInventarioOpcion } from '@/modulos/inventario/modelo/productoInventarioRead'
import { buscarAlmacenesMovimientoInventario } from '@/modulos/inventario/servicios/inventarioService'

const hoy = fechaActualPeru

interface DialogoMovimientoInventarioProps {
  abierto: boolean
  organizationId: string
  almacenes: readonly Almacen[]
  ubicaciones: readonly UbicacionAlmacen[]
  opcionesTipoMovimiento?: readonly (typeof tiposMovimientoInventario)[number][]
  contexto?: ContextoAccionInventario | null
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosMovimientoInventario) => Promise<string | undefined>
  alRestaurarFoco: () => void
}

export function DialogoMovimientoInventario({
  abierto,
  organizationId,
  almacenes,
  ubicaciones,
  opcionesTipoMovimiento = tiposMovimientoEnExistencias,
  contexto = null,
  alCambiarApertura,
  alGuardar,
  alRestaurarFoco,
}: DialogoMovimientoInventarioProps) {
  const queryClient = useQueryClient()
  const almacenInicialId = contexto?.posicion?.almacenId ?? ''
  const almacenInicial = almacenes.find((item) => item.id === almacenInicialId)
  const ubicacionInicialId = contexto?.posicion?.ubicacionId
  const [producto, setProducto] = useState<ProductoInventarioOpcion | null>(contexto?.producto ?? null)
  const [almacenOpcion, setAlmacenOpcion] = useState<ComboboxOption | null>(() => almacenInicial
    ? { value: almacenInicial.id, label: `${almacenInicial.codigo} · ${almacenInicial.nombre}` }
    : null)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<DatosMovimientoInventario>({
    resolver: zodResolver(esquemaDatosMovimientoInventario),
    defaultValues: {
      productoId: contexto?.producto.id ?? '',
      tipo: 'entrada',
      cantidad: '',
      almacen: almacenInicial?.nombre ?? '',
      almacenId: almacenInicialId,
      ubicacionId: ubicacionInicialId,
      estadoStock: contexto?.posicion?.estado ?? 'available',
      lote: contexto?.posicion?.lote ?? '',
      fechaVencimiento: contexto?.posicion?.fechaVencimiento ?? '',
      fechaOperacion: hoy(),
      motivo: '',
      documentoReferencia: '',
      costoUnitario: '',
      unidadEntradaId: contexto?.producto.unidadBaseId,
      factorConversionEsperado: 1,
    },
  })
  const productoId = watch('productoId')
  const tipo = watch('tipo')
  const tiposPermitidos = opcionesTipoMovimiento.map((opcion) => opcion.valor)
  const almacenId = watch('almacenId')
  const estadoStock = watch('estadoStock')
  const lote = watch('lote')
  const ubicacionId = watch('ubicacionId')
  const fechaVencimiento = watch('fechaVencimiento')
  const unidadEntradaId = watch('unidadEntradaId')
  const unidadEntrada = producto?.unidadesEntrada?.find((unidad) => unidad.id === unidadEntradaId)
    ?? producto?.unidadesEntrada?.[0]
  const factorConversion = unidadEntrada?.factorConversion ?? 1
  const unidadCaptura = unidadEntrada?.nombre || producto?.unidadMedida || 'unidades'
  const esSalida = movimientoEsSalida(tipo)
  const usarFefo = tipo === 'salida' && estadoStock === 'available'
  const requiereBucketExacto = tipo === 'salida' && estadoStock !== 'available'
  const almacenesElegiblesStatus = esSalida ? estadoStock ?? 'available' : null
  const cargarAlmacenes = useCallback(async (busqueda: string): Promise<ComboboxOption[]> => {
    const items = await queryClient.fetchQuery({
      queryKey: ['inventory-movement-warehouses', organizationId, productoId, almacenesElegiblesStatus, busqueda],
      queryFn: () => buscarAlmacenesMovimientoInventario(
        organizationId,
        productoId,
        almacenesElegiblesStatus,
        busqueda,
      ),
      staleTime: 5_000,
    })
    return items.map((item) => ({
      value: item.id,
      label: `${item.codigo} · ${item.nombre}`,
      secondaryText: almacenesElegiblesStatus
        ? `${item.cantidadDisponible} ${producto?.unidadMedida || 'unidades'} disponibles`
        : undefined,
      keywords: [item.codigo, item.nombre],
    }))
  }, [almacenesElegiblesStatus, organizationId, producto?.unidadMedida, productoId, queryClient])
  const { candidatos, cargando: cargandoFefo, error: errorFefo } =
    useCandidatosFefo(productoId, almacenId ?? '', usarFefo)
  const { buckets, cargando: cargandoBuckets, error: errorBuckets } = useBucketsAjusteStock(
    productoId,
    almacenId ?? '',
    organizationId,
    !usarFefo,
  )
  const candidatoFefo = candidatos[0]
  const cantidadAsignableFefo = candidatos.reduce(
    (total, candidato) => total + candidato.cantidadAsignable,
    0,
  )
  const ubicacionesActivas = useMemo(
    () => ubicaciones.filter((item) => item.almacenId === almacenId && item.activa),
    [almacenId, ubicaciones],
  )
  const opcionesUbicacion = useMemo<ComboboxOption[]>(
    () => ubicacionesActivas.map((item) => ({
      value: item.id,
      label: `${item.codigo} · ${item.nombre}`,
      keywords: [item.codigo, item.nombre],
    })),
    [ubicacionesActivas],
  )
  const bucketsSalida = useMemo(
    () => buckets.filter((bucket) => bucket.estadoStock === estadoStock
      && ubicacionesActivas.some((ubicacion) => ubicacion.id === bucket.ubicacionId)
      && cantidadDisponibleAjusteStock(bucket) > 0),
    [buckets, estadoStock, ubicacionesActivas],
  )
  const opcionesBucketSalida = useMemo<ComboboxOption[]>(
    () => bucketsSalida.map((bucket) => ({
      value: claveBucketAjusteStock(bucket),
      label: `${bucket.ubicacionCodigo} · ${bucket.lote ? `Lote ${bucket.lote}` : 'Sin lote'} · ${bucket.fechaVencimiento || 'Sin vencimiento'} · ${etiquetasEstadoStock[bucket.estadoStock]}`,
      secondaryText: `${cantidadDisponibleAjusteStock(bucket)} ${bucket.unidadMedida || 'unidades'} disponibles`,
      keywords: [bucket.ubicacionNombre, bucket.lote, bucket.fechaVencimiento, bucket.almacenCodigo],
    })),
    [bucketsSalida],
  )
  const bucketsPorLote = useMemo(() => buckets.filter((bucket) => bucket.estadoStock === estadoStock), [buckets, estadoStock])
  const opcionesLote = useMemo<ComboboxOption[]>(() => {
    const porCodigo = new Map<string, typeof bucketsPorLote>()
    for (const bucket of bucketsPorLote) {
      if (!bucket.lote) continue
      porCodigo.set(bucket.lote, [...(porCodigo.get(bucket.lote) ?? []), bucket])
    }
    return [...porCodigo.entries()].map(([codigo, posiciones]) => ({
      value: codigo,
      label: codigo,
      secondaryText: [...new Set(posiciones.map((item) => item.fechaVencimiento).filter(Boolean))]
        .map((fecha) => `Vence ${fecha}`)
        .join(' · ') || 'Sin vencimiento registrado',
      keywords: posiciones.flatMap((item) => [item.ubicacionCodigo, item.fechaVencimiento]),
    }))
  }, [bucketsPorLote])
  const bucketSalidaSeleccionado = useMemo(
    () => bucketsSalida.find((bucket) => claveBucketAjusteStock(bucket) === [
      bucket.almacenId,
      ubicacionId ?? '',
      bucket.estadoStock,
      lote.trim().toLocaleLowerCase('es-PE'),
      fechaVencimiento ?? '',
    ].join('|')) ?? null,
    [bucketsSalida, fechaVencimiento, lote, ubicacionId],
  )

  useEffect(() => {
    if (!almacenId) return
    const current = almacenes.find((item) => item.id === almacenId)
    if (current && almacenOpcion?.value !== current.id) {
      setAlmacenOpcion({ value: current.id, label: `${current.codigo} · ${current.nombre}` })
    }
  }, [almacenId, almacenOpcion?.value, almacenes])

  useEffect(() => {
    if (!usarFefo) return
    setValue('ubicacionId', candidatoFefo?.ubicacionId)
    setValue('lote', candidatoFefo?.lote ?? '')
    setValue('fechaVencimiento', candidatoFefo?.fechaVencimiento ?? '')
  }, [
    candidatoFefo?.fechaVencimiento,
    candidatoFefo?.lote,
    candidatoFefo?.ubicacionId,
    setValue,
    usarFefo,
  ])

  const guardar = async (datos: DatosMovimientoInventario) => {
    if (!tiposPermitidos.includes(datos.tipo as TipoMovimientoInventario)) {
      setError('tipo', { message: 'Selecciona un tipo de movimiento disponible.' })
      return
    }
    if (!datos.almacenId) {
      setError('almacenId', { message: 'Selecciona un almacén' })
      return
    }
    if (usarFefo && (!almacenId || cargandoFefo)) {
      setError('almacenId', { message: 'Selecciona un almacén y espera la consulta de existencias' })
      return
    }
    if (usarFefo && errorFefo) {
      setError('almacenId', { message: 'No se pudieron consultar las existencias. Vuelve a intentarlo.' })
      return
    }
    if (usarFefo && !candidatoFefo) {
      setError('almacenId', { message: 'No hay stock disponible de este producto en el almacén seleccionado' })
      return
    }
    const cantidadEnUnidadBase = Number(datos.cantidad) * factorConversion
    if (usarFefo && cantidadEnUnidadBase > cantidadAsignableFefo) {
      setError('cantidad', {
        message: `La cantidad supera el disponible según FEFO (${cantidadAsignableFefo} ${producto?.unidadMedida || 'unidades'})`,
      })
      return
    }
    if (requiereBucketExacto && bucketSalidaSeleccionado
      && cantidadEnUnidadBase > cantidadDisponibleAjusteStock(bucketSalidaSeleccionado)) {
      setError('cantidad', {
        message: `La cantidad supera el disponible en esta posición (${cantidadDisponibleAjusteStock(bucketSalidaSeleccionado)} ${producto?.unidadMedida || 'unidades'})`,
      })
      return
    }
    if (requiereBucketExacto && !bucketSalidaSeleccionado) {
      setError('ubicacionId', { message: errorBuckets || 'Selecciona una posición con stock disponible para esta condición' })
      return
    }
    if (!usarFefo && !datos.ubicacionId) {
      setError('ubicacionId', { message: 'Selecciona una ubicación física' })
      return
    }
    if (producto?.controlLote && !datos.lote.trim()) {
      setError('lote', { message: 'Este producto requiere ingresar el lote.' })
      return
    }
    if (producto?.controlVencimiento && !datos.fechaVencimiento) {
      setError('fechaVencimiento', { message: 'Este producto requiere fecha de vencimiento.' })
      return
    }

    const error = await alGuardar(datos)
    if (error) {
      setError(
        error.includes('unidad seleccionada') || error.includes('equivalencia')
          ? 'unidadEntradaId'
          : error.includes('documento')
          ? 'documentoReferencia'
          : error.includes('costo')
            ? 'costoUnitario'
          : error.includes('motivo')
            ? 'motivo'
            : error.includes('vencimiento')
              ? 'fechaVencimiento'
              : error.includes('lote')
                ? 'lote'
                : 'cantidad',
        { message: error },
      )
      return
    }

    alCambiarApertura(false)
  }

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
                Registrar movimiento
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                Registra una entrada o salida normal. Para corregir diferencias del inventario, usa «Ajustar stock».
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar movimiento"
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>

          <form
            id="formulario-movimiento-inventario"
            className="px-5 py-6 sm:px-7"
            noValidate
            onSubmit={handleSubmit(guardar)}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="tipo-movimiento" className="field-label">
                  Tipo de movimiento *
                </label>
                <select
                  id="tipo-movimiento"
                  className="field-control"
                  aria-invalid={Boolean(errors.tipo)}
                  {...register('tipo', {
                    onChange: () => {
                      setAlmacenOpcion(null)
                      setValue('almacenId', '')
                      setValue('almacen', '')
                      setValue('ubicacionId', undefined)
                      setValue('estadoStock', 'available')
                      setValue('lote', '')
                      setValue('fechaVencimiento', '')
                      setValue('costoUnitario', '')
                      setValue('cantidad', '')
                      setValue('documentoReferencia', '')
                    },
                  })}
                >
                  {opcionesTipoMovimiento.map((opcion) => (
                    <option key={opcion.valor} value={opcion.valor}>
                      {opcion.etiqueta}
                    </option>
                  ))}
                </select>
                {errors.tipo ? <p className="field-error">{errors.tipo.message}</p> : null}
              </div>
              <div>
                <label htmlFor="fecha-operacion" className="field-label">
                  Fecha de operación *
                </label>
                <input
                  id="fecha-operacion"
                  type="date"
                  className="field-control"
                  aria-invalid={Boolean(errors.fechaOperacion)}
                  {...register('fechaOperacion')}
                />
                {errors.fechaOperacion ? (
                  <p className="field-error">{errors.fechaOperacion.message}</p>
                ) : null}
              </div>

              <div className="sm:col-span-2">
                <input type="hidden" {...register('productoId')} />
                <SelectorProductoInventario
                  id="producto-movimiento"
                  name="producto-selector"
                  etiqueta="Producto"
                  organizationId={organizationId}
                  value={productoId}
                  selectedOption={producto}
                  error={errors.productoId?.message}
                  onValueChange={(nextValue, opcion) => {
                    setValue('productoId', nextValue, { shouldValidate: true })
                    setProducto(opcion ?? null)
                    if (nextValue !== productoId) {
                      setAlmacenOpcion(null)
                      setValue('almacenId', '')
                      setValue('almacen', '')
                      setValue('estadoStock', 'available')
                      setValue('ubicacionId', undefined)
                      setValue('lote', '')
                      setValue('fechaVencimiento', '')
                      setValue('costoUnitario', '')
                      setValue('cantidad', '')
                      setValue('unidadEntradaId', opcion?.unidadBaseId)
                      setValue('factorConversionEsperado', opcion?.unidadesEntrada?.find((unidad) => unidad.id === opcion.unidadBaseId)?.factorConversion ?? 1)
                      clearErrors('unidadEntradaId')
                    }
                  }}
                />
              </div>

              <div>
                <label htmlFor="estado-movimiento" className="field-label">Condición del stock *</label>
                <select
                  id="estado-movimiento"
                  className="field-control"
                  {...register('estadoStock', {
                    onChange: () => {
                      setAlmacenOpcion(null)
                      setValue('almacenId', '')
                      setValue('almacen', '')
                      setValue('ubicacionId', undefined)
                      setValue('lote', '')
                      setValue('fechaVencimiento', '')
                      setValue('costoUnitario', '')
                      setValue('cantidad', '')
                    },
                  })}
                >
                  <option value="available">Disponible</option>
                  <option value="quarantine">Cuarentena</option>
                  <option value="damaged">Dañado / inmovilizado</option>
                </select>
              </div>

              <div>
                <label htmlFor="cantidad-movimiento" className="field-label">
                  Cantidad *
                </label>
                <input
                  id="cantidad-movimiento"
                  type="number"
                  inputMode="decimal"
                  min="0.001"
                  step="0.001"
                  max={usarFefo && candidatoFefo
                    ? Math.floor((cantidadAsignableFefo / factorConversion) * 1000) / 1000
                    : requiereBucketExacto && bucketSalidaSeleccionado
                      ? Math.floor((cantidadDisponibleAjusteStock(bucketSalidaSeleccionado) / factorConversion) * 1000) / 1000
                      : undefined}
                  autoComplete="off"
                  placeholder="0"
                  className="field-control"
                  aria-invalid={Boolean(errors.cantidad)}
                  {...register('cantidad')}
                />
                {errors.cantidad ? (
                  <p className="field-error">{errors.cantidad.message}</p>
                ) : (
                  <p className="field-help">
                    {unidadCaptura} · máximo 3 decimales
                  </p>
                )}
              </div>
              {(producto?.unidadesEntrada?.length ?? 0) > 1 ? (
                <div>
                  <label htmlFor="unidad-movimiento" className="field-label">Unidad de medida *</label>
                  <select
                    id="unidad-movimiento"
                    className="field-control"
                    value={unidadEntradaId ?? producto?.unidadBaseId ?? ''}
                    aria-invalid={Boolean(errors.unidadEntradaId)}
                    onChange={(evento) => {
                      const unidad = producto?.unidadesEntrada?.find((opcion) => opcion.id === evento.target.value)
                      setValue('unidadEntradaId', evento.target.value || undefined, { shouldDirty: true })
                      setValue('factorConversionEsperado', unidad?.factorConversion ?? 1, { shouldDirty: true })
                      clearErrors('unidadEntradaId')
                    }}
                  >
                    {producto?.unidadesEntrada?.map((unidad) => (
                      <option key={unidad.id} value={unidad.id}>{unidad.nombre}</option>
                    ))}
                  </select>
                  {unidadEntrada && unidadEntrada.factorConversion !== 1 ? (
                    <p className="field-help">1 {unidadEntrada.nombre} equivale a {unidadEntrada.factorConversion} {producto?.unidadMedida}.</p>
                  ) : null}
                  {errors.unidadEntradaId ? <p className="field-error">{errors.unidadEntradaId.message}</p> : null}
                </div>
              ) : null}
              <div>
                <input type="hidden" {...register('almacen')} />
                <input type="hidden" {...register('almacenId')} />
                <Combobox
                  key={`${organizationId}:${productoId}:${tipo}:${estadoStock}`}
                  id="almacen-movimiento"
                  label="Almacén"
                  value={almacenId ?? ''}
                  options={almacenOpcion ? [almacenOpcion] : []}
                  loadOptions={cargarAlmacenes}
                  minSearchLength={1}
                  placeholder={productoId ? 'Buscar por código o nombre' : 'Selecciona primero un producto'}
                  helperText={esSalida
                    ? `Solo aparecen almacenes con stock ${estadoStock === 'available' ? 'disponible' : 'no reservado'} para este producto.`
                    : 'Busca cualquier almacén activo para registrar la entrada.'}
                  error={errors.almacenId?.message ?? errors.almacen?.message}
                  required
                  disabled={!productoId}
                  noOptionsMessage="Selecciona primero un producto."
                  noResultsMessage={esSalida
                    ? 'No hay almacenes con stock para esta condición.'
                    : 'No hay almacenes activos que coincidan.'}
                  loadingMessage="Buscando almacenes…"
                  onChange={(valor, opcion) => {
                    setAlmacenOpcion(opcion ?? null)
                    setValue('almacenId', valor, { shouldValidate: true, shouldDirty: true })
                    setValue('almacen', opcion?.label.split(' · ').slice(1).join(' · ') ?? '')
                    setValue('ubicacionId', undefined)
                    setValue('lote', '')
                    setValue('fechaVencimiento', '')
                    setValue('costoUnitario', '')
                    setValue('cantidad', '')
                  }}
                />
              </div>

              {!esSalida || requiereBucketExacto ? (
                <div>
                  <input type="hidden" {...register('ubicacionId')} />
                  {requiereBucketExacto ? (
                    <Combobox
                      id="posicion-movimiento"
                      label="Posición de stock"
                      value={bucketSalidaSeleccionado ? claveBucketAjusteStock(bucketSalidaSeleccionado) : ''}
                      options={opcionesBucketSalida}
                      placeholder={!almacenId ? 'Selecciona primero un almacén' : cargandoBuckets ? 'Consultando posiciones…' : 'Buscar ubicación o lote'}
                      helperText="Selecciona una posición existente; el sistema validará su saldo al guardar."
                      error={errors.ubicacionId?.message ?? (errorBuckets ? 'No se pudieron consultar las posiciones de stock.' : undefined)}
                      required
                      disabled={!productoId || !almacenId || cargandoBuckets || bucketsSalida.length === 0}
                      noOptionsMessage={!almacenId ? 'Selecciona primero un almacén.' : cargandoBuckets ? 'Consultando stock…' : 'No hay stock no reservado para esta condición.'}
                      noResultsMessage="No se encontraron posiciones que coincidan."
                      onChange={(valor) => {
                        const bucket = bucketsSalida.find((item) => claveBucketAjusteStock(item) === valor)
                        setValue('ubicacionId', bucket?.ubicacionId, { shouldValidate: true, shouldDirty: true })
                        setValue('lote', bucket?.lote ?? '')
                        setValue('fechaVencimiento', bucket?.fechaVencimiento ?? '')
                        setValue('costoUnitario', bucket?.costoPromedio.toFixed(4) ?? '')
                        setValue('cantidad', '')
                      }}
                    />
                  ) : (
                    <Combobox
                      id="ubicacion-movimiento"
                      label="Ubicación física"
                      value={ubicacionId ?? ''}
                      options={opcionesUbicacion}
                      placeholder={almacenId ? 'Buscar por código o nombre' : 'Selecciona primero un almacén'}
                      error={errors.ubicacionId?.message}
                      required
                      disabled={!almacenId || ubicacionesActivas.length === 0}
                      noOptionsMessage={!almacenId ? 'Selecciona primero un almacén.' : 'No hay ubicaciones activas.'}
                      onChange={(valor) => {
                        setValue('ubicacionId', valor, { shouldValidate: true, shouldDirty: true })
                        setValue('lote', '')
                        setValue('fechaVencimiento', '')
                        setValue('costoUnitario', '')
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="sm:col-span-2 border bg-muted/25 px-4 py-3 text-sm leading-6" role="status" aria-live="polite">
                  <p className="font-medium">Selección automática de la posición</p>
                  <p className="mt-1 text-muted-foreground">
                    {!almacenId
                      ? 'Selecciona un almacén; primero se usará el lote disponible que vence más pronto.'
                      : cargandoFefo
                        ? 'Buscando stock disponible…'
                        : candidatoFefo
                          ? `Primera posición: ${candidatoFefo.ubicacionCodigo} · ${candidatoFefo.lote || 'sin lote'} · vence ${candidatoFefo.fechaVencimiento || 'sin fecha'}. Si hace falta, la salida se distribuirá entre varias posiciones.`
                          : errorFefo || 'No hay stock disponible para este producto en el almacén seleccionado.'}
                  </p>
                </div>
              )}

              {!esSalida ? <div>
                <label htmlFor="costo-movimiento" className="field-label">Costo unitario *</label>
                <input id="costo-movimiento" type="number" min="0" step="0.0001" placeholder="0.0000" className="field-control" aria-invalid={Boolean(errors.costoUnitario)} {...register('costoUnitario')} />
                {errors.costoUnitario ? <p className="field-error">{errors.costoUnitario.message}</p> : (
                  <p className="field-help">Ingresa el costo por {unidadCaptura}; se convertirá a {producto?.unidadMedida || 'la unidad base'} para valorar el stock.</p>
                )}
              </div> : null}

              {!usarFefo && !requiereBucketExacto ? <div>
                <input type="hidden" {...register('lote')} />
                <Combobox
                  id="lote-movimiento"
                  label={`Lote del fabricante${producto?.controlLote ? ' *' : ''}`}
                  value={lote}
                  options={opcionesLote}
                  allowCustomValue
                  placeholder={almacenId ? 'Buscar un lote o escribir uno nuevo' : 'Selecciona primero un almacén'}
                  helperText="Usa el código impreso en el envase. Si no aparece, puedes escribirlo."
                  error={errors.lote?.message}
                  required={Boolean(producto?.controlLote)}
                  disabled={!almacenId}
                  noOptionsMessage="Escribe el código del lote recibido."
                  noResultsMessage="No se encontró; puedes usar el código escrito."
                  onChange={(valor) => {
                    setValue('lote', valor, { shouldValidate: true, shouldDirty: true })
                    const coincidencias = bucketsPorLote.filter((bucket) => bucket.lote === valor)
                    const fechas = [...new Set(coincidencias.map((bucket) => bucket.fechaVencimiento))]
                    setValue('fechaVencimiento', fechas.length === 1 ? fechas[0] : '')
                  }}
                />
              </div> : null}
              {!usarFefo && !requiereBucketExacto ? <div>
                <label htmlFor="vencimiento-movimiento" className="field-label">
                  Fecha de vencimiento {producto?.controlVencimiento ? '*' : ''}
                </label>
                <input
                  id="vencimiento-movimiento"
                  type="date"
                  className="field-control"
                  aria-invalid={Boolean(errors.fechaVencimiento)}
                  {...register('fechaVencimiento')}
                />
                {errors.fechaVencimiento ? (
                  <p className="field-error">{errors.fechaVencimiento.message}</p>
                ) : null}
              </div> : null}

              <div className="sm:col-span-2">
                <label htmlFor="motivo-movimiento" className="field-label">
                  Motivo del movimiento *
                </label>
                <textarea
                  id="motivo-movimiento"
                  rows={3}
                  placeholder={esSalida
                    ? 'Ej. Uso interno, entrega de muestra o baja autorizada'
                    : 'Ej. Saldo inicial autorizado, donación o recepción de muestras'}
                  className="field-control py-2"
                  aria-invalid={Boolean(errors.motivo)}
                  {...register('motivo')}
                />
                {errors.motivo ? (
                  <p className="field-error">{errors.motivo.message}</p>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="documento-movimiento" className="field-label">Documento de origen (opcional)</label>
                <input
                  id="documento-movimiento"
                  className="field-control"
                  placeholder={esSalida ? 'Ej. vale o autorización' : 'Ej. factura o guía de remisión'}
                  maxLength={120}
                  aria-invalid={Boolean(errors.documentoReferencia)}
                  aria-describedby="documento-movimiento-ayuda"
                  {...register('documentoReferencia')}
                />
                <p id="documento-movimiento-ayuda" className="field-help">Opcional. Registra el número del respaldo si existe; el sistema asigna el folio del movimiento.</p>
                {errors.documentoReferencia ? <p className="field-error">{errors.documentoReferencia.message}</p> : null}
              </div>
            </div>

            <div
              className={`mt-6 flex items-start gap-3 border px-4 py-3 text-sm leading-6 ${
                esSalida
                  ? 'border-[#d9c7a3] bg-[#fbf6e9] text-[#6b4b12]'
                  : 'border-border bg-muted/35 text-muted-foreground'
              }`}
            >
              {esSalida ? (
                <ArrowUpFromLine aria-hidden="true" className="mt-1 size-4 shrink-0" />
              ) : (
                <ArrowDownToLine aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
              )}
              <p>
                {esSalida
                  ? usarFefo
                    ? !productoId
                      ? 'Selecciona un producto para consultar existencias.'
                      : !almacenId
                        ? 'Selecciona un almacén para consultar el stock disponible.'
                        : cargandoFefo
                          ? 'Consultando stock disponible…'
                          : errorFefo
                            ? errorFefo
                            : candidatoFefo
                              ? `${cantidadAsignableFefo} ${producto?.unidadMedida || 'unidades'} disponibles en ${candidatos.length} ${candidatos.length === 1 ? 'posición' : 'posiciones'}. El sistema asignará primero el lote con vencimiento más próximo (FEFO).`
                              : 'No hay stock disponible en el almacén seleccionado.'
                    : `${bucketsSalida.length} posiciones tienen stock ${estadoStock === 'damaged' ? 'dañado' : 'en cuarentena'} no reservado.`
                  : `La entrada sumará stock en ${producto?.unidadMedida || 'la unidad base'} al almacén y posición indicados.`}
              </p>
            </div>
          </form>

          <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="outline" size="lg">
                Cancelar
              </Button>
            </DialogPrimitive.Close>
            <Button
              type="submit"
              form="formulario-movimiento-inventario"
              size="lg"
              disabled={isSubmitting || (usarFefo && Boolean(productoId && almacenId) && (
                cargandoFefo || (!candidatoFefo && !errorFefo)
              ))}
            >
              Registrar movimiento
            </Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
