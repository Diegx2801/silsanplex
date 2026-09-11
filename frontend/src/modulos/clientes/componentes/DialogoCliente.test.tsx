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

const resultadoDni = {
  dni: '46027897',
  firstName: 'ERACLEO JUAN',
  firstLastName: 'HUAMANI',
  secondLastName: 'MENDOZA',
  fullName: 'HUAMANI MENDOZA ERACLEO JUAN',
  source: 'DECOLECTA_RENIEC',
  checkedAt: '2026-09-01T12:00:00.000Z',
}

function renderDialog(
  alConsultarRuc = vi.fn().mockResolvedValue(resultado),
  alConsultarDni = vi.fn().mockResolvedValue(resultadoDni),
) {
  const alGuardar = vi.fn().mockResolvedValue(undefined)
  render(
    <DialogoCliente
      abierto
      cliente={null}
      alCambiarApertura={vi.fn()}
      alGuardar={alGuardar}
      alConsultarRuc={alConsultarRuc}
      alConsultarDni={alConsultarDni}
      alRestaurarFoco={vi.fn()}
    />,
  )
  return { alConsultarRuc, alConsultarDni, alGuardar }
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

  it('consulta el DNI y autocompleta únicamente el nombre desde RENIEC', async () => {
    const { alConsultarDni, alGuardar } = renderDialog()
    fireEvent.change(screen.getByLabelText('Tipo de documento *'), { target: { value: 'dni' } })
    fireEvent.change(screen.getByLabelText('Número de documento *'), { target: { value: resultadoDni.dni } })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar DNI' }))

    await waitFor(() => expect(alConsultarDni).toHaveBeenCalledWith(resultadoDni.dni))
    expect(screen.getByLabelText('Nombre o razón social *')).toHaveValue(resultadoDni.fullName)
    expect(screen.getByLabelText('Nombre o razón social *')).toHaveAttribute('readonly')
    expect(screen.getByText(/Nombre obtenido de RENIEC/)).toBeVisible()
    expect(screen.getByLabelText('Dirección fiscal')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Ubigeo fiscal')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Estado SUNAT')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Condición de domicilio')).not.toHaveAttribute('readonly')

    fireEvent.click(screen.getByRole('button', { name: 'Registrar cliente' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({ nombreRazonSocial: resultadoDni.fullName, fuenteDatosFiscales: resultadoDni.source, fechaConsultaSunat: resultadoDni.checkedAt }),
      undefined,
    ))
  })

  it('reabre un cliente DNI consultado sin bloquear sus datos fiscales', () => {
    render(
      <DialogoCliente
        abierto
        cliente={{
          id: '11111111-1111-4111-8111-111111111111',
          organizacionId: '22222222-2222-4222-8222-222222222222',
          tipoDocumento: 'dni',
          numeroDocumento: resultadoDni.dni,
          nombreRazonSocial: resultadoDni.fullName,
          nombreComercial: '', contacto: '', email: '', telefono: '', direccion: '', ubigeo: '',
          estadoSunat: '', condicionDomicilio: '', direccionesEntrega: [], activo: true,
          fuenteDatosFiscales: resultadoDni.source,
          fechaConsultaSunat: resultadoDni.checkedAt,
          fechaRegistro: '2026-09-01T12:00:00.000Z',
          fechaActualizacion: '2026-09-01T12:00:00.000Z',
        }}
        alCambiarApertura={vi.fn()}
        alGuardar={vi.fn().mockResolvedValue(undefined)}
        alConsultarRuc={vi.fn().mockResolvedValue(resultado)}
        alConsultarDni={vi.fn().mockResolvedValue(resultadoDni)}
        alRestaurarFoco={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Nombre o razón social *')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Dirección fiscal')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Ubigeo fiscal')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Estado SUNAT')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Condición de domicilio')).not.toHaveAttribute('readonly')
  })

  it('reabre un cliente RUC consultado manteniendo protegidos sus datos tributarios', () => {
    render(
      <DialogoCliente
        abierto
        cliente={{
          id: '11111111-1111-4111-8111-111111111111',
          organizacionId: '22222222-2222-4222-8222-222222222222',
          tipoDocumento: 'ruc',
          numeroDocumento: resultado.ruc,
          nombreRazonSocial: resultado.legalName,
          nombreComercial: '', contacto: '', email: '', telefono: '', direccion: resultado.fiscalAddress,
          ubigeo: resultado.ubigeoCode, estadoSunat: resultado.taxpayerStatus,
          condicionDomicilio: 'HABIDO', direccionesEntrega: [], activo: true,
          fuenteDatosFiscales: resultado.source,
          fechaConsultaSunat: resultado.checkedAt,
          fechaRegistro: '2026-08-21T12:00:00.000Z',
          fechaActualizacion: '2026-08-21T12:00:00.000Z',
        }}
        alCambiarApertura={vi.fn()}
        alGuardar={vi.fn().mockResolvedValue(undefined)}
        alConsultarRuc={vi.fn().mockResolvedValue(resultado)}
        alConsultarDni={vi.fn().mockResolvedValue(resultadoDni)}
        alRestaurarFoco={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Nombre o razón social *')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Dirección fiscal')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Ubigeo fiscal')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Estado SUNAT')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Condición de domicilio')).toHaveAttribute('readonly')
  })

  it('muestra errores accesibles y permite omitir el teléfono', async () => {
    const { alGuardar } = renderDialog()
    fireEvent.change(screen.getByLabelText('Número de documento *'), { target: { value: resultado.ruc } })
    fireEvent.change(screen.getByLabelText('Nombre o razón social *'), { target: { value: 'Cliente válido' } })
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '987-654' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cliente' }))

    const telefono = screen.getByLabelText('Teléfono')
    const error = await screen.findByText('El teléfono debe contener solo números')
    expect(error).toHaveAttribute('role', 'alert')
    expect(telefono).toHaveAttribute('aria-invalid', 'true')
    expect(telefono).toHaveAttribute('aria-describedby', 'cliente-telefono-error')
    expect(alGuardar).not.toHaveBeenCalled()

    fireEvent.change(telefono, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cliente' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalled())
  })

  it('aplica el límite y teclado numérico según el tipo de documento', () => {
    renderDialog()
    const tipo = screen.getByLabelText('Tipo de documento *')
    const documento = screen.getByLabelText('Número de documento *')

    expect(documento).toHaveAttribute('maxlength', '11')
    expect(documento).toHaveAttribute('inputmode', 'numeric')

    fireEvent.change(tipo, { target: { value: 'dni' } })
    expect(documento).toHaveValue('')
    expect(documento).toHaveAttribute('maxlength', '8')
    expect(documento).toHaveAttribute('inputmode', 'numeric')

    fireEvent.change(tipo, { target: { value: 'ce' } })
    expect(documento).toHaveAttribute('maxlength', '20')
    expect(documento).toHaveAttribute('inputmode', 'text')
  })

  it('muestra un resumen visible y enfoca el primer campo inválido', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cliente' }))

    expect(await screen.findByText('Revisa los campos marcados antes de guardar.')).toBeVisible()
    expect(screen.getByLabelText('Número de documento *')).toHaveFocus()
  })

  it('abre automáticamente una dirección nueva y señala su error específico', async () => {
    const { alGuardar } = renderDialog()
    fireEvent.change(screen.getByLabelText('Número de documento *'), { target: { value: resultado.ruc } })
    fireEvent.change(screen.getByLabelText('Nombre o razón social *'), { target: { value: 'Cliente válido' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))

    const tarjeta = screen.getByRole('button', { name: /Dirección 1/ })
    expect(tarjeta).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cliente' }))

    expect(await screen.findByText('Ingresa la dirección')).toBeVisible()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(tarjeta).toHaveAttribute('aria-expanded', 'true')
    expect(alGuardar).not.toHaveBeenCalled()
  })

  it('mantiene una sola dirección principal al seleccionar otra', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))

    const principales = screen.getAllByRole('checkbox', { name: 'Dirección principal' })
    expect(principales[0]).toBeChecked()
    expect(principales[1]).not.toBeChecked()

    fireEvent.click(principales[1])
    await waitFor(() => {
      expect(principales[0]).not.toBeChecked()
      expect(principales[1]).toBeChecked()
    })
  })

  it('valida el formato del DNI antes de consultar', async () => {
    const { alConsultarDni } = renderDialog()
    fireEvent.change(screen.getByLabelText('Tipo de documento *'), { target: { value: 'dni' } })
    fireEvent.change(screen.getByLabelText('Número de documento *'), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar DNI' }))

    expect(await screen.findByText('El DNI debe contener 8 dígitos')).toBeVisible()
    expect(alConsultarDni).not.toHaveBeenCalled()
  })

  it('conserva el ingreso manual cuando el DNI no se encuentra', async () => {
    const alConsultarDni = vi.fn().mockRejectedValue(new Error('No se encontró el DNI consultado.'))
    renderDialog(undefined, alConsultarDni)
    fireEvent.change(screen.getByLabelText('Tipo de documento *'), { target: { value: 'dni' } })
    fireEvent.change(screen.getByLabelText('Número de documento *'), { target: { value: resultadoDni.dni } })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar DNI' }))

    expect(await screen.findByText('No se encontró el DNI consultado.')).toBeVisible()
    expect(screen.getByLabelText('Nombre o razón social *')).not.toHaveAttribute('readonly')
  })

  it('invalida y limpia el nombre al cambiar el DNI consultado', async () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText('Tipo de documento *'), { target: { value: 'dni' } })
    fireEvent.change(screen.getByLabelText('Número de documento *'), { target: { value: resultadoDni.dni } })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar DNI' }))
    await waitFor(() => expect(screen.getByLabelText('Nombre o razón social *')).toHaveValue(resultadoDni.fullName))

    fireEvent.change(screen.getByLabelText('Número de documento *'), { target: { value: '12345678' } })
    expect(screen.getByLabelText('Nombre o razón social *')).toHaveValue('')
    expect(screen.getByLabelText('Nombre o razón social *')).not.toHaveAttribute('readonly')
  })

  it('invalida la consulta DNI al cambiar el tipo de documento', async () => {
    renderDialog()
    const tipo = screen.getByLabelText('Tipo de documento *')
    fireEvent.change(tipo, { target: { value: 'dni' } })
    fireEvent.change(screen.getByLabelText('Número de documento *'), { target: { value: resultadoDni.dni } })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar DNI' }))
    await waitFor(() => expect(screen.getByLabelText('Nombre o razón social *')).toHaveValue(resultadoDni.fullName))

    fireEvent.change(tipo, { target: { value: 'otro' } })
    expect(screen.getByLabelText('Nombre o razón social *')).toHaveValue('')
    expect(screen.getByLabelText('Nombre o razón social *')).not.toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: 'Consultar DNI' })).not.toBeInTheDocument()
  })

  it('descarta una respuesta tardía si el DNI cambió durante la consulta', async () => {
    let resolver: ((valor: typeof resultadoDni) => void) | undefined
    const respuestaPendiente = new Promise<typeof resultadoDni>((resolve) => { resolver = resolve })
    const alConsultarDni = vi.fn().mockReturnValue(respuestaPendiente)
    renderDialog(undefined, alConsultarDni)
    fireEvent.change(screen.getByLabelText('Tipo de documento *'), { target: { value: 'dni' } })
    fireEvent.change(screen.getByLabelText('Número de documento *'), { target: { value: resultadoDni.dni } })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar DNI' }))
    fireEvent.change(screen.getByLabelText('Número de documento *'), { target: { value: '12345678' } })
    resolver?.(resultadoDni)

    expect(await screen.findByText(/El número de DNI cambió durante la consulta/)).toBeVisible()
    expect(screen.getByLabelText('Nombre o razón social *')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Consultar DNI' })).toBeEnabled()
  })
})
