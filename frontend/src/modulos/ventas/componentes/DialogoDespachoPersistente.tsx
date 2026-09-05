import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import type { CantidadDespacho } from '@/modulos/ventas/servicios/ventasService'
import type { Venta } from '@/modulos/ventas/modelo/operacionVenta'

interface DialogoDespachoPersistenteProps {
  abierto: boolean
  venta: Venta
  guardando?: boolean
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (
    lineas: readonly CantidadDespacho[],
    operationKey: string,
    operationDate: string,
  ) => string | undefined | Promise<string | undefined>
}

function nuevaClaveOperacion() {
  return crypto.randomUUID()
}

function fechaActual() {
  return new Date().toISOString().slice(0, 10)
}

export function DialogoDespachoPersistente({
  abierto,
  venta,
  guardando = false,
  alCambiarApertura,
  alGuardar,
}: DialogoDespachoPersistenteProps) {
  const soloServicios = venta.lineas.every((linea) => linea.tipoProducto === 'service')
  const [cantidades, setCantidades] = useState<Record<string, string>>(() =>
    Object.fromEntries(venta.lineas.map((linea) => [linea.id, String(linea.cantidadPendiente ?? linea.cantidad)])),
  )
  const [fechaDespacho, setFechaDespacho] = useState(fechaActual)
  const [error, setError] = useState('')
  const [procesando, setProcesando] = useState(false)
  const operationKey = useRef(nuevaClaveOperacion())

  useEffect(() => {
    setCantidades(Object.fromEntries(venta.lineas.map((linea) => [linea.id, String(linea.cantidadPendiente ?? linea.cantidad)])))
    setFechaDespacho(fechaActual())
    setError('')
    setProcesando(false)
    operationKey.current = nuevaClaveOperacion()
  }, [venta])

  const cambiarCantidad = (lineaId: string, valor: string) => {
    setCantidades((actuales) => ({ ...actuales, [lineaId]: valor }))
    operationKey.current = nuevaClaveOperacion()
    setError('')
  }

  const guardar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (guardando || procesando) return
    const lineas: CantidadDespacho[] = []
    for (const linea of venta.lineas) {
      const pendiente = linea.cantidadPendiente ?? linea.cantidad
      if (pendiente <= 0) continue
      if (linea.tipoProducto === 'service') {
        if (soloServicios) lineas.push({ orderItemId: linea.pedidoLineaId ?? linea.id, quantity: linea.cantidad })
        continue
      }
      const cantidad = Number(cantidades[linea.id])
      if (!Number.isFinite(cantidad) || cantidad < 0 || cantidad > pendiente) {
        setError(`Ingresa una cantidad entre 0 y ${pendiente} para ${linea.productoDescripcion}`)
        return
      }
      if (cantidad === 0) continue
      lineas.push({ orderItemId: linea.pedidoLineaId ?? linea.id, quantity: cantidad })
    }
    if (!lineas.length) {
      setError('Selecciona al menos una línea para despachar')
      return
    }
    setProcesando(true)
    const resultado = await alGuardar(lineas, operationKey.current, fechaDespacho)
    setProcesando(false)
    if (resultado) {
      setError(resultado)
      return
    }
    alCambiarApertura(false)
  }

  const estaGuardando = guardando || procesando

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
        <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 border bg-background shadow-xl outline-none">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <DialogPrimitive.Title className="text-xl font-semibold">{soloServicios ? 'Completar servicios' : 'Despachar venta'}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                {venta.numeroInterno} · {soloServicios
                  ? 'Confirma la atención comercial de los servicios. No se modificará el inventario.'
                  : 'Los bienes consumen reservas FEFO. Los servicios se consideran atendidos al completar todos los bienes.'}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button type="button" aria-label="Cerrar" className="grid size-9 place-items-center rounded-md hover:bg-muted" disabled={estaGuardando}>
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>
          <form className="px-5 py-6 sm:px-7" onSubmit={(evento) => void guardar(evento)}>
            <div>
              <label htmlFor="fecha-despacho-persistente" className="field-label">Fecha de despacho</label>
              <input
                id="fecha-despacho-persistente"
                type="date"
                className="field-control max-w-xs"
                value={fechaDespacho}
                onChange={(evento) => {
                  setFechaDespacho(evento.target.value)
                  operationKey.current = nuevaClaveOperacion()
                  setError('')
                }}
                disabled={estaGuardando}
              />
            </div>
            <div className="mt-5 space-y-4">
              {venta.lineas.map((linea) => {
                const pendiente = linea.cantidadPendiente ?? linea.cantidad
                const despachada = linea.cantidadDespachada ?? Math.max(linea.cantidad - pendiente, 0)
                return (
                  <div key={linea.id} className="grid gap-2 sm:grid-cols-[1fr_10rem] sm:items-end">
                    <div>
                      <p className="font-medium">{linea.productoDescripcion}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {linea.productoCodigo} · despachado: {despachada} · pendiente: {pendiente} {linea.unidadMedida}
                      </p>
                    </div>
                    {linea.tipoProducto === 'service' ? (
                      <p className="text-sm text-muted-foreground">Servicio · atención al cierre, sin inventario</p>
                    ) : <div>
                      <label htmlFor={`cantidad-despacho-${linea.id}`} className="field-label">Cantidad a despachar</label>
                      <input
                        id={`cantidad-despacho-${linea.id}`}
                        type="number"
                        min="0"
                        max={pendiente}
                        step="0.001"
                        inputMode="decimal"
                        className="field-control"
                        value={cantidades[linea.id] ?? ''}
                        onChange={(evento) => cambiarCantidad(linea.id, evento.target.value)}
                        disabled={estaGuardando || pendiente <= 0}
                      />
                    </div>}
                  </div>
                )
              })}
            </div>
            {error ? <p role="alert" className="mt-5 border-s-4 border-destructive bg-destructive/10 px-4 py-3 text-sm">{error}</p> : null}
            <footer className="mt-6 flex justify-end gap-3 border-t pt-5">
              <DialogPrimitive.Close asChild><Button type="button" variant="outline" disabled={estaGuardando}>Cerrar</Button></DialogPrimitive.Close>
              <Button type="submit" disabled={estaGuardando}>{estaGuardando ? 'Procesando…' : soloServicios ? 'Confirmar atención' : 'Confirmar despacho'}</Button>
            </footer>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
