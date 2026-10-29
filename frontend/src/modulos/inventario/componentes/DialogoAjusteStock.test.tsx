import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Almacen, UbicacionAlmacen } from '@/modulos/inventario/modelo/almacen'
import type { ContextoAccionInventario } from '@/modulos/inventario/modelo/contextoAccionInventario'
import type { BucketAjusteStock } from '@/modulos/inventario/modelo/inventario'

import { DialogoAjusteStock } from './DialogoAjusteStock'

const mocks = vi.hoisted(() => ({
  useBucketsAjusteStock: vi.fn(),
  listarAlmacenesAjusteStock: vi.fn(),
  buscarAlmacenesMovimientoInventario: vi.fn(),
  producto: {
    id: 'producto-1',
    codigo: 'SKU-001',
    descripcion: 'Producto de prueba',
    codigoBarras: 'SKU-001-BAR',
    unidadMedida: 'UND',
    unidadBaseId: 'a6000000-0000-4000-8000-000000000001',
    unidadesEntrada: [
      { id: 'a6000000-0000-4000-8000-000000000001', nombre: 'UND', factorConversion: 1 },
      { id: 'a6000000-0000-4000-8000-000000000002', nombre: 'Caja', factorConversion: 12 },
    ],
    controlLote: true,
    controlVencimiento: true,
  },
}))

vi.mock('@/modulos/inventario/estado/useBucketsAjusteStock', () => ({
  useBucketsAjusteStock: mocks.useBucketsAjusteStock,
}))

