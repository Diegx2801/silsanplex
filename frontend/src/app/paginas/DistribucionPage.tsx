import { ArrowRight, Ban, CalendarClock, Eye, FileDown, PackageCheck, Pencil, Plus, Search, Truck } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AlertDialog as AlertDialogPrimitive, Dialog as DialogPrimitive } from 'radix-ui'

import { PaginacionListado, type TamanioPaginaListado } from '@/components/ui/PaginacionListado'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { useAuth } from '@/features/auth/useAuth'
import { PERMISSIONS } from '@/features/auth/permissions'
import { fechaActualPeru, ZONA_HORARIA_NEGOCIO } from '@/lib/fechas'
import { useClientes } from '@/modulos/clientes/estado/useClientes'
import { DialogoDetalleEntrega } from '@/modulos/distribucion/componentes/DialogoDetalleEntrega'
import { DialogoResultadoEntrega } from '@/modulos/distribucion/componentes/DialogoResultadoEntrega'
import { useProgramacionesEntrega } from '@/modulos/distribucion/estado/useProgramacionesEntrega'
import { enriquecerLineasPedidoConSaldos, pedidoListoParaProgramarDistribucion } from '@/modulos/distribucion/modelo/pedidosProgramables'
import {
  esquemaDatosProgramacionEntrega,
  filtrarProgramacionesEntrega,
  listarEntregasAtrasadas,
  obtenerAccionPrincipalDistribucion,
  obtenerEstadosSiguientes,
  obtenerResumenFechaEntrega,
  resumirEntregas,
  tipoTransporteParaModalidad,
  type DatosProgramacionEntrega,
  type ProgramacionEntrega,
  type ResultadoEntrega,
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
  rechazado: 'No entregada',
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
  const { programaciones, guardar, actualizarEstado, registrarResultado, guardandoEstado, guardandoResultado, error: errorProgramaciones, reintentar: reintentarProgramaciones } = useProgramacionesEntrega()
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
  const [reprogramacionEnCurso, setReprogramacionEnCurso] = useState(false)
  const [entregaPorCancelar, setEntregaPorCancelar] = useState<ProgramacionEntrega | null>(null)
  const [errorCancelacion, setErrorCancelacion] = useState('')
  const [pedidoDetalle, setPedidoDetalle] = useState<PedidoVenta | null>(null)
  const [entregaDetalle, setEntregaDetalle] = useState<ProgramacionEntrega | null>(null)
  const [entregaResultado, setEntregaResultado] = useState<ProgramacionEntrega | null>(null)
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
    ...(pedidoSeleccionado?.direccionEntrega ? [{
      value: '__pedido__',
      label: 'Destino confirmado en el pedido',
      secondaryText: [pedidoSeleccionado.direccionEntrega.direccion, pedidoSeleccionado.direccionEntrega.ubigeo, pedidoSeleccionado.direccionEntrega.referencia].filter(Boolean).join(' · '),
      keywords: [pedidoSeleccionado.direccionEntrega.direccion, pedidoSeleccionado.direccionEntrega.ubigeo, pedidoSeleccionado.direccionEntrega.referencia],
    }] : []),
    ...direccionesCliente.map((direccion) => ({
      value: direccion.id ?? direccion.direccion,
      label: direccion.etiqueta || direccion.direccion,
      secondaryText: [direccion.direccion, direccion.ubigeo, direccion.referencia].filter(Boolean).join(' · '),
      keywords: [direccion.direccion, direccion.ubigeo, direccion.referencia],
    })),
    { value: '__manual__', label: 'Ingresar otra dirección', secondaryText: 'Usa esta opción solo si no está en el maestro del cliente' },
  ], [direccionesCliente, pedidoSeleccionado?.direccionEntrega])
  const lineasPedido = pedidoSeleccionado
    ? enriquecerLineasPedidoConSaldos(pedidoSeleccionado.lineas, ventaPorPedido.get(pedidoSeleccionado.id))
    : datos.lineas.filter((linea) => linea.tipoProducto === 'good')
  const esRecojoCliente = datos.modalidad === 'recojo_cliente'
  const estadoRequiereTransporte = ['en_curso', 'en_destino', 'entregado', 'entrega_parcial'].includes(datos.estado)
  const requiereDatosTransporte = estadoRequiereTransporte && !esRecojoCliente
  const requiereTransportista = requiereDatosTransporte && datos.tipoTransporte === 'externo'
  const destinoBloqueado = Boolean(edicion && !['programado', 'preparando', 'reprogramado'].includes(edicion.estado))

  const cambiarVista = (siguiente: VistaDistribucion) => {
    setParametros(siguiente === 'pendientes' ? {} : { vista: siguiente })
  }

  useEffect(() => {
    if (!formularioAbierto || !datos.pedidoId || datos.direccionEntrega || direccionSeleccionadaId || !direccionesCliente.length) return
    const principal = direccionesCliente.find((direccion) => direccion.principal) ?? direccionesCliente[0]
    if (!principal) return
    setDireccionSeleccionadaId(principal.id ?? principal.direccion)
    setDatos((actuales) => ({ ...actuales, direccionEntrega: principal.direccion }))
  }, [datos.direccionEntrega, datos.pedidoId, direccionSeleccionadaId, direccionesCliente, formularioAbierto])

  const editarProgramacion = (programacion: ProgramacionEntrega, reprogramar = false) => {
    setEdicion(programacion)
    setReprogramacionEnCurso(reprogramar)
    const pedidoOrigen = pedidoPorId(programacion.pedidoId)
    const clienteOrigen = clientes.find((cliente) => cliente.id === pedidoOrigen?.clienteId)
    const direccionOrigen = clienteOrigen?.direccionesEntrega.find((direccion) => direccion.direccion === programacion.direccionEntrega)
    setDireccionSeleccionadaId(direccionOrigen?.id ?? (programacion.direccionEntrega ? '__manual__' : ''))
    setDatos({
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
      tipoTransporte: tipoTransporteParaModalidad(programacion.modalidad, programacion.tipoTransporte),
      modalidad: programacion.modalidad ?? 'movilidad_propia',
      transportista: programacion.transportista ?? '',
      conductor: programacion.conductor ?? '',
      vehiculo: programacion.vehiculo ?? '',
      placa: programacion.placa ?? '',
      observaciones: programacion.observaciones ?? '',
      evidencia: programacion.evidencia ?? '',
      estado: reprogramar ? 'reprogramado' : programacion.estado ?? 'programado',
      seguimiento: programacion.seguimiento ?? (programacion.estado === 'en_curso' || programacion.estado === 'en_destino' ? programacion.estado : 'en_curso'),
      incidencias: programacion.incidencias ?? [],
      lineas: programacion.lineas ?? [],
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
    setReprogramacionEnCurso(false)
    const cliente = clientes.find((item) => item.id === pedido.clienteId)
    const direccionPrincipal = cliente?.direccionesEntrega.find((direccion) => direccion.principal) ?? cliente?.direccionesEntrega[0]
    const destinoPedido = pedido.direccionEntrega
    setDireccionSeleccionadaId(destinoPedido ? '__pedido__' : direccionPrincipal?.id ?? direccionPrincipal?.direccion ?? '__manual__')
    setDatos({
      pedidoId: pedido.id,
      pedidoNumero: pedido.numero,
      ventaId: venta.id,
      ventaNumero: venta.numeroInterno,
      clienteNombre: pedido.clienteNombre,
      direccionEntrega: destinoPedido?.direccion ?? direccionPrincipal?.direccion ?? '',
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
    if (reprogramacionEnCurso && edicion) {
      if (resultado.data.fechaProgramada === edicion.fechaProgramada) {
        setMensaje('Selecciona una nueva fecha para reprogramar la entrega')
        return
      }
      if (resultado.data.fechaProgramada < hoy) {
        setMensaje('La nueva fecha programada no puede estar en el pasado')
        return
      }
    }
    if (!edicion && pedido && !pedidoListoParaProgramarDistribucion(pedido, venta)) {
      setMensaje('Completa el despacho de todos los bienes en Ventas antes de programar la entrega')
      return
    }
    const datosPersistentes = {
      ...resultado.data,
      tipoTransporte: tipoTransporteParaModalidad(resultado.data.modalidad, resultado.data.tipoTransporte),
      pedidoNumero: pedido?.numero ?? edicion?.pedidoNumero ?? resultado.data.pedidoNumero,
      clienteNombre: pedido?.clienteNombre ?? edicion?.clienteNombre ?? resultado.data.clienteNombre,
      ventaId: venta?.id ?? edicion?.ventaId ?? '',
      ventaNumero: venta?.numeroInterno ?? edicion?.ventaNumero ?? '',
    }
    const error = await guardar(datosPersistentes, edicion?.id, pedido?.lineas ?? edicion?.lineas ?? [])
    setMensaje(error ?? (reprogramacionEnCurso ? 'Entrega reprogramada.' : edicion ? 'Distribución actualizada.' : 'Distribución programada.'))
    if (!error) {
      setFormularioAbierto(false)
      setReprogramacionEnCurso(false)
    }
  }

  const ejecutarTransicionEtapa = async (entrega: ProgramacionEntrega, estado: ProgramacionEntrega['estado']) => {
    const error = await actualizarEstado(entrega, estado)
    setMensaje(error ?? `Etapa actualizada: ${etiquetasEstado[estado]}.`)
  }

  const confirmarCancelacionEntrega = async () => {
    if (!entregaPorCancelar) return
    const entrega = entregaPorCancelar
    const error = await actualizarEstado(entrega, 'cancelado')
    setMensaje(error ?? `Entrega de ${entrega.pedidoNumero} cancelada. La venta y el inventario no se modificaron.`)
    if (error) setErrorCancelacion(error)
    else {
      setErrorCancelacion('')
      setEntregaPorCancelar(null)
    }
  }

  const confirmarResultadoEntrega = async (resultado: ResultadoEntrega, operationKey: string) => {
    const error = await registrarResultado(resultado, operationKey)
    if (!error) setMensaje(`Resultado registrado para ${entregaResultado?.pedidoNumero ?? 'la entrega'}.`)
    return error
  }

  const exportarEntrega = (id: string) => {
    const entrega = programaciones.find((item) => item.id === id)
    if (!entrega) return
    const pedido = pedidoPorId(entrega.pedidoId)
    const lineas = entrega.lineas.length
      ? entrega.lineas
      : (pedido?.lineas ?? []).map((linea) => ({
          ...linea,
          cantidadEntregadaCliente: undefined,
          cantidadPendienteCliente: linea.cantidad,
        }))
    if (!lineas.length) {
      setMensaje('No se encontró el detalle del pedido seleccionado')
      return
    }

    const nombreSeguro = `${entrega.pedidoNumero}_Despacho_${entrega.numeroDespacho}`
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
    pdf.rect(0, 0, 210, 42, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(17)
    pdf.text('SILSANPLEX', margen, y + 1)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text('REPORTE DE DISTRIBUCIÓN', margen, y + 8)
    pdf.setFontSize(8)
    pdf.text('Documento operativo de distribución', 192, y + 5, { align: 'right' })
    pdf.text(`Generado: ${formatoFecha.format(new Date())}`, 192, y + 11, { align: 'right' })
    pdf.text('Reporte interno; no sustituye la guía de remisión ni el comprobante de venta.', margen, y + 20)
    y = 54

    pdf.setTextColor(...tinta)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(14)
    pdf.text('Resumen de distribución', margen, y)
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
    dibujarDato('Emisión de guía', formatearFechaDistribucion(entrega.fechaEmision), margen, 55)
    const resumenFechaEntrega = obtenerResumenFechaEntrega(entrega)
    dibujarDato(resumenFechaEntrega.etiqueta, formatearFechaDistribucion(resumenFechaEntrega.fecha), 78, 55)
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
    pdf.text('PRODUCTO · UNIDAD', margen + 4, y + 6)
    pdf.text('DESPACHADO', 124, y + 6, { align: 'right' })
    pdf.text('RECIBIDO', 158, y + 6, { align: 'right' })
    pdf.text('PENDIENTE', 190, y + 6, { align: 'right' })
    y += 9

    pdf.setFont('helvetica', 'normal')
    lineas.forEach((linea, indice) => {
      const descripcion = pdf.splitTextToSize(`${linea.productoDescripcion} · ${linea.unidadMedida || 'Sin unidad'}`, 82)
      const alto = Math.max(10, descripcion.length * 4 + 6)
      if (indice % 2 === 0) {
        pdf.setFillColor(248, 250, 249)
        pdf.rect(margen, y, ancho, alto, 'F')
      }
      pdf.setTextColor(...tinta)
      pdf.setFontSize(9)
      pdf.text(descripcion, margen + 4, y + 6)
      pdf.setFont('helvetica', 'bold')
      pdf.text(String(linea.cantidadDespachada ?? linea.cantidad), 124, y + 6, { align: 'right' })
      pdf.setFont('helvetica', 'normal')
      pdf.text(entrega.requiereConciliacionCantidades ? '—' : String(linea.cantidadEntregadaCliente ?? 0), 158, y + 6, { align: 'right' })
      pdf.text(entrega.requiereConciliacionCantidades ? '—' : String(linea.cantidadPendienteCliente ?? linea.cantidad), 190, y + 6, { align: 'right' })
      y += alto
    })

    y += 12
    pdf.setTextColor(...tinta)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text('Seguimiento', margen, y)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.text(etiquetasEstado[entrega.estado], margen + 30, y)
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
    pdf.save(`Reporte_Distribucion_${nombreSeguro}.pdf`)
  }

  return (
    <div className="space-y-8">
      <header className="border-b pb-7 print:hidden">
        <div>
          <span className="font-mono text-xs tracking-[0.08em] text-primary uppercase">Despacho y seguimiento</span>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Distribución</h1>
          <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">Programa entregas de pedidos, registra su guía de remisión y acompaña cada envío hasta destino.</p>
        </div>
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
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4 xl:grid-cols-7">
          {[
            ['Por programar', pedidosPorProgramar.length],
            ['Programadas', resumen.programados],
            ['En curso', resumen.enCurso],
            ['En destino', resumen.enDestino],
            ['Entregadas', resumen.entregados],
            ['Atrasadas', resumen.atrasadas],
            ['Con incidencias', resumen.conIncidencias],
          ].map(([etiqueta, valor]) => (
            <article key={etiqueta} className="flex min-h-16 flex-col justify-between gap-2 bg-card px-3 py-3">
              <div className="flex items-start justify-between gap-2"><p className="font-mono text-[0.62rem] leading-4 tracking-[0.06em] text-muted-foreground uppercase">{etiqueta}</p><Truck aria-hidden="true" className="size-4 shrink-0 text-primary" /></div>
              <p className="font-mono text-xl font-semibold tabular-nums">{valor}</p>
            </article>
          ))}
        </div>
      </section>

      {mensaje ? <p role="status" aria-live="polite" className="border-s-4 border-primary bg-accent/40 px-4 py-3 text-sm">{mensaje}</p> : null}
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
              <div className="divide-y">{entregasVisibles.map((item) => {
                const accionPrincipal = obtenerAccionPrincipalDistribucion(item.estado)
                const puedeReprogramar = ['entrega_parcial', 'rechazado', 'reprogramado'].includes(item.estado)
                const puedeCancelar = obtenerEstadosSiguientes(item.estado).includes('cancelado')
                const puedeRegistrarResultado = ['en_curso', 'en_destino', 'entrega_parcial'].includes(item.estado)
                const puedeEditar = ['programado', 'preparando'].includes(item.estado)
                const resumenFechaEntrega = obtenerResumenFechaEntrega(item)

                return (
                  <article key={item.id} className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(10rem,1fr)_minmax(13rem,1.35fr)_minmax(9rem,0.85fr)_minmax(14rem,1.2fr)] lg:items-center">
                    <div className="print-delivery-header"><p className="font-mono text-xs text-primary">REPORTE INTERNO DE DISTRIBUCIÓN</p><p className="mt-1 font-mono text-xs text-muted-foreground">Guía emitida: {formatearFechaDistribucion(item.fechaEmision)}</p></div>
                    <div><p className="font-mono text-xs text-primary">{item.pedidoNumero} · {item.ventaNumero ? `Venta ${item.ventaNumero} · ` : ''}Guía {item.numeroGuiaRemision}</p><h3 className="mt-1 font-semibold">{item.clienteNombre}</h3><div className="mt-3 space-y-1 text-xs text-muted-foreground">{item.lineas.length ? item.lineas.map((linea) => <p key={linea.id}>{linea.productoDescripcion} · <span className="font-mono font-semibold">{linea.cantidadDespachada ?? linea.cantidad} {linea.unidadMedida}</span> despachadas en Ventas · {item.requiereConciliacionCantidades ? 'recepción histórica sin conciliar' : <><span className="font-mono">{linea.cantidadEntregadaCliente ?? 0}</span> recibidas · <span className="font-mono">{linea.cantidadPendienteCliente ?? linea.cantidad}</span> pendientes</>}</p>) : <p>Detalle del pedido no disponible</p>}</div></div>
                    <dl className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-1"><div><dt className="text-xs text-muted-foreground">Programada</dt><dd className="mt-1">{formatearFechaDistribucion(item.fechaProgramada)}</dd></div><div><dt className="text-xs text-muted-foreground">{resumenFechaEntrega.etiqueta}</dt><dd className="mt-1">{formatearFechaDistribucion(resumenFechaEntrega.fecha)}</dd></div></dl>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="status-label" data-tone={tonoEstadoDistribucion(item.estado)}>{etiquetasEstado[item.estado]}</span><span className="text-xs text-muted-foreground">{etiquetasModalidad[item.modalidad ?? 'movilidad_propia']} · {item.tipoTransporte === 'interno' ? 'Interno' : 'Externo'}</span></div>
                      {item.requiereConciliacionCantidades ? <p role="status" className="mt-2 text-xs text-amber-800">Registro histórico por conciliar antes de continuar.</p> : null}
                      {item.observaciones ? <p className="mt-2 text-xs text-muted-foreground">{item.observaciones}</p> : null}
                      {puedeGestionarDistribucion && !item.requiereConciliacionCantidades ? (
                        <div className="mt-3 flex flex-wrap gap-2 print:hidden">
                          {accionPrincipal ? <Button type="button" size="sm" disabled={guardandoEstado || guardandoResultado} onClick={() => void ejecutarTransicionEtapa(item, accionPrincipal.estado)}><ArrowRight aria-hidden="true" />{accionPrincipal.etiqueta}</Button> : null}
                          {puedeRegistrarResultado ? <Button type="button" size="sm" variant={accionPrincipal ? 'outline' : 'default'} disabled={guardandoEstado || guardandoResultado} onClick={() => setEntregaResultado(item)}><PackageCheck aria-hidden="true" /> Registrar resultado</Button> : null}
                          {puedeReprogramar ? <Button type="button" size="sm" variant="outline" disabled={guardandoEstado} onClick={() => editarProgramacion(item, true)}><CalendarClock aria-hidden="true" /> Reprogramar fecha</Button> : null}
                          {puedeEditar ? <Button type="button" size="sm" variant="outline" disabled={guardandoEstado} onClick={() => editarProgramacion(item)}><Pencil aria-hidden="true" /> Editar planificación</Button> : null}
                          {puedeCancelar ? <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={guardandoEstado} onClick={() => { setErrorCancelacion(''); setEntregaPorCancelar(item) }}><Ban aria-hidden="true" /> Cancelar</Button> : null}
                        </div>
                      ) : null}
                      {puedeGestionarDistribucion && item.requiereConciliacionCantidades ? <p className="mt-2 text-xs text-muted-foreground">Resuelve la conciliación para habilitar acciones.</p> : null}
                      {!puedeGestionarDistribucion ? <p className="mt-2 text-xs text-muted-foreground">Solo consulta</p> : null}
                      <div className="mt-3 flex flex-wrap gap-1 print:hidden"><Button type="button" variant="ghost" size="icon" title="Ver detalle de la entrega" aria-label={`Ver detalle de la entrega ${item.pedidoNumero}`} onClick={() => setEntregaDetalle(item)}><Eye aria-hidden="true" /></Button><Button type="button" variant="outline" size="sm" onClick={() => exportarEntrega(item.id)}><FileDown aria-hidden="true" /> Reporte PDF</Button></div>
                    </div>
                  </article>
                )
              })}</div>
            )}
            {filtradas.length ? <PaginacionListado etiqueta="seguimiento de entregas" pagina={paginaSeguimientoVisible} tamanioPagina={tamanioPaginaSeguimiento} total={filtradas.length} totalPaginas={totalPaginasSeguimiento} cantidadVisible={entregasVisibles.length} alCambiarPagina={setPaginaSeguimiento} alCambiarTamanio={(siguiente) => { setTamanioPaginaSeguimiento(siguiente); setPaginaSeguimiento(1) }} /> : null}
          </section>
        </>
      ) : null}

      {pedidoDetalle ? <DialogoDetalleOperacionVenta abierto={Boolean(pedidoDetalle)} pedido={pedidoDetalle} venta={ventaPorPedidoId(pedidoDetalle.id)} alCambiarApertura={(abierto) => { if (!abierto) setPedidoDetalle(null) }} alRestaurarFoco={() => disparadorPedidoDetalle.current?.focus()} /> : null}
      {entregaPorCancelar ? (
        <AlertDialogPrimitive.Root open onOpenChange={(abierto) => { if (!abierto && !guardandoEstado) { setEntregaPorCancelar(null); setErrorCancelacion('') } }}>
          <AlertDialogPrimitive.Portal>
            <AlertDialogPrimitive.Overlay className="fixed inset-0 z-60 bg-foreground/30" />
            <AlertDialogPrimitive.Content className="fixed start-1/2 top-1/2 z-70 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border bg-background p-5 shadow-xl outline-none sm:p-6">
              <div className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive"><Ban aria-hidden="true" className="size-5" /></div>
              <AlertDialogPrimitive.Title className="mt-5 text-xl font-semibold">Cancelar entrega de {entregaPorCancelar.pedidoNumero}</AlertDialogPrimitive.Title>
              <AlertDialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">La entrega dejará de avanzar en Distribución y quedará registrada como cancelada. Esta acción no anula la venta ni revierte el inventario.</AlertDialogPrimitive.Description>
              {errorCancelacion ? <p role="alert" className="mt-4 border-s-4 border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">{errorCancelacion}</p> : null}
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <AlertDialogPrimitive.Cancel asChild><Button type="button" variant="outline" disabled={guardandoEstado}>Conservar entrega</Button></AlertDialogPrimitive.Cancel>
                <Button type="button" variant="destructive" disabled={guardandoEstado} onClick={() => void confirmarCancelacionEntrega()}>{guardandoEstado ? 'Cancelando…' : 'Confirmar cancelación'}</Button>
              </div>
            </AlertDialogPrimitive.Content>
          </AlertDialogPrimitive.Portal>
        </AlertDialogPrimitive.Root>
      ) : null}
      {entregaDetalle ? <DialogoDetalleEntrega abierto={Boolean(entregaDetalle)} entrega={entregaDetalle} alCambiarApertura={(abierto) => { if (!abierto) setEntregaDetalle(null) }} /> : null}
      {entregaResultado ? <DialogoResultadoEntrega abierto={Boolean(entregaResultado)} entrega={entregaResultado} guardando={guardandoResultado} alConfirmar={confirmarResultadoEntrega} alCambiarApertura={(abierto) => { if (!abierto) setEntregaResultado(null) }} /> : null}

      {puedeGestionarDistribucion && formularioAbierto ? (
        <DialogPrimitive.Root open onOpenChange={(abierto) => { if (!abierto) { setFormularioAbierto(false); setReprogramacionEnCurso(false) } }}>
          <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/30" />
          <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-60 flex max-h-[90svh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border bg-background shadow-xl outline-none">
          <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <header className="flex shrink-0 items-start justify-between gap-4 border-b bg-background px-6 py-5">
              <div><DialogPrimitive.Title id="programar-title" className="text-xl font-semibold">{reprogramacionEnCurso ? 'Reprogramar entrega' : edicion ? 'Editar planificación' : 'Programar entrega'}</DialogPrimitive.Title><DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">{reprogramacionEnCurso ? 'Actualiza solo la fecha de la próxima salida; el historial conservará las fechas y quién realizó el cambio.' : 'Planifica la entrega y registra su destino y guía. El despacho de inventario ya se confirmó en Ventas.'}</DialogPrimitive.Description></div>
              <DialogPrimitive.Close asChild><Button type="button" variant="ghost">Cerrar</Button></DialogPrimitive.Close>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-6">
              {reprogramacionEnCurso ? (
                <section aria-labelledby="reprogramar-entrega-title" className="space-y-4">
                  <div>
                    <h3 id="reprogramar-entrega-title" className="text-sm font-semibold uppercase tracking-[.06em] text-primary">Fecha de la próxima salida</h3>
                    <p className="mt-1 text-sm text-muted-foreground">La guía, el destino y los datos del transporte se mantienen. Si la entrega está en ruta, primero registra el resultado del intento.</p>
                  </div>
                  <dl className="grid gap-4 border bg-muted/20 px-4 py-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-muted-foreground">Pedido</dt><dd className="mt-1 font-medium">{datos.pedidoNumero} · {datos.clienteNombre}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Fecha actual</dt><dd className="mt-1">{formatearFechaDistribucion(edicion?.fechaProgramada)}</dd></div>
                  </dl>
                  <div className="max-w-sm">
                    <label htmlFor="fecha-programada" className="field-label">Nueva fecha programada<span aria-hidden="true"> *</span></label>
                    <input id="fecha-programada" required type="date" min={hoy} value={datos.fechaProgramada} onChange={(evento) => setDatos({ ...datos, fechaProgramada: evento.target.value })} className="field-control" />
                    <p className="mt-1 text-xs text-muted-foreground">Debe ser distinta de la fecha actual y no puede estar en el pasado.</p>
                  </div>
                </section>
              ) : (
                <>
              <section aria-labelledby="referencia-entrega-title" className="space-y-4">
                <div><h3 id="referencia-entrega-title" className="text-sm font-semibold uppercase tracking-[.06em] text-primary">Pedido y salida de almacén</h3><p className="mt-1 text-sm text-muted-foreground">Referencia de solo lectura: pedido, cliente y almacén se conservan tal como se confirmaron en Ventas.</p></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2"><label htmlFor="pedido-entrega" className="field-label">Pedido</label><input id="pedido-entrega" value={`${pedidoSeleccionado?.numero ?? datos.pedidoNumero}${pedidoSeleccionado?.clienteNombre ? ` · ${pedidoSeleccionado.clienteNombre}` : ''}`} readOnly className="field-control bg-muted/30" aria-readonly="true" /></div>
                  <div><label htmlFor="cliente-entrega" className="field-label">Cliente</label><input id="cliente-entrega" value={pedidoSeleccionado?.clienteNombre ?? datos.clienteNombre} readOnly className="field-control bg-muted/30" aria-readonly="true" /></div>
                  <div><label htmlFor="almacen-entrega" className="field-label">Almacén de salida (Ventas)</label><input id="almacen-entrega" value={pedidoSeleccionado?.almacenNombre ?? 'No especificado en el pedido'} readOnly className="field-control bg-muted/30" aria-readonly="true" /></div>
                </div>
                {lineasPedido.length ? <div className="border bg-muted/20 px-4 py-3"><p className="text-sm font-medium">Bienes listos para entrega</p><ul className="mt-3 space-y-2 text-sm">{lineasPedido.map((linea) => <li key={linea.id} className="flex flex-wrap justify-between gap-2"><span>{linea.productoDescripcion} <span className="text-muted-foreground">· {linea.unidadMedida}</span></span><span className="font-mono text-xs font-semibold tabular-nums">{linea.cantidadDespachada ?? linea.cantidad} {linea.unidadMedida} despachadas en Ventas</span></li>)}</ul><p className="mt-3 border-t pt-3 text-xs leading-5 text-muted-foreground">El despacho de estos bienes ya quedó registrado en Ventas. Aquí solo se programa y controla la entrega al cliente; no se vuelve a descontar inventario.</p></div> : null}
              </section>

              <section aria-labelledby="destino-entrega-title" className="space-y-4 border-t pt-5">
                <div><h3 id="destino-entrega-title" className="text-sm font-semibold uppercase tracking-[.06em] text-primary">Destino del cliente</h3><p className="mt-1 text-sm text-muted-foreground">El almacén anterior es el punto de salida; este es el destino final. El cambio aquí afecta solo a esta entrega, no al pedido ni a la venta.</p></div>
                <div>
                    {direccionesCliente.length || pedidoSeleccionado?.direccionEntrega ? (
                      <Combobox
                        id="direccion-entrega"
                        label="Dirección de destino"
                        value={direccionSeleccionadaId}
                        options={opcionesDirecciones}
                        onChange={(valor) => {
                          setDireccionSeleccionadaId(valor)
                          if (valor === '__pedido__') {
                            setDatos({ ...datos, direccionEntrega: pedidoSeleccionado?.direccionEntrega?.direccion ?? '' })
                          } else if (valor === '__manual__') {
                            setDatos({ ...datos, direccionEntrega: '' })
                          } else {
                            const direccion = direccionesCliente.find((item) => (item.id ?? item.direccion) === valor)
                            if (direccion) setDatos({ ...datos, direccionEntrega: direccion.direccion })
                          }
                        }}
                        placeholder="Selecciona una dirección"
                        helperText={destinoBloqueado
                          ? 'La entrega ya inició; el destino queda bloqueado para conservar la trazabilidad.'
                          : direccionSeleccionadaId === '__pedido__'
                            ? 'Destino confirmado en Ventas; se conservará como referencia de esta entrega.'
                            : direccionSeleccionadaId === '__manual__'
                              ? 'Destino excepcional; se guardará solo en esta entrega.'
                              : pedidoSeleccionado?.direccionEntrega
                                ? 'Dirección alternativa del cliente; el pedido y la venta no se modifican.'
                                : 'Dirección del maestro del cliente; se conservará en esta entrega.'}
                        disabled={destinoBloqueado}
                        required
                        noOptionsMessage="El cliente no tiene direcciones de entrega activas."
                      />
                    ) : null}
                    {(!direccionesCliente.length || direccionSeleccionadaId === '__manual__') ? (
                      <div className={direccionesCliente.length ? 'mt-3' : ''}>
                        <label htmlFor="direccion-entrega-manual" className="field-label">Dirección de entrega<span aria-hidden="true"> *</span></label>
                        <input id="direccion-entrega-manual" required minLength={3} maxLength={240} disabled={destinoBloqueado} value={datos.direccionEntrega} onChange={(evento) => { setDireccionSeleccionadaId('__manual__'); setDatos({ ...datos, direccionEntrega: evento.target.value }) }} className="field-control" placeholder="Ingresa la dirección de destino del cliente" />
                        <p className="mt-1 text-xs text-muted-foreground">{direccionesCliente.length ? 'Se registrará como excepción de esta entrega, sin cambiar el pedido.' : 'El cliente no tiene dirección registrada; ingresa el destino para este envío.'}</p>
                      </div>
                    ) : null}
                    {datos.direccionEntrega ? <p className="mt-2 break-words border-s-2 border-primary/40 ps-3 text-sm text-muted-foreground">Destino aplicado a esta entrega: <span className="font-medium text-foreground">{datos.direccionEntrega}</span></p> : null}
                </div>
              </section>

              <section aria-labelledby="programacion-entrega-title" className="space-y-4 border-t pt-5">
                <div><h3 id="programacion-entrega-title" className="text-sm font-semibold uppercase tracking-[.06em] text-primary">Programación y documentos</h3><p className="mt-1 text-sm text-muted-foreground">Registra la fecha y la guía que acompañará el traslado. Los datos del vehículo se completan cuando se prepara la salida.</p></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><label htmlFor="fecha-programada" className="field-label">Fecha programada<span aria-hidden="true"> *</span></label><input id="fecha-programada" required type="date" value={datos.fechaProgramada} onChange={(evento) => setDatos({ ...datos, fechaProgramada: evento.target.value })} className="field-control" /></div>
                  <div><label htmlFor="fecha-emision" className="field-label">Fecha de emisión de la guía<span aria-hidden="true"> *</span></label><input id="fecha-emision" required type="date" value={datos.fechaEmision} onChange={(evento) => setDatos({ ...datos, fechaEmision: evento.target.value })} className="field-control" /></div>
                  <div><label htmlFor="numero-despacho" className="field-label">Referencia interna de despacho<span aria-hidden="true"> *</span></label><input id="numero-despacho" required maxLength={40} value={datos.numeroDespacho} onChange={(evento) => setDatos({ ...datos, numeroDespacho: evento.target.value })} className="field-control" /><p className="mt-1 text-xs text-muted-foreground">Identificador interno; no reemplaza la guía de remisión.</p></div>
                  <div><label htmlFor="guia-remision" className="field-label">Número de guía de remisión<span aria-hidden="true"> *</span></label><input id="guia-remision" required maxLength={40} value={datos.numeroGuiaRemision} onChange={(evento) => setDatos({ ...datos, numeroGuiaRemision: evento.target.value })} className="field-control" /></div>
                  <div><label htmlFor="modalidad" className="field-label">Modalidad de transporte<span aria-hidden="true"> *</span></label><select id="modalidad" value={datos.modalidad} onChange={(evento) => { const modalidad = evento.target.value as DatosProgramacionEntrega['modalidad']; setDatos({ ...datos, modalidad, tipoTransporte: tipoTransporteParaModalidad(modalidad, datos.tipoTransporte) }) }} className="field-control"><option value="movilidad_propia">Movilidad propia</option><option value="movilidad_externa">Movilidad externa</option>{edicion && esRecojoCliente ? <option value="recojo_cliente">Recojo del cliente (registro existente)</option> : null}</select></div>
                </div>
                <details className="border" open={requiereDatosTransporte || Boolean(datos.transportista || datos.conductor || datos.vehiculo || datos.placa)}>
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Datos de ruta <span className="font-normal text-muted-foreground">· completar antes de iniciar el traslado</span></summary>
                  <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
                    <div><label htmlFor="transportista" className="field-label">Transportista{requiereTransportista ? <span aria-hidden="true"> *</span> : null}</label><input id="transportista" required={requiereTransportista} disabled={esRecojoCliente} value={datos.transportista} onChange={(evento) => setDatos({ ...datos, transportista: evento.target.value })} className="field-control" /></div>
                    <div><label htmlFor="conductor" className="field-label">Conductor{requiereDatosTransporte ? <span aria-hidden="true"> *</span> : null}</label><input id="conductor" required={requiereDatosTransporte} disabled={esRecojoCliente} value={datos.conductor} onChange={(evento) => setDatos({ ...datos, conductor: evento.target.value })} className="field-control" /></div>
                    <div><label htmlFor="vehiculo" className="field-label">Vehículo{requiereDatosTransporte ? <span aria-hidden="true"> *</span> : null}</label><input id="vehiculo" required={requiereDatosTransporte} disabled={esRecojoCliente} value={datos.vehiculo} onChange={(evento) => setDatos({ ...datos, vehiculo: evento.target.value })} className="field-control" /></div>
                    <div><label htmlFor="placa" className="field-label">Placa{requiereDatosTransporte ? <span aria-hidden="true"> *</span> : null}</label><input id="placa" required={requiereDatosTransporte} disabled={esRecojoCliente} value={datos.placa} onChange={(evento) => setDatos({ ...datos, placa: evento.target.value })} className="field-control" /></div>
                  </div>
                </details>
              </section>

              <div><label htmlFor="observaciones-entrega" className="field-label">Observaciones de planificación</label><textarea id="observaciones-entrega" rows={3} value={datos.observaciones} onChange={(evento) => setDatos({ ...datos, observaciones: evento.target.value })} className="field-control" placeholder="Indicaciones para preparar o coordinar esta entrega" /><p className="mt-1 text-xs text-muted-foreground">La evidencia y las incidencias se registran en cada resultado, no en la planificación.</p></div>
                </>
              )}
              </div>
            </div>
            <footer className="flex shrink-0 justify-end gap-2 border-t bg-background px-6 py-4"><Button type="button" variant="outline" onClick={() => { setFormularioAbierto(false); setReprogramacionEnCurso(false) }}>Cancelar</Button><Button type="submit">{reprogramacionEnCurso ? 'Confirmar nueva fecha' : edicion ? 'Guardar cambios' : 'Programar entrega'}</Button></footer>
          </form>
          </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      ) : null}
    </div>
  )
}
