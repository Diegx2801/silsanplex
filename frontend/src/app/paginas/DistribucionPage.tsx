import { Eye, FileDown, Pencil, Plus, Search, Truck } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { PaginacionListado, type TamanioPaginaListado } from '@/components/ui/PaginacionListado'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { useAuth } from '@/features/auth/useAuth'
import { PERMISSIONS } from '@/features/auth/permissions'
import { fechaActualPeru, ZONA_HORARIA_NEGOCIO } from '@/lib/fechas'
import { useClientes } from '@/modulos/clientes/estado/useClientes'
import { DialogoDetalleEntrega } from '@/modulos/distribucion/componentes/DialogoDetalleEntrega'
import { useProgramacionesEntrega } from '@/modulos/distribucion/estado/useProgramacionesEntrega'
import { pedidoListoParaProgramarDistribucion } from '@/modulos/distribucion/modelo/pedidosProgramables'
import {
  esquemaDatosProgramacionEntrega,
  filtrarProgramacionesEntrega,
  listarEntregasAtrasadas,
  obtenerEstadosSiguientes,
  resumirEntregas,
  type DatosProgramacionEntrega,
  type ProgramacionEntrega,
} from '@/modulos/distribucion/modelo/programacionEntrega'
import { formatearFechaDistribucion } from '@/modulos/distribucion/servicios/formatoDistribucion'
import { DialogoDetalleOperacionVenta } from '@/modulos/ventas/componentes/DialogoDetalleOperacionVenta'
import type { PedidoVenta } from '@/modulos/ventas/modelo/operacionVenta'
import { usePedidosPersistentes } from '@/modulos/ventas/estado/usePedidosPersistentes'
import { useVentasPersistentes } from '@/modulos/ventas/estado/useVentasPersistentes'

const hoy = fechaActualPeru()
const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  timeZone: ZONA_HORARIA_NEGOCIO,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})
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

function tonoEstadoDistribucion(estado: ProgramacionEntrega['estado']) {
  if (estado === 'entregado') return 'listo'
  if (estado === 'rechazado' || estado === 'devuelto' || estado === 'cancelado') return 'revision'
  return 'pendiente'
}
type VistaDistribucion = 'pendientes' | 'seguimiento'

function normalizarBusqueda(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-PE')
}

function etiquetaCumplimientoPedido(pedido: PedidoVenta) {
  return pedido.estadoCumplimiento === 'dispatched'
    ? 'Despachado · pendiente de entrega'
    : 'Bienes despachados · venta en curso'
}

