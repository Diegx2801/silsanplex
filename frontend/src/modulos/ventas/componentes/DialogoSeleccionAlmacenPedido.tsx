import { ShoppingCart, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import type { Almacen } from '@/modulos/inventario/modelo/almacen'
import type { Cotizacion } from '@/modulos/ventas/modelo/cotizacion'

interface DialogoSeleccionAlmacenPedidoProps {
  abierto: boolean
  cotizacion: Cotizacion
  almacenes: readonly Almacen[]
  buscarAlmacenes?: (busqueda: string) => Promise<readonly Almacen[]>
  guardando?: boolean
  alCambiarApertura: (abierto: boolean) => void
  alConfirmar: (almacenId: string) => string | undefined | Promise<string | undefined>
  alRestaurarFoco: () => void
}

export function DialogoSeleccionAlmacenPedido({
  abierto,
  cotizacion,
  almacenes,
  buscarAlmacenes,
  guardando = false,
  alCambiarApertura,
  alConfirmar,
  alRestaurarFoco,
}: DialogoSeleccionAlmacenPedidoProps) {
  const [almacenId, setAlmacenId] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const estaGuardando = guardando || enviando

  useEffect(() => {
    if (!abierto) return
    // El operador debe elegir explícitamente el almacén de preparación.
    // Tomar la primera fila es inseguro cuando existen varios almacenes.
    setAlmacenId('')
    setError('')
    setEnviando(false)
  }, [abierto, almacenes])

  const opcionesAlmacenes: ComboboxOption[] = almacenes.map((almacen) => ({
    value: almacen.id,
    label: `${almacen.codigo} · ${almacen.nombre}`,
    secondaryText: almacen.direccion || 'Sin dirección registrada',
    keywords: [almacen.codigo, almacen.nombre, almacen.direccion],
    disabled: !almacen.activo,
  }))

  const guardar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!almacenId) {
      setError('Selecciona un almacén para el pedido')
      return
    }
    setEnviando(true)
    try {
      const mensaje = await alConfirmar(almacenId)
      if (mensaje) setError(mensaje)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <DialogPrimitive.Root
      open={abierto}
      onOpenChange={(siguiente) => {
        if (!estaGuardando) alCambiarApertura(siguiente)
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-60 bg-foreground/30" />
        <DialogPrimitive.Content
          className="fixed start-1/2 top-1/2 z-70 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 border bg-background shadow-xl outline-none"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <div className="grid size-10 place-items-center rounded-full bg-accent text-primary">
                <ShoppingCart aria-hidden="true" className="size-5" />
              </div>
              <DialogPrimitive.Title className="mt-4 text-xl font-semibold tracking-[-0.025em]">
                Crear pedido {cotizacion.numero}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                Selecciona el almacén donde se preparará el pedido de {cotizacion.clienteNombre}.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar"
                disabled={estaGuardando}
                className="grid size-9 place-items-center rounded-md hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>

          <form className="px-5 py-6 sm:px-7" onSubmit={(evento) => void guardar(evento)}>
            <div className="space-y-4">
              <Combobox
                id="almacen-pedido"
                label="Almacén de preparación"
                value={almacenId}
                options={opcionesAlmacenes}
                onChange={(valor) => {
                  setAlmacenId(valor)
                  setError('')
                }}
                loadOptions={buscarAlmacenes ? async (busqueda) => (await buscarAlmacenes(busqueda)).map((almacen) => ({
                  value: almacen.id,
                  label: `${almacen.codigo} · ${almacen.nombre}`,
                  secondaryText: almacen.direccion || 'Sin dirección registrada',
                  keywords: [almacen.codigo, almacen.nombre, almacen.direccion],
                  disabled: !almacen.activo,
                })) : undefined}
                placeholder="Buscar almacén…"
                helperText="Código, nombre o dirección."
                error={error && !almacenId ? error : undefined}
                required
                disabled={estaGuardando || !almacenes.length}
                noOptionsMessage="No hay almacenes activos disponibles."
              />
              <p className="text-xs text-muted-foreground">
                {cotizacion.lineas.length} {cotizacion.lineas.length === 1 ? 'producto' : 'productos'} quedarán asociados al almacén seleccionado.
              </p>
            </div>
            {error ? <p role="alert" className="mt-5 border-s-4 border-destructive bg-destructive/10 px-4 py-3 text-sm">{error}</p> : null}
            <footer className="mt-6 flex justify-end gap-3 border-t pt-5">
              <Button type="button" variant="outline" disabled={estaGuardando} onClick={() => alCambiarApertura(false)}>Cancelar</Button>
              <Button type="submit" disabled={estaGuardando || !almacenes.length}>
                <ShoppingCart aria-hidden="true" /> {estaGuardando ? 'Creando pedido…' : 'Confirmar pedido'}
              </Button>
            </footer>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
