import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Producto } from '@/modulos/productos/modelo/producto'
import type { Proveedor } from '@/modulos/proveedores/modelo/proveedor'

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

const proveedor = {
  id: 'proveedor-1',
  organizationId: 'organizacion-1',
  codigo: 'PROV-001',
  tipoDocumento: 'ruc',
  numeroDocumento: '20523621212',
  razonSocial: 'LIMA EXPRESA S.A.C.',
  nombreComercial: 'Lima Expresa',
  contacto: 'Compras',
  cargoContacto: '',
  email: 'compras@example.com',
  telefono: '',
  direccion: '',
  ubigeo: '',
  estadoContribuyente: 'ACTIVO',
  condicionDomicilio: 'HABIDO',
  fuenteDatosFiscales: '',
  fechaConsultaSunat: null,
  condicionCredito: 'contado',
  diasCredito: 0,
  observaciones: '',
  activo: true,
  fechaRegistro: '2026-09-16T00:00:00.000Z',
  fechaActualizacion: '2026-09-16T00:00:00.000Z',
} satisfies Proveedor

describe('DialogoCompra', () => {
  it('inicia sin productos, permite buscarlos y muestra el error al retirarlos todos', async () => {
    render(
      <DialogoCompra
        abierto
        compra={null}
        proveedores={[proveedor]}
        productos={[producto]}
        almacenes={[]}
        alCambiarApertura={vi.fn()}
        alGuardar={vi.fn().mockResolvedValue(undefined)}
        alRestaurarFoco={vi.fn()}
      />,
    )

    expect(screen.getByText('No hay productos agregados')).toBeVisible()
    expect(screen.queryByRole('combobox', { name: 'Producto 1' })).not.toBeInTheDocument()

    expect(screen.getByRole('combobox', { name: 'Proveedor' })).toHaveValue(proveedor.razonSocial)
    fireEvent.focus(screen.getByRole('combobox', { name: 'Proveedor' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Proveedor' }), {
      target: { value: proveedor.numeroDocumento },
    })
    expect(screen.getByRole('option', { name: /LIMA EXPRESA/ })).toBeVisible()
    fireEvent.click(screen.getByRole('option', { name: /LIMA EXPRESA/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))

    expect(screen.getByRole('combobox', { name: 'Producto 1' })).toHaveValue('')
    fireEvent.focus(screen.getByRole('combobox', { name: 'Producto 1' }))
    expect(screen.getByRole('listbox', { name: 'Producto 1' })).toBeVisible()
    expect(screen.getByRole('option', { name: /PARA-500/ })).toBeVisible()

    fireEvent.change(screen.getByRole('combobox', { name: 'Producto 1' }), {
      target: { value: 'paracetamol' },
    })
    fireEvent.click(screen.getByRole('option', { name: /PARA-500/ }))
    expect(screen.getByText(/Producto físico \(recepción e inventario\)/)).toBeVisible()
    expect(screen.getByText('Cantidad (Unidad) *')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar producto 1' }))
    expect(screen.getByText('No hay productos agregados')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    expect(await screen.findByText('Agrega al menos un producto')).toBeVisible()
  })
})
