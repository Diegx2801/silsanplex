/**
 * SILSANPLEX opera con empresas peruanas. Los timestamps técnicos se
 * conservan como instantes UTC, mientras que las fechas de negocio usan el
 * calendario de America/Lima (Trujillo comparte esta zona horaria).
 */
export const ZONA_HORARIA_NEGOCIO = 'America/Lima'

const formatoPartesFecha = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_HORARIA_NEGOCIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const formatoFechaCalendario = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const formatoFechaHora = new Intl.DateTimeFormat('es-PE', {
  timeZone: ZONA_HORARIA_NEGOCIO,
  dateStyle: 'medium',
  timeStyle: 'short',
})

function obtenerParte(partes: Intl.DateTimeFormatPart[], tipo: Intl.DateTimeFormatPartTypes) {
  return partes.find((parte) => parte.type === tipo)?.value ?? ''
}

/** Obtiene la fecha calendario YYYY-MM-DD vigente en Lima. */
export function fechaActualPeru(reloj = new Date()) {
  const partes = formatoPartesFecha.formatToParts(reloj)
  return [
    obtenerParte(partes, 'year'),
    obtenerParte(partes, 'month'),
    obtenerParte(partes, 'day'),
  ].join('-')
}

/** Convierte un timestamp UTC a la fecha calendario correspondiente en Lima. */
export function fechaPeruDesdeTimestamp(valor: string) {
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? '' : fechaActualPeru(fecha)
}

/** Suma días calendario en Lima sin depender de la zona horaria del navegador. */
export function fechaPeruEnDias(dias: number, reloj = new Date()) {
  const fecha = new Date(`${fechaActualPeru(reloj)}T12:00:00.000Z`)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

/** Formatea un campo SQL DATE sin convertirlo accidentalmente a otra fecha. */
export function formatearFechaCalendarioPeru(valor: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor
  return formatoFechaCalendario.format(new Date(`${valor}T12:00:00.000Z`))
}

/** Formatea un timestamptz persistido mostrando la hora peruana. */
export function formatearFechaHoraPeru(valor: string) {
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? valor : formatoFechaHora.format(fecha)
}
