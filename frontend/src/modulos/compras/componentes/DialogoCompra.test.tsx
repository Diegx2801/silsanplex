import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Producto } from '@/modulos/productos/modelo/producto'

import { DialogoCompra } from './DialogoCompra'

const producto = {
  id: 'producto-1',
  codigo: 'PARA-500',
  descripcion: 'Paracetamol 500 mg',
  descripcionAmpliada: '',
  codigoBarras: '',
  categoria: '',
  sublinea: '',
  laboratorio: '',
  presentacion: 'Caja',
  tipo: 'good',
  unidadBaseId: '11111111-1111-4111-8111-111111111111',
  unidadMedida: 'Unidad',
  afectacionIgv: 'gravado',
  precioVenta: '15',
  precioMinimo: '',
  stockMaximo: '',
  anchoCm: '',
  altoCm: '',
  largoCm: '',
  pesoKg: '',
  registroSanitario: '',
  controlLote: true,
  controlVencimiento: true,
  serialControl: false,
  ventaReceta: false,
  activo: true,
  unidadesAlternativas: [],
} satisfies Producto

describe('DialogoCompra', () => {
  it('inicia sin productos y exige agregarlos explícitamente', async () => {
    render(
      <DialogoCompra
        abierto
        compra={null}
        proveedores={[]}
        productos={[producto]}
        almacenes={[]}
        alCambiarApertura={vi.fn()}
        alGuardar={vi.fn().mockResolvedValue(undefined)}
        alRestaurarFoco={vi.fn()}
      />,
    )

    expect(screen.getByText('No hay productos agregados')).toBeVisible()
    expect(screen.queryByRole('combobox', { name: 'Producto 1' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))

    expect(screen.getByRole('combobox', { name: 'Producto 1' })).toHaveValue('')
    expect(screen.getByRole('option', { name: 'Seleccionar producto' })).toBeVisible()

    fireEvent.change(screen.getByRole('combobox', { name: 'Producto 1' }), {
      target: { value: producto.id },
    })
    expect(screen.getByText(/Unidad: Unidad/)).toBeVisible()
    expect(screen.getByText('Cantidad (Unidad) *')).toBeVisible()

    fireEvent.change(screen.getByRole('combobox', { name: 'Producto 1' }), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    expect(await screen.findByText('Selecciona un producto')).toBeVisible()
  })
})
