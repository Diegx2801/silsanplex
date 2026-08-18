export type NivelHallazgo = 'bloqueo' | 'advertencia' | 'informativo'

export interface HallazgoImportacion {
  id: string
  nivel: NivelHallazgo
  titulo: string
  detalle: string
  cantidad: number
  unidad: string
  ejemplos: string[]
}

export interface ResumenImportacion {
  productos: number
  codigosProducto: number
  precios: number
  codigosConPrecio: number
  coincidencias: number
}

export interface ResultadoImportacion {
  resumen: ResumenImportacion
  hallazgos: HallazgoImportacion[]
  tieneBloqueos: boolean
}

export type FilaImportacion = Record<string, string>

const gruposUnidades: Record<string, string[]> = {
  UNIDAD: ['UNIDAD', 'UND'],
  CAJA: ['CAJA', 'CJA'],
  PAQUETE: ['PAQUETE', 'PAQ', 'PQT'],
}

const normalizar = (valor: string) => valor.trim().toLocaleUpperCase('es-PE')

function agruparPor(
  filas: FilaImportacion[],
  obtenerClave: (fila: FilaImportacion) => string,
) {
  const grupos = new Map<string, FilaImportacion[]>()

  for (const fila of filas) {
    const clave = obtenerClave(fila)

    if (!clave) continue
    grupos.set(clave, [...(grupos.get(clave) ?? []), fila])
  }

  return grupos
}

function ejemplosLimitados(valores: Iterable<string>) {
  return [...valores].filter(Boolean).slice(0, 3)
}

function firmaFila(fila: FilaImportacion) {
  return Object.entries(fila)
    .map(([clave, valor]) => `${clave}:${normalizar(valor)}`)
    .join('|')
}

