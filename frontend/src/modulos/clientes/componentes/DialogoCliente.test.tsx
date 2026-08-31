import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DialogoCliente } from './DialogoCliente'

const resultado = {
  lookupId: '11111111-1111-4111-8111-111111111111',
  ruc: '20550154065',
  legalName: 'EMPRESA DE PRUEBA S.A.C.',
  taxpayerStatus: 'ACTIVO',
  domicileCondition: 'HABIDO',
  ubigeoCode: '150140',
  fiscalAddress: 'AV. PRUEBA 123',
  source: 'DECOLECTA',
  checkedAt: '2026-08-21T12:00:00.000Z',
  cacheHit: false,
}

function renderDialog(alConsultarRuc = vi.fn().mockResolvedValue(resultado)) {
  const alGuardar = vi.fn().mockResolvedValue(undefined)
  render(
    <DialogoCliente
      abierto
      cliente={null}
      alCambiarApertura={vi.fn()}
      alGuardar={alGuardar}
      alConsultarRuc={alConsultarRuc}
      alRestaurarFoco={vi.fn()}
    />,
  )
  return { alConsultarRuc, alGuardar }
}

describe('DialogoCliente', () => {
  it('consulta el RUC y autocompleta únicamente los datos tributarios', async () => {
    const { alConsultarRuc, alGuardar } = renderDialog()
    fireEvent.change(screen.getByLabelText('Número de documento *'), {
      target: { value: resultado.ruc },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar RUC' }))

    await waitFor(() => expect(alConsultarRuc).toHaveBeenCalledWith(resultado.ruc))
    expect(screen.getByLabelText('Nombre o razón social *')).toHaveValue(resultado.legalName)
    expect(screen.getByLabelText('Dirección fiscal')).toHaveValue(resultado.fiscalAddress)
    expect(screen.getByLabelText('Ubigeo fiscal')).toHaveValue(resultado.ubigeoCode)
    expect(screen.getByLabelText('Estado SUNAT')).toHaveValue(resultado.taxpayerStatus)
    expect(screen.getByLabelText('Condición de domicilio')).toHaveValue(resultado.domicileCondition)

    fireEvent.click(screen.getByRole('button', { name: 'Registrar cliente' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({
        fuenteDatosFiscales: 'DECOLECTA',
        fechaConsultaSunat: resultado.checkedAt,
      }),
      undefined,
    ))
  })

  it('mantiene disponible el ingreso manual cuando el proveedor falla', async () => {
    renderDialog(vi.fn().mockRejectedValue(new Error('Servicio temporalmente no disponible.')))
    fireEvent.change(screen.getByLabelText('Número de documento *'), {
      target: { value: resultado.ruc },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar RUC' }))

    expect(await screen.findByText('Servicio temporalmente no disponible.')).toBeVisible()
    expect(screen.getByLabelText('Nombre o razón social *')).not.toBeDisabled()
    expect(screen.getByLabelText('Dirección fiscal')).not.toBeDisabled()
  })
})
