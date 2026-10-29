import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { useBucketsAjusteStock } from '../estado/useBucketsAjusteStock'
import {
  esquemaTransferencia,
  etiquetasEstadoStock,
  type Almacen,
  type UbicacionAlmacen,
  type DatosTransferencia,
} from '../modelo/almacen'
import {
  cantidadDisponibleAjusteStock,
  claveBucketAjusteStock,
} from '../modelo/inventario'
import type { ProductoInventarioOpcion } from '../modelo/productoInventarioRead'
import { prepararPosicionesTransferencia } from '../modelo/posicionesTransferencia'
import { listarAlmacenesAjusteStock } from '../servicios/inventarioService'
import { SelectorProductoInventario } from './SelectorProductoInventario'

interface Props {
  organizationId: string
  almacenes: Almacen[]
  ubicaciones: UbicacionAlmacen[]
  transferir: (
    datos: DatosTransferencia,
    operationKey?: string,
  ) => Promise<string | undefined>
}

const cantidadFormato = new Intl.NumberFormat('es-PE', {
  maximumFractionDigits: 3,
})
const opcionAlmacen = (almacen: Almacen): ComboboxOption => ({
  value: almacen.id,
  label: `${almacen.codigo} · ${almacen.nombre}`,
})
interface Revision {
  datos: DatosTransferencia
  operationKey: string
  producto: string
  origen: string
  posicion: string
  destino: string
  cantidad: string
  equivalencia: string
}

