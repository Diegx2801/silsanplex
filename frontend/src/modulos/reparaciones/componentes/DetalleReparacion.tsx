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
import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import type { Almacen, UbicacionAlmacen } from '@/modulos/inventario/modelo/almacen'
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
  type DetalleReparacion as DatosDetalleReparacion,
  type EstadoReparacion,
  type OpcionProductoReparacion,
  type ParteReparacion,
  type Reparacion,
} from '@/modulos/reparaciones/modelo/reparacion'

const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium',
  timeStyle: 'short',
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
  almacenes: readonly Almacen[]
  ubicaciones: readonly UbicacionAlmacen[]
  puedeEditar: boolean
  puedeAsignar: boolean
  puedeCambiarEstado: boolean
  puedeAprobarCotizacion: boolean
  puedeUsarPartes: boolean
  puedeEntregar: boolean
  alCambiarApertura: (abierto: boolean) => void
  alRestaurarFoco: () => void
  alEditar: () => void
  alAsignar: (tecnicoId: string) => Promise<string | undefined>
  alCambiarEstado: (estado: EstadoReparacion, observacion: string) => Promise<string | undefined>
  alRegistrarDiagnostico: (datos: DatosDiagnostico) => Promise<string | undefined>
  alRegistrarSolucion: (datos: DatosSolucionReparacion) => Promise<string | undefined>
  alGuardarCotizacion: (datos: DatosCotizacion, enviar: boolean) => Promise<string | undefined>
  alRevisarCotizacion: (cotizacionId: string, datos: DatosCotizacion, enviar: boolean) => Promise<string | undefined>
  alAprobarCotizacion: (cotizacionId: string, datos: DatosObservacionReparacion) => Promise<string | undefined>
  alRechazarCotizacion: (cotizacionId: string, datos: DatosObservacionReparacion) => Promise<string | undefined>
  alReservarParte: (datos: DatosReservaParte) => Promise<string | undefined>
  alConsumirParte: (parteId: string, datos: DatosConsumoParte, operationKey: string) => Promise<string | undefined>
  alCancelarParte: (parteId: string, datos: DatosObservacionReparacion) => Promise<string | undefined>
  alRegistrarPrueba: (datos: DatosPrueba) => Promise<string | undefined>
  alEntregar: (datos: DatosObservacionReparacion) => Promise<string | undefined>
  alCancelar: (datos: DatosObservacionReparacion) => Promise<string | undefined>
}

type DialogoActivo =
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
  | null

