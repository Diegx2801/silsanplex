import { ResultadosPruebas } from './ResultadosPruebas'
import { FechasReparacion } from './FechasReparacion'
import { fechaTecnica, type CambioEstadoPendiente } from '../modelo/finalizacionTecnica'
import { AdjuntosReparacion } from './AdjuntosReparacion'
import { AtencionComplementariaReparacion } from './AtencionComplementariaReparacion'
import { AccesoriosReparacion } from './AccesoriosReparacion'
import { DialogoEntregaAccesorios, RecuperarEntregaAccesorios } from './DialogoEntregaAccesorios'
import { DetalleEventoAccesorio } from './DetalleEventoAccesorio'
import { NoReparableReparacion } from './NoReparableReparacion'
import { DetalleEventoNoReparable } from './DetalleEventoNoReparable'
import {
  Ban,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  LoaderCircle,
  Package,
  Pencil,
  Plus,
  ReceiptText,
  Send,
  UserRound,
  Wrench,
  X,
} from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import type { Almacen, UbicacionAlmacen } from '@/modulos/inventario/modelo/almacen'
import type {
  ConsumoPartePendiente,
  CotizacionPendiente,
  ReservaPartePendiente,
} from '@/modulos/reparaciones/estado/creacionPendiente'
import { DialogoCotizacion } from '@/modulos/reparaciones/componentes/DialogoCotizacion'
import { DialogoDiagnostico } from '@/modulos/reparaciones/componentes/DialogoDiagnostico'
import {
  DialogoAsignacion,
  DialogoCambioEstado,
  DialogoObservacion,
} from '@/modulos/reparaciones/componentes/DialogosAccionReparacion'
import { DialogoPrueba } from '@/modulos/reparaciones/componentes/DialogoPrueba'
import { DialogoSolucionReparacion } from '@/modulos/reparaciones/componentes/DialogoSolucionReparacion'
import {
  DialogoConsumoParte,
  DialogoReservaParte,
} from '@/modulos/reparaciones/componentes/DialogoRepuesto'
import {
  etiquetasEstadoCotizacion,
  etiquetasEstadoParte,
  etiquetasEstadoReparacion,
  etiquetasEstadoStockReparacion,
  estadoStockReparacionEsConsumible,
  estadoEsEditable,
  estadoEsTerminal,
  obtenerTransicionesGenericas,
  tonosEstadoReparacion,
  type DatosConsumoParte,
  type DatosCotizacion,
  type DatosDiagnostico,
  type DatosObservacionReparacion,
  type DatosPrueba,
  type DatosReservaParte,
  type DatosSolucionReparacion,
  type CotizacionReparacion,
  type ConsultaCatalogoReparacion,
  type DetalleReparacion as DatosDetalleReparacion,
  type EstadoReparacion,
  type LineaCotizacionReparacion,
  type OpcionProductoReparacion,
  type ParteReparacion,
  type Reparacion,
  type ResultadoCatalogoReparacion,
} from '@/modulos/reparaciones/modelo/reparacion'

const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Lima',
})
const formatoFechaDia = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium',
})

function importe(valor: number, moneda: 'PEN' | 'USD' = 'PEN') {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: moneda,
  }).format(valor)
}

function mostrar(valor: string | null | undefined, vacio = 'Sin registrar') {
  return valor?.trim() || vacio
}

function abreviarId(valor: string | null | undefined) {
  return valor ? `${valor.slice(0, 8)}…` : 'Sin asignar'
}

function nombreAlmacen(almacenes: readonly Almacen[], id: string) {
  const almacen = almacenes.find((item) => item.id === id)
  return almacen ? `${almacen.codigo} · ${almacen.nombre}` : abreviarId(id)
}

function nombreUbicacion(ubicaciones: readonly UbicacionAlmacen[], id: string) {
  const ubicacion = ubicaciones.find((item) => item.id === id)
  return ubicacion ? `${ubicacion.codigo} · ${ubicacion.nombre}` : abreviarId(id)
}

function etiquetaEvento(tipo: string) {
  const etiquetas: Record<string, string> = {
    NON_REPAIRABLE_DECLARED: 'Equipo declarado No reparable',
    NON_REPAIRABLE_REOPENED: 'Decisión No reparable revocada para reevaluación',
    RETURNED_UNREPAIRED: 'Equipo devuelto sin reparar',
    ATTACHMENT_ADDED: 'Evidencia adjuntada',
    ACCESSORY_RECEIVED: 'Accesorio recibido',
    ACCESSORY_UPDATED: 'Accesorio corregido',
    ACCESSORY_VOIDED: 'Accesorio anulado',
    ACCESSORY_RETURNED: 'Accesorio devuelto',
    ACCESSORY_DELIVERY_EXCEPTION: 'Entrega autorizada con accesorios pendientes',
    EXTERNAL_SERVICE_SENT: 'Equipo enviado a proveedor',
    EXTERNAL_SERVICE_RECEIVED: 'Equipo retornado del proveedor',
    SERVICE_WARRANTY_CONFIGURED: 'Garantía del servicio configurada',
    CREATED: 'Reparación creada',
    UPDATED: 'Datos actualizados',
    STATUS_CHANGED: 'Estado cambiado',
    DIAGNOSIS_CREATED: 'Diagnóstico registrado',
    SOLUTION_RECORDED: 'Solución aplicada registrada',
    QUOTE_CREATED: 'Cotización guardada',
    QUOTE_UPDATED: 'Cotización actualizada',
    QUOTE_REVISION_CREATED: 'Revisión de cotización creada',
    QUOTE_SUBMITTED: 'Cotización enviada',
    QUOTE_APPROVED: 'Cotización aprobada',
    QUOTE_REJECTED: 'Cotización rechazada',
    PART_RESERVED: 'Repuesto reservado',
    PART_CONSUMED: 'Repuesto consumido',
    PART_CANCELLED: 'Reserva cancelada',
    TEST_COMPLETED: 'Prueba registrada',
    DELIVERED: 'Reparación entregada',
    CANCELLED: 'Reparación cancelada',
  }
  return etiquetas[tipo] ?? tipo
}

interface DatoProps {
  etiqueta: string
  valor: ReactNode
}

function Dato({ etiqueta, valor }: DatoProps) {
  return (
    <div className="border-t py-3 first:border-t-0">
      <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">{etiqueta}</dt>
      <dd className="mt-1 text-sm leading-6">{valor}</dd>
    </div>
  )
}

