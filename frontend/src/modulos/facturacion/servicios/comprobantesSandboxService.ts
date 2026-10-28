import { supabase } from '@/lib/supabase'
import {
  esquemaReferenciaComprobanteSandbox,
  leerComprobanteSandbox,
} from '@/modulos/facturacion/modelo/comprobanteSandbox'

export class ErrorConsultaFiscal extends Error {
  readonly codigo: 'REFERENCIA_INVALIDA' | 'SIN_ACCESO' | 'NO_ENCONTRADO'
    | 'NO_DISPONIBLE' | 'CONSULTA_FALLIDA' | 'RESPUESTA_INVALIDA'

  constructor(codigo: 'REFERENCIA_INVALIDA' | 'SIN_ACCESO' | 'NO_ENCONTRADO'
    | 'NO_DISPONIBLE' | 'CONSULTA_FALLIDA' | 'RESPUESTA_INVALIDA') {
    const mensajes = {
      REFERENCIA_INVALIDA: 'Selecciona una organización y un comprobante válidos',
      SIN_ACCESO: 'No tienes acceso a la consulta fiscal de esta organización',
      NO_ENCONTRADO: 'El comprobante no existe o no está disponible para esta consulta',
      NO_DISPONIBLE: 'La persistencia fiscal sandbox no está disponible en este entorno',
      CONSULTA_FALLIDA: 'No se pudo consultar el comprobante sandbox; puedes reintentar',
      RESPUESTA_INVALIDA: 'La respuesta no corresponde al contrato fiscal sandbox esperado',
    }
    super(mensajes[codigo])
    this.codigo = codigo
    this.name = 'ErrorConsultaFiscal'
  }
}

export async function consultarComprobanteSandbox(organizationId: string, documentId: string, signal?: AbortSignal) {
  const referencia = esquemaReferenciaComprobanteSandbox.safeParse({ organizationId, documentId })
  if (!referencia.success) throw new ErrorConsultaFiscal('REFERENCIA_INVALIDA')
  const consulta = supabase.rpc('get_electronic_document', {
    organization_id: referencia.data.organizationId,
    document_id: referencia.data.documentId,
  })
  const respuesta = await (signal ? consulta.abortSignal(signal) : consulta).then(
    (resultado) => resultado,
    () => { throw new ErrorConsultaFiscal('CONSULTA_FALLIDA') },
  )
  const { data, error } = respuesta
  if (error) {
    if (error.code === '42501') throw new ErrorConsultaFiscal('SIN_ACCESO')
    if (error.message === 'CPE_DOCUMENT_NOT_FOUND') throw new ErrorConsultaFiscal('NO_ENCONTRADO')
    if (['42883', 'PGRST202'].includes(error.code)) throw new ErrorConsultaFiscal('NO_DISPONIBLE')
    throw new ErrorConsultaFiscal('CONSULTA_FALLIDA')
  }
  try {
    return leerComprobanteSandbox(data, referencia.data.organizationId, referencia.data.documentId)
  } catch {
    throw new ErrorConsultaFiscal('RESPUESTA_INVALIDA')
  }
}
