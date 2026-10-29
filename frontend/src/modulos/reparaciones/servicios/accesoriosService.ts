import { supabase } from '@/lib/supabase'
import { ejecutarComandoConReintentoPersistente, leerComandoPendiente } from '../estado/creacionPendiente'
import { esquemaComandoAccesorios, esquemaDetalleAccesorios, type ComandoAccesorios } from '../modelo/accesorios'
import { ErrorReparacion } from './reparacionesService'

const mensajes: Record<string, string> = {
  REPAIR_ACCESSORIES_PENDING: 'La entrega ordinaria está bloqueada: hay accesorios pendientes. Registra su devolución o solicita una excepción autorizada.',
  REPAIR_ACCESSORY_QUANTITY_INVALID: 'Ingresa una cantidad entera entre 1 y 1000000.',
  REPAIR_ACCESSORY_RETURN_EXCEEDED: 'La cantidad supera el saldo pendiente de devolver.',
  REPAIR_ACCESSORY_CORRECTION_LOCKED: 'Este accesorio ya tiene una devolución confirmada y no admite correcciones ordinarias.',
  REPAIR_ACCESSORY_VOIDED: 'El accesorio está anulado y conserva su historial.',
  REPAIR_ACCESSORY_NOT_FOUND: 'No se encontró el accesorio en esta reparación.',
  REPAIR_ACCESSORY_REASON_REQUIRED: 'Indica un motivo no vacío de hasta 2000 caracteres.',
  REPAIR_ACCESSORY_EXCEPTION_NOT_REQUIRED: 'No hay pendientes que requieran una excepción. Revisa el detalle y entrega normalmente.',
  REPAIR_ACCESSORY_RETURN_STATE_INVALID: 'Esta orden entregada no tiene una excepción de accesorios pendiente de regularizar.',
  REPAIR_VERSION_CONFLICT: 'La reparación cambió mientras realizabas esta acción. Cierra el formulario y revisa la información actualizada.',
  REPAIR_VERSION_REQUIRED: 'Actualiza el detalle para verificar la versión de la reparación.',
  REPAIR_OPERATION_KEY_REUSED: 'La clave corresponde a otra intención. Recupera la operación original.',
  REPAIR_NOT_EDITABLE: 'La orden cerrada no admite correcciones de recepción. Sí puede registrar devoluciones pendientes autorizadas.',
  REPAIR_FORBIDDEN: 'No tienes permiso para ejecutar esta operación.',
  REPAIR_ACCESSORY_USER_REQUIRED: 'Se requiere una sesión de usuario activa para registrar la custodia.',
  REPAIR_EXTERNAL_SERVICE_OUTSTANDING: 'El equipo aún está con el proveedor. Registra su retorno antes de entregar.',
  REPAIR_APPROVED_TEST_REQUIRED: 'Registra una prueba aprobada en el ciclo vigente antes de entregar.',
  REPAIR_FAILED_TEST_PRESENT: 'El ciclo de pruebas vigente contiene una prueba fallida.',
  REPAIR_PENDING_PARTS: 'Consume o cancela los repuestos reservados antes de entregar.',
  REPAIR_DELIVERY_STATE_REQUIRED: 'La reparación debe estar lista para entrega.',
  REPAIR_ASSIGNED_TECHNICIAN_REQUIRED: 'Asigna un técnico activo antes de entregar.',
  REPAIR_ACCESSORIES_INVALID: 'Revisa la lista de accesorios; se permiten hasta 100 accesorios activos.',
  REPAIR_ACCESSORY_DATA_INVALID: 'Revisa el nombre, condición y observaciones del accesorio.',
  REPAIR_ACCESSORY_RETURNS_INVALID: 'Selecciona los accesorios y cantidades válidas para la devolución.',
}
export async function consultarAccesorios(organizationId: string, repairId: string) {
  const { data, error } = await supabase.rpc('get_repair_accessories', { requested_organization_id: organizationId, requested_repair_id: repairId })
  if (error) throw new Error('No se pudieron consultar los accesorios. Reintenta la lectura antes de continuar.')
  const resultado = esquemaDetalleAccesorios.parse(data)
  if (resultado.accessories.some(a => a.organization_id !== organizationId || a.repair_id !== repairId)) throw new Error('La respuesta de accesorios no corresponde a la orden.')
  return resultado
}
export function recuperarComandoAccesorios(ambito: string) {
  return leerComandoPendiente(ambito, esquemaComandoAccesorios, 'No se pudo recuperar la operación de accesorios. No se enviará otra intención.')
}
export async function ejecutarComandoAccesorios(ambito: string, organizationId: string, repairId: string, comando: ComandoAccesorios, clave: string) {
  await ejecutarComandoConReintentoPersistente(ambito, comando, clave, esquemaComandoAccesorios,
    c => ({ tipo: c.tipo, datos: c.datos }), async (pendiente, operationKey) => {
      const { error } = await supabase.rpc(pendiente.tipo, { payload: { ...pendiente.datos,
        organization_id: organizationId, repair_id: repairId, expected_lock_version: pendiente.expectedLockVersion, operation_key: operationKey } })
      if (error) {
        // Preserve EVERY repair domain rejection, even if a future server adds a new code.
        // Otherwise a definitive P0001 rejection could be mistaken for an ambiguous commit.
        const codigo = error.message.match(/\bREPAIR_[A-Z_]+\b/)?.[0]
        throw new ErrorReparacion((codigo && mensajes[codigo]) || (error.code === '42501' ? 'No tienes permiso para ejecutar esta operación.' : 'No se pudo guardar. Revisa los datos y el estado de la orden.'), codigo ?? error.code)
      }
    })
}
