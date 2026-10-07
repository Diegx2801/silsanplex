import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Almacen, UbicacionAlmacen } from '@/modulos/inventario/modelo/almacen'
import type { ContextoAccionInventario } from '@/modulos/inventario/modelo/contextoAccionInventario'
import { tiposMovimientoEnExistencias } from '@/modulos/inventario/modelo/inventario'

import { DialogoMovimientoInventario } from './DialogoMovimientoInventario'

const mocks = vi.hoisted(() => ({
  useCandidatosFefo: vi.fn(),
  useBucketsAjusteStock: vi.fn(),
  buscarAlmacenesMovimientoInventario: vi.fn(),
  producto: {
    id: 'producto-1',
    codigo: 'SKU-001',
    descripcion: 'Producto de prueba',
    codigoBarras: 'SKU-001-BAR',
    unidadMedida: 'Caja',
    unidadBaseId: 'a6000000-0000-4000-8000-000000000001',
    unidadesEntrada: [
      { id: 'a6000000-0000-4000-8000-000000000001', nombre: 'Caja', factorConversion: 1 },
      { id: 'a6000000-0000-4000-8000-000000000002', nombre: 'Paquete', factorConversion: 12 },
    ],
    controlLote: true,
    controlVencimiento: true,
  },
  otroProducto: {
    id: 'producto-2',
    codigo: 'SKU-002',
    descripcion: 'Otro producto',
    codigoBarras: '',
    unidadMedida: 'Unidad',
    unidadBaseId: 'a6000000-0000-4000-8000-000000000003',
    unidadesEntrada: [
      { id: 'a6000000-0000-4000-8000-000000000003', nombre: 'Unidad', factorConversion: 1 },
    ],
    controlLote: false,
    controlVencimiento: false,
  },
}))

vi.mock('@/modulos/inventario/estado/useCandidatosFefo', () => ({
  useCandidatosFefo: mocks.useCandidatosFefo,
}))

vi.mock('@/modulos/inventario/estado/useBucketsAjusteStock', () => ({
  useBucketsAjusteStock: mocks.useBucketsAjusteStock,
}))

