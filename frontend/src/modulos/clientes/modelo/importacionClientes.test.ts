import { describe, expect, it } from 'vitest'
import { analizarRegistrosClientes, normalizarEncabezadoCliente } from './importacionClientes'

describe('importacionClientes', () => {
  it('normaliza encabezados de la exportación de Codeplex', () => {
    expect(normalizarEncabezadoCliente('Razón Social')).toBe('RAZON_SOCIAL')
    expect(normalizarEncabezadoCliente('RUC/DNI')).toBe('RUC_DNI')
  })

  it('mapea una fila válida e infiere RUC', () => {
    const result = analizarRegistrosClientes([{
      RUC_DNI: '20131312955',
      RAZON_SOCIAL: 'SUNAT',
      'DIRECCIÓN': 'AV. GARCILASO 1472',
      EMAIL: 'contacto@example.com',
      UBIGEO: '150101',
    }])

    expect(result.validCount).toBe(1)
    expect(result.rows[0]).toMatchObject({
      documentType: 'RUC',
      documentNumber: '20131312955',
      legalName: 'SUNAT',
      fiscalAddress: 'AV. GARCILASO 1472',
      ubigeoCode: '150101',
      warnings: [],
    })
  })

  it('normaliza marcadores vacíos de Codeplex sin rechazar la fila', () => {
    const result = analizarRegistrosClientes([{
      RUC_DNI: '73198724',
      TIPO_DOCUMENTO_IDENTIDAD: 'DOCUMENTO NACIONAL DE IDENTIDAD',
      RAZON_SOCIAL: 'PEREZ ECHEVERRIA ALEJANDRA VANESSA',
      NOMBRE_COMERCIAL: '10',
      TELEFONO: '10',
      'DIRECCIÓN': '-',
      EMAIL: '10',
      UBIGEO: '.',
    }])

    expect(result.validCount).toBe(1)
    expect(result.invalidCount).toBe(0)
    expect(result.warningCount).toBe(1)
    expect(result.rows[0]).toMatchObject({
      tradeName: '',
      phone: '',
      fiscalAddress: '',
      email: '',
      ubigeoCode: '',
      warnings: ['Se importará sin dirección fiscal.'],
    })
  })

  it('rechaza correos, ubigeos y documentos repetidos inválidos', () => {
    const result = analizarRegistrosClientes([
      { RUC_DNI: '20131312955', RAZON_SOCIAL: 'Cliente uno' },
      { RUC_DNI: '20131312955', RAZON_SOCIAL: 'Cliente repetido' },
      { RUC_DNI: '123', RAZON_SOCIAL: '', EMAIL: 'incorrecto', UBIGEO: '15' },
    ])

    expect(result.validCount).toBe(1)
    expect(result.invalidCount).toBe(2)
    expect(result.rows[1]?.errors).toContain('Documento repetido dentro del archivo.')
    expect(result.rows[2]?.errors).toEqual(expect.arrayContaining([
      'La razón social es obligatoria y admite hasta 160 caracteres.',
      'El correo no es válido.',
      'El ubigeo debe tener 6 dígitos.',
    ]))
  })
})
