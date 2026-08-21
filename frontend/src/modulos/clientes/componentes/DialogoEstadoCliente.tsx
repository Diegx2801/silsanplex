import { Dialog as DialogPrimitive } from 'radix-ui'
import { Button } from '@/components/ui/button'
import type { Cliente } from '@/modulos/clientes/modelo/cliente'

interface Props {
  cliente: Cliente
  procesando: boolean
  alConfirmar: () => Promise<void>
  alCancelar: () => void
}

export function DialogoEstadoCliente({ cliente, procesando, alConfirmar, alCancelar }: Props) {
  const activating = !cliente.activo
  return <DialogPrimitive.Root open onOpenChange={(open) => { if (!open && !procesando) alCancelar() }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
      <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border bg-background p-6 shadow-xl outline-none">
        <DialogPrimitive.Title className="text-xl font-semibold">{activating ? 'Activar cliente' : 'Desactivar cliente'}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="mt-3 text-sm text-muted-foreground">
          {activating
            ? `${cliente.nombreRazonSocial} volverá a estar disponible para nuevas operaciones comerciales.`
            : `${cliente.nombreRazonSocial} dejará de estar disponible para nuevas operaciones. Su historial se conservará.`}
        </DialogPrimitive.Description>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={procesando} onClick={alCancelar}>Cancelar</Button>
          <Button type="button" disabled={procesando} onClick={() => void alConfirmar()}>{procesando ? 'Procesando…' : activating ? 'Activar' : 'Desactivar'}</Button>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}
