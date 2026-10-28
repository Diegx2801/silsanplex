import type { ComprobanteSandbox } from '../modelo/comprobanteSandbox'

export const organizacionFiscalPrueba = '11111111-1111-4111-8111-111111111111'
export const documentoFiscalPrueba = '22222222-2222-4222-8222-222222222222'
export const otraOrganizacionFiscal = '33333333-3333-4333-8333-333333333333'
export const actorFiscalPrueba = '44444444-4444-4444-8444-444444444444'

// DTO ficticio: reproduce jsonb_build_object y casts numeric de las migraciones 149/150.
export function crearComprobanteSandbox(congelado = false): ComprobanteSandbox {
  const snapshot: ComprobanteSandbox['snapshot'] = {
    schemaVersion: 'CPE-PE-DOM-PEN-1',
    ruleSetHash: 'cb5e871cfe3b81abea7faf25b156e5d35b21e8c4837979350919926612da73b6',
    modality: 'local_test', organizationId: organizacionFiscalPrueba, environment: 'sandbox',
    saleId: documentoFiscalPrueba, orderId: actorFiscalPrueba, saleDate: '2026-10-24',
    issuer: {
      id: actorFiscalPrueba, version: '1', ruc: '20000000001', legalName: 'SANDBOX EMISOR FICTICIO',
      address: { line: 'Dirección ficticia 123', district: 'Distrito ficticio', province: 'Provincia ficticia',
        department: 'Departamento ficticio', ubigeo: '150101', country: 'PE' },
      establishmentCode: '0000',
    },
    buyer: {
      customerId: actorFiscalPrueba, type: '6', number: '20000000001', name: 'RECEPTOR FICTICIO',
      address: { id: documentoFiscalPrueba, line: 'Dirección fiscal ficticia', ubigeo: '150101', country: 'PE' },
    },
    currency: 'PEN', operationType: '0101', issueDate: '2026-10-24', documentType: '01', series: 'F001',
    pricesIncludeTax: true,
    items: [{
      saleItemId: actorFiscalPrueba, productId: documentoFiscalPrueba, code: 'FICTICIO', description: 'Producto ficticio',
      unit: 'NIU', quantity: '1.000', commercialPrice: '118.0000', unitNet: '100.0000000000',
      unitGross: '118.0000000000', affectation: '10', taxCode: '1000', rate: '18.00000',
      base: '100.00', tax: '18.00', total: '118.00',
    }],
    payment: { kind: 'contado' },
    totals: { taxableBase: '100.00', exemptAmount: '0.00', unaffectedAmount: '0.00',
      subtotal: '100.00', tax: '18.00', total: '118.00' },
  }
  if (congelado) Object.assign(snapshot, { number: '1', confirmedBy: actorFiscalPrueba,
    confirmedAt: '2026-10-24T12:00:00+00:00', issueTime: '07:00:00', taxValidity: 'NONE_SANDBOX' })
  return {
    documentId: documentoFiscalPrueba, state: congelado ? 'frozen' : 'prepared',
    snapshotHash: 'a'.repeat(64), version: congelado ? '2' : '1', snapshot,
    fiscalIdentity: congelado ? { environment: 'sandbox', ruc: snapshot.issuer.ruc,
      documentType: '01', series: 'F001', number: '1' } : null,
  }
}
