import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { datosReparacionInicial } from '../modelo/reparacion'
import { ErrorReparacion } from '../servicios/reparacionesService'
import { crearConReintentoPersistente, leerCreacionPendiente } from './creacionPendiente'

const datos = { ...datosReparacionInicial(), clienteId: crypto.randomUUID(), productoId: crypto.randomUUID(), problema: 'No enciende' }
const ambito = 'organizacion:usuario'
beforeEach(() => sessionStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('creación pendiente', () => {
  it('recupera datos y clave tras respuesta ambigua y permite otra creación solo después de confirmar', async () => {
    const clave = crypto.randomUUID()
    const enviar = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(undefined)
    await expect(crearConReintentoPersistente(ambito, datos, clave, enviar)).rejects.toThrow('timeout')
    expect(leerCreacionPendiente(ambito)).toEqual({ datos, clave })
    await crearConReintentoPersistente(ambito, datos, crypto.randomUUID(), enviar)
    expect(enviar.mock.calls[1]).toEqual([datos, clave])
    expect(leerCreacionPendiente(ambito)).toBeNull()
    const nueva = crypto.randomUUID()
    await crearConReintentoPersistente(ambito, datos, nueva, enviar)
    expect(enviar.mock.calls[2]).toEqual([datos, nueva])
  })

  it('no envía otra intención mientras existe una respuesta ambigua', async () => {
    const enviar = vi.fn().mockRejectedValue(new Error('timeout'))
    await expect(crearConReintentoPersistente(ambito, datos, crypto.randomUUID(), enviar)).rejects.toThrow()
    await expect(crearConReintentoPersistente(ambito, { ...datos, problema: 'Otro problema' }, crypto.randomUUID(), enviar)).rejects.toThrow('pendiente')
    expect(enviar).toHaveBeenCalledTimes(1)
  })

  it('permite corregir un rechazo definitivo del primer intento', async () => {
    const enviar = vi.fn().mockRejectedValue(new ErrorReparacion('Datos inválidos', '22023'))
    await expect(crearConReintentoPersistente(ambito, datos, crypto.randomUUID(), enviar)).rejects.toThrow()
    expect(leerCreacionPendiente(ambito)).toBeNull()
  })

  it('conserva la intención si el reintento es rechazado tras una respuesta ambigua', async () => {
    const enviar = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockRejectedValue(new ErrorReparacion('Sin permiso', '42501'))
    const clave = crypto.randomUUID()
    await expect(crearConReintentoPersistente(ambito, datos, clave, enviar)).rejects.toThrow()
    await expect(crearConReintentoPersistente(ambito, datos, crypto.randomUUID(), enviar)).rejects.toThrow()
    expect(leerCreacionPendiente(ambito)?.clave).toBe(clave)
  })

  it('separa las operaciones por organización y usuario', async () => {
    const enviar = vi.fn().mockRejectedValue(new Error('timeout'))
    await expect(crearConReintentoPersistente(ambito, datos, crypto.randomUUID(), enviar)).rejects.toThrow()
    expect(leerCreacionPendiente('otra:usuario')).toBeNull()
    expect(leerCreacionPendiente('organizacion:otro')).toBeNull()
  })

  it('no envía si no puede persistir la operación', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Sin almacenamiento') })
    const enviar = vi.fn()
    await expect(crearConReintentoPersistente(ambito, datos, crypto.randomUUID(), enviar)).rejects.toThrow('Sin almacenamiento')
    expect(enviar).not.toHaveBeenCalled()
  })
})
