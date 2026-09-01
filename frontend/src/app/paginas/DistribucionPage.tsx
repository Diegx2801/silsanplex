import { FileDown, Pencil, Plus, Search, Truck } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { useDeferredValue, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useProgramacionesEntrega } from '@/modulos/distribucion/estado/useProgramacionesEntrega'
import {
  esquemaDatosProgramacionEntrega,
  type DatosProgramacionEntrega,
  type ProgramacionEntrega,
} from '@/modulos/distribucion/modelo/programacionEntrega'
import { crearRepositorioOperacionesVentaSesion } from '@/modulos/ventas/servicios/repositorioOperacionesVentaSesion'

const hoy = new Date().toISOString().slice(0, 10)
const formatoFecha = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
const etiquetasEstado: Record<string, string> = {
  programado: 'Programado',
  preparando: 'Preparando',
  en_curso: 'En curso',
  en_destino: 'En destino',
  entregado: 'Entregado',
  entrega_parcial: 'Entrega parcial',
  reprogramado: 'Reprogramado',
  rechazado: 'Rechazado',
  devuelto: 'Devuelto',
  cancelado: 'Cancelado',
}
const etiquetasModalidad: Record<string, string> = {
  movilidad_propia: 'Movilidad propia',
  movilidad_externa: 'Movilidad externa',
  recojo_cliente: 'Recojo del cliente',
}

function normalizar(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-PE')
}

