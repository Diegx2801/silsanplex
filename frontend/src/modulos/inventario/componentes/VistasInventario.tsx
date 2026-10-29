import { Link, useSearchParams } from 'react-router'

import { cn } from '@/lib/utils'

interface Props {
  etiqueta: string
  vista: string
  opciones: readonly { valor: string; etiqueta: string }[]
  className?: string
}

export function VistasInventario({ etiqueta, vista, opciones, className }: Props) {
  const [parametros] = useSearchParams()
  return (
    <nav aria-label={etiqueta} className={cn('flex flex-wrap gap-x-4 border-b', className)}>
      {opciones.map((opcion) => {
        const siguiente = new URLSearchParams(parametros)
        siguiente.set('vista', opcion.valor)
        return (
          <Link key={opcion.valor} to={`?${siguiente}`} aria-current={vista === opcion.valor ? 'page' : undefined}
            className={cn('border-b-2 px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              vista === opcion.valor ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {opcion.etiqueta}
          </Link>
        )
      })}
    </nav>
  )
}
