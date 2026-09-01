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
    expect(screen.getByLabelText('Nombre o razón social *')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Dirección fiscal')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Ubigeo fiscal')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Estado SUNAT')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Condición de domicilio')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Nombre comercial')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Persona de contacto')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Teléfono')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Correo')).not.toHaveAttribute('readonly')

    fireEvent.click(screen.getByRole('button', { name: 'Registrar cliente' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({
        nombreRazonSocial: resultado.legalName,
        direccion: resultado.fiscalAddress,
        ubigeo: resultado.ubigeoCode,
        estadoSunat: resultado.taxpayerStatus,
        condicionDomicilio: resultado.domicileCondition,
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
    expect(screen.getByLabelText('Nombre o razón social *')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Dirección fiscal')).not.toHaveAttribute('readonly')
  })

  it('invalida y limpia los datos fiscales al cambiar el RUC consultado', async () => {
    const { alGuardar } = renderDialog()
    fireEvent.change(screen.getByLabelText('Número de documento *'), {
      target: { value: resultado.ruc },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar RUC' }))
    await waitFor(() => expect(screen.getByLabelText('Nombre o razón social *')).toHaveValue(resultado.legalName))

    fireEvent.change(screen.getByLabelText('Número de documento *'), {
      target: { value: '20610712861' },
    })

    expect(screen.getByLabelText('Nombre o razón social *')).toHaveValue('')
    expect(screen.getByLabelText('Dirección fiscal')).toHaveValue('')
    expect(screen.getByLabelText('Ubigeo fiscal')).toHaveValue('')
    expect(screen.getByLabelText('Estado SUNAT')).toHaveValue('')
    expect(screen.getByLabelText('Condición de domicilio')).toHaveValue('')
    expect(screen.getByLabelText('Nombre o razón social *')).not.toHaveAttribute('readonly')
    expect(screen.queryByText(/Datos tributarios consultados el/)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Nombre o razón social *'), {
      target: { value: 'Cliente ingresado manualmente' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cliente' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({
        numeroDocumento: '20610712861',
        nombreRazonSocial: 'Cliente ingresado manualmente',
        fuenteDatosFiscales: '',
        fechaConsultaSunat: null,
      }),
      undefined,
    ))
  })

  it('descarta una respuesta tardía si el RUC cambió durante la consulta', async () => {
    let resolver: ((valor: typeof resultado) => void) | undefined
    const respuestaPendiente = new Promise<typeof resultado>((resolve) => { resolver = resolve })
    const alConsultarRuc = vi.fn().mockReturnValue(respuestaPendiente)
    renderDialog(alConsultarRuc)

    fireEvent.change(screen.getByLabelText('Número de documento *'), {
      target: { value: resultado.ruc },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar RUC' }))
    fireEvent.change(screen.getByLabelText('Número de documento *'), {
      target: { value: '20610712861' },
    })
    resolver?.(resultado)

    expect(await screen.findByText(/El número de RUC cambió durante la consulta/)).toBeVisible()
    expect(screen.getByLabelText('Nombre o razón social *')).toHaveValue('')
    expect(screen.getByLabelText('Dirección fiscal')).toHaveValue('')
    expect(screen.getByLabelText('Número de documento *')).toHaveValue('20610712861')
  })
})
