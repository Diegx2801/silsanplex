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
  producto: {
    id: 'producto-1',
    codigo: 'SKU-001',
    descripcion: 'Producto de prueba',
    codigoBarras: 'SKU-001-BAR',
    unidadMedida: 'UND',
    controlLote: true,
    controlVencimiento: true,
  },
}))

vi.mock('@/modulos/inventario/estado/useBucketsAjusteStock', () => ({
  useBucketsAjusteStock: mocks.useBucketsAjusteStock,
}))

vi.mock('@/modulos/inventario/servicios/inventarioService', () => ({
  listarAlmacenesAjusteStock: mocks.listarAlmacenesAjusteStock,
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

async function completarFormulario() {
  fireEvent.change(screen.getByLabelText('Producto'), { target: { value: mocks.producto.id } })
  await seleccionarAlmacen()
  const comboBucket = screen.getByRole('combobox', { name: 'Ubicación y lote' })
  fireEvent.focus(comboBucket)
  fireEvent.click(screen.getByRole('option', { name: /A-01.*LOTE-1/ }))
  fireEvent.change(screen.getByLabelText(/Cantidad a descontar/), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText(/Referencia del ajuste/), { target: { value: 'ACTA-001' } })
}

describe('DialogoAjusteStock', () => {
  beforeEach(() => {
    mocks.useBucketsAjusteStock.mockReset()
    mocks.useBucketsAjusteStock.mockReturnValue({ buckets: [bucket], cargando: false, consultando: false, error: '' })
    mocks.listarAlmacenesAjusteStock.mockReset().mockResolvedValue({
      items: [{ id: almacen.id, codigo: almacen.codigo, nombre: almacen.nombre, cantidadDescontable: 8 }],
      totalCount: 1,
    })
  })

  it('no selecciona un producto ni almacén arbitrarios y muestra el bucket exacto', async () => {
    renderDialog()

    expect(screen.getByLabelText('Producto')).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Almacén' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Almacén' })).toHaveValue('')
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: mocks.producto.id } })
    await seleccionarAlmacen()
    const comboBucket = screen.getByRole('combobox', { name: 'Ubicación y lote' })
    fireEvent.focus(comboBucket)
    expect(screen.getByText(/5 UND descontables/)).toBeVisible()
    fireEvent.click(screen.getByRole('option', { name: /A-01.*LOTE-1/ }))

    expect(screen.queryByText(/bucket seleccionado/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/backend/i)).not.toBeInTheDocument()
    expect(screen.getByText('Stock físico')).toBeVisible()
    expect(screen.getByText('Stock reservado')).toBeVisible()
    expect(screen.getByText('5')).toBeVisible()
  })

  it('valida producto, bucket, cantidad y referencia antes de revisar', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar descuento' }))

    expect(await screen.findByText('Selecciona un producto')).toBeVisible()
    expect(screen.getByText('Selecciona la ubicación y el lote que vas a descontar')).toBeVisible()
    expect(screen.getByText('Ingresa una cantidad mayor a cero con hasta 3 decimales')).toBeVisible()
    expect(screen.getByText('Ingresa una referencia para el ajuste')).toBeVisible()
  })

  it('exige observación cuando el motivo es Otro', async () => {
    renderDialog()
    await completarFormulario()
    fireEvent.change(screen.getByLabelText(/Motivo del ajuste/), { target: { value: 'other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar descuento' }))

    expect(await screen.findByText('Describe el motivo cuando selecciones "Otro"')).toBeVisible()
  })

  it('muestra el resumen y envía el ajuste negativo con motivo y bucket', async () => {
    const { alGuardar, alCambiarApertura } = renderDialog()
    await completarFormulario()
    fireEvent.change(screen.getByLabelText(/Motivo del ajuste/), { target: { value: 'damaged' } })
    fireEvent.change(screen.getByLabelText(/Observación/), { target: { value: 'Envase roto' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar descuento' }))

    expect(await screen.findByText(/Se descontarán/)).toBeVisible()
    expect(screen.getByText(/Stock esperado/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar descuento' }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(expect.objectContaining({
      productoId: mocks.producto.id,
      tipo: 'ajuste-negativo',
      cantidad: '2',
      almacenId: almacen.id,
      ubicacionId: ubicacion.id,
      estadoStock: 'available',
      lote: 'LOTE-1',
      fechaVencimiento: '2027-12-31',
      documentoReferencia: 'ACTA-001',
      motivo: 'Ajuste manual [damaged] Producto deteriorado — Envase roto',
    })))
    expect(alCambiarApertura).toHaveBeenCalledWith(false)
  })

  it('no permite revisar más que el disponible después de reservas', async () => {
    renderDialog()
    await completarFormulario()
    fireEvent.change(screen.getByLabelText(/Cantidad a descontar/), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar descuento' }))

    expect(await screen.findByText(/no puede superar el disponible actual \(5\)/i)).toBeVisible()
  })

  it('conserva la confirmación y muestra el error del backend', async () => {
    const { alGuardar, alCambiarApertura } = renderDialog(vi.fn().mockResolvedValue('La cantidad supera el stock disponible'))
    await completarFormulario()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar descuento' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar descuento' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La cantidad supera el stock disponible')
    expect(alGuardar).toHaveBeenCalledOnce()
    expect(alCambiarApertura).not.toHaveBeenCalledWith(false)
  })

  it('muestra un mensaje seguro ante un fallo inesperado del servicio', async () => {
    const { alCambiarApertura } = renderDialog(vi.fn().mockRejectedValue(new Error('SQL interno')))
    await completarFormulario()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar descuento' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar descuento' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo registrar el descuento')
    expect(alCambiarApertura).not.toHaveBeenCalledWith(false)
  })

  it('deshabilita el bucket mientras consulta stock', () => {
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

    expect(screen.getByRole('combobox', { name: 'Ubicación y lote' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Ubicación y lote' })).toHaveAttribute(
      'placeholder',
      'Consultando existencias…',
    )
  })

  it('precarga el producto y el bucket exacto cuando se abre desde una posición', () => {
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
    expect(screen.getByRole('combobox', { name: 'Ubicación y lote' })).toHaveValue('A-01 · Lote LOTE-1 · vence 31 dic. 2027 · Disponible')
    expect(screen.getByText('Disponible para descontar')).toBeVisible()
  })

  it('conserva el bucket preseleccionado mientras actualiza datos en caché', () => {
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

    expect(screen.getByRole('combobox', { name: 'Ubicación y lote' })).toHaveValue('A-01 · Lote LOTE-1 · vence 31 dic. 2027 · Disponible')
  })

  it('deja pedir almacén cuando el contexto procede de un agregado por producto', () => {
    renderDialog(vi.fn(), { producto: mocks.producto })

    expect(screen.getByLabelText('Producto')).toHaveValue(mocks.producto.id)
    expect(screen.getByRole('combobox', { name: 'Almacén' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Ubicación y lote' }))
      .toHaveAttribute('placeholder', 'Selecciona un almacén para consultar stock')
    expect(screen.getByRole('combobox', { name: 'Ubicación y lote' })).toBeDisabled()
  })

  it('explica cuándo el producto no tiene stock físico en el almacén', async () => {
    mocks.useBucketsAjusteStock.mockReturnValue({ buckets: [], cargando: false, error: '' })
    renderDialog()
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: mocks.producto.id } })
    await seleccionarAlmacen()

    const comboBucket = screen.getByRole('combobox', { name: 'Ubicación y lote' })
    expect(comboBucket).toBeDisabled()
    expect(comboBucket).toHaveAttribute('placeholder', 'No hay stock físico en este almacén')
    expect(screen.getByText('Busca otro almacén si el producto tiene stock en otra ubicación.')).toBeVisible()
  })

  it('oculta buckets totalmente reservados y explica por qué no son descontables', async () => {
    mocks.useBucketsAjusteStock.mockReturnValue({
      buckets: [{ ...bucket, cantidadReservada: bucket.cantidadFisica }],
      cargando: false,
      consultando: false,
      error: '',
    })
    renderDialog()
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: mocks.producto.id } })
    await seleccionarAlmacen()

    const comboBucket = screen.getByRole('combobox', { name: 'Ubicación y lote' })
    expect(comboBucket).toBeDisabled()
    expect(comboBucket).toHaveAttribute('placeholder', 'Todo el stock está reservado')
    expect(screen.getByText('Todo el stock de este almacén está reservado.')).toBeVisible()
    expect(screen.queryByText(/LOTE-1/)).not.toBeInTheDocument()
  })

  it('busca almacenes en el servidor limitados por organización y producto', async () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: mocks.producto.id } })
    await seleccionarAlmacen()

    expect(mocks.listarAlmacenesAjusteStock).toHaveBeenCalledWith('org-1', mocks.producto.id, 'CENT')
    expect(screen.getByRole('combobox', { name: 'Almacén' })).toHaveValue('CENTRAL · Almacén central')
  })

  it('evita el doble envío mientras registra el movimiento', async () => {
    let resolver: (() => void) | undefined
    const alGuardar = vi.fn(() => new Promise<void>((resolve) => { resolver = resolve }))
    renderDialog(alGuardar)
    await completarFormulario()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar descuento' }))
    const boton = await screen.findByRole('button', { name: 'Confirmar descuento' })
    fireEvent.click(boton)
    fireEvent.click(boton)

    expect(alGuardar).toHaveBeenCalledOnce()
    expect(boton).toBeDisabled()
    resolver?.()
    await waitFor(() => expect(boton).not.toBeDisabled())
  })
})
