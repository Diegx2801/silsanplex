import { supabase } from '@/lib/supabase'
import { ejecutarComandoConReintentoPersistente, leerComandoPendiente } from '../estado/creacionPendiente'
import { esquemaComandoNoReparable, type ComandoNoReparable } from '../modelo/noReparable'
import { ErrorReparacion } from './reparacionesService'

export const erroresNoReparable: Record<string, string> = {
  REPAIR_NON_REPAIRABLE_REASON_REQUIRED: 'Indica un motivo técnico no vacío de hasta 2000 caracteres.',
  REPAIR_NON_REPAIRABLE_DIAGNOSIS_INVALID: 'Selecciona un diagnóstico válido de esta reparación.',
  REPAIR_NON_REPAIRABLE_ASSIGNED_TECHNICIAN_REQUIRED: 'Solo el técnico asignado y activo puede confirmar esta decisión.',
  REPAIR_NON_REPAIRABLE_STATE_INVALID: 'El estado actual no permite esta operación. Una orden devuelta requiere una nueva recepción.',
  REPAIR_NON_REPAIRABLE_DECISION_INVALID: 'La decisión vigente cambió. Actualiza el detalle antes de continuar.',
  REPAIR_NON_REPAIRABLE_ACTIVE: 'La decisión No reparable está vigente. Reabre la evaluación antes de realizar cambios técnicos.',
  REPAIR_VERSION_CONFLICT: 'La reparación cambió mientras realizabas esta acción. Actualiza el detalle.',
  REPAIR_PENDING_PARTS: 'Hay reservas de repuestos pendientes. Un usuario autorizado debe consumir o cancelar su saldo antes de continuar.',
  REPAIR_FORBIDDEN: 'No tienes permiso para ejecutar esta operación.',
  REPAIR_ACCESSORY_USER_REQUIRED: 'Se requiere una sesión de usuario activa.',
}
export function recuperarNoReparable(ambito: string) {
  return leerComandoPendiente(ambito, esquemaComandoNoReparable, 'No se pudo recuperar la decisión pendiente. No se enviará otra intención.')
}
export async function ejecutarNoReparable(ambito: string, org: string, repair: string, comando: ComandoNoReparable, clave: string) {
  await ejecutarComandoConReintentoPersistente(ambito, comando, clave, esquemaComandoNoReparable,
    c => ({ tipo: c.tipo, datos: c.datos }), async (c, operationKey) => {
      const { error } = await supabase.rpc(c.tipo, { payload: { ...c.datos, organization_id: org, repair_id: repair,
        expected_lock_version: c.expectedLockVersion, operation_key: operationKey } })
      if (error) {
        const codigo = error.message.match(/\bREPAIR_[A-Z_]+\b/)?.[0] ?? error.code
        throw new ErrorReparacion(erroresNoReparable[codigo] ?? 'No se pudo confirmar la operación. Revisa permisos, datos y estado de la orden.', codigo)
      }
    })
}
