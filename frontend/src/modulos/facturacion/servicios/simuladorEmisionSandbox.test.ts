import { describe, expect, it, vi } from 'vitest'

import { crearComprobanteSandbox } from '../__fixtures__/comprobanteSandbox'
import { descargarReciboSimulado, simularComprobanteSandbox } from './simuladorEmisionSandbox'

describe('simulador local del adaptador fiscal', () => {
  it('produce únicamente evidencia JSON ficticia desde un snapshot congelado', async () => {
    const comprobante = crearComprobanteSandbox(true)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const simulation = await simularComprobanteSandbox(comprobante)
    fetchSpy.mockRestore()

    expect(simulation.resultado.simulated).toBe(true)
    expect(simulation.resultado.status).toBe('accepted')
    expect(simulation.recibo.kind).toBe('simulation_receipt')
    expect(simulation.recibo.simulated).toBe(true)
    const receipt = JSON.parse(new TextDecoder().decode(simulation.recibo.content)) as Record<string, unknown>
    expect(receipt).toMatchObject({
      simulated: true,
      providerReference: simulation.resultado.providerReference,
      identity: simulation.resultado.identity,
      documentId: comprobante.documentId,
      organizationId: comprobante.snapshot.organizationId,
      snapshotHash: comprobante.snapshotHash,
    })
    expect(simulation.resultado.identity).toMatchObject({
      organizationId: comprobante.snapshot.organizationId,
      documentId: comprobante.documentId,
      environment: 'sandbox',
      issuerRuc: comprobante.snapshot.issuer.ruc,
      documentType: comprobante.snapshot.documentType,
      series: comprobante.snapshot.series,
      number: comprobante.snapshot.number,
      snapshotHash: comprobante.snapshotHash,
    })
    expect(String(receipt.message)).toMatch(/No es un CDR de SUNAT/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rechaza un documento preparado antes de invocar el simulador', async () => {
    await expect(simularComprobanteSandbox(crearComprobanteSandbox(false))).rejects.toThrow('FISCAL_SIMULATION_SANDBOX_ONLY')
  })

  it('descarga solo evidencia marcada como simulación', () => {
    vi.useFakeTimers()
    const createObjectURL = vi.fn(() => 'blob:simulacion-local')
    const revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const recibo = {
      identity: {
        organizationId: '11111111-1111-4111-8111-111111111111',
        documentId: '8ce4c3a7-9b08-4e1f-9a62-6ab0ab4f5d22',
        environment: 'sandbox' as const,
        issuerRuc: '20000000001',
        documentType: '01' as const,
        series: 'F001',
        number: '1',
        snapshotHash: 'a'.repeat(64),
      },
      documentId: '8ce4c3a7-9b08-4e1f-9a62-6ab0ab4f5d22',
      providerReference: 'SIM-000000000000000000000000',
      kind: 'simulation_receipt' as const,
      fileName: 'simulacion.json',
      mediaType: 'application/json',
      content: new TextEncoder().encode('{"simulated":true}'),
      sha256: 'a'.repeat(64),
      createdAt: new Date().toISOString(),
      simulated: true,
    }
    descargarReciboSimulado(recibo)
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.runOnlyPendingTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:simulacion-local')
    expect(() => descargarReciboSimulado({ ...recibo, simulated: false })).toThrow('FISCAL_SIMULATION_EVIDENCE_INVALID')
    click.mockRestore()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
})
