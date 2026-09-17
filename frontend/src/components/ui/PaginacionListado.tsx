import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { tamaniosPaginaListado, type TamanioPaginaListado } from './PaginacionListado.constantes'

export type { TamanioPaginaListado } from './PaginacionListado.constantes'

interface PaginacionListadoProps {
  etiqueta: string
  pagina: number
  tamanioPagina: TamanioPaginaListado
  total: number
  totalPaginas: number
  cantidadVisible: number
  cargando?: boolean
  alCambiarPagina: (pagina: number) => void
  alCambiarTamanio: (tamanio: TamanioPaginaListado) => void
}

export function PaginacionListado({
  etiqueta,
  pagina,
  tamanioPagina,
  total,
  totalPaginas,
  cantidadVisible,
  cargando = false,
  alCambiarPagina,
  alCambiarTamanio,
}: PaginacionListadoProps) {
  const inicio = cantidadVisible ? (pagina - 1) * tamanioPagina + 1 : 0
  const fin = cantidadVisible ? inicio + cantidadVisible - 1 : 0

  return (
    <div className="flex flex-col gap-4 border-t px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
      <p className="text-sm text-muted-foreground">
        Mostrando <span className="font-medium text-foreground">{inicio}–{fin}</span>{' '}
        de <span className="font-medium text-foreground">{total}</span> registros
        {cargando ? <span role="status"> · Actualizando…</span> : null}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-3 text-sm text-muted-foreground">
          Filas por página
          <select
            aria-label={`Filas por página de ${etiqueta}`}
            value={tamanioPagina}
            disabled={cargando}
            onChange={(evento) =>
              alCambiarTamanio(Number(evento.target.value) as TamanioPaginaListado)
            }
            className="field-control min-h-9 w-20 py-1"
          >
            {tamaniosPaginaListado.map((tamanio) => (
              <option key={tamanio} value={tamanio}>{tamanio}</option>
            ))}
          </select>
        </label>
        <nav aria-label={`Paginación de ${etiqueta}`} className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Página anterior de ${etiqueta}`}
            disabled={cargando || pagina <= 1}
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
            aria-label={`Página siguiente de ${etiqueta}`}
            disabled={cargando || pagina >= totalPaginas}
            onClick={() => alCambiarPagina(pagina + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      </div>
    </div>
  )
}
