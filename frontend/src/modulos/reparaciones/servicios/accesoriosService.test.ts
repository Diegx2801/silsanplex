import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: db }))
import { consultarAccesorios, ejecutarComandoAccesorios, recuperarComandoAccesorios } from './accesoriosService'
import { crearReparacion } from './reparacionesService'
import { datosReparacionInicial } from '../modelo/reparacion'
import type { ComandoAccesorios } from '../modelo/accesorios'

const org = 'a0000000-0000-4000-8000-000000000001', repair = 'a0000000-0000-4000-8000-000000000002', accessory = 'a0000000-0000-4000-8000-000000000003'
const clave = 'a0000000-0000-4000-8000-000000000004'
const comando: ComandoAccesorios = { tipo: 'record_repair_accessory_return', expectedLockVersion: 7,
  datos: { returns: [{ accessory_id: accessory, quantity: 1, observation: 'Entregado' }] } }
beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); db.rpc.mockReset(); db.rpc.mockResolvedValue({ data: repair, error: null }) })
describe('Servicios de accesorios', () => {
  it('conserva omisión frente a lista vacía en create_repair', async () => {
    await crearReparacion(org,datosReparacionInicial(),clave)
    expect(db.rpc.mock.calls[0][1].payload).not.toHaveProperty('accessories')
    await crearReparacion(org,{ ...datosReparacionInicial(), accesorios: [] },clave)
    expect(db.rpc.mock.calls[1][1].payload.accessories).toEqual([])
  })
  it('envía accesorios separados de las notas generales', async () => {
    await crearReparacion(org,{ ...datosReparacionInicial(), notas: 'Nota del equipo', accesorios: [{ nombre: 'Sensor', cantidadRecibida: 2, condicion: 'Regular', observaciones: 'Rojo' }] },clave)
    expect(db.rpc.mock.calls[0][1].payload).toMatchObject({ notes: 'Nota del equipo', accessories: [{ name: 'Sensor',quantity_received: 2,received_condition: 'Regular',observations: 'Rojo' }] })
  })
  it('envía ámbito protegido y versión del agregado', async () => {
    await ejecutarComandoAccesorios('scope',org,repair,comando,clave)
    expect(db.rpc).toHaveBeenCalledWith('record_repair_accessory_return',{ payload: { ...comando.datos, organization_id: org, repair_id: repair, expected_lock_version: 7, operation_key: clave } })
    expect(recuperarComandoAccesorios('scope')).toBeNull()
  })
  it('conserva intención antes del RPC y recupera respuesta perdida', async () => {
    db.rpc.mockImplementationOnce(async () => {
      expect(recuperarComandoAccesorios('scope')).toMatchObject({ clave, expectedLockVersion: 7 })
      return { data: null, error: { message: 'Gateway timeout', code: '504' } }
    })
    await expect(ejecutarComandoAccesorios('scope',org,repair,comando,clave)).rejects.toThrow()
    await ejecutarComandoAccesorios('scope',org,repair,{ ...comando, expectedLockVersion: 99 },crypto.randomUUID())
    expect(db.rpc.mock.calls[1]).toEqual(db.rpc.mock.calls[0])
  })
  it('impide reemplazar una intención incierta', async () => {
    db.rpc.mockResolvedValueOnce({ error: { message: 'Timeout' } })
    await expect(ejecutarComandoAccesorios('scope',org,repair,comando,clave)).rejects.toThrow()
    await expect(ejecutarComandoAccesorios('scope',org,repair,{ ...comando,datos: { returns: [{ ...comando.datos.returns[0],quantity:2 }] } },clave)).rejects.toThrow('pendiente')
    expect(db.rpc).toHaveBeenCalledTimes(1)
  })
  it('explica sobredevolución y elimina el primer rechazo definitivo', async () => {
    db.rpc.mockResolvedValue({ error: { message: 'REPAIR_ACCESSORY_RETURN_EXCEEDED', code: 'P0001' } })
    await expect(ejecutarComandoAccesorios('scope',org,repair,comando,clave)).rejects.toThrow('saldo pendiente')
    expect(recuperarComandoAccesorios('scope')).toBeNull()
  })
  it('mantiene el código de conflicto', async () => {
    db.rpc.mockResolvedValue({ error: { message: 'REPAIR_VERSION_CONFLICT',code:'P0001' } })
    await expect(ejecutarComandoAccesorios('scope',org,repair,comando,clave)).rejects.toMatchObject({ codigo:'REPAIR_VERSION_CONFLICT' })
  })
  it('un rechazo de dominio nuevo no se conserva como un commit ambiguo', async () => {
    db.rpc.mockResolvedValue({ error: { message: 'REPAIR_NEW_DOMAIN_REJECTION',code:'P0001' } })
    await expect(ejecutarComandoAccesorios('scope',org,repair,comando,clave)).rejects.toMatchObject({codigo:'REPAIR_NEW_DOMAIN_REJECTION'})
    expect(recuperarComandoAccesorios('scope')).toBeNull()
  })
  it('no envía si falla la persistencia de la intención', async () => {
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw new Error('Storage failed') })
    await expect(ejecutarComandoAccesorios('scope',org,repair,comando,clave)).rejects.toThrow('Storage failed')
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it('consulta una recepción revisada sin accesorios', async () => {
    db.rpc.mockResolvedValue({ data: { reviewed_at:'2026-10-29T00:00:00Z',lock_version:7,accessories:[] },error:null })
    expect(await consultarAccesorios(org,repair)).toMatchObject({ accessories:[],lock_version:7 })
    expect(db.rpc).toHaveBeenCalledWith('get_repair_accessories',{requested_organization_id:org,requested_repair_id:repair})
  })
  it('un error de lectura no se convierte en lista vacía', async () => {
    db.rpc.mockResolvedValue({ data:null,error:{ message:'Read failed' } })
    await expect(consultarAccesorios(org,repair)).rejects.toThrow('consultar los accesorios')
  })
  it('rechaza una respuesta incompleta', async () => {
    db.rpc.mockResolvedValue({ data:{ accessories:[] },error:null })
    await expect(consultarAccesorios(org,repair)).rejects.toThrow()
  })
})