export function DistribucionPage() {
  const { pedidos } = useMemo(
    () => crearRepositorioOperacionesVentaSesion(window.sessionStorage).listar(),
    [],
  )
  const { programaciones, guardar, actualizarEstado } = useProgramacionesEntrega()
  const [busqueda, setBusqueda] = useState('')
  const [formularioAbierto, setFormularioAbierto] = useState(false)
  const [edicion, setEdicion] = useState<ProgramacionEntrega | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [datos, setDatos] = useState<DatosProgramacionEntrega>({
    pedidoId: '',
    pedidoNumero: '',
    ventaId: '',
    ventaNumero: '',
    clienteNombre: '',
    direccionEntrega: '',
    numeroDespacho: '',
    numeroGuiaRemision: '',
    fechaEmision: hoy,
    fechaProgramada: hoy,
    fechaEntrega: '',
    tipoTransporte: 'interno',
    modalidad: 'movilidad_propia',
    transportista: '',
    conductor: '',
    vehiculo: '',
    placa: '',
    observaciones: '',
    evidencia: '',
    estado: 'programado',
    seguimiento: 'en_curso',
    incidencias: [],
    lineas: [],
  })
  const busquedaDiferida = useDeferredValue(busqueda)
  const pedidosDisponibles = pedidos.filter((pedido) =>
    !programaciones.some((item) => item.pedidoId === pedido.id && item.id !== edicion?.id),
  )
  const pedidosPorProgramar = pedidos.filter(
    (pedido) => pedido.estado !== 'cancelado' && !programaciones.some((item) => item.pedidoId === pedido.id),
  )
  const filtradas = programaciones.filter((item) =>
    normalizar(`${item.pedidoNumero} ${item.clienteNombre} ${item.numeroGuiaRemision}`).includes(normalizar(busquedaDiferida)),
  )

  const pedidoPorId = (pedidoId: string) => pedidos.find((pedido) => pedido.id === pedidoId)

  const abrirFormulario = (programacion?: ProgramacionEntrega) => {
    setEdicion(programacion ?? null)
    setDatos(programacion
      ? {
          pedidoId: programacion.pedidoId,
          pedidoNumero: programacion.pedidoNumero,
          ventaId: programacion.ventaId ?? '',
          ventaNumero: programacion.ventaNumero ?? '',
          clienteNombre: programacion.clienteNombre,
          direccionEntrega: programacion.direccionEntrega ?? '',
          numeroDespacho: programacion.numeroDespacho ?? '',
          numeroGuiaRemision: programacion.numeroGuiaRemision ?? '',
          fechaEmision: programacion.fechaEmision ?? hoy,
          fechaProgramada: programacion.fechaProgramada ?? hoy,
          fechaEntrega: programacion.fechaEntrega ?? '',
          tipoTransporte: programacion.tipoTransporte ?? 'interno',
          modalidad: programacion.modalidad ?? 'movilidad_propia',
          transportista: programacion.transportista ?? '',
          conductor: programacion.conductor ?? '',
          vehiculo: programacion.vehiculo ?? '',
          placa: programacion.placa ?? '',
          observaciones: programacion.observaciones ?? '',
          evidencia: programacion.evidencia ?? '',
          estado: programacion.estado ?? 'programado',
          seguimiento: programacion.seguimiento ?? (programacion.estado === 'en_curso' || programacion.estado === 'en_destino' ? programacion.estado : 'en_curso'),
          incidencias: programacion.incidencias ?? [],
          lineas: programacion.lineas ?? [],
        }
      : {
          pedidoId: '',
          pedidoNumero: '',
          ventaId: '',
          ventaNumero: '',
          clienteNombre: '',
          direccionEntrega: '',
          numeroDespacho: '',
          numeroGuiaRemision: '',
          fechaEmision: hoy,
          fechaProgramada: hoy,
          fechaEntrega: '',
          tipoTransporte: 'interno',
          modalidad: 'movilidad_propia',
          transportista: '',
          conductor: '',
          vehiculo: '',
          placa: '',
          observaciones: '',
          evidencia: '',
          estado: 'programado',
          seguimiento: 'en_curso',
          incidencias: [],
          lineas: [],
        })
    setFormularioAbierto(true)
  }

  const prepararPedido = (pedidoId: string) => {
    const pedido = pedidos.find((item) => item.id === pedidoId)
    if (!pedido) return
    setEdicion(null)
    setDatos({
      pedidoId: pedido.id,
      pedidoNumero: pedido.numero,
      ventaId: '',
      ventaNumero: '',
      clienteNombre: pedido.clienteNombre,
      direccionEntrega: '',
      numeroDespacho: '',
      numeroGuiaRemision: '',
      fechaEmision: hoy,
      fechaProgramada: hoy,
      fechaEntrega: '',
      tipoTransporte: 'interno',
      modalidad: 'movilidad_propia',
      transportista: '',
      conductor: '',
      vehiculo: '',
      placa: '',
      observaciones: '',
      evidencia: '',
      estado: 'programado',
      seguimiento: 'en_curso',
      incidencias: [],
      lineas: [],
    })
    setFormularioAbierto(true)
  }

  const seleccionarPedido = (pedidoId: string) => {
    const pedido = pedidos.find((item) => item.id === pedidoId)
    setDatos((actuales) => ({ ...actuales, pedidoId, pedidoNumero: pedido?.numero ?? '', clienteNombre: pedido?.clienteNombre ?? '' }))
  }

  const enviar = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const resultado = esquemaDatosProgramacionEntrega.safeParse(datos)
    if (!resultado.success) {
      setMensaje(resultado.error.issues[0]?.message ?? 'Revisa los datos')
      return
    }
    const error = await guardar(resultado.data, edicion?.id, pedidoPorId(resultado.data.pedidoId)?.lineas ?? edicion?.lineas ?? [])
    setMensaje(error ?? (edicion ? 'Distribución actualizada.' : 'Distribución programada.'))
    if (!error) setFormularioAbierto(false)
  }

  const exportarEntrega = (id: string) => {
    const entrega = programaciones.find((item) => item.id === id)
    if (!entrega) return
    const pedido = pedidoPorId(entrega.pedidoId)
    if (!pedido) {
      setMensaje('No se encontró el detalle del pedido seleccionado')
      return
    }

    const nombreSeguro = `${entrega.pedidoNumero}_Guia_${entrega.numeroGuiaRemision}`
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-|-$/g, '')
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const margen = 18
    const ancho = 210 - margen * 2
    const verde = [22, 112, 90] as const
    const tinta = [29, 39, 36] as const
    const gris = [102, 115, 110] as const
    let y = 18

    pdf.setFillColor(...verde)
    pdf.rect(0, 0, 210, 34, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(17)
    pdf.text('SILSANPLEX', margen, y + 1)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text('CONSTANCIA DE ENTREGA', margen, y + 8)
    pdf.setFontSize(8)
    pdf.text('Documento operativo de distribución', 192, y + 5, { align: 'right' })
    pdf.text(`Generado: ${formatoFecha.format(new Date())}`, 192, y + 11, { align: 'right' })
    y = 47

    pdf.setTextColor(...tinta)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(14)
    pdf.text('Detalle de entrega', margen, y)
    pdf.setFontSize(10)
    pdf.setTextColor(...verde)
    pdf.text(entrega.pedidoNumero, 192, y, { align: 'right' })
    y += 7
    pdf.setDrawColor(205, 216, 210)
    pdf.line(margen, y, 192, y)
    y += 10

    const dibujarDato = (etiqueta: string, valor: string, x: number, anchoDato: number) => {
      pdf.setFillColor(244, 247, 245)
      pdf.roundedRect(x, y, anchoDato, 18, 2, 2, 'F')
      pdf.setTextColor(...gris)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.text(etiqueta.toUpperCase(), x + 4, y + 6)
      pdf.setTextColor(...tinta)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.text(valor, x + 4, y + 13)
    }

    dibujarDato('Cliente', entrega.clienteNombre, margen, 82)
    dibujarDato('Guía de remisión', entrega.numeroGuiaRemision, 106, 86)
    y += 25
    dibujarDato('Fecha de emisión', formatoFecha.format(new Date(`${entrega.fechaEmision}T12:00:00`)), margen, 55)
    dibujarDato('Fecha de entrega', formatoFecha.format(new Date(`${entrega.fechaEntrega}T12:00:00`)), 78, 55)
    dibujarDato('Transporte', entrega.tipoTransporte === 'interno' ? 'Movilidad SILSAN' : 'Movilidad externa', 137, 55)
    y += 28

    pdf.setTextColor(...tinta)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.text('Productos del pedido', margen, y)
    y += 6
    pdf.setFillColor(...verde)
    pdf.rect(margen, y, ancho, 9, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(8)
    pdf.text('PRODUCTO', margen + 4, y + 6)
    pdf.text('UNIDAD', 150, y + 6)
    pdf.text('CANTIDAD', 188, y + 6, { align: 'right' })
    y += 9

    pdf.setFont('helvetica', 'normal')
    pedido.lineas.forEach((linea, indice) => {
      const descripcion = pdf.splitTextToSize(linea.productoDescripcion, 115)
      const alto = Math.max(10, descripcion.length * 4 + 6)
      if (indice % 2 === 0) {
        pdf.setFillColor(248, 250, 249)
        pdf.rect(margen, y, ancho, alto, 'F')
      }
      pdf.setTextColor(...tinta)
      pdf.setFontSize(9)
      pdf.text(descripcion, margen + 4, y + 6)
      pdf.text(linea.unidadMedida || '-', 150, y + 6)
      pdf.setFont('helvetica', 'bold')
      pdf.text(String(linea.cantidad), 188, y + 6, { align: 'right' })
      pdf.setFont('helvetica', 'normal')
      y += alto
    })

    y += 12
    pdf.setTextColor(...tinta)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text('Seguimiento', margen, y)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.text(entrega.seguimiento === 'en_curso' ? 'En curso' : 'En destino', margen + 30, y)
    y += 9
    pdf.setFont('helvetica', 'bold')
    pdf.text('Observaciones', margen, y)
    pdf.setFont('helvetica', 'normal')
    const observaciones = entrega.observaciones || 'Sin observaciones registradas.'
    pdf.text(pdf.splitTextToSize(observaciones, ancho - 35), margen + 35, y)
    y += 28
    pdf.setDrawColor(180, 195, 187)
    pdf.line(margen, y, 82, y)
    pdf.line(128, y, 192, y)
    pdf.setTextColor(...gris)
    pdf.setFontSize(8)
    pdf.text('Responsable de despacho', margen, y + 5)
    pdf.text('Conformidad de entrega', 128, y + 5)
    pdf.save(`Entrega_${nombreSeguro}.pdf`)
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 border-b pb-7 lg:flex-row lg:items-end lg:justify-between print:hidden">
        <div>
          <span className="font-mono text-xs tracking-[0.08em] text-primary uppercase">Despacho y seguimiento</span>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Distribución</h1>
          <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">Programa entregas de pedidos, registra su guía de remisión y acompaña cada envío hasta destino.</p>
        </div>
        <Button type="button" size="lg" onClick={() => abrirFormulario()}><Plus aria-hidden="true" /> Programar entrega</Button>
      </header>

      <section aria-label="Resumen de distribución" className="ledger-sheet">
        <div className="grid sm:grid-cols-3">
          {[
            ['Por programar', pedidosPorProgramar.length],
            ['Programadas', programaciones.filter((item) => item.estado === 'programado').length],
            ['En curso', programaciones.filter((item) => item.estado === 'en_curso').length],
            ['Entregadas', programaciones.filter((item) => item.estado === 'entregado').length],
          ].map(([etiqueta, valor]) => (
            <article key={etiqueta} className="border-b px-5 py-5 last:border-b-0 sm:border-e sm:last:border-e-0 sm:border-b-0">
              <div className="flex justify-between"><p className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">{etiqueta}</p><Truck aria-hidden="true" className="size-4 text-primary" /></div>
              <p className="mt-3 font-mono text-2xl font-semibold">{valor}</p>
            </article>
          ))}
        </div>
      </section>

      <p role="status" aria-live="polite" className="sr-only">{mensaje}</p>
      <section aria-labelledby="pendientes-programacion-title" className="ledger-sheet">
        <div className="border-b px-5 py-5 sm:px-6">
          <h2 id="pendientes-programacion-title" className="text-lg font-semibold">Pedidos por programar</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pedidos confirmados que todavía no tienen una entrega asignada.</p>
        </div>
        {!pedidosPorProgramar.length ? (
          <p className="px-5 py-6 text-sm text-muted-foreground sm:px-6">No hay pedidos pendientes de programación.</p>
        ) : (
          <div className="divide-y">{pedidosPorProgramar.map((pedido) => (
            <article key={pedido.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div><p className="font-mono text-xs text-primary">{pedido.numero}</p><h3 className="mt-1 font-semibold">{pedido.clienteNombre}</h3><p className="mt-1 text-xs text-muted-foreground">{pedido.lineas.length} producto{pedido.lineas.length === 1 ? '' : 's'} · Pedido confirmado</p></div>
              <Button type="button" onClick={() => prepararPedido(pedido.id)}><Plus aria-hidden="true" /> Programar</Button>
            </article>
          ))}</div>
        )}
      </section>
      <section aria-labelledby="entregas-title" className="ledger-sheet">
        <div className="grid gap-4 border-b px-5 py-5 sm:px-6 lg:grid-cols-[1fr_18rem] lg:items-end print:hidden">
          <div><h2 id="entregas-title" className="text-lg font-semibold">Entregas programadas</h2><p className="mt-1 text-sm text-muted-foreground">{filtradas.length} de {programaciones.length} entregas</p></div>
          <div><label htmlFor="buscar-entrega" className="field-label">Buscar</label><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input id="buscar-entrega" type="search" value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} className="field-control ps-9" placeholder="Pedido, cliente o guía" /></div></div>
        </div>
        {!filtradas.length ? (
          <div className="px-5 py-14 text-center sm:px-6"><Truck aria-hidden="true" className="mx-auto size-8 text-primary" /><h3 className="mt-4 font-semibold">{programaciones.length ? 'No hay coincidencias' : 'Aún no hay entregas programadas'}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Programa una entrega desde un pedido confirmado para iniciar el seguimiento.</p></div>
        ) : (
          <div className="divide-y">{filtradas.map((item) => (
            <article key={item.id} className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[1.1fr_1fr_1fr_auto] lg:items-center">
              <div className="print-delivery-header"><p className="font-mono text-xs text-primary">SILSANPLEX · CONSTANCIA DE ENTREGA</p><p className="font-mono text-xs text-muted-foreground">Emisión: {formatoFecha.format(new Date(`${item.fechaEmision}T12:00:00`))}</p></div>
              <div><p className="font-mono text-xs text-primary">{item.pedidoNumero} · Guía {item.numeroGuiaRemision}</p><h3 className="mt-1 font-semibold">{item.clienteNombre}</h3><div className="mt-3 space-y-1 text-xs text-muted-foreground">{pedidoPorId(item.pedidoId)?.lineas.map((linea) => <p key={linea.id}>{linea.productoDescripcion} · <span className="font-mono font-semibold">{linea.cantidad}</span> {linea.unidadMedida}</p>) ?? <p>Detalle del pedido no disponible</p>}</div></div>
              <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Emisión</dt><dd className="mt-1">{formatoFecha.format(new Date(`${item.fechaEmision}T12:00:00`))}</dd></div><div><dt className="text-xs text-muted-foreground">Entrega</dt><dd className="mt-1">{formatoFecha.format(new Date(`${item.fechaEntrega}T12:00:00`))}</dd></div></dl>
              <div>
                <p className="text-sm">{etiquetasModalidad[item.modalidad ?? 'movilidad_propia']} · {item.tipoTransporte === 'interno' ? 'Interno' : item.tipoTransporte === 'externo' ? 'Externo' : 'Recojo cliente'}</p>
                <select aria-label={`Estado de ${item.pedidoNumero}`} value={item.estado} onChange={(evento) => void actualizarEstado(item, evento.target.value as ProgramacionEntrega['estado'])} className="field-control mt-2">
                  {Object.entries(etiquetasEstado).map(([valor, etiqueta]) => (
                    <option key={valor} value={valor}>{etiqueta}</option>
                  ))}
                </select>
                {item.observaciones ? <p className="mt-2 text-xs text-muted-foreground">{item.observaciones}</p> : null}
              </div>
              <div className="flex gap-2 print:hidden"><Button type="button" variant="outline" onClick={() => abrirFormulario(item)}><Pencil aria-hidden="true" /> Editar</Button><Button type="button" variant="outline" onClick={() => exportarEntrega(item.id)}><FileDown aria-hidden="true" /> PDF</Button></div>
            </article>
          ))}</div>
        )}
      </section>

      {formularioAbierto ? (
        <div role="dialog" aria-modal="true" aria-labelledby="programar-title" className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <form onSubmit={enviar} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto bg-background p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4"><div><h2 id="programar-title" className="text-xl font-semibold">{edicion ? 'Editar entrega' : 'Programar entrega'}</h2><p className="mt-1 text-sm text-muted-foreground">Vincula el pedido con su guía y fecha de entrega.</p></div><Button type="button" variant="ghost" onClick={() => setFormularioAbierto(false)}>Cerrar</Button></div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><label htmlFor="pedido-entrega" className="field-label">Pedido</label><select id="pedido-entrega" required disabled={Boolean(edicion)} value={datos.pedidoId} onChange={(evento) => seleccionarPedido(evento.target.value)} className="field-control"><option value="">Selecciona un pedido</option>{pedidosDisponibles.filter((pedido) => pedido.estado !== 'cancelado').map((pedido) => <option key={pedido.id} value={pedido.id}>{pedido.numero} · {pedido.clienteNombre}</option>)}</select></div>
              <div><label htmlFor="numero-despacho" className="field-label">Número de despacho</label><input id="numero-despacho" value={datos.numeroDespacho} onChange={(evento) => setDatos({ ...datos, numeroDespacho: evento.target.value })} className="field-control" /></div>
              <div><label htmlFor="guia-remision" className="field-label">Número de guía de remisión</label><input id="guia-remision" value={datos.numeroGuiaRemision} onChange={(evento) => setDatos({ ...datos, numeroGuiaRemision: evento.target.value })} className="field-control" /></div>
              <div><label htmlFor="fecha-emision" className="field-label">Fecha de emisión</label><input id="fecha-emision" type="date" value={datos.fechaEmision} onChange={(evento) => setDatos({ ...datos, fechaEmision: evento.target.value })} className="field-control" /></div>
              <div><label htmlFor="cliente-entrega" className="field-label">Cliente</label><input id="cliente-entrega" value={datos.clienteNombre} onChange={(evento) => setDatos({ ...datos, clienteNombre: evento.target.value })} className="field-control" /></div>
              <div><label htmlFor="direccion-entrega" className="field-label">Dirección de entrega</label><input id="direccion-entrega" value={datos.direccionEntrega} onChange={(evento) => setDatos({ ...datos, direccionEntrega: evento.target.value })} className="field-control" /></div>
              <div><label htmlFor="fecha-programada" className="field-label">Fecha programada</label><input id="fecha-programada" required type="date" value={datos.fechaProgramada} onChange={(evento) => setDatos({ ...datos, fechaProgramada: evento.target.value })} className="field-control" /></div>
              <div><label htmlFor="fecha-entrega" className="field-label">Fecha de entrega real</label><input id="fecha-entrega" type="date" value={datos.fechaEntrega} onChange={(evento) => setDatos({ ...datos, fechaEntrega: evento.target.value })} className="field-control" /></div>
              <div><label htmlFor="tipo-transporte" className="field-label">Tipo de transporte</label><select id="tipo-transporte" value={datos.tipoTransporte} onChange={(evento) => setDatos({ ...datos, tipoTransporte: evento.target.value as DatosProgramacionEntrega['tipoTransporte'] })} className="field-control"><option value="interno">Interno</option><option value="externo">Externo</option><option value="cliente">Recojo del cliente</option></select></div>
              <div><label htmlFor="modalidad" className="field-label">Modalidad</label><select id="modalidad" value={datos.modalidad} onChange={(evento) => setDatos({ ...datos, modalidad: evento.target.value as DatosProgramacionEntrega['modalidad'] })} className="field-control"><option value="movilidad_propia">Movilidad propia</option><option value="movilidad_externa">Movilidad externa</option><option value="recojo_cliente">Recojo del cliente</option></select></div>
              <div><label htmlFor="transportista" className="field-label">Transportista</label><input id="transportista" value={datos.transportista} onChange={(evento) => setDatos({ ...datos, transportista: evento.target.value })} className="field-control" /></div>
              <div><label htmlFor="conductor" className="field-label">Conductor</label><input id="conductor" value={datos.conductor} onChange={(evento) => setDatos({ ...datos, conductor: evento.target.value })} className="field-control" /></div>
              <div><label htmlFor="vehiculo" className="field-label">Vehículo</label><input id="vehiculo" value={datos.vehiculo} onChange={(evento) => setDatos({ ...datos, vehiculo: evento.target.value })} className="field-control" /></div>
              <div><label htmlFor="placa" className="field-label">Placa</label><input id="placa" value={datos.placa} onChange={(evento) => setDatos({ ...datos, placa: evento.target.value })} className="field-control" /></div>
              <div><label htmlFor="estado-distribucion" className="field-label">Estado</label><select id="estado-distribucion" value={datos.estado} onChange={(evento) => setDatos({ ...datos, estado: evento.target.value as DatosProgramacionEntrega['estado'] })} className="field-control">{Object.entries(etiquetasEstado).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}</select></div>
              <div><label htmlFor="evidencia" className="field-label">Evidencia</label><input id="evidencia" value={datos.evidencia} onChange={(evento) => setDatos({ ...datos, evidencia: evento.target.value })} className="field-control" placeholder="Ej. foto entrega, nombre de archivo o URL" /></div>
              <div className="sm:col-span-2"><label htmlFor="incidencias" className="field-label">Incidencias</label><textarea id="incidencias" rows={2} value={datos.incidencias.join('; ')} onChange={(evento) => setDatos({ ...datos, incidencias: evento.target.value ? evento.target.value.split(';').map((valor) => valor.trim()).filter(Boolean) : [] })} className="field-control" placeholder="Separadas por punto y coma" /></div>
              <div className="sm:col-span-2"><label htmlFor="observaciones-entrega" className="field-label">Observaciones</label><textarea id="observaciones-entrega" rows={3} value={datos.observaciones} onChange={(evento) => setDatos({ ...datos, observaciones: evento.target.value })} className="field-control" /></div>
            </div>
            <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setFormularioAbierto(false)}>Cancelar</Button><Button type="submit">{edicion ? 'Guardar cambios' : 'Programar entrega'}</Button></div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