vi.mock('@/modulos/inventario/servicios/inventarioService', () => ({
  listarAlmacenesAjusteStock: mocks.listarAlmacenesAjusteStock,
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
        onChange={(evento) => onValueChange?.(evento.target.value, evento.target.value ? mocks.producto : undefined)}
      >
        <option value="">Selecciona un producto</option>
        <option value={mocks.producto.id}>{mocks.producto.codigo} · {mocks.producto.descripcion}</option>
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

const bucket: BucketAjusteStock = {
  productoId: mocks.producto.id,
  productoCodigo: mocks.producto.codigo,
  productoDescripcion: mocks.producto.descripcion,
  unidadMedida: mocks.producto.unidadMedida,
  almacenId: almacen.id,
  almacenCodigo: almacen.codigo,
  almacenNombre: almacen.nombre,
  ubicacionId: ubicacion.id,
  ubicacionCodigo: ubicacion.codigo,
  ubicacionNombre: ubicacion.nombre,
  estadoStock: 'available',
  lote: 'LOTE-1',
  fechaVencimiento: '2027-12-31',
  cantidadFisica: 8,
  cantidadReservada: 3,
  costoPromedio: 12.5,
}

function renderDialog(
  alGuardar = vi.fn().mockResolvedValue(undefined),
  contexto: ContextoAccionInventario | null = null,
) {
  const alCambiarApertura = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <DialogoAjusteStock
        abierto
        organizationId="org-1"
        almacenes={[almacen]}
        ubicaciones={[ubicacion]}
        contexto={contexto}
        alCambiarApertura={alCambiarApertura}
        alGuardar={alGuardar}
        alRestaurarFoco={vi.fn()}
      />
    </QueryClientProvider>,
  )
  return { alGuardar, alCambiarApertura }
}

async function seleccionarAlmacen() {
  const comboAlmacen = screen.getByRole('combobox', { name: 'Almacén' })
  fireEvent.focus(comboAlmacen)
  fireEvent.change(comboAlmacen, { target: { value: 'CENT' } })
  fireEvent.click(await screen.findByRole('option', { name: /CENTRAL · Almacén central/ }))
}

async function completarFormulario(tipo: 'ajuste-positivo' | 'ajuste-negativo' = 'ajuste-negativo', cantidad = '2') {
  fireEvent.change(screen.getByLabelText('Producto'), { target: { value: mocks.producto.id } })
  if (tipo === 'ajuste-positivo') {
    fireEvent.change(screen.getByLabelText('Tipo de ajuste *'), { target: { value: tipo } })
  }
  await seleccionarAlmacen()
  const comboBucket = screen.getByRole('combobox', { name: 'Ubicación, lote y condición' })
  fireEvent.focus(comboBucket)
  fireEvent.click(screen.getByRole('option', { name: /A-01.*LOTE-1/ }))
  fireEvent.change(screen.getByLabelText(/Cantidad a/), { target: { value: cantidad } })
}

describe('DialogoAjusteStock', () => {
  beforeEach(() => {
    mocks.useBucketsAjusteStock.mockReset().mockReturnValue({ buckets: [bucket], cargando: false, consultando: false, error: '' })
    mocks.listarAlmacenesAjusteStock.mockReset().mockResolvedValue({
      items: [{ id: almacen.id, codigo: almacen.codigo, nombre: almacen.nombre, cantidadDescontable: 5 }],
      totalCount: 1,
    })
    mocks.buscarAlmacenesMovimientoInventario.mockReset().mockResolvedValue([
      { id: almacen.id, codigo: almacen.codigo, nombre: almacen.nombre, cantidadDisponible: 0 },
    ])
  })

  it('selecciona producto, almacén y posición exacta, mostrando cantidades y condición heredada', async () => {
    renderDialog()

    expect(screen.getByLabelText('Producto')).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Almacén' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: mocks.producto.id } })
    await seleccionarAlmacen()

    const comboBucket = screen.getByRole('combobox', { name: 'Ubicación, lote y condición' })
    fireEvent.focus(comboBucket)
    expect(screen.getByText(/5 UND disponibles para descontar/)).toBeVisible()
    fireEvent.click(screen.getByRole('option', { name: /A-01.*LOTE-1.*Disponible/ }))

    expect(screen.getByText('Stock físico')).toBeVisible()
    expect(screen.getByText('Stock reservado')).toBeVisible()
    expect(screen.getByText('Disponible para descontar')).toBeVisible()
    expect(screen.getByText('5')).toBeVisible()
    expect(screen.queryByLabelText('Condición del stock *')).not.toBeInTheDocument()
  })

  it('exige producto, almacén, posición y cantidad antes de revisar', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar ajuste' }))

    expect(await screen.findByText('Selecciona un producto')).toBeVisible()
    expect(screen.getByText('Selecciona la posición de stock que vas a ajustar')).toBeVisible()
    expect(screen.getByText('Ingresa una cantidad mayor a cero con hasta 3 decimales')).toBeVisible()
  })

  it('mantiene la observación opcional y el motivo fijo de auditoría al descontar', async () => {
    const { alGuardar, alCambiarApertura } = renderDialog()
    await completarFormulario()
    expect(screen.getByLabelText('Observación (opcional)')).not.toBeRequired()
    fireEvent.change(screen.getByLabelText('Observación (opcional)'), { target: { value: 'Envase roto' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar ajuste' }))

    expect(await screen.findByText(/Se descontarán/)).toBeVisible()
    expect(screen.getByText(/LOTE-1.*vence.*Disponible/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar ajuste' }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(expect.objectContaining({
      productoId: mocks.producto.id,
      tipo: 'ajuste-negativo',
      cantidad: '2',
      almacenId: almacen.id,
      ubicacionId: ubicacion.id,
      estadoStock: 'available',
      lote: 'LOTE-1',
      fechaVencimiento: '2027-12-31',
      motivo: 'Ajuste de stock: Diferencia de inventario físico — Envase roto',
    })))
    expect(alGuardar.mock.calls[0][0]).not.toHaveProperty('costoUnitario')
    expect(alCambiarApertura).toHaveBeenCalledWith(false)
  })

  it('convierte la unidad elegida a unidad base al mostrar y registrar la diferencia', async () => {
    const { alGuardar } = renderDialog()
    await completarFormulario()
    fireEvent.change(screen.getByLabelText('Unidad de medida *'), {
      target: { value: 'a6000000-0000-4000-8000-000000000002' },
    })
    fireEvent.change(screen.getByLabelText(/Cantidad a descontar/), { target: { value: '0.4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar ajuste' }))

    expect(await screen.findByText(/Se descontarán/)).toBeVisible()
    expect(screen.getByText(/4.8 UND/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar ajuste' }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(expect.objectContaining({
      cantidad: '0.4',
      unidadEntradaId: 'a6000000-0000-4000-8000-000000000002',
      factorConversionEsperado: 12,
    })))
  })

  it('aumenta una posición existente heredando lote, vencimiento, condición y costo del backend', async () => {
    const { alGuardar } = renderDialog()
    await completarFormulario('ajuste-positivo')

    expect(screen.queryByLabelText('Ubicación')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Condición del stock *')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Lote del fabricante')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Fecha de vencimiento/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Costo unitario *')).not.toBeInTheDocument()
    expect(screen.getByText('Saldo no reservado')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar ajuste' }))

    expect(await screen.findByText(/Se aumentarán/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar ajuste' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'ajuste-positivo',
      almacenId: almacen.id,
      ubicacionId: ubicacion.id,
      estadoStock: 'available',
      lote: 'LOTE-1',
      fechaVencimiento: '2027-12-31',
      motivo: 'Ajuste de stock: Diferencia de inventario físico',
    })))
    expect(alGuardar.mock.calls[0][0]).not.toHaveProperty('costoUnitario')
  })

  it('permite aumentar un bucket totalmente reservado, pero no descontarlo', async () => {
    mocks.useBucketsAjusteStock.mockReturnValue({
      buckets: [{ ...bucket, cantidadReservada: bucket.cantidadFisica }],
      cargando: false,
      consultando: false,
      error: '',
    })
    renderDialog()
    await completarFormulario('ajuste-positivo', '1')
    fireEvent.click(screen.getByRole('button', { name: 'Revisar ajuste' }))
    expect(await screen.findByRole('button', { name: 'Confirmar ajuste' })).toBeVisible()
  })

  it('no permite descontar más que el saldo físico no reservado', async () => {
    renderDialog()
    await completarFormulario('ajuste-negativo', '6')
    fireEvent.click(screen.getByRole('button', { name: 'Revisar ajuste' }))
    expect(await screen.findByText(/no puede superar el disponible actual \(5\)/i)).toBeVisible()
  })

  it('conserva la confirmación y muestra el error de negocio del backend', async () => {
    const { alGuardar, alCambiarApertura } = renderDialog(vi.fn().mockResolvedValue('La cantidad supera el stock disponible'))
    await completarFormulario()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar ajuste' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar ajuste' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La cantidad supera el stock disponible')
    expect(alGuardar).toHaveBeenCalledOnce()
    expect(alCambiarApertura).not.toHaveBeenCalledWith(false)
  })

  it('muestra un mensaje seguro ante un fallo inesperado del servicio', async () => {
    const { alCambiarApertura } = renderDialog(vi.fn().mockRejectedValue(new Error('SQL interno')))
    await completarFormulario()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar ajuste' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar ajuste' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo registrar el ajuste')
    expect(alCambiarApertura).not.toHaveBeenCalledWith(false)
  })

  it('deshabilita la selección mientras consulta stock', () => {
    mocks.useBucketsAjusteStock.mockReturnValue({ buckets: [], cargando: true, consultando: true, error: '' })
    renderDialog(vi.fn(), {
      producto: mocks.producto,
      posicion: {
        almacenId: almacen.id,
        ubicacionId: ubicacion.id,
        estado: 'available',
        lote: 'LOTE-1',
        fechaVencimiento: '2027-12-31',
      },
    })

    expect(screen.getByRole('combobox', { name: 'Ubicación, lote y condición' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Ubicación, lote y condición' })).toHaveAttribute(
      'placeholder',
      'Consultando existencias…',
    )
  })

  it('precarga el producto y la posición exacta al abrir desde existencias', () => {
    renderDialog(vi.fn(), {
      producto: mocks.producto,
      posicion: {
        almacenId: almacen.id,
        ubicacionId: ubicacion.id,
        estado: 'available',
        lote: 'LOTE-1',
        fechaVencimiento: '2027-12-31',
      },
    })

    expect(screen.getByLabelText('Producto')).toHaveValue(mocks.producto.id)
    expect(screen.getByRole('combobox', { name: 'Almacén' })).toHaveValue(`${almacen.codigo} · ${almacen.nombre}`)
    expect(screen.getByRole('combobox', { name: 'Ubicación, lote y condición' })).toHaveValue('A-01 · Lote LOTE-1 · vence 31 dic. 2027 · Disponible')
    expect(screen.getByText('Disponible para descontar')).toBeVisible()
  })

  it('conserva la posición precargada mientras actualiza los datos en caché', () => {
    mocks.useBucketsAjusteStock.mockReturnValue({ buckets: [bucket], cargando: false, consultando: true, error: '' })
    renderDialog(vi.fn(), {
      producto: mocks.producto,
      posicion: {
        almacenId: almacen.id,
        ubicacionId: ubicacion.id,
        estado: 'available',
        lote: 'LOTE-1',
        fechaVencimiento: '2027-12-31',
      },
    })

    expect(screen.getByRole('combobox', { name: 'Ubicación, lote y condición' })).toHaveValue('A-01 · Lote LOTE-1 · vence 31 dic. 2027 · Disponible')
  })

  it('explica cómo proceder si no existe saldo físico para ajustar', async () => {
    mocks.useBucketsAjusteStock.mockReturnValue({ buckets: [], cargando: false, error: '' })
    renderDialog()
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: mocks.producto.id } })
    await seleccionarAlmacen()

    expect(screen.getByRole('combobox', { name: 'Ubicación, lote y condición' })).toBeDisabled()
    expect(screen.getByText(/Si encontraste stock donde el sistema registra cero/)).toBeVisible()
  })

  it('busca almacenes en el servidor limitados por organización y producto', async () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: mocks.producto.id } })
    await seleccionarAlmacen()

    expect(mocks.listarAlmacenesAjusteStock).toHaveBeenCalledWith('org-1', mocks.producto.id, 'CENT')
    expect(screen.getByRole('combobox', { name: 'Almacén' })).toHaveValue('CENTRAL · Almacén central')
  })

  it('evita el doble envío mientras registra el ajuste', async () => {
    let resolver: (() => void) | undefined
    const alGuardar = vi.fn(() => new Promise<void>((resolve) => { resolver = resolve }))
    renderDialog(alGuardar)
    await completarFormulario()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar ajuste' }))
    const boton = await screen.findByRole('button', { name: 'Confirmar ajuste' })
    fireEvent.click(boton)
    fireEvent.click(boton)

    expect(alGuardar).toHaveBeenCalledOnce()
    expect(boton).toBeDisabled()
    resolver?.()
    await waitFor(() => expect(boton).not.toBeDisabled())
  })
})