export function DetalleReparacion({
  abierto,
  detalle,
  cargando,
  error,
  productos,
  almacenes,
  ubicaciones,
  puedeEditar,
  puedeAsignar,
  puedeCambiarEstado,
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
  alEntregar,
  alCancelar,
}: DetalleReparacionProps) {
  const [dialogo, setDialogo] = useState<DialogoActivo>(null)
  const [parteSeleccionada, setParteSeleccionada] = useState<ParteReparacion | null>(null)
  const [mensaje, setMensaje] = useState('')

  const cerrarDialogo = (abiertoDialogo: boolean) => {
    if (!abiertoDialogo) setDialogo(null)
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

  const abrirParte = (siguienteDialogo: 'consumo' | 'cancelarParte', parte: ParteReparacion) => {
    if (siguienteDialogo === 'consumo' && !estadoStockReparacionEsConsumible(parte.estadoStock)) {
      setMensaje('El stock dañado o en cuarentena no puede consumirse en Reparaciones.')
      return
    }
    setParteSeleccionada(parte)
    setDialogo(siguienteDialogo)
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
              productos={productos}
              almacenes={almacenes}
              ubicaciones={ubicaciones}
              puedeEditar={puedeEditar}
              puedeAsignar={puedeAsignar}
              puedeCambiarEstado={puedeCambiarEstado}
              puedeAprobarCotizacion={puedeAprobarCotizacion}
              puedeUsarPartes={puedeUsarPartes && detalle.reparacion.estado !== 'testing'}
              puedeEntregar={puedeEntregar}
              alEditar={alEditar}
              alAbrirDialogo={setDialogo}
              alAbrirParte={abrirParte}
            />
          )}

          {mensaje ? <p role="status" aria-live="polite" className="border-t bg-primary/5 px-5 py-3 text-sm text-primary sm:px-7">{mensaje}</p> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

      {detalle ? (
        <>
          <DialogoCambioEstado
            abierto={dialogo === 'estado'}
            reparacion={detalle.reparacion}
            alCambiarApertura={cerrarDialogo}
            alGuardar={(estado, observacion) => ejecutar(() => alCambiarEstado(estado, observacion), 'Estado actualizado.')}
          />
          <DialogoAsignacion
            key={`asignacion-${detalle.reparacion.tecnicoAsignadoId ?? 'sin-tecnico'}`}
            abierto={dialogo === 'asignacion'}
            reparacion={detalle.reparacion}
            alCambiarApertura={cerrarDialogo}
            alGuardar={(tecnicoId) => ejecutar(() => alAsignar(tecnicoId), 'Técnico asignado.')}
          />
          <DialogoDiagnostico
            abierto={dialogo === 'diagnostico'}
            reparacion={detalle.reparacion}
            alCambiarApertura={cerrarDialogo}
            alGuardar={(datos) => ejecutar(() => alRegistrarDiagnostico(datos), 'Diagnóstico registrado.')}
          />
          <DialogoSolucionReparacion
            abierto={dialogo === 'solucion'}
            reparacion={detalle.reparacion}
            alCambiarApertura={cerrarDialogo}
            alGuardar={(datos) => ejecutar(() => alRegistrarSolucion(datos), 'Solución aplicada guardada.')}
          />
          <DialogoCotizacion
            abierto={dialogo === 'cotizacion'}
            reparacion={detalle.reparacion}
            cotizacion={detalle.cotizacionActiva?.estado === 'draft' || detalle.reparacion.estado === 'rejected' ? detalle.cotizacionActiva : null}
            esRevision={detalle.reparacion.estado === 'rejected'}
            productos={productos}
            alCambiarApertura={cerrarDialogo}
            alGuardar={(datos, enviar) => detalle.reparacion.estado === 'rejected' && detalle.cotizacionActiva
              ? ejecutar(() => alRevisarCotizacion(detalle.cotizacionActiva!.id, datos, enviar), enviar ? 'Revisión enviada a aprobación.' : 'Revisión guardada como borrador.')
              : ejecutar(() => alGuardarCotizacion(datos, enviar), enviar ? 'Cotización enviada a aprobación.' : 'Borrador de cotización guardado.')}
          />
          {detalle.cotizacionActiva ? (
            <>
              <DialogoObservacion
                abierto={dialogo === 'aprobar'}
                titulo="Aprobar cotización"
                descripcion={`La versión ${detalle.cotizacionActiva.version} pasará a aprobada y la orden avanzará.`}
                etiquetaAccion="Aprobar cotización"
                alCambiarApertura={cerrarDialogo}
                alGuardar={(datos) => ejecutar(() => alAprobarCotizacion(detalle.cotizacionActiva!.id, datos), 'Cotización aprobada.')}
              />
              <DialogoObservacion
                abierto={dialogo === 'rechazar'}
                titulo="Rechazar cotización"
                descripcion="La cotización quedará rechazada. Si el cliente solicita cambios, podrás crear una revisión explícita."
                etiquetaAccion="Rechazar cotización"
                variante="destructive"
                observacionObligatoria
                alCambiarApertura={cerrarDialogo}
                alGuardar={(datos) => ejecutar(() => alRechazarCotizacion(detalle.cotizacionActiva!.id, datos), 'Cotización rechazada.')}
              />
            </>
          ) : null}
          <DialogoReservaParte
            abierto={dialogo === 'reserva'}
            reparacion={detalle.reparacion}
            productos={productos}
            almacenes={almacenes}
            ubicaciones={ubicaciones}
            alCambiarApertura={cerrarDialogo}
            alGuardar={(datos) => ejecutar(() => alReservarParte(datos), 'Repuesto reservado.')}
          />
          {parteSeleccionada ? (
            <>
              <DialogoConsumoParte
                abierto={dialogo === 'consumo'}
                parte={parteSeleccionada}
                alCambiarApertura={cerrarDialogo}
                 alGuardar={(datos, operationKey) => ejecutar(() => alConsumirParte(parteSeleccionada!.id, datos, operationKey), 'Consumo registrado.')}
              />
              <DialogoObservacion
                abierto={dialogo === 'cancelarParte'}
                titulo="Cancelar reserva"
                descripcion={`Se liberará el saldo pendiente de ${parteSeleccionada.productoDescripcionSnapshot}.`}
                etiquetaAccion="Cancelar reserva"
                variante="destructive"
                observacionObligatoria
                alCambiarApertura={cerrarDialogo}
                alGuardar={(datos) => ejecutar(() => alCancelarParte(parteSeleccionada!.id, datos), 'Reserva cancelada.')}
              />
            </>
          ) : null}
          <DialogoPrueba
            abierto={dialogo === 'prueba'}
            reparacion={detalle.reparacion}
            alCambiarApertura={cerrarDialogo}
            alGuardar={(datos) => ejecutar(() => alRegistrarPrueba(datos), 'Prueba registrada.')}
          />
          <DialogoObservacion
            abierto={dialogo === 'entregar'}
            titulo="Entregar reparación"
            descripcion="El servidor verificará técnico asignado, pruebas aprobadas y reservas pendientes antes de confirmar."
            etiquetaAccion="Confirmar entrega"
            alCambiarApertura={cerrarDialogo}
            alGuardar={(datos) => ejecutar(() => alEntregar(datos), 'Reparación entregada.')}
          />
          <DialogoObservacion
            abierto={dialogo === 'cancelar'}
            titulo="Cancelar reparación"
            descripcion="La orden pasará a cancelada y las reservas pendientes se liberarán automáticamente."
            etiquetaAccion="Cancelar reparación"
            variante="destructive"
            observacionObligatoria
            alCambiarApertura={cerrarDialogo}
            alGuardar={(datos) => ejecutar(() => alCancelar(datos), 'Reparación cancelada.')}
          />
        </>
      ) : null}
    </DialogPrimitive.Root>
  )
}

