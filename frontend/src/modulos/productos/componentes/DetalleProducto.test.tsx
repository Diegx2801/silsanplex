import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DetalleProducto } from './DetalleProducto'
import { DialogoConfirmacionEstado } from './DialogoConfirmacionEstado'
import { productoInicial, type Producto } from '../modelo/producto'

const producto = {
  ...productoInicial,
  id: 'producto-1',
  codigo: 'MED-001',
  descripcion: 'Paracetamol 500 mg',
  codigoBarras: '7751234567890',
  categoria: 'Analgésicos',
  laboratorio: 'Laboratorio Central',
  presentacion: 'Caja x 20 tabletas',
  unidadMedida: 'Caja',
  afectacionIgv: 'gravado',
  precioVenta: '12.50',
  registroSanitario: 'RS-12345',
  controlLote: true,
  ventaReceta: false,
  activo: true,
} satisfies Producto

afterEach(cleanup)

describe('DetalleProducto', () => {
  it('presenta la ficha completa con valores comerciales y operativos', () => {
    render(
      <DetalleProducto
        abierto
        producto={producto}
        alCambiarApertura={vi.fn()}
        alEditar={vi.fn()}
        alSolicitarCambioEstado={vi.fn()}
        alRestaurarFoco={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Paracetamol 500 mg' }),
    ).toBeInTheDocument()
    expect(screen.getByText('7751234567890')).toBeInTheDocument()
    expect(screen.getByText('Laboratorio Central')).toBeInTheDocument()
    expect(screen.getByText(/S\/\s*12[.,]50/)).toBeInTheDocument()
    expect(screen.getByText('Gravado')).toBeInTheDocument()
    expect(screen.getByText('RS-12345')).toBeInTheDocument()
    expect(
      screen.getByText(/preparado para registrar lotes/i),
    ).toBeInTheDocument()
  })

  it('expone las acciones de edición y cambio de estado', () => {
    const alEditar = vi.fn()
    const alSolicitarCambioEstado = vi.fn()

    render(
      <DetalleProducto
        abierto
        producto={producto}
        alCambiarApertura={vi.fn()}
        alEditar={alEditar}
        alSolicitarCambioEstado={alSolicitarCambioEstado}
        alRestaurarFoco={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }))

    expect(alEditar).toHaveBeenCalledOnce()
    expect(alSolicitarCambioEstado).toHaveBeenCalledOnce()
  })
})

describe('DialogoConfirmacionEstado', () => {
  it('explica la desactivación y solo ejecuta el cambio al confirmar', () => {
    const alConfirmar = vi.fn()

    render(
      <DialogoConfirmacionEstado
        abierto
        producto={producto}
        alCambiarApertura={vi.fn()}
        alConfirmar={alConfirmar}
        alRestaurarFoco={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Desactivar producto' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/información permanecerá registrada/i),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Desactivar producto' }),
    )

    expect(alConfirmar).toHaveBeenCalledOnce()
  })

  it('adapta el mensaje y la acción para un producto inactivo', () => {
    render(
      <DialogoConfirmacionEstado
        abierto
        producto={{ ...producto, activo: false }}
        alCambiarApertura={vi.fn()}
        alConfirmar={vi.fn()}
        alRestaurarFoco={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Activar producto' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/volverá a estar disponible/i),
    ).toBeInTheDocument()
  })
})
