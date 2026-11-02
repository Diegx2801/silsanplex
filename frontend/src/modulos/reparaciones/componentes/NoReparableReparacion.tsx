import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog } from 'radix-ui'
import { useAuth } from '@/features/auth/useAuth'
import { PERMISSIONS } from '@/features/auth/permissions'
import { Button } from '@/components/ui/button'
import type { DetalleReparacion } from '../modelo/reparacion'
import { puedeDeclararNoReparable, esquemaComandoNoReparable, type ComandoNoReparable } from '../modelo/noReparable'
import { ejecutarNoReparable, recuperarNoReparable } from '../servicios/noReparableService'
import { DialogoEntregaAccesorios } from './DialogoEntregaAccesorios'

type Editor = { tipo: ComandoNoReparable['tipo']; diagnosis_id: string; reason: string; decision_event_id: string;
  version: number; clave: string; pendiente?: ComandoNoReparable }
const fecha = (v: string) => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(v))

export function NoReparableReparacion({ detalle }: { detalle: DetalleReparacion }) {
  const { user, hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const r = detalle.reparacion
  const [editor, setEditor] = useState<Editor | null>(null)
  const [devolver, setDevolver] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const tecnico = hasPermission(PERMISSIONS.REPAIRS_CHANGE_STATUS) && hasPermission(PERMISSIONS.REPAIRS_PERFORM_TECHNICAL)
  const asignado = tecnico && Boolean(user?.id) && r.tecnicoAsignadoId === user?.id
  const declarar = puedeDeclararNoReparable(r.estado, r.tecnicoAsignadoId, user?.id, tecnico)
  const reservas = detalle.partes.some(p => p.estado === 'reserved' && p.cantidadConsumida < p.cantidadSolicitada)
  const eventoDevolucion = detalle.eventos?.find(e => e.tipo === 'RETURNED_UNREPAIRED')
  const ambito = `${r.organizationId}:${user?.id ?? ''}:${r.id}:non-repairable`
  useEffect(() => { setEditor(null); setDevolver(false); setError('') }, [ambito])
  const recuperar = () => {
    setError('')
    if (!tecnico) { setError('No tienes permiso para recuperar esta operación técnica.'); return }
    try {
      const pendiente = recuperarNoReparable(ambito)
      if (!pendiente) { setError('No hay una decisión pendiente de confirmar en esta pestaña.'); return }
      setEditor({ tipo: pendiente.tipo,
        diagnosis_id: pendiente.tipo === 'declare_repair_non_repairable' ? pendiente.datos.diagnosis_id : '',
        decision_event_id: pendiente.tipo === 'reopen_repair_non_repairable_assessment' ? pendiente.datos.decision_event_id : '',
        reason: pendiente.datos.reason, version: pendiente.expectedLockVersion, clave: pendiente.clave, pendiente })
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo recuperar la operación.') }
  }
  const iniciar = (tipo: ComandoNoReparable['tipo']) => {
    setError('')
    if ((tipo === 'declare_repair_non_repairable' && (!declarar || reservas || !detalle.diagnosticos.length))
      || (tipo === 'reopen_repair_non_repairable_assessment' && (!asignado || r.estado !== 'non_repairable'))) {
      setError('El estado o tus permisos no permiten iniciar esta operación.'); return
    }
    try {
      if (recuperarNoReparable(ambito)) {
        setError('Hay una operación pendiente. Usa Recuperar decisión pendiente antes de iniciar otra intención.'); return
      }
      setEditor({ tipo, diagnosis_id: detalle.diagnosticos[0]?.id ?? '', reason: '',
        decision_event_id: r.decisionNoReparable?.id ?? '', version: r.lockVersion, clave: crypto.randomUUID() })
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo recuperar la operación.') }
  }
  const guardar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    if (!editor || guardando) return
    // A replay is a confirmation of the ORIGINAL command, not a new decision.
    // The server revalidates capabilities and only bypasses current assignment
    // when the exact operation is already committed in its ledger.
    if (editor.pendiente ? !tecnico : !asignado) { setError('Solo el técnico autorizado puede confirmar esta operación.'); return }
    const comando = esquemaComandoNoReparable.safeParse(editor.pendiente ?? {
      tipo: editor.tipo, expectedLockVersion: editor.version, datos: editor.tipo === 'declare_repair_non_repairable'
        ? { diagnosis_id: editor.diagnosis_id, reason: editor.reason } : { decision_event_id: editor.decision_event_id, reason: editor.reason },
    })
    if (!comando.success) { setError('Selecciona un diagnóstico válido e indica el motivo obligatorio.'); return }
    setGuardando(true); setError('')
    try { await ejecutarNoReparable(ambito, r.organizationId, r.id, comando.data, editor.clave); setEditor(null) }
    catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo confirmar la decisión.')
      try { const pendiente = recuperarNoReparable(ambito); if (pendiente) setEditor(actual => actual ? { ...actual, pendiente, clave: pendiente.clave } : null) } catch { setEditor(null) }
    } finally {
      setGuardando(false)
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['repair-detail', r.organizationId, r.id] }),
        queryClient.invalidateQueries({ queryKey: ['repairs', r.organizationId] })])
    }
  }
  return <section aria-label="Decisión técnica No reparable" className="border-b px-5 py-5 sm:px-7">
    <h2 className="font-semibold">Resultado No reparable</h2>
    {r.decisionNoReparable ? <div className="mt-3 space-y-2 text-sm">
      <p className="font-medium">{r.decisionNoReparable.reason}</p>
      <p>Diagnóstico: {r.decisionNoReparable.diagnosis_snapshot.symptoms}</p>
      <p>Técnico responsable: {r.decisionNoReparable.technician_name || r.decisionNoReparable.technician_id}</p>
      <p>Decisión: {fecha(r.decisionNoReparable.decided_at)}</p>
      <p>Usuario que confirmó: {r.decisionNoReparable.confirmed_by}</p>
      <p>{r.devueltaSinRepararEn ? `Devolución física: ${fecha(r.devueltaSinRepararEn)}` : r.servicioExternoPendiente ? 'Equipo con proveedor: no puede devolverse hasta registrar su retorno.' : 'Pendiente de devolución física al solicitante.'}</p>
      {eventoDevolucion ? <p>Devolución registrada por: {String(eventoDevolucion.metadata.actor_name ?? eventoDevolucion.actorId)}</p> : null}
      <p>No inicia garantía de reparación exitosa. Se conservan repuestos consumidos y costos previos.</p>
    </div> : <p className="mt-2 text-sm text-muted-foreground">La imposibilidad técnica debe confirmarse con diagnóstico y motivo; no equivale a rechazar un presupuesto.</p>}
    {reservas && declarar ? <p role="status" className="mt-2 text-sm">Resuelve las reservas pendientes con un usuario autorizado antes de declarar No reparable.</p> : null}
    <div className="mt-3 flex flex-wrap gap-2">
      {declarar ? <Button type="button" variant="outline" disabled={reservas || !detalle.diagnosticos.length} onClick={() => iniciar('declare_repair_non_repairable')}>Declarar No reparable</Button> : null}
      {asignado && r.estado === 'non_repairable' ? <Button type="button" variant="outline" onClick={() => iniciar('reopen_repair_non_repairable_assessment')}>Reabrir evaluación técnica</Button> : null}
      {r.estado === 'non_repairable' && hasPermission(PERMISSIONS.REPAIRS_DELIVER) ? <Button type="button" onClick={() => setDevolver(true)}>Devolver sin reparar</Button> : null}
      {tecnico ? <Button type="button" variant="ghost" onClick={recuperar}>Recuperar decisión pendiente</Button> : null}
    </div>
    {error && !editor ? <p role="alert" className="mt-3 text-sm">{error}</p> : null}
    {devolver ? <DialogoEntregaAccesorios abierto sinReparar reparacion={r} alCambiarApertura={setDevolver} /> : null}
    <Dialog.Root open={Boolean(editor)} onOpenChange={abierto => { if (!abierto && !guardando) { setEditor(null); setError('') } }}><Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/25" />
      <Dialog.Content className="fixed start-1/2 top-1/2 z-50 max-h-[90vh] w-[min(95vw,40rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-background p-6 shadow-xl">
        <Dialog.Title className="text-lg font-semibold">{editor?.tipo === 'reopen_repair_non_repairable_assessment' ? 'Reabrir evaluación técnica' : 'Confirmar No reparable'}</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm">{r.codigo} · {r.productoDescripcionSnapshot}. Esta acción no devuelve físicamente el equipo ni modifica stock.</Dialog.Description>
        {editor ? <form className="mt-4 space-y-4" onSubmit={guardar}>
          {editor.pendiente ? <p role="status">Operación recuperada: se conservarán los datos, la versión y la clave originales.</p> : null}
          <fieldset disabled={guardando || Boolean(editor.pendiente)} className="space-y-4">
            {editor.tipo === 'declare_repair_non_repairable' ? <div><label htmlFor="no-reparable-diagnostico" className="field-label">Diagnóstico técnico *</label>
              <select id="no-reparable-diagnostico" className="field-control" required value={editor.diagnosis_id} onChange={e => setEditor({ ...editor, diagnosis_id: e.target.value })}>
                <option value="">Selecciona un diagnóstico</option>{detalle.diagnosticos.map(d => <option key={d.id} value={d.id}>{d.sintomas} · {d.causaEncontrada}</option>)}
              </select></div> : <p className="text-sm">La conclusión anterior quedará en el historial. La orden volverá a diagnóstico, sin restaurar reservas ni aprobar pruebas.</p>}
            <div><label htmlFor="no-reparable-motivo" className="field-label">{editor.tipo === 'declare_repair_non_repairable' ? 'Motivo técnico *' : 'Motivo de reevaluación *'}</label>
              <textarea id="no-reparable-motivo" className="field-control min-h-24" required maxLength={2000} value={editor.reason} onChange={e => setEditor({ ...editor, reason: e.target.value })} /></div>
          </fieldset>
          {error ? <p role="alert">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={guardando} onClick={() => { setEditor(null); setError('') }}>Cerrar decisión</Button>
            <Button type="submit" disabled={guardando}>{guardando ? 'Confirmando…' : editor.pendiente ? 'Reintentar decisión' : editor.tipo === 'declare_repair_non_repairable' ? 'Confirmar decisión No reparable' : 'Confirmar reevaluación'}</Button></div>
        </form> : null}
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </section>
}
