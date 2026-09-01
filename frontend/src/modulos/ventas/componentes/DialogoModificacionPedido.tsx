import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import type { CantidadLineaPedido } from '@/modulos/ventas/servicios/ventasService'
import type { PedidoVenta } from '@/modulos/ventas/modelo/operacionVenta'

interface DialogoModificacionPedidoProps {
  abierto: boolean
  pedido: PedidoVenta
  guardando?: boolean
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (
    lineas: readonly CantidadLineaPedido[],
    operationKey: string,
  ) => string | undefined | Promise<string | undefined>
}

function nuevaClaveOperacion() {
  return crypto.randomUUID()
}

export function DialogoModificacionPedido({
  abierto,
  pedido,
  guardando = false,
  alCambiarApertura,
  alGuardar,
}: DialogoModificacionPedidoProps) {
  const [cantidades, setCantidades] = useState<Record<string, string>>(() =>
    Object.fromEntries(pedido.lineas.map((linea) => [linea.id, String(linea.cantidad)])),
  )
  const [error, setError] = useState('')
  const [procesando, setProcesando] = useState(false)
  const operationKey = useRef(nuevaClaveOperacion())

  useEffect(() => {
    setCantidades(Object.fromEntries(pedido.lineas.map((linea) => [linea.id, String(linea.cantidad)])))
    setError('')
    setProcesando(false)
    operationKey.current = nuevaClaveOperacion()
  }, [pedido])

  const cambiarCantidad = (lineaId: string, valor: string) => {
    setCantidades((actuales) => ({ ...actuales, [lineaId]: valor }))
    // Una edición distinta es una nueva operación; un retry sin editar
    // conserva la misma clave y permanece idempotente en PostgreSQL.
    operationKey.current = nuevaClaveOperacion()
    setError('')
  }

  const guardar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (guardando || procesando) return
    const lineas: CantidadLineaPedido[] = []
    for (const linea of pedido.lineas) {
      const cantidad = Number(cantidades[linea.id])
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        setError(`Ingresa una cantidad válida para ${linea.productoDescripcion}`)
        return
      }
      lineas.push({ orderItemId: linea.id, quantity: cantidad })
    }
    setProcesando(true)
    const resultado = await alGuardar(lineas, operationKey.current)
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
              <DialogPrimitive.Title className="text-xl font-semibold">Modificar cantidades</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                {pedido.numero} · Las reservas se ajustarán en el almacén del pedido.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button type="button" aria-label="Cerrar" className="grid size-9 place-items-center rounded-md hover:bg-muted" disabled={estaGuardando}>
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>
          <form className="px-5 py-6 sm:px-7" onSubmit={(evento) => void guardar(evento)}>
            <div className="space-y-4">
              {pedido.lineas.map((linea) => (
                <div key={linea.id} className="grid gap-2 sm:grid-cols-[1fr_10rem] sm:items-end">
                  <div>
                    <p className="font-medium">{linea.productoDescripcion}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{linea.productoCodigo} · actual: {linea.cantidad} {linea.unidadMedida}</p>
                  </div>
                  <div>
                    <label htmlFor={`cantidad-pedido-${linea.id}`} className="field-label">Nueva cantidad</label>
                    <input
                      id={`cantidad-pedido-${linea.id}`}
                      type="number"
                      min="0.001"
                      step="0.001"
                      inputMode="decimal"
                      className="field-control"
                      value={cantidades[linea.id] ?? ''}
                      onChange={(evento) => cambiarCantidad(linea.id, evento.target.value)}
                      disabled={estaGuardando}
                    />
                  </div>
                </div>
              ))}
            </div>
            {error ? <p role="alert" className="mt-5 border-s-4 border-destructive bg-destructive/10 px-4 py-3 text-sm">{error}</p> : null}
            <footer className="mt-6 flex justify-end gap-3 border-t pt-5">
              <DialogPrimitive.Close asChild><Button type="button" variant="outline" disabled={estaGuardando}>Cerrar</Button></DialogPrimitive.Close>
              <Button type="submit" disabled={estaGuardando}>{estaGuardando ? 'Guardando…' : 'Guardar cantidades'}</Button>
            </footer>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
