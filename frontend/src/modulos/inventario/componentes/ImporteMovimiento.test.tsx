import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ImporteMovimiento } from './ImporteMovimiento'

describe('ImporteMovimiento', () => {
  it('destaca el total de entrada y conserva el costo por unidad base', () => {
    render(
      <ImporteMovimiento
        cantidadEntrada={200}
        valorEntrada={100}
        valorSalida={0}
        costoUnitario={0.5}
        unidadMedida="Unidad"
      />,
    )
    expect(screen.getByText(/100\.00/)).toBeVisible()
    expect(screen.getByText(/0\.50 por Unidad/)).toBeVisible()
  })
  it('muestra el total de salida sin confundir una bolsa con su equivalencia', () => {
    render(
      <ImporteMovimiento
        cantidadEntrada={0}
        valorEntrada={0}
        valorSalida={140}
        costoUnitario={7}
        unidadMedida="Caja"
      />,
    )
    expect(screen.getByText(/140\.00/)).toBeVisible()
    expect(screen.getByText(/7\.00 por Caja/)).toBeVisible()
  })
  it('respeta el valor contabilizado incluso si difiere del costo redondeado', () => {
    render(
      <ImporteMovimiento
        cantidadEntrada={3}
        valorEntrada={1}
        valorSalida={0}
        costoUnitario={0.3333}
        unidadMedida="Unidad"
      />,
    )
    expect(screen.getByText(/1\.00/)).toBeVisible()
  })
})
