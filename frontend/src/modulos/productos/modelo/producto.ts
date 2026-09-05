import { z } from 'zod'

const textoOpcional = (maximo: number) =>
  z.string().trim().max(maximo, `Máximo ${maximo} caracteres`)

const importeOpcional = z
  .string()
  .trim()
  .refine(
    (valor) => valor === '' || /^\d+(\.\d{1,2})?$/.test(valor),
    'Usa un importe válido con hasta 2 decimales',
  )

const decimalOpcional = (decimales: number, positivo: boolean) =>
  z
    .string()
    .trim()
    .refine(
      (valor) =>
        valor === '' ||
        new RegExp(`^\\d+(\\.\\d{1,${decimales}})?$`).test(valor),
      `Usa un número válido con hasta ${decimales} decimales`,
    )
    .refine(
      (valor) => valor === '' || !positivo || Number(valor) > 0,
      'El valor debe ser mayor que cero',
    )

export const afectacionesIgv = [
  { valor: '', etiqueta: 'Por definir' },
  { valor: 'gravado', etiqueta: 'Gravado' },
  { valor: 'exonerado', etiqueta: 'Exonerado' },
  { valor: 'inafecto', etiqueta: 'Inafecto' },
] as const

export type AfectacionTributaria = 'por-definir' | 'gravado' | 'exonerado' | 'inafecto'

const esquemaUnidadAlternativa = z.object({
  id: z.string().uuid().optional(),
  unidadId: z.string().uuid('Selecciona una unidad válida'),
  unidadNombre: textoOpcional(40),
  equivalencia: decimalOpcional(6, true).refine(Boolean, 'Ingresa la equivalencia'),
  codigoBarras: textoOpcional(50),
  precioVenta: importeOpcional,
})

export const esquemaProducto = z.object({
  codigo: z
    .string()
    .trim()
    .min(1, 'Ingresa el código interno')
    .max(30, 'Máximo 30 caracteres')
    .transform((valor) => valor.toUpperCase()),
  descripcion: z
    .string()
    .trim()
    .min(2, 'Ingresa una descripción válida')
    .max(160, 'Máximo 160 caracteres'),
  descripcionAmpliada: textoOpcional(5000),
  codigoBarras: textoOpcional(50),
  categoria: textoOpcional(80),
  sublinea: textoOpcional(80),
  laboratorio: textoOpcional(100),
  presentacion: textoOpcional(100),
  tipo: z.enum(['good', 'service']),
  unidadBaseId: z.string().uuid('Selecciona una unidad de medida'),
  // Campo derivado de unidadBaseId para conservar compatibilidad con lecturas
  // anteriores. El usuario no debe completarlo ni puede bloquear el formulario.
  unidadMedida: textoOpcional(40),
  afectacionIgv: z.enum(['', 'gravado', 'exonerado', 'inafecto']),
  costo: importeOpcional,
  precioVenta: importeOpcional,
  precioMinimo: importeOpcional,
  stockMaximo: decimalOpcional(3, false),
  anchoCm: decimalOpcional(3, true),
  altoCm: decimalOpcional(3, true),
  largoCm: decimalOpcional(3, true),
  pesoKg: decimalOpcional(3, true),
  registroSanitario: textoOpcional(80),
  controlLote: z.boolean(),
  controlVencimiento: z.boolean(),
  serialControl: z.boolean(),
  ventaReceta: z.boolean(),
  activo: z.boolean(),
  unidadesAlternativas: z.array(esquemaUnidadAlternativa).max(12, 'Máximo 12 unidades alternativas'),
}).superRefine((datos, contexto) => {
  if (
    datos.precioMinimo &&
    datos.precioVenta &&
    Number(datos.precioMinimo) > Number(datos.precioVenta)
  ) {
    contexto.addIssue({
      code: 'custom',
      path: ['precioMinimo'],
      message: 'No puede superar el precio de venta base',
    })
  }

  if (datos.tipo === 'service' && (datos.controlLote || datos.controlVencimiento || datos.serialControl)) {
    contexto.addIssue({ code: 'custom', path: ['tipo'], message: 'Los servicios no controlan lote ni vencimiento' })
  }

  const unidades = new Set<string>()
  const codigosBarras = new Set(
    datos.codigoBarras ? [datos.codigoBarras.trim().toLocaleUpperCase('es-PE')] : [],
  )
  for (const [indice, unidad] of datos.unidadesAlternativas.entries()) {
    if (unidad.unidadId === datos.unidadBaseId || unidades.has(unidad.unidadId)) {
      contexto.addIssue({ code: 'custom', path: ['unidadesAlternativas', indice, 'unidadId'], message: 'La unidad debe ser diferente y no repetirse' })
    }
    unidades.add(unidad.unidadId)
    const codigoBarras = unidad.codigoBarras.trim().toLocaleUpperCase('es-PE')
    if (codigoBarras && codigosBarras.has(codigoBarras)) {
      contexto.addIssue({ code: 'custom', path: ['unidadesAlternativas', indice, 'codigoBarras'], message: 'Este código de barras ya está usado en el producto' })
    }
    if (codigoBarras) codigosBarras.add(codigoBarras)
  }
})

export type DatosProducto = z.infer<typeof esquemaProducto>
export type UnidadAlternativaProducto = DatosProducto['unidadesAlternativas'][number]

export interface UnidadMedida {
  id: string
  codigo: string
  nombre: string
}

export interface ResultadoGuardadoProducto {
  productoId?: string
  error?: string
  advertencia?: string
}

export interface Producto extends Omit<DatosProducto, 'sublinea' | 'costo'> {
  id: string
  sublinea?: string
  costo?: string
  miniaturaUrl?: string
}

export type TipoArchivoProducto = 'image' | 'technical-sheet' | 'attachment'

export interface ArchivoProducto {
  id: string
  ruta: string
  tipo: TipoArchivoProducto
  nombre: string
  mimeType: string
  bytes: number
  descripcion: string
  principal: boolean
  orden: number
  creadoEn: string
  url: string
}

export type TipoEventoProducto =
  | 'baseline'
  | 'created'
  | 'updated'
  | 'status-changed'
  | 'restored'
  | 'file-added'
  | 'file-updated'
  | 'file-removed'

export interface VersionProducto {
  id: number
  numero: number
  tipo: TipoEventoProducto
  resumen: string
  cambios: Record<string, { before?: unknown; after?: unknown }>
  actorId: string | null
  creadoEn: string
  snapshot: Producto
}

export interface ResumenProductos {
  total: number
  activos: number
  inactivos: number
}

export function resumirProductos(
  productos: readonly Producto[],
): ResumenProductos {
  let activos = 0

  for (const producto of productos) {
    if (producto.activo) activos += 1
  }

  return {
    total: productos.length,
    activos,
    inactivos: productos.length - activos,
  }
}

export const productoInicial: DatosProducto = {
  codigo: '',
  descripcion: '',
  descripcionAmpliada: '',
  codigoBarras: '',
  categoria: '',
  sublinea: '',
  laboratorio: '',
  presentacion: '',
  tipo: 'good',
  unidadBaseId: '',
  unidadMedida: '',
  afectacionIgv: '',
  costo: '',
  precioVenta: '',
  precioMinimo: '',
  stockMaximo: '',
  anchoCm: '',
  altoCm: '',
  largoCm: '',
  pesoKg: '',
  registroSanitario: '',
  controlLote: false,
  controlVencimiento: false,
  serialControl: false,
  ventaReceta: false,
  activo: true,
  unidadesAlternativas: [],
}
