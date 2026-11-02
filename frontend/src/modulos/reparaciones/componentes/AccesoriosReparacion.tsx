import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAccesoriosReparacion } from '../estado/useAccesoriosReparacion'
import { accesorioInicial, accesoriosPendientes, payloadAccesorio, esquemaComandoAccesorios, fechaAccesorio,
  type AccesorioReparacion, type ComandoAccesorios, type DatosAccesorioRecepcion } from '../modelo/accesorios'
import { estadoEsEditable, type Reparacion } from '../modelo/reparacion'
import { TablaAccesorios } from './TablaAccesorios'

interface Editor {
  tipo: 'recibir' | 'corregir' | 'anular' | 'devolver'
  accesorioId: string; datos: DatosAccesorioRecepcion; cantidad: number; observacion: string; motivo: string
  version: number; clave: string; pendiente?: ComandoAccesorios
}
function restaurar(comando: ComandoAccesorios, clave: string): Editor {
  const base = { accesorioId: '', datos: accesorioInicial(), cantidad: 1, observacion: '', motivo: '', version: comando.expectedLockVersion, clave, pendiente: comando }
  if (comando.tipo === 'record_repair_accessory_return') {
    const fila = comando.datos.returns[0]
    return { ...base, tipo: 'devolver', accesorioId: fila.accessory_id, cantidad: fila.quantity, observacion: fila.observation }
  }
  if (comando.tipo !== 'save_repair_accessories') throw new Error('Recupera la entrega desde su formulario.')
  const fila = comando.datos.accessories[0]
  if (!fila) throw new Error('La operación pendiente no contiene accesorios.')
  if ('void' in fila) return { ...base, tipo: 'anular', accesorioId: fila.id, motivo: fila.reason }
  return { ...base, tipo: fila.id ? 'corregir' : 'recibir', accesorioId: fila.id ?? '', datos: {
    nombre: fila.name, cantidadRecibida: fila.quantity_received, condicion: fila.received_condition ?? '', observaciones: fila.observations ?? '',
  } }
}
export function AccesoriosReparacion({ reparacion, puedeEditar, puedeDevolver }: {
  reparacion: Reparacion; puedeEditar: boolean; puedeDevolver: boolean
}) {
  const { consulta, recuperar, guardar } = useAccesoriosReparacion(reparacion)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)
  const editable = puedeEditar && estadoEsEditable(reparacion.estado)
  const pendientes = accesoriosPendientes(consulta.data)
  const permitido = (tipo: Editor['tipo']) => tipo === 'devolver' ? puedeDevolver : puedeEditar
  const iniciar = (tipo: Editor['tipo'], a?: AccesorioReparacion) => {
    setMensaje('')
    try {
      const pendiente = recuperar()
      const siguiente = pendiente ? restaurar(pendiente, pendiente.clave) : {
        tipo, accesorioId: a?.id ?? '', datos: a ? { nombre: a.name, cantidadRecibida: a.quantity_received, condicion: a.received_condition ?? '', observaciones: a.observations ?? '' } : accesorioInicial(),
        cantidad: a?.quantity_pending ?? 1, observacion: '', motivo: '', version: consulta.data!.lock_version, clave: crypto.randomUUID(),
      }
      if (!permitido(siguiente.tipo)) throw new Error('No tienes permiso para confirmar la operación pendiente.')
      setEditor(siguiente)
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se pudo recuperar la operación.') }
  }
  const recuperarPendiente = () => {
    try {
      const pendiente = recuperar()
      if (!pendiente) { setMensaje('No hay una operación pendiente de confirmar.'); return }
      const siguiente = restaurar(pendiente, pendiente.clave)
      if (!permitido(siguiente.tipo)) throw new Error('No tienes permiso para confirmar la operación pendiente.')
      setEditor(siguiente); setMensaje('')
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se pudo recuperar la operación.') }
  }
  const confirmar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    if (!editor || guardando) return
    setMensaje('')
    if (!permitido(editor.tipo)) { setMensaje('Ya no tienes permiso para esta operación.'); return }
    const comando: ComandoAccesorios = editor.pendiente ?? (editor.tipo === 'devolver'
      ? { tipo: 'record_repair_accessory_return', expectedLockVersion: editor.version,
        datos: { returns: [{ accessory_id: editor.accesorioId, quantity: editor.cantidad, observation: editor.observacion }] } }
      : { tipo: 'save_repair_accessories', expectedLockVersion: editor.version, datos: { accessories: [editor.tipo === 'anular'
        ? { id: editor.accesorioId, void: true, reason: editor.motivo }
        : { ...(editor.accesorioId ? { id: editor.accesorioId } : {}), ...payloadAccesorio(editor.datos) }] } })
    const validacion = esquemaComandoAccesorios.safeParse(comando)
    if (!validacion.success) { setMensaje('Revisa nombre, cantidades enteras positivas y motivo cuando corresponda.'); return }
    setGuardando(true)
    try {
      await guardar(validacion.data, editor.clave)
      setEditor(null); setMensaje('Operación de accesorios registrada.')
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo guardar.')
      try { const pendiente = recuperar(); if (pendiente) setEditor(restaurar(pendiente, pendiente.clave)) } catch { setEditor(null) }
    } finally { setGuardando(false) }
  }
  const seleccionado = consulta.data?.accessories.find(a => a.id === editor?.accesorioId)
  const cambiarDatos = (campo: keyof DatosAccesorioRecepcion, valor: string | number) => setEditor(e => e ? { ...e, datos: { ...e.datos, [campo]: valor } } : null)
  return <section aria-labelledby="reparacion-accesorios" className="border-b px-5 py-6 sm:px-7">
    <h2 id="reparacion-accesorios" className="font-semibold">Accesorios recibidos y devolución</h2>
    {consulta.isLoading ? <p role="status" className="mt-3">Consultando accesorios…</p> : consulta.error ? <div role="alert" className="mt-3">
      <p>{consulta.error.message}</p><Button type="button" variant="outline" onClick={() => void consulta.refetch()}>Reintentar accesorios</Button></div> : consulta.data ? <>
      {!consulta.data.reviewed_at ? <p className="mt-2 text-sm text-muted-foreground">Recepción histórica sin revisión estructurada de accesorios. Conserva las notas originales; no se han inferido pertenencias ni devoluciones.</p>
        : !consulta.data.accessories.length ? <p className="mt-2 text-sm text-muted-foreground">Recepción revisada sin accesorios registrados.</p> : null}
      <TablaAccesorios accesorios={consulta.data.accessories} />
      {pendientes.length ? <p role="status" className="mt-3 text-sm">Hay accesorios pendientes. La entrega ordinaria exige devolverlos; una excepción autorizada conserva los saldos reales.</p> : null}
      {consulta.data.accessories.map(a => <details key={a.id} className="mt-3 border p-3">
        <summary className="cursor-pointer text-sm font-medium">Registro de {a.name}</summary>
        <p className="mt-2 text-sm">Recibido por {a.registered_by_name} · {fechaAccesorio(a.registered_at)}</p>
        {a.voided_at ? <p className="mt-2 text-sm">Anulado: {a.void_reason}</p> : null}
        {a.returns.map(r => <p key={r.id} className="mt-2 text-sm">Devuelto: {r.quantity} · {r.returned_by_name} · {fechaAccesorio(r.returned_at)}{r.observation ? ` · ${r.observation}` : ''}</p>)}
        {!editor && !a.voided_at ? <div className="mt-3 flex flex-wrap gap-2">
          {editable && a.quantity_returned === 0 ? <><Button type="button" variant="outline" onClick={() => iniciar('corregir', a)}>Corregir {a.name}</Button><Button type="button" variant="outline" onClick={() => iniciar('anular', a)}>Anular {a.name}</Button></> : null}
          {puedeDevolver && a.quantity_pending > 0 ? <Button type="button" variant="outline" onClick={() => iniciar('devolver', a)}>Registrar devolución de {a.name}</Button> : null}
        </div> : null}
        {a.quantity_returned > 0 ? <p className="mt-2 text-xs text-muted-foreground">La devolución confirmada bloquea las correcciones ordinarias de recepción.</p> : null}
      </details>)}
      {!editor && editable ? <Button type="button" variant="outline" className="mt-3" onClick={() => iniciar('recibir')}>Registrar accesorio adicional</Button> : null}
    </> : null}
    {!editor && (puedeEditar || puedeDevolver) ? <Button type="button" variant="ghost" className="mt-3" onClick={recuperarPendiente}>Recuperar operación de accesorios pendiente</Button> : null}
    {editor ? <form aria-label="Operación de accesorios" className="mt-5 space-y-4 border p-4" onSubmit={confirmar}>
      <h3 className="font-medium">{editor.tipo === 'devolver' ? `Registrar devolución · ${seleccionado?.name ?? 'Accesorio'}` : editor.tipo === 'anular' ? 'Anular accesorio' : 'Corregir o registrar accesorio'}</h3>
      {editor.pendiente ? <p role="status">Se recuperó una operación pendiente. Se reenviarán los mismos datos y la misma clave.</p> : null}
      <fieldset disabled={guardando || Boolean(editor.pendiente)} className="grid gap-4 sm:grid-cols-2">
        {editor.tipo === 'recibir' || editor.tipo === 'corregir' ? <>
          <div><label htmlFor="accesorio-edicion-nombre" className="field-label">Nombre del accesorio *</label><input id="accesorio-edicion-nombre" className="field-control" required maxLength={160} value={editor.datos.nombre} onChange={e => cambiarDatos('nombre',e.target.value)} /></div>
          <div><label htmlFor="accesorio-edicion-cantidad" className="field-label">Cantidad recibida *</label><input id="accesorio-edicion-cantidad" className="field-control" type="number" required min={1} max={1000000} step={1} value={editor.datos.cantidadRecibida} onChange={e => cambiarDatos('cantidadRecibida',Number(e.target.value))} /></div>
          <div><label htmlFor="accesorio-edicion-condicion" className="field-label">Condición de recepción</label><input id="accesorio-edicion-condicion" className="field-control" maxLength={500} value={editor.datos.condicion} onChange={e => cambiarDatos('condicion',e.target.value)} /></div>
          <div><label htmlFor="accesorio-edicion-observaciones" className="field-label">Observaciones del accesorio</label><textarea id="accesorio-edicion-observaciones" className="field-control" maxLength={2000} value={editor.datos.observaciones} onChange={e => cambiarDatos('observaciones',e.target.value)} /></div>
        </> : editor.tipo === 'anular' ? <div className="sm:col-span-2"><label htmlFor="accesorio-anulacion-motivo" className="field-label">Motivo de anulación *</label><textarea id="accesorio-anulacion-motivo" className="field-control" required maxLength={2000} value={editor.motivo} onChange={e => setEditor({ ...editor,motivo:e.target.value })} /></div> : <>
          <div><label htmlFor="accesorio-devolucion-cantidad" className="field-label">Cantidad a devolver *</label><input id="accesorio-devolucion-cantidad" className="field-control" type="number" min={1} max={editor.pendiente ? undefined : seleccionado?.quantity_pending} step={1} required value={editor.cantidad} onChange={e => setEditor({ ...editor,cantidad:Number(e.target.value) })} /><p className="field-help">Saldo pendiente actual: {seleccionado?.quantity_pending ?? 'Consultando'}</p></div>
          <div><label htmlFor="accesorio-devolucion-observacion" className="field-label">Observación de devolución</label><textarea id="accesorio-devolucion-observacion" className="field-control" maxLength={2000} value={editor.observacion} onChange={e => setEditor({ ...editor,observacion:e.target.value })} /></div>
        </>}
      </fieldset>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : editor.pendiente ? 'Reintentar operación de accesorios' : editor.tipo === 'devolver' ? 'Confirmar devolución' : 'Guardar accesorio'}</Button><Button type="button" variant="outline" disabled={guardando} onClick={() => setEditor(null)}>Cerrar operación de accesorios</Button></div>
    </form> : null}
    {mensaje ? <p role="alert" className="mt-3 text-sm">{mensaje}</p> : null}
  </section>
}
