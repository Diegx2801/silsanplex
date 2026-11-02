import { useEffect, useState } from 'react'
import { Dialog } from 'radix-ui'
import { useAuth } from '@/features/auth/useAuth'
import { PERMISSIONS } from '@/features/auth/permissions'
import { Button } from '@/components/ui/button'
import { useAccesoriosReparacion } from '../estado/useAccesoriosReparacion'
import { accesoriosPendientes, esquemaComandoAccesorios, type ComandoAccesorios } from '../modelo/accesorios'
import type { Reparacion } from '../modelo/reparacion'
import { TablaAccesorios } from './TablaAccesorios'
import { recuperarComandoAccesorios } from '../servicios/accesoriosService'

export function RecuperarEntregaAccesorios({ reparacion }: { reparacion: Reparacion }) {
  const { user, hasPermission } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [hayPendiente, setHayPendiente] = useState(false)
  const [error, setError] = useState('')
  const sinReparar = ['non_repairable', 'returned_unrepaired'].includes(reparacion.estado)
  const ambito = `${reparacion.organizationId}:${user?.id ?? ''}:${reparacion.id}:accessories:${sinReparar ? 'unrepaired-delivery' : 'delivery'}`
  useEffect(() => {
    try { setHayPendiente(Boolean(recuperarComandoAccesorios(ambito))); setError('') }
    catch { setError('No se pudo leer la entrega pendiente. Conserva el almacenamiento de esta pestaña para recuperarla.') }
  }, [ambito, reparacion.lockVersion, abierto])
  return <>
    {hayPendiente && hasPermission(PERMISSIONS.REPAIRS_DELIVER) ? <div className="border-b px-5 py-3 sm:px-7"><Button type="button" variant="outline" onClick={() => setAbierto(true)}>{sinReparar ? 'Recuperar devolución sin reparar pendiente' : 'Recuperar entrega pendiente'}</Button></div> : null}
    {error ? <p role="alert" className="px-5 py-3">{error}</p> : null}
    {abierto ? <DialogoEntregaAccesorios abierto reparacion={reparacion} sinReparar={sinReparar} alCambiarApertura={setAbierto} /> : null}
  </>
}

