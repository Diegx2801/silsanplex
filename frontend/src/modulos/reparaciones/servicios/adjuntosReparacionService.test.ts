import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn(), bucket: vi.fn(), upload: vi.fn(), sign: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from, storage: { from: mocks.bucket } } }))
import { adjuntarArchivoReparacion, listarAdjuntosReparacion, obtenerDescargaAdjuntoReparacion, validarAdjuntoReparacion } from './adjuntosReparacionService'

const org = 'd1185a69-2349-4209-bc97-e49c627693ee'
const repair = 'b8a715f6-341c-4e97-91be-a3d8a663b079'
const fila = { id: 'file', file_name: 'evidencia.pdf', mime_type: 'application/pdf', byte_size: 4, created_at: '2026-10-28T15:00:00Z', storage_path: `${org}/${repair}/file` }
function consulta(data: unknown, error: unknown = null) {
  const cadena = { select: vi.fn(), eq: vi.fn(), insert: vi.fn(), order: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() }
  cadena.select.mockReturnValue(cadena)
  cadena.eq.mockReturnValue(cadena)
  cadena.insert.mockReturnValue(cadena)
  cadena.order.mockResolvedValue({ data, error })
  cadena.single.mockResolvedValue({ data, error })
  cadena.maybeSingle.mockResolvedValue({ data, error })
  return cadena
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.bucket.mockReturnValue({ upload: mocks.upload, createSignedUrl: mocks.sign })
  mocks.upload.mockResolvedValue({ error: null })
})
describe('adjuntos privados de reparaciones', () => {
  it('rechaza vacíos, tipos activos y archivos mayores a 5 MiB antes de subir', async () => {
    expect(() => validarAdjuntoReparacion(new File([], 'vacio.pdf', { type: 'application/pdf' }))).toThrow('contenido')
    await expect(adjuntarArchivoReparacion(org, repair, 'user', new File(['html'], 'script.html', { type: 'text/html' }))).rejects.toThrow('PDF')
    expect(() => validarAdjuntoReparacion(new File([new Uint8Array(5242881)], 'grande.png', { type: 'image/png' }))).toThrow('5 MB')
    expect(mocks.upload).not.toHaveBeenCalled()
  })
  it('lista por organización y reparación sin generar URLs públicas', async () => {
    const cadena = consulta([fila]); mocks.from.mockReturnValue(cadena)
    expect(await listarAdjuntosReparacion(org, repair)).toEqual([expect.objectContaining({ nombre: 'evidencia.pdf', bytes: 4 })])
    expect(cadena.eq).toHaveBeenCalledWith('organization_id', org)
    expect(cadena.eq).toHaveBeenCalledWith('repair_id', repair)
    expect(mocks.bucket).not.toHaveBeenCalled()
  })
  it('genera rutas propias, limpia el nombre y nunca sobrescribe evidencia', async () => {
    const cadena = consulta(fila); mocks.from.mockReturnValue(cadena)
    const archivo = new File(['test'], '../foto.pdf', { type: 'application/pdf' })
    await adjuntarArchivoReparacion(org, repair, 'actor', archivo)
    expect(mocks.bucket).toHaveBeenCalledWith('repair-attachments')
    const ruta = mocks.upload.mock.calls[0][0] as string
    expect(ruta).toMatch(new RegExp(`^${org}/${repair}/[0-9a-f-]{36}$`))
    expect(mocks.upload).toHaveBeenCalledWith(ruta, archivo, { contentType: 'application/pdf', upsert: false })
    expect(cadena.insert).toHaveBeenCalledWith(expect.objectContaining({ file_name: '.._foto.pdf', created_by: 'actor', storage_path: ruta }))
  })
  it('recupera una respuesta perdida por la misma identidad sin volver a subir', async () => {
    mocks.from.mockReturnValueOnce(consulta(null, { message: 'timeout' })).mockReturnValueOnce(consulta(fila))
    expect(await adjuntarArchivoReparacion(org, repair, 'actor', new File(['test'], 'foto.pdf', { type: 'application/pdf' }))).toEqual(expect.objectContaining({ id: 'file' }))
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })
  it('firma durante 60 segundos el objeto recuperado de metadatos autorizados', async () => {
    const cadena = consulta(fila); mocks.from.mockReturnValue(cadena)
    mocks.sign.mockResolvedValue({ data: { signedUrl: 'https://storage.test/signed' }, error: null })
    expect(await obtenerDescargaAdjuntoReparacion(org, repair, 'file')).toBe('https://storage.test/signed')
    expect(cadena.eq).toHaveBeenCalledWith('organization_id', org)
    expect(cadena.eq).toHaveBeenCalledWith('repair_id', repair)
    expect(mocks.sign).toHaveBeenCalledWith(fila.storage_path, 60, { download: 'evidencia.pdf' })
  })
  it('no firma adjuntos inaccesibles ni ejecuta consultas con ámbito inválido', async () => {
    mocks.from.mockReturnValue(consulta(null, { code: '42501' }))
    await expect(obtenerDescargaAdjuntoReparacion(org, repair, 'file')).rejects.toThrow('permiso')
    expect(mocks.sign).not.toHaveBeenCalled()
    mocks.from.mockClear()
    await expect(listarAdjuntosReparacion('', repair)).rejects.toThrow('identificar')
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
