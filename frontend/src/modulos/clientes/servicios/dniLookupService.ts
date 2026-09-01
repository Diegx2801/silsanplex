import { z } from 'zod'
import { invokeEdgeFunction } from '@/lib/edgeFunctions'

const esquemaConsultaDni = z.object({
  dni: z.string().regex(/^\d{8}$/),
  firstName: z.string(),
  firstLastName: z.string(),
  secondLastName: z.string(),
  fullName: z.string().trim().min(2),
  source: z.literal('DECOLECTA_RENIEC'),
  checkedAt: z.string().datetime({ offset: true }),
})

export type ResultadoConsultaDni = z.infer<typeof esquemaConsultaDni>

export async function consultarDni(dni: string): Promise<ResultadoConsultaDni> {
  const resultado = await invokeEdgeFunction<unknown>('dni-lookup', { dni })
  const validacion = esquemaConsultaDni.safeParse(resultado)
  if (!validacion.success) {
    throw new Error('El servicio de identidad devolvió datos incompletos. Puedes continuar manualmente.')
  }
  return validacion.data
}
