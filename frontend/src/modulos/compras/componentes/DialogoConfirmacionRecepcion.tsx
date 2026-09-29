import { PackageCheck, Plus, Trash2 } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import type {
  Compra,
  DatosRecepcionCompra,
  InspeccionRecepcionCompra,
  LineaRecepcionCompra,
  MotivoInspeccionRecepcionCompra,
} from '@/modulos/compras/modelo/compras'
import type { UbicacionAlmacen } from '@/modulos/inventario/modelo/almacen'

interface FilaRecepcion extends LineaRecepcionCompra { id: string }
type CampoError = 'general' | 'cantidad' | 'ubicacionId' | 'lote' | 'fechaVencimiento' | 'inspeccion'
type ErroresFila = Partial<Record<CampoError, string>>
interface Props {
  abierto: boolean
  compra: Compra
  ubicaciones: readonly UbicacionAlmacen[]
  alCambiarApertura: (abierto: boolean) => void
  alConfirmar: (datos: DatosRecepcionCompra) => Promise<string | undefined>
  alRestaurarFoco: () => void
}

function crearInspeccion(cantidad: string): InspeccionRecepcionCompra {
  return {
    cantidadInspeccionada: cantidad,
    cantidadAceptada: cantidad,
    cantidadRechazada: '0',
    observacion: '',
    motivos: [],
  }
}

