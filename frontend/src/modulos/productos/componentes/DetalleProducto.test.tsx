import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const detalleMock = vi.hoisted(() => ({
  archivos: [] as Array<Record<string, unknown>>,
  versiones: [] as Array<Record<string, unknown>>,
  organizarImagenes: vi.fn(),
  retirarArchivo: vi.fn(),
  subirArchivo: vi.fn(),
}))

vi.mock('@/modulos/productos/estado/useProductoDetalle', () => ({
  useProductoDetalle: () => ({
    archivos: detalleMock.archivos,
    cargandoDetalle: false,
    errorDetalle: null,
    subiendoArchivo: false,
    retirandoArchivo: false,
    guardandoArchivo: false,
    subirArchivo: detalleMock.subirArchivo,
    retirarArchivo: detalleMock.retirarArchivo,
    actualizarDescripcion: vi.fn(),
    organizarImagenes: detalleMock.organizarImagenes,
  }),
}))

import { DetalleProducto } from './DetalleProducto'
import { GestorImagenesProducto } from './GestorImagenesProducto'
import { DialogoConfirmacionEstado } from './DialogoConfirmacionEstado'
import { productoInicial, type Producto } from '../modelo/producto'

const producto = {
  ...productoInicial,
  id: 'producto-1',
  codigo: 'MED-001',
  descripcion: 'Paracetamol 500 mg',
  codigoBarras: '7751234567890',
  categoria: 'Analgésicos',
  sublinea: 'Analgésicos adultos',
  laboratorio: 'Laboratorio Central',
  presentacion: 'Caja x 20 tabletas',
  unidadMedida: 'Caja',
  afectacionIgv: 'gravado',
  costo: '5.50',
  precioVenta: '12.50',
  precioMinimo: '10.00',
  stockMaximo: '500',
  anchoCm: '10',
  altoCm: '20',
  largoCm: '30',
  pesoKg: '0.5',
  registroSanitario: 'RS-12345',
  controlLote: true,
  ventaReceta: false,
  activo: true,
} satisfies Producto

beforeEach(() => {
  detalleMock.archivos = []
  detalleMock.versiones = []
  detalleMock.organizarImagenes.mockReset()
  detalleMock.retirarArchivo.mockReset()
  detalleMock.subirArchivo.mockReset()
})

afterEach(cleanup)

describe('DetalleProducto', () => {
  it('presenta la ficha operativa del SKU sin mezclar datos de compras o almacén', () => {
    render(
      <DetalleProducto
        abierto
        producto={producto}
        alCambiarApertura={vi.fn()}
        alRestaurarFoco={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Paracetamol 500 mg' }),
    ).toBeInTheDocument()
    expect(screen.getByText('7751234567890')).toBeInTheDocument()
    expect(screen.getByText('Laboratorio Central')).toBeInTheDocument()
    expect(screen.getByText('Analgésicos adultos')).toBeInTheDocument()
    expect(screen.getByText(/S\/\s*12[.,]50/)).toBeInTheDocument()
    expect(screen.getByText('Gravado')).toBeInTheDocument()
    expect(screen.getByText('RS-12345')).toBeInTheDocument()
    expect(screen.getByText(/se administran en Inventario/i)).toBeInTheDocument()
    expect(screen.queryByText('Costo base')).not.toBeInTheDocument()
    expect(screen.queryByText('Stock máximo global')).not.toBeInTheDocument()
  })

  it('mantiene la consulta separada de las acciones de administración', () => {
    render(
      <DetalleProducto
        abierto
        producto={producto}
        alCambiarApertura={vi.fn()}
        alRestaurarFoco={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nueva imagen')).not.toBeInTheDocument()
  })

  it('muestra las imágenes sin controles de modificación', () => {
    detalleMock.archivos = [
      {
        id: 'imagen-1',
        ruta: 'org-1/producto-1/uno.webp',
        tipo: 'image',
        nombre: 'uno.webp',
        mimeType: 'image/webp',
        bytes: 100,
        descripcion: 'Vista frontal',
        principal: true,
        orden: 0,
        creadoEn: '2026-08-25T10:00:00.000Z',
        url: 'https://storage.test/uno.webp',
      },
      {
        id: 'imagen-2',
        ruta: 'org-1/producto-1/dos.webp',
        tipo: 'image',
        nombre: 'dos.webp',
        mimeType: 'image/webp',
        bytes: 100,
        descripcion: 'Vista lateral',
        principal: false,
        orden: 1,
        creadoEn: '2026-08-25T10:01:00.000Z',
        url: 'https://storage.test/dos.webp',
      },
    ]
    render(
      <DetalleProducto
        abierto
        producto={producto}
        alCambiarApertura={vi.fn()}
        alRestaurarFoco={vi.fn()}
      />,
    )
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /imagen principal/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retirar/i })).not.toBeInTheDocument()
  })
})

describe('GestorImagenesProducto', () => {
  it('concentra la administración de imágenes en la edición', async () => {
    detalleMock.archivos = [{
      id: 'imagen-1', ruta: 'org/producto/uno.webp', tipo: 'image', nombre: 'uno.webp',
      mimeType: 'image/webp', bytes: 100, descripcion: '', principal: false,
      orden: 0, creadoEn: '2026-08-25T10:00:00.000Z', url: 'https://storage.test/uno.webp',
    }]
    detalleMock.subirArchivo.mockResolvedValue(undefined)
    render(<GestorImagenesProducto producto={producto} />)

    expect(screen.getByRole('button', { name: 'Usar uno.webp como imagen principal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retirar uno.webp' })).toBeInTheDocument()
    expect(screen.getByText('Seleccionar imagen')).toBeInTheDocument()
  })
})

describe('DialogoConfirmacionEstado', () => {
  it('explica la desactivación y solo ejecuta el cambio al confirmar', () => {
    const alConfirmar = vi.fn()

    render(
      <DialogoConfirmacionEstado
        abierto
        producto={producto}
        cambiandoEstado={false}
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
        cambiandoEstado={false}
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

  it('deshabilita la confirmación mientras cambia el estado', () => {
    render(
      <DialogoConfirmacionEstado
        abierto
        producto={producto}
        cambiandoEstado
        alCambiarApertura={vi.fn()}
        alConfirmar={vi.fn()}
        alRestaurarFoco={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Desactivar producto' }),
    ).toBeDisabled()
  })
})
