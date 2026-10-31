import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/useAuth'
import { Button } from '@/components/ui/button'
import type { Reparacion } from '../modelo/reparacion'
import { buscarProveedoresServicio, ejecutarAtencionComplementaria, listarAtencionComplementaria,
  recuperarAtencionPendiente, type TipoComandoComplementario } from '../servicios/atencionComplementariaService'

type Editor = { tipo: TipoComandoComplementario; datos: Record<string, unknown>; version: number; clave: string; recuperado: boolean }
const fecha = (valor: string | null) => valor ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Lima' }).format(new Date(valor)) : 'Pendiente de entrega'

export function AtencionComplementariaReparacion({ reparacion, puedeEditar, puedeGarantia }: {
  reparacion: Reparacion; puedeEditar: boolean; puedeGarantia: boolean
}) {
  const { access, user } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const queryClient = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)
  const ambito = `${organizationId}:${user?.id}:${reparacion.id}:complementary`
  useEffect(() => { setEditor(null); setBusqueda(''); setMensaje(''); setAbierto(false) }, [ambito])
  const tienePermiso = (tipo: TipoComandoComplementario) => tipo === 'configure_repair_service_warranty' ? puedeGarantia : puedeEditar
  const consulta = useQuery({ queryKey: ['repair-complementary', organizationId, reparacion.id, reparacion.lockVersion],
    queryFn: () => listarAtencionComplementaria(organizationId, reparacion.id), enabled: abierto && Boolean(organizationId) })
  const proveedores = useQuery({ queryKey: ['repair-service-suppliers', organizationId, busqueda],
    queryFn: () => buscarProveedoresServicio(organizationId, busqueda),
    enabled: editor?.tipo === 'send_repair_external_service' && !editor.recuperado && Boolean(organizationId) })
  const iniciar = (tipo: TipoComandoComplementario, datos: Record<string, unknown>) => {
    try {
      const pendiente = recuperarAtencionPendiente(ambito)
      if (!tienePermiso(pendiente?.tipo ?? tipo)) { setMensaje('No tienes permiso para confirmar la operación pendiente. Solicita la revisión del responsable.'); return }
      setEditor(pendiente ? { tipo: pendiente.tipo, datos: pendiente.datos, version: pendiente.expectedLockVersion, clave: pendiente.clave, recuperado: true }
        : { tipo, datos, version: reparacion.lockVersion, clave: crypto.randomUUID(), recuperado: false })
      setMensaje('')
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se pudo recuperar la operación.') }
  }
  const cambiar = (campo: string, valor: string) => setEditor((actual) => actual ? { ...actual, datos: { ...actual.datos, [campo]: valor } } : null)
  const guardar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    if (!editor || guardando) return
    if (!tienePermiso(editor.tipo)) { setMensaje('Ya no tienes permiso para registrar esta operación.'); return }
    setGuardando(true); setMensaje('')
    try {
      await ejecutarAtencionComplementaria(ambito, organizationId, reparacion.id, editor.tipo, editor.datos, editor.version, editor.clave)
      setEditor(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['repair-complementary', organizationId, reparacion.id] }),
        queryClient.invalidateQueries({ queryKey: ['repair-detail', organizationId, reparacion.id] }),
        queryClient.invalidateQueries({ queryKey: ['repairs', organizationId] }),
      ])
      setMensaje('Operación registrada.')
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo guardar la operación.')
      try { const pendiente = recuperarAtencionPendiente(ambito); if (pendiente) setEditor({ tipo: pendiente.tipo, datos: pendiente.datos, version: pendiente.expectedLockVersion, clave: pendiente.clave, recuperado: true }) } catch { setEditor(null) }
      void queryClient.invalidateQueries({ queryKey: ['repair-detail', organizationId, reparacion.id] })
    } finally { setGuardando(false) }
  }
  const enProveedor = consulta.data?.servicios.find((servicio) => !servicio.returned_at)
  const garantia = consulta.data?.garantia
  const puedeEnviar = puedeEditar && ['diagnosis', 'quote_approved', 'in_repair'].includes(reparacion.estado)
  const puedeConfigurarGarantia = puedeGarantia && ['ready_for_delivery', 'delivered'].includes(reparacion.estado)
    && (!garantia || reparacion.estado !== 'delivered')
  return <details className="border-b px-5 py-5 sm:px-7" open={abierto} onToggle={(evento) => setAbierto(evento.currentTarget.open)}>
    <summary className="cursor-pointer rounded-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Servicio externo y garantía</summary>
    <p className="mt-2 text-sm text-muted-foreground">Úsalo solo si el equipo sale a un proveedor o si se ofrece garantía por el trabajo realizado.</p>
    {consulta.isLoading ? <p role="status" className="mt-4 text-sm">Consultando atención…</p> : consulta.error ? <div role="alert" className="mt-4 text-sm"><p>{consulta.error.message}</p><Button type="button" variant="outline" onClick={() => void consulta.refetch()}>Reintentar consulta</Button></div> : consulta.data ? <>
      <section aria-label="Servicio externo" className="mt-5 border-t pt-4">
        <h3 className="font-medium">Custodia con proveedor</h3>
        {enProveedor ? <p role="status" className="mt-2 text-sm">Equipo enviado a {enProveedor.supplier_name_snapshot}. Registra el retorno antes de preparar la entrega.</p> : <p className="mt-2 text-sm text-muted-foreground">No hay equipos pendientes de retorno.</p>}
        {puedeEnviar && !enProveedor && !editor ? <Button type="button" variant="outline" className="mt-3" onClick={() => iniciar('send_repair_external_service', { supplier_id: '', description: '', expected_return_date: '' })}>Enviar a proveedor</Button> : null}
        {puedeEditar && enProveedor && !editor ? <Button type="button" variant="outline" className="mt-3" onClick={() => iniciar('receive_repair_external_service', { external_service_id: enProveedor.id, cost_amount: '', currency: 'PEN' })}>Registrar retorno</Button> : null}
        <ul className="mt-3 divide-y">{consulta.data.servicios.map((servicio) => <li key={servicio.id} className="py-3 text-sm"><p className="font-medium">{servicio.supplier_name_snapshot} · {servicio.returned_at ? 'Retornado' : 'Con el proveedor'}</p><p className="mt-1">{servicio.description}</p><p className="mt-1 text-muted-foreground">Enviado: {fecha(servicio.sent_at)}{servicio.expected_return_date ? ` · Retorno previsto: ${fecha(`${servicio.expected_return_date}T12:00:00-05:00`)}` : ''}{servicio.returned_at ? ` · Retornó: ${fecha(servicio.returned_at)}` : ''}</p>{servicio.cost_amount !== null ? <p className="mt-1">Costo declarado al retorno: {new Intl.NumberFormat('es-PE', { style: 'currency', currency: servicio.currency }).format(servicio.cost_amount)} · Las revisiones económicas se consultan en Costo real de reparación.</p> : null}</li>)}</ul>
      </section>
      <section aria-label="Garantía del servicio" className="mt-4 border-t pt-4">
        <h3 className="font-medium">Garantía del trabajo realizado</h3>
         {['non_repairable', 'returned_unrepaired'].includes(reparacion.estado) ? <p className="mt-2 text-sm">La devolución sin reparar no inicia garantía de reparación exitosa.{garantia ? ` Promesa previa conservada: ${garantia.warranty_days} días · ${garantia.coverage}. No iniciada por este resultado.` : ''}</p>
           : garantia ? <><p className="mt-2 text-sm">{garantia.warranty_days} días desde la entrega · {garantia.coverage}</p><p className="mt-1 text-sm text-muted-foreground">Inicio: {fecha(garantia.starts_at)} · Fin: {fecha(garantia.ends_at)}</p></> : <p className="mt-2 text-sm text-muted-foreground">No se ha otorgado una garantía de servicio.</p>}
        {puedeConfigurarGarantia && !editor ? <Button type="button" variant="outline" className="mt-3" onClick={() => iniciar('configure_repair_service_warranty', { warranty_days: String(garantia?.warranty_days ?? ''), coverage: garantia?.coverage ?? '' })}>{garantia ? 'Editar garantía antes de entregar' : 'Configurar garantía'}</Button> : null}
      </section>
    </> : null}
    {editor ? <form className="mt-5 space-y-4 border-t pt-4" onSubmit={guardar}>
      <h3 className="font-medium">{editor.tipo === 'send_repair_external_service' ? 'Enviar equipo a proveedor' : editor.tipo === 'receive_repair_external_service' ? 'Confirmar retorno del equipo' : 'Definir cobertura de garantía'}</h3>
      {editor.recuperado ? <p role="status" className="text-sm">Hay una operación pendiente de confirmar. Reintenta con los mismos datos para evitar duplicados.</p> : null}
      <fieldset disabled={guardando || editor.recuperado} className="grid gap-4 sm:grid-cols-2">
        {editor.tipo === 'send_repair_external_service' ? <>
          <div className="sm:col-span-2"><label htmlFor="servicio-busqueda" className="field-label">Buscar proveedor</label><input id="servicio-busqueda" type="search" className="field-control" value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} /></div>
          <div className="sm:col-span-2"><label htmlFor="servicio-proveedor" className="field-label">Proveedor *</label><select id="servicio-proveedor" className="field-control" required value={String(editor.datos.supplier_id)} onChange={(evento) => cambiar('supplier_id', evento.target.value)}><option value="">Selecciona un proveedor activo</option>{proveedores.data?.elementos.map((item) => <option key={item.id} value={item.id}>{item.business_name} · {item.document_number}</option>)}</select><p className="field-help">{proveedores.isLoading ? 'Buscando proveedores…' : proveedores.error ? proveedores.error.message : proveedores.data && proveedores.data.total > 25 ? 'Hay más resultados; escribe parte del nombre para acotar la búsqueda.' : 'Selecciona el proveedor que recibirá físicamente el equipo.'}</p></div>
          <div className="sm:col-span-2"><label htmlFor="servicio-descripcion" className="field-label">Trabajo solicitado *</label><textarea id="servicio-descripcion" className="field-control min-h-20 py-2" required minLength={3} maxLength={2000} value={String(editor.datos.description)} onChange={(evento) => cambiar('description', evento.target.value)} /></div>
          <div><label htmlFor="servicio-retorno-previsto" className="field-label">Retorno previsto (si se acordó)</label><input id="servicio-retorno-previsto" type="date" className="field-control" value={String(editor.datos.expected_return_date)} onChange={(evento) => cambiar('expected_return_date', evento.target.value)} /></div>
        </> : editor.tipo === 'receive_repair_external_service' ? <>
          <div><label htmlFor="servicio-costo" className="field-label">Costo total del servicio *</label><input id="servicio-costo" type="number" className="field-control" required min="0" step="0.01" value={String(editor.datos.cost_amount)} onChange={(evento) => cambiar('cost_amount', evento.target.value)} /><p className="field-help">Registra 0 si no tuvo costo. No genera una compra ni un pago.</p></div>
          <div><label htmlFor="servicio-moneda" className="field-label">Moneda *</label><select id="servicio-moneda" className="field-control" value={String(editor.datos.currency)} onChange={(evento) => cambiar('currency', evento.target.value)}><option value="PEN">Soles (PEN)</option><option value="USD">Dólares (USD)</option></select></div>
        </> : <>
          <div><label htmlFor="garantia-dias" className="field-label">Días de garantía *</label><input id="garantia-dias" className="field-control" type="number" min="1" max="3650" step="1" required value={String(editor.datos.warranty_days)} onChange={(evento) => cambiar('warranty_days', evento.target.value)} /><p className="field-help">Empieza en la fecha real de entrega del equipo.</p></div>
          <div><label htmlFor="garantia-cobertura" className="field-label">Cobertura *</label><textarea id="garantia-cobertura" className="field-control min-h-20 py-2" required minLength={3} maxLength={2000} value={String(editor.datos.coverage)} onChange={(evento) => cambiar('coverage', evento.target.value)} /></div>
        </>}
      </fieldset>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : editor.recuperado ? 'Reintentar operación' : 'Confirmar registro'}</Button><Button type="button" variant="outline" disabled={guardando} onClick={() => setEditor(null)}>Cerrar</Button></div>
    </form> : null}
    {mensaje ? <p role="status" className="mt-4 text-sm">{mensaje}</p> : null}
  </details>
}
