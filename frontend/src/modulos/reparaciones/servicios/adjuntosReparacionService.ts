import { supabase } from '@/lib/supabase'

const bucket = 'repair-attachments'
export const limiteAdjuntoReparacion = 5 * 1024 * 1024
export const tiposAdjuntoReparacion = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const
export interface AdjuntoReparacion {
  id: string
  nombre: string
  tipo: string
  bytes: number
  creadoEn: string
  ruta: string
}
interface FilaAdjunto {
  id: string
  file_name: string
  mime_type: string
  byte_size: number
  created_at: string
  storage_path: string
}
const columnas = 'id,file_name,mime_type,byte_size,created_at,storage_path'
function mapear(fila: FilaAdjunto): AdjuntoReparacion {
  return { id: fila.id, nombre: fila.file_name, tipo: fila.mime_type, bytes: fila.byte_size, creadoEn: fila.created_at, ruta: fila.storage_path }
}
function validarAmbito(organizacionId: string, reparacionId: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuid.test(organizacionId) || !uuid.test(reparacionId)) throw new Error('No se pudo identificar la reparación. Vuelve a abrirla.')
}
export function validarAdjuntoReparacion(archivo: File) {
  if (!(tiposAdjuntoReparacion as readonly string[]).includes(archivo.type)) throw new Error('Selecciona un PDF o una imagen JPG, PNG o WEBP.')
  if (archivo.size < 1 || archivo.size > limiteAdjuntoReparacion) throw new Error('El archivo debe tener contenido y pesar como máximo 5 MB.')
}
export async function listarAdjuntosReparacion(organizacionId: string, reparacionId: string): Promise<AdjuntoReparacion[]> {
  validarAmbito(organizacionId, reparacionId)
  const { data, error } = await supabase.from('repair_attachments').select(columnas)
    .eq('organization_id', organizacionId).eq('repair_id', reparacionId).order('created_at', { ascending: false })
  if (error) throw new Error('No se pudieron cargar los adjuntos. Intenta nuevamente.')
  return ((data ?? []) as FilaAdjunto[]).map(mapear)
}
export async function adjuntarArchivoReparacion(organizacionId: string, reparacionId: string, usuarioId: string, archivo: File) {
  validarAmbito(organizacionId, reparacionId)
  validarAdjuntoReparacion(archivo)
  // Neither the path nor the extension comes from a user-controlled filename.
  const id = crypto.randomUUID()
  const ruta = `${organizacionId}/${reparacionId}/${id}`
  const nombre = archivo.name.replace(/[\p{Cc}/\\]/gu, '_').trim().slice(0, 180) || 'Adjunto'
  const { error: errorCarga } = await supabase.storage.from(bucket).upload(ruta, archivo, { contentType: archivo.type, upsert: false })
  if (errorCarga) throw new Error('No se pudo subir el archivo. Comprueba tu conexión e intenta nuevamente.')
  const { data, error } = await supabase.from('repair_attachments').insert({
    id, organization_id: organizacionId, repair_id: reparacionId, storage_path: ruta,
    file_name: nombre, mime_type: archivo.type, byte_size: archivo.size, created_by: usuarioId,
  }).select(columnas).single()
  if (error) {
    // The response can be lost after commit. Read the same identity before
    // reporting failure; never overwrite or delete historical evidence.
    const { data: recuperado } = await supabase.from('repair_attachments').select(columnas)
      .eq('organization_id', organizacionId).eq('repair_id', reparacionId).eq('id', id).maybeSingle()
    if (recuperado) return mapear(recuperado as FilaAdjunto)
    throw new Error('El archivo se subió, pero no se pudo confirmar su registro. Actualiza la lista antes de volver a adjuntarlo.')
  }
  return mapear(data as FilaAdjunto)
}
export async function obtenerDescargaAdjuntoReparacion(organizacionId: string, reparacionId: string, adjuntoId: string) {
  validarAmbito(organizacionId, reparacionId)
  // Re-read authorized metadata: do not sign an arbitrary caller-provided path.
  const { data, error } = await supabase.from('repair_attachments').select(columnas)
    .eq('organization_id', organizacionId).eq('repair_id', reparacionId).eq('id', adjuntoId).single()
  if (error || !data) throw new Error('El adjunto no está disponible o no tienes permiso para consultarlo.')
  const fila = data as FilaAdjunto
  const { data: firma, error: errorFirma } = await supabase.storage.from(bucket)
    .createSignedUrl(fila.storage_path, 60, { download: fila.file_name })
  if (errorFirma || !firma?.signedUrl) throw new Error('No se pudo preparar la descarga. Intenta nuevamente.')
  return firma.signedUrl
}