export function DistribucionPage() {
  const [parametros, setParametros] = useSearchParams()
  const vista: VistaDistribucion = parametros.get('vista') === 'seguimiento' ? 'seguimiento' : 'pendientes'
  const { hasPermission } = useAuth()
  const puedeGestionarDistribucion = hasPermission(PERMISSIONS.DISTRIBUTION_MANAGE)
  const { clientes } = useClientes()
  const { pedidos, cargando: cargandoPedidos, error: errorPedidos, reintentar: reintentarPedidos } = usePedidosPersistentes()
  const { ventas, cargando: cargandoVentas, error: errorVentas, reintentar: reintentarVentas } = useVentasPersistentes()
  const { programaciones, guardar, actualizarEstado, error: errorProgramaciones, reintentar: reintentarProgramaciones } = useProgramacionesEntrega()
  const [busquedaPendientes, setBusquedaPendientes] = useState('')
  const [filtroAlmacenPendientes, setFiltroAlmacenPendientes] = useState('')
  const [paginaPendientes, setPaginaPendientes] = useState(1)
  const [tamanioPaginaPendientes, setTamanioPaginaPendientes] = useState<TamanioPaginaListado>(10)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | ProgramacionEntrega['estado']>('todos')
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('')
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('')
  const [paginaSeguimiento, setPaginaSeguimiento] = useState(1)
  const [tamanioPaginaSeguimiento, setTamanioPaginaSeguimiento] = useState<TamanioPaginaListado>(10)
  const [formularioAbierto, setFormularioAbierto] = useState(false)
  const [edicion, setEdicion] = useState<ProgramacionEntrega | null>(null)
  const [pedidoDetalle, setPedidoDetalle] = useState<PedidoVenta | null>(null)
  const [entregaDetalle, setEntregaDetalle] = useState<ProgramacionEntrega | null>(null)
  const disparadorPedidoDetalle = useRef<HTMLButtonElement | null>(null)
  const [direccionSeleccionadaId, setDireccionSeleccionadaId] = useState('')
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
  const ventaPorPedido = useMemo(() => new Map(ventas.map((venta) => [venta.pedidoId, venta])), [ventas])
  const pedidosDisponibles = useMemo(() => pedidos.filter((pedido) => {
    const esEntregaActual = edicion?.pedidoId === pedido.id
      && (pedido.modalidadCumplimiento ?? 'delivery') === 'delivery'
      && pedido.lineas.some((linea) => linea.tipoProducto === 'good')
    const puedeCrearEntrega = pedidoListoParaProgramarDistribucion(pedido, ventaPorPedido.get(pedido.id))
    return (puedeCrearEntrega || esEntregaActual)
      && !programaciones.some((item) => item.pedidoId === pedido.id && item.id !== edicion?.id)
  }), [edicion?.id, edicion?.pedidoId, pedidos, programaciones, ventaPorPedido])
  const pedidosPorProgramar = useMemo(() => pedidos.filter(
    (pedido) => pedidoListoParaProgramarDistribucion(pedido, ventaPorPedido.get(pedido.id)) && !programaciones.some((item) => item.pedidoId === pedido.id),
  ), [pedidos, programaciones, ventaPorPedido])
  const almacenesPendientes = useMemo(() => Array.from(new Set(pedidosPorProgramar.map((pedido) => pedido.almacenNombre).filter((almacen): almacen is string => Boolean(almacen)))).sort((a, b) => a.localeCompare(b, 'es-PE')), [pedidosPorProgramar])
  const pedidosPorProgramarFiltrados = useMemo(() => {
    const termino = normalizarBusqueda(busquedaPendientes.trim())
    return pedidosPorProgramar
      .filter((pedido) => {
        const texto = normalizarBusqueda(`${pedido.numero} ${pedido.clienteNombre} ${pedido.almacenNombre ?? ''}`)
        const coincideAlmacen = !filtroAlmacenPendientes || pedido.almacenNombre === filtroAlmacenPendientes
        return coincideAlmacen && (!termino || texto.includes(termino))
      })
      .toSorted((a, b) => (b.fechaRegistro ?? '').localeCompare(a.fechaRegistro ?? ''))
  }, [busquedaPendientes, filtroAlmacenPendientes, pedidosPorProgramar])
  const totalPaginasPendientes = Math.max(1, Math.ceil(pedidosPorProgramarFiltrados.length / tamanioPaginaPendientes))
  const paginaPendientesVisible = Math.min(paginaPendientes, totalPaginasPendientes)
  const pedidosPorProgramarVisibles = pedidosPorProgramarFiltrados.slice(
    (paginaPendientesVisible - 1) * tamanioPaginaPendientes,
    paginaPendientesVisible * tamanioPaginaPendientes,
  )
  const filtradas = filtrarProgramacionesEntrega(programaciones, {
    busqueda: busquedaDiferida,
    estado: filtroEstado,
    fechaDesde: filtroFechaDesde,
    fechaHasta: filtroFechaHasta,
  })
  const totalPaginasSeguimiento = Math.max(1, Math.ceil(filtradas.length / tamanioPaginaSeguimiento))
  const paginaSeguimientoVisible = Math.min(paginaSeguimiento, totalPaginasSeguimiento)
  const entregasVisibles = filtradas.slice(
    (paginaSeguimientoVisible - 1) * tamanioPaginaSeguimiento,
    paginaSeguimientoVisible * tamanioPaginaSeguimiento,
  )
  const resumen = resumirEntregas(programaciones, hoy)
  const entregasAtrasadas = listarEntregasAtrasadas(programaciones, hoy)

  const pedidoPorId = (pedidoId: string) => pedidos.find((pedido) => pedido.id === pedidoId)
  const ventaPorPedidoId = (pedidoId: string) => ventaPorPedido.get(pedidoId)
  const pedidoSeleccionado = pedidoPorId(datos.pedidoId)
  const clienteSeleccionado = clientes.find((cliente) => cliente.id === pedidoSeleccionado?.clienteId)
  const direccionesCliente = useMemo(() => clienteSeleccionado?.direccionesEntrega ?? [], [clienteSeleccionado])
  const opcionesDirecciones = useMemo<ComboboxOption[]>(() => [
    ...direccionesCliente.map((direccion) => ({
      value: direccion.id ?? direccion.direccion,
      label: direccion.etiqueta || direccion.direccion,
      secondaryText: [direccion.direccion, direccion.ubigeo, direccion.referencia].filter(Boolean).join(' · '),
      keywords: [direccion.direccion, direccion.ubigeo, direccion.referencia],
    })),
    { value: '__manual__', label: 'Ingresar otra dirección', secondaryText: 'Usa esta opción solo si no está en el maestro del cliente' },
  ], [direccionesCliente])
  const lineasPedido = (pedidoSeleccionado?.lineas ?? datos.lineas).filter((linea) => linea.tipoProducto === 'good')
  const esRecojoCliente = datos.modalidad === 'recojo_cliente'
  const estadoRequiereTransporte = ['en_curso', 'en_destino', 'entregado', 'entrega_parcial'].includes(datos.estado)
  const requiereDatosTransporte = estadoRequiereTransporte && !esRecojoCliente
  const requiereTransportista = requiereDatosTransporte && datos.tipoTransporte === 'externo'

  const cambiarVista = (siguiente: VistaDistribucion) => {
    setParametros(siguiente === 'pendientes' ? {} : { vista: siguiente })
  }

  useEffect(() => {
    if (!formularioAbierto || !datos.pedidoId || datos.direccionEntrega || !direccionesCliente.length) return
    const principal = direccionesCliente.find((direccion) => direccion.principal) ?? direccionesCliente[0]
    if (!principal) return
    setDireccionSeleccionadaId(principal.id ?? principal.direccion)
    setDatos((actuales) => ({ ...actuales, direccionEntrega: principal.direccion }))
  }, [datos.direccionEntrega, datos.pedidoId, direccionesCliente, formularioAbierto])

  const abrirFormulario = (programacion?: ProgramacionEntrega) => {
    setEdicion(programacion ?? null)
    const pedidoOrigen = programacion ? pedidoPorId(programacion.pedidoId) : undefined
    const clienteOrigen = clientes.find((cliente) => cliente.id === pedidoOrigen?.clienteId)
    const direccionOrigen = clienteOrigen?.direccionesEntrega.find((direccion) => direccion.direccion === programacion?.direccionEntrega)
    setDireccionSeleccionadaId(programacion
      ? direccionOrigen?.id ?? (programacion.direccionEntrega ? '__manual__' : '')
      : '')
    setDatos(programacion
      ? {
          pedidoId: programacion.pedidoId,
          lockVersion: programacion.lockVersion,
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
    const venta = ventaPorPedidoId(pedidoId)
    if (!pedido || !venta) {
      setMensaje('El pedido debe tener una venta persistente para programar su entrega')
      return
    }
    if (!pedidoListoParaProgramarDistribucion(pedido, venta)) {
      setMensaje('Completa el despacho de todos los bienes en Ventas antes de programar la entrega')
      return
    }
    setEdicion(null)
    const cliente = clientes.find((item) => item.id === pedido.clienteId)
    const direccionPrincipal = cliente?.direccionesEntrega.find((direccion) => direccion.principal) ?? cliente?.direccionesEntrega[0]
    setDireccionSeleccionadaId(direccionPrincipal?.id ?? direccionPrincipal?.direccion ?? '')
    setDatos({
      pedidoId: pedido.id,
      pedidoNumero: pedido.numero,
      ventaId: venta.id,
      ventaNumero: venta.numeroInterno,
      clienteNombre: pedido.clienteNombre,
      direccionEntrega: direccionPrincipal?.direccion ?? '',
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
    const venta = ventaPorPedidoId(pedidoId)
    const cliente = clientes.find((item) => item.id === pedido?.clienteId)
    const direccionPrincipal = cliente?.direccionesEntrega.find((direccion) => direccion.principal) ?? cliente?.direccionesEntrega[0]
    setDireccionSeleccionadaId(direccionPrincipal?.id ?? direccionPrincipal?.direccion ?? '')
    setDatos((actuales) => ({
      ...actuales,
      pedidoId,
      pedidoNumero: pedido?.numero ?? '',
      ventaId: venta?.id ?? '',
      ventaNumero: venta?.numeroInterno ?? '',
      clienteNombre: pedido?.clienteNombre ?? '',
      direccionEntrega: direccionPrincipal?.direccion ?? '',
      lineas: pedido?.lineas ?? [],
    }))
  }

  const enviar = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const resultado = esquemaDatosProgramacionEntrega.safeParse(datos)
    if (!resultado.success) {
      setMensaje(resultado.error.issues[0]?.message ?? 'Revisa los datos')
      return
    }
    const pedido = pedidoPorId(resultado.data.pedidoId)
    const venta = ventaPorPedidoId(resultado.data.pedidoId)
    if ((!pedido || !venta) && !edicion) {
      setMensaje('El pedido o la venta persistente ya no están disponibles; recarga la página')
      return
    }
    if (!edicion && pedido && !pedidoListoParaProgramarDistribucion(pedido, venta)) {
      setMensaje('Completa el despacho de todos los bienes en Ventas antes de programar la entrega')
      return
    }
    const datosPersistentes = {
      ...resultado.data,
      pedidoNumero: pedido?.numero ?? edicion?.pedidoNumero ?? resultado.data.pedidoNumero,
      clienteNombre: pedido?.clienteNombre ?? edicion?.clienteNombre ?? resultado.data.clienteNombre,
      ventaId: venta?.id ?? edicion?.ventaId ?? '',
      ventaNumero: venta?.numeroInterno ?? edicion?.ventaNumero ?? '',
    }
    const error = await guardar(datosPersistentes, edicion?.id, pedido?.lineas ?? edicion?.lineas ?? [])
    setMensaje(error ?? (edicion ? 'Distribución actualizada.' : 'Distribución programada.'))
    if (!error) setFormularioAbierto(false)
  }

  const exportarEntrega = (id: string) => {
    const entrega = programaciones.find((item) => item.id === id)
    if (!entrega) return
    const pedido = pedidoPorId(entrega.pedidoId)
    const lineas = entrega.lineas.length ? entrega.lineas : pedido?.lineas ?? []
    if (!lineas.length) {
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
    dibujarDato('Fecha de emisión', formatearFechaDistribucion(entrega.fechaEmision), margen, 55)
    dibujarDato('Fecha de entrega', formatearFechaDistribucion(entrega.fechaEntrega), 78, 55)
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
    pdf.text('PEDIDAS', 132, y + 6, { align: 'right' })
    pdf.text('DESPACHADAS', 162, y + 6, { align: 'right' })
    pdf.text('PENDIENTES', 190, y + 6, { align: 'right' })
    y += 9

    pdf.setFont('helvetica', 'normal')
    lineas.forEach((linea, indice) => {
      const descripcion = pdf.splitTextToSize(linea.productoDescripcion, 100)
      const despachada = linea.cantidadDespachada ?? 0
      const pendiente = linea.cantidadPendiente ?? Math.max(linea.cantidad - despachada, 0)
      const alto = Math.max(10, descripcion.length * 4 + 6)
      if (indice % 2 === 0) {
        pdf.setFillColor(248, 250, 249)
        pdf.rect(margen, y, ancho, alto, 'F')
      }
      pdf.setTextColor(...tinta)
      pdf.setFontSize(9)
      pdf.text(descripcion, margen + 4, y + 6)
      pdf.text(linea.unidadMedida || '-', 118, y + 6)
      pdf.setFont('helvetica', 'bold')
      pdf.text(String(linea.cantidad), 132, y + 6, { align: 'right' })
      pdf.text(String(despachada), 162, y + 6, { align: 'right' })
      pdf.text(String(pendiente), 190, y + 6, { align: 'right' })
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
        {puedeGestionarDistribucion ? <Button type="button" size="lg" onClick={() => abrirFormulario()}><Plus aria-hidden="true" /> Programar entrega</Button> : null}
      </header>

      <nav aria-label="Secciones de distribución" role="tablist" className="flex flex-wrap gap-2 border-b pb-2 print:hidden">
        <Link
          to="/distribucion"
          role="tab"
          aria-selected={vista === 'pendientes'}
          className={vista === 'pendientes' ? 'border-b-2 border-primary px-4 py-2 text-sm font-semibold text-primary' : 'px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground'}
          onClick={(evento) => { evento.preventDefault(); cambiarVista('pendientes') }}
        >
          Por programar
        </Link>
        <Link
          to="/distribucion?vista=seguimiento"
          role="tab"
          aria-selected={vista === 'seguimiento'}
          className={vista === 'seguimiento' ? 'border-b-2 border-primary px-4 py-2 text-sm font-semibold text-primary' : 'px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground'}
          onClick={(evento) => { evento.preventDefault(); cambiarVista('seguimiento') }}
        >
          Seguimiento de entregas
        </Link>
      </nav>

      <section aria-label="Resumen de distribución" className="ledger-sheet">
        <div className="grid sm:grid-cols-3">
          {[
            ['Por programar', pedidosPorProgramar.length],
            ['Programadas', resumen.programados],
            ['En curso', resumen.enCurso],
            ['En destino', resumen.enDestino],
            ['Entregadas', resumen.entregados],
            ['Atrasadas', resumen.atrasadas],
            ['Con incidencias', resumen.conIncidencias],
          ].map(([etiqueta, valor]) => (
            <article key={etiqueta} className="border-b px-5 py-5 last:border-b-0 sm:border-e sm:last:border-e-0 sm:border-b-0">
              <div className="flex justify-between"><p className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">{etiqueta}</p><Truck aria-hidden="true" className="size-4 text-primary" /></div>
              <p className="mt-3 font-mono text-2xl font-semibold">{valor}</p>
            </article>
          ))}
        </div>
      </section>

      <p role="status" aria-live="polite" className="sr-only">{mensaje}</p>
      {errorPedidos || errorVentas || errorProgramaciones ? (
        <aside role="alert" className="flex flex-wrap items-center justify-between gap-3 border-s-4 border-destructive bg-destructive/10 px-5 py-4 text-sm">
          <span>No se pudieron cargar los pedidos, ventas o entregas persistentes.</span>
          <Button type="button" variant="outline" onClick={() => { void reintentarPedidos(); void reintentarVentas(); void reintentarProgramaciones() }}>Reintentar</Button>
        </aside>
      ) : null}
      {vista === 'pendientes' ? (
        <section aria-labelledby="pendientes-programacion-title" className="ledger-sheet">
          <div className="grid gap-4 border-b px-5 py-5 sm:px-6 lg:grid-cols-[minmax(14rem,1fr)_minmax(15rem,18rem)_minmax(13rem,16rem)] lg:items-end">
            <div>
              <h2 id="pendientes-programacion-title" className="text-lg font-semibold">Pedidos por programar</h2>
              <p className="mt-1 text-sm text-muted-foreground">{pedidosPorProgramarFiltrados.length} de {pedidosPorProgramar.length} pedidos con bienes despachados y sin entrega asignada.</p>
            </div>
            <div>
              <label htmlFor="buscar-pedido-pendiente" className="field-label">Buscar</label>
              <div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input id="buscar-pedido-pendiente" type="search" value={busquedaPendientes} onChange={(evento) => { setBusquedaPendientes(evento.target.value); setPaginaPendientes(1) }} className="field-control ps-9" placeholder="Pedido, cliente o almacén" /></div>
            </div>
            <div>
              <label htmlFor="almacen-pendiente" className="field-label">Almacén</label>
              <select id="almacen-pendiente" value={filtroAlmacenPendientes} onChange={(evento) => { setFiltroAlmacenPendientes(evento.target.value); setPaginaPendientes(1) }} className="field-control">
                <option value="">Todos</option>
                {almacenesPendientes.map((almacen) => <option key={almacen} value={almacen}>{almacen}</option>)}
              </select>
            </div>
          </div>
          {cargandoPedidos || cargandoVentas ? (
            <p className="px-5 py-6 text-sm text-muted-foreground sm:px-6">Cargando pedidos persistentes…</p>
          ) : !pedidosPorProgramarFiltrados.length ? (
            <div className="px-5 py-14 text-center sm:px-6"><Truck aria-hidden="true" className="mx-auto size-8 text-primary" /><h3 className="mt-4 font-semibold">{pedidosPorProgramar.length ? 'No hay coincidencias' : 'No hay pedidos listos para programar'}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{pedidosPorProgramar.length ? 'Prueba con otra búsqueda o limpia el filtro de almacén.' : 'Aquí aparecen pedidos de envío cuando todos sus bienes están despachados. Los despachos parciales continúan en Ventas y los recojos del cliente se gestionan allí.'}</p></div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full min-w-[58rem] border-collapse text-left text-sm"><thead className="border-b bg-muted/45"><tr><th className="px-5 py-3 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Pedido</th><th className="px-4 py-3 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Cliente</th><th className="px-4 py-3 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Almacén</th><th className="px-4 py-3 text-end font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Productos</th><th className="px-4 py-3 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Estado</th><th className="px-5 py-3 text-end font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Acciones</th></tr></thead><tbody className="divide-y">{pedidosPorProgramarVisibles.map((pedido) => { const cantidadProductos = pedido.lineas.filter((linea) => linea.tipoProducto === 'good').length; return <tr key={pedido.id} className="hover:bg-muted/35"><td className="px-5 py-4 font-mono text-xs font-medium text-primary">{pedido.numero}</td><td className="max-w-[18rem] px-4 py-4"><p className="truncate font-medium">{pedido.clienteNombre}</p><p className="mt-1 text-xs text-muted-foreground">{pedido.clienteDocumento}</p></td><td className="px-4 py-4 text-sm text-muted-foreground">{pedido.almacenNombre ?? 'No especificado'}</td><td className="px-4 py-4 text-end font-mono tabular-nums">{cantidadProductos}</td><td className="px-4 py-4"><span className="status-label" data-tone={pedido.estadoCumplimiento === 'dispatched' ? 'listo' : 'pendiente'}>{etiquetaCumplimientoPedido(pedido)}</span></td><td className="px-5 py-4 text-end"><div className="flex justify-end gap-1"> <Button type="button" variant="ghost" size="icon" title="Ver detalle del pedido" aria-label={`Ver detalle de ${pedido.numero}`} onClick={(evento) => { disparadorPedidoDetalle.current = evento.currentTarget; setPedidoDetalle(pedido) }}><Eye aria-hidden="true" /></Button>{puedeGestionarDistribucion ? <Button type="button" onClick={() => prepararPedido(pedido.id)}><Plus aria-hidden="true" /> Programar</Button> : null}</div></td></tr> })}</tbody></table></div>
          )}
          {pedidosPorProgramarFiltrados.length ? <PaginacionListado etiqueta="pedidos por programar" pagina={paginaPendientesVisible} tamanioPagina={tamanioPaginaPendientes} total={pedidosPorProgramarFiltrados.length} totalPaginas={totalPaginasPendientes} cantidadVisible={pedidosPorProgramarVisibles.length} alCambiarPagina={setPaginaPendientes} alCambiarTamanio={(siguiente) => { setTamanioPaginaPendientes(siguiente); setPaginaPendientes(1) }} /> : null}
        </section>
      ) : null}

      {vista === 'seguimiento' ? (
        <>
          {entregasAtrasadas.length ? (
            <section aria-label="Alertas de entregas atrasadas" className="ledger-sheet border border-amber-200 bg-amber-50/80">
              <div className="border-b border-amber-200 px-5 py-4 sm:px-6">
                <h2 className="text-base font-semibold text-amber-900">Alertas operativas</h2>
              </div>
              <div className="divide-y divide-amber-200">
                {entregasAtrasadas.slice(0, 4).map((entrega) => (
                  <article key={entrega.id} className="flex flex-col gap-2 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div><p className="font-mono text-xs text-amber-700">{entrega.pedidoNumero}</p><p className="font-medium text-amber-900">{entrega.clienteNombre}</p></div>
                    <div className="text-amber-800"><span className="font-semibold">{entrega.diasAtraso} día{entrega.diasAtraso === 1 ? '' : 's'} de retraso</span>{entrega.incidencias.length ? <span className="ml-2">· {entrega.incidencias[0]}</span> : null}</div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          <section aria-labelledby="entregas-title" className="ledger-sheet">
            <div className="grid gap-4 border-b px-5 py-5 sm:px-6 lg:grid-cols-[minmax(14rem,1fr)_minmax(15rem,18rem)_minmax(13rem,16rem)] lg:items-end print:hidden">
              <div><h2 id="entregas-title" className="text-lg font-semibold">Seguimiento de entregas</h2><p className="mt-1 text-sm text-muted-foreground">{filtradas.length} de {programaciones.length} entregas visibles</p></div>
              <div><label htmlFor="buscar-entrega" className="field-label">Buscar</label><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input id="buscar-entrega" type="search" value={busqueda} onChange={(evento) => { setBusqueda(evento.target.value); setPaginaSeguimiento(1) }} className="field-control ps-9" placeholder="Pedido, cliente o guía" /></div></div>
              <div><label htmlFor="estado-filtro" className="field-label">Estado</label><select id="estado-filtro" value={filtroEstado} onChange={(evento) => { setFiltroEstado(evento.target.value as 'todos' | ProgramacionEntrega['estado']); setPaginaSeguimiento(1) }} className="field-control"><option value="todos">Todos</option>{Object.entries(etiquetasEstado).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}</select></div>
            </div>
            <div className="grid gap-4 border-b bg-muted/20 px-5 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1fr_1fr_auto] lg:items-end print:hidden">
              <div><label htmlFor="fecha-filtro-desde" className="field-label">Fecha desde</label><input id="fecha-filtro-desde" type="date" value={filtroFechaDesde} max={filtroFechaHasta || undefined} onChange={(evento) => { setFiltroFechaDesde(evento.target.value); setPaginaSeguimiento(1) }} className="field-control" /></div>
              <div><label htmlFor="fecha-filtro-hasta" className="field-label">Fecha hasta</label><input id="fecha-filtro-hasta" type="date" value={filtroFechaHasta} min={filtroFechaDesde || undefined} onChange={(evento) => { setFiltroFechaHasta(evento.target.value); setPaginaSeguimiento(1) }} className="field-control" /></div>
              {filtroFechaDesde || filtroFechaHasta || filtroEstado !== 'todos' || busqueda ? <Button type="button" variant="outline" onClick={() => { setBusqueda(''); setFiltroEstado('todos'); setFiltroFechaDesde(''); setFiltroFechaHasta(''); setPaginaSeguimiento(1) }}>Limpiar filtros</Button> : <span aria-hidden="true" />}
            </div>
            {!filtradas.length ? (
              <div className="px-5 py-14 text-center sm:px-6"><Truck aria-hidden="true" className="mx-auto size-8 text-primary" /><h3 className="mt-4 font-semibold">{programaciones.length ? 'No hay coincidencias' : 'Aún no hay entregas programadas'}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{programaciones.length ? 'Prueba con otra búsqueda o limpia los filtros.' : 'Programa una entrega desde un pedido confirmado para iniciar el seguimiento.'}</p></div>
            ) : (
              <div className="divide-y">{entregasVisibles.map((item) => (
                <article key={item.id} className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[1.1fr_1fr_1fr_auto] lg:items-center">
                  <div className="print-delivery-header"><p className="font-mono text-xs text-primary">SILSANPLEX · CONSTANCIA DE ENTREGA</p><p className="font-mono text-xs text-muted-foreground">Emisión: {formatearFechaDistribucion(item.fechaEmision)}</p></div>
                  <div><p className="font-mono text-xs text-primary">{item.pedidoNumero} · {item.ventaNumero ? `Venta ${item.ventaNumero} · ` : ''}Guía {item.numeroGuiaRemision}</p><h3 className="mt-1 font-semibold">{item.clienteNombre}</h3><div className="mt-3 space-y-1 text-xs text-muted-foreground">{item.lineas.length ? item.lineas.map((linea) => <p key={linea.id}>{linea.productoDescripcion} · pedidas <span className="font-mono font-semibold">{linea.cantidad}</span> · despachadas <span className="font-mono font-semibold">{linea.cantidadDespachada ?? 0}</span> · pendientes <span className="font-mono font-semibold">{linea.cantidadPendiente ?? linea.cantidad}</span> {linea.unidadMedida}</p>) : <p>Detalle del pedido no disponible</p>}</div></div>
                  <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Programada</dt><dd className="mt-1">{formatearFechaDistribucion(item.fechaProgramada)}</dd></div><div><dt className="text-xs text-muted-foreground">Entrega real</dt><dd className="mt-1">{formatearFechaDistribucion(item.fechaEntrega)}</dd></div></dl>
                  <div><div className="flex flex-wrap items-center gap-2"><span className="status-label" data-tone={tonoEstadoDistribucion(item.estado)}>{etiquetasEstado[item.estado]}</span><span className="text-sm text-muted-foreground">{etiquetasModalidad[item.modalidad ?? 'movilidad_propia']} · {item.tipoTransporte === 'interno' ? 'Interno' : 'Externo'}</span></div>{puedeGestionarDistribucion ? <select aria-label={`Cambiar estado de ${item.pedidoNumero}`} value={item.estado} onChange={(evento) => { void actualizarEstado(item, evento.target.value as ProgramacionEntrega['estado']).then((error) => setMensaje(error ?? `Estado actualizado para ${item.pedidoNumero}.`)) }} className="field-control mt-2">{[item.estado, ...obtenerEstadosSiguientes(item.estado)].map((valor) => <option key={valor} value={valor}>{etiquetasEstado[valor]}</option>)}</select> : <p className="mt-2 text-sm text-muted-foreground">Solo consulta</p>}{item.observaciones ? <p className="mt-2 text-xs text-muted-foreground">{item.observaciones}</p> : null}</div>
                  <div className="flex gap-1 print:hidden"><Button type="button" variant="ghost" size="icon" title="Ver detalle de la entrega" aria-label={`Ver detalle de la entrega ${item.pedidoNumero}`} onClick={() => setEntregaDetalle(item)}><Eye aria-hidden="true" /></Button>{puedeGestionarDistribucion ? <Button type="button" variant="outline" onClick={() => abrirFormulario(item)}><Pencil aria-hidden="true" /> Editar</Button> : null}<Button type="button" variant="outline" onClick={() => exportarEntrega(item.id)}><FileDown aria-hidden="true" /> PDF</Button></div>
                </article>
              ))}</div>
            )}
            {filtradas.length ? <PaginacionListado etiqueta="seguimiento de entregas" pagina={paginaSeguimientoVisible} tamanioPagina={tamanioPaginaSeguimiento} total={filtradas.length} totalPaginas={totalPaginasSeguimiento} cantidadVisible={entregasVisibles.length} alCambiarPagina={setPaginaSeguimiento} alCambiarTamanio={(siguiente) => { setTamanioPaginaSeguimiento(siguiente); setPaginaSeguimiento(1) }} /> : null}
          </section>
        </>
      ) : null}

      {pedidoDetalle ? <DialogoDetalleOperacionVenta abierto={Boolean(pedidoDetalle)} pedido={pedidoDetalle} venta={ventaPorPedidoId(pedidoDetalle.id)} alCambiarApertura={(abierto) => { if (!abierto) setPedidoDetalle(null) }} alRestaurarFoco={() => disparadorPedidoDetalle.current?.focus()} /> : null}
      {entregaDetalle ? <DialogoDetalleEntrega abierto={Boolean(entregaDetalle)} entrega={entregaDetalle} alCambiarApertura={(abierto) => { if (!abierto) setEntregaDetalle(null) }} /> : null}

      {puedeGestionarDistribucion && formularioAbierto ? (
        <div role="dialog" aria-modal="true" aria-labelledby="programar-title" className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <form onSubmit={enviar} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto bg-background p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4"><div><h2 id="programar-title" className="text-xl font-semibold">{edicion ? 'Editar entrega' : 'Programar entrega'}</h2><p className="mt-1 text-sm text-muted-foreground">Vincula el pedido con su guía y fecha de entrega.</p></div><Button type="button" variant="ghost" onClick={() => setFormularioAbierto(false)}>Cerrar</Button></div>
            <div className="mt-6 space-y-6">
              <section aria-labelledby="referencia-entrega-title" className="space-y-4">
                <div><h3 id="referencia-entrega-title" className="text-sm font-semibold uppercase tracking-[.06em] text-primary">Referencia comercial</h3><p className="mt-1 text-sm text-muted-foreground">Estos datos provienen del pedido y no se pueden alterar desde Distribución.</p></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2"><label htmlFor="pedido-entrega" className="field-label">Pedido</label><select id="pedido-entrega" required disabled={Boolean(edicion)} value={datos.pedidoId} onChange={(evento) => seleccionarPedido(evento.target.value)} className="field-control"><option value="">Selecciona un pedido</option>{pedidosDisponibles.map((pedido) => <option key={pedido.id} value={pedido.id}>{pedido.numero} · {pedido.clienteNombre}</option>)}</select></div>
                  <div><label htmlFor="cliente-entrega" className="field-label">Cliente</label><input id="cliente-entrega" value={pedidoSeleccionado?.clienteNombre ?? datos.clienteNombre} readOnly className="field-control bg-muted/30" aria-readonly="true" /></div>
                  <div><label htmlFor="almacen-entrega" className="field-label">Almacén de origen</label><input id="almacen-entrega" value={pedidoSeleccionado?.almacenNombre ?? 'No especificado en el pedido'} readOnly className="field-control bg-muted/30" aria-readonly="true" /></div>
                </div>
                {lineasPedido.length ? <div className="border bg-muted/20 px-4 py-3"><p className="text-sm font-medium">Contenido del pedido</p><div className="mt-3 space-y-2 text-xs text-muted-foreground">{lineasPedido.map((linea) => <div key={linea.id} className="flex flex-wrap justify-between gap-2"><span>{linea.productoDescripcion} · {linea.unidadMedida}</span><span><strong className="font-mono text-foreground">{linea.cantidad}</strong> pedidas · <strong className="font-mono text-foreground">{linea.cantidadDespachada ?? 0}</strong> despachadas · <strong className="font-mono text-foreground">{linea.cantidadPendiente ?? linea.cantidad}</strong> pendientes</span></div>)}</div><p className="mt-3 text-xs text-muted-foreground">Las cantidades se controlan desde el despacho; aquí solo se consulta el detalle.</p></div> : null}
              </section>

              <section aria-labelledby="destino-entrega-title" className="space-y-4 border-t pt-5">
                <div><h3 id="destino-entrega-title" className="text-sm font-semibold uppercase tracking-[.06em] text-primary">Destino y documentos</h3><p className="mt-1 text-sm text-muted-foreground">Selecciona una dirección registrada para conservar la trazabilidad del destinatario.</p></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><label htmlFor="numero-despacho" className="field-label">Número de despacho<span aria-hidden="true"> *</span></label><input id="numero-despacho" required maxLength={40} value={datos.numeroDespacho} onChange={(evento) => setDatos({ ...datos, numeroDespacho: evento.target.value })} className="field-control" /></div>
                  <div><label htmlFor="guia-remision" className="field-label">Número de guía de remisión<span aria-hidden="true"> *</span></label><input id="guia-remision" required maxLength={40} value={datos.numeroGuiaRemision} onChange={(evento) => setDatos({ ...datos, numeroGuiaRemision: evento.target.value })} className="field-control" /></div>
                  <div><label htmlFor="fecha-emision" className="field-label">Fecha de emisión<span aria-hidden="true"> *</span></label><input id="fecha-emision" required type="date" value={datos.fechaEmision} onChange={(evento) => setDatos({ ...datos, fechaEmision: evento.target.value })} className="field-control" /></div>
                  <div className="sm:col-span-2">
                    {direccionesCliente.length ? <Combobox id="direccion-entrega" label="Dirección de entrega" value={direccionSeleccionadaId} options={opcionesDirecciones} onChange={(valor) => { setDireccionSeleccionadaId(valor); const direccion = direccionesCliente.find((item) => (item.id ?? item.direccion) === valor); if (direccion) setDatos({ ...datos, direccionEntrega: direccion.direccion }) }} placeholder="Selecciona una dirección" helperText="La dirección se guarda como snapshot de esta entrega." required noOptionsMessage="El cliente no tiene direcciones de entrega activas." /> : <div><label htmlFor="direccion-entrega" className="field-label">Dirección de entrega<span aria-hidden="true"> *</span></label><input id="direccion-entrega" required maxLength={500} value={datos.direccionEntrega} onChange={(evento) => { setDireccionSeleccionadaId('__manual__'); setDatos({ ...datos, direccionEntrega: evento.target.value }) }} className="field-control" placeholder="Ingresa la dirección de entrega" /><p className="mt-1 text-xs text-muted-foreground">El cliente no tiene una dirección de entrega activa registrada.</p></div>}
                    {direccionesCliente.length && direccionSeleccionadaId === '__manual__' ? <div className="mt-3"><label htmlFor="direccion-entrega-manual" className="field-label">Dirección alternativa<span aria-hidden="true"> *</span></label><input id="direccion-entrega-manual" required maxLength={500} value={datos.direccionEntrega} onChange={(evento) => setDatos({ ...datos, direccionEntrega: evento.target.value })} className="field-control" placeholder="Ingresa la dirección excepcional" /><p className="mt-1 text-xs text-muted-foreground">Usa esta opción solo cuando la dirección no está en el maestro del cliente.</p></div> : null}
                  </div>
                </div>
              </section>

              <section aria-labelledby="programacion-entrega-title" className="space-y-4 border-t pt-5">
                <div><h3 id="programacion-entrega-title" className="text-sm font-semibold uppercase tracking-[.06em] text-primary">Programación y transporte</h3><p className="mt-1 text-sm text-muted-foreground">Los datos del transporte se completan antes de iniciar la ruta.</p></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><label htmlFor="fecha-programada" className="field-label">Fecha programada<span aria-hidden="true"> *</span></label><input id="fecha-programada" required type="date" value={datos.fechaProgramada} onChange={(evento) => setDatos({ ...datos, fechaProgramada: evento.target.value })} className="field-control" /></div>
                  <div><label htmlFor="fecha-entrega" className="field-label">Fecha de entrega real{['entregado', 'entrega_parcial'].includes(datos.estado) ? <span aria-hidden="true"> *</span> : null}</label><input id="fecha-entrega" type="date" value={datos.fechaEntrega} onChange={(evento) => setDatos({ ...datos, fechaEntrega: evento.target.value })} className="field-control" /><p className="mt-1 text-xs text-muted-foreground">Se completa al confirmar la entrega o una entrega parcial.</p></div>
                  <div><label htmlFor="tipo-transporte" className="field-label">Tipo de transporte<span aria-hidden="true"> *</span></label><select id="tipo-transporte" required disabled={esRecojoCliente} value={datos.tipoTransporte} onChange={(evento) => setDatos({ ...datos, tipoTransporte: evento.target.value as DatosProgramacionEntrega['tipoTransporte'] })} className="field-control"><option value="interno">Interno</option><option value="externo">Externo</option></select></div>
                  <div><label htmlFor="modalidad" className="field-label">Modalidad<span aria-hidden="true"> *</span></label><select id="modalidad" value={datos.modalidad} onChange={(evento) => setDatos({ ...datos, modalidad: evento.target.value as DatosProgramacionEntrega['modalidad'] })} className="field-control"><option value="movilidad_propia">Movilidad propia</option><option value="movilidad_externa">Movilidad externa</option><option value="recojo_cliente">Recojo del cliente</option></select></div>
                  <div><label htmlFor="transportista" className="field-label">Transportista{requiereTransportista ? <span aria-hidden="true"> *</span> : null}</label><input id="transportista" required={requiereTransportista} disabled={esRecojoCliente} value={datos.transportista} onChange={(evento) => setDatos({ ...datos, transportista: evento.target.value })} className="field-control" /></div>
                  <div><label htmlFor="conductor" className="field-label">Conductor{requiereDatosTransporte ? <span aria-hidden="true"> *</span> : null}</label><input id="conductor" required={requiereDatosTransporte} disabled={esRecojoCliente} value={datos.conductor} onChange={(evento) => setDatos({ ...datos, conductor: evento.target.value })} className="field-control" /></div>
                  <div><label htmlFor="vehiculo" className="field-label">Vehículo{requiereDatosTransporte ? <span aria-hidden="true"> *</span> : null}</label><input id="vehiculo" required={requiereDatosTransporte} disabled={esRecojoCliente} value={datos.vehiculo} onChange={(evento) => setDatos({ ...datos, vehiculo: evento.target.value })} className="field-control" /></div>
                  <div><label htmlFor="placa" className="field-label">Placa{requiereDatosTransporte ? <span aria-hidden="true"> *</span> : null}</label><input id="placa" required={requiereDatosTransporte} disabled={esRecojoCliente} value={datos.placa} onChange={(evento) => setDatos({ ...datos, placa: evento.target.value })} className="field-control" /></div>
                  <div><label htmlFor="estado-distribucion" className="field-label">Estado<span aria-hidden="true"> *</span></label><select id="estado-distribucion" value={datos.estado} onChange={(evento) => setDatos({ ...datos, estado: evento.target.value as DatosProgramacionEntrega['estado'] })} className="field-control">{(edicion ? [edicion.estado, ...obtenerEstadosSiguientes(edicion.estado)] : ['programado']).map((valor) => <option key={valor} value={valor}>{etiquetasEstado[valor]}</option>)}</select></div>
                </div>
              </section>

              <section aria-labelledby="seguimiento-entrega-title" className="space-y-4 border-t pt-5">
                <div><h3 id="seguimiento-entrega-title" className="text-sm font-semibold uppercase tracking-[.06em] text-primary">Seguimiento y evidencia</h3><p className="mt-1 text-sm text-muted-foreground">Registra información operativa únicamente cuando corresponda al estado de la entrega.</p></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><label htmlFor="evidencia" className="field-label">Evidencia{datos.estado === 'entregado' ? <span aria-hidden="true"> *</span> : null}</label><input id="evidencia" required={datos.estado === 'entregado'} value={datos.evidencia} onChange={(evento) => setDatos({ ...datos, evidencia: evento.target.value })} className="field-control" placeholder="Ej. foto de entrega, nombre de archivo o URL" /></div>
                  <div><label htmlFor="incidencias" className="field-label">Incidencias{['rechazado', 'devuelto'].includes(datos.estado) ? <span aria-hidden="true"> *</span> : null}</label><textarea id="incidencias" rows={2} required={['rechazado', 'devuelto'].includes(datos.estado)} value={datos.incidencias.join('; ')} onChange={(evento) => setDatos({ ...datos, incidencias: evento.target.value ? evento.target.value.split(';').map((valor) => valor.trim()).filter(Boolean) : [] })} className="field-control" placeholder="Separadas por punto y coma" /></div>
                  <div className="sm:col-span-2"><label htmlFor="observaciones-entrega" className="field-label">Observaciones</label><textarea id="observaciones-entrega" rows={3} value={datos.observaciones} onChange={(evento) => setDatos({ ...datos, observaciones: evento.target.value })} className="field-control" /></div>
                </div>
              </section>
            </div>
            <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setFormularioAbierto(false)}>Cancelar</Button><Button type="submit">{edicion ? 'Guardar cambios' : 'Programar entrega'}</Button></div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
