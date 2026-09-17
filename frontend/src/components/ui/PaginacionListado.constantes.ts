export const tamaniosPaginaListado = [10, 25, 50] as const

export type TamanioPaginaListado = (typeof tamaniosPaginaListado)[number]
