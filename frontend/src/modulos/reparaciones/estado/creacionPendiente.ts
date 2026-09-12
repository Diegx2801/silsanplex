import { z } from 'zod'

import {
  esquemaDatosCotizacion,
  esquemaDatosReparacion,
  esquemaDatosReservaParte,
  type DatosCotizacion,
  type DatosReparacion,
  type DatosReservaParte,
} from '../modelo/reparacion'
import { ErrorReparacion } from '../servicios/reparacionesService'

interface CreacionPendiente { datos: DatosReparacion; clave: string }
const almacenamiento = (ambito: string) => `repairs:pending-create:v1:${ambito}`
const almacenamientoComando = (ambito: string) => `repairs:pending-command:v1:${ambito}`
const patronUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const esquemaCotizacionPendiente = z.object({
  datos: esquemaDatosCotizacion,
  enviar: z.boolean(),
  expectedLockVersion: z.number().int().nonnegative(),
  quoteId: z.string().uuid().optional(),
})
const esquemaReservaPendiente = z.object({
  datos: esquemaDatosReservaParte,
  expectedLockVersion: z.number().int().nonnegative(),
})

export interface CotizacionPendiente {
  datos: DatosCotizacion
  enviar: boolean
  expectedLockVersion: number
  quoteId?: string
  clave: string
}

export interface ReservaPartePendiente {
  datos: DatosReservaParte
  expectedLockVersion: number
  clave: string
}

function validarClave(clave: unknown, mensaje: string) {
  if (typeof clave !== 'string' || !patronUuid.test(clave)) throw new Error(mensaje)
  return clave
}

function esRechazoDefinitivo(error: unknown) {
  return error instanceof ErrorReparacion && Boolean(error.codigo)
    && (/^(22|23|42501)/.test(error.codigo!) || error.codigo!.startsWith('REPAIR_'))
}

function leerComandoPendiente<T>(
  ambito: string,
  esquema: z.ZodType<T>,
  mensaje: string,
): (T & { clave: string }) | null {
  const raw = sessionStorage.getItem(almacenamientoComando(ambito))
  if (!raw) return null
  try {
    const valor = JSON.parse(raw) as { intencion?: unknown; clave?: unknown }
    const intencion = esquema.parse(valor.intencion)
    return Object.assign(intencion as object, {
      clave: validarClave(valor.clave, mensaje),
    }) as T & { clave: string }
  } catch {
    throw new Error(mensaje)
  }
}

async function ejecutarComandoConReintentoPersistente<T>(
  ambito: string,
  intencion: T,
  clave: string,
  esquema: z.ZodType<T>,
  obtenerFirma: (intencion: T) => unknown,
  enviar: (intencion: T, clave: string) => Promise<unknown>,
) {
  const anterior = leerComandoPendiente(
    ambito,
    esquema,
    'No se pudo recuperar la operación pendiente. No se enviará otro comando.',
  )
  const normalizada = esquema.parse(intencion)
  let intencionPendiente = normalizada
  if (anterior) {
    const { clave: _claveAnterior, ...intencionAnterior } = anterior
    if (JSON.stringify(obtenerFirma(intencionAnterior as T))
      !== JSON.stringify(obtenerFirma(normalizada))) {
      throw new Error('Hay una operación pendiente de confirmar. Reabre el formulario para recuperar sus datos y reintentarla antes de enviar otra intención.')
    }
    intencionPendiente = intencionAnterior as T
  }
  const pendiente = anterior
    ? { intencion: intencionPendiente, clave: anterior.clave }
    : { intencion: normalizada, clave: validarClave(clave, 'La clave de operación no es válida.') }
  // Persist before the RPC. A storage failure must never send an untracked command.
  sessionStorage.setItem(almacenamientoComando(ambito), JSON.stringify(pendiente))
  try {
    await enviar(pendiente.intencion, pendiente.clave)
  } catch (error) {
    if (!anterior && esRechazoDefinitivo(error)) {
      sessionStorage.removeItem(almacenamientoComando(ambito))
    }
    throw error
  }
  sessionStorage.removeItem(almacenamientoComando(ambito))
}

export function leerCreacionPendiente(ambito: string): CreacionPendiente | null {
  const raw = sessionStorage.getItem(almacenamiento(ambito))
  if (!raw) return null
  const valor = JSON.parse(raw)
  const datos = esquemaDatosReparacion.parse(valor.datos)
  return {
    datos,
    clave: validarClave(
      valor.clave,
      'No se pudo recuperar el registro pendiente. No se enviará otra creación.',
    ),
  }
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
    if (!anterior && esRechazoDefinitivo(error)) {
      sessionStorage.removeItem(almacenamiento(ambito))
    }
    throw error
  }
  sessionStorage.removeItem(almacenamiento(ambito))
}

export function leerCotizacionPendiente(ambito: string): CotizacionPendiente | null {
  return leerComandoPendiente(
    ambito,
    esquemaCotizacionPendiente,
    'No se pudo recuperar la cotización pendiente. No se enviará otra cotización.',
  )
}

export function guardarCotizacionConReintentoPersistente(
  ambito: string,
  intencion: Omit<CotizacionPendiente, 'clave'>,
  clave: string,
  enviar: (intencion: Omit<CotizacionPendiente, 'clave'>, clave: string) => Promise<unknown>,
) {
  return ejecutarComandoConReintentoPersistente(
    ambito,
    intencion,
    clave,
    esquemaCotizacionPendiente,
    (pendiente) => ({ datos: pendiente.datos, enviar: pendiente.enviar }),
    enviar,
  )
}

export function leerReservaPartePendiente(ambito: string): ReservaPartePendiente | null {
  return leerComandoPendiente(
    ambito,
    esquemaReservaPendiente,
    'No se pudo recuperar la reserva pendiente. No se enviará otra reserva.',
  )
}

export function reservarParteConReintentoPersistente(
  ambito: string,
  intencion: Omit<ReservaPartePendiente, 'clave'>,
  clave: string,
  enviar: (intencion: Omit<ReservaPartePendiente, 'clave'>, clave: string) => Promise<unknown>,
) {
  return ejecutarComandoConReintentoPersistente(
    ambito,
    intencion,
    clave,
    esquemaReservaPendiente,
    (pendiente) => pendiente.datos,
    enviar,
  )
}
