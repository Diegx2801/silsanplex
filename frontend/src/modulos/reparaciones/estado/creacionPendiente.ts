import { esquemaDatosReparacion, type DatosReparacion } from '../modelo/reparacion'
import { ErrorReparacion } from '../servicios/reparacionesService'

interface CreacionPendiente { datos: DatosReparacion; clave: string }
const almacenamiento = (ambito: string) => `repairs:pending-create:v1:${ambito}`

export function leerCreacionPendiente(ambito: string): CreacionPendiente | null {
  const raw = sessionStorage.getItem(almacenamiento(ambito))
  if (!raw) return null
  const valor = JSON.parse(raw)
  const datos = esquemaDatosReparacion.parse(valor.datos)
  if (typeof valor.clave !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor.clave)) {
    throw new Error('No se pudo recuperar el registro pendiente. No se enviará otra creación.')
  }
  return { datos, clave: valor.clave }
}

export async function crearConReintentoPersistente(
  ambito: string,
  datos: DatosReparacion,
  clave: string,
  enviar: (datos: DatosReparacion, clave: string) => Promise<unknown>,
) {
  const anterior = leerCreacionPendiente(ambito)
  const normalizados = esquemaDatosReparacion.parse(datos)
  if (anterior && JSON.stringify(anterior.datos) !== JSON.stringify(normalizados)) {
    throw new Error('Hay un registro pendiente de confirmar. Cierra y vuelve a abrir el formulario para recuperar sus datos y reintentarlo antes de crear otra reparación.')
  }
  const pendiente = anterior ?? { datos: normalizados, clave }
  // Persist before the RPC. A storage failure must never send an untracked create.
  sessionStorage.setItem(almacenamiento(ambito), JSON.stringify(pendiente))
  try {
    await enviar(pendiente.datos, pendiente.clave)
  } catch (error) {
    // Only a definitive rejection of the first attempt permits changing intent.
    // A replay rejection cannot prove that the previous ambiguous call failed.
    if (!anterior && error instanceof ErrorReparacion && error.codigo
      && (/^(22|23|42501)/.test(error.codigo) || error.codigo.startsWith('REPAIR_'))) {
      sessionStorage.removeItem(almacenamiento(ambito))
    }
    throw error
  }
  sessionStorage.removeItem(almacenamiento(ambito))
}
