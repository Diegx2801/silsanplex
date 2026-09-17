import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Compra } from '@/modulos/compras/modelo/compras'

import { DialogoConfirmacionEmision } from './DialogoConfirmacionEmision'

const compra = {
  id: 'compra-1',
  proveedorId: 'proveedor-1',
  proveedorDocumento: '20123456789',
  proveedorNombre: 'Proveedor de prueba',
  tipoDocumento: 'factura',
  serie: 'F001',
  numero: '000001',
  fechaEmision: '2026-09-16',
  fechaVencimientoPago: '',
  fechaEntregaEsperada: '',
  almacenId: '11111111-1111-4111-8111-111111111111',
  almacen: 'Almacén central',
  preciosIncluyenIgv: true,
  observacion: '',
  lineas: [],
  estado: 'borrador',
  fechaRegistro: '2026-09-16T12:00:00.000Z',
  fechaEmisionOrden: null,
  fechaRecepcion: null,
  total: 118,
} satisfies Compra

function renderDialog(alConfirmar = vi.fn().mockResolvedValue(undefined)) {
  const alCambiarApertura = vi.fn()
  render(
    <DialogoConfirmacionEmision
      abierto
      compra={compra}
      alCambiarApertura={alCambiarApertura}
      alConfirmar={alConfirmar}
      alRestaurarFoco={vi.fn()}
    />,
  )
  return { alConfirmar, alCambiarApertura }
}

describe('DialogoConfirmacionEmision', () => {
  it('muestra el resumen y solo emite al confirmar explícitamente', async () => {
    const { alConfirmar, alCambiarApertura } = renderDialog()

    expect(screen.getByText('F001-000001')).toBeVisible()
    expect(screen.getByText('Proveedor de prueba')).toBeVisible()
    expect(screen.getByText(/118\.00/)).toBeVisible()
    expect(alConfirmar).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar emisión' }))

    await waitFor(() => expect(alConfirmar).toHaveBeenCalledOnce())
    expect(alCambiarApertura).toHaveBeenCalledWith(false)
  })

  it('conserva el diálogo abierto si la emisión falla', async () => {
    const { alConfirmar, alCambiarApertura } = renderDialog(
      vi.fn().mockResolvedValue('La orden ya no está disponible para emitir'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar emisión' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La orden ya no está disponible para emitir')
    expect(alConfirmar).toHaveBeenCalledOnce()
    expect(alCambiarApertura).not.toHaveBeenCalledWith(false)
  })
})
