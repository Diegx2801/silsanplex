import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/useAuth'
import { PERMISSIONS } from '@/features/auth/permissions'
import { Button } from '@/components/ui/button'
import type { Reparacion } from '../modelo/reparacion'
import { componentesCosto, etiquetasBaseCosto, etiquetasComponenteCosto,
  importeCostoExacto, motivosCosto, esquemaImporteCosto, type ComandoCostoReal, type ItemCostoReal } from '../modelo/costoReal'
import { ejecutarCostoReal, obtenerDetalleCosto, recuperarCostoPendiente } from '../servicios/costoRealService'

type Editor = { comando: ComandoCostoReal; clave: string; pendiente: boolean }
const fecha = (v: string) => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(v))

export function CostoRealReparacion({ reparacion }: { reparacion: Reparacion }) {
  const [abierto, setAbierto] = useState(false)
  return <details className="border-b px-5 py-5 sm:px-7" open={abierto} onToggle={e => setAbierto(e.currentTarget.open)}>
    <summary className="cursor-pointer rounded-sm font-semibold">Costo real de reparación</summary>
    <p className="mt-2 text-sm text-muted-foreground">Lo que le cuesta a SILSAN reparar el equipo; no es el precio cotizado al cliente.</p>
    {abierto ? <PanelCostoReal key={`${reparacion.organizationId}:${reparacion.id}`} reparacion={reparacion} /> : null}
  </details>
}

