import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: db }))
import { buscarProveedoresServicio, ejecutarAtencionComplementaria, listarAtencionComplementaria, recuperarAtencionPendiente } from './atencionComplementariaService'

const key = 'bc900000-0000-4000-8000-000000000001'
const otherKey = 'bc900000-0000-4000-8000-000000000002'
const scope = 'org:user:repair:complementary'
const data = { supplier_id: 'supplier', description: 'Trabajo solicitado', expected_return_date: '' }

function chain(response: object) {
  const query = {
    select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), ilike: vi.fn(), maybeSingle: vi.fn(),
    then: (resolve: (value: object) => unknown) => Promise.resolve(response).then(resolve),
  }
  for (const method of [query.select, query.eq, query.order, query.limit, query.ilike]) method.mockReturnValue(query)
  query.maybeSingle.mockResolvedValue(response)
  return query
}

describe('Atención complementaria: persistencia y contratos', () => {
  beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear() })

  it('reintenta una respuesta ambigua con la clave y versión originales', async () => {
    db.rpc.mockResolvedValueOnce({ error: { message: 'Network timeout', code: 'ETIMEDOUT' } }).mockResolvedValueOnce({ error: null })
    await expect(ejecutarAtencionComplementaria(scope, 'org', 'repair', 'send_repair_external_service', data, 9, key)).rejects.toThrow()
    expect(recuperarAtencionPendiente(scope)).toEqual({ tipo: 'send_repair_external_service', datos: data, expectedLockVersion: 9, clave: key })
    await ejecutarAtencionComplementaria(scope, 'org', 'repair', 'send_repair_external_service', data, 55, otherKey)
    expect(db.rpc).toHaveBeenNthCalledWith(2, 'send_repair_external_service', { payload: { ...data, organization_id: 'org', repair_id: 'repair', expected_lock_version: 9, operation_key: key } })
    expect(recuperarAtencionPendiente(scope)).toBeNull()
  })

  it('no reemplaza una intención pendiente por otro comando', async () => {
    db.rpc.mockRejectedValue(new Error('offline'))
    await expect(ejecutarAtencionComplementaria(scope, 'org', 'repair', 'send_repair_external_service', data, 9, key)).rejects.toThrow('offline')
    await expect(ejecutarAtencionComplementaria(scope, 'org', 'repair', 'configure_repair_service_warranty', { warranty_days: 90, coverage: 'Motor' }, 9, otherKey)).rejects.toThrow('operación pendiente')
    expect(db.rpc).toHaveBeenCalledTimes(1)
    expect(recuperarAtencionPendiente('other-user:repair')).toBeNull()
  })

  it('los datos de formulario no pueden sobrescribir el ámbito de la orden', async () => {
    db.rpc.mockResolvedValue({ error: null })
    await ejecutarAtencionComplementaria(scope, 'org', 'repair', 'send_repair_external_service', { ...data, organization_id: 'other-org', repair_id: 'other-repair', operation_key: otherKey, expected_lock_version: 800 }, 9, key)
    expect(db.rpc).toHaveBeenCalledWith('send_repair_external_service', { payload: expect.objectContaining({ organization_id: 'org', repair_id: 'repair', operation_key: key, expected_lock_version: 9 }) })
  })

  it('un rechazo definitivo inicial libera el intento y ofrece un error legible', async () => {
    db.rpc.mockResolvedValue({ error: { message: 'REPAIR_EXTERNAL_SERVICE_OUTSTANDING', code: 'P0001' } })
    await expect(ejecutarAtencionComplementaria(scope, 'org', 'repair', 'send_repair_external_service', data, 9, key)).rejects.toThrow('equipo aún está con el proveedor')
    expect(recuperarAtencionPendiente(scope)).toBeNull()
  })

  it('no envía un comando si el navegador no puede persistir su intención', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Sin almacenamiento') })
    try {
      await expect(ejecutarAtencionComplementaria(scope, 'org', 'repair', 'send_repair_external_service', data, 9, key)).rejects.toThrow('Sin almacenamiento')
      expect(db.rpc).not.toHaveBeenCalled()
    } finally { storage.mockRestore() }
  })

  it('consulta ambos recursos por organización y reparación con historial acotado', async () => {
    const external = chain({ data: [], error: null })
    const warranty = chain({ data: null, error: null })
    db.from.mockReturnValueOnce(external).mockReturnValueOnce(warranty)
    await expect(listarAtencionComplementaria('org', 'repair')).resolves.toEqual({ servicios: [], garantia: null })
    for (const query of [external, warranty]) {
      expect(query.eq).toHaveBeenCalledWith('organization_id', 'org')
      expect(query.eq).toHaveBeenCalledWith('repair_id', 'repair')
    }
    expect(external.limit).toHaveBeenCalledWith(100)
    expect(warranty.maybeSingle).toHaveBeenCalledOnce()
  })

  it('filtra proveedores activos del ámbito y acota la búsqueda sin comodines del usuario', async () => {
    const query = chain({ data: [], error: null, count: 30 })
    db.from.mockReturnValue(query)
    await expect(buscarProveedoresServicio('org', 'Taller%_(Norte),')).resolves.toEqual({ elementos: [], total: 30 })
    expect(query.eq).toHaveBeenCalledWith('organization_id', 'org')
    expect(query.eq).toHaveBeenCalledWith('is_active', true)
    expect(query.ilike).toHaveBeenCalledWith('business_name', '%Taller   Norte%')
    expect(query.limit).toHaveBeenCalledWith(25)
  })

  it('no presenta una ausencia de garantía ficticia cuando su consulta falla', async () => {
    db.from.mockReturnValueOnce(chain({ data: [], error: null })).mockReturnValueOnce(chain({ data: null, error: { message: 'offline' } }))
    await expect(listarAtencionComplementaria('org', 'repair')).rejects.toThrow('No se pudo consultar')
  })
})
