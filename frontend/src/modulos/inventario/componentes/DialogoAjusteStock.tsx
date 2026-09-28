import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Check, Minus, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
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
  motivosAjusteStock,
  type BucketAjusteStock,
  type DatosFormularioAjusteStock,
  type DatosMovimientoInventario,
} from '@/modulos/inventario/modelo/inventario'
import type { ProductoInventarioOpcion } from '@/modulos/inventario/modelo/productoInventarioRead'

const hoy = fechaActualPeru
const formatoCantidad = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 })

interface DialogoAjusteStockProps {
  abierto: boolean
  organizationId: string
  almacenes: readonly Almacen[]
  ubicaciones: readonly UbicacionAlmacen[]
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
}: {
  bucket: BucketAjusteStock
  cantidad: number
}) {
  const disponible = cantidadDisponibleAjusteStock(bucket)
  const stockEsperado = bucket.cantidadFisica - cantidad

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
          <dt className="text-xs text-muted-foreground">Disponible para descontar</dt>
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
  alCambiarApertura,
  alGuardar,
  alRestaurarFoco,
}: DialogoAjusteStockProps) {
  const [producto, setProducto] = useState<ProductoInventarioOpcion | null>(null)
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
      productoId: '',
      almacenId: almacenes[0]?.id ?? '',
      bucketKey: '',
      cantidad: '',
      motivoAjuste: 'physical_count_difference',
      observacion: '',
    },
  })

  const productoId = watch('productoId')
  const almacenId = watch('almacenId')
  const bucketKey = watch('bucketKey')
  const cantidad = watch('cantidad')
  const { buckets, cargando, error } = useBucketsAjusteStock(
    productoId,
    almacenId,
    organizationId,
  )
  const ubicacionesActivas = useMemo(
    () => new Set(
      ubicaciones
        .filter((ubicacion) => ubicacion.activa && ubicacion.almacenId === almacenId)
        .map((ubicacion) => ubicacion.id),
    ),
    [almacenId, ubicaciones],
  )
  const bucketsVisibles = useMemo(
    () => buckets.filter((bucket) => ubicacionesActivas.has(bucket.ubicacionId)),
    [buckets, ubicacionesActivas],
  )
  const bucketSeleccionado = useMemo(
    () => bucketsVisibles.find((bucket) => claveBucketAjusteStock(bucket) === bucketKey) ?? null,
    [bucketKey, bucketsVisibles],
  )
  const cantidadNumero = Number(cantidad)

  useEffect(() => {
    setValue('bucketKey', '')
    setValue('cantidad', '')
    setConfirmacion(null)
    setErrorGuardado('')
  }, [almacenId, productoId, setValue])

  useEffect(() => {
    if (bucketKey && !bucketSeleccionado) setValue('bucketKey', '')
  }, [bucketKey, bucketSeleccionado, setValue])

  const seleccionarProducto = (nextValue: string, opcion?: ProductoInventarioOpcion) => {
    setValue('productoId', nextValue, { shouldValidate: true })
    setProducto(opcion ?? null)
    setValue('bucketKey', '')
    setValue('cantidad', '')
    setConfirmacion(null)
    setErrorGuardado('')
  }

  const prepararConfirmacion = (datos: DatosFormularioAjusteStock) => {
    if (!bucketSeleccionado) {
      setError('bucketKey', { type: 'validate', message: 'Selecciona un bucket disponible' })
      return
    }

    const cantidadSolicitada = Number(datos.cantidad)
    const cantidadDisponible = cantidadDisponibleAjusteStock(bucketSeleccionado)
    if (cantidadSolicitada > cantidadDisponible) {
      setError('cantidad', {
        type: 'validate',
        message: `La cantidad no puede superar el disponible actual (${formatoCantidad.format(cantidadDisponible)})`,
      })
      return
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
        tipo: 'ajuste-negativo',
        cantidad: datos.cantidad,
        almacen: bucket.almacenNombre,
        almacenId: bucket.almacenId,
        ubicacionId: bucket.ubicacionId,
        estadoStock: bucket.estadoStock,
        costoUnitario: bucket.costoPromedio.toFixed(4),
        lote: bucket.lote,
        fechaVencimiento: bucket.fechaVencimiento,
        fechaOperacion: hoy(),
        documentoReferencia: datos.documentoReferencia,
        motivo: crearMotivoAjusteStock(datos.motivoAjuste, datos.observacion),
      })
    } catch {
      errorRegistro = 'No se pudo registrar el descuento. Inténtalo nuevamente.'
    }
    setGuardando(false)
    if (errorRegistro) {
      setErrorGuardado(errorRegistro)
      return
    }

    alCambiarApertura(false)
  }

  const cantidadConfirmada = confirmacion ? Number(confirmacion.datos.cantidad) : 0

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
                Descontar stock de un bucket exacto. El movimiento quedará registrado en el Kardex persistente.
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
            <section className="space-y-5 px-5 py-6 sm:px-7" aria-label="Confirmación del descuento">
              <div className="flex items-start gap-3 border border-[#d9c7a3] bg-[#fbf6e9] px-4 py-4 text-sm leading-6 text-[#6b4b12]">
                <AlertTriangle aria-hidden="true" className="mt-1 size-4 shrink-0" />
                <p>
                  Se descontarán <strong>{formatoCantidad.format(cantidadConfirmada)} {confirmacion.bucket.unidadMedida || 'unidades'}</strong>{' '}
                  de <strong>{confirmacion.bucket.productoDescripcion}</strong> en{' '}
                  <strong>{confirmacion.bucket.almacenNombre}</strong> ·{' '}
                  {descripcionBucket(confirmacion.bucket)}.
                </p>
              </div>
              <DetalleStock bucket={confirmacion.bucket} cantidad={cantidadConfirmada} />
              <p className="text-sm leading-6 text-muted-foreground">
                El descuento se registrará como <strong>ajuste negativo</strong> con el motivo seleccionado y podrá consultarse en el Kardex.
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
                  autoSeleccionarPrimeraOpcion={false}
                  onValueChange={seleccionarProducto}
                />
                {errors.productoId ? <p className="field-error">{errors.productoId.message}</p> : null}
              </div>

              <div>
                <label htmlFor="almacen-ajuste-stock" className="field-label">Almacén *</label>
                <select
                  id="almacen-ajuste-stock"
                  className="field-control"
                  {...register('almacenId')}
                >
                  {almacenes.length === 0 ? <option value="">No hay almacenes activos</option> : null}
                  {almacenes.map((almacen) => (
                    <option key={almacen.id} value={almacen.id}>{almacen.codigo} · {almacen.nombre}</option>
                  ))}
                </select>
                {errors.almacenId ? <p className="field-error">{errors.almacenId.message}</p> : null}
              </div>

              <div>
                <label htmlFor="bucket-ajuste-stock" className="field-label">Bucket exacto *</label>
                <select
                  id="bucket-ajuste-stock"
                  className="field-control"
                  disabled={!productoId || cargando || bucketsVisibles.length === 0}
                  {...register('bucketKey')}
                >
                  <option value="">
                    {!productoId
                      ? 'Selecciona primero un producto'
                      : cargando
                        ? 'Consultando stock del almacén...'
                        : bucketsVisibles.length
                          ? 'Selecciona ubicación, lote y vencimiento'
                          : 'No hay stock físico en este almacén'}
                  </option>
                  {bucketsVisibles.map((bucket) => (
                    <option key={claveBucketAjusteStock(bucket)} value={claveBucketAjusteStock(bucket)}>
                      {descripcionBucket(bucket)} · {formatoCantidad.format(bucket.cantidadFisica)} disponibles
                    </option>
                  ))}
                </select>
                {errors.bucketKey ? <p className="field-error">{errors.bucketKey.message}</p> : null}
                {error ? <p role="alert" className="field-error">{error}</p> : null}
                {!error && productoId && !cargando && bucketsVisibles.length === 0 ? (
                  <p className="field-help">Selecciona otro almacén si el producto tiene stock en otra ubicación.</p>
                ) : null}
              </div>

              {bucketSeleccionado ? (
                <DetalleStock bucket={bucketSeleccionado} cantidad={cantidadNumero} />
              ) : null}

              <div>
                <label htmlFor="documento-ajuste-stock" className="field-label">Documento de sustento *</label>
                <input
                  id="documento-ajuste-stock"
                  autoComplete="off"
                  maxLength={120}
                  placeholder="Ej. Acta de ajuste AJ-2026-001"
                  className="field-control"
                  aria-invalid={Boolean(errors.documentoReferencia)}
                  {...register('documentoReferencia')}
                />
                <p className="field-help">Referencia al acta, conteo físico u otra autorización del ajuste.</p>
                {errors.documentoReferencia ? <p className="field-error">{errors.documentoReferencia.message}</p> : null}
              </div>

              <div>
                <label htmlFor="cantidad-ajuste-stock" className="field-label">Cantidad a descontar *</label>
                <input
                  id="cantidad-ajuste-stock"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  max={bucketSeleccionado ? cantidadDisponibleAjusteStock(bucketSeleccionado) : undefined}
                  className="field-control"
                  aria-invalid={Boolean(errors.cantidad)}
                  {...register('cantidad')}
                />
                {errors.cantidad ? (
                  <p className="field-error">{errors.cantidad.message}</p>
                ) : (
                  <p className="field-help">{producto?.unidadMedida || 'Unidades'} · máximo 3 decimales</p>
                )}
              </div>

              <div>
                <label htmlFor="motivo-ajuste-stock" className="field-label">Motivo del ajuste *</label>
                <select
                  id="motivo-ajuste-stock"
                  className="field-control"
                  {...register('motivoAjuste')}
                >
                  {motivosAjusteStock.map((motivo) => (
                    <option key={motivo.valor} value={motivo.valor}>{motivo.etiqueta}</option>
                  ))}
                </select>
                {errors.motivoAjuste ? <p className="field-error">{errors.motivoAjuste.message}</p> : null}
              </div>

              <div>
                <label htmlFor="observacion-ajuste-stock" className="field-label">Observación (opcional)</label>
                <textarea
                  id="observacion-ajuste-stock"
                  rows={3}
                  placeholder="Agrega un detalle útil para la trazabilidad"
                  className="field-control py-2"
                  aria-invalid={Boolean(errors.observacion)}
                  {...register('observacion')}
                />
                {errors.observacion ? <p className="field-error">{errors.observacion.message}</p> : null}
              </div>

              <div className="flex items-start gap-3 border border-[#d9c7a3] bg-[#fbf6e9] px-4 py-3 text-sm leading-6 text-[#6b4b12]">
                <Minus aria-hidden="true" className="mt-1 size-4 shrink-0" />
                <p>
                  Solo se descontará del bucket seleccionado. El backend volverá a validar el stock y las reservas al confirmar.
                </p>
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
                  {guardando ? 'Registrando descuento...' : 'Confirmar descuento'}
                </Button>
              </>
            ) : (
              <>
                <DialogPrimitive.Close asChild>
                  <Button type="button" variant="outline" size="lg">Cancelar</Button>
                </DialogPrimitive.Close>
                <Button type="submit" form="formulario-ajuste-stock" size="lg">
                  Revisar descuento
                </Button>
              </>
            )}
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
