import { z } from 'zod'

const textoOpcional = (maximo: number) =>
  z.string().trim().max(maximo, `Máximo ${maximo} caracteres`)

export const tiposDocumentoCliente = [
  { valor: 'ruc', etiqueta: 'RUC' },
  { valor: 'dni', etiqueta: 'DNI' },
  { valor: 'ce', etiqueta: 'Carné de extranjería' },
  { valor: 'otro', etiqueta: 'Otro' },
] as const

export const esquemaDatosCliente = z
  .object({
    tipoDocumento: z.enum(['ruc', 'dni', 'ce', 'otro']),
    numeroDocumento: z
      .string()
      .trim()
      .min(1, 'Ingresa el número de documento')
      .max(20, 'Máximo 20 caracteres'),
    nombreRazonSocial: z
      .string()
      .trim()
      .min(2, 'Ingresa el nombre o razón social')
      .max(160, 'Máximo 160 caracteres'),
    nombreComercial: textoOpcional(120),
    contacto: textoOpcional(120),
    email: z
      .string()
      .trim()
      .refine(
        (valor) => valor === '' || z.string().email().safeParse(valor).success,
        'Ingresa un correo válido',
      ),
    telefono: textoOpcional(30),
    direccion: textoOpcional(200),
    activo: z.boolean(),
  })
  .superRefine((datos, contexto) => {
    if (datos.tipoDocumento === 'ruc' && !/^\d{11}$/.test(datos.numeroDocumento)) {
      contexto.addIssue({
        code: 'custom',
        path: ['numeroDocumento'],
        message: 'El RUC debe contener 11 dígitos',
      })
    }
    if (datos.tipoDocumento === 'dni' && !/^\d{8}$/.test(datos.numeroDocumento)) {
      contexto.addIssue({
        code: 'custom',
        path: ['numeroDocumento'],
        message: 'El DNI debe contener 8 dígitos',
      })
    }
  })

export type DatosCliente = z.infer<typeof esquemaDatosCliente>

export const esquemaCliente = esquemaDatosCliente.and(
  z.object({
    id: z.string().min(1),
    fechaRegistro: z.string().datetime(),
  }),
)

export type Cliente = z.infer<typeof esquemaCliente>

export function normalizarBusquedaCliente(valor: string) {
  return valor
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-PE')
}

export function clienteCoincideBusqueda(cliente: Cliente, busqueda: string) {
  const termino = normalizarBusquedaCliente(busqueda)
  if (!termino) return true

  return normalizarBusquedaCliente(
    [
      cliente.numeroDocumento,
      cliente.nombreRazonSocial,
      cliente.nombreComercial,
      cliente.contacto,
      cliente.email,
      cliente.telefono,
    ].join(' '),
  ).includes(termino)
}