interface DetalleReparacionProps {
  abierto: boolean
  detalle: DatosDetalleReparacion | undefined
  cargando: boolean
  error: unknown
  productos: readonly OpcionProductoReparacion[]
  totalProductos?: number
  buscarProductos?: (consulta: ConsultaCatalogoReparacion) => Promise<ResultadoCatalogoReparacion<OpcionProductoReparacion>>
  resolverProducto?: (id: string) => Promise<OpcionProductoReparacion | null>
  almacenes: readonly Almacen[]
  totalAlmacenes?: number
  buscarAlmacenes?: (consulta: ConsultaCatalogoReparacion) => Promise<ResultadoCatalogoReparacion<Almacen>>
  resolverAlmacen?: (id: string) => Promise<Almacen | null>
  resolverUbicacion?: (id: string) => Promise<UbicacionAlmacen | null>
  ubicaciones: readonly UbicacionAlmacen[]
  cargarLineasCotizacion?: (cotizacionId: string) => Promise<LineaCotizacionReparacion[]>
  puedeEditar: boolean
  puedeAsignar: boolean
  puedeCambiarEstado: boolean
  puedeRealizarTecnica: boolean
  puedeAprobarCotizacion: boolean
  puedeUsarPartes: boolean
  puedeEntregar: boolean
  alCambiarApertura: (abierto: boolean) => void
  alRestaurarFoco: () => void
  alEditar: () => void
  alAsignar: (reparacionId: string, tecnicoId: string, expectedLockVersion: number) => Promise<string | undefined>
  alCambiarEstado: (reparacionId: string, estado: EstadoReparacion, observacion: string, expectedLockVersion: number, operationKey: string) => Promise<string | undefined>
  alRegistrarDiagnostico: (reparacionId: string, datos: DatosDiagnostico, expectedLockVersion: number) => Promise<string | undefined>
  alRegistrarSolucion: (reparacionId: string, datos: DatosSolucionReparacion, expectedLockVersion: number) => Promise<string | undefined>
  alGuardarCotizacion: (reparacionId: string, datos: DatosCotizacion, enviar: boolean, operationKey: string, expectedLockVersion: number) => Promise<string | undefined>
  alRevisarCotizacion: (reparacionId: string, cotizacionId: string, datos: DatosCotizacion, enviar: boolean, operationKey: string, expectedLockVersion: number) => Promise<string | undefined>
  alAprobarCotizacion: (reparacionId: string, cotizacionId: string, datos: DatosObservacionReparacion, expectedLockVersion: number) => Promise<string | undefined>
  alRechazarCotizacion: (reparacionId: string, cotizacionId: string, datos: DatosObservacionReparacion, expectedLockVersion: number) => Promise<string | undefined>
  alReservarParte: (reparacionId: string, datos: DatosReservaParte, operationKey: string, expectedLockVersion: number) => Promise<string | undefined>
  alConsumirParte: (parteId: string, datos: DatosConsumoParte, operationKey: string, expectedLockVersion: number) => Promise<string | undefined>
  alCancelarParte: (parteId: string, datos: DatosObservacionReparacion, expectedLockVersion: number) => Promise<string | undefined>
  alRegistrarPrueba: (reparacionId: string, datos: DatosPrueba, expectedLockVersion: number) => Promise<string | undefined>
  alEntregar: (reparacionId: string, datos: DatosObservacionReparacion, expectedLockVersion: number) => Promise<string | undefined>
  alCancelar: (reparacionId: string, datos: DatosObservacionReparacion, expectedLockVersion: number) => Promise<string | undefined>
  recuperarCotizacionPendiente?: (reparacionId: string, esRevision: boolean) => CotizacionPendiente | null
  recuperarEstadoPendiente?: (reparacionId: string) => CambioEstadoPendiente | null
  recuperarReservaPartePendiente?: (reparacionId: string) => ReservaPartePendiente | null
  recuperarConsumoPartePendiente?: (reparacionId: string, parteId: string) => ConsumoPartePendiente | null
}

type TipoDialogoActivo =
  | 'estado'
  | 'asignacion'
  | 'diagnostico'
  | 'solucion'
  | 'cotizacion'
  | 'aprobar'
  | 'rechazar'
  | 'reserva'
  | 'consumo'
  | 'cancelarParte'
  | 'prueba'
  | 'entregar'
  | 'cancelar'

interface ContextoAccion {
  estadoPendiente?: CambioEstadoPendiente | null
  tipo: TipoDialogoActivo
  reparacion: Reparacion
  cotizacion: CotizacionReparacion | null
  cotizacionPendiente?: CotizacionPendiente | null
  reservaPendiente?: ReservaPartePendiente | null
  consumoPendiente?: ConsumoPartePendiente | null
  parte?: ParteReparacion
}

function crearContextoAccion(
  tipo: TipoDialogoActivo,
  detalle: DatosDetalleReparacion,
): ContextoAccion {
  return {
    tipo,
    reparacion: { ...detalle.reparacion },
    cotizacion: detalle.cotizacionActiva
      ? {
          ...detalle.cotizacionActiva,
          lineas: detalle.cotizacionActiva.lineas.map((linea) => ({ ...linea })),
        }
      : null,
  }
}

