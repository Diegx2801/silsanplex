import { describe, expect, it } from 'vitest'
import { esquemaComandoNoReparable, puedeDeclararNoReparable } from './noReparable'
import { estadoEsEditable, estadoEsTerminal, etiquetasEstadoReparacion, obtenerTransicionesGenericas } from './reparacion'
import { esquemaComandoAccesorios } from './accesorios'
const id = 'b1000000-0000-4000-8000-000000000001'
describe('contrato No reparable', () => {
  it.each(['', '   ', '\t', '\n', ' \t\r\n ', '\u00a0\ufeff', '\u2028\u2029'])('rechaza motivos visualmente vacíos %j en los tres contratos', reason => {
    expect(esquemaComandoNoReparable.safeParse({ tipo: 'declare_repair_non_repairable', expectedLockVersion: 1, datos: { diagnosis_id: id, reason } }).success).toBe(false)
    expect(esquemaComandoNoReparable.safeParse({ tipo: 'reopen_repair_non_repairable_assessment', expectedLockVersion: 1, datos: { decision_event_id: '1', reason } }).success).toBe(false)
    expect(esquemaComandoAccesorios.safeParse({ tipo: 'return_unrepaired_repair', expectedLockVersion: 1,
      datos: { decision_event_id: '1', returns: [], authorize_exception: true, exception_reason: reason } }).success).toBe(false)
  })
  it('recorta solo bordes, conserva formato interno y respeta el límite de 2000', () => {
    const datos = { diagnosis_id: id, reason: '\u00a0\tMotivo\tinterno\nválido\r\n\ufeff' }
    const command = { tipo: 'declare_repair_non_repairable', expectedLockVersion: 1, datos }
    expect(esquemaComandoNoReparable.parse(command).datos.reason).toBe('Motivo\tinterno\nválido')
    expect(esquemaComandoNoReparable.safeParse({ ...command, datos: { ...datos, reason: 'x'.repeat(2000) } }).success).toBe(true)
    expect(esquemaComandoNoReparable.safeParse({ ...command, datos: { ...datos, reason: 'x'.repeat(2001) } }).success).toBe(false)
  })
  it('requiere motivo y diagnóstico válidos', () => {
    const base = { tipo: 'declare_repair_non_repairable', expectedLockVersion: 1, datos: { diagnosis_id: id, reason: 'Placa destruida' } }
    expect(esquemaComandoNoReparable.safeParse(base).success).toBe(true)
    expect(esquemaComandoNoReparable.safeParse({ ...base, datos: { ...base.datos, reason: ' ' } }).success).toBe(false)
    expect(esquemaComandoNoReparable.safeParse({ ...base, datos: { ...base.datos, diagnosis_id: 'otra' } }).success).toBe(false)
  })
  it('conserva IDs bigint de decisión como texto y exige motivo de reevaluación', () => {
    expect(esquemaComandoNoReparable.parse({ tipo: 'reopen_repair_non_repairable_assessment', expectedLockVersion: 2,
      datos: { decision_event_id: '9007199254740993', reason: 'Segunda evaluación' } }).datos).toHaveProperty('decision_event_id', '9007199254740993')
  })
  it('ADMIN sin asignación no equivale a técnico responsable', () => {
    expect(puedeDeclararNoReparable('diagnosis', id, 'otro', true)).toBe(false)
    expect(puedeDeclararNoReparable('diagnosis', id, id, false)).toBe(false)
    expect(puedeDeclararNoReparable('diagnosis', id, id, true)).toBe(true)
  })
  it('prohíbe declarar desde estados terminales y preparación de entrega', () => {
    for (const estado of ['delivered', 'cancelled', 'rejected', 'ready_for_delivery', 'returned_unrepaired']) {
      expect(puedeDeclararNoReparable(estado, id, id, true)).toBe(false)
    }
  })
  it('separa obligación física de terminal y no permite edición ni transiciones genéricas', () => {
    expect(estadoEsTerminal('non_repairable')).toBe(false)
    expect(estadoEsTerminal('returned_unrepaired')).toBe(true)
    expect(estadoEsEditable('non_repairable')).toBe(false)
    expect(estadoEsEditable('returned_unrepaired')).toBe(false)
    expect(obtenerTransicionesGenericas('non_repairable')).toEqual([])
    expect(etiquetasEstadoReparacion.returned_unrepaired).toBe('Devuelto sin reparar')
  })
})
