import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PaginacionInventario } from './PaginacionInventario'

describe('PaginacionInventario', () => {
  it('navega y cambia entre tamaños 25, 50 y 100', () => {
    const cambiarPagina = vi.fn()
    const cambiarTamanio = vi.fn()
    render(<PaginacionInventario etiqueta="existencias" pagina={2} tamanioPagina={25} total={80} totalPaginas={4} cantidadVisible={25} alCambiarPagina={cambiarPagina} alCambiarTamanio={cambiarTamanio} />)
    fireEvent.click(screen.getByRole('button', { name: 'Página anterior de existencias' }))
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente de existencias' }))
    fireEvent.change(screen.getByLabelText('Filas por página de existencias'), { target: { value: '100' } })
    expect(cambiarPagina).toHaveBeenNthCalledWith(1, 1)
    expect(cambiarPagina).toHaveBeenNthCalledWith(2, 3)
    expect(cambiarTamanio).toHaveBeenCalledWith(100)
  })

  it('expone loading y bloquea solicitudes repetidas durante un cambio', () => {
    render(<PaginacionInventario etiqueta="Kardex" pagina={2} tamanioPagina={25} total={80} totalPaginas={4} cantidadVisible={25} cargando alCambiarPagina={vi.fn()} alCambiarTamanio={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Actualizando')
    expect(screen.getByRole('button', { name: 'Página anterior de Kardex' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Página siguiente de Kardex' })).toBeDisabled()
  })
})
