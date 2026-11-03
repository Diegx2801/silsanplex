import { beforeEach, describe, expect, it, vi } from 'vitest'

import { actorFiscalPrueba, crearComprobanteSandbox, documentoFiscalPrueba, organizacionFiscalPrueba, otraOrganizacionFiscal } from '../__fixtures__/comprobanteSandbox'
import {
  configurarSerieSandbox,
  confirmarComprobanteSandbox,
  consultarConfiguracionEmisionSandbox,
  consultarComprobanteSandbox,
  guardarPerfilEmisorSandbox,
  prepararComprobanteSandbox,
  revisarComprobanteSandbox,
} from './comprobantesSandboxService'

const { rpc, abortSignal } = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

const solicitudRevision = {
  schemaVersion: 'CPE-PE-DOM-PEN-1', organizationId: organizacionFiscalPrueba,
  environment: 'sandbox',
  saleId: documentoFiscalPrueba, issuerProfileId: actorFiscalPrueba, expectedIssuerVersion: '1',
  seriesId: actorFiscalPrueba, expectedSeriesVersion: '1', issueDate: '2026-10-24',
  payment: { kind: 'contado' },
}
const solicitudPreparar = { ...solicitudRevision, operationKey: '55555555-5555-4555-8555-555555555555' }

const respuestaPreparada = {
  documentId: documentoFiscalPrueba, state: 'prepared', snapshotHash: 'a'.repeat(64),
  version: '1', fiscalIdentity: null,
}

const respuestaCongelada = {
  documentId: documentoFiscalPrueba, state: 'frozen', snapshotHash: 'b'.repeat(64),
  version: '2', fiscalIdentity: {
    environment: 'sandbox', ruc: '20000000001', documentType: '01', series: 'F001', number: '1',
  },
}

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

describe('comandos sandbox mediante RPC autenticadas', () => {
  beforeEach(() => { rpc.mockReset(); abortSignal.mockReset() })

  it('prepara una venta usando la clave de idempotencia suministrada y la RPC existente', async () => {
    rpc.mockResolvedValue({ data: respuestaPreparada, error: null })
    await expect(prepararComprobanteSandbox(solicitudPreparar)).resolves.toEqual(respuestaPreparada)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('prepare_electronic_document', { payload: solicitudPreparar })
  })

  it('configura el perfil emisor solo como sandbox de prueba', async () => {
    const payload = {
      organizationId: organizacionFiscalPrueba, environment: 'sandbox',
      operationKey: '55555555-5555-4555-8555-555555555555', id: actorFiscalPrueba, expectedVersion: '0',
      ruc: '20000000001', legalName: 'SANDBOX EMPRESA FICTICIA',
      fiscalAddress: { line: 'Av. Prueba 123', district: 'Distrito', province: 'Provincia', department: 'Lima', ubigeo: '150101', country: 'PE' },
      establishmentCode: '0000', ruleSetHash: 'a'.repeat(64), testOnly: true,
    }
    rpc.mockResolvedValue({ data: { id: actorFiscalPrueba, version: '1' }, error: null })
    await expect(guardarPerfilEmisorSandbox(payload)).resolves.toEqual({ id: actorFiscalPrueba, version: '1' })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('save_electronic_issuer_profile', { payload })
  })

  it('configura una serie consistente con factura o boleta', async () => {
    const payload = {
      organizationId: organizacionFiscalPrueba, environment: 'sandbox',
      operationKey: '55555555-5555-4555-8555-555555555555', id: actorFiscalPrueba, expectedVersion: '0',
      issuerProfileId: actorFiscalPrueba, documentType: '01', series: 'F001', nextNumber: '1', enabled: true,
    }
    rpc.mockResolvedValue({ data: { id: actorFiscalPrueba, version: '1' }, error: null })
    await expect(configurarSerieSandbox(payload)).resolves.toMatchObject({ version: '1' })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('configure_electronic_series', { payload })
    await expect(configurarSerieSandbox({ ...payload, series: 'B001' })).rejects.toMatchObject({ codigo: 'PAYLOAD_INVALIDO' })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('revisa un documento preparado mediante control optimista de versión', async () => {
    const payload = {
      organizationId: organizacionFiscalPrueba, environment: 'sandbox',
      operationKey: '55555555-5555-4555-8555-555555555555', documentId: documentoFiscalPrueba,
      expectedVersion: '1', request: solicitudRevision,
    }
    rpc.mockResolvedValue({ data: respuestaPreparada, error: null })
    await expect(revisarComprobanteSandbox(payload)).resolves.toEqual(respuestaPreparada)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('revise_electronic_document', { payload })
  })

  it('confirma y congela un documento, delegando número y autorización a PostgreSQL', async () => {
    const payload = {
      organizationId: organizacionFiscalPrueba, environment: 'sandbox',
      operationKey: '55555555-5555-4555-8555-555555555555', documentId: documentoFiscalPrueba,
      expectedVersion: '1',
    }
    rpc.mockResolvedValue({ data: respuestaCongelada, error: null })
    await expect(confirmarComprobanteSandbox(payload)).resolves.toEqual(respuestaCongelada)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('confirm_electronic_document', { payload })
  })

  it('rechaza producción en el cliente y conserva mapeados los rechazos de PostgreSQL', async () => {
    await expect(prepararComprobanteSandbox({ ...solicitudPreparar, environment: 'production' }))
      .rejects.toMatchObject({ codigo: 'PAYLOAD_INVALIDO' })
    expect(rpc).not.toHaveBeenCalled()

    rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'CPE_STALE_WRITE' } })
    await expect(confirmarComprobanteSandbox({
      organizationId: organizacionFiscalPrueba, environment: 'sandbox',
      operationKey: '55555555-5555-4555-8555-555555555555', documentId: documentoFiscalPrueba,
      expectedVersion: '1',
    })).rejects.toMatchObject({ codigo: 'VERSION_DESACTUALIZADA' })
  })

  it('rechaza reutilizar una clave de operación para un payload distinto sin revelar el error SQL', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'CPE_OPERATION_KEY_REUSED' } })
    await expect(prepararComprobanteSandbox(solicitudPreparar)).rejects.toMatchObject({
      codigo: 'CLAVE_IDEMPOTENCIA_REUTILIZADA',
      message: 'La clave de operación ya se utilizó con otros datos',
    })
  })

  it('rechaza una respuesta que congela el documento sin devolver identidad numerada', async () => {
    rpc.mockResolvedValue({ data: { ...respuestaCongelada, fiscalIdentity: null }, error: null })
    await expect(confirmarComprobanteSandbox({
      organizationId: organizacionFiscalPrueba, environment: 'sandbox',
      operationKey: '55555555-5555-4555-8555-555555555555', documentId: documentoFiscalPrueba,
      expectedVersion: '1',
    })).rejects.toMatchObject({ codigo: 'RESPUESTA_INVALIDA' })
  })
})

