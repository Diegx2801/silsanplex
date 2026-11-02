import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: mock }))
import { ejecutarNoReparable, recuperarNoReparable } from './noReparableService'
import type { ComandoNoReparable } from '../modelo/noReparable'
const id = 'b1000000-0000-4000-8000-000000000001'
const comando: ComandoNoReparable = { tipo: 'declare_repair_non_repairable', expectedLockVersion: 7, datos: { diagnosis_id: id, reason: 'Daño irreversible' } }
beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); mock.rpc.mockReset(); mock.rpc.mockResolvedValue({ data: id, error: null }) })
describe('comandos persistentes B1', () => {
  it('protege el ámbito y no envía actores ni fechas', async () => {
    await ejecutarNoReparable('org:user:repair', 'org', 'repair', comando, id)
    expect(mock.rpc).toHaveBeenCalledWith('declare_repair_non_repairable', { payload: { organization_id: 'org', repair_id: 'repair',
      diagnosis_id: id, reason: 'Daño irreversible', operation_key: id, expected_lock_version: 7 } })
    expect(recuperarNoReparable('org:user:repair')).toBeNull()
  })
  it('recupera respuesta perdida con misma clave y versión', async () => {
    mock.rpc.mockRejectedValueOnce(new Error('Respuesta perdida'))
    await expect(ejecutarNoReparable('scope', 'org', 'repair', comando, id)).rejects.toThrow('perdida')
    expect(recuperarNoReparable('scope')).toMatchObject({ clave: id, expectedLockVersion: 7 })
    await ejecutarNoReparable('scope', 'org', 'repair', { ...comando, expectedLockVersion: 8 }, crypto.randomUUID())
    expect(mock.rpc.mock.calls[1]).toEqual(mock.rpc.mock.calls[0])
  })
  it('no sustituye una intención incierta', async () => {
    mock.rpc.mockRejectedValueOnce(new Error('Timeout'))
    await expect(ejecutarNoReparable('scope', 'org', 'repair', comando, id)).rejects.toThrow()
    await expect(ejecutarNoReparable('scope', 'org', 'repair', { ...comando, datos: { ...comando.datos, reason: 'Otro motivo' } }, id)).rejects.toThrow('pendiente')
    expect(mock.rpc).toHaveBeenCalledTimes(1)
  })
  it('traduce conflicto y permite corregir un primer rechazo definitivo', async () => {
    mock.rpc.mockResolvedValueOnce({ error: { message: 'REPAIR_VERSION_CONFLICT', code: 'P0001' } })
    await expect(ejecutarNoReparable('scope', 'org', 'repair', comando, id)).rejects.toThrow('cambió')
    expect(recuperarNoReparable('scope')).toBeNull()
  })
  it('fallo de almacenamiento impide enviar', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage lleno') })
    await expect(ejecutarNoReparable('scope', 'org', 'repair', comando, id)).rejects.toThrow('lleno')
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it('aísla las intenciones por usuario y reparación', async () => {
    mock.rpc.mockRejectedValueOnce(new Error('Timeout'))
    await expect(ejecutarNoReparable('org:user:repair', 'org', 'repair', comando, id)).rejects.toThrow()
    expect(recuperarNoReparable('org:other:repair')).toBeNull()
    expect(recuperarNoReparable('org:user:other')).toBeNull()
  })
})
