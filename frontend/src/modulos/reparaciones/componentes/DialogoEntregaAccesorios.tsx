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
  const ambito = `${reparacion.organizationId}:${user?.id ?? ''}:${reparacion.id}:accessories:delivery`
  useEffect(() => {
    try { setHayPendiente(Boolean(recuperarComandoAccesorios(ambito))); setError('') }
    catch { setError('No se pudo leer la entrega pendiente. Conserva el almacenamiento de esta pestaña para recuperarla.') }
  }, [ambito, reparacion.lockVersion, abierto])
  return <>
    {hayPendiente && hasPermission(PERMISSIONS.REPAIRS_DELIVER) ? <div className="border-b px-5 py-3 sm:px-7"><Button type="button" variant="outline" onClick={() => setAbierto(true)}>Recuperar entrega pendiente</Button></div> : null}
    {error ? <p role="alert" className="px-5 py-3">{error}</p> : null}
    {abierto ? <DialogoEntregaAccesorios abierto reparacion={reparacion} alCambiarApertura={setAbierto} /> : null}
  </>
}

export function DialogoEntregaAccesorios({ abierto, reparacion, alCambiarApertura }: {
  abierto: boolean; reparacion: Reparacion; alCambiarApertura: (abierto: boolean) => void
}) {
  const { hasPermission } = useAuth()
  const { consulta, recuperar, guardar } = useAccesoriosReparacion(reparacion, abierto, 'delivery')
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
  useEffect(() => {
    if (!abierto) return
    setCantidades({}); setExcepcion(false); setMotivo(''); setConfirmada(false); setMensaje(''); setClave(crypto.randomUUID())
    setRecuperacionFallida(false)
    try {
      const anterior = recuperar()
      setPendiente(anterior)
      if (anterior?.tipo === 'deliver_repair_with_accessories') {
        setCantidades(Object.fromEntries(anterior.datos.returns.map(r => [r.accessory_id,r.quantity])))
        setExcepcion(anterior.datos.authorize_exception); setMotivo(anterior.datos.exception_reason); setConfirmada(true)
      }
    } catch (error) { setRecuperacionFallida(true); setMensaje(error instanceof Error ? error.message : 'No se pudo recuperar la entrega.') }
    // Opening captures the aggregate version provided by the action, never a background rebase.
  }, [abierto, reparacion.id, recuperar])
  const pendientes = accesoriosPendientes(consulta.data)
  const confirmar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    if (guardando || !consulta.data || consulta.error || recuperacionFallida) return
    if (!puedeEntregar || ((excepcion || (pendiente?.tipo === 'deliver_repair_with_accessories' && pendiente.datos.authorize_exception)) && !puedeExcepcion)) {
      setMensaje('No tienes los permisos necesarios para confirmar esta entrega.'); return
    }
    if (!pendiente && excepcion && (!motivo.trim() || !confirmada)) { setMensaje('Indica el motivo de la excepción y confirma expresamente los pendientes.'); return }
    const comando: ComandoAccesorios = pendiente ?? { tipo: 'deliver_repair_with_accessories', expectedLockVersion: reparacion.lockVersion, datos: {
      returns: pendientes.filter(a => (cantidades[a.id] ?? 0) > 0).map(a => ({ accessory_id: a.id, quantity: cantidades[a.id], observation: 'Devuelto al entregar el equipo' })),
      authorize_exception: excepcion, exception_reason: motivo,
    } }
    const validacion = esquemaComandoAccesorios.safeParse(comando)
    if (!validacion.success) { setMensaje('Revisa las cantidades enteras y el motivo de entrega.'); return }
    setGuardando(true); setMensaje('')
    try { await guardar(validacion.data, pendiente?.clave ?? clave); alCambiarApertura(false) }
    catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo confirmar la entrega.')
      try { setPendiente(recuperar()) } catch { setMensaje('No se pudo recuperar la entrega. No se enviará otra intención.') }
    } finally { setGuardando(false) }
  }
  return <Dialog.Root open={abierto} onOpenChange={guardando ? undefined : alCambiarApertura}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/25" />
    <Dialog.Content className="fixed start-1/2 top-1/2 z-50 max-h-[90vh] w-[min(95vw,42rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-background p-6 shadow-xl">
      <Dialog.Title className="text-lg font-semibold">Entregar reparación</Dialog.Title>
      <Dialog.Description className="mt-2 text-sm text-muted-foreground">Se verificarán los gates técnicos vigentes, la custodia externa y los accesorios pendientes.</Dialog.Description>
      {consulta.isLoading ? <p role="status">Consultando accesorios antes de entregar…</p> : consulta.error ? <div role="alert"><p>{consulta.error.message}</p><Button onClick={() => void consulta.refetch()}>Reintentar lectura de entrega</Button></div> : consulta.data ? <form onSubmit={confirmar} className="mt-4 space-y-4">
        {pendiente ? <p role="status">Se recuperó una entrega pendiente de confirmar. El reintento conserva devoluciones, motivo, versión y clave originales.</p> : null}
        {pendientes.length ? <><TablaAccesorios accesorios={pendientes} /><p role="status" className="text-sm">Entrega ordinaria bloqueada mientras queden accesorios pendientes. Registra aquí lo que estás devolviendo o solicita la excepción autorizada.</p></> : <p className="text-sm">No hay accesorios pendientes de devolución.</p>}
        <fieldset disabled={guardando || Boolean(pendiente)} className="space-y-3">
          {pendientes.map(a => <div key={a.id}><label htmlFor={`entrega-devolver-${a.id}`} className="field-label">Devolver ahora · {a.name}</label><input id={`entrega-devolver-${a.id}`} className="field-control" type="number" min={0} max={a.quantity_pending} step={1} value={cantidades[a.id] ?? 0} onChange={e => setCantidades({ ...cantidades,[a.id]:Number(e.target.value) })} /></div>)}
          {pendientes.length ? <Button type="button" variant="outline" onClick={() => setCantidades(Object.fromEntries(pendientes.map(a => [a.id,a.quantity_pending])))}>Devolver todos los pendientes en esta entrega</Button> : null}
          {pendientes.length && puedeExcepcion ? <Button type="button" variant="outline" onClick={() => setExcepcion(true)}>Autorizar entrega con accesorios pendientes</Button> : null}
          {excepcion ? <><p className="text-sm font-medium">La excepción entrega el equipo, pero NO marca los accesorios como devueltos.</p>
            <div><label htmlFor="entrega-excepcion-motivo" className="field-label">Motivo de excepción *</label><textarea id="entrega-excepcion-motivo" className="field-control min-h-24" required maxLength={2000} value={motivo} onChange={e => setMotivo(e.target.value)} /></div>
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmada} onChange={e => setConfirmada(e.target.checked)} />Confirmo la entrega con los accesorios pendientes indicados</label>
            <Button type="button" variant="ghost" onClick={() => { setExcepcion(false); setConfirmada(false); setMotivo('') }}>Volver a entrega ordinaria</Button></> : null}
        </fieldset>
        {mensaje ? <p role="alert" className="text-sm text-destructive">{mensaje}</p> : null}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={guardando} onClick={() => alCambiarApertura(false)}>Cerrar entrega</Button><Button type="submit" disabled={guardando || recuperacionFallida || !puedeEntregar || (excepcion && !puedeExcepcion)}>{guardando ? 'Confirmando…' : pendiente ? 'Reintentar entrega' : excepcion ? 'Confirmar entrega excepcional' : 'Confirmar entrega'}</Button></div>
      </form> : null}
      {mensaje && !consulta.data ? <p role="alert">{mensaje}</p> : null}
      {!consulta.data ? <Button type="button" variant="outline" onClick={() => alCambiarApertura(false)}>Cerrar entrega</Button> : null}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
