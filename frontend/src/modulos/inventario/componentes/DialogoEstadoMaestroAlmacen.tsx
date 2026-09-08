import { CirclePower, TriangleAlert } from 'lucide-react'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { Almacen, UbicacionAlmacen } from '@/modulos/inventario/modelo/almacen'

type ObjetivoEstado =
  | { tipo: 'almacen'; registro: Almacen }
  | { tipo: 'ubicacion'; registro: UbicacionAlmacen; almacenNombre: string }

interface Props {
  objetivo: ObjetivoEstado
  alConfirmar: () => Promise<string | undefined>
  alCancelar: () => void
  alRestaurarFoco: () => void
}

export function DialogoEstadoMaestroAlmacen({
  objetivo,
  alConfirmar,
  alCancelar,
  alRestaurarFoco,
}: Props) {
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const registroActivo = objetivo.tipo === 'almacen' ? objetivo.registro.activo : objetivo.registro.activa
  const seDesactivara = registroActivo
  const entidad = objetivo.tipo === 'almacen' ? 'almacén' : 'ubicación'
  const nombre = objetivo.registro.nombre

  async function confirmar() {
    setProcesando(true)
    setError('')
    const resultado = await alConfirmar()
    setProcesando(false)
    if (resultado) {
      setError(resultado)
      return
    }
    alCancelar()
  }

  return (
    <AlertDialogPrimitive.Root
      open
      onOpenChange={(abierto) => {
        if (!abierto && !procesando) alCancelar()
      }}
    >
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-60 bg-foreground/30" />
        <AlertDialogPrimitive.Content
          className="fixed start-1/2 top-1/2 z-70 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border bg-background p-5 shadow-xl outline-none sm:p-6"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <div className={`grid size-10 place-items-center rounded-full ${seDesactivara ? 'bg-destructive/10 text-destructive' : 'bg-accent text-primary'}`}>
            {seDesactivara
              ? <TriangleAlert aria-hidden="true" className="size-5" />
              : <CirclePower aria-hidden="true" className="size-5" />}
          </div>
          <AlertDialogPrimitive.Title className="mt-5 text-xl font-semibold">
            {seDesactivara ? 'Desactivar' : 'Activar'} {entidad}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">
            <strong className="font-medium text-foreground">{nombre}</strong>{' '}
            {seDesactivara
              ? `dejará de estar disponible para nuevas operaciones. Su historial se conservará.`
              : `volverá a estar disponible para las operaciones permitidas.`}
            {objetivo.tipo === 'ubicacion' ? ` Pertenece a ${objetivo.almacenNombre}.` : ''}
          </AlertDialogPrimitive.Description>
          {seDesactivara ? (
            <p className="mt-3 text-sm text-muted-foreground">
              El sistema impedirá el cambio si existen existencias, reservas o dependencias operativas pendientes.
            </p>
          ) : null}
          {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : null}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel asChild>
              <Button type="button" variant="outline" disabled={procesando}>Cancelar</Button>
            </AlertDialogPrimitive.Cancel>
            <Button
              type="button"
              variant={seDesactivara ? 'destructive' : 'default'}
              disabled={procesando}
              onClick={() => void confirmar()}
            >
              {procesando ? 'Procesando…' : `${seDesactivara ? 'Desactivar' : 'Activar'} ${entidad}`}
            </Button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}

export type { ObjetivoEstado }
