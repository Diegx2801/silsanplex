import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/useAuth'
import { PERMISSIONS } from '@/features/auth/permissions'
import { Button } from '@/components/ui/button'
import type { Reparacion } from '../modelo/reparacion'
import { basesCosto, componentesCosto, etiquetasBaseCosto, etiquetasComponenteCosto, etiquetasEstadoCosto,
  importeCostoExacto, motivosCosto, esquemaImporteCosto, type ComandoCostoReal, type ItemCostoReal } from '../modelo/costoReal'
import { ejecutarCostoReal, obtenerDetalleCosto, recuperarCostoPendiente } from '../servicios/costoRealService'

type Editor = { comando: ComandoCostoReal; clave: string; pendiente: boolean }
const fecha = (v: string) => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(v))

export function CostoRealReparacion({ reparacion }: { reparacion: Reparacion }) {
  const [abierto, setAbierto] = useState(false)
  return <details className="border-b px-5 py-5 sm:px-7" open={abierto} onToggle={e => setAbierto(e.currentTarget.open)}>
    <summary className="cursor-pointer rounded-sm font-semibold">Costo real de reparación</summary>
    <p className="mt-2 text-sm text-muted-foreground">Costos incurridos y evidencia económica, separados de cotización, facturación y pagos.</p>
    {abierto ? <PanelCostoReal key={`${reparacion.organizationId}:${reparacion.id}`} reparacion={reparacion} /> : null}
  </details>
}

