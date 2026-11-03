import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('@/lib/supabase',()=>({supabase:mock}))
import { ejecutarCostoReal, obtenerResumenesCosto, recuperarCostoPendiente } from './costoRealService'
import type { ComandoCostoReal } from '../modelo/costoReal'

const id = 'b1400000-0000-4000-8000-000000000001'
const comando: ComandoCostoReal = { tipo:'record_repair_actual_cost',expectedLockVersion:4,datos:{category:'labor',description:'Trabajo real',amount:'9999999999999999.99',currency:'PEN',cost_basis:'not_applicable',incurred_on:'2026-10-01',reason:'Trabajo documentado',evidence_reference:'Documento línea 1'} }
beforeEach(()=>{sessionStorage.clear();vi.restoreAllMocks();mock.rpc.mockReset();mock.rpc.mockResolvedValue({data:id,error:null})})
describe('R14 servicios e intención persistente',()=>{
 it('envía importes textuales y no agrega actores ni fechas del servidor',async()=>{
   await ejecutarCostoReal('org:user:repair','org','repair',comando,id)
   expect(mock.rpc).toHaveBeenCalledWith(comando.tipo,{payload:{...comando.datos,organization_id:'org',repair_id:'repair',expected_lock_version:4,operation_key:id}})
   expect(recuperarCostoPendiente('org:user:repair')).toBeNull()
 })
 it('recupera exactamente datos, versión y clave originales tras respuesta perdida',async()=>{
   mock.rpc.mockRejectedValueOnce(new Error('Respuesta perdida'))
   await expect(ejecutarCostoReal('scope','org','repair',comando,id)).rejects.toThrow('perdida')
   expect(recuperarCostoPendiente('scope')).toEqual({...comando,clave:id})
   await ejecutarCostoReal('scope','org','repair',{...comando,expectedLockVersion:8},crypto.randomUUID())
   expect(mock.rpc.mock.calls[1]).toEqual(mock.rpc.mock.calls[0])
 })
 it('no sustituye una intención incierta por otro costo',async()=>{
   mock.rpc.mockRejectedValueOnce(new Error('Timeout'))
   await expect(ejecutarCostoReal('scope','org','repair',comando,id)).rejects.toThrow()
   await expect(ejecutarCostoReal('scope','org','repair',{...comando,datos:{...comando.datos,amount:'2.00'}},crypto.randomUUID())).rejects.toThrow('pendiente')
   expect(mock.rpc).toHaveBeenCalledTimes(1)
 })
 it('un rechazo definitivo inicial permite corregir, sin inventar confirmación',async()=>{
   mock.rpc.mockResolvedValueOnce({data:null,error:{code:'P0001',message:'REPAIR_VERSION_CONFLICT'}})
   await expect(ejecutarCostoReal('scope','org','repair',comando,id)).rejects.toThrow('cambió')
   expect(recuperarCostoPendiente('scope')).toBeNull()
 })
 it('un replay denegado conserva la intención anterior incierta',async()=>{
   mock.rpc.mockRejectedValueOnce(new Error('Timeout'))
   await expect(ejecutarCostoReal('scope','org','repair',comando,id)).rejects.toThrow()
   mock.rpc.mockResolvedValueOnce({data:null,error:{code:'42501',message:'REPAIR_FORBIDDEN'}})
   await expect(ejecutarCostoReal('scope','org','repair',comando,id)).rejects.toThrow('capacidad económica')
   expect(recuperarCostoPendiente('scope')).not.toBeNull()
 })
 it('no envía si falla la persistencia previa',async()=>{
   vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Storage lleno')})
   await expect(ejecutarCostoReal('scope','org','repair',comando,id)).rejects.toThrow('lleno')
   expect(mock.rpc).not.toHaveBeenCalled()
 })
 it('aísla por organización, usuario y reparación y recuperar sin pendiente no envía',async()=>{
   expect(recuperarCostoPendiente('org:user:repair')).toBeNull()
   expect(mock.rpc).not.toHaveBeenCalled()
   mock.rpc.mockRejectedValueOnce(new Error('Timeout'))
   await expect(ejecutarCostoReal('org:user:repair','org','repair',comando,id)).rejects.toThrow()
   expect(recuperarCostoPendiente('foreign:user:repair')).toBeNull()
   expect(recuperarCostoPendiente('org:other:repair')).toBeNull()
   expect(recuperarCostoPendiente('org:user:other')).toBeNull()
 })
 it('hace una llamada por lote, no una por reparación',async()=>{
   mock.rpc.mockResolvedValue({data:[],error:null})
   await obtenerResumenesCosto('org',[id, 'b1400000-0000-4000-8000-000000000002'])
   expect(mock.rpc).toHaveBeenCalledTimes(1)
   expect(mock.rpc).toHaveBeenCalledWith('get_repair_actual_cost_summaries',{requested_organization_id:'org',requested_repair_ids:[id,'b1400000-0000-4000-8000-000000000002']})
 })
})
