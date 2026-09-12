import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { datosReparacionInicial, lineaCotizacionInicial } from '../modelo/reparacion'
import { ErrorReparacion } from '../servicios/reparacionesService'
import {
  crearConReintentoPersistente,
  guardarCotizacionConReintentoPersistente,
  leerCotizacionPendiente,
  leerCreacionPendiente,
  leerReservaPartePendiente,
  reservarParteConReintentoPersistente,
} from './creacionPendiente'

const datos = { ...datosReparacionInicial(), clienteId: crypto.randomUUID(), productoId: crypto.randomUUID(), problema: 'No enciende' }
const ambito = 'organizacion:usuario'
const cotizacion = {
  datos: {
    moneda: 'PEN' as const,
    tipoCambioPen: '1',
    preciosIncluyenImpuesto: false,
    tasaImpuesto: '18',
    lineas: [{
      ...lineaCotizacionInicial(),
      descripcion: 'Diagnóstico y reparación',
      cantidad: '1',
      precioUnitario: '50',
    }],
  },
  enviar: false,
  expectedLockVersion: 7,
}
const reserva = {
  datos: {
    productoId: crypto.randomUUID(),
    almacenId: crypto.randomUUID(),
    ubicacionId: crypto.randomUUID(),
    estadoStock: 'available' as const,
    lote: 'LOTE-1',
    fechaVencimiento: '2027-01-31',
    cantidadSolicitada: '2',
    notas: 'Reserva recuperable',
  },
  expectedLockVersion: 9,
}
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

describe('comandos pendientes', () => {
  it('reutiliza cotización, versión y clave después de una respuesta ambigua', async () => {
    const clave = crypto.randomUUID()
    const enviar = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(undefined)

    await expect(guardarCotizacionConReintentoPersistente(
      `${ambito}:repair-1:quote:save`, cotizacion, clave, enviar,
    )).rejects.toThrow('timeout')
    expect(leerCotizacionPendiente(`${ambito}:repair-1:quote:save`)).toEqual({
      ...cotizacion,
      clave,
    })

    await guardarCotizacionConReintentoPersistente(
      `${ambito}:repair-1:quote:save`,
      { ...cotizacion, expectedLockVersion: 8 },
      crypto.randomUUID(),
      enviar,
    )
    expect(enviar.mock.calls[1]).toEqual([cotizacion, clave])
    expect(leerCotizacionPendiente(`${ambito}:repair-1:quote:save`)).toBeNull()
  })

  it('reproduce una revisión con la versión y cotización originales tras recargar', async () => {
    const scope = `${ambito}:repair-1:quote:revision`
    const original = { ...cotizacion, quoteId: crypto.randomUUID() }
    const clave = crypto.randomUUID()
    const enviar = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(undefined)
    await expect(guardarCotizacionConReintentoPersistente(scope, original, clave, enviar))
      .rejects.toThrow('timeout')

    await guardarCotizacionConReintentoPersistente(scope, {
      ...original,
      quoteId: crypto.randomUUID(),
      expectedLockVersion: original.expectedLockVersion + 1,
    }, crypto.randomUUID(), enviar)

    expect(enviar.mock.calls[1]).toEqual([original, clave])
  })

  it('recupera una reserva por reparación y bloquea otra intención', async () => {
    const clave = crypto.randomUUID()
    const enviar = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(undefined)
    const scope = `${ambito}:repair-1:part-reservation`

    await expect(reservarParteConReintentoPersistente(scope, reserva, clave, enviar))
      .rejects.toThrow('timeout')
    expect(leerReservaPartePendiente(scope)).toEqual({ ...reserva, clave })
    expect(leerReservaPartePendiente(`${ambito}:repair-2:part-reservation`)).toBeNull()
    await expect(reservarParteConReintentoPersistente(
      scope,
      { ...reserva, datos: { ...reserva.datos, cantidadSolicitada: '3' } },
      crypto.randomUUID(),
      enviar,
    )).rejects.toThrow('pendiente')
    expect(enviar).toHaveBeenCalledTimes(1)

    await reservarParteConReintentoPersistente(
      scope,
      { ...reserva, expectedLockVersion: reserva.expectedLockVersion + 1 },
      crypto.randomUUID(),
      enviar,
    )
    expect(enviar.mock.calls[1]).toEqual([reserva, clave])
  })

  it('elimina una operación nueva cuando el servidor la rechaza definitivamente', async () => {
    const scope = `${ambito}:repair-1:quote:revision`
    const enviar = vi.fn().mockRejectedValue(new ErrorReparacion('Sin permiso', '42501'))
    await expect(guardarCotizacionConReintentoPersistente(
      scope, cotizacion, crypto.randomUUID(), enviar,
    )).rejects.toThrow('Sin permiso')
    expect(leerCotizacionPendiente(scope)).toBeNull()
  })
})
