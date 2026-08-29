import { z } from 'zod'
import { invokeEdgeFunction } from '@/lib/edgeFunctions'

const esquemaConsultaRuc = z.object({
  lookupId: z.string().uuid().nullable(),
  ruc: z.string().regex(/^\d{11}$/),
  legalName: z.string().trim().min(2),
  taxpayerStatus: z.string(),
  domicileCondition: z.string(),
  ubigeoCode: z.string(),
  fiscalAddress: z.string(),
  source: z.string(),
  checkedAt: z.string().datetime({ offset: true }),
  cacheHit: z.boolean(),
})

export type ResultadoConsultaRuc = z.infer<typeof esquemaConsultaRuc>

export async function consultarRuc(ruc: string): Promise<ResultadoConsultaRuc> {
  const resultado = await invokeEdgeFunction<unknown>('ruc-lookup', { ruc })
  const validacion = esquemaConsultaRuc.safeParse(resultado)
  if (!validacion.success) {
    throw new Error('El servicio tributario devolvió datos incompletos. Puedes continuar manualmente.')
  }
  return validacion.data
}
