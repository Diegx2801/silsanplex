import { describe, expect, it } from 'vitest'
import { analizarRegistrosProveedores } from '@/modulos/proveedores/modelo/importacionProveedores'

describe('analizarRegistrosProveedores', () => {
  it('interpreta la exportación de Codeplex y limpia sus marcadores vacíos', () => {
    const analysis = analizarRegistrosProveedores([{
      RUC_DNI: '20131380951',
      TIPO_DOCUMENTO_IDENTIDAD: 'REGISTRO ÚNICO DE CONTRIBUYENTE',
      RAZON_SOCIAL: 'MUNICIPALIDAD METROPOLITANA DE LIMA',
      DIRECCION: '-',
      CODIGO: 'SS000001',
    }])
    expect(analysis.invalidCount).toBe(0)
    expect(analysis.rows[0]).toMatchObject({ documentType: 'RUC', fiscalAddress: '', code: 'SS000001' })
    expect(analysis.rows[0]?.warnings).toContain('Se importará sin dirección fiscal.')
  })

  it('rechaza documentos duplicados y correos inválidos sin bloquear otras filas', () => {
    const analysis = analizarRegistrosProveedores([
      { RUC_DNI: '20131380951', RAZON_SOCIAL: 'Proveedor válido' },
      { RUC_DNI: '20131380951', RAZON_SOCIAL: 'Duplicado', EMAIL: 'correo-invalido' },
      { RUC_DNI: '12345678', RAZON_SOCIAL: 'Persona válida' },
    ])
    expect(analysis.validCount).toBe(2)
    expect(analysis.invalidCount).toBe(1)
    expect(analysis.rows[1]?.errors.join(' ')).toContain('correo')
    expect(analysis.rows[1]?.errors.join(' ')).toContain('repetido')
  })
})
