import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { UserAccessSelector } from '@/features/users/UserAccessSelector'

describe('UserAccessSelector', () => {
  it('concentra las causas de una dependencia fuera de la línea de controles', () => {
    render(
      <UserAccessSelector
        selectedPermissions={['PURCHASES_VIEW', 'SALES_VIEW', 'DISTRIBUTION_VIEW']}
        onChange={vi.fn()}
      />,
    )

    const productsView = screen.getByLabelText('Productos: Consultar')
    expect(productsView).toBeChecked()
    expect(productsView).toBeDisabled()
    expect(screen.getAllByText('Compras, Ventas, Distribución.').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Incluido por/)).not.toBeInTheDocument()
  })

  it('no presenta una capacidad del mismo módulo como si fuera una dependencia externa', () => {
    render(
      <UserAccessSelector
        selectedPermissions={['PRODUCTS_MANAGE']}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Productos: Consultar')).toBeDisabled()
    expect(screen.queryByText('Usado por:')).not.toBeInTheDocument()
    expect(
      screen.getByText('Incluido por otra capacidad seleccionada en este módulo.').closest('p'),
    ).toHaveClass('sr-only')
  })

  it('informa solo la selección principal cuando el usuario marca un proceso', () => {
    const onChange = vi.fn()
    render(<UserAccessSelector selectedPermissions={[]} onChange={onChange} />)

    fireEvent.click(screen.getByLabelText('Ventas: Consultar'))

    expect(onChange).toHaveBeenCalledWith(['SALES_VIEW'])
  })
})