const motivosDisponibles: Array<{ codigo: MotivoInspeccionRecepcionCompra['codigo']; etiqueta: string }> = [
  { codigo: 'quality', etiqueta: 'Calidad / condición del producto' },
  { codigo: 'documentation', etiqueta: 'Documentación' },
  { codigo: 'quantity_mismatch', etiqueta: 'Diferencia de cantidad' },
  { codigo: 'other', etiqueta: 'Otro' },
]

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
      inspeccion: linea.tipoProducto === 'service' ? undefined : crearInspeccion(String(linea.cantidadPendiente)),
    })))
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const [erroresFilas, setErroresFilas] = useState<Record<string, ErroresFila>>({})

  const actualizar = (id: string, cambio: Partial<FilaRecepcion>) => {
    setFilas((actuales) => actuales.map((fila) => {
      if (fila.id !== id) return fila
      if (cambio.cantidad === undefined || !fila.inspeccion) return { ...fila, ...cambio }
      const cantidadAnterior = Number(fila.cantidad)
      const cantidadNueva = cambio.cantidad
      const inspeccionConservada = Math.abs(
        Number(fila.inspeccion.cantidadAceptada)
        + Number(fila.inspeccion.cantidadRechazada)
        - cantidadAnterior,
      ) <= 0.0005
      return {
        ...fila,
        ...cambio,
        inspeccion: {
          ...fila.inspeccion,
          cantidadInspeccionada: cantidadNueva,
          cantidadAceptada: inspeccionConservada && Number(fila.inspeccion.cantidadRechazada) === 0
            ? cantidadNueva
            : fila.inspeccion.cantidadAceptada,
        },
      }
    }))
    setError('')
    setErroresFilas((actuales) => {
      if (!actuales[id]) return actuales
      const { [id]: _omitido, ...resto } = actuales
      return resto
    })
  }

  const agregarPartida = (purchaseOrderItemId: string) => {
    const linea = compra.lineas.find((item) => item.id === purchaseOrderItemId)
    if (!linea) {
      setError('La línea ya no está disponible. Cierra y vuelve a abrir la recepción.')
      return
    }
    setError('')
    setErroresFilas({})
    setFilas((actuales) => [...actuales, {
      id: crypto.randomUUID(), purchaseOrderItemId, cantidad: '',
      fulfillmentMode: linea.tipoProducto === 'service' ? 'administrative' : 'physical',
      ubicacionId: linea.tipoProducto === 'service' ? '' : ubicacionesDestino[0]?.id ?? '',
      lote: linea.tipoProducto === 'service' ? '' : linea.lote,
      fechaVencimiento: linea.tipoProducto === 'service' ? '' : linea.fechaVencimiento,
      inspeccion: linea.tipoProducto === 'service' ? undefined : crearInspeccion(''),
    }])
  }

  const quitarPartida = (id: string) => {
    setFilas((actuales) => actuales.filter((item) => item.id !== id))
    setError('')
    setErroresFilas((actuales) => {
      const { [id]: _omitido, ...resto } = actuales
      return resto
    })
  }

  const actualizarInspeccion = (id: string, cambio: Partial<InspeccionRecepcionCompra>) => {
    setFilas((actuales) => actuales.map((fila) => fila.id === id && fila.inspeccion
      ? { ...fila, inspeccion: { ...fila.inspeccion, ...cambio } }
      : fila))
    setError('')
    setErroresFilas((actuales) => {
      if (!actuales[id]) return actuales
      const { [id]: _omitido, ...resto } = actuales
      return resto
    })
  }

  const actualizarMotivo = (id: string, indiceMotivo: number, cambio: Partial<MotivoInspeccionRecepcionCompra>) => {
    setFilas((actuales) => actuales.map((fila) => {
      if (fila.id !== id || !fila.inspeccion) return fila
      return {
        ...fila,
        inspeccion: {
          ...fila.inspeccion,
          motivos: fila.inspeccion.motivos.map((motivo, indice) => indice === indiceMotivo ? { ...motivo, ...cambio } : motivo),
        },
      }
    }))
    setError('')
  }

  const agregarMotivo = (id: string) => {
    setFilas((actuales) => actuales.map((fila) => {
      if (fila.id !== id || !fila.inspeccion) return fila
      return {
        ...fila,
        inspeccion: {
          ...fila.inspeccion,
          motivos: [...fila.inspeccion.motivos, { codigo: 'quality', cantidad: '', texto: '' }],
        },
      }
    }))
  }

  const quitarMotivo = (id: string, indiceMotivo: number) => {
    setFilas((actuales) => actuales.map((fila) => {
      if (fila.id !== id || !fila.inspeccion) return fila
      return {
        ...fila,
        inspeccion: {
          ...fila.inspeccion,
          motivos: fila.inspeccion.motivos.filter((_, indice) => indice !== indiceMotivo),
        },
      }
    }))
  }

  const confirmar = async () => {
    setError('')
    setErroresFilas({})
    const cantidades = new Map<string, number>()
    const errores: Record<string, ErroresFila> = {}
    const agregarError = (filaId: string, campo: CampoError, mensaje: string) => {
      const anterior = errores[filaId]?.[campo]
      errores[filaId] = {
        ...errores[filaId],
        [campo]: campo === 'general' && anterior ? `${anterior} ${mensaje}` : mensaje,
      }
    }

    for (const fila of filas) {
      const cantidad = Number(fila.cantidad)
      const linea = compra.lineas.find((item) => item.id === fila.purchaseOrderItemId)
      if (!linea) {
        agregarError(fila.id, 'general', 'La línea ya no está disponible. Cierra y vuelve a abrir la recepción.')
        continue
      }
      const esServicio = linea.tipoProducto === 'service'
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        agregarError(fila.id, 'cantidad', 'Ingresa una cantidad mayor que cero.')
      }
      if (!esServicio && !fila.ubicacionId) {
        agregarError(fila.id, 'ubicacionId', 'Selecciona una ubicación activa.')
      }
      if (!linea.tipoProducto) {
        agregarError(fila.id, 'general', 'Regulariza el tipo de producto antes de recibir esta línea.')
      }
      if (linea.controlVencimiento === null) {
        agregarError(fila.id, 'general', 'Regulariza el control de vencimiento antes de recibir esta línea.')
      }
      if (linea.controlLote && !fila.lote.trim()) {
        agregarError(fila.id, 'lote', 'Ingresa el lote del producto.')
      }
      if (linea.controlVencimiento && !fila.fechaVencimiento) {
        agregarError(fila.id, 'fechaVencimiento', 'Ingresa la fecha de vencimiento.')
      }
      if (!esServicio) {
        const inspeccion = fila.inspeccion
        const cantidadAceptada = Number(inspeccion?.cantidadAceptada)
        const cantidadRechazada = Number(inspeccion?.cantidadRechazada)
        const motivos = inspeccion?.motivos ?? []
        const sumaMotivos = motivos.reduce((total, motivo) => total + Number(motivo.cantidad), 0)
        if (!inspeccion
          || !Number.isFinite(cantidadAceptada)
          || !Number.isFinite(cantidadRechazada)
          || cantidadAceptada < 0
          || cantidadRechazada < 0
          || Math.abs(cantidadAceptada + cantidadRechazada - cantidad) > 0.0005
        ) {
          agregarError(fila.id, 'inspeccion', 'La cantidad aceptada más la rechazada debe coincidir con la cantidad recibida.')
        } else if (cantidadRechazada > 0) {
          if (!motivos.length || motivos.some((motivo) => !Number.isFinite(Number(motivo.cantidad)) || Number(motivo.cantidad) <= 0 || (motivo.codigo === 'other' && !motivo.texto.trim()))) {
            agregarError(fila.id, 'inspeccion', 'Agrega motivos válidos para toda la cantidad rechazada.')
          } else if (Math.abs(sumaMotivos - cantidadRechazada) > 0.0005) {
            agregarError(fila.id, 'inspeccion', 'La suma de los motivos debe coincidir con la cantidad rechazada.')
          }
        } else if (motivos.length) {
          agregarError(fila.id, 'inspeccion', 'No registres motivos si no hay cantidad rechazada.')
        }
      }
      if (Number.isFinite(cantidad) && cantidad > 0) {
        cantidades.set(linea.id, (cantidades.get(linea.id) ?? 0) + cantidad)
      }
    }

    for (const linea of compra.lineas) {
      if ((cantidades.get(linea.id) ?? 0) <= linea.cantidadPendiente) continue
      for (const fila of filas.filter((item) => item.purchaseOrderItemId === linea.id)) {
        agregarError(fila.id, 'cantidad', `La suma supera el saldo pendiente (${linea.cantidadPendiente}).`)
      }
    }

    if (Object.keys(errores).length) {
      setErroresFilas(errores)
      setError('Revisa las líneas marcadas antes de confirmar la recepción.')
      return
    }
    setProcesando(true)
    const resultado = await alConfirmar({
      operationKey, observacion,
      lineas: filas.map(({ id: _id, ...fila }) => ({
        ...fila,
        inspeccion: fila.inspeccion
          ? { ...fila.inspeccion, cantidadInspeccionada: fila.cantidad }
          : undefined,
      })),
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
          <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">Registra lo recibido físicamente y el resultado de la inspección. Solo la cantidad aceptada entra a inventario; los servicios se marcan atendidos sin generar stock.</DialogPrimitive.Description>
          <div className="mt-5 space-y-5">
            {compra.lineas.filter((linea) => linea.cantidadPendiente > 0).map((linea) => (
              <section key={linea.id} className="border p-4">
                {linea.productoActivo === false ? (
                  <p className="mb-3 border-s-4 border-amber-500 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
                    Producto actualmente inactivo. La recepción usa el snapshot de la orden emitida.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="font-medium">{linea.productoDescripcion}</h3><p className="mt-1 font-mono text-xs text-muted-foreground">{linea.productoCodigo} · {linea.tipoProducto === 'service' ? 'Servicio' : linea.tipoProducto === 'good' ? 'Producto físico' : 'Tipo no regularizado'} · unidad {linea.unidadMedida} · pendiente {linea.cantidadPendiente}</p></div>
                  <Button type="button" variant="outline" size="sm" onClick={() => agregarPartida(linea.id)}><Plus /> {linea.tipoProducto === 'service' ? 'Dividir atención' : 'Dividir lote'}</Button>
                </div>
                <div className="mt-4 space-y-3">
                  {filas.filter((fila) => fila.purchaseOrderItemId === linea.id).map((fila, indice, partidas) => {
                    const erroresFila = erroresFilas[fila.id]
                    const idError = (campo: CampoError) => `recepcion-${fila.id}-${campo}-error`
                    return (
                      <div key={fila.id} className={`grid gap-3 border-t pt-3 ${linea.tipoProducto === 'service' ? 'md:grid-cols-[8rem_auto]' : 'md:grid-cols-[8rem_1fr_1fr_10rem_auto]'}`}>
                        {erroresFila?.general ? <p role="alert" className="md:col-span-full field-error">{erroresFila.general}</p> : null}
                        <label htmlFor={`recepcion-${fila.id}-cantidad`}><span className="field-label">Cantidad ({linea.unidadMedida})</span><input id={`recepcion-${fila.id}-cantidad`} className="field-control" type="number" min="0.001" step="0.001" value={fila.cantidad} aria-label={`Cantidad en ${linea.unidadMedida}`} aria-invalid={Boolean(erroresFila?.cantidad)} aria-describedby={erroresFila?.cantidad ? idError('cantidad') : undefined} onChange={(e) => actualizar(fila.id, { cantidad: e.target.value })} />{erroresFila?.cantidad ? <span id={idError('cantidad')} className="field-error">{erroresFila.cantidad}</span> : null}</label>
                        {linea.tipoProducto === 'service' ? <p className="self-end pb-2 text-sm text-muted-foreground">Atención administrativa · sin inventario</p> : <>
                          <label htmlFor={`recepcion-${fila.id}-ubicacion`}><span className="field-label">Ubicación</span><select id={`recepcion-${fila.id}-ubicacion`} className="field-control" value={fila.ubicacionId} aria-invalid={Boolean(erroresFila?.ubicacionId)} aria-describedby={erroresFila?.ubicacionId ? idError('ubicacionId') : undefined} onChange={(e) => actualizar(fila.id, { ubicacionId: e.target.value })}><option value="">Selecciona</option>{ubicacionesDestino.map((u) => <option key={u.id} value={u.id}>{u.codigo} · {u.nombre}</option>)}</select>{erroresFila?.ubicacionId ? <span id={idError('ubicacionId')} className="field-error">{erroresFila.ubicacionId}</span> : null}</label>
                          <label htmlFor={`recepcion-${fila.id}-lote`}><span className="field-label">Lote{linea.controlLote ? ' *' : ''}</span><input id={`recepcion-${fila.id}-lote`} className="field-control" maxLength={60} value={fila.lote} aria-invalid={Boolean(erroresFila?.lote)} aria-describedby={erroresFila?.lote ? idError('lote') : undefined} onChange={(e) => actualizar(fila.id, { lote: e.target.value })} />{erroresFila?.lote ? <span id={idError('lote')} className="field-error">{erroresFila.lote}</span> : null}</label>
                          <label htmlFor={`recepcion-${fila.id}-vencimiento`}><span className="field-label">Vencimiento{linea.controlVencimiento ? ' *' : ''}</span><input id={`recepcion-${fila.id}-vencimiento`} className="field-control" type="date" value={fila.fechaVencimiento} aria-invalid={Boolean(erroresFila?.fechaVencimiento)} aria-describedby={erroresFila?.fechaVencimiento ? idError('fechaVencimiento') : undefined} onChange={(e) => actualizar(fila.id, { fechaVencimiento: e.target.value })} />{erroresFila?.fechaVencimiento ? <span id={idError('fechaVencimiento')} className="field-error">{erroresFila.fechaVencimiento}</span> : null}</label>
                          {fila.inspeccion ? (
                            <div className="md:col-span-full border border-dashed bg-muted/20 p-3">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium">Inspección de recepción</p>
                                  <p className="mt-1 text-xs text-muted-foreground">Inspeccionada: {fila.cantidad} {linea.unidadMedida}. Solo la cantidad aceptada ingresa al stock disponible.</p>
                                </div>
                                <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">Sin cuarentena</span>
                              </div>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <label htmlFor={'recepcion-' + fila.id + '-aceptada'}><span className="field-label">Cantidad aceptada</span><input id={'recepcion-' + fila.id + '-aceptada'} className="field-control" type="number" min="0" step="0.001" value={fila.inspeccion.cantidadAceptada} aria-invalid={Boolean(erroresFila?.inspeccion)} onChange={(e) => actualizarInspeccion(fila.id, { cantidadAceptada: e.target.value })} /></label>
                                <label htmlFor={'recepcion-' + fila.id + '-rechazada'}><span className="field-label">Cantidad rechazada</span><input id={'recepcion-' + fila.id + '-rechazada'} className="field-control" type="number" min="0" step="0.001" value={fila.inspeccion.cantidadRechazada} aria-invalid={Boolean(erroresFila?.inspeccion)} onChange={(e) => actualizarInspeccion(fila.id, { cantidadRechazada: e.target.value })} /></label>
                              </div>
                              {erroresFila?.inspeccion ? <p id={idError('inspeccion')} role="alert" className="mt-2 field-error">{erroresFila.inspeccion}</p> : null}
                              <div className="mt-3 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Motivos del rechazo</span>
                                  <Button type="button" variant="outline" size="sm" onClick={() => agregarMotivo(fila.id)}><Plus /> Agregar motivo</Button>
                                </div>
                                {fila.inspeccion.motivos.map((motivo, indiceMotivo) => (
                                  <div key={indiceMotivo} className="grid gap-2 border-t pt-2 sm:grid-cols-[1fr_8rem_1fr_auto]">
                                    <label htmlFor={'recepcion-' + fila.id + '-motivo-' + indiceMotivo + '-codigo'}><span className="field-label">Motivo</span><select id={'recepcion-' + fila.id + '-motivo-' + indiceMotivo + '-codigo'} className="field-control" value={motivo.codigo} onChange={(e) => actualizarMotivo(fila.id, indiceMotivo, { codigo: e.target.value as MotivoInspeccionRecepcionCompra['codigo'] })}>{motivosDisponibles.map((opcion) => <option key={opcion.codigo} value={opcion.codigo}>{opcion.etiqueta}</option>)}</select></label>
                                    <label htmlFor={'recepcion-' + fila.id + '-motivo-' + indiceMotivo + '-cantidad'}><span className="field-label">Cantidad</span><input id={'recepcion-' + fila.id + '-motivo-' + indiceMotivo + '-cantidad'} className="field-control" type="number" min="0.001" step="0.001" value={motivo.cantidad} onChange={(e) => actualizarMotivo(fila.id, indiceMotivo, { cantidad: e.target.value })} /></label>
                                    <label htmlFor={'recepcion-' + fila.id + '-motivo-' + indiceMotivo + '-texto'}><span className="field-label">{motivo.codigo === 'other' ? 'Detalle *' : 'Detalle (opcional)'}</span><input id={'recepcion-' + fila.id + '-motivo-' + indiceMotivo + '-texto'} className="field-control" maxLength={240} value={motivo.texto} onChange={(e) => actualizarMotivo(fila.id, indiceMotivo, { texto: e.target.value })} /></label>
                                    <Button type="button" variant="ghost" size="icon" className="self-end" aria-label="Quitar motivo" onClick={() => quitarMotivo(fila.id, indiceMotivo)}><Trash2 /></Button>
                                  </div>
                                ))}
                              </div>
                              <label className="mt-3 block"><span className="field-label">Observación de inspección</span><textarea className="field-control min-h-16" maxLength={600} value={fila.inspeccion.observacion} onChange={(e) => actualizarInspeccion(fila.id, { observacion: e.target.value })} /></label>
                            </div>
                          ) : null}
                        </>}
                        <Button type="button" variant="ghost" size="icon" className="self-end" disabled={indice === 0 && partidas.length === 1} aria-label="Quitar partida" onClick={() => quitarPartida(fila.id)}><Trash2 /></Button>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
            <label><span className="field-label">Observación</span><textarea className="field-control min-h-20" maxLength={240} value={observacion} onChange={(e) => setObservacion(e.target.value)} /></label>
          </div>
          {compra.lineas.some((linea) => linea.tipoProducto !== 'service' && linea.cantidadPendiente > 0) && !ubicacionesDestino.length ? (
            <p role="alert" className="mt-4 border-s-4 border-amber-500 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
              No hay ubicaciones activas en este almacén. Configura una ubicación en Inventario para recibir mercadería física.
            </p>
          ) : null}
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