export function FormularioTransferencia({
  organizationId,
  almacenes,
  ubicaciones,
  transferir,
}: Props) {
  const queryClient = useQueryClient()
  const [producto, setProducto] = useState<ProductoInventarioOpcion | null>(
    null,
  )
  const [origen, setOrigen] = useState<ComboboxOption | null>(null)
  const [bucketKey, setBucketKey] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [ubicacionDestinoId, setUbicacionDestinoId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [unidadId, setUnidadId] = useState('')
  const [revision, setRevision] = useState<Revision | null>(null)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [guardando, setGuardando] = useState(false)
  const bloqueo = useRef(false)
  const ultimoIntento = useRef<{ firma: string; operationKey: string } | null>(
    null,
  )
  const {
    buckets,
    consultando,
    error: errorBuckets,
  } = useBucketsAjusteStock(
    producto?.id ?? '',
    origen?.value ?? '',
    organizationId,
  )
  const activos = almacenes.filter((almacen) => almacen.activo)
  const opcionesOrigen = origen ? [origen] : []
  const opcionesDestino = activos.map(opcionAlmacen)
  const posicionesOrigen = useMemo(
    () =>
      buckets.filter(
        (bucket) =>
          bucket.productoId === producto?.id &&
          bucket.almacenId === origen?.value &&
          bucket.cantidadFisica > 0 &&
          ubicaciones.some(
            (u) =>
              u.id === bucket.ubicacionId &&
              u.almacenId === bucket.almacenId &&
              u.activa,
          ),
      ),
    [buckets, origen?.value, producto?.id, ubicaciones],
  )
  const { posiciones: posicionesCompatibles, clavesInconsistentes } =
    prepararPosicionesTransferencia(
      posicionesOrigen,
      producto?.unidadMedida ?? '',
    )
  const posiciones = posicionesCompatibles.filter(
    (item) => cantidadDisponibleAjusteStock(item) > 0,
  )
  const bucket = posiciones.find(
    (item) => claveBucketAjusteStock(item) === bucketKey,
  )
  const descripcionPosicion = (item: (typeof posiciones)[number]) =>
    [
      `${item.ubicacionCodigo} · ${item.ubicacionNombre}`,
      item.lote ? `Lote ${item.lote}` : 'Sin lote',
      item.fechaVencimiento
        ? `Vence ${item.fechaVencimiento}`
        : 'Sin vencimiento',
      etiquetasEstadoStock[item.estadoStock],
    ].join(' · ')
  const destinos = ubicaciones.filter(
    (item) =>
      item.activa &&
      item.almacenId === destinoId &&
      !(destinoId === origen?.value && item.id === bucket?.ubicacionId),
  )
  const unidad = producto?.unidadesEntrada?.find((item) => item.id === unidadId)
  const factor = unidad?.factorConversion ?? 1
  const unidadBase = producto?.unidadMedida || 'unidades'
  const unidadNombre = unidad?.nombre || unidadBase
  const cantidadBase = Number(cantidad) * factor
  const cantidadDisponible = bucket ? cantidadDisponibleAjusteStock(bucket) : 0

  const cargarOrigenes = useCallback(
    async (busqueda: string) => {
      if (!producto) return []
      const respuesta = await queryClient.fetchQuery({
        queryKey: [
          'inventory-adjustment-warehouses',
          organizationId,
          producto.id,
          busqueda,
        ],
        queryFn: () =>
          listarAlmacenesAjusteStock(organizationId, producto.id, busqueda),
        staleTime: 5_000,
      })
      return respuesta.items.map((item): ComboboxOption => ({
        value: item.id,
        label: `${item.codigo} · ${item.nombre}`,
      }))
    },
    [organizationId, producto, queryClient],
  )

  const revisar = (evento: FormEvent) => {
    evento.preventDefault()
    setError('')
    setExito('')
    const resultado = esquemaTransferencia.safeParse({
      productoId: producto?.id ?? '',
      almacenOrigenId: origen?.value ?? '',
      ubicacionOrigenId: bucket?.ubicacionId ?? '',
      almacenDestinoId: destinoId,
      ubicacionDestinoId,
      cantidad,
      unidadEntradaId: unidadId || undefined,
      factorConversionEsperado: factor,
      lote: bucket?.lote ?? '',
      fechaVencimiento: bucket?.fechaVencimiento ?? '',
      estado: bucket?.estadoStock ?? 'available',
    })
    if (!resultado.success) {
      setError(
        resultado.error.issues[0]?.message ??
          'Revisa los datos de la transferencia.',
      )
      return
    }
    if (consultando || errorBuckets || !bucket) {
      setError(
        'Espera a que se actualice el stock y selecciona una posición de origen.',
      )
      return
    }
    if (
      !destinos.some((item) => item.id === ubicacionDestinoId) ||
      !activos.some((item) => item.id === destinoId)
    ) {
      setError(
        'Selecciona un almacén y una ubicación de destino activos, diferentes del origen.',
      )
      return
    }
    if (
      !Number.isFinite(cantidadBase) ||
      cantidadBase > cantidadDisponible + 0.0000001
    ) {
      setError(
        `Stock insuficiente: puedes transferir hasta ${cantidadFormato.format(cantidadDisponible)} ${unidadBase}.`,
      )
      return
    }
    if (
      Math.abs(cantidadBase * 1000 - Math.round(cantidadBase * 1000)) >
      0.0000001
    ) {
      setError(
        'La equivalencia debe tener como máximo 3 decimales en la unidad base.',
      )
      return
    }
    const firma = JSON.stringify(resultado.data)
    if (ultimoIntento.current?.firma !== firma)
      ultimoIntento.current = { firma, operationKey: crypto.randomUUID() }
    setRevision({
      datos: resultado.data,
      operationKey: ultimoIntento.current.operationKey,
      producto: `${producto?.codigo} · ${producto?.descripcion}`,
      origen: origen?.label ?? '',
      posicion: descripcionPosicion(bucket),
      destino: `${activos.find((item) => item.id === destinoId)?.nombre} · ${destinos.find((item) => item.id === ubicacionDestinoId)?.codigo} · ${destinos.find((item) => item.id === ubicacionDestinoId)?.nombre}`,
      cantidad: `${cantidadFormato.format(Number(cantidad))} ${unidadNombre}`,
      equivalencia:
        factor !== 1
          ? `Equivale a ${cantidadFormato.format(cantidadBase)} ${unidadBase}`
          : '',
    })
  }

  const confirmar = async () => {
    if (!revision || bloqueo.current) return
    bloqueo.current = true
    setGuardando(true)
    setError('')
    try {
      const fallo = await transferir(revision.datos, revision.operationKey)
      if (fallo) {
        setError(fallo)
        return
      }
      setExito(
        'Transferencia registrada. La salida y la entrada están disponibles en el Kardex y el historial.',
      )
      setRevision(null)
      setCantidad('')
      setBucketKey('')
      ultimoIntento.current = null
    } catch {
      setError(
        'No se pudo confirmar el resultado. Puedes reintentar esta misma transferencia sin duplicarla.',
      )
    } finally {
      bloqueo.current = false
      setGuardando(false)
    }
  }

  return (
    <section
      className="ledger-sheet p-5 sm:p-6"
      aria-labelledby="transferir-stock-title"
    >
      <h2
        id="transferir-stock-title"
        className="flex items-center gap-2 text-lg font-semibold"
      >
        <ArrowLeftRight className="size-5 text-primary" aria-hidden="true" />
        Transferir stock
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Mueve stock entre almacenes o entre ubicaciones del mismo almacén, sin
        cambiar el total del inventario.
      </p>
      {exito ? (
        <p role="status" className="mt-4 text-sm text-primary">
          {exito}
        </p>
      ) : null}
      {revision ? (
        <div className="mt-5 space-y-5">
          <h3
            tabIndex={-1}
            ref={(nodo) => nodo?.focus()}
            className="font-semibold outline-none"
          >
            Revisar transferencia
          </h3>
          <dl className="grid gap-4 border bg-muted/20 p-4 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Producto</dt>
              <dd className="mt-1 font-medium">{revision.producto}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Origen</dt>
              <dd className="mt-1">
                {revision.origen}
                <p className="mt-1 text-xs text-muted-foreground">
                  {revision.posicion}
                </p>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Destino</dt>
              <dd className="mt-1">{revision.destino}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cantidad a transferir</dt>
              <dd className="mt-1 font-medium">
                {revision.cantidad}
                {revision.equivalencia ? (
                  <p className="mt-1 text-xs font-normal text-muted-foreground">
                    {revision.equivalencia}
                  </p>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Operación</dt>
              <dd className="mt-1">
                {revision.datos.almacenOrigenId ===
                revision.datos.almacenDestinoId
                  ? 'Reubicación dentro del mismo almacén'
                  : 'Transferencia entre almacenes'}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            Se conservarán el lote, el vencimiento, la condición y el costo del
            stock de origen. El sistema asignará el número de transferencia.
          </p>
          {error ? (
            <p role="alert" className="field-error">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={guardando}
              onClick={() => {
                setRevision(null)
                setError('')
              }}
            >
              Volver
            </Button>
            <Button
              type="button"
              disabled={guardando}
              onClick={() => void confirmar()}
            >
              {guardando ? 'Transfiriendo…' : 'Confirmar transferencia'}
            </Button>
          </div>
        </div>
      ) : (
        <form className="mt-5" onSubmit={revisar} noValidate>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <SelectorProductoInventario
                id="transferencia-producto"
                name="productoId"
                etiqueta="Producto"
                organizationId={organizationId}
                autoSeleccionarPrimeraOpcion={false}
                value={producto?.id ?? ''}
                selectedOption={producto}
                onValueChange={(_, opcion) => {
                  setProducto(opcion ?? null)
                  setOrigen(null)
                  setBucketKey('')
                  setDestinoId('')
                  setUbicacionDestinoId('')
                  setCantidad('')
                  setUnidadId(opcion?.unidadBaseId ?? '')
                  setError('')
                  setExito('')
                }}
              />
            </div>
            <Combobox
              key={`origen-${producto?.id ?? ''}`}
              id="transferencia-origen"
              label="Almacén de origen"
              value={origen?.value ?? ''}
              options={opcionesOrigen}
              loadOptions={cargarOrigenes}
              minSearchLength={0}
              required
              disabled={!producto}
              placeholder={
                producto
                  ? 'Buscar almacén con stock'
                  : 'Selecciona primero un producto'
              }
              helperText="Solo almacenes con stock no reservado de este producto."
              onChange={(_, opcion) => {
                setOrigen(opcion ?? null)
                setBucketKey('')
                setUbicacionDestinoId('')
                setError('')
              }}
            />
            <Combobox
              id="transferencia-posicion"
              label="Ubicación y lote de origen"
              value={bucketKey}
              required
              disabled={!origen || consultando}
              options={posiciones.map((item) => ({
                value: claveBucketAjusteStock(item),
                label: descripcionPosicion(item),
                secondaryText: `${cantidadFormato.format(cantidadDisponibleAjusteStock(item))} ${item.unidadMedida} no reservados`,
                keywords: [item.ubicacionNombre, item.lote],
              }))}
              onChange={(valor) => {
                setBucketKey(valor)
                setUbicacionDestinoId('')
                setError('')
              }}
              placeholder={
                consultando
                  ? 'Consultando stock…'
                  : 'Selecciona el stock que vas a mover'
              }
              error={errorBuckets || undefined}
              noOptionsMessage="No hay stock no reservado en ubicaciones activas."
            />
            {clavesInconsistentes.size > 0 ? (
              <p
                role="alert"
                className="text-sm text-muted-foreground sm:col-span-2"
              >
                Hay posiciones con stock en una unidad base anterior. No se
                pueden transferir hasta conciliar sus saldos; no se convertirán
                automáticamente.
              </p>
            ) : null}
            <Combobox
              id="transferencia-destino"
              label="Almacén de destino"
              required
              value={destinoId}
              options={opcionesDestino}
              disabled={!bucket}
              onChange={(valor) => {
                setDestinoId(valor)
                setUbicacionDestinoId('')
                setError('')
              }}
              placeholder="Buscar por código o nombre"
              helperText="Puede ser el mismo almacén si eliges otra ubicación."
            />
            <Combobox
              id="transferencia-ubicacion-destino"
              label="Ubicación de destino"
              required
              value={ubicacionDestinoId}
              options={destinos.map((item) => ({
                value: item.id,
                label: `${item.codigo} · ${item.nombre}`,
              }))}
              disabled={!bucket || !destinoId}
              onChange={(valor) => {
                setUbicacionDestinoId(valor)
                setError('')
              }}
              placeholder="Selecciona una ubicación"
              noOptionsMessage="No hay otra ubicación activa en este almacén."
            />
            <div>
              <label className="field-label" htmlFor="transferencia-cantidad">
                Cantidad a transferir *
              </label>
              <input
                id="transferencia-cantidad"
                className="field-control"
                inputMode="decimal"
                value={cantidad}
                onChange={(e) => {
                  setCantidad(e.target.value)
                  setError('')
                }}
                disabled={!bucket}
                aria-describedby="transferencia-cantidad-ayuda"
              />
              <p id="transferencia-cantidad-ayuda" className="field-help">
                {unidadNombre} · máximo 3 decimales
              </p>
            </div>
            {(producto?.unidadesEntrada?.length ?? 0) > 1 ? (
              <div>
                <label className="field-label" htmlFor="transferencia-unidad">
                  Unidad de medida *
                </label>
                <select
                  id="transferencia-unidad"
                  className="field-control"
                  value={unidadId}
                  onChange={(e) => {
                    setUnidadId(e.target.value)
                    setError('')
                  }}
                >
                  {producto?.unidadesEntrada?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
                {factor !== 1 ? (
                  <p className="field-help">
                    1 {unidadNombre} equivale a {cantidadFormato.format(factor)}{' '}
                    {unidadBase}.
                  </p>
                ) : null}
              </div>
            ) : null}
            {bucket ? (
              <div className="border bg-muted/20 p-4 text-sm sm:col-span-2">
                <p>
                  Stock no reservado:{' '}
                  <span className="font-medium">
                    {cantidadFormato.format(cantidadDisponible)} {unidadBase}
                  </span>
                </p>
                {cantidadBase > 0 && factor !== 1 ? (
                  <p className="mt-1 text-muted-foreground">
                    Se moverán {cantidadFormato.format(cantidadBase)}{' '}
                    {unidadBase} ({cantidadFormato.format(Number(cantidad))}{' '}
                    {unidadNombre}).
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  Se trasladará únicamente la ubicación y el lote seleccionados.
                </p>
              </div>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="field-error mt-4">
              {error}
            </p>
          ) : null}
          <Button className="mt-5" type="submit" disabled={consultando}>
            Revisar transferencia
          </Button>
        </form>
      )}
    </section>
  )
}
