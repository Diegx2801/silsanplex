import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDownToLine, ArrowUpFromLine, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { useCandidatosFefo } from '@/modulos/inventario/estado/useCandidatosFefo'
import type { Almacen, UbicacionAlmacen } from '@/modulos/inventario/modelo/almacen'
import {
  esquemaDatosMovimientoInventario,
  movimientoEsSalida,
  tiposMovimientoInventario,
  type DatosMovimientoInventario,
} from '@/modulos/inventario/modelo/inventario'
import type { Producto } from '@/modulos/productos/modelo/producto'

const hoy = () => new Date().toISOString().slice(0, 10)

interface DialogoMovimientoInventarioProps {
  abierto: boolean
  productos: readonly Producto[]
  almacenes: readonly Almacen[]
  ubicaciones: readonly UbicacionAlmacen[]
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosMovimientoInventario) => Promise<string | undefined>
  alRestaurarFoco: () => void
}

export function DialogoMovimientoInventario({
  abierto,
  productos,
  almacenes,
  ubicaciones,
  alCambiarApertura,
  alGuardar,
  alRestaurarFoco,
}: DialogoMovimientoInventarioProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosMovimientoInventario>({
    resolver: zodResolver(esquemaDatosMovimientoInventario),
    defaultValues: {
      productoId: productos[0]?.id ?? '',
      tipo: 'entrada',
      cantidad: '',
      almacen: almacenes[0]?.nombre ?? 'Almacen principal',
      almacenId: almacenes[0]?.id,
      ubicacionId: ubicaciones.find((item) => item.almacenId === almacenes[0]?.id)?.id,
      estadoStock: 'available',
      costoUnitario: '0',
      lote: '',
      fechaVencimiento: '',
      fechaOperacion: hoy(),
      motivo: '',
    },
  })
  const productoId = watch('productoId')
  const tipo = watch('tipo')
  const almacenId = watch('almacenId')
  const estadoStock = watch('estadoStock')
  const producto = useMemo(
    () => productos.find((item) => item.id === productoId),
    [productoId, productos],
  )
  const esSalida = movimientoEsSalida(tipo)
  const usarFefo = tipo === 'salida' && estadoStock === 'available'
  const { candidatos, cargando: cargandoFefo, error: errorFefo } =
    useCandidatosFefo(productoId, almacenId ?? '', usarFefo)
  const candidatoFefo = candidatos[0]
  const cantidadAsignableFefo = candidatos.reduce(
    (total, candidato) => total + candidato.cantidadAsignable,
    0,
  )

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
    const error = await alGuardar(datos)
    if (error) {
      setError(
        error.includes('vencimiento')
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
                La existencia se actualizará desde este movimiento y quedará en
                el historial de la sesión.
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
                  {...register('tipo')}
                >
                  {tiposMovimientoInventario.map((opcion) => (
                    <option key={opcion.valor} value={opcion.valor}>
                      {opcion.etiqueta}
                    </option>
                  ))}
                </select>
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
                <label htmlFor="producto-movimiento" className="field-label">
                  Producto *
                </label>
                <select
                  id="producto-movimiento"
                  className="field-control"
                  aria-invalid={Boolean(errors.productoId)}
                  {...register('productoId')}
                >
                  {productos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.codigo} · {item.descripcion}
                    </option>
                  ))}
                </select>
                {errors.productoId ? (
                  <p className="field-error">{errors.productoId.message}</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="cantidad-movimiento" className="field-label">
                  Cantidad *
                </label>
                <input
                  id="cantidad-movimiento"
                  inputMode="decimal"
                  max={usarFefo ? cantidadAsignableFefo : undefined}
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
                    {producto?.unidadMedida || 'Unidades'} · máximo 3 decimales
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="almacen-movimiento" className="field-label">
                  Almacén *
                </label>
                <input type="hidden" {...register('almacen')} />
                <select
                  id="almacen-movimiento"
                  className="field-control"
                  {...register('almacenId', {
                    onChange: (evento) => {
                      const seleccionado = almacenes.find((item) => item.id === evento.target.value)
                      setValue('almacen', seleccionado?.nombre ?? '')
                      setValue('ubicacionId', ubicaciones.find((item) => item.almacenId === evento.target.value && item.activa)?.id)
                    },
                  })}
                >
                  {almacenes.map((almacen) => (
                    <option key={almacen.id} value={almacen.id}>{almacen.codigo} · {almacen.nombre}</option>
                  ))}
                </select>
                {errors.almacen ? (
                  <p className="field-error">{errors.almacen.message}</p>
                ) : null}
              </div>

              {usarFefo ? <div>
                <label htmlFor="ubicacion-movimiento-fefo" className="field-label">Ubicación FEFO</label>
                <input type="hidden" {...register('ubicacionId')} />
                <input
                  id="ubicacion-movimiento-fefo"
                  className="field-control"
                  value={candidatoFefo ? `${candidatoFefo.ubicacionCodigo} · ${candidatoFefo.ubicacionNombre}` : ''}
                  placeholder={cargandoFefo ? 'Consultando...' : 'Sin stock asignable'}
                  readOnly
                />
              </div> : <div>
                <label htmlFor="ubicacion-movimiento" className="field-label">Ubicación física *</label>
                <select id="ubicacion-movimiento" className="field-control" {...register('ubicacionId')}>
                  {ubicaciones.filter((item) => item.almacenId === almacenId && item.activa).map((ubicacion) => (
                    <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.codigo} · {ubicacion.nombre}</option>
                  ))}
                </select>
              </div>}

              <div>
                <label htmlFor="estado-movimiento" className="field-label">Condición del stock *</label>
                <select id="estado-movimiento" className="field-control" {...register('estadoStock')}>
                  <option value="available">Disponible</option>
                  <option value="quarantine">Cuarentena</option>
                  <option value="damaged">Dañado / inmovilizado</option>
                </select>
              </div>

              {!esSalida ? <div>
                <label htmlFor="costo-movimiento" className="field-label">Costo unitario</label>
                <input id="costo-movimiento" type="number" min="0" step="0.0001" className="field-control" {...register('costoUnitario')} />
              </div> : null}

              <div>
                <label htmlFor="lote-movimiento" className="field-label">
                  Lote {producto?.controlLote ? '*' : ''}
                </label>
                <input
                  id="lote-movimiento"
                  autoComplete="off"
                  placeholder={producto?.controlLote ? 'Obligatorio' : 'Opcional'}
                  className="field-control"
                  aria-invalid={Boolean(errors.lote)}
                  readOnly={usarFefo}
                  {...register('lote')}
                />
                {errors.lote ? (
                  <p className="field-error">{errors.lote.message}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="vencimiento-movimiento" className="field-label">
                  Fecha de vencimiento {producto?.controlVencimiento ? '*' : ''}
                </label>
                <input
                  id="vencimiento-movimiento"
                  type="date"
                  className="field-control"
                  aria-invalid={Boolean(errors.fechaVencimiento)}
                  readOnly={usarFefo}
                  {...register('fechaVencimiento')}
                />
                {errors.fechaVencimiento ? (
                  <p className="field-error">{errors.fechaVencimiento.message}</p>
                ) : null}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="motivo-movimiento" className="field-label">
                  Motivo o referencia *
                </label>
                <textarea
                  id="motivo-movimiento"
                  rows={3}
                  placeholder="Ej. Recepción de compra, despacho o corrección de conteo"
                  className="field-control py-2"
                  aria-invalid={Boolean(errors.motivo)}
                  {...register('motivo')}
                />
                {errors.motivo ? (
                  <p className="field-error">{errors.motivo.message}</p>
                ) : null}
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
                    ? candidatoFefo
                      ? `FEFO iniciará por ${candidatoFefo.lote || 'stock sin lote'} · vence ${candidatoFefo.fechaVencimiento || 'sin fecha'} · ${cantidadAsignableFefo} asignables en ${candidatos.length} ${candidatos.length === 1 ? 'bucket' : 'buckets'}. Si hace falta, la salida se distribuirá automáticamente.`
                      : cargandoFefo
                        ? 'Consultando el primer lote asignable según FEFO...'
                        : errorFefo || 'No existe stock sanitario asignable en este almacén.'
                    : 'La salida se rechazará si supera la existencia disponible en el almacén y lote indicados.'
                  : 'La entrada incrementará la existencia del producto en el almacén indicado.'}
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
              disabled={isSubmitting || (usarFefo && (cargandoFefo || !candidatoFefo))}
            >
              Registrar movimiento
            </Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
