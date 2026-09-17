import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Producto } from '@/modulos/productos/modelo/producto'
import type { Proveedor } from '@/modulos/proveedores/modelo/proveedor'
import type { Almacen } from '@/modulos/inventario/modelo/almacen'

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

const productoSinAfectacion = {
  ...producto,
  id: 'producto-pendiente',
  codigo: 'PEND-001',
  descripcion: 'Producto pendiente de clasificación',
  afectacionIgv: '',
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

const almacen = {
  id: 'almacen-1', codigo: 'CENTRAL', nombre: 'Almacén central', direccion: 'Av. Principal 100', activo: true,
} satisfies Almacen

describe('DialogoCompra', () => {
  it('marca los campos de selección requeridos al guardar el borrador inicial', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    expect(await screen.findByText('Selecciona un proveedor')).toBeVisible()
    expect(await screen.findByText('Selecciona un producto')).toBeVisible()
    expect(await screen.findByText('Selecciona un almacén válido')).toBeVisible()
  })

  it('inicia con una línea vacía, permite buscar el producto y conserva la línea mínima', async () => {
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

    expect(screen.queryByText('No hay productos agregados')).not.toBeInTheDocument()
    expect(screen.queryByText('Falta definir la afectación de IGV.')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Producto 1' })).toHaveValue('')

    expect(screen.getByRole('combobox', { name: 'Proveedor' })).toHaveValue('')
    fireEvent.focus(screen.getByRole('combobox', { name: 'Proveedor' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Proveedor' }), {
      target: { value: proveedor.numeroDocumento },
    })
    expect(screen.getByRole('option', { name: /LIMA EXPRESA/ })).toBeVisible()
    fireEvent.click(screen.getByRole('option', { name: /LIMA EXPRESA/ }))

    fireEvent.focus(screen.getByRole('combobox', { name: 'Producto 1' }))
    expect(screen.getByRole('listbox', { name: 'Producto 1' })).toBeVisible()
    expect(screen.getByRole('option', { name: /PARA-500/ })).toBeVisible()

    fireEvent.change(screen.getByRole('combobox', { name: 'Producto 1' }), {
      target: { value: 'paracetamol' },
    })
    fireEvent.click(screen.getByRole('option', { name: /PARA-500/ }))
    expect(screen.getByText(/Producto físico \(recepción e inventario\)/)).toBeVisible()
    expect(screen.getByText('Cantidad (Unidad) *')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Quitar producto 1' })).toBeDisabled()
  })

  it('exige seleccionar explícitamente el almacén y permite buscarlo por dirección', () => {
    render(
      <DialogoCompra
        abierto
        compra={null}
        proveedores={[proveedor]}
        productos={[producto]}
        almacenes={[almacen]}
        alCambiarApertura={vi.fn()}
        alGuardar={vi.fn().mockResolvedValue(undefined)}
        alRestaurarFoco={vi.fn()}
      />,
    )

    const control = screen.getByRole('combobox', { name: 'Almacén de recepción' })
    expect(control).toHaveValue('')
    fireEvent.focus(control)
    fireEvent.change(control, { target: { value: 'principal 100' } })
    fireEvent.click(screen.getByRole('option', { name: /CENTRAL · Almacén central/ }))

    expect(control).toHaveValue('CENTRAL · Almacén central')
  })

  it('identifica el producto cuya afectación de IGV debe completarse', async () => {
    render(
      <DialogoCompra
        abierto
        compra={null}
        proveedores={[proveedor]}
        productos={[productoSinAfectacion]}
        almacenes={[]}
        alCambiarApertura={vi.fn()}
        alGuardar={vi.fn().mockResolvedValue(undefined)}
        alRestaurarFoco={vi.fn()}
      />,
    )

    fireEvent.focus(screen.getByRole('combobox', { name: 'Producto 1' }))
    fireEvent.click(screen.getByRole('option', { name: /PEND-001/ }))

    expect(screen.getByRole('status')).toHaveTextContent('Producto pendiente de clasificación')
    expect(screen.getByText(/la emisión de la orden quedará bloqueada/i)).toBeVisible()
  })
})
