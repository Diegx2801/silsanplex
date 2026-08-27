import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface PaginacionReparacionesProps {
  inicio: number
  fin: number
  total: number
  pagina: number
  totalPaginas: number
  alCambiarPagina: (pagina: number) => void
}

export function PaginacionReparaciones({
  inicio,
  fin,
  total,
  pagina,
  totalPaginas,
  alCambiarPagina,
}: PaginacionReparacionesProps) {
  return (
    <footer className="flex flex-col gap-3 border-t px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className="text-muted-foreground">
        {total ? `${inicio}–${fin} de ${total}` : 'Sin registros'}
      </p>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="font-mono text-xs text-muted-foreground">
          Página {pagina} de {totalPaginas}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={pagina <= 1}
            aria-label="Página anterior"
            onClick={() => alCambiarPagina(pagina - 1)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={pagina >= totalPaginas}
            aria-label="Página siguiente"
            onClick={() => alCambiarPagina(pagina + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </footer>
  )
}