export function DetalleReparacion({
  abierto,
  detalle,
  cargando,
  error,
  productos,
  totalProductos = productos.length,
  buscarProductos,
  resolverProducto,
  almacenes,
  totalAlmacenes = almacenes.length,
  buscarAlmacenes,
  resolverAlmacen,
  resolverUbicacion,
  ubicaciones,
  cargarLineasCotizacion,
  puedeEditar,
  puedeAsignar,
  puedeCambiarEstado,
  puedeRealizarTecnica,
  puedeAprobarCotizacion,
  puedeUsarPartes,
  puedeEntregar,
  alCambiarApertura,
  alRestaurarFoco,
  alEditar,
  alAsignar,
  alCambiarEstado,
  alRegistrarDiagnostico,
  alRegistrarSolucion,
  alGuardarCotizacion,
  alRevisarCotizacion,
  alAprobarCotizacion,
  alRechazarCotizacion,
  alReservarParte,
  alConsumirParte,
  alCancelarParte,
  alRegistrarPrueba,
  alCancelar,
  recuperarCotizacionPendiente = () => null,
  recuperarEstadoPendiente = () => null,
  recuperarReservaPartePendiente = () => null,
  recuperarConsumoPartePendiente = () => null,
}: DetalleReparacionProps) {
  const [accion, setAccion] = useState<ContextoAccion | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [almacenesHistoricos, setAlmacenesHistoricos] = useState<Almacen[]>([])
  const [ubicacionesHistoricas, setUbicacionesHistoricas] = useState<UbicacionAlmacen[]>([])
  const [productosHistoricos, setProductosHistoricos] = useState<OpcionProductoReparacion[]>([])
  const productosDisponibles = [...productos, ...productosHistoricos.filter((item) => !productos.some((producto) => producto.id === item.id))]

  useEffect(() => {
    if (!detalle || !resolverProducto) { setProductosHistoricos([]); return }
    let vigente = true
    const ids = [...new Set(detalle.partes.map((parte) => parte.productoId))]
    void Promise.all(ids.map((id) => resolverProducto(id))).then((opciones) => {
      if (vigente) setProductosHistoricos(opciones.filter((item): item is OpcionProductoReparacion => Boolean(item)))
    }).catch(() => { if (vigente) setProductosHistoricos([]) })
    return () => { vigente = false }
  }, [detalle, resolverProducto])
  const almacenesDisponibles = [...almacenesHistoricos,
    ...almacenes.filter((item) => !almacenesHistoricos.some((historico) => historico.id === item.id))]
  const ubicacionesDisponibles = [...ubicacionesHistoricas,
    ...ubicaciones.filter((item) => !ubicacionesHistoricas.some((historica) => historica.id === item.id))]

  useEffect(() => {
    if (!detalle) {
      setAlmacenesHistoricos([])
      setUbicacionesHistoricas([])
      return
    }
    let vigente = true
    const almacenIds = [...new Set(detalle.partes.map((parte) => parte.almacenId))]
    const ubicacionIds = [...new Set(detalle.partes.map((parte) => parte.ubicacionId))]
    void Promise.all([
      resolverAlmacen ? Promise.all(almacenIds.map((id) => resolverAlmacen(id))) : [],
      resolverUbicacion ? Promise.all(ubicacionIds.map((id) => resolverUbicacion(id))) : [],
    ]).then(([almacenesResueltos, ubicacionesResueltas]) => {
      if (!vigente) return
      const almacenesValidos: Almacen[] = []
      const ubicacionesValidas: UbicacionAlmacen[] = []
      for (const almacen of almacenesResueltos) {
        if (almacen) almacenesValidos.push(almacen)
      }
      for (const ubicacion of ubicacionesResueltas) {
        if (ubicacion) ubicacionesValidas.push(ubicacion)
      }
      setAlmacenesHistoricos(almacenesValidos)
      setUbicacionesHistoricas(ubicacionesValidas)
    }).catch(() => {
      if (!vigente) return
      setAlmacenesHistoricos([])
      setUbicacionesHistoricas([])
    })
    return () => { vigente = false }
  }, [detalle, resolverAlmacen, resolverUbicacion])

  const cerrarDialogo = (abiertoDialogo: boolean) => {
    if (!abiertoDialogo) setAccion(null)
  }

  const ejecutar = async (
    accion: () => Promise<string | undefined>,
    mensajeExito: string,
  ) => {
    setMensaje('')
    const errorAccion = await accion()
    if (errorAccion) return errorAccion
    setMensaje(mensajeExito)
    return undefined
  }

  const abrirDialogo = (tipo: TipoDialogoActivo) => {
    if (!detalle) return
    try {
      const contexto = crearContextoAccion(tipo, detalle)
      if (tipo === 'estado') contexto.estadoPendiente = recuperarEstadoPendiente(detalle.reparacion.id)
      if (tipo === 'cotizacion') {
        contexto.cotizacionPendiente = recuperarCotizacionPendiente(
          detalle.reparacion.id,
          detalle.reparacion.estado === 'rejected',
        )
      }
      if (tipo === 'reserva') {
        contexto.reservaPendiente = recuperarReservaPartePendiente(detalle.reparacion.id)
      }
      setAccion(contexto)
    } catch (errorRecuperacion) {
      setMensaje(errorRecuperacion instanceof Error
        ? errorRecuperacion.message
        : 'No se pudo recuperar la operación pendiente.')
    }
  }

  const recuperarEstado = () => {
    if (!detalle || !puedeCambiarEstado) return
    try {
      const pendiente = recuperarEstadoPendiente(detalle.reparacion.id)
      if (!pendiente) { setMensaje('No hay un cambio de estado pendiente de confirmar en esta pestaña.'); return }
      setAccion({ ...crearContextoAccion('estado', detalle), estadoPendiente: pendiente })
    } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo recuperar el cambio pendiente.') }
  }

  const abrirParte = (tipo: 'consumo' | 'cancelarParte', parte: ParteReparacion) => {
    if (tipo === 'consumo' && !estadoStockReparacionEsConsumible(parte.estadoStock)) {
      setMensaje('El stock dañado o en cuarentena no puede consumirse en Reparaciones.')
      return
    }
    if (!detalle) return
    try {
      setAccion({
        ...crearContextoAccion(tipo, detalle),
        consumoPendiente: tipo === 'consumo' ? recuperarConsumoPartePendiente(detalle.reparacion.id, parte.id) : null,
        parte: { ...parte, consumos: parte.consumos.map((consumo) => ({ ...consumo })) },
      })
    } catch {
      setMensaje('No se pudo recuperar el consumo pendiente. No se enviará otro consumo hasta recuperar los datos de esta pestaña.')
    }
  }

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 end-0 z-50 flex w-full max-w-4xl flex-col border-s bg-background shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <div className="flex items-center justify-between gap-4 border-b bg-muted/45 px-5 py-3 sm:px-7">
            <span className="font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">Orden de reparación</span>
            <DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar detalle de reparación" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="size-5" /></button></DialogPrimitive.Close>
          </div>

          {cargando ? (
            <div role="status" className="grid min-h-80 place-items-center px-5 py-12 text-center">
              <div><LoaderCircle aria-hidden="true" className="mx-auto size-8 animate-spin text-primary" /><p className="mt-4 font-medium">Cargando detalle</p><p className="mt-1 text-sm text-muted-foreground">Consultando trazabilidad, cotización e inventario.</p></div>
            </div>
          ) : error || !detalle ? (
            <div role="alert" className="grid min-h-80 place-items-center px-5 py-12 text-center sm:px-7">
              <div><FileText aria-hidden="true" className="mx-auto size-8 text-destructive" /><p className="mt-4 font-medium">No se pudo cargar la reparación</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{error instanceof Error ? error.message : 'La reparación no está disponible o ya no pertenece a tu organización.'}</p></div>
            </div>
          ) : (
            <DetalleContenido
              detalle={detalle}
              productos={productosDisponibles}
              almacenes={almacenesDisponibles}
              ubicaciones={ubicacionesDisponibles}
              cargarLineasCotizacion={cargarLineasCotizacion}
              puedeEditar={puedeEditar}
              puedeAsignar={puedeAsignar}
              puedeCambiarEstado={puedeCambiarEstado}
              puedeRealizarTecnica={puedeRealizarTecnica}
              puedeAprobarCotizacion={puedeAprobarCotizacion}
              puedeUsarPartes={puedeUsarPartes && detalle.reparacion.estado !== 'testing'}
              puedeEntregar={puedeEntregar}
              alEditar={alEditar}
              alAbrirDialogo={abrirDialogo}
              alRecuperarEstado={recuperarEstado}
              alAbrirParte={abrirParte}
            />
          )}

          {mensaje ? <p role="status" aria-live="polite" className="border-t bg-primary/5 px-5 py-3 text-sm text-primary sm:px-7">{mensaje}</p> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

      {accion ? (
        <>
          <DialogoCambioEstado
            abierto={accion.tipo === 'estado'}
            reparacion={accion.reparacion}
            pendiente={accion.estadoPendiente}
            alCambiarApertura={cerrarDialogo}
            alGuardar={(estado, observacion, clave) => ejecutar(() => alCambiarEstado(accion.reparacion.id, estado, observacion, accion.estadoPendiente?.expectedLockVersion ?? accion.reparacion.lockVersion, clave), 'Estado actualizado.')}
          />
          <DialogoAsignacion
            key={`asignacion-${accion.reparacion.tecnicoAsignadoId ?? 'sin-tecnico'}`}
            abierto={accion.tipo === 'asignacion'}
            reparacion={accion.reparacion}
            alCambiarApertura={cerrarDialogo}
            alGuardar={(tecnicoId) => ejecutar(() => alAsignar(accion.reparacion.id, tecnicoId, accion.reparacion.lockVersion), 'Técnico asignado.')}
          />
          <DialogoDiagnostico
            abierto={accion.tipo === 'diagnostico'}
            reparacion={accion.reparacion}
            alCambiarApertura={cerrarDialogo}
            alGuardar={(datos) => ejecutar(() => alRegistrarDiagnostico(accion.reparacion.id, datos, accion.reparacion.lockVersion), 'Diagnóstico registrado.')}
          />
          <DialogoSolucionReparacion
            abierto={accion.tipo === 'solucion'}
            reparacion={accion.reparacion}
            alCambiarApertura={cerrarDialogo}
            alGuardar={(datos) => ejecutar(() => alRegistrarSolucion(accion.reparacion.id, datos, accion.reparacion.lockVersion), 'Solución aplicada guardada.')}
          />
          <DialogoCotizacion
            abierto={accion.tipo === 'cotizacion'}
            reparacion={accion.reparacion}
            cotizacion={accion.cotizacion?.estado === 'draft' || accion.reparacion.estado === 'rejected' ? accion.cotizacion : null}
            esRevision={Boolean(accion.cotizacionPendiente?.quoteId) || accion.reparacion.estado === 'rejected'}
            operacionPendiente={accion.cotizacionPendiente}
            productos={productos}
            totalProductos={totalProductos}
            buscarProductos={buscarProductos}
            resolverProducto={resolverProducto}
            alCambiarApertura={cerrarDialogo}
            alGuardar={(datos, enviar, operationKey) => accion.cotizacionPendiente?.quoteId || (accion.reparacion.estado === 'rejected' && accion.cotizacion)
              ? ejecutar(() => alRevisarCotizacion(accion.reparacion.id, accion.cotizacionPendiente?.quoteId ?? accion.cotizacion!.id, datos, enviar, operationKey, accion.reparacion.lockVersion), enviar ? 'Revisión enviada a aprobación.' : 'Revisión guardada como borrador.')
              : ejecutar(() => alGuardarCotizacion(accion.reparacion.id, datos, enviar, operationKey, accion.reparacion.lockVersion), enviar ? 'Cotización enviada a aprobación.' : 'Borrador de cotización guardado.')}
          />
          {accion.cotizacion ? (
            <>
              <DialogoObservacion
                abierto={accion.tipo === 'aprobar'}
                titulo="Aprobar cotización"
                descripcion={`La versión ${accion.cotizacion.version} pasará a aprobada y la orden avanzará.`}
                etiquetaAccion="Aprobar cotización"
                alCambiarApertura={cerrarDialogo}
                alGuardar={(datos) => ejecutar(() => alAprobarCotizacion(accion.reparacion.id, accion.cotizacion!.id, datos, accion.reparacion.lockVersion), 'Cotización aprobada.')}
              />
              <DialogoObservacion
                abierto={accion.tipo === 'rechazar'}
                titulo="Rechazar cotización"
                descripcion="La cotización quedará rechazada. Si el cliente solicita cambios, podrás crear una revisión explícita."
                etiquetaAccion="Rechazar cotización"
                variante="destructive"
                observacionObligatoria
                alCambiarApertura={cerrarDialogo}
                alGuardar={(datos) => ejecutar(() => alRechazarCotizacion(accion.reparacion.id, accion.cotizacion!.id, datos, accion.reparacion.lockVersion), 'Cotización rechazada.')}
              />
            </>
          ) : null}
          <DialogoReservaParte
            abierto={accion.tipo === 'reserva'}
            reparacion={accion.reparacion}
            productos={productos}
            totalProductos={totalProductos}
            buscarProductos={buscarProductos}
            resolverProducto={resolverProducto}
            almacenes={almacenesDisponibles}
            totalAlmacenes={totalAlmacenes}
            buscarAlmacenes={buscarAlmacenes}
            resolverAlmacen={resolverAlmacen}
            ubicaciones={ubicacionesDisponibles}
            operacionPendiente={accion.reservaPendiente}
            alCambiarApertura={cerrarDialogo}
            alGuardar={(datos, operationKey) => ejecutar(() => alReservarParte(accion.reparacion.id, datos, operationKey, accion.reparacion.lockVersion), 'Repuesto reservado.')}
          />
          {accion.parte ? (
            <>
              <DialogoConsumoParte
                abierto={accion.tipo === 'consumo'}
                parte={accion.parte}
                unidadMedida={productosDisponibles.find((producto) => producto.id === accion.parte!.productoId)?.unidadMedida ?? ''}
                operacionPendiente={accion.consumoPendiente}
                alCambiarApertura={cerrarDialogo}
                alGuardar={(datos, operationKey) => ejecutar(() => alConsumirParte(accion.parte!.id, datos, operationKey, accion.reparacion.lockVersion), 'Consumo registrado.')}
              />
              <DialogoObservacion
                abierto={accion.tipo === 'cancelarParte'}
                titulo="Cancelar reserva"
                descripcion={`Se liberará el saldo pendiente de ${accion.parte.productoDescripcionSnapshot}.`}
                etiquetaAccion="Cancelar reserva"
                variante="destructive"
                observacionObligatoria
                alCambiarApertura={cerrarDialogo}
                alGuardar={(datos) => ejecutar(() => alCancelarParte(accion.parte!.id, datos, accion.reparacion.lockVersion), 'Reserva cancelada.')}
              />
            </>
          ) : null}
          <DialogoPrueba
            abierto={accion.tipo === 'prueba'}
            reparacion={accion.reparacion}
            alCambiarApertura={cerrarDialogo}
            alGuardar={(datos) => ejecutar(() => alRegistrarPrueba(accion.reparacion.id, datos, accion.reparacion.lockVersion), 'Prueba registrada.')}
          />
          <DialogoEntregaAccesorios
            abierto={accion.tipo === 'entregar'}
            reparacion={accion.reparacion}
            alCambiarApertura={cerrarDialogo}
          />
          <DialogoObservacion
            abierto={accion.tipo === 'cancelar'}
            titulo="Cancelar reparación"
            descripcion="La orden pasará a cancelada y las reservas pendientes se liberarán automáticamente."
            etiquetaAccion="Cancelar reparación"
            variante="destructive"
            observacionObligatoria
            alCambiarApertura={cerrarDialogo}
            alGuardar={(datos) => ejecutar(() => alCancelar(accion.reparacion.id, datos, accion.reparacion.lockVersion), 'Reparación cancelada.')}
          />
        </>
      ) : null}
    </DialogPrimitive.Root>
  )
}