describe('configuración sandbox mediante RPC de lectura mínima', () => {
  beforeEach(() => { rpc.mockReset(); abortSignal.mockReset() })

  const configuracion = {
    organizationId: organizacionFiscalPrueba,
    profiles: [{
      id: actorFiscalPrueba,
      version: '1',
      ruc: '20000000001',
      legalName: 'SANDBOX EMPRESA FICTICIA',
      fiscalAddress: { line: 'Av. Prueba 123', district: 'Distrito', province: 'Provincia', department: 'Lima', ubigeo: '150101', country: 'PE' },
      establishmentCode: '0000',
      series: [{ id: documentoFiscalPrueba, issuerProfileId: actorFiscalPrueba, version: '1', documentType: '03', series: 'B001', nextNumber: '1', enabled: true }],
    }],
  }

  it('lee perfiles y series solo mediante la RPC autorizada, conservando versiones y correlativos como texto', async () => {
    rpc.mockResolvedValue({ data: configuracion, error: null })
    await expect(consultarConfiguracionEmisionSandbox(organizacionFiscalPrueba)).resolves.toEqual(configuracion)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('get_electronic_billing_configuration', {
      requested_organization_id: organizacionFiscalPrueba,
    })
  })

  it('propaga cancelación y no expone una denegación SQL sin autorización', async () => {
    const signal = new AbortController().signal
    abortSignal.mockResolvedValue({ data: configuracion, error: null })
    rpc.mockReturnValue({ abortSignal })
    await consultarConfiguracionEmisionSandbox(organizacionFiscalPrueba, signal)
    expect(abortSignal).toHaveBeenCalledExactlyOnceWith(signal)

    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'CPE_FORBIDDEN', details: 'interno' } })
    await expect(consultarConfiguracionEmisionSandbox(organizacionFiscalPrueba)).rejects.toMatchObject({
      codigo: 'SIN_ACCESO',
      message: 'No tienes permiso vigente para consultar la configuración fiscal sandbox',
    })
  })

  it('rechaza una respuesta de configuración de otra organización o con campos internos extra', async () => {
    rpc.mockResolvedValue({ data: { ...configuracion, organizationId: otraOrganizacionFiscal }, error: null })
    await expect(consultarConfiguracionEmisionSandbox(organizacionFiscalPrueba)).rejects.toMatchObject({ codigo: 'RESPUESTA_INVALIDA' })
    rpc.mockResolvedValue({ data: { ...configuracion, internalSecret: 'no exponer' }, error: null })
    await expect(consultarConfiguracionEmisionSandbox(organizacionFiscalPrueba)).rejects.toMatchObject({ codigo: 'RESPUESTA_INVALIDA' })
  })
})