export function PanelCostoReal({ reparacion: r }: { reparacion: Reparacion }) {
  const { user, hasPermission } = useAuth()
  const client = useQueryClient()
  const gestionar = hasPermission(PERMISSIONS.REPAIRS_MANAGE_ACTUAL_COST)
  const confirmar = hasPermission(PERMISSIONS.REPAIRS_CONFIRM_ACTUAL_COST)
  const [offset, setOffset] = useState(0)
  const [desgloseAbierto, setDesgloseAbierto] = useState(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [aceptado, setAceptado] = useState(false)
  const [estadoRecuperacion, setEstadoRecuperacion] = useState<'ninguno' | 'pendiente' | 'error'>('ninguno')
  const ambito = `${r.organizationId}:${user?.id ?? ''}:${r.id}:actual-cost`
  const consulta = useQuery({ queryKey: ['repair-actual-cost', r.organizationId, r.id, r.lockVersion, offset],
    queryFn: () => obtenerDetalleCosto(r.organizationId, r.id, offset) })
  const coherente = consulta.data?.summary.lock_version === r.lockVersion
  const puede = (tipo: ComandoCostoReal['tipo']) => tipo === 'confirm_repair_actual_cost_review' ? confirmar : gestionar
  useEffect(() => {
    if (!gestionar && !confirmar) { setEstadoRecuperacion('ninguno'); return }
    try { setEstadoRecuperacion(recuperarCostoPendiente(ambito) ? 'pendiente' : 'ninguno') }
    catch { setEstadoRecuperacion('error') }
  }, [ambito, confirmar, gestionar, r.lockVersion])
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
      const motivoPredeterminado = tipo === 'record_repair_actual_cost' ? 'Registro de costo real de reparación.'
        : tipo === 'confirm_repair_actual_cost_review' ? 'Revisión de costos y respaldos registrados.'
          : tipo === 'revise_repair_actual_cost' || tipo === 'revise_repair_external_cost' ? 'Corrección del costo registrado.'
            : 'Revisión del origen del costo.'
      setEditor({ comando: { tipo, datos: { evidence_reference: '', reason: motivoPredeterminado, ...datos }, expectedLockVersion: consulta.data.summary.lock_version }, clave: crypto.randomUUID(), pendiente: false })
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
  const manual = () => iniciar('record_repair_actual_cost', { category: 'labor', description: '', amount: '', currency: 'PEN', cost_basis: 'not_applicable', incurred_on: '' })
  const revisarLinea = (item: ItemCostoReal) => iniciar('revise_repair_actual_cost', { entry_id: item.revision_id,
    description: item.title, amount: item.amount, currency: item.currency, cost_basis: item.cost_basis, incurred_on: item.details.incurred_on, void: false })
  const verificar = (item: ItemCostoReal) => iniciar('verify_repair_cost_source', { source_kind: item.source_kind, source_id: item.source_id,
    currency: item.currency ?? 'PEN', cost_basis: item.cost_basis ?? 'tax_exclusive' })
  const revisionExterna = (item: ItemCostoReal) => iniciar('revise_repair_external_cost', { source_id: item.source_id,
    amount: item.amount, currency: item.currency ?? 'PEN', cost_basis: item.cost_basis ?? 'tax_exclusive' })
  const abrirRevision = () => {
    if (!consulta.data) return
    const scope = Object.fromEntries(componentesCosto.map(c => [c, consulta.data.summary.components.some(s => s.component === c) ? 'complete' : 'not_applicable']))
    iniciar('confirm_repair_actual_cost_review', {
      source_fingerprint: consulta.data.summary.source_fingerprint,
      scope,
      empty_currency: 'PEN',
    })
  }
  const tipo = editor?.comando.tipo
  const esLinea = tipo === 'record_repair_actual_cost' || tipo === 'revise_repair_actual_cost'
  const esConfirmacion = tipo === 'confirm_repair_actual_cost_review'
  const resumen = consulta.data?.summary
  const costoSinRegistros = resumen?.item_count === 0 && !resumen.total
  const estadoVisible = !resumen || costoSinRegistros ? 'Sin costos registrados'
    : resumen.state === 'confirmed' ? 'Costo revisado'
      : resumen.state === 'partial' ? 'Costo parcial' : 'Pendiente de revisión'
  const formatoImporte = (amount: string, currency: 'PEN' | 'USD') =>
    `${currency === 'PEN' ? 'S/' : 'US$'} ${importeCostoExacto(amount)}`
  return <section aria-label="Consulta de costo real" className="mt-4 space-y-4 text-sm">
    {consulta.isLoading ? <p role="status">Consultando fuentes económicas…</p> : consulta.error ? <div role="alert">{consulta.error.message}<Button onClick={() => void consulta.refetch()}>Reintentar costo</Button></div>
      : consulta.data && coherente && resumen ? <>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold">{estadoVisible}</h3>
            <p className="mt-1 text-muted-foreground">{costoSinRegistros
              ? 'Aún no hay costos registrados. Agrega mano de obra u otros gastos si corresponden.'
              : resumen.state === 'confirmed' ? 'El costo se revisó con los registros disponibles.'
                : 'Hay importes registrados, pero todavía no se puede confirmar un total final.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {gestionar ? <Button type="button" onClick={manual}>Registrar costo</Button> : null}
            {confirmar && resumen.can_confirm && resumen.item_count > 0 && resumen.state !== 'confirmed'
              ? <Button type="button" variant="outline" onClick={abrirRevision}>Revisar costo</Button> : null}
          </div>
        </div>
        {resumen.total ? <p className="text-base font-semibold">Costo total: {formatoImporte(resumen.total.amount, resumen.total.currency)}
          {resumen.total.cost_basis !== 'not_applicable' ? <span className="ms-2 text-sm font-normal text-muted-foreground">· {etiquetasBaseCosto[resumen.total.cost_basis]}</span> : null}</p>
          : resumen.subtotals.length > 0 ? <div>
            <h4 className="font-medium">Importes registrados</h4>
            <ul className="mt-1 space-y-1">
              {resumen.subtotals.map(s => <li key={`${s.currency}:${s.cost_basis}`}>
                {formatoImporte(s.amount, s.currency)}{s.cost_basis !== 'not_applicable' ? ` · ${etiquetasBaseCosto[s.cost_basis].toLowerCase()}` : ''}
              </li>)}
            </ul>
            {resumen.warnings.includes('multiple_currencies_no_conversion') ? <p className="mt-1 text-muted-foreground">Las monedas se mantienen separadas.</p> : null}
            {resumen.warnings.includes('incompatible_tax_bases') ? <p className="mt-1 text-muted-foreground">Importes con diferente tratamiento de impuestos no se suman.</p> : null}
          </div> : null}
        {!gestionar && !confirmar ? <p className="text-muted-foreground">Vista de consulta. Solicita al administrador acceso para registrar costos.</p> : null}
        {resumen.item_count > 0 && resumen.pending.length > 0 ? <details className="rounded-md border px-3 py-2">
          <summary className="cursor-pointer font-medium">¿Qué falta revisar? ({resumen.pending.length})</summary>
          <ul className="mt-2 list-disc space-y-1 ps-5">{resumen.pending.map((p,i) => <li key={`${p.source_id}:${i}`}>{motivosCosto[p.reason] ?? p.reason}</li>)}</ul>
        </details> : null}
        {consulta.data.items.length > 0 ? <details className="rounded-md border px-3 py-2" open={desgloseAbierto} onToggle={e => setDesgloseAbierto(e.currentTarget.open)}>
          <summary className="cursor-pointer font-medium">Ver desglose ({consulta.data.total_items})</summary>
          <div className="mt-3 space-y-3">{consulta.data.items.map(item => <article className="border-t pt-3" key={`${item.source_kind}:${item.source_id}`}>
            <h4 className="font-medium">{etiquetasComponenteCosto[item.source_kind] ?? item.source_kind} · {item.title}</h4>
            <p>{item.amount !== null && item.currency ? `Importe: ${formatoImporte(item.amount, item.currency)}` : 'Importe pendiente de revisión'}</p>
            {item.source_kind === 'external' && item.original_amount ? <p className="text-muted-foreground">Costo declarado al retorno: {item.details.original_currency === 'USD' || item.details.original_currency === 'PEN'
              ? formatoImporte(item.original_amount, item.details.original_currency) : `${importeCostoExacto(item.original_amount)} · moneda no acreditada`}.</p> : null}
            {item.source_kind === 'consumption' ? <p className="text-muted-foreground">Cantidad: {String(item.details.quantity)} · costo unitario histórico: {importeCostoExacto(String(item.details.unit_cost))}</p> : null}
            <p className="text-muted-foreground">{item.is_verified ? 'Origen revisado' : motivosCosto[item.pending_reason ?? ''] ?? 'Pendiente de revisión'}</p>
            {item.details.evidence_reference ? <p className="text-muted-foreground">Respaldo: {String(item.details.evidence_reference)}</p> : null}
            {gestionar ? <div className="mt-2 flex flex-wrap gap-2">{['labor', 'other'].includes(item.source_kind) ? <Button variant="outline" onClick={() => revisarLinea(item)}>Corregir costo</Button> : null}
              {['consumption', 'external'].includes(item.source_kind) ? <Button variant="outline" onClick={() => verificar(item)}>Revisar origen</Button> : null}
              {item.source_kind === 'external' ? <Button variant="outline" onClick={() => revisionExterna(item)}>Corregir costo externo</Button> : null}</div> : null}
          </article>)}</div>
        </details> : null}
        {consulta.data.history.length > 0 ? <details className="rounded-md border px-3 py-2">
          <summary className="cursor-pointer font-medium">Historial ({consulta.data.total_history})</summary>
          <div className="mt-3 space-y-3">{consulta.data.history.map(h => <article className="border-t pt-3" key={h.id}>
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
          </article>)}</div>
        </details> : null}
        {Math.max(consulta.data.total_items, consulta.data.total_history) > 25 ? <div className="flex gap-2">
          <Button variant="outline" disabled={!offset} onClick={() => setOffset(n => Math.max(0,n-25))}>Anterior</Button>
          <Button variant="outline" disabled={offset+25>=Math.max(consulta.data.total_items,consulta.data.total_history)} onClick={() => setOffset(n => n+25)}>Siguiente</Button>
        </div> : null}
      </> : <p role="status">La orden cambió; actualizando el costo y su versión…</p>}
    {gestionar || confirmar ? estadoRecuperacion !== 'ninguno' ? <Button variant="outline" onClick={recuperar}>{estadoRecuperacion === 'pendiente' ? 'Reintentar operación pendiente' : 'Revisar operación pendiente'}</Button> : null : null}
    {editor ? <form aria-label="Operación económica" className="space-y-3 border-t pt-4" onSubmit={guardar}>
      <h4 className="font-semibold">{esConfirmacion ? 'Confirmar costo revisado' : esLinea ? 'Registrar costo real' : 'Revisar costo registrado'}</h4>
      {editor.pendiente ? <p role="status">Intención recuperada: se conservan datos, versión y clave originales.</p> : null}
      <fieldset disabled={guardando || editor.pendiente} className="grid gap-3 sm:grid-cols-2">
        {tipo === 'record_repair_actual_cost' ? <label>Tipo de costo<select className="field-control" value={texto('category')} onChange={e => cambiar('category',e.target.value)}>
          <option value="labor">Mano de obra</option><option value="other">Otro gasto</option>
        </select></label> : null}
        {esLinea ? <><label className="sm:col-span-2">Concepto *<input className="field-control" required minLength={3} maxLength={500} value={texto('description')} onChange={e => cambiar('description',e.target.value)} /></label>
          <label>Fecha del costo *<input type="date" className="field-control" required value={texto('incurred_on')} onChange={e => cambiar('incurred_on',e.target.value)} /></label></> : null}
        {esLinea || tipo === 'revise_repair_external_cost' ? <label>Monto *<input className="field-control" type="text" inputMode="decimal" required value={texto('amount')} onChange={e => cambiar('amount',e.target.value)} /><span className="field-help">Hasta dos decimales.</span></label> : null}
        {!esConfirmacion ? <><label>Moneda *<select aria-label="Moneda *" className="field-control" value={texto('currency')} onChange={e => cambiar('currency',e.target.value)}><option value="PEN">Soles (PEN)</option><option value="USD">Dólares (USD)</option></select></label>
          <label>¿El importe incluye impuestos? *<select aria-label="¿El importe incluye impuestos? *" className="field-control" value={texto('cost_basis')} onChange={e => cambiar('cost_basis',e.target.value)}>
            <option value="tax_inclusive">Sí, los incluye</option><option value="tax_exclusive">No, antes de impuestos</option><option value="not_applicable">No aplica</option>
          </select></label></> : null}
        {tipo === 'revise_repair_actual_cost' ? <label><input type="checkbox" checked={Boolean(editor.comando.datos.void)} onChange={e => cambiar('void',e.target.checked)} /> Anular esta línea sin borrar historia</label> : null}
        <label className="sm:col-span-2">{esConfirmacion ? 'Referencia de revisión *' : 'Documento o referencia de respaldo *'}<input className="field-control" required minLength={3} maxLength={2000} placeholder={esConfirmacion ? 'Documento o fuente que revisaste' : 'N.º de boleta, factura o referencia'} value={texto('evidence_reference')} onChange={e => cambiar('evidence_reference',e.target.value)} /></label>
      </fieldset>
      <details className="rounded-md border px-3 py-2">
        <summary className="cursor-pointer">Motivo del registro</summary>
        <label className="mt-2 block">Si necesitas precisarlo<input className="field-control" minLength={3} maxLength={2000} value={texto('reason')} onChange={e => cambiar('reason',e.target.value)} /></label>
      </details>
      {esConfirmacion ? <div className="space-y-2 rounded-md border p-3 sm:col-span-2">
        <div>
          <p className="font-medium">Alcance revisado</p>
          <p className="text-muted-foreground">Confirma que los rubros sin registros realmente no aplican.</p>
        </div>
        <ul className="grid gap-1 sm:grid-cols-2">{componentesCosto.map(c => {
          const count = consulta.data?.summary.components.find(s => s.component === c)?.count ?? 0
          return <li key={c}>{etiquetasComponenteCosto[c]}: {count > 0 ? `${count} registro(s)` : 'Sin registros'}</li>
        })}</ul>
        <label className="block"><input type="checkbox" checked={aceptado} onChange={e => setAceptado(e.target.checked)} /> Confirmo que revisé importes y respaldos y que no falta ningún costo aplicable.</label>
      </div> : null}
      <div className="flex gap-2"><Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : editor.pendiente ? 'Reintentar operación pendiente' : esConfirmacion ? 'Confirmar costo' : 'Guardar costo'}</Button>
        <Button type="button" variant="outline" disabled={guardando} onClick={() => setEditor(null)}>Cancelar</Button></div>
    </form> : null}
    {mensaje ? <p role="alert">{mensaje}</p> : null}
  </section>
}
