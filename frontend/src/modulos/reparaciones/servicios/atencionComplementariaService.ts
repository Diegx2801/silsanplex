import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { ejecutarComandoConReintentoPersistente, leerComandoPendiente } from '../estado/creacionPendiente'
import { ErrorReparacion } from './reparacionesService'

export interface ServicioExterno {
  id: string; supplier_name_snapshot: string; description: string
  sent_at: string; expected_return_date: string | null; returned_at: string | null
  cost_amount: number | null; currency: 'PEN' | 'USD'
}
export interface GarantiaServicio {
  warranty_days: number; coverage: string; starts_at: string | null; ends_at: string | null
}
export type TipoComandoComplementario = 'send_repair_external_service' | 'receive_repair_external_service' | 'configure_repair_service_warranty'
const esquema = z.object({
  tipo: z.enum(['send_repair_external_service', 'receive_repair_external_service', 'configure_repair_service_warranty']),
  datos: z.record(z.string(), z.unknown()), expectedLockVersion: z.number().int().nonnegative(),
})
export function recuperarAtencionPendiente(ambito: string) {
  return leerComandoPendiente(ambito, esquema, 'No se pudo recuperar la operación pendiente. No se enviarán cambios.')
}
export async function ejecutarAtencionComplementaria(ambito: string, organizationId: string, repairId: string,
  tipo: TipoComandoComplementario, datos: Record<string, unknown>, expectedLockVersion: number, clave: string) {
  await ejecutarComandoConReintentoPersistente(ambito, { tipo, datos, expectedLockVersion }, clave, esquema,
    (intencion) => ({ tipo: intencion.tipo, datos: intencion.datos }), async (intencion, operationKey) => {
      const { error } = await supabase.rpc(intencion.tipo, { payload: {
        ...intencion.datos, organization_id: organizationId, repair_id: repairId,
        expected_lock_version: intencion.expectedLockVersion, operation_key: operationKey,
      } })
      if (error) {
        const mensajes: Record<string, string> = {
          REPAIR_VERSION_CONFLICT: 'La orden cambió. Cierra este formulario y revisa el detalle actualizado.',
          REPAIR_EXTERNAL_SERVICE_OUTSTANDING: 'El equipo aún está con el proveedor. Registra su retorno antes de continuar.',
          REPAIR_EXTERNAL_SERVICE_NOT_FOUND: 'No se encontró el envío pendiente.',
          REPAIR_EXTERNAL_SERVICE_STATE_INVALID: 'El estado de la orden no permite enviar el equipo.',
          REPAIR_EXTERNAL_SUPPLIER_INVALID: 'Selecciona un proveedor activo de esta organización.',
          REPAIR_EXTERNAL_DESCRIPTION_INVALID: 'Describe el trabajo solicitado (de 3 a 2000 caracteres).',
          REPAIR_EXTERNAL_COST_INVALID: 'Ingresa un costo no negativo y una moneda válida.',
          REPAIR_EXTERNAL_SERVICE_ALREADY_RECEIVED: 'El retorno de este envío ya fue registrado.',
          REPAIR_SERVICE_WARRANTY_STATE_INVALID: 'La garantía se configura cuando la orden está lista para entrega o entregada.',
          REPAIR_SERVICE_WARRANTY_IMMUTABLE: 'La cobertura ya fue otorgada y no puede cambiarse después de entregar.',
          REPAIR_SERVICE_WARRANTY_INVALID: 'Indica de 1 a 3650 días y describe la cobertura.',
          REPAIR_FORBIDDEN: 'No tienes permiso para registrar esta operación.',
        }
        throw new ErrorReparacion(mensajes[error.message] ?? 'No se pudo guardar la atención. Revisa los datos y el estado de la orden.', error.message.startsWith('REPAIR_') ? error.message : error.code)
      }
    })
}
export async function listarAtencionComplementaria(organizationId: string, repairId: string) {
  const [servicios, garantia] = await Promise.all([
    supabase.from('repair_external_services').select('id,supplier_name_snapshot,description,sent_at,expected_return_date,returned_at,cost_amount,currency')
      .eq('organization_id', organizationId).eq('repair_id', repairId).order('sent_at', { ascending: false }).limit(100),
    supabase.from('repair_service_warranty_details').select('*').eq('organization_id', organizationId).eq('repair_id', repairId).maybeSingle(),
  ])
  if (servicios.error || garantia.error) throw new Error('No se pudo consultar el servicio externo y la garantía.')
  return { servicios: servicios.data as ServicioExterno[], garantia: garantia.data as GarantiaServicio | null }
}
export async function buscarProveedoresServicio(organizationId: string, busqueda: string) {
  let consulta = supabase.from('suppliers').select('id,business_name,document_number', { count: 'exact' })
    .eq('organization_id', organizationId).eq('is_active', true)
  const texto = busqueda.replace(/[%_,().]/g, ' ').trim().slice(0, 100)
  if (texto) consulta = consulta.ilike('business_name', `%${texto}%`)
  const { data, error, count } = await consulta.order('business_name').limit(25)
  if (error) throw new Error('No se pudo buscar proveedores. Inténtalo otra vez.')
  return { elementos: data as { id: string; business_name: string; document_number: string }[], total: count ?? 0 }
}
