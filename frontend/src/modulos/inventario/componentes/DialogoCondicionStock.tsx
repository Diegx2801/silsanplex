import { useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { formatearFechaCalendarioPeru } from '@/lib/fechas'
import { useBucketsAjusteStock } from '../estado/useBucketsAjusteStock'
import {
  esquemaReclasificacion,
  etiquetasEstadoStock,
  type Almacen,
  type DatosReclasificacion,
  type EstadoStock,
  type UbicacionAlmacen,
} from '../modelo/almacen'
import { cantidadDisponibleAjusteStock, claveBucketAjusteStock } from '../modelo/inventario'
import type { ProductoInventarioOpcion } from '../modelo/productoInventarioRead'
import { prepararPosicionesTransferencia } from '../modelo/posicionesTransferencia'
import { listarAlmacenesAjusteStock } from '../servicios/inventarioService'
import { SelectorProductoInventario } from './SelectorProductoInventario'

interface Props {
  organizationId: string
  almacenes: readonly Almacen[]
  ubicaciones: readonly UbicacionAlmacen[]
  abierto: boolean
  alCambiarAbierto: (abierto: boolean) => void
  alRestaurarFoco?: () => void
  reclasificar: (datos: DatosReclasificacion, operationKey?: string) => Promise<string | undefined>
}

const formato = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 })
const condiciones = Object.entries(etiquetasEstadoStock) as [EstadoStock, string][]
interface Revision {
  datos: DatosReclasificacion
  operationKey: string
  producto: string
  posicion: string
  cantidad: string
  equivalencia: string
}

export function DialogoCondicionStock(props: Props) {
  return (
    <DialogPrimitive.Root open={props.abierto} onOpenChange={props.alCambiarAbierto}>
      {props.abierto ? <ContenidoCondicionStock {...props} /> : null}
    </DialogPrimitive.Root>
  )
}

