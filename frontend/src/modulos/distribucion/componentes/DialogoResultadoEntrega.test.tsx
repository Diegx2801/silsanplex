import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { fechaActualPeru } from '@/lib/fechas'
import { DialogoResultadoEntrega } from '@/modulos/distribucion/componentes/DialogoResultadoEntrega'
import {
  esquemaProgramacionEntrega,
  type ProgramacionEntrega,
  type ResultadoEntrega,
} from '@/modulos/distribucion/modelo/programacionEntrega'

type ConfirmarResultado = (resultado: ResultadoEntrega, operationKey: string) => Promise<string | undefined>

const fecha = fechaActualPeru()

function crearEntrega(overrides: Partial<ProgramacionEntrega> = {}) {
  return esquemaProgramacionEntrega.parse({
    id: 'delivery-1',
    lockVersion: 3,
    pedidoId: 'order-1',
    pedidoNumero: 'PED-E2E-1',
    clienteNombre: 'Cliente de prueba',
    fechaEmision: '2026-01-01',
    fechaProgramada: fecha,
    estado: 'en_destino',
    seguimiento: 'en_destino',
    lineas: [{
      id: '11111111-1111-4111-8111-111111111111',
      productoId: 'product-1',
      productoCodigo: 'E2E-1',
      productoDescripcion: 'Producto de prueba',
      unidadMedida: 'UND',
      cantidad: 6,
      precioUnitario: 10,
      lote: 'LOTE-E2E',
      fechaVencimiento: '2027-01-01',
      cantidadDespachada: 6,
      cantidadEntregadaCliente: 0,
      cantidadPendienteCliente: 6,
    }],
    resultadosEntrega: [],
    ...overrides,
  })
}

function renderDialog(alConfirmar: ConfirmarResultado, entrega = crearEntrega()) {
  const alCambiarApertura = vi.fn()
  const view = render(
    <DialogoResultadoEntrega
      abierto
      entrega={entrega}
      alCambiarApertura={alCambiarApertura}
      alConfirmar={alConfirmar}
    />,
  )
  return { ...view, alCambiarApertura }
}

describe('DialogoResultadoEntrega', () => {
  it('conserva comando y clave para reintentar tras refrescar una entrega ya confirmada', async () => {
    const alConfirmar = vi.fn<ConfirmarResultado>()
      .mockResolvedValueOnce('Fallo de red')
      .mockResolvedValueOnce(undefined)
    const { rerender, alCambiarApertura } = renderDialog(alConfirmar)

    fireEvent.change(screen.getByLabelText('Recibido ahora'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText(/^Evidencia o constancia/), { target: { value: 'CONSTANCIA-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega completa' }))
    await waitFor(() => expect(alConfirmar).toHaveBeenCalledTimes(1))

    const entregaActualizada = crearEntrega({
      lockVersion: 4,
      estado: 'entregado',
      lineas: crearEntrega().lineas.map((linea) => ({
        ...linea,
        cantidadEntregadaCliente: 6,
        cantidadPendienteCliente: 0,
      })),
      resultadosEntrega: [{
        id: 'outcome-1',
        resultado: 'entregado',
        fecha,
        evidencia: 'CONSTANCIA-1',
        incidencias: [],
        lineas: [{ orderLineId: '11111111-1111-4111-8111-111111111111', cantidad: 6 }],
      }],
    })
    rerender(
      <DialogoResultadoEntrega
        abierto
        entrega={entregaActualizada}
        alCambiarApertura={alCambiarApertura}
        alConfirmar={alConfirmar}
      />,
    )

    expect(screen.getByLabelText('Recibido ahora')).toHaveValue(6)
    expect(screen.getByLabelText(/^Evidencia o constancia/)).toHaveValue('CONSTANCIA-1')
    const confirmacion = screen.getByRole('button', { name: 'Confirmar entrega completa' })
    expect(confirmacion).toBeEnabled()
    fireEvent.click(confirmacion)

    await waitFor(() => expect(alConfirmar).toHaveBeenCalledTimes(2))
    expect(alConfirmar.mock.calls[1][1]).toBe(alConfirmar.mock.calls[0][1])
    expect(alConfirmar.mock.calls[1][0]).toEqual(alConfirmar.mock.calls[0][0])
    expect(alCambiarApertura).toHaveBeenCalledWith(false)
  })

  it('genera otra clave si se editan cantidades o evidencia después de un error', async () => {
    const alConfirmar = vi.fn<ConfirmarResultado>()
      .mockResolvedValueOnce('Fallo de red')
      .mockResolvedValueOnce('Conflicto por evidencia')
      .mockResolvedValueOnce('Conflicto por cantidad')
    renderDialog(alConfirmar)

    fireEvent.change(screen.getByLabelText('Recibido ahora'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText(/^Evidencia o constancia/), { target: { value: 'CONSTANCIA-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega completa' }))
    await waitFor(() => expect(alConfirmar).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText(/^Evidencia o constancia/), { target: { value: 'CONSTANCIA-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega completa' }))
    await waitFor(() => expect(alConfirmar).toHaveBeenCalledTimes(2))

    expect(alConfirmar.mock.calls[1][1]).not.toBe(alConfirmar.mock.calls[0][1])
    expect(alConfirmar.mock.calls[1][0].evidencia).toBe('CONSTANCIA-2')
    expect(screen.getByRole('alert')).toHaveTextContent('Conflicto por evidencia')

    fireEvent.change(screen.getByLabelText('Recibido ahora'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega parcial' }))
    await waitFor(() => expect(alConfirmar).toHaveBeenCalledTimes(3))

    expect(alConfirmar.mock.calls[2][1]).not.toBe(alConfirmar.mock.calls[1][1])
    expect(alConfirmar.mock.calls[2][0].lineas).toEqual([
      { orderLineId: '11111111-1111-4111-8111-111111111111', cantidad: 5 },
    ])
    expect(screen.getByRole('alert')).toHaveTextContent('Conflicto por cantidad')
  })
})
