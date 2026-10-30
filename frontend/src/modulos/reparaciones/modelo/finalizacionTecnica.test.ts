import { beforeEach, describe, expect, it, vi } from 'vitest'
import { esquemaCambioEstadoPendiente, fechaTecnica, leerFinalizacionTecnica, leerResumenFinalizacion } from './finalizacionTecnica'
import { ejecutarComandoConReintentoPersistente, leerComandoPendiente } from '../estado/creacionPendiente'

const evidencia = { event_id: '9007199254740993', completed_at: '2026-11-01T02:30:00Z', test_cycle_number: 2,
  actor_user_id: null, actor_name: null, assigned_technician_id: null, assigned_technician_name: null }
beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks() })
describe('R13 contrato y recuperación', () => {
  it('conserva bigint como texto y responsables desconocidos sin rellenarlos', () => {
    expect(leerFinalizacionTecnica(evidencia)).toEqual(evidencia)
  })
  it.each([undefined, null, {}, { ...evidencia, event_id: 9007199254740992 }, { ...evidencia, completed_at: 'no-fecha' }])('no inventa evidencia para %j', valor => {
    expect(leerFinalizacionTecnica(valor)).toBeNull()
  })
  it('formatea el día anterior en Lima cuando UTC ya cambió de fecha', () => {
    expect(fechaTecnica(evidencia.completed_at)).toContain('31 oct')
    expect(fechaTecnica(evidencia.completed_at)).toMatch(/9:30.*p/)
  })
  it.each([
    ['2026-11-01T04:59:00Z', '31 oct', /11:59.*p/],
    ['2026-11-01T05:00:00Z', '1 nov', /12:00.*a/],
  ])('respeta medianoche de Lima para %s', (timestamp, dia, hora) => {
    expect(fechaTecnica(timestamp as string)).toContain(dia as string)
    expect(fechaTecnica(timestamp as string)).toMatch(hora as RegExp)
  })
  it('acepta un único resumen servidor y falla cerrado si contiene evidencia malformada', () => {
    const resumen = { technical_completion: evidencia, first_technical_completion: evidencia, verified_technical_completions: [evidencia] }
    expect(leerResumenFinalizacion(resumen)).toEqual(resumen)
    expect(leerResumenFinalizacion({ ...resumen, verified_technical_completions: [{ ...evidencia, test_cycle_number: -1 }] })).toBeNull()
  })
  it('reintenta exactamente la intención, versión y clave originales después de perder respuesta', async () => {
    const enviar = vi.fn().mockRejectedValueOnce(new Error('Respuesta perdida')).mockResolvedValue(undefined)
    const original = { estado: 'ready_for_delivery', observacion: 'Validado', expectedLockVersion: 7 }
    const clave = crypto.randomUUID()
    const ejecutar = (version: number) => ejecutarComandoConReintentoPersistente('org:actor:repair:status', { ...original, expectedLockVersion: version }, clave,
      esquemaCambioEstadoPendiente, c => ({ estado: c.estado, observacion: c.observacion }), enviar)
    await expect(ejecutar(7)).rejects.toThrow('perdida')
    expect(leerComandoPendiente('org:actor:repair:status', esquemaCambioEstadoPendiente, 'error')).toEqual({ ...original, clave })
    await ejecutar(11)
    expect(enviar.mock.calls[1]).toEqual(enviar.mock.calls[0])
    expect(leerComandoPendiente('org:actor:repair:status', esquemaCambioEstadoPendiente, 'error')).toBeNull()
  })
  it('fallo al persistir impide el envío de la transición', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Almacenamiento lleno') })
    const enviar = vi.fn()
    await expect(ejecutarComandoConReintentoPersistente('scope', { estado: 'testing', observacion: '', expectedLockVersion: 2 }, crypto.randomUUID(),
      esquemaCambioEstadoPendiente, c => c, enviar)).rejects.toThrow('lleno')
    expect(enviar).not.toHaveBeenCalled()
  })
})