interface DetalleContenidoProps {
  alRecuperarEstado: () => void
  detalle: DatosDetalleReparacion
  productos: readonly OpcionProductoReparacion[]
  almacenes: readonly Almacen[]
  ubicaciones: readonly UbicacionAlmacen[]
  cargarLineasCotizacion?: (cotizacionId: string) => Promise<LineaCotizacionReparacion[]>
  puedeEditar: boolean
  puedeAsignar: boolean
  puedeCambiarEstado: boolean
  puedeRealizarTecnica: boolean
  puedeAprobarCotizacion: boolean
  puedeUsarPartes: boolean
  puedeEntregar: boolean
  alEditar: () => void
  alAbrirDialogo: (dialogo: TipoDialogoActivo) => void
  alAbrirParte: (dialogo: 'consumo' | 'cancelarParte', parte: ParteReparacion) => void
}

interface CotizacionesDetalleProps {
  detalle: DatosDetalleReparacion
  puedeCotizar: boolean
  puedeRevisar: boolean
  puedeAprobar: boolean
  alAbrirDialogo: (dialogo: TipoDialogoActivo) => void
  cargarLineasCotizacion?: (cotizacionId: string) => Promise<LineaCotizacionReparacion[]>
}

function CotizacionesDetalle({
  detalle,
  puedeCotizar,
  puedeRevisar,
  puedeAprobar,
  alAbrirDialogo,
  cargarLineasCotizacion,
}: CotizacionesDetalleProps) {
  const cotizacionActiva = detalle.cotizacionActiva
  const [cotizacionSeleccionadaId, setCotizacionSeleccionadaId] = useState(
    cotizacionActiva?.id ?? detalle.cotizaciones[0]?.id ?? '',
  )
  const [lineasCargadas, setLineasCargadas] = useState<Record<string, LineaCotizacionReparacion[]>>(
    cotizacionActiva ? { [cotizacionActiva.id]: cotizacionActiva.lineas } : {},
  )
  const [cotizacionCargandoId, setCotizacionCargandoId] = useState('')
  const [errorLineas, setErrorLineas] = useState('')
  const solicitudActual = useRef(0)

  useEffect(() => {
    if (!cotizacionActiva) return
    setLineasCargadas((actuales) => ({
      ...actuales,
      [cotizacionActiva.id]: cotizacionActiva.lineas,
    }))
  }, [cotizacionActiva])

  const solicitarLineas = (cotizacionId: string) => {
    const solicitud = ++solicitudActual.current
    setCotizacionCargandoId(cotizacionId)
    setErrorLineas('')
    if (!cargarLineasCotizacion) {
      setCotizacionCargandoId('')
      setErrorLineas('No se pudieron consultar las líneas de esta cotización.')
      return
    }
    void cargarLineasCotizacion(cotizacionId).then((lineas) => {
      if (solicitud !== solicitudActual.current) return
      setLineasCargadas((actuales) => ({ ...actuales, [cotizacionId]: lineas }))
    }).catch((error: unknown) => {
      if (solicitud !== solicitudActual.current) return
      setErrorLineas(error instanceof Error
        ? error.message
        : 'No se pudieron consultar las líneas de esta cotización.')
    }).finally(() => {
      if (solicitud === solicitudActual.current) setCotizacionCargandoId('')
    })
  }

  const seleccionarCotizacion = (cotizacionId: string) => {
    ++solicitudActual.current
    setCotizacionSeleccionadaId(cotizacionId)
    setCotizacionCargandoId('')
    setErrorLineas('')
    if (cotizacionId === cotizacionActiva?.id
      || Object.prototype.hasOwnProperty.call(lineasCargadas, cotizacionId)) return
    solicitarLineas(cotizacionId)
  }

  const cotizacionBase = detalle.cotizaciones.find(
    (item) => item.id === cotizacionSeleccionadaId,
  ) ?? cotizacionActiva
  const cotizacion = cotizacionBase ? {
    ...cotizacionBase,
    lineas: lineasCargadas[cotizacionBase.id] ?? cotizacionBase.lineas,
  } : null
  const cargandoLineas = cotizacionCargandoId === cotizacion?.id
  const lineasConsultadas = Boolean(cotizacion && (
    cotizacion.id === cotizacionActiva?.id
    || Object.prototype.hasOwnProperty.call(lineasCargadas, cotizacion.id)
  ))

  return <section aria-labelledby="reparacion-cotizaciones" className="border-b px-5 py-6 sm:px-7">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="reparacion-cotizaciones" className="flex items-center gap-2 font-semibold"><ReceiptText aria-hidden="true" className="size-4 text-primary" /> Cotización</h2>
        <p className="mt-1 text-sm text-muted-foreground">{detalle.cotizaciones.length ? `${detalle.cotizaciones.length} versión${detalle.cotizaciones.length === 1 ? '' : 'es'} registrada${detalle.cotizaciones.length === 1 ? '' : 's'}` : 'Aún no hay cotizaciones'}</p>
      </div>
      {puedeCotizar || puedeRevisar ? <Button type="button" variant="outline" onClick={() => alAbrirDialogo('cotizacion')}><Plus aria-hidden="true" /> {puedeRevisar ? 'Crear revisión' : cotizacionActiva?.estado === 'draft' ? 'Editar borrador' : 'Crear cotización'}</Button> : null}
    </div>
    {detalle.cotizaciones.length > 1 ? <div className="mt-5 max-w-sm">
      <label htmlFor="cotizacion-version" className="field-label">Versión de cotización</label>
      <select id="cotizacion-version" className="field-control" value={cotizacionSeleccionadaId}
        disabled={Boolean(cotizacionCargandoId)}
        onChange={(evento) => seleccionarCotizacion(evento.target.value)}>
        {detalle.cotizaciones.map((item) => <option key={item.id} value={item.id}>
          Versión {item.version} · {etiquetasEstadoCotizacion[item.estado]} · {importe(item.total, item.moneda)}{item.esActual ? ' · vigente' : ''}
        </option>)}
      </select>
    </div> : null}
    {cotizacion ? <article className="mt-5 border bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-medium">Versión {cotizacion.version}{cotizacion.esActual ? ' · vigente' : ' · histórica'}</p><p className="mt-1 text-xs text-muted-foreground">{etiquetasEstadoCotizacion[cotizacion.estado]} · {cotizacion.preciosIncluyenImpuesto ? 'Precios con impuesto incluido' : 'Precios sin impuesto incluido'} · Tasa {cotizacion.tasaImpuesto}%{cotizacion.tipoCambioPen != null ? ` · TC ${cotizacion.tipoCambioPen} PEN/${cotizacion.moneda}` : ' · TC histórico no registrado'}</p></div>
        <span className="status-label" data-tone={cotizacion.estado === 'approved' ? 'listo' : cotizacion.estado === 'pending' ? 'pendiente' : 'revision'}>{etiquetasEstadoCotizacion[cotizacion.estado]}</span>
      </div>
      {cargandoLineas ? <div role="status" className="mt-4 border border-dashed px-4 py-5 text-sm text-muted-foreground">Cargando líneas de la versión {cotizacion.version}…</div>
        : errorLineas ? <div role="alert" className="mt-4 border border-destructive/40 px-4 py-4 text-sm text-destructive"><p>{errorLineas}</p><Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => solicitarLineas(cotizacion.id)}>Reintentar líneas</Button></div>
          : lineasConsultadas && cotizacion.lineas.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[34rem] text-left text-sm"><thead className="border-b font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase"><tr><th className="py-2 pe-3">Concepto</th><th className="px-3 py-2 text-end">Cant.</th><th className="px-3 py-2 text-end">Precio</th><th className="ps-3 py-2 text-end">Subtotal</th></tr></thead><tbody className="divide-y">{cotizacion.lineas.map((linea) => <tr key={linea.id}><td className="py-3 pe-3"><span className="font-medium">{linea.descripcion}</span><span className="mt-1 block text-xs text-muted-foreground">{linea.tipo === 'part' ? 'Repuesto' : linea.tipo === 'labor' ? 'Mano de obra' : 'Servicio externo'}{linea.gravable ? ' · Gravable' : ''}</span></td><td className="px-3 py-3 text-end font-mono text-xs tabular-nums">{linea.cantidad}</td><td className="px-3 py-3 text-end font-mono text-xs tabular-nums">{importe(linea.precioUnitario, cotizacion.moneda)}</td><td className="ps-3 py-3 text-end font-mono text-xs tabular-nums">{importe(linea.subtotalLinea, cotizacion.moneda)}</td></tr>)}</tbody></table></div>
            : lineasConsultadas ? <p className="mt-4 border border-dashed px-4 py-5 text-sm text-muted-foreground">Esta cotización no tiene líneas registradas.</p> : null}
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 text-sm"><div><dt className="text-xs text-muted-foreground">Subtotal</dt><dd className="mt-1 font-mono font-semibold tabular-nums">{importe(cotizacion.subtotal, cotizacion.moneda)}</dd></div><div><dt className="text-xs text-muted-foreground">Impuesto</dt><dd className="mt-1 font-mono font-semibold tabular-nums">{importe(cotizacion.impuesto, cotizacion.moneda)}</dd></div><div><dt className="text-xs text-muted-foreground">Total</dt><dd className="mt-1 font-mono text-base font-semibold tabular-nums">{importe(cotizacion.total, cotizacion.moneda)}</dd></div></dl>
      {puedeAprobar && cotizacion.id === cotizacionActiva?.id ? <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => alAbrirDialogo('rechazar')}>Rechazar</Button><Button type="button" onClick={() => alAbrirDialogo('aprobar')}><CheckCircle2 aria-hidden="true" /> Aprobar</Button></div> : null}
    </article> : <p className="mt-5 border border-dashed px-4 py-5 text-sm text-muted-foreground">La cotización se crea después de registrar el diagnóstico o cuando el flujo lo permita.</p>}
  </section>
}

