import { Button } from '@/components/ui/button'
import type { ReactNode } from 'react'

interface Props {
  cargando: boolean
  error: unknown
  vacio: boolean
  mensajeVacio: string
  alReintentar: () => void
  children: ReactNode
}

export function EstadoListadoInventario({
  cargando,
  error,
  vacio,
  mensajeVacio,
  alReintentar,
  children,
}: Props) {
  if (cargando) {
    return <p role="status" className="px-5 py-10 text-sm text-muted-foreground">Cargando registros…</p>
  }
  if (error) {
    return (
      <div role="alert" className="space-y-3 px-5 py-10 text-sm text-muted-foreground">
        <p>{error instanceof Error ? error.message : 'No se pudo cargar el listado.'}</p>
        <Button type="button" variant="outline" onClick={alReintentar}>Reintentar</Button>
      </div>
    )
  }
  if (vacio) {
    return <p className="px-5 py-10 text-sm text-muted-foreground">{mensajeVacio}</p>
  }
  return children
}
