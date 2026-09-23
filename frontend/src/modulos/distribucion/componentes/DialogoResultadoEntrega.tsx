import { CircleAlert, PackageCheck, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { Button } from '@/components/ui/button'
import { fechaActualPeru } from '@/lib/fechas'
import {
  esquemaResultadoEntrega,
  inferirResultadoEntrega,
  type ProgramacionEntrega,
  type ResultadoEntrega,
} from '@/modulos/distribucion/modelo/programacionEntrega'

interface DialogoResultadoEntregaProps {
  abierto: boolean
  entrega: ProgramacionEntrega
  guardando?: boolean
  alCambiarApertura: (abierto: boolean) => void
  alConfirmar: (resultado: ResultadoEntrega, operationKey: string) => Promise<string | undefined>
}

type ModoResultado = 'recibido' | 'no_entregado'

export function DialogoResultadoEntrega({
  abierto,
  entrega,
  guardando = false,
  alCambiarApertura,
  alConfirmar,
}: DialogoResultadoEntregaProps) {
  const [modo, setModo] = useState<ModoResultado>('recibido')
  const [fecha, setFecha] = useState(fechaActualPeru())
  const [evidencia, setEvidencia] = useState('')
  const [incidencia, setIncidencia] = useState('')
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const operationKey = useRef<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setModo('recibido')
    setFecha(fechaActualPeru())
    setEvidencia('')
    setIncidencia('')
    setCantidades(Object.fromEntries(entrega.lineas.map((linea) => [linea.id, '0'])))
    setError('')
    operationKey.current = crypto.randomUUID()
  }, [abierto, entrega.id, entrega.lineas, entrega.resultadosEntrega.length])

  const cambiar = <K extends 'modo' | 'fecha' | 'evidencia' | 'incidencia'>(campo: K, valor: K extends 'modo' ? ModoResultado : string) => {
    operationKey.current = crypto.randomUUID()
    setError('')
    if (campo === 'modo') setModo(valor as ModoResultado)
    if (campo === 'fecha') setFecha(valor)
    if (campo === 'evidencia') setEvidencia(valor)
    if (campo === 'incidencia') setIncidencia(valor)
  }

  const cantidadesNumericas = Object.fromEntries(
    Object.entries(cantidades).map(([id, valor]) => [id, valor === '' ? 0 : Number(valor)]),
  )
  const resultadoInferido = modo === 'recibido'
    ? inferirResultadoEntrega(entrega.lineas, cantidadesNumericas)
    : 'rechazado'
  const cantidadNueva = Object.values(cantidadesNumericas).reduce((total, cantidad) => total + cantidad, 0)
  const cantidadInvalida = entrega.lineas.some((linea) => {
    const pendiente = linea.cantidadPendienteCliente ?? Math.max(0, linea.cantidad - (linea.cantidadEntregadaCliente ?? 0))
    const cantidad = cantidadesNumericas[linea.id] ?? 0
    return !Number.isFinite(cantidad) || cantidad < 0 || cantidad > pendiente
  })

  const cambiarCantidad = (lineaId: string, valor: string) => {
    operationKey.current = crypto.randomUUID()
    setError('')
    setCantidades((actuales) => ({ ...actuales, [lineaId]: valor }))
  }

  const enviar = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!resultadoInferido) {
      setError('Ingresa la cantidad realmente recibida en al menos un producto.')
      return
    }

    const resultado = esquemaResultadoEntrega.safeParse({
      entregaId: entrega.id,
      lockVersion: entrega.lockVersion,
      resultado: resultadoInferido,
      fecha,
      evidencia: modo === 'recibido' ? evidencia : '',
      incidencias: modo === 'no_entregado' ? incidencia.split(/[;\n]/).map((item) => item.trim()).filter(Boolean) : [],
      lineas: modo === 'recibido'
        ? entrega.lineas.map((linea) => ({ orderLineId: linea.id, cantidad: cantidadesNumericas[linea.id] ?? 0 })).filter((linea) => linea.cantidad > 0)
        : [],
    })
    if (!resultado.success) {
      setError(resultado.error.issues[0]?.message ?? 'Revisa los datos del resultado.')
      return
    }

    operationKey.current ??= crypto.randomUUID()
    const errorOperacion = await alConfirmar(resultado.data, operationKey.current)
    if (errorOperacion) setError(errorOperacion)
    else alCambiarApertura(false)
  }

  const conciliacionPendiente = entrega.requiereConciliacionCantidades

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-60 bg-foreground/30" />
        <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-70 flex max-h-[92svh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border bg-background shadow-xl outline-none">
          <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <header className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
              <div>
                <div className="grid size-10 place-items-center rounded-full bg-accent text-primary"><PackageCheck aria-hidden="true" className="size-5" /></div>
                <DialogPrimitive.Title className="mt-4 text-xl font-semibold">Registrar resultado de entrega</DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">{entrega.pedidoNumero} · {entrega.clienteNombre}. Registra lo que recibió el cliente; el inventario ya salió en Ventas.</DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild><Button type="button" variant="ghost" aria-label="Cerrar resultado"><X aria-hidden="true" /></Button></DialogPrimitive.Close>
            </header>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
              {conciliacionPendiente ? (
                <div role="alert" className="flex gap-3 border-s-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950"><CircleAlert aria-hidden="true" className="size-5 shrink-0" /><p>Este es un registro histórico sin cantidades recibidas por producto. Debe conciliarse antes de continuar; no se asumirán cantidades.</p></div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="resultado-modo" className="field-label">Resultado</label><select id="resultado-modo" value={modo} disabled={conciliacionPendiente || guardando} onChange={(evento) => cambiar('modo', evento.target.value as ModoResultado)} className="field-control"><option value="recibido">El cliente recibió bienes</option><option value="no_entregado">No se completó la entrega</option></select><p className="mt-1 text-xs text-muted-foreground">La entrega completa o parcial se determina según las cantidades registradas.</p></div>
                <div><label htmlFor="resultado-fecha" className="field-label">Fecha del resultado</label><input id="resultado-fecha" type="date" required max={fechaActualPeru()} value={fecha} disabled={conciliacionPendiente || guardando} onChange={(evento) => cambiar('fecha', evento.target.value)} className="field-control" /></div>
              </div>

              {modo === 'recibido' ? (
                <section aria-labelledby="cantidades-recibidas-title" className="border">
                  <div className="border-b bg-muted/25 px-4 py-3"><h2 id="cantidades-recibidas-title" className="text-sm font-semibold">Cantidades recibidas por el cliente</h2><p className="mt-1 text-xs text-muted-foreground">Ingresa lo recibido ahora. El saldo se conserva para una entrega posterior.</p></div>
                  <div className="divide-y">
                    {entrega.lineas.map((linea) => {
                      const recibidaAntes = linea.cantidadEntregadaCliente ?? 0
                      const pendiente = linea.cantidadPendienteCliente ?? Math.max(0, linea.cantidad - recibidaAntes)
                      return (
                        <div key={linea.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-center">
                          <div><p className="font-medium">{linea.productoDescripcion}</p><p className="mt-1 text-xs text-muted-foreground">Despachado en Ventas: <span className="font-mono tabular-nums">{linea.cantidadDespachada ?? linea.cantidad} {linea.unidadMedida}</span> · Recibido antes: <span className="font-mono tabular-nums">{recibidaAntes} {linea.unidadMedida}</span> · Pendiente: <span className="font-mono font-semibold tabular-nums">{pendiente} {linea.unidadMedida}</span></p></div>
                          <div><label htmlFor={`cantidad-recibida-${linea.id}`} className="field-label">Recibido ahora</label><input id={`cantidad-recibida-${linea.id}`} type="number" inputMode="decimal" min="0" max={pendiente} step="0.001" value={cantidades[linea.id] ?? '0'} disabled={conciliacionPendiente || guardando || pendiente <= 0} onChange={(evento) => cambiarCantidad(linea.id, evento.target.value)} className="field-control text-end font-mono tabular-nums" aria-describedby={`saldo-${linea.id}`} /><p id={`saldo-${linea.id}`} className="mt-1 text-right text-xs text-muted-foreground">Máximo: {pendiente}</p></div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-4 py-3 text-sm"><span className="status-label" data-tone={resultadoInferido === 'entregado' ? 'listo' : 'pendiente'}>{resultadoInferido === 'entregado' ? 'Todos los saldos quedarán cubiertos' : resultadoInferido === 'entrega_parcial' ? 'Quedará saldo para una entrega posterior' : cantidadInvalida ? 'Revisa las cantidades ingresadas' : 'Ingresa las cantidades recibidas'}</span><span className="text-xs text-muted-foreground">El resultado se calcula por producto.</span></div>
                </section>
              ) : (
                <div><label htmlFor="resultado-incidencia" className="field-label">Motivo <span aria-hidden="true">*</span></label><textarea id="resultado-incidencia" required maxLength={200} rows={3} value={incidencia} disabled={conciliacionPendiente || guardando} onChange={(evento) => cambiar('incidencia', evento.target.value)} className="field-control" placeholder="Ej. cliente ausente, dirección no ubicada, cliente rechazó la recepción…" /></div>
              )}

              {modo === 'recibido' ? <div><label htmlFor="resultado-evidencia" className="field-label">Evidencia o constancia <span aria-hidden="true">*</span></label><input id="resultado-evidencia" required maxLength={255} value={evidencia} disabled={conciliacionPendiente || guardando} onChange={(evento) => cambiar('evidencia', evento.target.value)} className="field-control" placeholder="Nombre de archivo, referencia o URL" /><p className="mt-1 text-xs text-muted-foreground">Se conserva como referencia de la conformidad; este campo no adjunta archivos.</p></div> : null}

              <p className="border-s-2 border-primary/40 ps-3 text-xs leading-5 text-muted-foreground">Registrar una entrega parcial o un intento fallido no descuenta stock. El saldo se calcula contra las cantidades recibidas y cualquier devolución física requiere el proceso de recepción de Inventario.</p>
              {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            </div>

            <footer className="flex shrink-0 justify-end gap-2 border-t bg-background px-5 py-4 sm:px-7">
              <Button type="button" variant="outline" disabled={guardando} onClick={() => alCambiarApertura(false)}>Cancelar</Button>
              <Button type="submit" disabled={guardando || conciliacionPendiente || (modo === 'recibido' && (cantidadNueva <= 0 || cantidadInvalida))}>{guardando ? 'Registrando…' : modo === 'no_entregado' ? 'Registrar entrega no completada' : resultadoInferido === 'entregado' ? 'Confirmar entrega completa' : 'Confirmar entrega parcial'}</Button>
            </footer>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