export function analizarFilasImportacion(
  productos: FilaImportacion[],
  precios: FilaImportacion[],
): ResultadoImportacion {
  const productosPorCodigo = agruparPor(productos, (fila) =>
    normalizar(fila.Codigo ?? ''),
  )
  const preciosPorCodigo = agruparPor(precios, (fila) =>
    normalizar(fila.CodigoProducto ?? ''),
  )
  const codigosProducto = new Set(productosPorCodigo.keys())
  const codigosPrecio = new Set(preciosPorCodigo.keys())
  const hallazgos: HallazgoImportacion[] = []

  const codigosAmbiguos = [...productosPorCodigo.entries()].filter(
    ([, filas]) =>
      new Set(filas.map((fila) => normalizar(fila.Producto ?? ''))).size > 1,
  )

  if (codigosAmbiguos.length) {
    hallazgos.push({
      id: 'codigos-ambiguos',
      nivel: 'bloqueo',
      titulo: 'Códigos asignados a productos distintos',
      detalle:
        'Estos códigos no pueden importarse sin confirmar cuál producto es el correcto.',
      cantidad: codigosAmbiguos.length,
      unidad: 'código',
      ejemplos: ejemplosLimitados(codigosAmbiguos.map(([codigo]) => codigo)),
    })
  }

  const codigosPrecioSinProducto = [...codigosPrecio].filter(
    (codigo) => !codigosProducto.has(codigo),
  )
  if (codigosPrecioSinProducto.length) {
    hallazgos.push({
      id: 'precios-sin-producto',
      nivel: 'bloqueo',
      titulo: 'Precios sin producto relacionado',
      detalle:
        'El archivo de precios contiene códigos que no existen en el catálogo seleccionado.',
      cantidad: codigosPrecioSinProducto.length,
      unidad: 'código',
      ejemplos: ejemplosLimitados(codigosPrecioSinProducto),
    })
  }

  const firmasPrecios = agruparPor(precios, firmaFila)
  const filasPrecioDuplicadas = [...firmasPrecios.values()].reduce(
    (total, filas) => total + Math.max(0, filas.length - 1),
    0,
  )
  if (filasPrecioDuplicadas) {
    const codigosDuplicados = new Set(
      [...firmasPrecios.values()]
        .filter((filas) => filas.length > 1)
        .map((filas) => filas[0]?.CodigoProducto ?? ''),
    )
    hallazgos.push({
      id: 'precios-duplicados',
      nivel: 'advertencia',
      titulo: 'Filas de precio repetidas',
      detalle:
        'Son registros idénticos adicionales; deberán consolidarse antes de guardar.',
      cantidad: filasPrecioDuplicadas,
      unidad: 'fila',
      ejemplos: ejemplosLimitados(codigosDuplicados),
    })
  }

  const preciosEnCero = precios.filter((fila) => {
    const precio = (fila.Precio_venta ?? '').trim()
    return precio !== '' && Number(precio.replace(',', '.')) === 0
  })
  if (preciosEnCero.length) {
    hallazgos.push({
      id: 'precios-en-cero',
      nivel: 'advertencia',
      titulo: 'Precios de venta en cero',
      detalle:
        'Se conservarán como pendientes de revisión; no asumiremos un precio automáticamente.',
      cantidad: preciosEnCero.length,
      unidad: 'precio',
      ejemplos: ejemplosLimitados(
        preciosEnCero.map((fila) => fila.CodigoProducto ?? ''),
      ),
    })
  }

  const unidadesPresentes = new Set(
    precios.map((fila) => normalizar(fila.Medida ?? '')).filter(Boolean),
  )
  const gruposConVariantes = Object.entries(gruposUnidades).filter(
    ([, variantes]) =>
      variantes.filter((variante) => unidadesPresentes.has(variante)).length > 1,
  )
  if (gruposConVariantes.length) {
    hallazgos.push({
      id: 'unidades-equivalentes',
      nivel: 'advertencia',
      titulo: 'Unidades con nombres equivalentes',
      detalle:
        'Conviene confirmar un nombre único para evitar presentaciones duplicadas.',
      cantidad: gruposConVariantes.reduce(
        (total, [, variantes]) =>
          total + variantes.filter((variante) => unidadesPresentes.has(variante)).length,
        0,
      ),
      unidad: 'variante',
      ejemplos: ejemplosLimitados(
        gruposConVariantes.map(
          ([canonica, variantes]) =>
            `${variantes.filter((variante) => unidadesPresentes.has(variante)).join(' / ')} → ${canonica}`,
        ),
      ),
    })
  }

  const nombresConEspacios = productos.filter((fila) => {
    const nombre = fila.Producto ?? ''
    return nombre !== nombre.trim()
  })
  if (nombresConEspacios.length) {
    hallazgos.push({
      id: 'espacios-en-nombres',
      nivel: 'advertencia',
      titulo: 'Nombres con espacios sobrantes',
      detalle:
        'La futura importación podrá limpiarlos sin cambiar el contenido del nombre.',
      cantidad: nombresConEspacios.length,
      unidad: 'producto',
      ejemplos: ejemplosLimitados(
        nombresConEspacios.map((fila) => (fila.Producto ?? '').trim()),
      ),
    })
  }

  const preciosSinBarras = precios.filter(
    (fila) => !(fila.CodigoBarra ?? '').trim(),
  )
  if (preciosSinBarras.length) {
    hallazgos.push({
      id: 'sin-codigo-barras',
      nivel: 'informativo',
      titulo: 'Presentaciones sin código de barras',
      detalle:
        'El dato puede seguir siendo opcional; se muestra para dimensionar el catálogo actual.',
      cantidad: preciosSinBarras.length,
      unidad: 'presentación',
      ejemplos: [],
    })
  }

  const codigosSinPrecio = [...codigosProducto].filter(
    (codigo) => !codigosPrecio.has(codigo),
  )
  if (codigosSinPrecio.length) {
    hallazgos.push({
      id: 'productos-sin-precio',
      nivel: 'advertencia',
      titulo: 'Productos sin filas de precio',
      detalle:
        'Pueden mantenerse en el catálogo, pero quedarán sin presentación comercial definida.',
      cantidad: codigosSinPrecio.length,
      unidad: 'producto',
      ejemplos: ejemplosLimitados(codigosSinPrecio),
    })
  }

  const coincidencias = [...codigosPrecio].filter((codigo) =>
    codigosProducto.has(codigo),
  ).length

  return {
    resumen: {
      productos: productos.length,
      codigosProducto: codigosProducto.size,
      precios: precios.length,
      codigosConPrecio: codigosPrecio.size,
      coincidencias,
    },
    hallazgos,
    tieneBloqueos: hallazgos.some((hallazgo) => hallazgo.nivel === 'bloqueo'),
  }
}
