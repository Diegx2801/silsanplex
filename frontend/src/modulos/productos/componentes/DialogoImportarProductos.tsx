import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { ImportarProductosPage } from '@/app/paginas/ImportarProductosPage'

interface Props {
  abierto: boolean
  alCambiarApertura: (abierto: boolean) => void
  alCompletar: () => void
  alRestaurarFoco: () => void
}

export function DialogoImportarProductos({ abierto, alCambiarApertura, alCompletar, alRestaurarFoco }: Props) {
  return <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
      <DialogPrimitive.Content
        className="fixed start-1/2 top-1/2 z-50 flex max-h-[92svh] w-[calc(100%-2rem)] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background shadow-xl outline-none"
        onCloseAutoFocus={(evento) => { evento.preventDefault(); alRestaurarFoco() }}
      >
        <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
          <div><DialogPrimitive.Title className="text-xl font-semibold">Importar productos</DialogPrimitive.Title><DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">Revisa los dos archivos de Codeplex antes de incorporarlos al catálogo.</DialogPrimitive.Description></div>
          <DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar importación" className="grid size-9 place-items-center rounded-md hover:bg-muted"><X aria-hidden="true" className="size-5" /></button></DialogPrimitive.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          <ImportarProductosPage integrado alCompletar={alCompletar} alCerrar={() => alCambiarApertura(false)} />
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}