export function DialogoEntregaAccesorios({ abierto, reparacion, alCambiarApertura, sinReparar = false }: {
  abierto: boolean; reparacion: Reparacion; alCambiarApertura: (abierto: boolean) => void; sinReparar?: boolean
}) {
  const { hasPermission } = useAuth()
  const { consulta, recuperar, guardar } = useAccesoriosReparacion(reparacion, abierto, sinReparar ? 'unrepaired-delivery' : 'delivery')
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [excepcion, setExcepcion] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [confirmada, setConfirmada] = useState(false)
  const [pendiente, setPendiente] = useState<(ComandoAccesorios & { clave: string }) | null>(null)
  const [clave, setClave] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [recuperacionFallida, setRecuperacionFallida] = useState(false)
  const puedeEntregar = hasPermission(PERMISSIONS.REPAIRS_DELIVER)
  const puedeExcepcion = puedeEntregar && hasPermission(PERMISSIONS.REPAIRS_AUTHORIZE_ACCESSORY_EXCEPTION)
  const accion = sinReparar ? 'devolución sin reparar' : 'entrega'
  useEffect(() => {
    if (!abierto) return
    setCantidades({}); setExcepcion(false); setMotivo(''); setConfirmada(false); setMensaje(''); setClave(crypto.randomUUID())
    setRecuperacionFallida(false)
    try {
      const anterior = recuperar()
      setPendiente(anterior)
      if (anterior?.tipo === 'deliver_repair_with_accessories' || anterior?.tipo === 'return_unrepaired_repair') {
        setCantidades(Object.fromEntries(anterior.datos.returns.map(r => [r.accessory_id,r.quantity])))
        setExcepcion(anterior.datos.authorize_exception); setMotivo(anterior.datos.exception_reason); setConfirmada(true)
      }
    } catch (error) { setRecuperacionFallida(true); setMensaje(error instanceof Error ? error.message : `No se pudo recuperar la ${accion}.`) }
    // Opening captures the aggregate version provided by the action, never a background rebase.
   }, [abierto, reparacion.id, recuperar, accion])
  const pendientes = accesoriosPendientes(consulta.data)
  const confirmar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    if (guardando || !consulta.data || consulta.error || recuperacionFallida) return
    if (!puedeEntregar || ((excepcion || ((pendiente?.tipo === 'deliver_repair_with_accessories' || pendiente?.tipo === 'return_unrepaired_repair') && pendiente.datos.authorize_exception)) && !puedeExcepcion)) {
      setMensaje(`No tienes los permisos necesarios para confirmar esta ${accion}.`); return
    }
    if (!pendiente && excepcion && (!motivo.trim() || !confirmada)) { setMensaje('Indica el motivo de la excepción y confirma expresamente los pendientes.'); return }
    const datosDevolucion = {
      returns: pendientes.filter(a => (cantidades[a.id] ?? 0) > 0).map(a => ({ accessory_id: a.id, quantity: cantidades[a.id], observation: sinReparar ? 'Devuelto junto al equipo sin reparar' : 'Devuelto al entregar el equipo' })),
      authorize_exception: excepcion, exception_reason: motivo,
    }
    const comando: ComandoAccesorios = pendiente ?? (sinReparar
      ? { tipo: 'return_unrepaired_repair', expectedLockVersion: reparacion.lockVersion,
        datos: { ...datosDevolucion, decision_event_id: reparacion.decisionNoReparable?.id ?? '' } }
      : { tipo: 'deliver_repair_with_accessories', expectedLockVersion: reparacion.lockVersion, datos: datosDevolucion })
    const validacion = esquemaComandoAccesorios.safeParse(comando)
    if (!validacion.success) { setMensaje(`Revisa las cantidades enteras y el motivo de ${accion}.`); return }
    setGuardando(true); setMensaje('')
    try { await guardar(validacion.data, pendiente?.clave ?? clave); alCambiarApertura(false) }
    catch (error) {
      setMensaje(error instanceof Error ? error.message : `No se pudo confirmar la ${accion}.`)
      try { setPendiente(recuperar()) } catch { setMensaje(`No se pudo recuperar la ${accion}. No se enviará otra intención.`) }
    } finally { setGuardando(false) }
  }
  return <Dialog.Root open={abierto} onOpenChange={guardando ? undefined : alCambiarApertura}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/25" />
    <Dialog.Content className="fixed start-1/2 top-1/2 z-50 max-h-[90vh] w-[min(95vw,42rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-background p-6 shadow-xl">
       <Dialog.Title className="text-lg font-semibold">{sinReparar ? 'Devolver sin reparar' : 'Entregar reparación'}</Dialog.Title>
       <Dialog.Description className="mt-2 text-sm text-muted-foreground">{sinReparar ? 'Confirma la devolución física sin reparación exitosa. Se conservan la decisión técnica y los costos; no inicia garantía de reparación. Se comprobarán proveedor, reservas y accesorios.' : 'Se verificarán los gates técnicos vigentes, la custodia externa y los accesorios pendientes.'}</Dialog.Description>
       {consulta.isLoading ? <p role="status">{sinReparar ? 'Consultando accesorios antes de devolver sin reparar…' : 'Consultando accesorios antes de entregar…'}</p> : consulta.error ? <div role="alert"><p>{consulta.error.message}</p><Button onClick={() => void consulta.refetch()}>Reintentar lectura de {accion}</Button></div> : consulta.data ? <form onSubmit={confirmar} className="mt-4 space-y-4">
         {pendiente ? <p role="status">Se recuperó una {accion} pendiente de confirmar. El reintento conserva devoluciones, motivo, versión y clave originales.</p> : null}
         {pendientes.length ? <><TablaAccesorios accesorios={pendientes} /><p role="status" className="text-sm">{sinReparar ? 'Devolución sin reparar bloqueada' : 'Entrega ordinaria bloqueada'} mientras queden accesorios pendientes. Registra aquí lo que estás devolviendo o solicita la excepción autorizada.</p></> : <p className="text-sm">No hay accesorios pendientes de devolución.</p>}
        <fieldset disabled={guardando || Boolean(pendiente)} className="space-y-3">
          {pendientes.map(a => <div key={a.id}><label htmlFor={`entrega-devolver-${a.id}`} className="field-label">Devolver ahora · {a.name}</label><input id={`entrega-devolver-${a.id}`} className="field-control" type="number" min={0} max={a.quantity_pending} step={1} value={cantidades[a.id] ?? 0} onChange={e => setCantidades({ ...cantidades,[a.id]:Number(e.target.value) })} /></div>)}
           {pendientes.length ? <Button type="button" variant="outline" onClick={() => setCantidades(Object.fromEntries(pendientes.map(a => [a.id,a.quantity_pending])))}>{sinReparar ? 'Devolver todos los accesorios junto al equipo sin reparar' : 'Devolver todos los pendientes en esta entrega'}</Button> : null}
           {pendientes.length && puedeExcepcion ? <Button type="button" variant="outline" onClick={() => setExcepcion(true)}>{sinReparar ? 'Autorizar devolución sin reparar con accesorios pendientes' : 'Autorizar entrega con accesorios pendientes'}</Button> : null}
           {excepcion ? <><p className="text-sm font-medium">{sinReparar ? 'La excepción devuelve el equipo sin reparar' : 'La excepción entrega el equipo'}, pero NO marca los accesorios como devueltos.</p>
            <div><label htmlFor="entrega-excepcion-motivo" className="field-label">Motivo de excepción *</label><textarea id="entrega-excepcion-motivo" className="field-control min-h-24" required maxLength={2000} value={motivo} onChange={e => setMotivo(e.target.value)} /></div>
             <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmada} onChange={e => setConfirmada(e.target.checked)} />{sinReparar ? 'Confirmo la devolución sin reparar con los accesorios pendientes indicados' : 'Confirmo la entrega con los accesorios pendientes indicados'}</label>
             <Button type="button" variant="ghost" onClick={() => { setExcepcion(false); setConfirmada(false); setMotivo('') }}>{sinReparar ? 'Volver a devolución sin reparar sin excepción' : 'Volver a entrega ordinaria'}</Button></> : null}
        </fieldset>
        {mensaje ? <p role="alert" className="text-sm text-destructive">{mensaje}</p> : null}
          <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={guardando} onClick={() => alCambiarApertura(false)}>Cerrar {accion}</Button><Button type="submit" disabled={guardando || recuperacionFallida || !puedeEntregar || (excepcion && !puedeExcepcion)}>{guardando ? 'Confirmando…' : pendiente ? (sinReparar ? 'Reintentar devolución sin reparar' : 'Reintentar entrega') : sinReparar ? (excepcion ? 'Confirmar devolución excepcional sin reparar' : 'Confirmar devolución sin reparar') : excepcion ? 'Confirmar entrega excepcional' : 'Confirmar entrega'}</Button></div>
      </form> : null}
      {mensaje && !consulta.data ? <p role="alert">{mensaje}</p> : null}
       {!consulta.data ? <Button type="button" variant="outline" onClick={() => alCambiarApertura(false)}>Cerrar {accion}</Button> : null}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
