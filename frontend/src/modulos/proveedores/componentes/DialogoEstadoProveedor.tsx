import { Dialog as DialogPrimitive } from 'radix-ui'
import { Button } from '@/components/ui/button'
import type { Proveedor } from '@/modulos/proveedores/modelo/proveedor'

interface Props { proveedor: Proveedor; procesando: boolean; error?: string; alConfirmar: () => Promise<void>; alCancelar: () => void }

export function DialogoEstadoProveedor({ proveedor, procesando, error, alConfirmar, alCancelar }: Props) {
  const activar = !proveedor.activo
  return <DialogPrimitive.Root open onOpenChange={(abierto) => { if (!abierto && !procesando) alCancelar() }}><DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/25" />
    <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border bg-background p-6 shadow-xl outline-none">
      <DialogPrimitive.Title className="text-xl font-semibold">{activar ? 'Activar proveedor' : 'Desactivar proveedor'}</DialogPrimitive.Title>
      <DialogPrimitive.Description className="mt-3 text-sm leading-6 text-muted-foreground">{activar ? `${proveedor.razonSocial} volverá a estar disponible para nuevas compras.` : `${proveedor.razonSocial} dejará de estar disponible para nuevas compras. Su historial se conservará.`}</DialogPrimitive.Description>
      {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : null}
      <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" disabled={procesando} onClick={alCancelar}>Cancelar</Button><Button type="button" disabled={procesando} onClick={() => void alConfirmar()}>{procesando ? 'Procesando…' : activar ? 'Activar' : 'Desactivar'}</Button></div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal></DialogPrimitive.Root>
}
