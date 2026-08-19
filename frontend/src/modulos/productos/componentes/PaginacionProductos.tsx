import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface PaginacionProductosProps {
  inicio: number
  fin: number
  totalFiltrado: number
  total: number
  pagina: number
  totalPaginas: number
  tamanioPagina: number
  alCambiarPagina: (pagina: number) => void
  alCambiarTamanio: (tamanio: number) => void
}

export function PaginacionProductos({
  inicio,
  fin,
  totalFiltrado,
  total,
  pagina,
  totalPaginas,
  tamanioPagina,
  alCambiarPagina,
  alCambiarTamanio,
}: PaginacionProductosProps) {
  return (
    <div className="flex flex-col gap-4 border-t px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
      <p className="text-sm text-muted-foreground">
        Mostrando <span className="font-medium text-foreground">{inicio}–{fin}</span>{' '}
        de <span className="font-medium text-foreground">{totalFiltrado}</span>{' '}
        coincidencias
        {totalFiltrado !== total ? ` · ${total} en total` : ''}
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center justify-between gap-3 text-sm text-muted-foreground sm:justify-start">
          Filas por página
          <select
            value={tamanioPagina}
            onChange={(evento) => alCambiarTamanio(Number(evento.target.value))}
            className="field-control min-h-9 w-20 py-1"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </label>

        <nav
          aria-label="Paginación del catálogo"
          className="flex items-center justify-between gap-2 sm:justify-start"
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Ir a la página anterior"
            disabled={pagina <= 1}
            onClick={() => alCambiarPagina(pagina - 1)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span className="min-w-24 text-center font-mono text-xs tabular-nums text-muted-foreground">
            PÁGINA {pagina} / {totalPaginas}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Ir a la página siguiente"
            disabled={pagina >= totalPaginas}
            onClick={() => alCambiarPagina(pagina + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      </div>
    </div>
  )
}
