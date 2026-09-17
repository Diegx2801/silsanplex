import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import type { CantidadDespacho } from '@/modulos/ventas/servicios/ventasService'
import { esFechaCalendarioValida, fechaLocalActual, type Venta } from '@/modulos/ventas/modelo/operacionVenta'

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

export function DialogoDespachoPersistente({
  abierto,
  venta,
  guardando = false,
  alCambiarApertura,
  alGuardar,
}: DialogoDespachoPersistenteProps) {
  const bienes = venta.lineas.filter((linea) => linea.tipoProducto === 'good')
  const [cantidades, setCantidades] = useState<Record<string, string>>(() =>
    Object.fromEntries(bienes.map((linea) => [linea.id, String(linea.cantidadPendiente ?? linea.cantidad)])),
  )
  const [fechaDespacho, setFechaDespacho] = useState(fechaLocalActual)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [procesando, setProcesando] = useState(false)
  const operationKey = useRef(nuevaClaveOperacion())

  useEffect(() => {
    setCantidades(Object.fromEntries(venta.lineas.filter((linea) => linea.tipoProducto === 'good').map((linea) => [linea.id, String(linea.cantidadPendiente ?? linea.cantidad)])))
    setFechaDespacho(fechaLocalActual())
    setErrores({})
    setError('')
    setProcesando(false)
    operationKey.current = nuevaClaveOperacion()
  }, [venta])

  const cambiarCantidad = (lineaId: string, valor: string) => {
    setCantidades((actuales) => ({ ...actuales, [lineaId]: valor }))
    operationKey.current = nuevaClaveOperacion()
    setErrores((actuales) => {
      if (!actuales[lineaId]) return actuales
      const siguientes = { ...actuales }
      delete siguientes[lineaId]
      return siguientes
    })
    setError('')
  }

  const guardar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (guardando || procesando) return
    if (!esFechaCalendarioValida(fechaDespacho)) {
      setErrores({ fecha: 'Ingresa una fecha de despacho válida' })
      setError('')
      return
    }
    const lineas: CantidadDespacho[] = []
    const erroresCampos: Record<string, string> = {}
    for (const linea of bienes) {
      const pendiente = linea.cantidadPendiente ?? linea.cantidad
      if (pendiente <= 0) continue
      const cantidad = Number(cantidades[linea.id])
      if (!Number.isFinite(cantidad) || cantidad < 0 || cantidad > pendiente) {
        erroresCampos[linea.id] = `Ingresa una cantidad entre 0 y ${pendiente} para ${linea.productoDescripcion}`
        continue
      }
      if (cantidad === 0) continue
      lineas.push({ orderItemId: linea.pedidoLineaId ?? linea.id, quantity: cantidad })
    }
    if (Object.keys(erroresCampos).length) {
      setErrores(erroresCampos)
      setError('')
      return
    }
    setErrores({})
    if (!lineas.length) {
      setError('Selecciona al menos una línea para despachar')
      return
    }
    setProcesando(true)
    try {
      const resultado = await alGuardar(lineas, operationKey.current, fechaDespacho)
      if (resultado) {
        setError(resultado)
        setProcesando(false)
        return
      }
      setProcesando(false)
      alCambiarApertura(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo despachar la venta')
      setProcesando(false)
    }
  }

  const estaGuardando = guardando || procesando

  return (
    <DialogPrimitive.Root
      open={abierto}
      onOpenChange={(siguiente) => {
        if (!estaGuardando) alCambiarApertura(siguiente)
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
        <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 border bg-background shadow-xl outline-none">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
            <DialogPrimitive.Title className="text-xl font-semibold">Despachar venta</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                {venta.numeroInterno} · Registra la cantidad de esta entrega; el saldo pendiente queda disponible para despachos posteriores.
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
                  setErrores((actuales) => {
                    if (!actuales.fecha) return actuales
                    const siguientes = { ...actuales }
                    delete siguientes.fecha
                    return siguientes
                  })
                  setError('')
                }}
                disabled={estaGuardando}
                aria-invalid={Boolean(errores.fecha)}
                aria-describedby={errores.fecha ? 'error-fecha-despacho-persistente' : undefined}
              />
              {errores.fecha ? <p id="error-fecha-despacho-persistente" className="field-error">{errores.fecha}</p> : null}
            </div>
            <div className="mt-5 space-y-4">
              {bienes.map((linea) => {
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
                    <div>
                      <label htmlFor={`cantidad-despacho-${linea.id}`} className="field-label">Cantidad de esta entrega</label>
                      <input
                        id={`cantidad-despacho-${linea.id}`}
                        type="number"
                        min="0"
                        max={pendiente}
                        step="0.001"
                        inputMode="decimal"
                        className="field-control"
                        aria-invalid={Boolean(errores[linea.id])}
                        aria-describedby={errores[linea.id] ? `error-cantidad-despacho-${linea.id}` : undefined}
                        value={cantidades[linea.id] ?? ''}
                        onChange={(evento) => cambiarCantidad(linea.id, evento.target.value)}
                        disabled={estaGuardando || pendiente <= 0}
                      />
                      {errores[linea.id] ? <p id={`error-cantidad-despacho-${linea.id}`} className="field-error">{errores[linea.id]}</p> : null}
                    </div>
                  </div>
                )
              })}
            </div>
            {error ? <p role="alert" className="mt-5 border-s-4 border-destructive bg-destructive/10 px-4 py-3 text-sm">{error}</p> : null}
            <footer className="mt-6 flex justify-end gap-3 border-t pt-5">
              <DialogPrimitive.Close asChild><Button type="button" variant="outline" disabled={estaGuardando}>Cerrar</Button></DialogPrimitive.Close>
              <Button type="submit" disabled={estaGuardando}>{estaGuardando ? 'Procesando…' : 'Confirmar despacho'}</Button>
            </footer>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
