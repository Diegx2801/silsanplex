import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EstadoListadoInventario } from './EstadoListadoInventario'

describe('EstadoListadoInventario', () => {
  it('distingue loading de un resultado vacío', () => {
    const { rerender } = render(<EstadoListadoInventario cargando error={null} vacio mensajeVacio="Sin filas" alReintentar={vi.fn()}><p>Datos</p></EstadoListadoInventario>)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando')
    expect(screen.queryByText('Sin filas')).not.toBeInTheDocument()
    rerender(<EstadoListadoInventario cargando={false} error={null} vacio mensajeVacio="Sin filas" alReintentar={vi.fn()}><p>Datos</p></EstadoListadoInventario>)
    expect(screen.getByText('Sin filas')).toBeInTheDocument()
  })

  it('muestra el error y permite reintentar', () => {
    const reintentar = vi.fn()
    render(<EstadoListadoInventario cargando={false} error={new Error('Fallo Supabase')} vacio mensajeVacio="Sin filas" alReintentar={reintentar}><p>Datos</p></EstadoListadoInventario>)
    expect(screen.getByRole('alert')).toHaveTextContent('Fallo Supabase')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(reintentar).toHaveBeenCalledOnce()
  })
})
