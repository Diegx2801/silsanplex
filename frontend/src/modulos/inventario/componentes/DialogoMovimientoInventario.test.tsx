import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Almacen, UbicacionAlmacen } from '@/modulos/inventario/modelo/almacen'
import type { ContextoAccionInventario } from '@/modulos/inventario/modelo/contextoAccionInventario'
import { tiposMovimientoEnExistencias } from '@/modulos/inventario/modelo/inventario'

import { DialogoMovimientoInventario } from './DialogoMovimientoInventario'

const mocks = vi.hoisted(() => ({
  useCandidatosFefo: vi.fn(),
  producto: {
    id: 'producto-1',
    codigo: 'SKU-001',
    descripcion: 'Producto de prueba',
    codigoBarras: 'SKU-001-BAR',
    unidadMedida: 'Caja',
    controlLote: true,
    controlVencimiento: true,
  },
  otroProducto: {
    id: 'producto-2',
    codigo: 'SKU-002',
    descripcion: 'Otro producto',
    codigoBarras: '',
    unidadMedida: 'Unidad',
    controlLote: false,
    controlVencimiento: false,
  },
}))

vi.mock('@/modulos/inventario/estado/useCandidatosFefo', () => ({
  useCandidatosFefo: mocks.useCandidatosFefo,
}))

vi.mock('@/modulos/inventario/componentes/SelectorProductoInventario', () => ({
  SelectorProductoInventario: ({
    id,
    value,
    onValueChange,
  }: {
    id: string
    value?: string
    onValueChange?: (value: string, option?: typeof mocks.producto) => void
  }) => (
    <label>
      Producto
      <select
        aria-label="Producto"
        id={id}
        value={value ?? ''}
        onChange={(evento) => {
          const option = evento.target.value === mocks.producto.id
            ? mocks.producto
            : evento.target.value === mocks.otroProducto.id
              ? mocks.otroProducto
              : undefined
          onValueChange?.(evento.target.value, option)
        }}
      >
        <option value="">Selecciona un producto</option>
        <option value={mocks.producto.id}>{mocks.producto.codigo} · {mocks.producto.descripcion}</option>
        <option value={mocks.otroProducto.id}>{mocks.otroProducto.codigo} · {mocks.otroProducto.descripcion}</option>
      </select>
    </label>
  ),
}))

const almacen: Almacen = {
  id: 'almacen-1',
  codigo: 'CENTRAL',
  nombre: 'Almacén central',
  direccion: '',
  activo: true,
}

const ubicacion: UbicacionAlmacen = {
  id: 'ubicacion-1',
  almacenId: almacen.id,
  codigo: 'A-01',
  nombre: 'Anaquel A',
  descripcion: '',
  activa: true,
}

function renderDialog(
  contexto: ContextoAccionInventario | null,
  opcionesTipoMovimiento?: typeof tiposMovimientoEnExistencias,
) {
  render(
    <DialogoMovimientoInventario
      abierto
      organizationId="org-1"
      almacenes={[almacen]}
      ubicaciones={[ubicacion]}
      opcionesTipoMovimiento={opcionesTipoMovimiento}
      contexto={contexto}
      alCambiarApertura={vi.fn()}
      alGuardar={vi.fn().mockResolvedValue(undefined)}
      alRestaurarFoco={vi.fn()}
    />,
  )
}

describe('DialogoMovimientoInventario contextual', () => {
  beforeEach(() => {
    mocks.useCandidatosFefo.mockReset().mockReturnValue({ candidatos: [], cargando: false, error: '' })
  })

  it('precarga producto, almacén, ubicación, condición y lote de la fila exacta', () => {
    renderDialog({
      producto: mocks.producto,
      posicion: {
        almacenId: almacen.id,
        ubicacionId: ubicacion.id,
        estado: 'quarantine',
        lote: 'LOTE-1',
        fechaVencimiento: '2027-12-31',
      },
    })

    expect(screen.getByLabelText('Producto')).toHaveValue(mocks.producto.id)
    expect(screen.getByLabelText('Almacén *')).toHaveValue(almacen.id)
    expect(screen.getByLabelText('Ubicación física *')).toHaveValue(ubicacion.id)
    expect(screen.getByLabelText('Condición del stock *')).toHaveValue('quarantine')
    expect(screen.getByLabelText('Lote *')).toHaveValue('LOTE-1')
    expect(screen.getByLabelText('Fecha de vencimiento *')).toHaveValue('2027-12-31')
    expect(screen.getByLabelText('Referencia del documento *')).toBeVisible()
    expect(screen.getByText(/Solo se guarda la referencia; no se adjunta un archivo/)).toBeVisible()
  })

  it('no elige almacén ni posición arbitrarios desde la vista agregada', () => {
    renderDialog({ producto: mocks.producto })

    expect(screen.getByLabelText('Producto')).toHaveValue(mocks.producto.id)
    expect(screen.getByLabelText('Almacén *')).toHaveValue('')
    expect(screen.getByLabelText('Ubicación física *')).toHaveValue('')
  })

  it('en Existencias no permite registrar el descuento que ya tiene la acción Ajustar stock', () => {
    renderDialog(null, tiposMovimientoEnExistencias)

    const selectorTipo = screen.getByRole('combobox', { name: 'Tipo de movimiento *' })
    expect(within(selectorTipo).getAllByRole('option').map((opcion) => opcion.textContent)).toEqual([
      'Entrada',
      'Salida',
      'Ajuste positivo',
    ])
    expect(screen.getByText(/Para descontar existencias por ajuste, usa «Ajustar stock»/)).toBeVisible()
  })

  it('conserva los cuatro tipos en la vista general de movimientos e identifica el ajuste positivo', () => {
    renderDialog(null)

    const selectorTipo = screen.getByRole('combobox', { name: 'Tipo de movimiento *' })
    expect(within(selectorTipo).getAllByRole('option').map((opcion) => opcion.textContent)).toEqual([
      'Entrada',
      'Salida',
      'Ajuste positivo',
      'Ajuste negativo',
    ])

    fireEvent.change(selectorTipo, { target: { value: 'ajuste-positivo' } })
    expect(screen.getByText('El ajuste aumentará la existencia del producto en el almacén indicado.')).toBeVisible()
  })

  it('limpia lote y condición de la posición previa al cambiar el producto', () => {
    renderDialog({
      producto: mocks.producto,
      posicion: {
        almacenId: almacen.id,
        ubicacionId: ubicacion.id,
        estado: 'damaged',
        lote: 'LOTE-1',
        fechaVencimiento: '2027-12-31',
      },
    })

    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: mocks.otroProducto.id } })

    expect(screen.getByLabelText('Lote')).toHaveValue('')
    expect(screen.getByLabelText('Fecha de vencimiento')).toHaveValue('')
    expect(screen.getByLabelText('Condición del stock *')).toHaveValue('available')
  })
})
