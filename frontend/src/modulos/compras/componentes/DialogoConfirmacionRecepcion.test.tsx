import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Compra } from '@/modulos/compras/modelo/compras'
import type { UbicacionAlmacen } from '@/modulos/inventario/modelo/almacen'

import { DialogoConfirmacionRecepcion } from './DialogoConfirmacionRecepcion'

const compra = {
  id: 'compra-1',
  proveedorId: 'proveedor-1',
  proveedorDocumento: '20123456789',
  proveedorNombre: 'Proveedor de prueba',
  tipoDocumento: 'factura',
  serie: 'F001',
  numero: '1',
  fechaEmision: '2026-09-01',
  fechaVencimientoPago: '',
  fechaEntregaEsperada: '',
  almacenId: '11111111-1111-4111-8111-111111111111',
  almacen: 'Almacén central',
  preciosIncluyenIgv: true,
  observacion: '',
  estado: 'emitida',
  fechaRegistro: '2026-09-01T12:00:00.000Z',
  fechaEmisionOrden: '2026-09-01T12:00:00.000Z',
  fechaRecepcion: null,
  lineas: [{
    id: 'linea-1',
    productoId: 'producto-1',
    productoCodigo: 'PROD-1',
    productoDescripcion: 'Producto de prueba',
    unidadMedida: 'UND',
    controlLote: true,
    controlVencimiento: true,
    cantidad: 5,
    cantidadRecibida: 0,
    cantidadPendiente: 5,
    costoUnitario: 10,
    lote: '',
    fechaVencimiento: '',
    tipoProducto: 'good',
    productoActivo: true,
  }],
} satisfies Compra

const ubicaciones: UbicacionAlmacen[] = [{
  id: 'ubicacion-1',
  almacenId: compra.almacenId,
  codigo: 'GEN',
  nombre: 'General',
  descripcion: '',
  activa: true,
}]

function renderDialog(alConfirmar = vi.fn().mockResolvedValue(undefined)) {
  render(
    <DialogoConfirmacionRecepcion
      abierto
      compra={compra}
      ubicaciones={ubicaciones}
      alCambiarApertura={vi.fn()}
      alConfirmar={alConfirmar}
      alRestaurarFoco={vi.fn()}
    />,
  )
  return alConfirmar
}

describe('DialogoConfirmacionRecepcion', () => {
  it('marca todos los campos inválidos de cada partida', async () => {
    const alConfirmar = renderDialog()
    fireEvent.change(screen.getByLabelText(/Cantidad/), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText(/Ubicación/), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar recepción' }))

    expect(await screen.findByText('Revisa las líneas marcadas antes de confirmar la recepción.')).toBeVisible()
    expect(screen.getByText('Ingresa una cantidad mayor que cero.')).toBeVisible()
    expect(screen.getByText('Selecciona una ubicación activa.')).toBeVisible()
    expect(screen.getByText('Ingresa el lote del producto.')).toBeVisible()
    expect(screen.getByText('Ingresa la fecha de vencimiento.')).toBeVisible()
    expect(screen.getByLabelText(/Cantidad/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/Ubicación/)).toHaveAttribute('aria-invalid', 'true')
    expect(alConfirmar).not.toHaveBeenCalled()
  })

  it('envía la recepción cuando todos los campos están completos', async () => {
    const alConfirmar = renderDialog()
    fireEvent.change(screen.getByLabelText(/Lote/), { target: { value: 'LOTE-1' } })
    fireEvent.change(screen.getByLabelText(/Vencimiento/), { target: { value: '2027-09-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar recepción' }))

    await waitFor(() => expect(alConfirmar).toHaveBeenCalledWith(expect.objectContaining({
      lineas: [expect.objectContaining({
        purchaseOrderItemId: 'linea-1',
        cantidad: '5',
        ubicacionId: 'ubicacion-1',
        lote: 'LOTE-1',
        fechaVencimiento: '2027-09-01',
      })],
    })))
  })
})
