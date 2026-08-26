import { Dialog as DialogPrimitive } from 'radix-ui'
import {
  AlertTriangle,
  ArrowDownToLine,
  CalendarClock,
  ClipboardCheck,
  History,
  LoaderCircle,
  PackageCheck,
  Plus,
  RotateCcw,
  Star,
  X,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import type { Proveedor } from '@/modulos/proveedores/modelo/proveedor'
import {
  esquemaDevolucionProveedor,
  esquemaEvaluacionProveedor,
  esquemaIncidenciaProveedor,
  type DatosDevolucionProveedor,
  type DatosEvaluacionProveedor,
  type DatosIncidenciaProveedor,
} from '@/modulos/proveedores/modelo/proveedorDetalle'
import { useProveedorDetalle } from '@/modulos/proveedores/estado/useProveedorDetalle'

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

function moneda(valor: number, codigo = 'PEN') {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: codigo }).format(valor)
}

function fecha(valor: string | null) {
  if (!valor) return 'Sin datos'
  const fechaLocal = valor.length === 10 ? `${valor}T12:00:00` : valor
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(fechaLocal))
}

function EtiquetaMetrica({ etiqueta, valor, detalle }: { etiqueta: string; valor: string | number; detalle: string }) {
  return (
    <article className="border-b px-4 py-4 last:border-b-0 sm:border-e sm:last:border-e-0 lg:border-b-0">
      <p className="font-mono text-[0.65rem] tracking-[0.06em] text-muted-foreground uppercase">{etiqueta}</p>
      <p className="mt-2 font-mono text-xl font-semibold tabular-nums">{valor}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>
    </article>
  )
}

const evaluacionInicial: DatosEvaluacionProveedor = {
  evaluadaEn: hoy(), calidad: 4, entrega: 4, servicio: 4, precio: 4, comentario: '',
}
const incidenciaInicial: DatosIncidenciaProveedor = {
  compraId: '', productoId: '', tipo: 'quality', severidad: 'medium', estado: 'open',
  ocurridaEn: hoy(), descripcion: '', resolucion: '',
}
const devolucionInicial: DatosDevolucionProveedor = {
  compraId: '', lineaCompraId: '', cantidad: '', motivo: '', solicitadaEn: hoy(),
}

interface DetalleProveedorProps {
  abierto: boolean
  proveedor: Proveedor
  puedeGestionar: boolean
  puedeCompletarDevolucion: boolean
  alCambiarApertura: (abierto: boolean) => void
  alRestaurarFoco: () => void
}

