import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Almacen, UbicacionAlmacen } from '@/modulos/inventario/modelo/almacen'
import { claveBucketAjusteStock, type BucketAjusteStock } from '@/modulos/inventario/modelo/inventario'

import { DialogoAjusteStock } from './DialogoAjusteStock'

const mocks = vi.hoisted(() => ({
  useBucketsAjusteStock: vi.fn(),
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

function renderDialog(alGuardar = vi.fn().mockResolvedValue(undefined)) {
  const alCambiarApertura = vi.fn()
  render(
    <DialogoAjusteStock
      abierto
      organizationId="org-1"
      almacenes={[almacen]}
      ubicaciones={[ubicacion]}
      alCambiarApertura={alCambiarApertura}
      alGuardar={alGuardar}
      alRestaurarFoco={vi.fn()}
    />,
  )
  return { alGuardar, alCambiarApertura }
}

function completarFormulario() {
  fireEvent.change(screen.getByLabelText('Producto'), { target: { value: mocks.producto.id } })
  fireEvent.change(screen.getByLabelText(/Bucket exacto/), {
    target: { value: claveBucketAjusteStock(bucket) },
  })
  fireEvent.change(screen.getByLabelText(/Cantidad a descontar/), { target: { value: '2' } })
}

describe('DialogoAjusteStock', () => {
  beforeEach(() => {
    mocks.useBucketsAjusteStock.mockReset()
    mocks.useBucketsAjusteStock.mockReturnValue({ buckets: [bucket], cargando: false, error: '' })
  })

  it('no selecciona un producto arbitrario y muestra el bucket exacto', () => {
    renderDialog()

    expect(screen.getByLabelText('Producto')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: mocks.producto.id } })
    fireEvent.change(screen.getByLabelText(/Bucket exacto/), {
      target: { value: claveBucketAjusteStock(bucket) },
    })

    expect(screen.getByRole('option', { name: /A-01.*LOTE-1/ })).toBeVisible()
    expect(screen.getByText('Stock físico')).toBeVisible()
    expect(screen.getByText('Stock reservado')).toBeVisible()
    expect(screen.getByText('5')).toBeVisible()
  })

  it('valida producto, bucket y cantidad antes de revisar', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar descuento' }))

    expect(await screen.findByText('Selecciona un producto')).toBeVisible()
    expect(screen.getByText('Selecciona el bucket exacto que vas a descontar')).toBeVisible()
    expect(screen.getByText('Ingresa una cantidad mayor a cero con hasta 3 decimales')).toBeVisible()
  })

  it('exige observación cuando el motivo es Otro', async () => {
    renderDialog()
    completarFormulario()
    fireEvent.change(screen.getByLabelText(/Motivo del ajuste/), { target: { value: 'other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar descuento' }))

    expect(await screen.findByText('Describe el motivo cuando selecciones "Otro"')).toBeVisible()
  })

  it('muestra el resumen y envía el ajuste negativo con motivo y bucket', async () => {
    const { alGuardar, alCambiarApertura } = renderDialog()
    completarFormulario()
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
      motivo: 'Ajuste manual [damaged] Producto deteriorado — Envase roto',
    })))
    expect(alCambiarApertura).toHaveBeenCalledWith(false)
  })

  it('no permite revisar más que el disponible después de reservas', async () => {
    renderDialog()
    completarFormulario()
    fireEvent.change(screen.getByLabelText(/Cantidad a descontar/), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar descuento' }))

    expect(await screen.findByText(/no puede superar el disponible actual \(5\)/i)).toBeVisible()
  })

  it('conserva la confirmación y muestra el error del backend', async () => {
    const { alGuardar, alCambiarApertura } = renderDialog(vi.fn().mockResolvedValue('La cantidad supera el stock disponible'))
    completarFormulario()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar descuento' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar descuento' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La cantidad supera el stock disponible')
    expect(alGuardar).toHaveBeenCalledOnce()
    expect(alCambiarApertura).not.toHaveBeenCalledWith(false)
  })

  it('muestra un mensaje seguro ante un fallo inesperado del servicio', async () => {
    const { alCambiarApertura } = renderDialog(vi.fn().mockRejectedValue(new Error('SQL interno')))
    completarFormulario()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar descuento' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar descuento' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo registrar el descuento')
    expect(alCambiarApertura).not.toHaveBeenCalledWith(false)
  })

  it('deshabilita el bucket mientras consulta stock', () => {
    mocks.useBucketsAjusteStock.mockReturnValue({ buckets: [], cargando: true, error: '' })
    renderDialog()
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: mocks.producto.id } })

    expect(screen.getByLabelText(/Bucket exacto/)).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Consultando stock del almacén...' })).toBeVisible()
  })

  it('evita el doble envío mientras registra el movimiento', async () => {
    let resolver: (() => void) | undefined
    const alGuardar = vi.fn(() => new Promise<void>((resolve) => { resolver = resolve }))
    renderDialog(alGuardar)
    completarFormulario()
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