function DetalleContenido({
  alRecuperarEstado,
  detalle,
  productos,
  almacenes,
  ubicaciones,
  cargarLineasCotizacion,
  puedeEditar,
  puedeAsignar,
  puedeCambiarEstado,
  puedeRealizarTecnica,
  puedeAprobarCotizacion,
  puedeUsarPartes,
  puedeEntregar,
  alEditar,
  alAbrirDialogo,
  alAbrirParte,
}: DetalleContenidoProps) {
  const reparacion = detalle.reparacion
  const cotizacionActiva = detalle.cotizacionActiva
  const editable = puedeEditar && estadoEsEditable(reparacion.estado)
  const transiciones = puedeCambiarEstado
    ? obtenerTransicionesGenericas(reparacion.estado)
    : []
   const puedeCancelar = puedeCambiarEstado && !estadoEsTerminal(reparacion.estado) && reparacion.estado !== 'non_repairable'
  const puedeCotizar = puedeEditar && (reparacion.estado === 'diagnosis' || reparacion.estado === 'quote_pending')
  const puedeRevisar = puedeEditar && reparacion.estado === 'rejected' && cotizacionActiva?.estado === 'rejected'
  const puedeAprobar = puedeAprobarCotizacion && reparacion.estado === 'waiting_customer_approval' && cotizacionActiva?.estado === 'pending'
  const puedeReservar = puedeUsarPartes && ['quote_approved', 'warranty', 'in_repair', 'awaiting_parts'].includes(reparacion.estado)
  const puedeActuarComoTecnico = puedeCambiarEstado && puedeRealizarTecnica
  const puedeRegistrarDiagnostico = puedeActuarComoTecnico && reparacion.estado === 'diagnosis'
  const puedeRegistrarSolucion = puedeActuarComoTecnico
    && !estadoEsTerminal(reparacion.estado)
     && !['testing', 'ready_for_delivery', 'non_repairable'].includes(reparacion.estado)
  const puedeRegistrarPrueba = puedeActuarComoTecnico && reparacion.estado === 'testing'
  const puedeEntregarAhora = puedeEntregar && reparacion.estado === 'ready_for_delivery'
  const pruebasVigentes = detalle.pruebas.filter((prueba) => detalle.cicloPruebasActual > 0 && prueba.ciclo === detalle.cicloPruebasActual)
  const requisitosEntrega = [
    ...(!reparacion.tecnicoAsignadoId ? ['Asignar un técnico responsable.'] : []),
    ...(!pruebasVigentes.some((prueba) => prueba.aprobada) ? ['Registrar una prueba aprobada en el ciclo vigente.'] : []),
    ...(pruebasVigentes.some((prueba) => !prueba.aprobada) ? ['Resolver las pruebas fallidas del ciclo vigente; volver a reparación e iniciar un nuevo ciclo.'] : []),
    ...(detalle.partes.some((parte) => parte.estado === 'reserved' && parte.cantidadConsumida < parte.cantidadSolicitada)
      ? ['Consumir o cancelar los saldos reservados; volver a reparación para resolverlos.'] : []),
  ]
  const guias: Record<EstadoReparacion, string> = {
    received: 'Asigna al responsable e inicia el diagnóstico del equipo.',
    diagnosis: reparacion.diagnosticoRegistrado
      ? 'Revisa el diagnóstico. Prepara una cotización si corresponde o continúa con la reparación.'
      : 'Registra el diagnóstico antes de decidir el trabajo y el presupuesto.',
    quote_pending: 'Prepara y envía la cotización para solicitar la aprobación del cliente.',
    waiting_customer_approval: 'Registra la decisión del cliente sobre la cotización vigente antes de continuar.',
    quote_approved: 'La cotización está aprobada. Continúa con el trabajo técnico y los repuestos necesarios.',
    in_repair: 'Registra el trabajo realizado y resuelve los repuestos reservados antes de preparar la entrega.',
    awaiting_parts: 'Resuelve los repuestos pendientes y vuelve a reparación cuando puedas continuar el trabajo.',
    testing: requisitosEntrega.length ? 'Completa estos requisitos antes de marcar la orden como lista para entrega.' : 'Las pruebas del ciclo vigente están aprobadas. Puedes revisar el cambio a lista para entrega.',
    ready_for_delivery: requisitosEntrega.length ? 'Revisa los requisitos pendientes antes de registrar la entrega.' : 'Registra la entrega del equipo al cliente para cerrar la orden.',
    delivered: 'La orden está entregada. Puedes consultar el trabajo realizado, el presupuesto y el historial.',
    cancelled: 'La orden está cancelada. Su información y trazabilidad se conservan para consulta.',
    rejected: 'El presupuesto fue rechazado. Puedes consultar el motivo o preparar una revisión si corresponde.',
     warranty: 'Revisa la atención en garantía y continúa con el diagnóstico o la reparación según corresponda.',
     non_repairable: 'La conclusión técnica está registrada. Devuelve el equipo sin reparar o reabre su evaluación con motivo.',
     returned_unrepaired: 'Equipo devuelto sin reparar. Una nueva evaluación requiere una nueva recepción; los accesorios pendientes conservan su custodia.',
  }
  let siguienteAccion: { tipo: TipoDialogoActivo; etiqueta: string } | null = null
  if (!estadoEsTerminal(reparacion.estado) && !reparacion.tecnicoAsignadoId && puedeAsignar) {
    siguienteAccion = { tipo: 'asignacion', etiqueta: 'Asignar responsable' }
  } else if (puedeRegistrarDiagnostico && !reparacion.diagnosticoRegistrado) {
    siguienteAccion = { tipo: 'diagnostico', etiqueta: 'Completar diagnóstico' }
  } else if (puedeAprobar) {
    siguienteAccion = { tipo: 'aprobar', etiqueta: 'Registrar aprobación' }
  } else if (puedeRevisar) {
    siguienteAccion = { tipo: 'cotizacion', etiqueta: 'Preparar revisión' }
  } else if (reparacion.estado === 'quote_pending' && puedeCotizar) {
    siguienteAccion = { tipo: 'cotizacion', etiqueta: 'Preparar presupuesto' }
  } else if (puedeRegistrarSolucion && reparacion.estado === 'in_repair' && !reparacion.solucionAplicadaRegistrada) {
    siguienteAccion = { tipo: 'solucion', etiqueta: 'Completar trabajo realizado' }
  } else if (puedeRegistrarPrueba && !pruebasVigentes.length) {
    siguienteAccion = { tipo: 'prueba', etiqueta: 'Completar pruebas' }
  } else if (puedeEntregarAhora && !requisitosEntrega.length) {
    siguienteAccion = { tipo: 'entregar', etiqueta: 'Registrar entrega' }
  } else if (transiciones.length) {
    siguienteAccion = { tipo: 'estado', etiqueta: 'Revisar siguiente estado' }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="border-b px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-xs font-medium tracking-[0.08em] text-primary">{reparacion.codigo}</p>
            <DialogPrimitive.Title className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-balance">{reparacion.productoDescripcionSnapshot}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">{reparacion.clienteNombreSnapshot} · {reparacion.clienteDocumentoSnapshot}</DialogPrimitive.Description>
          </div>
           <span className="status-label" data-tone={tonosEstadoReparacion[reparacion.estado] === 'listo' ? 'listo' : tonosEstadoReparacion[reparacion.estado] === 'pendiente' || tonosEstadoReparacion[reparacion.estado] === 'espera' ? 'pendiente' : 'revision'}>{etiquetasEstadoReparacion[reparacion.estado]}</span>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {puedeCambiarEstado ? <Button type="button" variant="ghost" onClick={alRecuperarEstado}>Recuperar cambio de estado pendiente</Button> : null}
          {editable ? <Button type="button" variant="outline" onClick={alEditar}><Pencil aria-hidden="true" /> Editar</Button> : null}
          {puedeAsignar && !estadoEsTerminal(reparacion.estado) && siguienteAccion?.tipo !== 'asignacion' ? <Button type="button" variant="outline" onClick={() => alAbrirDialogo('asignacion')}><UserRound aria-hidden="true" /> {reparacion.tecnicoAsignadoId ? 'Reasignar técnico' : 'Asignar técnico'}</Button> : null}
          {transiciones.length && siguienteAccion?.tipo !== 'estado' ? <Button type="button" variant="outline" onClick={() => alAbrirDialogo('estado')}><Wrench aria-hidden="true" /> Cambiar estado</Button> : null}
          {puedeCancelar ? <Button type="button" variant="destructive" onClick={() => alAbrirDialogo('cancelar')}><Ban aria-hidden="true" /> Cancelar</Button> : null}
          {puedeEntregarAhora && siguienteAccion?.tipo !== 'entregar' ? <Button type="button" disabled={Boolean(requisitosEntrega.length)} onClick={() => alAbrirDialogo('entregar')}><Send aria-hidden="true" /> Entregar</Button> : null}
          {puedeAprobar ? <>
            {siguienteAccion?.tipo !== 'aprobar' ? <Button type="button" onClick={() => alAbrirDialogo('aprobar')}><CheckCircle2 aria-hidden="true" /> Aprobar cotización</Button> : null}
            <Button type="button" variant="destructive" onClick={() => alAbrirDialogo('rechazar')}><Ban aria-hidden="true" /> Rechazar cotización</Button>
          </> : null}
        </div>
      </header>

      <section aria-labelledby="reparacion-siguiente-paso" className="border-b bg-muted/25 px-5 py-4 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-64">
            <h2 id="reparacion-siguiente-paso" className="font-semibold">{estadoEsTerminal(reparacion.estado) && reparacion.estado !== 'rejected' ? 'Orden cerrada' : 'Siguiente paso'}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{reparacion.servicioExternoPendiente ? 'El equipo está con un proveedor externo. Registra su retorno en Servicio externo y garantía antes de iniciar pruebas o preparar la entrega.' : guias[reparacion.estado]}</p>
          </div>
          {siguienteAccion ? <Button type="button" onClick={() => alAbrirDialogo(siguienteAccion.tipo)}>{siguienteAccion.etiqueta}</Button> : null}
        </div>
        {['testing', 'ready_for_delivery'].includes(reparacion.estado) && requisitosEntrega.length ? <ul aria-label="Requisitos pendientes para entregar" className="mt-3 list-disc space-y-1 ps-5 text-sm leading-6">{requisitosEntrega.map((requisito) => <li key={requisito}>{requisito}</li>)}</ul> : null}
      </section>
      <nav aria-label="Secciones de la reparación" className="flex flex-wrap gap-x-5 gap-y-2 border-b px-5 py-3 text-sm sm:px-7">
        {[
          ['reparacion-seccion-resumen', 'Resumen'],
          ['reparacion-seccion-tecnica', 'Trabajo técnico'],
          ['reparacion-seccion-presupuesto', 'Presupuesto'],
          ['reparacion-seccion-historial', 'Historial'],
        ].map(([id, etiqueta]) => <a key={id} href={`#${id}`} className="rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={(evento) => {
          evento.preventDefault()
          const destino = document.getElementById(id)
          if (destino instanceof HTMLDetailsElement) destino.open = true
          destino?.focus({ preventScroll: true })
          destino?.scrollIntoView?.({ block: 'start' })
        }}>{etiqueta}</a>)}
      </nav>

      <section id="reparacion-seccion-resumen" tabIndex={-1} aria-labelledby="reparacion-resumen" className="border-b px-5 py-6 outline-none sm:px-7">
        <h2 id="reparacion-resumen" className="flex items-center gap-2 font-semibold"><FileText aria-hidden="true" className="size-4 text-primary" /> Resumen de la orden</h2>
        <dl className="mt-4 grid sm:grid-cols-2 sm:gap-x-6">
          <Dato etiqueta={reparacion.tipoSolicitante === 'internal' ? 'Área solicitante' : 'Cliente'} valor={<span>{reparacion.clienteNombreSnapshot}<span className="mt-1 block text-xs text-muted-foreground">{reparacion.clienteDocumentoSnapshot}</span></span>} />
          <Dato etiqueta="Producto" valor={<span>{reparacion.productoDescripcionSnapshot}<span className="mt-1 block font-mono text-xs text-muted-foreground">{reparacion.productoCodigoSnapshot}</span></span>} />
          <Dato etiqueta="Número de serie" valor={mostrar(reparacion.numeroSerie, 'No aplica')} />
          <Dato etiqueta="Prioridad" valor={<span className={reparacion.prioridad === 'urgent' ? 'font-semibold text-destructive' : undefined}>{prioridadLabel(reparacion.prioridad)}</span>} />
          <Dato etiqueta="Recepción" valor={<time dateTime={reparacion.recibidaEn}>{formatoFecha.format(new Date(reparacion.recibidaEn))}</time>} />
          <Dato etiqueta="Entrega estimada" valor={reparacion.fechaEntregaEstimada ? <time dateTime={reparacion.fechaEntregaEstimada}>{formatoFechaDia.format(new Date(`${reparacion.fechaEntregaEstimada}T12:00:00`))}</time> : 'Sin fecha'} />
          <Dato etiqueta="Técnico asignado" valor={reparacion.tecnicoAsignadoId ? abreviarId(reparacion.tecnicoAsignadoId) : 'Pendiente de asignación'} />
          {reparacion.referenciaCliente ? <Dato etiqueta="Referencia del cliente" valor={reparacion.referenciaCliente} /> : null}
        </dl>
        <FechasReparacion reparacion={reparacion} requiereNuevaValidacion={(reparacion.estado === 'in_repair' && detalle.cicloPruebasActual > 0) || (reparacion.estado === 'testing' && detalle.cicloPruebasActual > 1)} />
        <div className="mt-3 border-t pt-4"><p className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Problema reportado</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{reparacion.problema}</p></div>
        {reparacion.notas ? <div className="mt-4 border-t pt-4"><p className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Notas de recepción</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{reparacion.notas}</p></div> : null}
      </section>

      <section id="reparacion-seccion-tecnica" tabIndex={-1} aria-labelledby="reparacion-diagnosticos" className="border-b px-5 py-6 outline-none sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="reparacion-diagnosticos" className="flex items-center gap-2 font-semibold"><Wrench aria-hidden="true" className="size-4 text-primary" /> Diagnóstico</h2><p className="mt-1 text-sm text-muted-foreground">Historial técnico de revisiones</p></div>{puedeRegistrarDiagnostico ? <Button type="button" variant="outline" onClick={() => alAbrirDialogo('diagnostico')}><Plus aria-hidden="true" /> Registrar diagnóstico</Button> : null}</div>
        {detalle.diagnosticos.length ? <div className="mt-5 space-y-3">{detalle.diagnosticos.map((diagnostico) => <article key={diagnostico.id} className="border bg-muted/20 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-medium">{diagnostico.sintomas}</p><time className="text-xs text-muted-foreground" dateTime={diagnostico.diagnosticadoEn}>{formatoFecha.format(new Date(diagnostico.diagnosticadoEn))}</time></div><dl className="mt-3 grid gap-x-5 sm:grid-cols-2"><Dato etiqueta="Causa encontrada" valor={mostrar(diagnostico.causaEncontrada)} /><Dato etiqueta="Solución recomendada" valor={mostrar(diagnostico.solucionRecomendada)} /></dl>{diagnostico.notas ? <p className="mt-2 border-t pt-3 text-sm leading-6 text-muted-foreground">{diagnostico.notas}</p> : null}</article>)}</div> : <p className="mt-5 border border-dashed px-4 py-5 text-sm text-muted-foreground">Todavía no hay diagnósticos registrados.</p>}
      </section>

      <section aria-labelledby="reparacion-solucion" className="border-b px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="reparacion-solucion" className="flex items-center gap-2 font-semibold"><Wrench aria-hidden="true" className="size-4 text-primary" /> Solución aplicada</h2><p className="mt-1 text-sm text-muted-foreground">Trabajo técnico realizado en el equipo</p></div>
          {puedeRegistrarSolucion ? <Button type="button" variant="outline" onClick={() => alAbrirDialogo('solucion')}><Pencil aria-hidden="true" /> {reparacion.solucionAplicada ? 'Modificar solución' : 'Registrar solución'}</Button> : null}
        </div>
        <p className={`mt-5 whitespace-pre-wrap text-sm leading-6 ${reparacion.solucionAplicada ? '' : 'border border-dashed px-4 py-5 text-muted-foreground'}`}>{mostrar(reparacion.solucionAplicada, 'Todavía no hay una solución aplicada registrada.')}</p>
      </section>

      <div id="reparacion-seccion-presupuesto" tabIndex={-1} className="outline-none">
      <CotizacionesDetalle
        key={detalle.cotizacionActiva?.id ?? 'sin-cotizacion'}
        detalle={detalle}
        puedeCotizar={puedeCotizar}
        puedeRevisar={puedeRevisar}
        puedeAprobar={puedeAprobar}
        alAbrirDialogo={alAbrirDialogo}
        cargarLineasCotizacion={cargarLineasCotizacion}
      />
      </div>
      <section aria-labelledby="reparacion-partes" className="border-b px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="reparacion-partes" className="flex items-center gap-2 font-semibold"><Package aria-hidden="true" className="size-4 text-primary" /> Repuestos</h2><p className="mt-1 text-sm text-muted-foreground">Reservas, consumos y ubicación física</p></div>{puedeReservar ? <Button type="button" variant="outline" onClick={() => alAbrirDialogo('reserva')}><Plus aria-hidden="true" /> Reservar repuesto</Button> : null}</div>
        {detalle.partes.length ? <div className="mt-5 space-y-3">{detalle.partes.map((parte) => { const saldo = Math.max(0, parte.cantidadSolicitada - parte.cantidadConsumida); const puedeOperar = puedeUsarPartes && ['quote_approved', 'warranty', 'in_repair', 'awaiting_parts', 'testing'].includes(reparacion.estado); return <article key={parte.id} className="border bg-muted/20 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{parte.productoDescripcionSnapshot}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{parte.productoCodigoSnapshot} · {etiquetasEstadoStockReparacion[parte.estadoStock]}</p></div><span className="status-label" data-tone={parte.estado === 'consumed' ? 'listo' : parte.estado === 'reserved' ? 'pendiente' : 'revision'}>{etiquetasEstadoParte[parte.estado]}</span></div><dl className="mt-4 grid grid-cols-2 gap-x-5 sm:grid-cols-4"><Dato etiqueta="Solicitado" valor={`${parte.cantidadSolicitada} ${unidadProducto(productos, parte.productoId)}`} /><Dato etiqueta="Consumido" valor={`${parte.cantidadConsumida} ${unidadProducto(productos, parte.productoId)}`} /><Dato etiqueta="Saldo" valor={<span className="font-semibold">{saldo}</span>} /><Dato etiqueta="Lote" valor={mostrar(parte.lote, 'Sin lote')} /></dl><p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{nombreAlmacen(almacenes, parte.almacenId)} · {nombreUbicacion(ubicaciones, parte.ubicacionId)}</p>{puedeOperar && parte.estado === 'reserved' ? <div className="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" size="sm" disabled={saldo <= 0} onClick={() => alAbrirParte('consumo', parte)}>Consumir saldo</Button><Button type="button" variant="ghost" size="sm" onClick={() => alAbrirParte('cancelarParte', parte)}>Cancelar reserva</Button></div> : null}{parte.consumos.length ? <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">{parte.consumos.map((consumo) => <li key={consumo.id} className="flex flex-wrap justify-between gap-2"><span>Consumo de {consumo.cantidad} · {formatoFecha.format(new Date(consumo.consumidoEn))}</span><span className="font-mono">{abreviarId(consumo.claveOperacion)}</span></li>)}</ul> : null}</article> })}</div> : <p className="mt-5 border border-dashed px-4 py-5 text-sm text-muted-foreground">No hay repuestos reservados para esta reparación.</p>}
      </section>

      <section aria-labelledby="reparacion-pruebas" className="border-b px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="reparacion-pruebas" className="flex items-center gap-2 font-semibold"><ClipboardCheck aria-hidden="true" className="size-4 text-primary" /> Pruebas</h2><p className="mt-1 text-sm text-muted-foreground">Validaciones antes de la entrega</p></div>{puedeRegistrarPrueba ? <Button type="button" variant="outline" onClick={() => alAbrirDialogo('prueba')}><Plus aria-hidden="true" /> Registrar prueba</Button> : null}</div><ResultadosPruebas pruebas={detalle.pruebas} cicloActual={detalle.cicloPruebasActual} /></section>

       <NoReparableReparacion key={`non-repairable:${reparacion.organizationId}:${reparacion.id}`} detalle={detalle} />
       <AccesoriosReparacion key={`accessories:${reparacion.organizationId}:${reparacion.id}`} reparacion={reparacion} puedeEditar={puedeEditar} puedeDevolver={puedeEntregar} />
      <RecuperarEntregaAccesorios reparacion={reparacion} />
      <AtencionComplementariaReparacion key={`${reparacion.organizationId}:${reparacion.id}`} reparacion={reparacion} puedeEditar={puedeEditar} puedeGarantia={puedeEntregar} />
      <AdjuntosReparacion reparacionId={reparacion.id} puedeAdjuntar={puedeEditar || puedeRealizarTecnica} />
      <details id="reparacion-seccion-historial" tabIndex={-1} className="px-5 py-6 outline-none sm:px-7">
        <summary className="cursor-pointer rounded-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Historial de la orden · {detalle.eventos.length} eventos</summary>
        {reparacion.primeraFinalizacionTecnica ? <p className="mt-4 text-sm">Primera finalización histórica verificable: <time dateTime={reparacion.primeraFinalizacionTecnica.completed_at}>{fechaTecnica(reparacion.primeraFinalizacionTecnica.completed_at)}</time> · ciclo {reparacion.primeraFinalizacionTecnica.test_cycle_number} · evento {reparacion.primeraFinalizacionTecnica.event_id}</p> : <p className="mt-4 text-sm text-muted-foreground">Primera finalización histórica verificable: No registrada</p>}
        {reparacion.finalizacionesTecnicas?.map(c => <p key={`completion-${c.event_id}`} className="mt-2 text-sm">Finalización técnica verificable · ciclo {c.test_cycle_number} · <time dateTime={c.completed_at}>{fechaTecnica(c.completed_at)}</time> · Confirmada por {c.actor_name || c.actor_user_id || 'No registrado'} · Técnico al finalizar: {c.assigned_technician_name || c.assigned_technician_id || 'No registrado'} · evento {c.event_id}</p>)}
      <section aria-labelledby="reparacion-linea-tiempo" className="pt-5">
         <div className="flex items-end justify-between gap-3"><div><h2 id="reparacion-linea-tiempo" className="flex items-center gap-2 font-semibold"><Clock3 aria-hidden="true" className="size-4 text-primary" /> Línea de tiempo</h2><p className="mt-1 text-sm text-muted-foreground">Registro inmutable de la orden</p></div><span className="font-mono text-xs text-muted-foreground">{detalle.eventos.length} EVENTOS</span></div>{detalle.eventos.length ? <ol className="mt-5 space-y-0 ps-2">{detalle.eventos.map((evento) => <li key={evento.id} className="relative border-s ps-5 pb-6 last:pb-0"><span className="absolute -start-1.5 top-1.5 size-3 rounded-full border-2 border-background bg-primary" /><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-medium">{etiquetaEvento(evento.tipo)}</p>{evento.estadoAnterior || evento.estadoNuevo ? <p className="mt-1 font-mono text-[0.68rem] text-muted-foreground uppercase">{evento.estadoAnterior ? etiquetasEstadoReparacion[evento.estadoAnterior as EstadoReparacion] ?? evento.estadoAnterior : 'Inicio'}{evento.estadoNuevo ? ` → ${etiquetasEstadoReparacion[evento.estadoNuevo as EstadoReparacion] ?? evento.estadoNuevo}` : ''}</p> : null}</div><time className="text-xs text-muted-foreground" dateTime={evento.creadoEn}>{formatoFecha.format(new Date(evento.creadoEn))}</time></div>{evento.observacion ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{evento.observacion}</p> : null}<DetalleEventoAccesorio evento={evento} /><DetalleEventoNoReparable evento={evento} eventos={detalle.eventos} /></li>)}</ol> : <p className="mt-5 text-sm text-muted-foreground">La actividad aparecerá aquí al avanzar la orden.</p>}</section>
      </details>
    </div>
  )
}

function prioridadLabel(prioridad: Reparacion['prioridad']) {
  return { low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente' }[prioridad]
}

function unidadProducto(productos: readonly OpcionProductoReparacion[], productoId: string) {
  return productos.find((producto) => producto.id === productoId)?.unidadMedida || 'unid.'
}
