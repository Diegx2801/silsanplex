import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CantidadMovimiento } from './CantidadMovimiento'

describe('CantidadMovimiento', () => {
  it('muestra las cajas capturadas y la equivalencia histórica en unidad base', () => {
    render(<CantidadMovimiento cantidad={200} unidadMedida="Unidad" cantidadCapturada={10} unidadCapturada="Caja" factorConversion={20} signo="+" />)
    expect(screen.getByText(/\+10/)).toHaveTextContent('+10 Caja')
    expect(screen.getByText('Equivale a 200 Unidad')).toBeVisible()
  })

  it('no repite la equivalencia si se capturó directamente en unidad base', () => {
    render(<CantidadMovimiento cantidad={200} unidadMedida="Unidad" cantidadCapturada={200} unidadCapturada="Unidad" factorConversion={1} signo="+" />)
    expect(screen.getByText(/\+200/)).toHaveTextContent('+200 Unidad')
    expect(screen.queryByText(/Equivale a/)).not.toBeInTheDocument()
  })

  it('no inventa una conversión para movimientos antiguos sin captura', () => {
    render(<CantidadMovimiento cantidad={200} unidadMedida="Unidad" />)
    expect(screen.getByText('200', { exact: false })).toHaveTextContent('200 Unidad')
    expect(screen.queryByText(/Equivale a/)).not.toBeInTheDocument()
  })

  it('conserva fracciones de la unidad capturada en salidas repartidas por FEFO', () => {
    render(<CantidadMovimiento cantidad={5} unidadMedida="Unidad" cantidadCapturada={0.25} unidadCapturada="Caja" factorConversion={20} signo="−" />)
    expect(screen.getByText(/−0.25/)).toHaveTextContent('−0.25 Caja')
    expect(screen.getByText('Equivale a 5 Unidad')).toBeVisible()
  })

  it('no depende de la conversión actual del catálogo', () => {
    render(<CantidadMovimiento cantidad={200} unidadMedida="Unidad" cantidadCapturada={10} unidadCapturada="Caja histórica" factorConversion={20} />)
    expect(screen.getByText('Caja histórica')).toBeVisible()
    expect(screen.getByText('Equivale a 200 Unidad')).toBeVisible()
  })

  it('ignora capturas incompletas o inválidas', () => {
    render(<CantidadMovimiento cantidad={200} unidadMedida="Unidad" cantidadCapturada={10} unidadCapturada="Caja" factorConversion={0} />)
    expect(screen.queryByText('Caja')).not.toBeInTheDocument()
    expect(screen.queryByText(/Equivale a/)).not.toBeInTheDocument()
  })
})