export function PanelCostoReal({ reparacion: r }: { reparacion: Reparacion }) {
  const { user, hasPermission } = useAuth()
  const client = useQueryClient()
  const gestionar = hasPermission(PERMISSIONS.REPAIRS_MANAGE_ACTUAL_COST)
  const confirmar = hasPermission(PERMISSIONS.REPAIRS_CONFIRM_ACTUAL_COST)
  const [offset, setOffset] = useState(0)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [aceptado, setAceptado] = useState(false)
  const ambito = `${r.organizationId}:${user?.id ?? ''}:${r.id}:actual-cost`
  const consulta = useQuery({ queryKey: ['repair-actual-cost', r.organizationId, r.id, r.lockVersion, offset],
    queryFn: () => obtenerDetalleCosto(r.organizationId, r.id, offset) })
  const coherente = consulta.data?.summary.lock_version === r.lockVersion
  const puede = (tipo: ComandoCostoReal['tipo']) => tipo === 'confirm_repair_actual_cost_review' ? confirmar : gestionar
  const invalidar = async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ['repair-actual-cost', r.organizationId, r.id] }),
      client.invalidateQueries({ queryKey: ['repair-cost-page', r.organizationId] }),
      client.invalidateQueries({ queryKey: ['repair-detail', r.organizationId, r.id] }), client.invalidateQueries({ queryKey: ['repairs', r.organizationId] })])
  }
  useEffect(() => {
    if (consulta.data && !coherente) {
      void client.invalidateQueries({ queryKey: ['repair-detail', r.organizationId, r.id] })
      void client.invalidateQueries({ queryKey: ['repairs', r.organizationId] })
    }
  }, [consulta.data, coherente, client, r.organizationId, r.id])
  const iniciar = (tipo: ComandoCostoReal['tipo'], datos: Record<string, unknown>) => {
    setMensaje(''); setAceptado(false)
    if (!puede(tipo) || !coherente || !consulta.data) { setMensaje('Revisa permisos y actualiza la orden antes de iniciar una operación económica.'); return }
    try {
      if (recuperarCostoPendiente(ambito)) { setMensaje('Hay una intención económica pendiente. Recupérala antes de iniciar otra.'); return }
      setEditor({ comando: { tipo, datos: { ...datos, evidence_reference: '', reason: '' }, expectedLockVersion: consulta.data.summary.lock_version }, clave: crypto.randomUUID(), pendiente: false })
    } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo leer el almacenamiento.') }
  }
  const recuperar = () => {
    setMensaje(''); setAceptado(false)
    try {
      const pendiente = recuperarCostoPendiente(ambito)
      if (!pendiente) { setMensaje('No hay una operación económica pendiente de confirmar en esta pestaña.'); return }
      if (!puede(pendiente.tipo)) { setMensaje('No tienes permiso para recuperar esa operación económica.'); return }
      const { clave, ...comando } = pendiente
      setEditor({ comando, clave, pendiente: true })
    } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudo recuperar la intención.') }
  }
  const cambiar = (key: string, value: unknown) => setEditor(actual => actual ? { ...actual, comando: { ...actual.comando, datos: { ...actual.comando.datos, [key]: value } } } : null)
  const texto = (key: string) => String(editor?.comando.datos[key] ?? '')
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault(); setMensaje('')
    if (!editor || guardando) return
    if (!puede(editor.comando.tipo)) { setMensaje('Ya no tienes el permiso económico requerido.'); return }
    if (!editor.pendiente && (!coherente || editor.comando.expectedLockVersion !== consulta.data?.summary.lock_version)) {
      setMensaje('La orden cambió. Cierra y revisa los datos actualizados.'); return
    }
    if (['record_repair_actual_cost', 'revise_repair_actual_cost', 'revise_repair_external_cost'].includes(editor.comando.tipo)
      && !editor.comando.datos.void && !esquemaImporteCosto.safeParse(editor.comando.datos.amount).success) {
      setMensaje('Indica un importe no negativo con hasta dos decimales.'); return
    }
    if (editor.comando.tipo === 'confirm_repair_actual_cost_review' && !aceptado) { setMensaje('Confirma que revisaste el alcance y sus evidencias.'); return }
    setGuardando(true)
    try {
      await ejecutarCostoReal(ambito, r.organizationId, r.id, editor.comando, editor.clave)
      setEditor(null); setMensaje('Operación económica registrada. No genera pagos ni altera el trabajo técnico.')
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo confirmar la operación.')
      try { const pendiente = recuperarCostoPendiente(ambito); if (pendiente) {
        const { clave, ...comando } = pendiente; setEditor({ comando, clave, pendiente: true })
      } } catch { setEditor(null) }
    } finally { await invalidar(); setGuardando(false) }
  }
  const manual = (category: 'labor' | 'other') => iniciar('record_repair_actual_cost', { category, description: '', amount: '', currency: 'PEN', cost_basis: 'not_applicable', incurred_on: '' })
  const revisarLinea = (item: ItemCostoReal) => iniciar('revise_repair_actual_cost', { entry_id: item.revision_id,
    description: item.title, amount: item.amount, currency: item.currency, cost_basis: item.cost_basis, incurred_on: item.details.incurred_on, void: false })
  const verificar = (item: ItemCostoReal) => iniciar('verify_repair_cost_source', { source_kind: item.source_kind, source_id: item.source_id,
    currency: item.currency ?? 'PEN', cost_basis: item.cost_basis ?? 'tax_exclusive' })
  const revisionExterna = (item: ItemCostoReal) => iniciar('revise_repair_external_cost', { source_id: item.source_id,
    amount: item.amount, currency: item.currency ?? 'PEN', cost_basis: item.cost_basis ?? 'tax_exclusive' })
  const abrirRevision = () => {
    if (!consulta.data) return
    const scope = Object.fromEntries(componentesCosto.map(c => [c, consulta.data.summary.components.some(s => s.component === c) ? 'complete' : 'not_applicable']))
    iniciar('confirm_repair_actual_cost_review', { source_fingerprint: consulta.data.summary.source_fingerprint, scope, empty_currency: 'PEN' })
  }
  const tipo = editor?.comando.tipo
  const esLinea = tipo === 'record_repair_actual_cost' || tipo === 'revise_repair_actual_cost'
  const esConfirmacion = tipo === 'confirm_repair_actual_cost_review'
  return <section aria-label="Consulta de costo real" className="mt-4 space-y-4 text-sm">
    {consulta.isLoading ? <p role="status">Consultando fuentes económicas…</p> : consulta.error ? <div role="alert">{consulta.error.message}<Button onClick={() => void consulta.refetch()}>Reintentar costo</Button></div>
      : consulta.data && coherente ? <>
        <h3 className="font-semibold">{etiquetasEstadoCosto[consulta.data.summary.state]}</h3>
        <p>Confirmado significa revisión de fuentes a fecha de corte; no pago, factura ni cierre contable.</p>
        {consulta.data.summary.total ? <p className="font-semibold">Total confirmado: {importeCostoExacto(consulta.data.summary.total.amount)} {consulta.data.summary.total.currency} · {etiquetasBaseCosto[consulta.data.summary.total.cost_basis]}</p>
          : <p>No existe un total único confirmado.</p>}
        {consulta.data.summary.subtotals.map(s => <p key={`${s.currency}:${s.cost_basis}`}>Subtotal verificable: {importeCostoExacto(s.amount)} {s.currency} · {etiquetasBaseCosto[s.cost_basis]}</p>)}
        {consulta.data.summary.warnings.includes('multiple_currencies_no_conversion') ? <p>Hay PEN y USD: se muestran por separado, sin conversión automática.</p> : null}
        <ul aria-label="Pendientes económicos" className="list-disc space-y-1 ps-5">{consulta.data.summary.pending.map((p,i) => <li key={`${p.source_id}:${i}`}>{motivosCosto[p.reason] ?? p.reason}</li>)}</ul>
        {consulta.data.summary.latest_review ? <p>Última revisión: {fecha(consulta.data.summary.latest_review.cutoff_at)} · {consulta.data.summary.latest_review.reviewed_by_name} · {consulta.data.summary.latest_review.is_current ? 'Fuentes vigentes' : 'Histórica; requiere nueva revisión'}</p> : null}
        <div className="flex flex-wrap gap-2">{gestionar ? <><Button variant="outline" onClick={() => manual('labor')}>Registrar mano de obra real</Button><Button variant="outline" onClick={() => manual('other')}>Registrar otro gasto</Button></> : null}
          {confirmar ? <Button variant="outline" onClick={abrirRevision}>Revisar y confirmar costo</Button> : null}</div>
        <p className="text-muted-foreground">La valoración histórica no se modifica. Inventario solo se acredita si el origen documentado es homogéneo; una etiqueta de moneda no basta.</p>
        <div className="space-y-3">{consulta.data.items.map(item => <article className="border p-3" key={`${item.source_kind}:${item.source_id}`}>
          <h4 className="font-medium">{etiquetasComponenteCosto[item.source_kind] ?? item.source_kind} · {item.title}</h4>
          <p>Importe efectivo registrado: {importeCostoExacto(item.amount)} {item.currency ?? '· moneda no acreditada'}</p>
          {item.source_kind === 'external' ? <p>Declarado originalmente al retorno: {importeCostoExacto(item.original_amount)} {String(item.details.original_currency ?? '')}. No prueba un pago.</p> : null}
          {item.source_kind === 'consumption' ? <p>Cantidad: {String(item.details.quantity)} · costo unitario histórico: {importeCostoExacto(String(item.details.unit_cost))} · movimiento {String(item.details.inventory_movement_id)}</p> : null}
          <p>{item.is_verified ? `Fuente acreditada · ${item.cost_basis ? etiquetasBaseCosto[item.cost_basis] : ''}` : motivosCosto[item.pending_reason ?? ''] ?? 'Evidencia pendiente'}</p>
          {item.details.evidence_reference ? <p>Respaldo: {String(item.details.evidence_reference)}</p> : null}
          {gestionar ? <div className="mt-2 flex flex-wrap gap-2">{['labor', 'other'].includes(item.source_kind) ? <Button variant="outline" onClick={() => revisarLinea(item)}>Revisar línea económica</Button> : null}
            {['consumption', 'external'].includes(item.source_kind) ? <Button variant="outline" onClick={() => verificar(item)}>Verificar fuente económica</Button> : null}
            {item.source_kind === 'external' ? <Button variant="outline" onClick={() => revisionExterna(item)}>Revisar costo externo</Button> : null}</div> : null}
        </article>)}</div>
        {!consulta.data.total_items ? <p>No hay costos estructurados registrados. Esto no confirma un costo cero.</p> : null}
        <h4 className="font-semibold">Historial económico · {consulta.data.total_history} registros</h4>
        {consulta.data.history.map(h => <article className="border p-3" key={h.id}>
          <p>{h.kind === 'confirmation' ? 'Revisión de alcance' : h.kind === 'source_review' ? 'Verificación / revisión de fuente' : 'Línea / revisión económica'} · {fecha(h.recorded_at)} · {h.actor_name}</p>
          {h.previous_amount !== undefined && h.previous_amount !== null ? <p>Importe anterior: {importeCostoExacto(h.previous_amount)} {h.previous_currency ?? '· moneda no acreditada'}</p> : null}
          {h.amount !== undefined && h.amount !== null ? <p>Importe de esta revisión: {importeCostoExacto(h.amount)} {h.currency} · {h.is_effective ? 'Valor efectivo vigente' : 'Registro histórico'}</p> : null}
          {h.kind !== 'confirmation' ? <p>Base anterior: {h.previous_cost_basis ? etiquetasBaseCosto[h.previous_cost_basis] : 'No acreditada / sin registro anterior'} · Base de esta revisión: {h.cost_basis ? etiquetasBaseCosto[h.cost_basis] : 'No acreditada'}</p> : null}
          {h.kind === 'confirmation' ? <>
            <p className="font-medium">{h.is_current === true ? 'Confirmación económica vigente' : h.is_current === false ? 'Confirmación histórica; no vigente' : 'Vigencia no informada'}</p>
            <ul aria-label="Alcance de esta confirmación" className="list-disc ps-5">{componentesCosto.map(c => <li key={c}>{etiquetasComponenteCosto[c]}: {h.scope?.[c] === 'complete' ? 'Fuentes completas' : h.scope?.[c] === 'not_applicable' ? 'No aplicable' : 'Sin declaración estructurada'}</li>)}</ul>
          </> : null}
          <p>{h.description} · Motivo: {h.reason} · Respaldo: {h.evidence_reference}</p>
          {h.supersedes_id ? <p>Reemplaza registro {h.supersedes_id}</p> : null}
          {h.is_void === true ? <p>Línea anulada explícitamente; original conservado.</p> : null}
        </article>)}
        <div className="flex gap-2"><Button variant="outline" disabled={!offset} onClick={() => setOffset(n => Math.max(0,n-25))}>Página económica anterior</Button>
          <Button variant="outline" disabled={offset+25>=Math.max(consulta.data.total_items,consulta.data.total_history)} onClick={() => setOffset(n => n+25)}>Página económica siguiente</Button></div>
      </> : <p role="status">La orden cambió; actualizando el costo y su versión…</p>}
    {gestionar || confirmar ? <Button variant="ghost" onClick={recuperar}>Recuperar operación económica pendiente</Button> : <p>Solo consulta. Las capacidades económicas se asignan explícitamente; no se heredan de ADMIN, VENTAS o técnico.</p>}
    {editor ? <form aria-label="Operación económica" className="space-y-3 border-t pt-4" onSubmit={guardar}>
      <h4 className="font-semibold">{esConfirmacion ? 'Revisión del alcance económico' : esLinea ? 'Costo de trabajo o gasto real' : 'Evidencia de fuente económica'}</h4>
      {editor.pendiente ? <p role="status">Intención recuperada: se conservan datos, versión y clave originales.</p> : null}
      <fieldset disabled={guardando || editor.pendiente} className="grid gap-3 sm:grid-cols-2">
        {esLinea ? <><label className="sm:col-span-2">Concepto real *<input className="field-control" required minLength={3} maxLength={500} value={texto('description')} onChange={e => cambiar('description',e.target.value)} /></label>
          <label>Fecha de incurrencia declarada *<input type="date" className="field-control" required value={texto('incurred_on')} onChange={e => cambiar('incurred_on',e.target.value)} /></label></> : null}
        {esLinea || tipo === 'revise_repair_external_cost' ? <label>Importe real *<input className="field-control" type="text" inputMode="decimal" required value={texto('amount')} onChange={e => cambiar('amount',e.target.value)} /><span className="field-help">Hasta dos decimales. Un cero debe justificarse; no se deducen horas ni salarios.</span></label> : null}
        {!esConfirmacion ? <><label>Moneda documentada *<select aria-label="Moneda documentada *" className="field-control" value={texto('currency')} onChange={e => cambiar('currency',e.target.value)}><option value="PEN">PEN</option><option value="USD">USD</option></select></label>
          <label>Tratamiento económico *<select aria-label="Tratamiento económico *" className="field-control" value={texto('cost_basis')} onChange={e => cambiar('cost_basis',e.target.value)}>{basesCosto.map(b => <option key={b} value={b}>{etiquetasBaseCosto[b]}</option>)}</select></label></> : null}
        {tipo === 'revise_repair_actual_cost' ? <label><input type="checkbox" checked={Boolean(editor.comando.datos.void)} onChange={e => cambiar('void',e.target.checked)} /> Anular esta línea sin borrar historia</label> : null}
        {esConfirmacion ? <>{componentesCosto.map(c => <label key={c}>{etiquetasComponenteCosto[c]}<select className="field-control" value={String((editor.comando.datos.scope as Record<string,string>)[c])}
          onChange={e => cambiar('scope',{ ...(editor.comando.datos.scope as object), [c]: e.target.value })}><option value="complete">Fuentes completas</option><option value="not_applicable">No aplicable, justificado en revisión</option></select></label>)}
          <label>Moneda si el alcance justifica costo cero<select className="field-control" value={texto('empty_currency')} onChange={e => cambiar('empty_currency',e.target.value)}><option value="PEN">PEN</option><option value="USD">USD</option></select></label></> : null}
        <label className="sm:col-span-2">Evidencia o referencia de respaldo *<textarea className="field-control" required minLength={3} maxLength={2000} value={texto('evidence_reference')} onChange={e => cambiar('evidence_reference',e.target.value)} /></label>
        <label className="sm:col-span-2">Motivo / justificación *<textarea className="field-control" required minLength={3} maxLength={2000} value={texto('reason')} onChange={e => cambiar('reason',e.target.value)} /></label>
      </fieldset>
      {esConfirmacion ? <label className="block"><input type="checkbox" checked={aceptado} onChange={e => setAceptado(e.target.checked)} /> Revisé fuentes, monedas, bases y categorías no aplicables a esta fecha de corte.</label> : null}
      <div className="flex gap-2"><Button type="submit" disabled={guardando}>{guardando ? 'Confirmando…' : editor.pendiente ? 'Reintentar operación económica' : esConfirmacion ? 'Confirmar revisión económica' : 'Guardar costo o evidencia'}</Button>
        <Button type="button" variant="outline" disabled={guardando} onClick={() => setEditor(null)}>Cerrar operación económica</Button></div>
    </form> : null}
    {mensaje ? <p role="alert">{mensaje}</p> : null}
  </section>
}
