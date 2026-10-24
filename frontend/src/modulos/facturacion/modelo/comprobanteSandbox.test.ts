import { describe, expect, it } from 'vitest'

import { crearComprobanteSandbox, documentoFiscalPrueba, organizacionFiscalPrueba, otraOrganizacionFiscal } from '../__fixtures__/comprobanteSandbox'
import { leerComprobanteSandbox } from './comprobanteSandbox'

const leer = (data: unknown) => leerComprobanteSandbox(data, organizacionFiscalPrueba, documentoFiscalPrueba)

describe('contrato de lectura fiscal sandbox', () => {
  it.each([false, true])('lee el DTO de PostgreSQL sin convertir importes o versiones: frozen=%s', (congelado) => {
    const dto = crearComprobanteSandbox(congelado)
    dto.version = '9007199254740993'
    const resultado = leer(dto)
    expect(resultado).toEqual(dto)
    expect(resultado.version).toBe('9007199254740993')
    expect(resultado.snapshot.items[0].unitNet).toBe('100.0000000000')
    expect(resultado.snapshot.totals.total).toBe('118.00')
  })

  it('admite una boleta identificada sin dirección y el pago a crédito ya calculado', () => {
    const dto = crearComprobanteSandbox()
    Object.assign(dto.snapshot, { documentType: '03', series: 'B001' })
    Object.assign(dto.snapshot.buyer, { type: '1', number: '00000000', address: null })
    dto.snapshot.payment = { kind: 'credito', outstanding: '118.00', paidAtIssue: '0.00',
      installments: [{ id: 'Cuota001', amount: '118.00', dueDate: '2026-11-24' }] }
    expect(leer(dto)).toEqual(dto)
  })

  it.each(['signed', 'submitted', 'accepted', 'rejected'])('no presenta %s como estado sandbox válido', (state) => {
    expect(() => leer({ ...crearComprobanteSandbox(), state })).toThrow()
  })

  it.each(['environment', 'modality', 'schemaVersion', 'currency'])('rechaza otro contrato en %s', (campo) => {
    const dto = crearComprobanteSandbox()
    expect(() => leer({ ...dto, snapshot: { ...dto.snapshot, [campo]: 'no-soportado' } })).toThrow()
  })

  it('rechaza documentos de otra organización o de otra identidad', () => {
    const dto = crearComprobanteSandbox()
    expect(() => leer({ ...dto, documentId: otraOrganizacionFiscal })).toThrow()
    dto.snapshot.organizationId = otraOrganizacionFiscal
    expect(() => leer(dto)).toThrow()
  })

  it('no descarta silenciosamente campos fuera del contrato de snapshot', () => {
    const dto = crearComprobanteSandbox()
    expect(() => leer({ ...dto, snapshot: { ...dto.snapshot, signedXml: 'no-es-parte-de-esta-fase' } })).toThrow()
  })

  it.each([118, '118', '118.001', '1e2', 'NaN', '-1.00'])('rechaza importes sin escala fiscal: %s', (total) => {
    const dto = crearComprobanteSandbox()
    expect(() => leer({ ...dto, snapshot: { ...dto.snapshot, totals: { ...dto.snapshot.totals, total } } })).toThrow()
  })

  it.each(['0', 'NaN', '1.5', '9223372036854775808'])('rechaza versiones inválidas: %s', (version) => {
    expect(() => leer({ ...crearComprobanteSandbox(), version })).toThrow()
  })

  it('rechaza una fecha imposible y una serie que no corresponde al tipo', () => {
    const dto = crearComprobanteSandbox()
    expect(() => leer({ ...dto, snapshot: { ...dto.snapshot, issueDate: '2026-02-30' } })).toThrow()
    expect(() => leer({ ...dto, snapshot: { ...dto.snapshot, series: 'B001' } })).toThrow()
  })

  it('exige identidad y confirmación completas únicamente para frozen', () => {
    const dto = crearComprobanteSandbox(true)
    expect(() => leer({ ...dto, fiscalIdentity: null })).toThrow()
    expect(() => leer({ ...dto, state: 'prepared' })).toThrow()
    expect(() => leer({ ...dto, snapshot: { ...dto.snapshot, taxValidity: undefined } })).toThrow()
    expect(() => leer({ ...dto, fiscalIdentity: { ...dto.fiscalIdentity, number: '2' } })).toThrow()
  })

  it('no lee maestros vivos ni conserva referencias al DTO original', () => {
    const dto = crearComprobanteSandbox(true)
    const resultado = leer(dto)
    dto.snapshot.buyer.name = 'Maestro modificado después de la consulta'
    expect(resultado.snapshot.buyer.name).toBe('RECEPTOR FICTICIO')
  })
})
