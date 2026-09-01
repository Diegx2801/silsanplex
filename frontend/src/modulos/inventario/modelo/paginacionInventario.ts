export const tamaniosPaginaInventario = [25, 50, 100] as const

export type TamanioPaginaInventario = (typeof tamaniosPaginaInventario)[number]

export interface ConsultaPaginadaInventario {
  pagina: number
  tamanioPagina: TamanioPaginaInventario
}

export interface ResultadoPaginadoInventario<T> {
  elementos: T[]
  pagina: number
  tamanioPagina: number
  total: number
  totalPaginas: number
}

export function normalizarPaginacion(consulta: ConsultaPaginadaInventario) {
  const pagina = Number.isFinite(consulta.pagina)
    ? Math.max(1, Math.trunc(consulta.pagina))
    : 1
  const tamanioPagina = tamaniosPaginaInventario.includes(consulta.tamanioPagina)
    ? consulta.tamanioPagina
    : 25
  const desde = (pagina - 1) * tamanioPagina

  return {
    pagina,
    tamanioPagina,
    desde,
    hasta: desde + tamanioPagina - 1,
  }
}

export function crearResultadoPaginado<T>(
  elementos: T[],
  total: number | null,
  consulta: ConsultaPaginadaInventario,
): ResultadoPaginadoInventario<T> {
  const { pagina, tamanioPagina } = normalizarPaginacion(consulta)
  const totalSeguro = Math.max(0, total ?? 0)

  return {
    elementos,
    pagina,
    tamanioPagina,
    total: totalSeguro,
    totalPaginas: Math.max(1, Math.ceil(totalSeguro / tamanioPagina)),
  }
}

export function normalizarBusquedaInventario(valor: string) {
  return valor
    .trim()
    .replace(/[\\%_(),*]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 100)
}
