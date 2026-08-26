import { AlertTriangle, CalendarClock, ChevronRight, ClipboardList, PackageOpen, Pencil, Plus, RefreshCw, Search, Truck } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { DetalleEntrega, EtiquetaEstadoEntrega } from '@/modulos/distribucion/componentes/DetalleEntrega'
import { DialogoGestionEntrega } from '@/modulos/distribucion/componentes/DialogoGestionEntrega'
import { DialogoProgramarEntrega } from '@/modulos/distribucion/componentes/DialogoProgramarEntrega'
import { useProgramacionesEntrega } from '@/modulos/distribucion/estado/useProgramacionesEntrega'
import { estadosEntrega, etiquetasEstadoEntrega, type PedidoFuenteDistribucion, type ProgramacionEntrega } from '@/modulos/distribucion/modelo/programacionEntrega'
import { obtenerUrlEvidencia } from '@/modulos/distribucion/servicios/distribucionService'
import { exportarConstanciaEntrega } from '@/modulos/distribucion/servicios/exportarConstanciaEntrega'
import { crearRepositorioOperacionesVentaSesion } from '@/modulos/ventas/servicios/repositorioOperacionesVentaSesion'

const formatoFecha = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
const uuidValido = (valor: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)
const normalizar = (valor: string) => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-PE')

function pedidosDeVentas(): PedidoFuenteDistribucion[] {
  return crearRepositorioOperacionesVentaSesion(window.sessionStorage).listar().pedidos
    .filter((pedido) => pedido.estado !== 'cancelado' && uuidValido(pedido.id))
    .map((pedido) => ({
      id: pedido.id,
      numero: pedido.numero,
      clienteId: uuidValido(pedido.clienteId) ? pedido.clienteId : null,
      clienteDocumento: pedido.clienteDocumento,
      clienteNombre: pedido.clienteNombre,
      fechaPedido: pedido.fechaRegistro.slice(0, 10),
      direccionEntrega: '',
      referenciaEntrega: '',
      contactoNombre: '',
      contactoTelefono: '',
      estado: 'pendiente',
      lineas: pedido.lineas.map((linea) => ({
        id: linea.id,
        productoId: uuidValido(linea.productoId) ? linea.productoId : '',
        productoCodigo: linea.productoCodigo,
        productoDescripcion: linea.productoDescripcion,
        unidadMedida: linea.unidadMedida || 'UND',
        cantidadOrdenada: linea.cantidad,
      })),
    }))
}

function cantidadComprometida(entrega: ProgramacionEntrega, lineaId: string) {
  const linea = entrega.lineas.find((item) => item.fuenteLineaId === lineaId)
  if (!linea || ['cancelada', 'rechazada', 'devuelta'].includes(entrega.seguimiento)) return 0
  if (['programada', 'reprogramada', 'en_transito'].includes(entrega.seguimiento)) return linea.cantidadEnviada
  return Math.max(0, linea.cantidadEntregada - linea.cantidadDevuelta)
}

