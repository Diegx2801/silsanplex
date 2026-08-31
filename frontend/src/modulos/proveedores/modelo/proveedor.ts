import { z } from 'zod'

const textoOpcional = (maximo: number) =>
  z.string().trim().max(maximo, `Máximo ${maximo} caracteres`)

export const tiposDocumentoProveedor = [
  { valor: 'ruc', etiqueta: 'RUC' },
  { valor: 'dni', etiqueta: 'DNI' },
  { valor: 'ce', etiqueta: 'Carné de extranjería' },
  { valor: 'pasaporte', etiqueta: 'Pasaporte' },
  { valor: 'otro', etiqueta: 'Otro' },
] as const

export type TipoDocumentoProveedor =
  (typeof tiposDocumentoProveedor)[number]['valor']
export type CondicionCreditoProveedor = 'contado' | 'credito'

export const esquemaDatosProveedor = z
  .object({
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .max(30, 'Máximo 30 caracteres')
      .refine(
        (valor) => valor === '' || /^[A-Z0-9][A-Z0-9._-]{1,29}$/.test(valor),
        'Usa entre 2 y 30 letras, números, puntos, guiones o guion bajo',
      ),
    tipoDocumento: z.enum(['ruc', 'dni', 'ce', 'pasaporte', 'otro']),
    numeroDocumento: z
      .string()
      .trim()
      .toUpperCase()
      .min(4, 'Ingresa el número de documento')
      .max(30, 'Máximo 30 caracteres')
      .regex(/^[A-Z0-9-]+$/, 'Usa solo letras, números o guiones'),
    razonSocial: z
      .string()
      .trim()
      .min(2, 'Ingresa la razón social o nombre')
      .max(160, 'Máximo 160 caracteres'),
    nombreComercial: textoOpcional(160),
    contacto: textoOpcional(120),
    cargoContacto: textoOpcional(100),
    email: z
      .string()
      .trim()
      .max(254, 'Máximo 254 caracteres')
      .refine(
        (valor) => valor === '' || z.string().email().safeParse(valor).success,
        'Ingresa un correo válido',
      ),
    telefono: textoOpcional(30).refine(
      (valor) => valor === '' || valor.length >= 6,
      'El teléfono debe tener al menos 6 caracteres',
    ),
    direccion: textoOpcional(250).refine(
      (valor) => valor === '' || valor.length >= 3,
      'La dirección fiscal debe tener al menos 3 caracteres',
    ),
    ubigeo: z.string().trim().refine(
      (valor) => valor === '' || /^\d{6}$/.test(valor),
      'El ubigeo debe contener 6 dígitos',
    ),
    estadoContribuyente: textoOpcional(40),
    condicionDomicilio: textoOpcional(40),
    fuenteDatosFiscales: textoOpcional(40),
    fechaConsultaSunat: z.string().datetime({ offset: true }).nullable(),
    condicionCredito: z.enum(['contado', 'credito']),
    diasCredito: z
      .string()
      .trim()
      .regex(/^\d+$/, 'Ingresa una cantidad entera de días')
      .refine((valor) => Number(valor) <= 3650, 'Máximo 3650 días'),
    observaciones: textoOpcional(1000),
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

    const diasCredito = Number(datos.diasCredito)
    if (datos.condicionCredito === 'contado' && diasCredito !== 0) {
      contexto.addIssue({
        code: 'custom',
        path: ['diasCredito'],
        message: 'Una condición al contado debe tener 0 días',
      })
    }
    if (datos.condicionCredito === 'credito' && diasCredito < 1) {
      contexto.addIssue({
        code: 'custom',
        path: ['diasCredito'],
        message: 'Indica al menos 1 día para una condición a crédito',
      })
    }
  })

export type DatosProveedor = z.infer<typeof esquemaDatosProveedor>

export interface Proveedor {
  id: string
  organizationId: string
  codigo: string
  tipoDocumento: TipoDocumentoProveedor
  numeroDocumento: string
  razonSocial: string
  nombreComercial: string
  contacto: string
  cargoContacto: string
  email: string
  telefono: string
  direccion: string
  ubigeo: string
  estadoContribuyente: string
  condicionDomicilio: string
  fuenteDatosFiscales: string
  fechaConsultaSunat: string | null
  condicionCredito: CondicionCreditoProveedor
  diasCredito: number
  observaciones: string
  activo: boolean
  fechaRegistro: string
  fechaActualizacion: string
}

export const proveedorInicial: DatosProveedor = {
  codigo: '',
  tipoDocumento: 'ruc',
  numeroDocumento: '',
  razonSocial: '',
  nombreComercial: '',
  contacto: '',
  cargoContacto: '',
  email: '',
  telefono: '',
  direccion: '',
  ubigeo: '',
  estadoContribuyente: '',
  condicionDomicilio: '',
  fuenteDatosFiscales: '',
  fechaConsultaSunat: null,
  condicionCredito: 'contado',
  diasCredito: '0',
  observaciones: '',
  activo: true,
}

export function proveedorAFormulario(proveedor: Proveedor): DatosProveedor {
  return {
    codigo: proveedor.codigo,
    tipoDocumento: proveedor.tipoDocumento,
    numeroDocumento: proveedor.numeroDocumento,
    razonSocial: proveedor.razonSocial,
    nombreComercial: proveedor.nombreComercial,
    contacto: proveedor.contacto,
    cargoContacto: proveedor.cargoContacto,
    email: proveedor.email,
    telefono: proveedor.telefono,
    direccion: proveedor.direccion,
    ubigeo: proveedor.ubigeo,
    estadoContribuyente: proveedor.estadoContribuyente,
    condicionDomicilio: proveedor.condicionDomicilio,
    fuenteDatosFiscales: proveedor.fuenteDatosFiscales,
    fechaConsultaSunat: proveedor.fechaConsultaSunat,
    condicionCredito: proveedor.condicionCredito,
    diasCredito: proveedor.diasCredito.toString(),
    observaciones: proveedor.observaciones,
    activo: proveedor.activo,
  }
}
