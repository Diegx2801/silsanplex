import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SelectorFiltrable } from './SelectorFiltrable'

const opciones = [
  { id: 'producto-1', etiqueta: 'PAR-500 · Paracetamol 500 mg', textoBusqueda: '7751234567890' },
  { id: 'producto-2', etiqueta: 'IBU-400 · Ibuprofeno 400 mg', textoBusqueda: '7759876543210' },
]

describe('SelectorFiltrable', () => {
  it('filtra por descripción y código de barras sin perder el valor de formulario', () => {
    render(<SelectorFiltrable id="producto" name="productoId" etiqueta="Producto" opciones={opciones} />)

    const busqueda = screen.getByRole('searchbox', { name: 'Buscar producto' })
    fireEvent.change(busqueda, { target: { value: '7759876543210' } })

    const selector = screen.getByRole('combobox', { name: 'Producto' })
    expect(selector).toHaveTextContent('IBU-400 · Ibuprofeno 400 mg')
    fireEvent.change(selector, { target: { value: 'producto-2' } })
    expect(selector).toHaveValue('producto-2')
    expect(screen.getByText('1 de 2 opciones mostradas')).toBeVisible()
  })

  it('explica cuando el catálogo no tiene opciones disponibles', () => {
    render(<SelectorFiltrable id="producto" name="productoId" etiqueta="Producto" opciones={[]} />)

    expect(screen.getByRole('combobox', { name: 'Producto' })).toBeDisabled()
    expect(screen.getByText('No hay productos disponibles')).toBeVisible()
  })
})