export function DetalleProveedor({
  abierto, proveedor, puedeGestionar, puedeCompletarDevolucion, alCambiarApertura, alRestaurarFoco,
}: DetalleProveedorProps) {
  const [formulario, setFormulario] = useState<'evaluacion' | 'incidencia' | 'devolucion' | null>(null)
  const [evaluacion, setEvaluacion] = useState(evaluacionInicial)
  const [incidencia, setIncidencia] = useState(incidenciaInicial)
  const [incidenciaEditadaId, setIncidenciaEditadaId] = useState<string | null>(null)
  const [devolucion, setDevolucion] = useState(devolucionInicial)
  const [mensaje, setMensaje] = useState('')
  const [errorFormulario, setErrorFormulario] = useState('')
  const {
    detalle, cargando, error, guardarEvaluacion, guardandoEvaluacion,
    guardarIncidencia, guardandoIncidencia, registrarDevolucion,
    registrandoDevolucion, completarDevolucion, completandoDevolucion,
  } = useProveedorDetalle(proveedor.id, abierto)

  const compraSeleccionada = detalle?.comprasRecibidas.find((compra) =>
    compra.id === (formulario === 'incidencia' ? incidencia.compraId : devolucion.compraId),
  )
  const productosPorId = useMemo(
    () => new Map(detalle?.productos.map((producto) => [producto.productoId, producto]) ?? []),
    [detalle?.productos],
  )

  const abrirFormulario = (tipo: typeof formulario) => {
    setMensaje('')
    setErrorFormulario('')
    setFormulario(tipo)
    if (tipo === 'incidencia') {
      setIncidenciaEditadaId(null)
      setIncidencia({ ...incidenciaInicial, ocurridaEn: hoy() })
    }
  }

  const gestionarIncidencia = (item: NonNullable<typeof detalle>['incidencias'][number]) => {
    setMensaje('')
    setErrorFormulario('')
    setIncidenciaEditadaId(item.id)
    setIncidencia({
      compraId: item.compraId ?? '', productoId: item.productoId ?? '', tipo: item.tipo,
      severidad: item.severidad, estado: item.estado, ocurridaEn: item.ocurridaEn,
      descripcion: item.descripcion, resolucion: item.resolucion,
    })
    setFormulario('incidencia')
  }

  const cerrarFormularioIncidencia = () => {
    setFormulario(null)
    setIncidenciaEditadaId(null)
    setErrorFormulario('')
  }

  const enviarEvaluacion = async (evento: FormEvent) => {
    evento.preventDefault()
    const resultado = esquemaEvaluacionProveedor.safeParse(evaluacion)
    if (!resultado.success) return setErrorFormulario(resultado.error.issues[0]?.message ?? 'Revisa la evaluación')
    try {
      await guardarEvaluacion(resultado.data)
      setEvaluacion({ ...evaluacionInicial, evaluadaEn: hoy() })
      setFormulario(null)
      setMensaje('Evaluación registrada con fecha y responsable.')
    } catch (fallo) {
      setErrorFormulario(fallo instanceof Error ? fallo.message : 'No se pudo registrar la evaluación')
    }
  }

  const enviarIncidencia = async (evento: FormEvent) => {
    evento.preventDefault()
    const resultado = esquemaIncidenciaProveedor.safeParse(incidencia)
    if (!resultado.success) return setErrorFormulario(resultado.error.issues[0]?.message ?? 'Revisa la incidencia')
    try {
      await guardarIncidencia(resultado.data, incidenciaEditadaId ?? undefined)
      setIncidencia({ ...incidenciaInicial, ocurridaEn: hoy() })
      setIncidenciaEditadaId(null)
      setFormulario(null)
      setMensaje(incidenciaEditadaId ? 'Incidencia actualizada en el expediente.' : 'Incidencia registrada en el expediente.')
    } catch (fallo) {
      setErrorFormulario(fallo instanceof Error ? fallo.message : 'No se pudo registrar la incidencia')
    }
  }

  const enviarDevolucion = async (evento: FormEvent) => {
    evento.preventDefault()
    const resultado = esquemaDevolucionProveedor.safeParse(devolucion)
    if (!resultado.success) return setErrorFormulario(resultado.error.issues[0]?.message ?? 'Revisa la devolución')
    try {
      await registrarDevolucion(resultado.data)
      setDevolucion({ ...devolucionInicial, solicitadaEn: hoy() })
      setFormulario(null)
      setMensaje('Devolución registrada. Completarla generará la salida de inventario.')
    } catch (fallo) {
      setErrorFormulario(fallo instanceof Error ? fallo.message : 'No se pudo registrar la devolución')
    }
  }

  const completar = async (devolucionId: string) => {
    if (!window.confirm('¿Completar la devolución? Se descontará la cantidad del inventario recibido.')) return
    try {
      await completarDevolucion(devolucionId)
      setMensaje('Devolución completada y descontada del inventario.')
    } catch (fallo) {
      setMensaje(fallo instanceof Error ? fallo.message : 'No se pudo completar la devolución')
    }
  }

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 end-0 z-50 flex w-full max-w-5xl flex-col border-s bg-background shadow-xl outline-none"
          onCloseAutoFocus={(evento) => { evento.preventDefault(); alRestaurarFoco() }}
        >
          <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3 sm:px-7">
            <span className="font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">
              Expediente de abastecimiento / {proveedor.codigo || proveedor.numeroDocumento}
            </span>
            <DialogPrimitive.Close asChild>
              <button type="button" aria-label="Cerrar expediente" className="grid size-9 place-items-center text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </div>

          <header className="border-b px-5 py-5 sm:px-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <DialogPrimitive.Title className="text-2xl font-semibold tracking-[-0.03em]">{proveedor.razonSocial}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
                  {proveedor.tipoDocumento.toUpperCase()} {proveedor.numeroDocumento} · {proveedor.contacto || 'Sin contacto registrado'}
                </DialogPrimitive.Description>
              </div>
              <span className="status-label" data-tone={proveedor.activo ? 'listo' : 'revision'}>{proveedor.activo ? 'Activo' : 'Inactivo'}</span>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {cargando ? (
              <p className="flex items-center justify-center gap-2 px-6 py-20 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Cargando evidencia operativa…</p>
            ) : error || !detalle ? (
              <p role="alert" className="px-6 py-20 text-center text-sm text-destructive">{error instanceof Error ? error.message : 'No se pudo cargar el expediente'}</p>
            ) : (
              <>
                <section aria-label="Indicadores reales" className="grid border-b sm:grid-cols-2 lg:grid-cols-5">
                  <EtiquetaMetrica etiqueta="Compras recibidas" valor={detalle.metricas.ordenesRecibidas} detalle={fecha(detalle.metricas.ultimaCompraEn)} />
                  <EtiquetaMetrica etiqueta="Puntualidad" valor={detalle.metricas.puntualidadPorcentaje === null ? '—' : `${detalle.metricas.puntualidadPorcentaje}%`} detalle={`${detalle.metricas.entregasMedidas} entregas medidas`} />
                  <EtiquetaMetrica etiqueta="Tiempo real" valor={detalle.metricas.diasEntregaPromedio === null ? '—' : `${detalle.metricas.diasEntregaPromedio} d`} detalle="Promedio emisión–recepción" />
                  <EtiquetaMetrica etiqueta="Evaluación" valor={detalle.metricas.ultimaEvaluacion === null ? '—' : `${detalle.metricas.ultimaEvaluacion}/5`} detalle={fecha(detalle.metricas.ultimaEvaluacionEn)} />
                  <EtiquetaMetrica etiqueta="Alertas abiertas" valor={detalle.metricas.incidenciasAbiertas} detalle={`${detalle.metricas.devolucionesCompletadas} devoluciones`} />
                </section>

                {mensaje ? <p role="status" className="border-b border-primary/20 bg-accent px-5 py-3 text-sm sm:px-7">{mensaje}</p> : null}
                {errorFormulario ? <p role="alert" className="border-b border-destructive/20 bg-destructive/5 px-5 py-3 text-sm text-destructive sm:px-7">{errorFormulario}</p> : null}

                <section className="border-b px-5 py-6 sm:px-7" aria-labelledby="suministro-title">
                  <div className="flex items-end justify-between gap-4">
                    <div><h2 id="suministro-title" className="flex items-center gap-2 font-semibold"><PackageCheck className="size-4 text-primary" />Productos suministrados</h2><p className="mt-1 text-sm text-muted-foreground">Solo recepciones confirmadas; precios calculados desde las líneas de compra.</p></div>
                  </div>
                  {detalle.productos.length ? (
                    <div className="mt-4 overflow-x-auto border">
                      <table className="w-full min-w-[760px] text-sm">
                        <thead className="bg-muted/50 text-left font-mono text-[0.66rem] tracking-[0.05em] text-muted-foreground uppercase"><tr><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-end">Compras</th><th className="px-3 py-2 text-end">Cantidad</th><th className="px-3 py-2 text-end">Último costo</th><th className="px-3 py-2 text-end">Rango histórico</th><th className="px-3 py-2">Última recepción</th></tr></thead>
                        <tbody className="divide-y">{detalle.productos.map((producto) => <tr key={producto.productoId}><td className="px-3 py-3"><span className="font-mono text-xs text-primary">{producto.codigo}</span><p className="mt-1 font-medium">{producto.descripcion}</p></td><td className="px-3 py-3 text-end font-mono">{producto.compras}</td><td className="px-3 py-3 text-end font-mono">{producto.cantidadSuministrada} {producto.unidadMedida}</td><td className="px-3 py-3 text-end font-mono">{moneda(producto.ultimoCosto)}</td><td className="px-3 py-3 text-end font-mono text-xs">{moneda(producto.costoMinimo)} – {moneda(producto.costoMaximo)}</td><td className="px-3 py-3">{fecha(producto.ultimaRecepcionEn)}</td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p className="mt-4 border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">Todavía no hay productos provenientes de compras recibidas.</p>}
                </section>

                <section className="border-b px-5 py-6 sm:px-7" aria-labelledby="precios-title">
                  <h2 id="precios-title" className="flex items-center gap-2 font-semibold"><History className="size-4 text-primary" />Precios y compras históricas</h2>
                  {detalle.precios.length ? <div className="mt-4 max-h-72 overflow-auto border"><table className="w-full min-w-[680px] text-sm"><thead className="sticky top-0 bg-muted"><tr className="text-left"><th className="px-3 py-2">Recepción</th><th className="px-3 py-2">Documento</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-end">Cantidad</th><th className="px-3 py-2 text-end">Costo</th></tr></thead><tbody className="divide-y">{detalle.precios.map((precio) => <tr key={precio.lineaId}><td className="px-3 py-2">{fecha(precio.recibidoEn)}</td><td className="px-3 py-2 font-mono text-xs uppercase">{precio.documento}</td><td className="px-3 py-2">{precio.productoCodigo} · {precio.productoDescripcion}</td><td className="px-3 py-2 text-end font-mono">{precio.cantidad}</td><td className="px-3 py-2 text-end font-mono">{moneda(precio.costoUnitario, precio.moneda)}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-muted-foreground">Sin precios históricos confirmados.</p>}
                </section>

                <section className="border-b px-5 py-6 sm:px-7" aria-labelledby="calidad-title">
                  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="calidad-title" className="flex items-center gap-2 font-semibold"><ClipboardCheck className="size-4 text-primary" />Evaluaciones fechadas</h2><p className="mt-1 text-sm text-muted-foreground">Cada evaluación conserva criterios, fecha y responsable.</p></div>{puedeGestionar ? <Button variant="outline" size="sm" onClick={() => abrirFormulario('evaluacion')}><Plus />Nueva evaluación</Button> : null}</div>
                  {formulario === 'evaluacion' ? <form onSubmit={enviarEvaluacion} className="mt-4 grid gap-3 border bg-muted/20 p-4 sm:grid-cols-5"><div><label className="field-label">Fecha</label><input type="date" className="field-control" value={evaluacion.evaluadaEn} onChange={(e) => setEvaluacion({ ...evaluacion, evaluadaEn: e.target.value })} /></div>{(['calidad','entrega','servicio','precio'] as const).map((campo) => <div key={campo}><label className="field-label capitalize">{campo}</label><select className="field-control" value={evaluacion[campo]} onChange={(e) => setEvaluacion({ ...evaluacion, [campo]: Number(e.target.value) })}>{[1,2,3,4,5].map((valor) => <option key={valor} value={valor}>{valor}/5</option>)}</select></div>)}<div className="sm:col-span-5"><label className="field-label">Comentario</label><textarea className="field-control" rows={2} value={evaluacion.comentario} onChange={(e) => setEvaluacion({ ...evaluacion, comentario: e.target.value })} /></div><div className="sm:col-span-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setFormulario(null)}>Cancelar</Button><Button type="submit" disabled={guardandoEvaluacion}>{guardandoEvaluacion ? 'Guardando…' : 'Registrar evaluación'}</Button></div></form> : null}
                  <div className="mt-4 space-y-2">{detalle.evaluaciones.map((item) => <article key={item.id} className="grid gap-3 border px-4 py-3 sm:grid-cols-[6rem_1fr_auto]"><div><p className="flex items-center gap-1 font-mono font-semibold"><Star className="size-3.5 fill-primary text-primary" />{item.global}/5</p><p className="mt-1 text-xs text-muted-foreground">{fecha(item.evaluadaEn)}</p></div><div><p className="text-sm">{item.comentario || 'Sin comentario'}</p><p className="mt-1 text-xs text-muted-foreground">Calidad {item.calidad} · Entrega {item.entrega} · Servicio {item.servicio} · Precio {item.precio}</p></div><p className="text-xs text-muted-foreground">{item.responsable}</p></article>)}{!detalle.evaluaciones.length ? <p className="text-sm text-muted-foreground">Aún no hay evaluaciones.</p> : null}</div>
                </section>

                <section className="border-b px-5 py-6 sm:px-7" aria-labelledby="incidencias-title">
                  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="incidencias-title" className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-primary" />Incidencias</h2><p className="mt-1 text-sm text-muted-foreground">Problemas vinculados a compras y productos cuando corresponde.</p></div>{puedeGestionar ? <Button variant="outline" size="sm" onClick={() => abrirFormulario('incidencia')}><Plus />Registrar incidencia</Button> : null}</div>
                  {formulario === 'incidencia' ? <form onSubmit={enviarIncidencia} className="mt-4 grid gap-3 border bg-muted/20 p-4 sm:grid-cols-3"><div><label className="field-label">Compra relacionada</label><select className="field-control" value={incidencia.compraId} onChange={(e) => setIncidencia({ ...incidencia, compraId: e.target.value, productoId: '' })}><option value="">Sin compra</option>{detalle.comprasRecibidas.map((compra) => <option key={compra.id} value={compra.id}>{compra.documento}</option>)}</select></div><div><label className="field-label">Producto</label><select className="field-control" value={incidencia.productoId} onChange={(e) => setIncidencia({ ...incidencia, productoId: e.target.value })}><option value="">Sin producto</option>{compraSeleccionada?.lineas.map((linea) => <option key={linea.productoId} value={linea.productoId}>{linea.productoCodigo} · {linea.productoDescripcion}</option>)}</select></div><div><label className="field-label">Fecha</label><input type="date" className="field-control" value={incidencia.ocurridaEn} onChange={(e) => setIncidencia({ ...incidencia, ocurridaEn: e.target.value })} /></div><div><label className="field-label">Tipo</label><select className="field-control" value={incidencia.tipo} onChange={(e) => setIncidencia({ ...incidencia, tipo: e.target.value as DatosIncidenciaProveedor['tipo'] })}><option value="late-delivery">Entrega tardía</option><option value="incomplete-delivery">Entrega incompleta</option><option value="quality">Calidad</option><option value="documentation">Documentación</option><option value="commercial">Comercial</option><option value="other">Otro</option></select></div><div><label className="field-label">Severidad</label><select className="field-control" value={incidencia.severidad} onChange={(e) => setIncidencia({ ...incidencia, severidad: e.target.value as DatosIncidenciaProveedor['severidad'] })}><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option><option value="critical">Crítica</option></select></div><div><label className="field-label">Estado</label><select className="field-control" value={incidencia.estado} onChange={(e) => setIncidencia({ ...incidencia, estado: e.target.value as DatosIncidenciaProveedor['estado'] })}><option value="open">Abierta</option><option value="investigating">En investigación</option><option value="resolved">Resuelta</option><option value="closed">Cerrada</option></select></div><div className="sm:col-span-3"><label className="field-label">Descripción</label><textarea required rows={3} className="field-control" value={incidencia.descripcion} onChange={(e) => setIncidencia({ ...incidencia, descripcion: e.target.value })} /></div>{['resolved','closed'].includes(incidencia.estado) ? <div className="sm:col-span-3"><label className="field-label">Resolución</label><textarea rows={2} className="field-control" value={incidencia.resolucion} onChange={(e) => setIncidencia({ ...incidencia, resolucion: e.target.value })} /></div> : null}<div className="sm:col-span-3 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={cerrarFormularioIncidencia}>Cancelar</Button><Button type="submit" disabled={guardandoIncidencia}>{guardandoIncidencia ? 'Guardando…' : incidenciaEditadaId ? 'Actualizar incidencia' : 'Guardar incidencia'}</Button></div></form> : null}
                  <div className="mt-4 space-y-2">{detalle.incidencias.map((item) => <article key={item.id} className="border-s-2 border-s-primary bg-muted/15 px-4 py-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-medium">{item.descripcion}</p><div className="flex items-center gap-2"><span className="font-mono text-[0.65rem] uppercase">{item.estado} · {item.severidad}</span>{puedeGestionar ? <Button type="button" size="sm" variant="ghost" onClick={() => gestionarIncidencia(item)}>Gestionar</Button> : null}</div></div><p className="mt-2 text-xs text-muted-foreground">{fecha(item.ocurridaEn)} · {item.responsable}{item.productoId ? ` · ${productosPorId.get(item.productoId)?.descripcion ?? 'Producto relacionado'}` : ''}</p>{item.resolucion ? <p className="mt-2 text-sm text-muted-foreground">Resolución: {item.resolucion}</p> : null}</article>)}{!detalle.incidencias.length ? <p className="text-sm text-muted-foreground">Sin incidencias registradas.</p> : null}</div>
                </section>

                <section className="px-5 py-6 sm:px-7" aria-labelledby="devoluciones-title">
                  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="devoluciones-title" className="flex items-center gap-2 font-semibold"><ArrowDownToLine className="size-4 text-primary" />Devoluciones</h2><p className="mt-1 text-sm text-muted-foreground">La devolución se registra primero y descuenta inventario al completarse.</p></div>{puedeGestionar ? <Button variant="outline" size="sm" disabled={!detalle.comprasRecibidas.length} onClick={() => abrirFormulario('devolucion')}><Plus />Registrar devolución</Button> : null}</div>
                  {formulario === 'devolucion' ? <form onSubmit={enviarDevolucion} className="mt-4 grid gap-3 border bg-muted/20 p-4 sm:grid-cols-4"><div><label className="field-label">Compra *</label><select required className="field-control" value={devolucion.compraId} onChange={(e) => setDevolucion({ ...devolucion, compraId: e.target.value, lineaCompraId: '' })}><option value="">Seleccionar</option>{detalle.comprasRecibidas.map((compra) => <option key={compra.id} value={compra.id}>{compra.documento}</option>)}</select></div><div><label className="field-label">Producto *</label><select required className="field-control" value={devolucion.lineaCompraId} onChange={(e) => setDevolucion({ ...devolucion, lineaCompraId: e.target.value })}><option value="">Seleccionar</option>{compraSeleccionada?.lineas.map((linea) => <option key={linea.id} value={linea.id}>{linea.productoCodigo} · {linea.productoDescripcion} ({linea.cantidad})</option>)}</select></div><div><label className="field-label">Cantidad *</label><input required inputMode="decimal" className="field-control" value={devolucion.cantidad} onChange={(e) => setDevolucion({ ...devolucion, cantidad: e.target.value })} /></div><div><label className="field-label">Fecha *</label><input required type="date" className="field-control" value={devolucion.solicitadaEn} onChange={(e) => setDevolucion({ ...devolucion, solicitadaEn: e.target.value })} /></div><div className="sm:col-span-4"><label className="field-label">Motivo *</label><textarea required rows={2} className="field-control" value={devolucion.motivo} onChange={(e) => setDevolucion({ ...devolucion, motivo: e.target.value })} /></div><div className="sm:col-span-4 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setFormulario(null)}>Cancelar</Button><Button type="submit" disabled={registrandoDevolucion}>{registrandoDevolucion ? 'Registrando…' : 'Registrar devolución'}</Button></div></form> : null}
                  <div className="mt-4 space-y-2">{detalle.devoluciones.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 border px-4 py-3"><div><p className="text-sm font-medium">{productosPorId.get(item.productoId)?.descripcion ?? 'Producto'} · {item.cantidad}</p><p className="mt-1 text-xs text-muted-foreground">{item.motivo} · {fecha(item.solicitadaEn)} · {item.responsable}</p></div><div className="flex items-center gap-2"><span className="status-label" data-tone={item.estado === 'completed' ? 'listo' : 'revision'}>{item.estado === 'completed' ? 'Completada' : 'Registrada'}</span>{puedeCompletarDevolucion && item.estado === 'registered' ? <Button size="sm" variant="outline" disabled={completandoDevolucion} onClick={() => void completar(item.id)}><RotateCcw />Completar</Button> : null}</div></article>)}{!detalle.devoluciones.length ? <p className="text-sm text-muted-foreground">Sin devoluciones registradas.</p> : null}</div>
                </section>
              </>
            )}
          </div>
          <footer className="flex items-center justify-between border-t bg-background px-5 py-3 text-xs text-muted-foreground sm:px-7"><span className="inline-flex items-center gap-2"><CalendarClock className="size-3.5" />Indicadores calculados desde operaciones confirmadas</span><span>Actualizado {fecha(proveedor.fechaActualizacion)}</span></footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
