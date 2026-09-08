import { PackageCheck, Plus, Trash2 } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { Compra, DatosRecepcionCompra, LineaRecepcionCompra } from '@/modulos/compras/modelo/compras'
import type { UbicacionAlmacen } from '@/modulos/inventario/modelo/almacen'

interface FilaRecepcion extends LineaRecepcionCompra { id: string }
interface Props {
  abierto: boolean
  compra: Compra
  ubicaciones: readonly UbicacionAlmacen[]
  alCambiarApertura: (abierto: boolean) => void
  alConfirmar: (datos: DatosRecepcionCompra) => Promise<string | undefined>
  alRestaurarFoco: () => void
}

export function DialogoConfirmacionRecepcion({ abierto, compra, ubicaciones, alCambiarApertura, alConfirmar, alRestaurarFoco }: Props) {
  const ubicacionesDestino = useMemo(
    () => ubicaciones.filter((ubicacion) => ubicacion.almacenId === compra.almacenId && ubicacion.activa),
    [compra.almacenId, ubicaciones],
  )
  const [operationKey] = useState(() => crypto.randomUUID())
  const [observacion, setObservacion] = useState('')
  const [filas, setFilas] = useState<FilaRecepcion[]>(() => compra.lineas
    .filter((linea) => linea.cantidadPendiente > 0)
    .map((linea) => ({
      id: crypto.randomUUID(), purchaseOrderItemId: linea.id,
      cantidad: String(linea.cantidadPendiente),
      fulfillmentMode: linea.tipoProducto === 'service' ? 'administrative' : 'physical',
      ubicacionId: linea.tipoProducto === 'service' ? '' : ubicacionesDestino[0]?.id ?? '',
      lote: linea.tipoProducto === 'service' ? '' : linea.lote,
      fechaVencimiento: linea.tipoProducto === 'service' ? '' : linea.fechaVencimiento,
    })))
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')

  const actualizar = (id: string, cambio: Partial<FilaRecepcion>) =>
    setFilas((actuales) => actuales.map((fila) => fila.id === id ? { ...fila, ...cambio } : fila))

  const agregarPartida = (purchaseOrderItemId: string) => {
    const linea = compra.lineas.find((item) => item.id === purchaseOrderItemId)!
    setFilas((actuales) => [...actuales, {
      id: crypto.randomUUID(), purchaseOrderItemId, cantidad: '',
      fulfillmentMode: linea.tipoProducto === 'service' ? 'administrative' : 'physical',
      ubicacionId: linea.tipoProducto === 'service' ? '' : ubicacionesDestino[0]?.id ?? '',
      lote: linea.tipoProducto === 'service' ? '' : linea.lote,
      fechaVencimiento: linea.tipoProducto === 'service' ? '' : linea.fechaVencimiento,
    }])
  }

  const confirmar = async () => {
    setError('')
    const cantidades = new Map<string, number>()
    for (const fila of filas) {
      const cantidad = Number(fila.cantidad)
      const linea = compra.lineas.find((item) => item.id === fila.purchaseOrderItemId)!
      const esServicio = linea.tipoProducto === 'service'
      if (!Number.isFinite(cantidad) || cantidad <= 0 || (!esServicio && !fila.ubicacionId)) {
        setError(esServicio ? 'Completa una cantidad válida en todas las atenciones.' : 'Completa cantidad y ubicación en todas las partidas.')
        return
      }
      if (!linea.tipoProducto) {
        setError(`Regulariza el tipo de producto de ${linea.productoDescripcion} antes de recibirla.`)
        return
      }
      if (linea.controlVencimiento === null) {
        setError(`Regulariza el control de vencimiento de ${linea.productoDescripcion} antes de recibirla.`)
        return
      }
      if (linea.controlLote && !fila.lote.trim()) {
        setError(`Ingresa el lote de ${linea.productoDescripcion}.`)
        return
      }
      if (linea.controlVencimiento && !fila.fechaVencimiento) {
        setError(`Ingresa el vencimiento de ${linea.productoDescripcion}.`)
        return
      }
      cantidades.set(linea.id, (cantidades.get(linea.id) ?? 0) + cantidad)
    }
    const excedida = compra.lineas.find((linea) => (cantidades.get(linea.id) ?? 0) > linea.cantidadPendiente)
    if (excedida) {
      setError(`La recepción supera el saldo pendiente de ${excedida.productoDescripcion}.`)
      return
    }
    setProcesando(true)
    const resultado = await alConfirmar({
      operationKey, observacion,
      lineas: filas.map(({ id: _id, ...fila }) => fila),
    })
    setProcesando(false)
    if (resultado) return setError(resultado)
    alCambiarApertura(false)
  }

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-60 bg-foreground/30" />
        <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-70 max-h-[90vh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-background p-5 shadow-xl outline-none sm:p-6" onCloseAutoFocus={(evento) => { evento.preventDefault(); alRestaurarFoco() }}>
          <div className="grid size-10 place-items-center rounded-full bg-accent text-primary"><PackageCheck aria-hidden="true" className="size-5" /></div>
          <DialogPrimitive.Title className="mt-4 text-xl font-semibold">Registrar recepción</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">Confirma solo lo recibido. Los bienes entran a inventario; los servicios se marcan atendidos sin generar stock.</DialogPrimitive.Description>
          <div className="mt-5 space-y-5">
            {compra.lineas.filter((linea) => linea.cantidadPendiente > 0).map((linea) => (
              <section key={linea.id} className="border p-4">
                {linea.productoActivo === false ? (
                  <p className="mb-3 border-s-4 border-amber-500 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
                    Producto actualmente inactivo. La recepción usa el snapshot de la orden emitida.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="font-medium">{linea.productoDescripcion}</h3><p className="mt-1 font-mono text-xs text-muted-foreground">{linea.productoCodigo} · {linea.tipoProducto === 'service' ? 'Servicio' : linea.tipoProducto === 'good' ? 'Producto físico' : 'Tipo no regularizado'} · pendiente {linea.cantidadPendiente}</p></div>
                  <Button type="button" variant="outline" size="sm" onClick={() => agregarPartida(linea.id)}><Plus /> {linea.tipoProducto === 'service' ? 'Dividir atención' : 'Dividir lote'}</Button>
                </div>
                <div className="mt-4 space-y-3">
                  {filas.filter((fila) => fila.purchaseOrderItemId === linea.id).map((fila, indice, partidas) => (
                    <div key={fila.id} className={`grid gap-3 border-t pt-3 ${linea.tipoProducto === 'service' ? 'md:grid-cols-[8rem_auto]' : 'md:grid-cols-[8rem_1fr_1fr_10rem_auto]'}`}>
                      <label><span className="field-label">Cantidad</span><input className="field-control" type="number" min="0.001" step="0.001" value={fila.cantidad} onChange={(e) => actualizar(fila.id, { cantidad: e.target.value })} /></label>
                      {linea.tipoProducto === 'service' ? <p className="self-end pb-2 text-sm text-muted-foreground">Atención administrativa · sin inventario</p> : <>
                        <label><span className="field-label">Ubicación</span><select className="field-control" value={fila.ubicacionId} onChange={(e) => actualizar(fila.id, { ubicacionId: e.target.value })}><option value="">Selecciona</option>{ubicacionesDestino.map((u) => <option key={u.id} value={u.id}>{u.codigo} · {u.nombre}</option>)}</select></label>
                        <label><span className="field-label">Lote{linea.controlLote ? ' *' : ''}</span><input className="field-control" maxLength={60} value={fila.lote} onChange={(e) => actualizar(fila.id, { lote: e.target.value })} /></label>
                        <label><span className="field-label">Vencimiento{linea.controlVencimiento ? ' *' : ''}</span><input className="field-control" type="date" value={fila.fechaVencimiento} onChange={(e) => actualizar(fila.id, { fechaVencimiento: e.target.value })} /></label>
                      </>}
                      <Button type="button" variant="ghost" size="icon" className="self-end" disabled={indice === 0 && partidas.length === 1} aria-label="Quitar partida" onClick={() => setFilas((actuales) => actuales.filter((item) => item.id !== fila.id))}><Trash2 /></Button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            <label><span className="field-label">Observación</span><textarea className="field-control min-h-20" maxLength={240} value={observacion} onChange={(e) => setObservacion(e.target.value)} /></label>
          </div>
          {error ? <p role="alert" className="mt-4 border-s-4 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogPrimitive.Close asChild><Button type="button" variant="outline" size="lg" disabled={procesando}>Cancelar</Button></DialogPrimitive.Close>
            <Button type="button" size="lg" disabled={procesando || !filas.length || (compra.lineas.some((linea) => linea.tipoProducto !== 'service' && linea.cantidadPendiente > 0) && !ubicacionesDestino.length)} onClick={() => void confirmar()}>{procesando ? 'Procesando…' : 'Confirmar recepción'}</Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
