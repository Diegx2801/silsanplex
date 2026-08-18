import { z } from 'zod'

const textoOpcional = (maximo: number) =>
  z.string().trim().max(maximo, `Máximo ${maximo} caracteres`)

export const afectacionesIgv = [
  { valor: '', etiqueta: 'Por definir' },
  { valor: 'gravado', etiqueta: 'Gravado' },
  { valor: 'exonerado', etiqueta: 'Exonerado' },
  { valor: 'inafecto', etiqueta: 'Inafecto' },
] as const

export const esquemaProducto = z.object({
  codigo: z
    .string()
    .trim()
    .min(1, 'Ingresa el código interno')
    .max(30, 'Máximo 30 caracteres'),
  descripcion: z
    .string()
    .trim()
    .min(2, 'Ingresa una descripción válida')
    .max(160, 'Máximo 160 caracteres'),
  codigoBarras: textoOpcional(50),
  categoria: textoOpcional(80),
  laboratorio: textoOpcional(100),
  presentacion: textoOpcional(100),
  unidadMedida: textoOpcional(40),
  afectacionIgv: z.enum(['', 'gravado', 'exonerado', 'inafecto']),
  precioVenta: z
    .string()
    .trim()
    .refine(
      (valor) => valor === '' || /^\d+(\.\d{1,2})?$/.test(valor),
      'Usa un importe válido con hasta 2 decimales',
    ),
  registroSanitario: textoOpcional(80),
  controlLote: z.boolean(),
  ventaReceta: z.boolean(),
  activo: z.boolean(),
})

export type DatosProducto = z.infer<typeof esquemaProducto>

export interface Producto extends DatosProducto {
  id: string
}

export const productoInicial: DatosProducto = {
  codigo: '',
  descripcion: '',
  codigoBarras: '',
  categoria: '',
  laboratorio: '',
  presentacion: '',
  unidadMedida: '',
  afectacionIgv: '',
  precioVenta: '',
  registroSanitario: '',
  controlLote: true,
  ventaReceta: false,
  activo: true,
}
