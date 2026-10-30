import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { ErrorReparacion } from './reparacionesService'
import { ejecutarComandoConReintentoPersistente, leerComandoPendiente } from '../estado/creacionPendiente'
import { esquemaComandoCosto, esquemaDetalleCosto, esquemaResumenCosto, type ComandoCostoReal } from '../modelo/costoReal'

const mensajes: Record<string, string> = {
  REPAIR_FORBIDDEN: 'No tienes la capacidad económica requerida. ADMIN y VENTAS no la reciben automáticamente.',
  REPAIR_VERSION_CONFLICT: 'La reparación cambió. Actualiza el detalle antes de iniciar otra operación.',
  REPAIR_COST_PROVENANCE_UNVERIFIABLE: 'No se acredita una valoración homogénea de compra con esa moneda y base. Stock manual, transferencias, ceros o mezclas permanecen pendientes.',
  REPAIR_COST_SOURCE_INCONSISTENT: 'Hay una inconsistencia entre consumo y movimiento. No puede certificarse.',
  REPAIR_COST_DOCUMENTARY_INCONSISTENT: 'La recepción, su orden o su bucket contradicen la entrada de inventario. Conserva los originales y resuelve la evidencia; no se puede acreditar esta fuente.',
  REPAIR_COST_SOURCES_PENDING: 'Hay fuentes pendientes o bases incompatibles; no se puede confirmar el costo.',
  REPAIR_COST_SCOPE_INVALID: 'Cada categoría debe estar completa si tiene fuentes, o declararse no aplicable si no las tiene.',
  REPAIR_COST_AMOUNT_INVALID: 'Indica un importe finito, no negativo y con hasta dos decimales.',
  REPAIR_COST_TEXT_REQUIRED: 'Concepto, evidencia y motivo deben contener texto válido (al menos tres caracteres).',
  REPAIR_COST_DATE_INVALID: 'Indica una fecha de incurrencia válida, no futura en Lima.',
  REPAIR_COST_CURRENCY_BASIS_REQUIRED: 'Selecciona moneda y tratamiento económico documentados.',
  REPAIR_COST_DUPLICATE_REFERENCE: 'Ya existe una línea con esa referencia. Utiliza una revisión de la línea original.',
  REPAIR_COST_EXTERNAL_PENDING: 'Primero debe registrarse el retorno real del proveedor. El gasto sigue desconocido.',
  REPAIR_COST_USE_EXTERNAL_REVISION: 'Para corregir la moneda usa Revisar costo externo.',
  REPAIR_COST_REVIEW_CONFLICT: 'Las fuentes económicas cambiaron; vuelve a consultarlas.',
  REPAIR_COST_REVISION_CONFLICT: 'La línea ya tiene una revisión posterior.',
  REPAIR_COST_SOURCE_NOT_FOUND: 'La fuente no pertenece a esta reparación y organización.',
}
function errorCosto(error: { message: string; code?: string }) {
  const codigo = error.message.match(/\b(?:REPAIR_|AUTH_)[A-Z_]+\b/)?.[0] ?? error.code
  return new ErrorReparacion(mensajes[codigo ?? ''] ?? 'No se pudo confirmar la operación económica. Revisa sesión, permisos, datos y estado.', codigo)
}
export async function obtenerDetalleCosto(org: string, repair: string, offset = 0) {
  const { data, error } = await supabase.rpc('get_repair_actual_cost_detail', {
    requested_organization_id: org, requested_repair_id: repair, requested_offset: offset, requested_limit: 25,
  })
  if (error) throw errorCosto(error)
  return esquemaDetalleCosto.parse(data)
}
export async function obtenerResumenesCosto(org: string, ids: string[]) {
  const { data, error } = await supabase.rpc('get_repair_actual_cost_summaries', { requested_organization_id: org, requested_repair_ids: ids })
  if (error) throw errorCosto(error)
  return z.array(esquemaResumenCosto).parse(data)
}
export const recuperarCostoPendiente = (ambito: string) => leerComandoPendiente(ambito, esquemaComandoCosto,
  'No se pudo recuperar la intención económica. No se enviará otra operación.')
export async function ejecutarCostoReal(ambito: string, org: string, repair: string, comando: ComandoCostoReal, clave: string) {
  await ejecutarComandoConReintentoPersistente(ambito, comando, clave, esquemaComandoCosto, c => ({ tipo: c.tipo, datos: c.datos }), async (c, operationKey) => {
    const { error } = await supabase.rpc(c.tipo, { payload: { ...c.datos, organization_id: org, repair_id: repair,
      expected_lock_version: c.expectedLockVersion, operation_key: operationKey } })
    if (error) throw errorCosto(error)
  })
}
