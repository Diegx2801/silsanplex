import { ShoppingCart, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import type { DireccionEntregaCliente } from '@/modulos/clientes/modelo/cliente'
import type { Almacen } from '@/modulos/inventario/modelo/almacen'
import type { Cotizacion } from '@/modulos/ventas/modelo/cotizacion'
import type { DireccionEntregaPedido, ModoCumplimientoPedido } from '@/modulos/ventas/modelo/operacionVenta'

interface DialogoSeleccionAlmacenPedidoProps {
  abierto: boolean
  cotizacion: Cotizacion
  almacenes: readonly Almacen[]
  direccionesEntrega?: readonly DireccionEntregaCliente[]
  buscarAlmacenes?: (busqueda: string) => Promise<readonly Almacen[]>
  guardando?: boolean
  alCambiarApertura: (abierto: boolean) => void
  alConfirmar: (almacenId: string, fulfillmentMode: ModoCumplimientoPedido, direccionEntrega?: DireccionEntregaPedido) => string | undefined | Promise<string | undefined>
  alRestaurarFoco: () => void
}

const SIN_DIRECCIONES_ENTREGA: readonly DireccionEntregaCliente[] = []

export function DialogoSeleccionAlmacenPedido({
  abierto,
  cotizacion,
  almacenes,
  direccionesEntrega = SIN_DIRECCIONES_ENTREGA,
  buscarAlmacenes,
  guardando = false,
  alCambiarApertura,
  alConfirmar,
  alRestaurarFoco,
}: DialogoSeleccionAlmacenPedidoProps) {
  const [almacenId, setAlmacenId] = useState('')
  const [fulfillmentMode, setFulfillmentMode] = useState<ModoCumplimientoPedido>('delivery')
  const [direccionId, setDireccionId] = useState('')
  const [direccionManual, setDireccionManual] = useState({ etiqueta: '', direccion: '', ubigeo: '', referencia: '' })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const estaGuardando = guardando || enviando

  useEffect(() => {
    if (!abierto) return
    // El operador debe elegir explícitamente el almacén de preparación.
    // Tomar la primera fila es inseguro cuando existen varios almacenes.
    setAlmacenId('')
    setFulfillmentMode('delivery')
    const direccionPrincipal = direccionesEntrega.find((direccion) => direccion.principal) ?? direccionesEntrega[0]
    setDireccionId(direccionPrincipal?.id ?? '__manual__')
    setDireccionManual({ etiqueta: '', direccion: '', ubigeo: '', referencia: '' })
    setError('')
    setEnviando(false)
  }, [abierto, cotizacion.id, direccionesEntrega])

  const opcionesAlmacenes: ComboboxOption[] = almacenes.map((almacen) => ({
    value: almacen.id,
    label: `${almacen.codigo} · ${almacen.nombre}`,
    secondaryText: almacen.direccion || 'Sin dirección registrada',
    keywords: [almacen.codigo, almacen.nombre, almacen.direccion],
    disabled: !almacen.activo,
  }))

  const opcionesDirecciones: ComboboxOption[] = [
    ...direccionesEntrega.map((direccion) => ({
      value: direccion.id ?? direccion.direccion,
      label: direccion.etiqueta || direccion.direccion,
      secondaryText: [direccion.direccion, direccion.ubigeo, direccion.referencia].filter(Boolean).join(' · '),
      keywords: [direccion.direccion, direccion.ubigeo, direccion.referencia],
    })),
    { value: '__manual__', label: 'Ingresar otra dirección', secondaryText: 'Guardar este destino en el pedido' },
  ]

  const guardar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!almacenId) {
      setError('Selecciona un almacén para el pedido')
      return
    }
    let direccion: DireccionEntregaPedido | undefined
    if (fulfillmentMode === 'delivery') {
      const seleccionada = direccionesEntrega.find((item) => (item.id ?? item.direccion) === direccionId)
      if (seleccionada) {
        direccion = {
          id: seleccionada.id,
          etiqueta: seleccionada.etiqueta,
          direccion: seleccionada.direccion,
          ubigeo: seleccionada.ubigeo,
          referencia: seleccionada.referencia,
        }
      } else {
        const direccionTexto = direccionManual.direccion.trim()
        const ubigeo = direccionManual.ubigeo.trim()
        const referencia = direccionManual.referencia.trim()
        if (direccionTexto.length < 3 || direccionTexto.length > 240) {
          setError('Ingresa una dirección de entrega de 3 a 240 caracteres')
          return
        }
        if (ubigeo && !/^\d{6}$/.test(ubigeo)) {
          setError('El ubigeo debe contener 6 dígitos')
          return
        }
        if (referencia.length > 200 || direccionManual.etiqueta.trim().length > 80) {
          setError('La etiqueta admite hasta 80 caracteres y la referencia hasta 200')
          return
        }
        direccion = { ...direccionManual, direccion: direccionTexto, ubigeo, referencia }
      }
    }
    setEnviando(true)
    try {
      const mensaje = await alConfirmar(almacenId, fulfillmentMode, direccion)
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
              <div>
                <label htmlFor="modalidad-cumplimiento-pedido" className="field-label">Modalidad de cumplimiento</label>
                <select
                  id="modalidad-cumplimiento-pedido"
                  value={fulfillmentMode}
                  onChange={(evento) => setFulfillmentMode(evento.target.value as ModoCumplimientoPedido)}
                  className="field-control"
                  disabled={estaGuardando}
                >
                  <option value="delivery">Entrega al cliente</option>
                  <option value="pickup">Recojo del cliente</option>
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fulfillmentMode === 'pickup'
                    ? 'No se generará una entrega en Distribución; el despacho confirmará el recojo.'
                    : 'El pedido quedará disponible para programar y seguir su entrega.'}
                </p>
              </div>
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
              {fulfillmentMode === 'delivery' ? (
                <div className="space-y-3 border-t pt-4">
                  <div>
                    <Combobox
                      id="direccion-entrega-pedido"
                      label="Dirección de entrega"
                      value={direccionId}
                      options={opcionesDirecciones}
                      onChange={(valor) => {
                        setDireccionId(valor)
                        setError('')
                      }}
                      placeholder="Buscar dirección…"
                      helperText="Se conservará en el pedido y se propondrá automáticamente en Distribución."
                      required
                      disabled={estaGuardando}
                      noOptionsMessage="No hay direcciones registradas. Ingresa una alternativa."
                    />
                  </div>
                  {direccionId === '__manual__' ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label htmlFor="direccion-entrega-pedido-texto" className="field-label">Dirección<span aria-hidden="true"> *</span></label>
                        <input id="direccion-entrega-pedido-texto" required minLength={3} maxLength={240} value={direccionManual.direccion} onChange={(evento) => { setDireccionManual({ ...direccionManual, direccion: evento.target.value }); setError('') }} className="field-control" placeholder="Ingresa el destino de esta entrega" disabled={estaGuardando} />
                      </div>
                      <div>
                        <label htmlFor="etiqueta-entrega-pedido" className="field-label">Nombre del destino</label>
                        <input id="etiqueta-entrega-pedido" maxLength={80} value={direccionManual.etiqueta} onChange={(evento) => { setDireccionManual({ ...direccionManual, etiqueta: evento.target.value }); setError('') }} className="field-control" placeholder="Ej. Sucursal San Isidro" disabled={estaGuardando} />
                      </div>
                      <div>
                        <label htmlFor="ubigeo-entrega-pedido" className="field-label">Ubigeo</label>
                        <input id="ubigeo-entrega-pedido" inputMode="numeric" maxLength={6} value={direccionManual.ubigeo} onChange={(evento) => { setDireccionManual({ ...direccionManual, ubigeo: evento.target.value.replace(/\D/g, '') }); setError('') }} className="field-control" placeholder="6 dígitos, opcional" disabled={estaGuardando} />
                      </div>
                      <div className="sm:col-span-2">
                        <label htmlFor="referencia-entrega-pedido" className="field-label">Indicaciones para llegar</label>
                        <input id="referencia-entrega-pedido" maxLength={200} value={direccionManual.referencia} onChange={(evento) => { setDireccionManual({ ...direccionManual, referencia: evento.target.value }); setError('') }} className="field-control" placeholder="Referencia opcional" disabled={estaGuardando} />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
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
