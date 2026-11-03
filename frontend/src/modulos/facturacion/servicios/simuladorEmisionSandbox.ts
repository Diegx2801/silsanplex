import type {
  ComprobanteCongelado,
  EvidenciaFiscal,
  IdentidadComprobanteFiscal,
  ResultadoProveedorFiscal,
} from '../../../../../backend/supabase/functions/_shared/fiscal/adapter.ts'
import { SimuladorEmisionFiscalLocal } from '../../../../../backend/supabase/functions/_shared/fiscal/simulador-local.ts'
import type { ComprobanteSandbox } from '@/modulos/facturacion/modelo/comprobanteSandbox'

const simuladorLocal = new SimuladorEmisionFiscalLocal()

export interface ResultadoSimulacionSandbox {
  readonly resultado: ResultadoProveedorFiscal
  readonly recibo: EvidenciaFiscal
}

/**
 * Simula en memoria un documento congelado. No invoca fetch, Supabase, una outbox,
 * un proveedor ni SUNAT; el documento persistido se obtiene por la RPC autorizada.
 */
export async function simularComprobanteSandbox(
  comprobante: ComprobanteSandbox,
): Promise<ResultadoSimulacionSandbox> {
  if (comprobante.state !== 'frozen' || comprobante.snapshot.modality !== 'local_test') {
    throw new Error('FISCAL_SIMULATION_SANDBOX_ONLY')
  }
  const number = comprobante.snapshot.number
  if (!number) throw new Error('FISCAL_SIMULATION_SANDBOX_ONLY')

  try {
    const identity: IdentidadComprobanteFiscal = {
      organizationId: comprobante.snapshot.organizationId,
      documentId: comprobante.documentId,
      environment: comprobante.snapshot.environment,
      issuerRuc: comprobante.snapshot.issuer.ruc,
      documentType: comprobante.snapshot.documentType,
      series: comprobante.snapshot.series,
      number,
      snapshotHash: comprobante.snapshotHash,
    }
    const document = {
      identity,
      organizationId: comprobante.snapshot.organizationId,
      documentId: comprobante.documentId,
      environment: comprobante.snapshot.environment,
      state: comprobante.state,
      snapshotHash: comprobante.snapshotHash,
      snapshot: comprobante.snapshot,
    } as unknown as ComprobanteCongelado
    const submitted = await simuladorLocal.submit(document, crypto.randomUUID())
    const resultado = await simuladorLocal.query(identity, submitted.providerReference)
    const [recibo] = await simuladorLocal.downloadEvidence(identity, submitted.providerReference)
    if (!resultado.simulated || !recibo?.simulated || recibo.kind !== 'simulation_receipt') {
      throw new Error('FISCAL_SIMULATION_RESPONSE_INVALID')
    }
    return { resultado, recibo }
  } catch {
    throw new Error('No se pudo completar la simulación local de este snapshot congelado.')
  }
}

export function descargarReciboSimulado(recibo: EvidenciaFiscal): void {
  if (!recibo.simulated || recibo.kind !== 'simulation_receipt') {
    throw new Error('FISCAL_SIMULATION_EVIDENCE_INVALID')
  }
  const content = new ArrayBuffer(recibo.content.byteLength)
  new Uint8Array(content).set(recibo.content)
  const url = URL.createObjectURL(new Blob([content], { type: recibo.mediaType }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = recibo.fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