export function DistribucionPage() {
  const pedidosSesion = useMemo(pedidosDeVentas, [])
  const {
    pedidosPersistidos, programaciones, cargando, actualizando, error,
    guardar, transicionar, guardarIncidencia, registrarDevolucion, subirEvidencia,
    puedeAdministrar, puedeSeguir, puedeAdjuntar, guardando,
  } = useProgramacionesEntrega()
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | ProgramacionEntrega['seguimiento']>('todos')
  const [programando, setProgramando] = useState<{ pedido: PedidoFuenteDistribucion; entrega?: ProgramacionEntrega } | null>(null)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [gestionId, setGestionId] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState('')
  const busquedaDiferida = useDeferredValue(busqueda)

  const pedidos = useMemo(() => {
    const unificados = new Map(pedidosSesion.map((pedido) => [pedido.id, pedido]))
    for (const pedido of pedidosPersistidos) unificados.set(pedido.id, pedido)
    return [...unificados.values()]
  }, [pedidosSesion, pedidosPersistidos])

  const saldoLinea = (pedidoId: string, lineaId: string, entregaId?: string) => {
    const pedido = pedidos.find((item) => item.id === pedidoId)
    const linea = pedido?.lineas.find((item) => item.id === lineaId)
    if (!linea) return 0
    const comprometido = programaciones
      .filter((entrega) => entrega.pedidoId === pedidoId && entrega.id !== entregaId)
      .reduce((total, entrega) => total + cantidadComprometida(entrega, lineaId), 0)
    return Math.max(0, linea.cantidadOrdenada - comprometido)
  }

  const pedidosPendientes = pedidos.filter((pedido) =>
    pedido.estado !== 'cancelado' && pedido.lineas.some((linea) => saldoLinea(pedido.id, linea.id) > 0),
  )
  const termino = normalizar(busquedaDiferida)
  const filtradas = programaciones.filter((entrega) => {
    const coincideTexto = normalizar(`${entrega.pedidoNumero} ${entrega.clienteNombre} ${entrega.numeroGuiaRemision} ${entrega.vehiculoPlaca}`).includes(termino)
    return coincideTexto && (filtroEstado === 'todos' || entrega.seguimiento === filtroEstado)
  })
  const detalle = programaciones.find((item) => item.id === detalleId) ?? null
  const gestion = programaciones.find((item) => item.id === gestionId) ?? null

  const guardarProgramacion = async (...argumentos: Parameters<typeof guardar>) => {
    await guardar(...argumentos)
    setProgramando(null)
    setMensaje(argumentos[1] ? 'Programación actualizada correctamente.' : 'Entrega programada correctamente.')
  }

  const abrirEvidencia = async (ruta: string) => {
    try {
      const url = await obtenerUrlEvidencia(ruta)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (problema) {
      setMensaje(problema instanceof Error ? problema.message : 'No se pudo abrir la evidencia')
    }
  }

  return (
    <div className="page-shell space-y-6">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-kicker">Operación logística</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Distribución</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Programa despachos parciales, controla la ruta y conserva la trazabilidad desde la salida hasta la entrega o devolución.</p>
        </div>
        {puedeAdministrar && pedidosPendientes.length ? <Button type="button" size="lg" onClick={() => setProgramando({ pedido: pedidosPendientes[0] })}><Plus aria-hidden="true" /> Programar despacho</Button> : null}
      </header>

      <section aria-label="Resumen de distribución" className="ledger-sheet overflow-hidden">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          {[
            { etiqueta: 'Pedidos con saldo', valor: pedidosPendientes.length, icono: ClipboardList },
            { etiqueta: 'Programadas', valor: programaciones.filter((item) => ['programada', 'reprogramada'].includes(item.seguimiento)).length, icono: CalendarClock },
            { etiqueta: 'En tránsito', valor: programaciones.filter((item) => item.seguimiento === 'en_transito').length, icono: Truck },
            { etiqueta: 'Incidencias abiertas', valor: programaciones.reduce((total, item) => total + item.incidencias.filter((incidencia) => !['resuelta', 'cerrada'].includes(incidencia.estado)).length, 0), icono: AlertTriangle },
          ].map(({ etiqueta, valor, icono: Icono }) => <article key={etiqueta} className="border-b px-5 py-5 last:border-b-0 sm:border-e sm:[&:nth-child(2)]:border-e-0 xl:border-b-0 xl:[&:nth-child(2)]:border-e xl:last:border-e-0"><div className="flex justify-between"><p className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">{etiqueta}</p><Icono aria-hidden="true" className="size-4 text-primary" /></div><p className="mt-3 font-mono text-2xl font-semibold">{valor}</p></article>)}
        </div>
      </section>

      {(error || mensaje) ? <div role={error ? 'alert' : 'status'} className={`flex items-start gap-2 border px-4 py-3 text-sm ${error ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-primary/25 bg-primary/5 text-foreground'}`}><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{error || mensaje}</div> : <p role="status" aria-live="polite" className="sr-only">{actualizando ? 'Actualizando distribución' : ''}</p>}

      <section aria-labelledby="pendientes-title" className="ledger-sheet">
        <div className="flex flex-col gap-3 border-b px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><h2 id="pendientes-title" className="text-lg font-semibold">Pedidos listos para programar</h2><p className="mt-1 text-sm text-muted-foreground">El saldo pendiente puede dividirse en más de un despacho.</p></div>{actualizando ? <RefreshCw aria-label="Actualizando" className="size-4 animate-spin text-primary" /> : null}</div>
        {cargando ? <p className="px-5 py-8 text-sm text-muted-foreground">Cargando operación logística…</p> : !pedidosPendientes.length ? <div className="px-5 py-9 text-center"><PackageOpen aria-hidden="true" className="mx-auto size-7 text-primary" /><p className="mt-3 text-sm font-medium">No hay cantidades pendientes de programación.</p></div> : <div className="divide-y">{pedidosPendientes.map((pedido) => <article key={pedido.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><p className="font-mono text-xs text-primary">{pedido.numero}</p><h3 className="mt-1 font-semibold">{pedido.clienteNombre}</h3><p className="mt-1 text-xs text-muted-foreground">{pedido.lineas.filter((linea) => saldoLinea(pedido.id, linea.id) > 0).length} producto(s) con saldo · {formatoFecha.format(new Date(`${pedido.fechaPedido}T12:00:00`))}</p></div>{puedeAdministrar ? <Button type="button" variant="outline" onClick={() => setProgramando({ pedido })}><Plus aria-hidden="true" /> Programar</Button> : null}</article>)}</div>}
      </section>

      <section aria-labelledby="rutas-title" className="ledger-sheet">
        <div className="grid gap-4 border-b px-5 py-5 sm:px-6 lg:grid-cols-[1fr_18rem_13rem] lg:items-end">
          <div><h2 id="rutas-title" className="text-lg font-semibold">Hojas de ruta</h2><p className="mt-1 text-sm text-muted-foreground">{filtradas.length} de {programaciones.length} despachos</p></div>
          <div><label htmlFor="buscar-ruta" className="field-label">Buscar</label><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input id="buscar-ruta" type="search" className="field-control ps-9" placeholder="Pedido, cliente, guía o placa" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></div></div>
          <div><label htmlFor="estado-ruta" className="field-label">Estado</label><select id="estado-ruta" className="field-control" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}><option value="todos">Todos</option>{estadosEntrega.map((estado) => <option key={estado} value={estado}>{etiquetasEstadoEntrega[estado]}</option>)}</select></div>
        </div>
        {!filtradas.length ? <div className="px-5 py-14 text-center"><Truck aria-hidden="true" className="mx-auto size-8 text-primary" /><h3 className="mt-4 font-semibold">{programaciones.length ? 'No hay coincidencias' : 'Aún no hay despachos registrados'}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Programa un pedido para crear su primera hoja de ruta.</p></div> : <div className="divide-y">{filtradas.map((entrega) => <article key={entrega.id} className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[1.3fr_0.8fr_0.8fr_auto] lg:items-center"><button type="button" className="text-start" onClick={() => setDetalleId(entrega.id)}><p className="font-mono text-xs text-primary">{entrega.pedidoNumero} · Guía {entrega.numeroGuiaRemision}</p><h3 className="mt-1 font-semibold">{entrega.clienteNombre}</h3><p className="mt-1 text-xs text-muted-foreground">Despacho {entrega.secuencia} · {entrega.lineas.length} producto(s)</p></button><div><p className="text-xs text-muted-foreground">Fecha programada</p><p className="mt-1 text-sm">{formatoFecha.format(new Date(`${entrega.fechaEntrega}T12:00:00`))}</p></div><div><EtiquetaEstadoEntrega estado={entrega.seguimiento} />{entrega.incidencias.some((item) => !['resuelta', 'cerrada'].includes(item.estado)) ? <p className="mt-2 text-xs text-amber-700">Incidencia pendiente</p> : null}</div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setDetalleId(entrega.id)}>Ver detalle <ChevronRight aria-hidden="true" /></Button>{puedeAdministrar && ['programada', 'reprogramada'].includes(entrega.seguimiento) ? <Button type="button" size="icon-sm" variant="ghost" aria-label={`Editar ${entrega.numeroGuiaRemision}`} onClick={() => { const pedido = pedidos.find((item) => item.id === entrega.pedidoId); if (pedido) setProgramando({ pedido, entrega }) }}><Pencil aria-hidden="true" /></Button> : null}</div></article>)}</div>}
      </section>

      {programando ? <DialogoProgramarEntrega pedidoInicial={programando.pedido} entrega={programando.entrega} saldoLinea={saldoLinea} guardando={guardando} alCerrar={() => setProgramando(null)} alGuardar={guardarProgramacion} /> : null}
      {detalle ? <DetalleEntrega entrega={detalle} puedeGestionar={puedeSeguir || puedeAdjuntar} alCerrar={() => setDetalleId(null)} alGestionar={() => setGestionId(detalle.id)} alExportar={() => void exportarConstanciaEntrega(detalle)} alAbrirEvidencia={abrirEvidencia} /> : null}
      {gestion ? <DialogoGestionEntrega entrega={gestion} puedeSeguir={puedeSeguir} puedeAdjuntar={puedeAdjuntar} guardando={guardando} alCerrar={() => setGestionId(null)} alTransicionar={(datos) => transicionar(gestion.id, datos)} alGuardarIncidencia={(datos) => guardarIncidencia(gestion.id, datos)} alRegistrarDevolucion={(datos) => registrarDevolucion(gestion.id, datos)} alSubirEvidencia={(archivo, tipo, notas) => subirEvidencia(gestion.id, archivo, tipo, notas)} /> : null}
    </div>
  )
}