vi.mock('@/modulos/inventario/servicios/inventarioService', () => ({
  buscarAlmacenesMovimientoInventario: mocks.buscarAlmacenesMovimientoInventario,
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
  id: 'a4000000-0000-4000-8000-000000000001',
  codigo: 'CENTRAL',
  nombre: 'Almacén central',
  direccion: '',
  activo: true,
}

const ubicacion: UbicacionAlmacen = {
  id: 'a5000000-0000-4000-8000-000000000001',
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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
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
      />
    </QueryClientProvider>,
  )
}

describe('DialogoMovimientoInventario contextual', () => {
  beforeEach(() => {
    mocks.useCandidatosFefo.mockReset().mockReturnValue({ candidatos: [], cargando: false, error: '' })
    mocks.useBucketsAjusteStock.mockReset().mockReturnValue({ buckets: [], cargando: false, error: '' })
    mocks.buscarAlmacenesMovimientoInventario.mockReset().mockResolvedValue([])
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
    expect(screen.getByRole('combobox', { name: /Almacén/ })).toHaveValue(`${almacen.codigo} · ${almacen.nombre}`)
    expect(screen.getByRole('combobox', { name: /Ubicación física/ })).toHaveValue(`${ubicacion.codigo} · ${ubicacion.nombre}`)
    expect(screen.getByLabelText('Condición del stock *')).toHaveValue('quarantine')
    expect(screen.getByRole('combobox', { name: /Lote del fabricante/ })).toHaveValue('LOTE-1')
    expect(screen.getByLabelText('Fecha de vencimiento *')).toHaveValue('2027-12-31')
    expect(screen.getByLabelText('Documento de origen (opcional)')).toBeVisible()
    expect(screen.getByText(/Registra el número del respaldo si existe/)).toBeVisible()
  })

  it('no elige almacén ni posición arbitrarios desde la vista agregada', () => {
    renderDialog({ producto: mocks.producto })

    expect(screen.getByLabelText('Producto')).toHaveValue(mocks.producto.id)
    expect(screen.getByLabelText('Almacén *')).toHaveValue('')
    expect(screen.getByLabelText('Ubicación física *')).toHaveValue('')
  })

  it('no preselecciona el primer almacén al abrir el movimiento sin contexto', () => {
    renderDialog(null)

    expect(screen.getByLabelText('Producto')).toHaveValue('')
    expect(screen.getByLabelText('Almacén *')).toHaveValue('')
    expect(screen.getByLabelText('Almacén *')).toBeDisabled()
  })

  it('pide la condición antes del almacén y no muestra saldo FEFO antes de seleccionarlo', () => {
    renderDialog({ producto: mocks.producto })

    const condicion = screen.getByLabelText('Condición del stock *')
    const selectorAlmacen = screen.getByLabelText('Almacén *')
    expect(condicion.compareDocumentPosition(selectorAlmacen) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Tipo de movimiento *'), { target: { value: 'salida' } })

    expect(screen.getByText('Selecciona un almacén para consultar el stock disponible.')).toBeVisible()
    expect(screen.queryByText(/0 unidades disponibles en 0 posiciones/)).not.toBeInTheDocument()
  })

  it('detiene la salida si la cantidad supera el total disponible según FEFO', async () => {
    mocks.buscarAlmacenesMovimientoInventario.mockResolvedValue([{
      id: almacen.id,
      codigo: almacen.codigo,
      nombre: almacen.nombre,
      cantidadDisponible: 5,
    }])
    mocks.useCandidatosFefo.mockReturnValue({
      candidatos: [{
        productoId: mocks.producto.id,
        almacenId: almacen.id,
        ubicacionId: ubicacion.id,
        ubicacionCodigo: ubicacion.codigo,
        ubicacionNombre: ubicacion.nombre,
        lote: 'LOTE-1',
        fechaVencimiento: '2027-12-31',
        cantidadAsignable: 5,
        costoPromedio: 12,
        ordenFefo: 1,
      }],
      cargando: false,
      error: '',
    })
    renderDialog({ producto: mocks.producto })

    fireEvent.change(screen.getByLabelText('Tipo de movimiento *'), { target: { value: 'salida' } })
    const comboAlmacen = screen.getByLabelText('Almacén *')
    fireEvent.focus(comboAlmacen)
    fireEvent.change(comboAlmacen, { target: { value: 'CENT' } })
    fireEvent.click(await screen.findByRole('option', { name: /CENTRAL · Almacén central/ }))
    expect(screen.getByLabelText('Cantidad *')).toHaveAttribute('type', 'number')
    expect(screen.getByLabelText('Cantidad *')).toHaveAttribute('max', '5')
    fireEvent.change(screen.getByLabelText('Cantidad *'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('Motivo del movimiento *'), { target: { value: 'Venta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }))

    expect(await screen.findByText(/La cantidad supera el disponible según FEFO \(5 Caja\)/)).toBeVisible()
  })

  it('valida las salidas en unidad base aunque el usuario capture en una unidad alternativa', async () => {
    mocks.buscarAlmacenesMovimientoInventario.mockResolvedValue([{
      id: almacen.id,
      codigo: almacen.codigo,
      nombre: almacen.nombre,
      cantidadDisponible: 5,
    }])
    mocks.useCandidatosFefo.mockReturnValue({
      candidatos: [{
        productoId: mocks.producto.id,
        almacenId: almacen.id,
        ubicacionId: ubicacion.id,
        ubicacionCodigo: ubicacion.codigo,
        ubicacionNombre: ubicacion.nombre,
        lote: 'LOTE-1',
        fechaVencimiento: '2027-12-31',
        cantidadAsignable: 5,
        costoPromedio: 12,
        ordenFefo: 1,
      }],
      cargando: false,
      error: '',
    })
    renderDialog({ producto: mocks.producto })

    fireEvent.change(screen.getByLabelText('Tipo de movimiento *'), { target: { value: 'salida' } })
    const comboAlmacen = screen.getByLabelText('Almacén *')
    fireEvent.focus(comboAlmacen)
    fireEvent.change(comboAlmacen, { target: { value: 'CENT' } })
    fireEvent.click(await screen.findByRole('option', { name: /CENTRAL · Almacén central/ }))
    fireEvent.change(screen.getByLabelText('Unidad de medida *'), {
      target: { value: 'a6000000-0000-4000-8000-000000000002' },
    })
    expect(screen.getByLabelText('Cantidad *')).toHaveAttribute('max', '0.416')
    fireEvent.change(screen.getByLabelText('Cantidad *'), { target: { value: '0.5' } })
    fireEvent.change(screen.getByLabelText('Motivo del movimiento *'), { target: { value: 'Uso interno' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }))

    expect(await screen.findByText(/La cantidad supera el disponible según FEFO \(5 Caja\)/)).toBeVisible()
  })

  it('en Existencias no permite registrar el descuento que ya tiene la acción Ajustar stock', () => {
    renderDialog(null, tiposMovimientoEnExistencias)

    const selectorTipo = screen.getByRole('combobox', { name: 'Tipo de movimiento *' })
    expect(within(selectorTipo).getAllByRole('option').map((opcion) => opcion.textContent)).toEqual([
      'Entrada',
      'Salida',
    ])
    expect(screen.getByText(/Para corregir diferencias del inventario, usa «Ajustar stock»/)).toBeVisible()
  })

  it('limita el registro manual a entradas y salidas', () => {
    renderDialog(null)

    const selectorTipo = screen.getByRole('combobox', { name: 'Tipo de movimiento *' })
    expect(within(selectorTipo).getAllByRole('option').map((opcion) => opcion.textContent)).toEqual([
      'Entrada',
      'Salida',
    ])
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

    expect(screen.getByRole('combobox', { name: /Lote del fabricante/ })).toHaveValue('')
    expect(screen.getByLabelText('Fecha de vencimiento')).toHaveValue('')
    expect(screen.getByLabelText('Condición del stock *')).toHaveValue('available')
  })
})
