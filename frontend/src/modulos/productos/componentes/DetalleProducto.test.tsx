import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const detalleMock = vi.hoisted(() => ({
  archivos: [] as Array<Record<string, unknown>>,
  versiones: [] as Array<Record<string, unknown>>,
  organizarImagenes: vi.fn(),
  retirarArchivo: vi.fn(),
}))

vi.mock('@/modulos/productos/estado/useProductoDetalle', () => ({
  useProductoDetalle: () => ({
    archivos: detalleMock.archivos,
    cargandoDetalle: false,
    errorDetalle: null,
    subiendoArchivo: false,
    retirandoArchivo: false,
    guardandoArchivo: false,
    subirArchivo: vi.fn(),
    retirarArchivo: detalleMock.retirarArchivo,
    actualizarDescripcion: vi.fn(),
    organizarImagenes: detalleMock.organizarImagenes,
  }),
}))

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
})

afterEach(cleanup)

describe('DetalleProducto', () => {
  it('presenta la ficha operativa del SKU sin mezclar datos de compras o almacén', () => {
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
    expect(screen.getByText('Analgésicos adultos')).toBeInTheDocument()
    expect(screen.getByText(/S\/\s*12[.,]50/)).toBeInTheDocument()
    expect(screen.getByText('Gravado')).toBeInTheDocument()
    expect(screen.getByText('RS-12345')).toBeInTheDocument()
    expect(screen.getByText(/se administran en Inventario/i)).toBeInTheDocument()
    expect(screen.queryByText('Costo base')).not.toBeInTheDocument()
    expect(screen.queryByText('Stock máximo global')).not.toBeInTheDocument()
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

  it('permite elegir la imagen principal y retirar imágenes', () => {
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
        alEditar={vi.fn()}
        alSolicitarCambioEstado={vi.fn()}
        alRestaurarFoco={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Usar dos.webp como imagen principal',
      }),
    )
    expect(detalleMock.organizarImagenes).toHaveBeenLastCalledWith(
      expect.any(Array),
      'imagen-2',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retirar dos.webp' }))
    expect(detalleMock.retirarArchivo).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'imagen-2' }),
    )
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