function ContenidoCondicionStock({
  organizationId, almacenes, ubicaciones, alCambiarAbierto, alRestaurarFoco, reclasificar,
}: Props) {
  const queryClient = useQueryClient()
  const [producto, setProducto] = useState<ProductoInventarioOpcion | null>(null)
  const [almacen, setAlmacen] = useState<ComboboxOption | null>(null)
  const [posicionId, setPosicionId] = useState('')
  const [destino, setDestino] = useState<EstadoStock | ''>('')
  const [cantidad, setCantidad] = useState('')
  const [unidadId, setUnidadId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [revision, setRevision] = useState<Revision | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [errorGuardado, setErrorGuardado] = useState('')
  const [guardando, setGuardando] = useState(false)
  const bloqueo = useRef(false)
  const ultimoIntento = useRef<{ firma: string; operationKey: string } | null>(null)
  const { buckets, consultando, error: errorBuckets } = useBucketsAjusteStock(
    producto?.id ?? '', almacen?.value ?? '', organizationId,
  )
  const { posiciones, clavesInconsistentes } = useMemo(() => prepararPosicionesTransferencia(
    buckets.filter((item) => item.productoId === producto?.id && item.almacenId === almacen?.value
      && item.cantidadFisica > 0 && ubicaciones.some((u) => u.id === item.ubicacionId && u.activa
        && u.almacenId === item.almacenId)),
    producto?.unidadMedida ?? '',
  ), [buckets, producto?.id, producto?.unidadMedida, almacen?.value, ubicaciones])
  const elegibles = posiciones.filter((item) => cantidadDisponibleAjusteStock(item) > 0)
  const posicion = elegibles.find((item) => claveBucketAjusteStock(item) === posicionId)
  const unidad = producto?.unidadesEntrada?.find((item) => item.id === unidadId)
  const factor = unidad?.factorConversion ?? 1
  const unidadBase = producto?.unidadMedida || 'unidades'
  const unidadNombre = unidad?.nombre || unidadBase
  const cantidadBase = Number(cantidad) * factor
  const maximo = posicion ? cantidadDisponibleAjusteStock(posicion) : 0
  const descripcion = (item: (typeof posiciones)[number]) => [
    `${item.ubicacionCodigo} · ${item.ubicacionNombre}`,
    item.lote ? `Lote ${item.lote}` : 'Sin lote',
    item.fechaVencimiento ? `Vence ${formatearFechaCalendarioPeru(item.fechaVencimiento)}` : 'Sin vencimiento',
    etiquetasEstadoStock[item.estadoStock],
  ].join(' · ')
  const cargarAlmacenes = useCallback(async (busqueda: string) => {
    if (!producto) return []
    const respuesta = await queryClient.fetchQuery({
      queryKey: ['inventory-adjustment-warehouses', organizationId, producto.id, busqueda],
      queryFn: () => listarAlmacenesAjusteStock(organizationId, producto.id, busqueda),
      staleTime: 5_000,
    })
    return respuesta.items.map((item): ComboboxOption => ({
      value: item.id, label: `${item.codigo} · ${item.nombre}`,
    }))
  }, [organizationId, producto, queryClient])

  const revisar = (evento: FormEvent) => {
    evento.preventDefault()
    setErrorGuardado('')
    const resultado = esquemaReclasificacion.safeParse({
      productoId: producto?.id ?? '', almacenId: almacen?.value ?? '',
      ubicacionId: posicion?.ubicacionId ?? '', estadoOrigen: posicion?.estadoStock ?? 'available',
      estadoDestino: destino || undefined, cantidad, unidadEntradaId: unidadId || undefined,
      factorConversionEsperado: factor, lote: posicion?.lote ?? '',
      fechaVencimiento: posicion?.fechaVencimiento ?? '', motivo,
    })
    const siguientes: Record<string, string> = {}
    if (!resultado.success) for (const issue of resultado.error.issues) {
      const campo = String(issue.path[0])
      siguientes[campo] ??= campo === 'estadoDestino' ? 'Selecciona una condición diferente de la actual.' : issue.message
    }
    if (!posicion || consultando || errorBuckets)
      siguientes.ubicacionId = 'Selecciona una posición con stock no reservado y espera a que termine la consulta.'
    if (!almacenes.some((item) => item.id === almacen?.value && item.activo))
      siguientes.almacenId = 'Selecciona un almacén activo con stock.'
    if (producto?.unidadesEntrada?.length && !unidad)
      siguientes.unidadEntradaId = 'Selecciona una unidad de medida del producto.'
    if (Number.isFinite(cantidadBase) && cantidadBase > maximo + 0.0000001)
      siguientes.cantidad = `Puedes cambiar hasta ${formato.format(maximo / factor)} ${unidadNombre} (${formato.format(maximo)} ${unidadBase} no reservadas).`
    if (Number.isFinite(cantidadBase) && Math.abs(cantidadBase * 1000 - Math.round(cantidadBase * 1000)) > 0.0000001)
      siguientes.cantidad = 'La equivalencia debe tener como máximo 3 decimales en la unidad base.'
    setErrores(siguientes)
    if (!resultado.success || Object.keys(siguientes).length || !posicion || !producto) return
    const firma = JSON.stringify(resultado.data)
    if (ultimoIntento.current?.firma !== firma)
      ultimoIntento.current = { firma, operationKey: crypto.randomUUID() }
    setRevision({
      datos: resultado.data, operationKey: ultimoIntento.current.operationKey,
      producto: producto.descripcion, posicion: `${almacen?.label} · ${descripcion(posicion)}`,
      cantidad: `${formato.format(Number(cantidad))} ${unidadNombre}`,
      equivalencia: factor !== 1 ? `Equivale a ${formato.format(cantidadBase)} ${unidadBase}` : '',
    })
  }
  const confirmar = async () => {
    if (!revision || bloqueo.current) return
    bloqueo.current = true
    setGuardando(true)
    setErrorGuardado('')
    try {
      const error = await reclasificar(revision.datos, revision.operationKey)
      if (error) setErrorGuardado(error)
      else alCambiarAbierto(false)
    } catch {
      setErrorGuardado('No se pudo confirmar el cambio. Reintenta; no se duplicará la operación.')
    } finally {
      bloqueo.current = false
      setGuardando(false)
    }
  }
  const mensajeError = (campo: string) => errores[campo]
    ? <p id={`condicion-${campo}-error`} className="field-error">{errores[campo]}</p> : null
  const ariaCampo = (campo: string) => ({
    'aria-invalid': Boolean(errores[campo]),
    'aria-describedby': errores[campo] ? `condicion-${campo}-error` : undefined,
  })

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
      <DialogPrimitive.Content
        className="fixed start-1/2 top-1/2 z-50 flex max-h-[92svh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col border bg-background shadow-xl outline-none"
        onEscapeKeyDown={(event) => { if (guardando) event.preventDefault() }}
        onPointerDownOutside={(event) => { if (guardando) event.preventDefault() }}
        onCloseAutoFocus={alRestaurarFoco ? (event) => { event.preventDefault(); alRestaurarFoco() } : undefined}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
          <div>
            <DialogPrimitive.Title className="text-xl font-semibold tracking-[-0.025em]">Cambiar condición del stock</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">
              Separa o libera existencias sin aumentar ni disminuir el stock físico. El cambio quedará en el Kardex.
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close asChild>
            <button type="button" disabled={guardando} aria-label="Cerrar cambio de condición" className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
              <X aria-hidden="true" className="size-5" />
            </button>
          </DialogPrimitive.Close>
        </header>
        {revision ? (
          <section className="space-y-5 overflow-y-auto px-5 py-6 sm:px-7" aria-label="Revisión del cambio de condición">
            <p className="text-sm leading-6">Pasarán <strong>{revision.cantidad}</strong> de <strong>{etiquetasEstadoStock[revision.datos.estadoOrigen]}</strong> a <strong>{etiquetasEstadoStock[revision.datos.estadoDestino]}</strong>.</p>
            <dl className="space-y-4 border-y py-4 text-sm">
              <div><dt className="text-muted-foreground">Producto y posición</dt><dd className="mt-1 break-words font-medium">{revision.producto} · {revision.posicion}</dd></div>
              {revision.equivalencia ? <div><dt className="text-muted-foreground">Equivalencia</dt><dd>{revision.equivalencia}</dd></div> : null}
              <div><dt className="text-muted-foreground">Motivo</dt><dd className="mt-1 break-words">{revision.datos.motivo}</dd></div>
            </dl>
            <p className="text-sm text-muted-foreground">Se conservarán el lote, vencimiento, ubicación y costo. Las unidades reservadas no se modificarán.</p>
            {errorGuardado ? <p role="alert" className="field-error">{errorGuardado}</p> : null}
          </section>
        ) : (
          <form id="formulario-condicion-stock" onSubmit={revisar} noValidate className="space-y-5 overflow-y-auto px-5 py-6 sm:px-7">
            <SelectorProductoInventario id="condicion-producto" name="producto-condicion-stock" etiqueta="Producto" organizationId={organizationId} value={producto?.id ?? ''} selectedOption={producto} autoSeleccionarPrimeraOpcion={false} error={errores.productoId} onValueChange={(_, opcion) => {
              setProducto(opcion ?? null); setAlmacen(null); setPosicionId(''); setDestino(''); setCantidad(''); setUnidadId(opcion?.unidadBaseId ?? ''); setErrores({})
            }} />
            <Combobox id="condicion-almacen" label="Almacén" value={almacen?.value ?? ''} options={almacen ? [almacen] : []} loadOptions={cargarAlmacenes} minSearchLength={0} required disabled={!producto} error={errores.almacenId} placeholder={producto ? 'Buscar almacén con stock' : 'Selecciona primero un producto'} helperText="Solo aparecen almacenes con existencias no reservadas de este producto." onChange={(_, opcion) => { setAlmacen(opcion ?? null); setPosicionId(''); setDestino(''); setErrores({}) }} />
            <Combobox id="condicion-posicion" label="Ubicación y lote" value={posicionId} options={elegibles.map((item) => ({ value: claveBucketAjusteStock(item), label: descripcion(item) }))} required disabled={!almacen || consultando || Boolean(errorBuckets)} error={errores.ubicacionId || errorBuckets} placeholder={!almacen ? 'Selecciona primero un almacén' : consultando ? 'Consultando existencias…' : 'Selecciona la posición exacta'} noOptionsMessage="No hay existencias no reservadas para cambiar de condición." onChange={(valor) => { setPosicionId(valor); setDestino(''); setErrores({}) }} />
            {errorBuckets ? <Button type="button" variant="outline" disabled={consultando} onClick={() => void queryClient.invalidateQueries({ queryKey: ['inventory-adjustment-buckets', organizationId, producto?.id ?? '', almacen?.value ?? ''], exact: true })}>Reintentar consulta de stock</Button> : null}
            {clavesInconsistentes.size ? <p role="alert" className="text-sm text-destructive">Hay posiciones con unidades históricas incompatibles. Se excluyeron para evitar una conversión incorrecta.</p> : null}
            {posicion ? <div className="border-y py-4 text-sm" aria-label="Existencias de la posición">
              <p>Condición actual: <strong>{etiquetasEstadoStock[posicion.estadoStock]}</strong></p>
              <p className="mt-1">Máximo no reservado: <strong>{formato.format(maximo)} {unidadBase}</strong>{factor !== 1 ? ` (${formato.format(maximo / factor)} ${unidadNombre})` : ''}.</p>
              <p className="mt-1 text-muted-foreground">Stock físico: {formato.format(posicion.cantidadFisica)} {unidadBase} · Reservado: {formato.format(posicion.cantidadReservada)} {unidadBase}</p>
            </div> : null}
            <div className="grid gap-5 sm:grid-cols-2">
              <div><label htmlFor="condicion-cantidad" className="field-label">Cantidad a cambiar *</label><input id="condicion-cantidad" className="field-control" type="number" min="0.001" step="0.001" value={cantidad} onChange={(e) => setCantidad(e.target.value)} {...ariaCampo('cantidad')} />{mensajeError('cantidad')}</div>
              <div><label htmlFor="condicion-unidad" className="field-label">Unidad de medida *</label><select id="condicion-unidad" className="field-control" value={unidadId} disabled={!producto} onChange={(e) => setUnidadId(e.target.value)} aria-describedby={errores.unidadEntradaId ? 'condicion-unidadEntradaId-error' : 'condicion-equivalencia'} aria-invalid={Boolean(errores.unidadEntradaId)}>
                {producto?.unidadesEntrada?.length ? producto.unidadesEntrada.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>) : <option value="">{unidadBase}</option>}
              </select>{mensajeError('unidadEntradaId')}<p id="condicion-equivalencia" className="field-help">{factor !== 1 ? `1 ${unidadNombre} equivale a ${formato.format(factor)} ${unidadBase}.` : `Cantidad expresada en ${unidadBase}.`}</p></div>
            </div>
            <div><label htmlFor="condicion-destino" className="field-label">Nueva condición *</label><select id="condicion-destino" className="field-control" disabled={!posicion} value={destino} onChange={(e) => setDestino(e.target.value as EstadoStock | '')} {...ariaCampo('estadoDestino')}>
              <option value="">Selecciona una condición</option>{condiciones.filter(([valor]) => valor !== posicion?.estadoStock).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
            </select>{mensajeError('estadoDestino')}</div>
            <div><label htmlFor="condicion-motivo" className="field-label">Motivo *</label><input id="condicion-motivo" className="field-control" value={motivo} maxLength={180} placeholder="Ej. Inspección pendiente o liberación autorizada" onChange={(e) => setMotivo(e.target.value)} {...ariaCampo('motivo')} />{mensajeError('motivo')}</div>
            {Object.keys(errores).length ? <p role="alert" className="field-error">Revisa los campos indicados antes de continuar.</p> : null}
          </form>
        )}
        <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t px-5 py-4 sm:px-7">
          {revision ? <><Button type="button" variant="outline" disabled={guardando} onClick={() => { setRevision(null); setErrorGuardado('') }}>Volver</Button><Button type="button" disabled={guardando} onClick={() => void confirmar()}>{guardando ? 'Confirmando…' : 'Confirmar cambio'}</Button></> : <><DialogPrimitive.Close asChild><Button variant="outline" type="button">Cancelar</Button></DialogPrimitive.Close><Button type="submit" form="formulario-condicion-stock">Revisar cambio</Button></>}
        </footer>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
