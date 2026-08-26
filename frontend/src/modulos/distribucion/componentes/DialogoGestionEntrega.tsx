import { AlertTriangle, FileUp, RotateCcw, Route, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { Button } from '@/components/ui/button'
import { fechaLocalISO, type DatosDevolucionEntrega, type DatosIncidenciaEntrega, type DatosTransicionEntrega, type ProgramacionEntrega, type TipoEvidencia } from '@/modulos/distribucion/modelo/programacionEntrega'

type Operacion = 'salida' | 'resultado' | 'reprogramar' | 'cancelar' | 'incidencia' | 'resolver_incidencia' | 'evidencia' | 'devolucion'

interface DialogoGestionEntregaProps {
  entrega: ProgramacionEntrega
  puedeSeguir: boolean
  puedeAdjuntar: boolean
  guardando: boolean
  alCerrar: () => void
  alTransicionar: (datos: DatosTransicionEntrega) => Promise<void>
  alGuardarIncidencia: (datos: DatosIncidenciaEntrega) => Promise<void>
  alRegistrarDevolucion: (datos: DatosDevolucionEntrega) => Promise<void>
  alSubirEvidencia: (archivo: File, tipo: TipoEvidencia, notas: string) => Promise<void>
}

function operacionesDisponibles(entrega: ProgramacionEntrega, puedeSeguir: boolean, puedeAdjuntar: boolean) {
  const opciones: Array<{ valor: Operacion; etiqueta: string }> = []
  if (puedeSeguir && ['programada', 'reprogramada'].includes(entrega.seguimiento)) {
    opciones.push({ valor: 'salida', etiqueta: 'Registrar salida' }, { valor: 'reprogramar', etiqueta: 'Reprogramar' }, { valor: 'cancelar', etiqueta: 'Cancelar entrega' })
  }
  if (puedeSeguir && entrega.seguimiento === 'en_transito') {
    opciones.push({ valor: 'resultado', etiqueta: 'Registrar resultado' }, { valor: 'reprogramar', etiqueta: 'Reprogramar' })
  }
  if (puedeSeguir) opciones.push({ valor: 'incidencia', etiqueta: 'Registrar incidencia' })
  if (puedeSeguir && entrega.incidencias.some((item) => !['resuelta', 'cerrada'].includes(item.estado))) {
    opciones.push({ valor: 'resolver_incidencia', etiqueta: 'Resolver incidencia' })
  }
  if (puedeSeguir && ['entregada', 'entrega_parcial'].includes(entrega.seguimiento)
    && entrega.lineas.some((linea) => linea.cantidadEntregada > linea.cantidadDevuelta)) {
    opciones.push({ valor: 'devolucion', etiqueta: 'Registrar devolución' })
  }
  if (puedeAdjuntar) opciones.push({ valor: 'evidencia', etiqueta: 'Adjuntar evidencia' })
  return opciones
}

export function DialogoGestionEntrega({
  entrega,
  puedeSeguir,
  puedeAdjuntar,
  guardando,
  alCerrar,
  alTransicionar,
  alGuardarIncidencia,
  alRegistrarDevolucion,
  alSubirEvidencia,
}: DialogoGestionEntregaProps) {
  const operaciones = useMemo(() => operacionesDisponibles(entrega, puedeSeguir, puedeAdjuntar), [entrega, puedeSeguir, puedeAdjuntar])
  const [operacion, setOperacion] = useState<Operacion>(operaciones[0]?.valor ?? 'incidencia')
  const [descripcion, setDescripcion] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState(entrega.fechaEntrega)
  const [resultado, setResultado] = useState<'entregada' | 'entrega_parcial' | 'rechazada'>('entregada')
  const [cantidades, setCantidades] = useState(() => entrega.lineas.map((linea) => ({ id: linea.id, entregada: linea.cantidadEnviada, rechazada: 0 })))
  const [incidencia, setIncidencia] = useState<DatosIncidenciaEntrega>({ tipo: 'demora', severidad: 'media', descripcion: '' })
  const incidenciasAbiertas = entrega.incidencias.filter((item) => !['resuelta', 'cerrada'].includes(item.estado))
  const [incidenciaSeleccionada, setIncidenciaSeleccionada] = useState(incidenciasAbiertas[0]?.id ?? '')
  const [resolucion, setResolucion] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [tipoEvidencia, setTipoEvidencia] = useState<TipoEvidencia>('entrega')
  const [devolucion, setDevolucion] = useState<DatosDevolucionEntrega>({
    motivo: '', notas: '',
    lineas: entrega.lineas.filter((linea) => linea.cantidadEntregada > linea.cantidadDevuelta).map((linea) => ({
      entregaLineaId: linea.id, cantidad: linea.cantidadEntregada - linea.cantidadDevuelta, condicion: 'conforme',
    })),
  })
  const [error, setError] = useState('')

  const ejecutar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    try {
      setError('')
      if (operacion === 'salida') await alTransicionar({ estado: 'en_transito', descripcion: descripcion || 'Unidad salió a ruta.' })
      if (operacion === 'reprogramar') await alTransicionar({ estado: 'reprogramada', descripcion, fechaEntrega })
      if (operacion === 'cancelar') await alTransicionar({ estado: 'cancelada', descripcion })
      if (operacion === 'resultado') {
        await alTransicionar({
          estado: resultado,
          descripcion,
          lineas: resultado === 'entrega_parcial' ? cantidades.map((linea) => ({ id: linea.id, cantidadEntregada: linea.entregada, cantidadRechazada: linea.rechazada })) : undefined,
        })
      }
      if (operacion === 'incidencia') await alGuardarIncidencia(incidencia)
      if (operacion === 'resolver_incidencia') {
        const seleccionada = incidenciasAbiertas.find((item) => item.id === incidenciaSeleccionada)
        if (!seleccionada) throw new Error('Selecciona una incidencia pendiente')
        if (!resolucion.trim()) throw new Error('Describe cómo se resolvió la incidencia')
        await alGuardarIncidencia({
          id: seleccionada.id,
          tipo: seleccionada.tipo,
          severidad: seleccionada.severidad,
          descripcion: seleccionada.descripcion,
          estado: 'resuelta',
          resolucion: resolucion.trim(),
        })
      }
      if (operacion === 'devolucion') await alRegistrarDevolucion(devolucion)
      if (operacion === 'evidencia') {
        if (!archivo) throw new Error('Selecciona un archivo')
        await alSubirEvidencia(archivo, tipoEvidencia, descripcion)
      }
      alCerrar()
    } catch (problema) {
      setError(problema instanceof Error ? problema.message : 'No se pudo completar la operación')
    }
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(abierto) => { if (!abierto) alCerrar() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
        <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-background p-6 shadow-2xl outline-none sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[0.68rem] tracking-[0.08em] text-primary uppercase">{entrega.pedidoNumero} · {entrega.numeroGuiaRemision}</p>
              <DialogPrimitive.Title className="mt-2 text-xl font-semibold">Actualizar hoja de ruta</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">Cada cambio quedará registrado en la bitácora de esta entrega.</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar gestión" className="grid size-9 place-items-center rounded-md hover:bg-muted"><X aria-hidden="true" className="size-5" /></button></DialogPrimitive.Close>
          </div>

          <form onSubmit={ejecutar} className="mt-6 space-y-5">
            <div>
              <label htmlFor="operacion-entrega" className="field-label">Operación</label>
              <select id="operacion-entrega" className="field-control" value={operacion} onChange={(e) => setOperacion(e.target.value as Operacion)}>
                {operaciones.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
              </select>
            </div>

            {operacion === 'salida' ? (
              <div className="border-s-2 border-primary bg-primary/5 px-4 py-3 text-sm leading-6"><Route aria-hidden="true" className="me-2 inline size-4 text-primary" />Se registrará la hora de salida y el despacho pasará a “En tránsito”.</div>
            ) : null}

            {operacion === 'reprogramar' ? (
              <div><label htmlFor="nueva-fecha" className="field-label">Nueva fecha *</label><input id="nueva-fecha" required min={fechaLocalISO()} type="date" className="field-control" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} /></div>
            ) : null}

            {operacion === 'resultado' ? (
              <>
                <div><label htmlFor="resultado-entrega" className="field-label">Resultado</label><select id="resultado-entrega" className="field-control" value={resultado} onChange={(e) => setResultado(e.target.value as typeof resultado)}><option value="entregada">Entrega completa</option><option value="entrega_parcial">Entrega parcial</option><option value="rechazada">Entrega rechazada</option></select></div>
                {resultado === 'entrega_parcial' ? (
                  <div className="divide-y border">
                    {entrega.lineas.map((linea) => {
                      const cantidadesLinea = cantidades.find((item) => item.id === linea.id)!
                      const actualizar = (campo: 'entregada' | 'rechazada', valor: number) => setCantidades((actuales) => actuales.map((item) => item.id === linea.id ? { ...item, [campo]: valor } : item))
                      return <div key={linea.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_7rem_7rem] sm:items-end"><div><p className="text-sm font-medium">{linea.productoDescripcion}</p><p className="mt-1 text-xs text-muted-foreground">Enviado: {linea.cantidadEnviada} {linea.unidadMedida}</p></div><div><label className="field-label" htmlFor={`entregada-${linea.id}`}>Entregada</label><input id={`entregada-${linea.id}`} min="0" max={linea.cantidadEnviada} step="0.001" type="number" className="field-control" value={cantidadesLinea.entregada} onChange={(e) => actualizar('entregada', Number(e.target.value))} /></div><div><label className="field-label" htmlFor={`rechazada-${linea.id}`}>Rechazada</label><input id={`rechazada-${linea.id}`} min="0" max={linea.cantidadEnviada} step="0.001" type="number" className="field-control" value={cantidadesLinea.rechazada} onChange={(e) => actualizar('rechazada', Number(e.target.value))} /></div></div>
                    })}
                  </div>
                ) : null}
              </>
            ) : null}

            {operacion === 'incidencia' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label htmlFor="tipo-incidencia" className="field-label">Tipo</label><select id="tipo-incidencia" className="field-control" value={incidencia.tipo} onChange={(e) => setIncidencia({ ...incidencia, tipo: e.target.value as DatosIncidenciaEntrega['tipo'] })}><option value="demora">Demora</option><option value="danio">Daño</option><option value="perdida">Pérdida</option><option value="documentacion">Documentación</option><option value="cliente_ausente">Cliente ausente</option><option value="vehiculo">Vehículo</option><option value="otro">Otro</option></select></div>
                <div><label htmlFor="severidad-incidencia" className="field-label">Severidad</label><select id="severidad-incidencia" className="field-control" value={incidencia.severidad} onChange={(e) => setIncidencia({ ...incidencia, severidad: e.target.value as DatosIncidenciaEntrega['severidad'] })}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></div>
                <div className="sm:col-span-2"><label htmlFor="detalle-incidencia" className="field-label">Descripción *</label><textarea id="detalle-incidencia" required rows={4} className="field-control" value={incidencia.descripcion} onChange={(e) => setIncidencia({ ...incidencia, descripcion: e.target.value })} /></div>
              </div>
            ) : null}

            {operacion === 'resolver_incidencia' ? (
              <div className="space-y-4">
                <div><label htmlFor="incidencia-pendiente" className="field-label">Incidencia pendiente</label><select id="incidencia-pendiente" required className="field-control" value={incidenciaSeleccionada} onChange={(e) => setIncidenciaSeleccionada(e.target.value)}>{incidenciasAbiertas.map((item) => <option key={item.id} value={item.id}>{item.tipo.replace('_', ' ')} · {item.descripcion}</option>)}</select></div>
                <div><label htmlFor="resolucion-incidencia" className="field-label">Resolución *</label><textarea id="resolucion-incidencia" required rows={4} className="field-control" value={resolucion} onChange={(e) => setResolucion(e.target.value)} /></div>
              </div>
            ) : null}

            {operacion === 'evidencia' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label htmlFor="tipo-evidencia" className="field-label">Tipo de evidencia</label><select id="tipo-evidencia" className="field-control" value={tipoEvidencia} onChange={(e) => setTipoEvidencia(e.target.value as TipoEvidencia)}><option value="despacho">Despacho</option><option value="entrega">Entrega</option><option value="rechazo">Rechazo</option><option value="devolucion">Devolución</option><option value="incidencia">Incidencia</option></select></div>
                <div><label htmlFor="archivo-evidencia" className="field-label">Archivo *</label><input id="archivo-evidencia" required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="field-control file:me-3 file:border-0 file:bg-transparent" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} /></div>
                <p className="sm:col-span-2 text-xs leading-5 text-muted-foreground"><FileUp aria-hidden="true" className="me-1 inline size-3.5" />JPG, PNG, WEBP o PDF. Máximo 10 MB. La evidencia será privada para la organización.</p>
              </div>
            ) : null}

            {operacion === 'devolucion' ? (
              <div className="space-y-4">
                <div><label htmlFor="motivo-devolucion" className="field-label">Motivo *</label><textarea id="motivo-devolucion" required rows={3} className="field-control" value={devolucion.motivo} onChange={(e) => setDevolucion({ ...devolucion, motivo: e.target.value })} /></div>
                <div className="divide-y border">{devolucion.lineas.map((linea) => { const producto = entrega.lineas.find((item) => item.id === linea.entregaLineaId)!; const maximo = producto.cantidadEntregada - producto.cantidadDevuelta; return <div key={linea.entregaLineaId} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_7rem_9rem] sm:items-end"><div><p className="text-sm font-medium">{producto.productoDescripcion}</p><p className="mt-1 text-xs text-muted-foreground">Disponible: {maximo} {producto.unidadMedida}</p></div><div><label className="field-label" htmlFor={`devuelve-${linea.entregaLineaId}`}>Cantidad</label><input id={`devuelve-${linea.entregaLineaId}`} min="0.001" max={maximo} step="0.001" type="number" className="field-control" value={linea.cantidad} onChange={(e) => setDevolucion({ ...devolucion, lineas: devolucion.lineas.map((item) => item.entregaLineaId === linea.entregaLineaId ? { ...item, cantidad: Number(e.target.value) } : item) })} /></div><div><label className="field-label" htmlFor={`condicion-${linea.entregaLineaId}`}>Condición</label><select id={`condicion-${linea.entregaLineaId}`} className="field-control" value={linea.condicion} onChange={(e) => setDevolucion({ ...devolucion, lineas: devolucion.lineas.map((item) => item.entregaLineaId === linea.entregaLineaId ? { ...item, condicion: e.target.value as typeof linea.condicion } : item) })}><option value="conforme">Conforme</option><option value="danado">Dañado</option><option value="vencido">Vencido</option><option value="abierto">Abierto</option><option value="otro">Otro</option></select></div></div> })}</div>
              </div>
            ) : null}

            {['reprogramar', 'cancelar', 'salida', 'resultado', 'evidencia'].includes(operacion) ? (
              <div><label htmlFor="descripcion-operacion" className="field-label">{operacion === 'evidencia' ? 'Notas' : 'Detalle de la operación'}{['reprogramar', 'cancelar'].includes(operacion) ? ' *' : ''}</label><textarea id="descripcion-operacion" required={['reprogramar', 'cancelar'].includes(operacion)} rows={3} className="field-control" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
            ) : null}

            {error ? <p role="alert" className="flex gap-2 border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{error}</p> : null}
            <div className="flex justify-end gap-2 border-t pt-5"><Button type="button" variant="outline" onClick={alCerrar}>Cancelar</Button><Button type="submit" disabled={guardando || operaciones.length === 0}>{guardando ? 'Registrando…' : <><RotateCcw aria-hidden="true" /> Registrar operación</>}</Button></div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