interface DetalleContenidoProps {
  detalle: DatosDetalleReparacion
  productos: readonly OpcionProductoReparacion[]
  almacenes: readonly Almacen[]
  ubicaciones: readonly UbicacionAlmacen[]
  puedeEditar: boolean
  puedeAsignar: boolean
  puedeCambiarEstado: boolean
  puedeAprobarCotizacion: boolean
  puedeUsarPartes: boolean
  puedeEntregar: boolean
  alEditar: () => void
  alAbrirDialogo: (dialogo: DialogoActivo) => void
  alAbrirParte: (dialogo: 'consumo' | 'cancelarParte', parte: ParteReparacion) => void
}

function DetalleContenido({
  detalle,
  productos,
  almacenes,
  ubicaciones,
  puedeEditar,
  puedeAsignar,
  puedeCambiarEstado,
  puedeAprobarCotizacion,
  puedeUsarPartes,
  puedeEntregar,
  alEditar,
  alAbrirDialogo,
  alAbrirParte,
}: DetalleContenidoProps) {
  const reparacion = detalle.reparacion
  const cotizacion = detalle.cotizacionActiva
  const editable = puedeEditar && estadoEsEditable(reparacion.estado)
  const transiciones = puedeCambiarEstado
    ? obtenerTransicionesGenericas(reparacion.estado)
    : []
  const puedeCancelar = puedeCambiarEstado && !estadoEsTerminal(reparacion.estado)
  const puedeCotizar = puedeEditar && (reparacion.estado === 'diagnosis' || reparacion.estado === 'quote_pending')
  const puedeRevisar = puedeEditar && reparacion.estado === 'rejected' && cotizacion?.estado === 'rejected'
  const puedeAprobar = puedeAprobarCotizacion && reparacion.estado === 'waiting_customer_approval' && cotizacion?.estado === 'pending'
  const puedeReservar = puedeUsarPartes && ['quote_approved', 'warranty', 'in_repair', 'awaiting_parts'].includes(reparacion.estado)
  const puedeRegistrarDiagnostico = puedeCambiarEstado && reparacion.estado === 'diagnosis'
  const puedeRegistrarSolucion = puedeCambiarEstado
    && !estadoEsTerminal(reparacion.estado)
    && !['testing', 'ready_for_delivery'].includes(reparacion.estado)
  const puedeRegistrarPrueba = puedeCambiarEstado && reparacion.estado === 'testing'
  const puedeEntregarAhora = puedeEntregar && reparacion.estado === 'ready_for_delivery'

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
          {editable ? <Button type="button" variant="outline" onClick={alEditar}><Pencil aria-hidden="true" /> Editar</Button> : null}
          {puedeAsignar && !estadoEsTerminal(reparacion.estado) ? <Button type="button" variant="outline" onClick={() => alAbrirDialogo('asignacion')}><UserRound aria-hidden="true" /> {reparacion.tecnicoAsignadoId ? 'Reasignar técnico' : 'Asignar técnico'}</Button> : null}
          {transiciones.length ? <Button type="button" variant="outline" onClick={() => alAbrirDialogo('estado')}><Wrench aria-hidden="true" /> Cambiar estado</Button> : null}
          {puedeCancelar ? <Button type="button" variant="destructive" onClick={() => alAbrirDialogo('cancelar')}><Ban aria-hidden="true" /> Cancelar</Button> : null}
          {puedeEntregarAhora ? <Button type="button" onClick={() => alAbrirDialogo('entregar')}><Send aria-hidden="true" /> Entregar</Button> : null}
          {puedeAprobar ? <>
            <Button type="button" onClick={() => alAbrirDialogo('aprobar')}><CheckCircle2 aria-hidden="true" /> Aprobar cotización</Button>
            <Button type="button" variant="destructive" onClick={() => alAbrirDialogo('rechazar')}><Ban aria-hidden="true" /> Rechazar cotización</Button>
          </> : null}
        </div>
      </header>

      <section aria-labelledby="reparacion-resumen" className="border-b px-5 py-6 sm:px-7">
        <h2 id="reparacion-resumen" className="flex items-center gap-2 font-semibold"><FileText aria-hidden="true" className="size-4 text-primary" /> Resumen de la orden</h2>
        <dl className="mt-4 grid sm:grid-cols-2 sm:gap-x-6">
          <Dato etiqueta="Cliente" valor={<span>{reparacion.clienteNombreSnapshot}<span className="mt-1 block text-xs text-muted-foreground">{reparacion.clienteDocumentoSnapshot}</span></span>} />
          <Dato etiqueta="Producto" valor={<span>{reparacion.productoDescripcionSnapshot}<span className="mt-1 block font-mono text-xs text-muted-foreground">{reparacion.productoCodigoSnapshot}</span></span>} />
          <Dato etiqueta="Número de serie" valor={mostrar(reparacion.numeroSerie, 'No aplica')} />
          <Dato etiqueta="Prioridad" valor={<span className={reparacion.prioridad === 'urgent' ? 'font-semibold text-destructive' : undefined}>{prioridadLabel(reparacion.prioridad)}</span>} />
          <Dato etiqueta="Recepción" valor={<time dateTime={reparacion.recibidaEn}>{formatoFecha.format(new Date(reparacion.recibidaEn))}</time>} />
          <Dato etiqueta="Entrega estimada" valor={reparacion.fechaEntregaEstimada ? <time dateTime={reparacion.fechaEntregaEstimada}>{formatoFechaDia.format(new Date(`${reparacion.fechaEntregaEstimada}T12:00:00`))}</time> : 'Sin fecha'} />
          <Dato etiqueta="Técnico asignado" valor={reparacion.tecnicoAsignadoId ? abreviarId(reparacion.tecnicoAsignadoId) : 'Pendiente de asignación'} />
          <Dato etiqueta="Referencia del cliente" valor={mostrar(reparacion.referenciaCliente)} />
        </dl>
        <div className="mt-3 border-t pt-4"><p className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Problema reportado</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{reparacion.problema}</p></div>
        {reparacion.notas ? <div className="mt-4 border-t pt-4"><p className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Notas de recepción</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{reparacion.notas}</p></div> : null}
      </section>

      <section aria-labelledby="reparacion-diagnosticos" className="border-b px-5 py-6 sm:px-7">
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

      <section aria-labelledby="reparacion-cotizaciones" className="border-b px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="reparacion-cotizaciones" className="flex items-center gap-2 font-semibold"><ReceiptText aria-hidden="true" className="size-4 text-primary" /> Cotización</h2><p className="mt-1 text-sm text-muted-foreground">{detalle.cotizaciones.length ? `${detalle.cotizaciones.length} versión${detalle.cotizaciones.length === 1 ? '' : 'es'} registrada${detalle.cotizaciones.length === 1 ? '' : 's'}` : 'Aún no hay cotizaciones'}</p></div>{puedeCotizar || puedeRevisar ? <Button type="button" variant="outline" onClick={() => alAbrirDialogo('cotizacion')}><Plus aria-hidden="true" /> {puedeRevisar ? 'Crear revisión' : cotizacion?.estado === 'draft' ? 'Editar borrador' : 'Crear cotización'}</Button> : null}</div>
        {cotizacion ? <article className="mt-5 border bg-muted/20 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">Versión {cotizacion.version}</p><p className="mt-1 text-xs text-muted-foreground">{etiquetasEstadoCotizacion[cotizacion.estado]} · {cotizacion.preciosIncluyenImpuesto ? 'Precios con impuesto incluido' : 'Precios sin impuesto incluido'} · Tasa {cotizacion.tasaImpuesto}%</p></div><span className="status-label" data-tone={cotizacion.estado === 'approved' ? 'listo' : cotizacion.estado === 'pending' ? 'pendiente' : 'revision'}>{etiquetasEstadoCotizacion[cotizacion.estado]}</span></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[34rem] text-left text-sm"><thead className="border-b font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase"><tr><th className="py-2 pe-3">Concepto</th><th className="px-3 py-2 text-end">Cant.</th><th className="px-3 py-2 text-end">Precio</th><th className="ps-3 py-2 text-end">Subtotal</th></tr></thead><tbody className="divide-y">{cotizacion.lineas.map((linea) => <tr key={linea.id}><td className="py-3 pe-3"><span className="font-medium">{linea.descripcion}</span><span className="mt-1 block text-xs text-muted-foreground">{linea.tipo === 'part' ? 'Repuesto' : linea.tipo === 'labor' ? 'Mano de obra' : 'Servicio externo'}{linea.gravable ? ' · Gravable' : ''}</span></td><td className="px-3 py-3 text-end font-mono text-xs tabular-nums">{linea.cantidad}</td><td className="px-3 py-3 text-end font-mono text-xs tabular-nums">{importe(linea.precioUnitario, cotizacion.moneda)}</td><td className="ps-3 py-3 text-end font-mono text-xs tabular-nums">{importe(linea.subtotalLinea, cotizacion.moneda)}</td></tr>)}</tbody></table></div><dl className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 text-sm"><div><dt className="text-xs text-muted-foreground">Subtotal</dt><dd className="mt-1 font-mono font-semibold tabular-nums">{importe(cotizacion.subtotal, cotizacion.moneda)}</dd></div><div><dt className="text-xs text-muted-foreground">Impuesto</dt><dd className="mt-1 font-mono font-semibold tabular-nums">{importe(cotizacion.impuesto, cotizacion.moneda)}</dd></div><div><dt className="text-xs text-muted-foreground">Total</dt><dd className="mt-1 font-mono text-base font-semibold tabular-nums">{importe(cotizacion.total, cotizacion.moneda)}</dd></div></dl>{puedeAprobar ? <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => alAbrirDialogo('rechazar')}>Rechazar</Button><Button type="button" onClick={() => alAbrirDialogo('aprobar')}><CheckCircle2 aria-hidden="true" /> Aprobar</Button></div> : null}</article> : <p className="mt-5 border border-dashed px-4 py-5 text-sm text-muted-foreground">La cotización se crea después de registrar el diagnóstico o cuando el flujo lo permita.</p>}
        {detalle.cotizaciones.length > 1 ? <div className="mt-5 border-t pt-4"><p className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Historial de versiones</p><ul className="mt-3 space-y-2">{detalle.cotizaciones.filter((item) => item.id !== cotizacion?.id).map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>Versión {item.version} · {etiquetasEstadoCotizacion[item.estado]}</span><span className="font-mono text-xs tabular-nums">{importe(item.total, item.moneda)}</span></li>)}</ul></div> : null}
      </section>

      <section aria-labelledby="reparacion-partes" className="border-b px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="reparacion-partes" className="flex items-center gap-2 font-semibold"><Package aria-hidden="true" className="size-4 text-primary" /> Repuestos</h2><p className="mt-1 text-sm text-muted-foreground">Reservas, consumos y ubicación física</p></div>{puedeReservar ? <Button type="button" variant="outline" onClick={() => alAbrirDialogo('reserva')}><Plus aria-hidden="true" /> Reservar repuesto</Button> : null}</div>
        {detalle.partes.length ? <div className="mt-5 space-y-3">{detalle.partes.map((parte) => { const saldo = Math.max(0, parte.cantidadSolicitada - parte.cantidadConsumida); const puedeOperar = puedeUsarPartes && ['quote_approved', 'warranty', 'in_repair', 'awaiting_parts', 'testing'].includes(reparacion.estado); return <article key={parte.id} className="border bg-muted/20 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{parte.productoDescripcionSnapshot}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{parte.productoCodigoSnapshot} · {etiquetasEstadoStockReparacion[parte.estadoStock]}</p></div><span className="status-label" data-tone={parte.estado === 'consumed' ? 'listo' : parte.estado === 'reserved' ? 'pendiente' : 'revision'}>{etiquetasEstadoParte[parte.estado]}</span></div><dl className="mt-4 grid grid-cols-2 gap-x-5 sm:grid-cols-4"><Dato etiqueta="Solicitado" valor={`${parte.cantidadSolicitada} ${unidadProducto(productos, parte.productoId)}`} /><Dato etiqueta="Consumido" valor={`${parte.cantidadConsumida} ${unidadProducto(productos, parte.productoId)}`} /><Dato etiqueta="Saldo" valor={<span className="font-semibold">{saldo}</span>} /><Dato etiqueta="Lote" valor={mostrar(parte.lote, 'Sin lote')} /></dl><p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{nombreAlmacen(almacenes, parte.almacenId)} · {nombreUbicacion(ubicaciones, parte.ubicacionId)}</p>{puedeOperar && parte.estado === 'reserved' ? <div className="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" size="sm" disabled={saldo <= 0} onClick={() => alAbrirParte('consumo', parte)}>Consumir saldo</Button><Button type="button" variant="ghost" size="sm" onClick={() => alAbrirParte('cancelarParte', parte)}>Cancelar reserva</Button></div> : null}{parte.consumos.length ? <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">{parte.consumos.map((consumo) => <li key={consumo.id} className="flex flex-wrap justify-between gap-2"><span>Consumo de {consumo.cantidad} · {formatoFecha.format(new Date(consumo.consumidoEn))}</span><span className="font-mono">{abreviarId(consumo.claveOperacion)}</span></li>)}</ul> : null}</article> })}</div> : <p className="mt-5 border border-dashed px-4 py-5 text-sm text-muted-foreground">No hay repuestos reservados para esta reparación.</p>}
      </section>

      <section aria-labelledby="reparacion-pruebas" className="border-b px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="reparacion-pruebas" className="flex items-center gap-2 font-semibold"><ClipboardCheck aria-hidden="true" className="size-4 text-primary" /> Pruebas</h2><p className="mt-1 text-sm text-muted-foreground">Validaciones antes de la entrega</p></div>{puedeRegistrarPrueba ? <Button type="button" variant="outline" onClick={() => alAbrirDialogo('prueba')}><Plus aria-hidden="true" /> Registrar prueba</Button> : null}</div>{detalle.pruebas.length ? <div className="mt-5 space-y-2">{detalle.pruebas.map((prueba) => <article key={prueba.id} className="flex items-start gap-3 border bg-muted/20 p-4"><span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${prueba.aprobada ? 'bg-accent text-primary' : 'bg-destructive/10 text-destructive'}`}><CheckCircle2 aria-hidden="true" className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{prueba.tipo}</p><span className="text-xs text-muted-foreground">{prueba.aprobada ? 'Aprobada' : 'Fallida'}</span></div><p className="mt-1 text-sm leading-6 text-muted-foreground">{prueba.resultado}</p>{prueba.notas ? <p className="mt-2 text-xs text-muted-foreground">{prueba.notas}</p> : null}</div></article>)}</div> : <p className="mt-5 border border-dashed px-4 py-5 text-sm text-muted-foreground">No hay pruebas registradas.</p>}</section>

      <section aria-labelledby="reparacion-linea-tiempo" className="px-5 py-6 sm:px-7">
        <div className="flex items-end justify-between gap-3"><div><h2 id="reparacion-linea-tiempo" className="flex items-center gap-2 font-semibold"><Clock3 aria-hidden="true" className="size-4 text-primary" /> Línea de tiempo</h2><p className="mt-1 text-sm text-muted-foreground">Registro inmutable de la orden</p></div><span className="font-mono text-xs text-muted-foreground">{detalle.eventos.length} EVENTOS</span></div>{detalle.eventos.length ? <ol className="mt-5 space-y-0 ps-2">{detalle.eventos.map((evento) => <li key={evento.id} className="relative border-s ps-5 pb-6 last:pb-0"><span className="absolute -start-1.5 top-1.5 size-3 rounded-full border-2 border-background bg-primary" /><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-medium">{etiquetaEvento(evento.tipo)}</p>{evento.estadoAnterior || evento.estadoNuevo ? <p className="mt-1 font-mono text-[0.68rem] text-muted-foreground uppercase">{evento.estadoAnterior ? etiquetasEstadoReparacion[evento.estadoAnterior as EstadoReparacion] ?? evento.estadoAnterior : 'Inicio'}{evento.estadoNuevo ? ` → ${etiquetasEstadoReparacion[evento.estadoNuevo as EstadoReparacion] ?? evento.estadoNuevo}` : ''}</p> : null}</div><time className="text-xs text-muted-foreground" dateTime={evento.creadoEn}>{formatoFecha.format(new Date(evento.creadoEn))}</time></div>{evento.observacion ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{evento.observacion}</p> : null}</li>)}</ol> : <p className="mt-5 text-sm text-muted-foreground">La actividad aparecerá aquí al avanzar la orden.</p>}</section>
    </div>
  )
}

function prioridadLabel(prioridad: Reparacion['prioridad']) {
  return { low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente' }[prioridad]
}

function unidadProducto(productos: readonly OpcionProductoReparacion[], productoId: string) {
  return productos.find((producto) => producto.id === productoId)?.unidadMedida || 'unid.'
}
