import { beforeEach, describe, expect, it, vi } from 'vitest'

import { crearComprobanteSandbox, documentoFiscalPrueba, organizacionFiscalPrueba, otraOrganizacionFiscal } from '../__fixtures__/comprobanteSandbox'
import { consultarComprobanteSandbox } from './comprobantesSandboxService'

const { rpc, abortSignal } = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

describe('consulta fiscal mediante sesión ordinaria', () => {
  beforeEach(() => { rpc.mockReset(); abortSignal.mockReset() })

  it('invoca únicamente la RPC de lectura y conserva el snapshot fiscal', async () => {
    const dto = crearComprobanteSandbox(true)
    rpc.mockResolvedValue({ data: dto, error: null })
    expect(await consultarComprobanteSandbox(organizacionFiscalPrueba, documentoFiscalPrueba)).toEqual(dto)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('get_electronic_document', {
      organization_id: organizacionFiscalPrueba, document_id: documentoFiscalPrueba,
    })
  })

  it('transmite la cancelación a PostgREST', async () => {
    const signal = new AbortController().signal
    abortSignal.mockResolvedValue({ data: crearComprobanteSandbox(), error: null })
    rpc.mockReturnValue({ abortSignal })
    await consultarComprobanteSandbox(organizacionFiscalPrueba, documentoFiscalPrueba, signal)
    expect(abortSignal).toHaveBeenCalledExactlyOnceWith(signal)
  })

  it('no consulta una referencia inválida', async () => {
    await expect(consultarComprobanteSandbox('', documentoFiscalPrueba)).rejects.toMatchObject({ codigo: 'REFERENCIA_INVALIDA' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('no expone excepciones de transporte en el mensaje al usuario', async () => {
    rpc.mockRejectedValue(new Error('detalle interno del transporte'))
    await expect(consultarComprobanteSandbox(organizacionFiscalPrueba, documentoFiscalPrueba)).rejects.toMatchObject({
      codigo: 'CONSULTA_FALLIDA', message: 'No se pudo consultar el comprobante sandbox; puedes reintentar',
    })
  })

  it.each([
    ['42501', 'detalle privado', 'SIN_ACCESO'],
    ['P0001', 'CPE_DOCUMENT_NOT_FOUND', 'NO_ENCONTRADO'],
    ['42883', 'detalle privado', 'NO_DISPONIBLE'],
    ['PGRST202', 'detalle privado', 'NO_DISPONIBLE'],
    ['08006', 'detalle privado', 'CONSULTA_FALLIDA'],
  ])('mapea %s sin exponer diagnóstico interno', async (code, message, codigo) => {
    rpc.mockResolvedValue({ data: null, error: { code, message, details: 'datos internos' } })
    const error = await consultarComprobanteSandbox(organizacionFiscalPrueba, documentoFiscalPrueba).catch((e: unknown) => e)
    expect(error).toMatchObject({ codigo })
    expect((error as Error).message).not.toContain('detalle privado')
    expect((error as Error).message).not.toContain('datos internos')
  })

  it.each([null, { state: 'accepted' }])('rechaza una respuesta incompleta: %j', async (data) => {
    rpc.mockResolvedValue({ data, error: null })
    await expect(consultarComprobanteSandbox(organizacionFiscalPrueba, documentoFiscalPrueba)).rejects.toMatchObject({ codigo: 'RESPUESTA_INVALIDA' })
  })

  it('rechaza un tenant distinto incluso si la petición HTTP fue exitosa', async () => {
    const dto = crearComprobanteSandbox()
    dto.snapshot.organizationId = otraOrganizacionFiscal
    rpc.mockResolvedValue({ data: dto, error: null })
    await expect(consultarComprobanteSandbox(organizacionFiscalPrueba, documentoFiscalPrueba)).rejects.toMatchObject({ codigo: 'RESPUESTA_INVALIDA' })
  })
})
