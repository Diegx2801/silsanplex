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
  datos: DatosImportacionProductos
  filasObservadas: FilaImportacionObservada[]
}

export type FilaImportacion = Record<string, string>

export interface FilaProductoImportacion {
  fila: number
  codigo: string
  descripcion: string
  categoria: string
  sublinea: string
  laboratorio: string
  descripcionAmpliada: string
  codigoBarras: string
  presentacion: string
  registroSanitario: string
  stockMaximo: string
  anchoCm: string
  altoCm: string
  largoCm: string
  pesoKg: string
  controlLote: boolean
  controlVencimiento: boolean
  ventaReceta: boolean
}

export interface FilaPrecioImportacion {
  fila: number
  codigoProducto: string
  producto: string
  unidadMedida: string
  precioVenta: string
  incIgv: string
  costoBase: string
  precioMinimo: string
}

export interface DatosImportacionProductos {
  productos: FilaProductoImportacion[]
  precios: FilaPrecioImportacion[]
}

export type TipoFilaImportacion = 'producto' | 'precio'
export type EstadoFilaImportacion = 'duplicada' | 'rechazada' | 'advertencia'

export interface FilaImportacionObservada {
  tipo: TipoFilaImportacion
  fila: number
  codigo: string
  estado: EstadoFilaImportacion
  motivo: string
}

export interface FilaImportacionRechazada {
  tipo: TipoFilaImportacion
  fila?: number
  filas?: number[]
  codigo?: string
  motivo: string
}

export interface ResultadoImportacionPersistida {
  estado: 'completado' | 'rechazado'
  hash: string
  idLote: string
  creados: number
  sinCambios: number
  filasRechazadas: FilaImportacionRechazada[]
}

const gruposUnidades: Record<string, string[]> = {
  UNIDAD: ['UNIDAD', 'UND'],
  CAJA: ['CAJA', 'CJA'],
  PAQUETE: ['PAQUETE', 'PAQ', 'PQT'],
}
const precioMaximo = 999_999_999_999.99

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

function firmaProducto(fila: FilaImportacion) {
  return [
    fila.Producto,
    fila.Linea,
    fila.SubLinea,
    fila.Marca_Laboratorio,
    fila.DescripcionAmpliada,
    fila.CodigoBarras,
    fila.Presentacion,
    fila.RegistroSanitario,
    fila.StockMaximo,
    fila.AnchoCm,
    fila.AltoCm,
    fila.LargoCm,
    fila.PesoKg,
    fila.ControlLote,
    fila.ControlVencimiento,
    fila.VentaReceta,
  ]
    .map((valor) => normalizar(valor ?? ''))
    .join('|')
}

function normalizarPrecio(valor: string) {
  return valor.trim().replace(',', '.')
}

function firmaPrecio(fila: FilaImportacion) {
  const precio = normalizarPrecio(fila.Precio_venta ?? '')
  return [
    fila.Producto,
    fila.Medida,
    precio === '' ? '' : String(Number(precio)),
    fila.IncIGV,
    fila.CostoBase,
    fila.PrecioMinimo,
  ]
    .map((valor) => normalizar(valor ?? ''))
    .join('|')
}

function filaProducto(fila: FilaImportacion, indice: number): FilaProductoImportacion {
  return {
    fila: indice + 2,
    codigo: (fila.Codigo ?? '').trim().toUpperCase(),
    descripcion: (fila.Producto ?? '').trim(),
    categoria: (fila.Linea ?? '').trim(),
    sublinea: (fila.SubLinea ?? '').trim(),
    laboratorio: (fila.Marca_Laboratorio ?? '').trim(),
    descripcionAmpliada: (fila.DescripcionAmpliada ?? '').trim(),
    codigoBarras: (fila.CodigoBarras ?? '').trim(),
    presentacion: (fila.Presentacion ?? '').trim(),
    registroSanitario: (fila.RegistroSanitario ?? '').trim(),
    stockMaximo: normalizarPrecio(fila.StockMaximo ?? ''),
    anchoCm: normalizarPrecio(fila.AnchoCm ?? ''),
    altoCm: normalizarPrecio(fila.AltoCm ?? ''),
    largoCm: normalizarPrecio(fila.LargoCm ?? ''),
    pesoKg: normalizarPrecio(fila.PesoKg ?? ''),
    controlLote: normalizarBooleano(fila.ControlLote ?? '') === true,
    controlVencimiento:
      normalizarBooleano(fila.ControlVencimiento ?? '') === true,
    ventaReceta: normalizarBooleano(fila.VentaReceta ?? '') === true,
  }
}

function normalizarIncIgv(valor: string) {
  switch (normalizar(valor)) {
    case 'SI':
    case 'SÍ':
      return 'Sí'
    case 'NO':
      return 'No'
    default:
      return 'Pendiente'
  }
}

function normalizarBooleano(valor: string) {
  switch (normalizar(valor)) {
    case 'SI':
    case 'SÍ':
    case 'TRUE':
    case '1':
      return true
    case 'NO':
    case 'FALSE':
    case '0':
    case '':
      return false
    default:
      return null
  }
}

function filaPrecio(fila: FilaImportacion, indice: number): FilaPrecioImportacion {
  return {
    fila: indice + 2,
    codigoProducto: (fila.CodigoProducto ?? '').trim().toUpperCase(),
    producto: (fila.Producto ?? '').trim(),
    unidadMedida: (fila.Medida ?? '').trim(),
    precioVenta: normalizarPrecio(fila.Precio_venta ?? ''),
    incIgv: normalizarIncIgv(fila.IncIGV ?? ''),
    costoBase: normalizarPrecio(fila.CostoBase ?? ''),
    precioMinimo: normalizarPrecio(fila.PrecioMinimo ?? ''),
  }
}

function primerosPorCodigo<T>(
  filas: T[],
  obtenerCodigo: (fila: T) => string,
  comparar: (primerValor: T, segundoValor: T) => number,
) {
  const primeras = new Map<string, T>()

  for (const fila of filas) {
    const codigo = obtenerCodigo(fila)
    if (codigo && !primeras.has(codigo)) primeras.set(codigo, fila)
  }

  return [...primeras.values()].toSorted(comparar)
}

function crearDatosImportacion(
  productos: FilaImportacion[],
  precios: FilaImportacion[],
): DatosImportacionProductos {
  const productosNormalizados = productos.map(filaProducto)
  const preciosNormalizados = precios.map(filaPrecio)
  const comparadorCodigo = (primero: { codigo: string }, segundo: { codigo: string }) =>
    primero.codigo.localeCompare(segundo.codigo, 'es-PE', { numeric: true })

  return {
    productos: primerosPorCodigo(
      productosNormalizados,
      (fila) => fila.codigo,
      comparadorCodigo,
    ),
    precios: primerosPorCodigo(
      preciosNormalizados,
      (fila) => fila.codigoProducto,
      (primero, segundo) =>
        primero.codigoProducto.localeCompare(segundo.codigoProducto, 'es-PE', {
          numeric: true,
        }),
    ),
  }
}

function agregarObservaciones(
  destino: FilaImportacionObservada[],
  tipo: TipoFilaImportacion,
  filas: FilaImportacion[],
  obtenerCodigo: (fila: FilaImportacion) => string,
  codigos: ReadonlySet<string>,
  estado: EstadoFilaImportacion,
  motivo: string,
) {
  for (const [indice, fila] of filas.entries()) {
    const codigo = normalizar(obtenerCodigo(fila))
    if (!codigos.has(codigo)) continue
    destino.push({
      tipo,
      fila: indice + 2,
      codigo,
      estado,
      motivo,
    })
  }
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
  const filasObservadas: FilaImportacionObservada[] = []

  const codigosAmbiguos = [...productosPorCodigo.entries()].filter(
    ([, filas]) => new Set(filas.map(firmaProducto)).size > 1,
  )
  const codigosProductoDuplicados = [...productosPorCodigo.entries()].filter(
    ([, filas]) => filas.length > 1,
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
    agregarObservaciones(
      filasObservadas,
      'producto',
      productos,
      (fila) => fila.Codigo ?? '',
      new Set(codigosAmbiguos.map(([codigo]) => codigo)),
      'rechazada',
      'El código aparece con datos de producto distintos.',
    )
  }

  const duplicadosProducto = codigosProductoDuplicados.reduce(
    (total, [, filas]) => total + filas.length - 1,
    0,
  )
  if (duplicadosProducto) {
    hallazgos.push({
      id: 'productos-duplicados',
      nivel: 'advertencia',
      titulo: 'Filas de producto repetidas',
      detalle:
        'Las filas idénticas se consolidarán y solo se importará una por código.',
      cantidad: duplicadosProducto,
      unidad: 'fila',
      ejemplos: ejemplosLimitados(
        codigosProductoDuplicados.map(([codigo]) => codigo),
      ),
    })

    for (const [codigo, filas] of codigosProductoDuplicados) {
      if (new Set(filas.map(firmaProducto)).size > 1) continue
      const primera = filas[0]
      let encontrada = false
      for (const [indice, fila] of productos.entries()) {
        if (normalizar(fila.Codigo ?? '') !== codigo) continue
        if (!encontrada && fila === primera) {
          encontrada = true
          continue
        }
        filasObservadas.push({
          tipo: 'producto',
          fila: indice + 2,
          codigo,
          estado: 'duplicada',
          motivo: 'Fila idéntica consolidada con la primera aparición.',
        })
      }
    }
  }

  const productosInvalidos = productos.filter((fila) => {
    const codigo = (fila.Codigo ?? '').trim().toUpperCase()
    const descripcion = (fila.Producto ?? '').trim()
    const categoria = (fila.Linea ?? '').trim()
    const sublinea = (fila.SubLinea ?? '').trim()
    const laboratorio = (fila.Marca_Laboratorio ?? '').trim()
    const descripcionAmpliada = (fila.DescripcionAmpliada ?? '').trim()
    const codigoBarras = (fila.CodigoBarras ?? '').trim()
    const presentacion = (fila.Presentacion ?? '').trim()
    const registroSanitario = (fila.RegistroSanitario ?? '').trim()
    const decimalesPositivos = ['AnchoCm', 'AltoCm', 'LargoCm', 'PesoKg'].every(
      (campo) => {
        const valor = (fila[campo] ?? '').trim()
        return !valor || (/^\d+([.,]\d{1,3})?$/.test(valor) && Number(normalizarPrecio(valor)) > 0)
      },
    )
    const stockMaximo = (fila.StockMaximo ?? '').trim()
    const stockMaximoValido =
      !stockMaximo ||
      (/^\d+([.,]\d{1,3})?$/.test(stockMaximo) && Number(normalizarPrecio(stockMaximo)) >= 0)
    const booleanosValidos = ['ControlLote', 'ControlVencimiento', 'VentaReceta'].every(
      (campo) => normalizarBooleano(fila[campo] ?? '') !== null,
    )
    return (
      !/^[A-Z0-9][A-Z0-9._-]{0,29}$/.test(codigo) ||
      descripcion.length < 2 ||
      descripcion.length > 160 ||
      categoria.length > 80 ||
      sublinea.length > 80 ||
      laboratorio.length > 100
      || descripcionAmpliada.length > 4000
      || codigoBarras.length > 50
      || presentacion.length > 100
      || registroSanitario.length > 80
      || !decimalesPositivos
      || !stockMaximoValido
      || !booleanosValidos
    )
  })
  if (productosInvalidos.length) {
    hallazgos.push({
      id: 'productos-invalidos',
      nivel: 'bloqueo',
      titulo: 'Filas de producto inválidas',
      detalle:
        'El código, la descripción o uno de los campos descriptivos no cumplen las restricciones del catálogo persistente.',
      cantidad: productosInvalidos.length,
      unidad: 'fila',
      ejemplos: ejemplosLimitados(
        productosInvalidos.map((fila) => fila.Codigo ?? '(sin código)'),
      ),
    })
    agregarObservaciones(
      filasObservadas,
      'producto',
      productos,
      (fila) => fila.Codigo ?? '',
      new Set(
        productosInvalidos.map((fila) => normalizar(fila.Codigo ?? '')),
      ),
      'rechazada',
      'El código, la descripción o uno de los campos descriptivos no cumplen las restricciones del catálogo.',
    )
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
    agregarObservaciones(
      filasObservadas,
      'precio',
      precios,
      (fila) => fila.CodigoProducto ?? '',
      new Set(codigosPrecioSinProducto),
      'rechazada',
      'El código de precio no existe en el archivo de productos.',
    )
  }

  const codigosPrecioConflictos = [...preciosPorCodigo.entries()].filter(
    ([, filas]) => new Set(filas.map(firmaPrecio)).size > 1,
  )
  if (codigosPrecioConflictos.length) {
    hallazgos.push({
      id: 'precios-conflictivos',
      nivel: 'bloqueo',
      titulo: 'Códigos con varias filas de precio distintas',
      detalle:
        'El catálogo actual admite un único precio y unidad por producto; estas filas deben corregirse antes de importar.',
      cantidad: codigosPrecioConflictos.length,
      unidad: 'código',
      ejemplos: ejemplosLimitados(
        codigosPrecioConflictos.map(([codigo]) => codigo),
      ),
    })
    agregarObservaciones(
      filasObservadas,
      'precio',
      precios,
      (fila) => fila.CodigoProducto ?? '',
      new Set(codigosPrecioConflictos.map(([codigo]) => codigo)),
      'rechazada',
      'El código tiene varias filas de precio distintas.',
    )
  }

  const firmasPrecios = agruparPor(precios, firmaPrecio)
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
        'Son registros idénticos adicionales; se consolidarán antes de guardar.',
      cantidad: filasPrecioDuplicadas,
      unidad: 'fila',
      ejemplos: ejemplosLimitados(codigosDuplicados),
    })
    const ocurrencias = new Map<string, number>()
    for (const [indice, fila] of precios.entries()) {
      const firma = firmaPrecio(fila)
      const ocurrenciasAnteriores = ocurrencias.get(firma) ?? 0
      ocurrencias.set(firma, ocurrenciasAnteriores + 1)
      if (ocurrenciasAnteriores) {
        filasObservadas.push({
          tipo: 'precio',
          fila: indice + 2,
          codigo: normalizar(fila.CodigoProducto ?? ''),
          estado: 'duplicada',
          motivo: 'Fila idéntica consolidada con la primera aparición.',
        })
      }
    }
  }

  const preciosInvalidos = precios.filter((fila) => {
    const precio = (fila.Precio_venta ?? '').trim()
    const unidadMedida = (fila.Medida ?? '').trim()
    const incIgv = normalizar(fila.IncIGV ?? '')
    const precioNumerico = precio === '' ? null : Number(normalizarPrecio(precio))
    const costo = (fila.CostoBase ?? '').trim()
    const precioMinimo = (fila.PrecioMinimo ?? '').trim()
    const numeroMonetarioValido = (valor: string) =>
      !valor || (/^(0|\d+)([.,]\d{1,2})?$/.test(valor) && Number(normalizarPrecio(valor)) <= precioMaximo)
    const precioValido =
      precio === '' ||
      (/^(0|\d+)([.,]\d{1,2})?$/.test(precio) &&
        precioNumerico !== null &&
        Number.isFinite(precioNumerico) &&
        precioNumerico <= precioMaximo)
    const incIgvValido =
      incIgv === '' || ['SI', 'SÍ', 'NO', 'PENDIENTE'].includes(incIgv)
    const minimoNoSuperaVenta =
      !precioMinimo || !precio || Number(normalizarPrecio(precioMinimo)) <= Number(normalizarPrecio(precio))
    return !precioValido || !numeroMonetarioValido(costo) ||
      !numeroMonetarioValido(precioMinimo) || !minimoNoSuperaVenta ||
      !incIgvValido || unidadMedida.length > 40
  })
  if (preciosInvalidos.length) {
    hallazgos.push({
      id: 'precios-invalidos',
      nivel: 'bloqueo',
      titulo: 'Filas de precio inválidas',
      detalle:
        'El precio, la unidad de medida o el indicador de IGV no cumple las restricciones del catálogo persistente.',
      cantidad: preciosInvalidos.length,
      unidad: 'fila',
      ejemplos: ejemplosLimitados(
        preciosInvalidos.map((fila) => fila.CodigoProducto ?? '(sin código)'),
      ),
    })
    for (const [indice, fila] of precios.entries()) {
      if (!preciosInvalidos.includes(fila)) continue
      filasObservadas.push({
        tipo: 'precio',
        fila: indice + 2,
        codigo: normalizar(fila.CodigoProducto ?? ''),
        estado: 'rechazada',
        motivo:
          'El precio, la unidad de medida o el indicador de IGV no cumple las restricciones del catálogo persistente.',
      })
    }
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
    for (const [indice, fila] of precios.entries()) {
      if (!preciosEnCero.includes(fila)) continue
      filasObservadas.push({
        tipo: 'precio',
        fila: indice + 2,
        codigo: normalizar(fila.CodigoProducto ?? ''),
        estado: 'advertencia',
        motivo: 'El precio es cero y quedará pendiente de revisión.',
      })
    }
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
    for (const [indice, fila] of precios.entries()) {
      if (
        !gruposConVariantes.some(([, variantes]) =>
          variantes.includes(normalizar(fila.Medida ?? '')),
        )
      ) continue
      filasObservadas.push({
        tipo: 'precio',
        fila: indice + 2,
        codigo: normalizar(fila.CodigoProducto ?? ''),
        estado: 'advertencia',
        motivo: 'La unidad tiene una variante equivalente en el archivo.',
      })
    }
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
        'La importación los limpiará sin cambiar el contenido del nombre.',
      cantidad: nombresConEspacios.length,
      unidad: 'producto',
      ejemplos: ejemplosLimitados(
        nombresConEspacios.map((fila) => (fila.Producto ?? '').trim()),
      ),
    })
    for (const [indice, fila] of productos.entries()) {
      if (!nombresConEspacios.includes(fila)) continue
      filasObservadas.push({
        tipo: 'producto',
        fila: indice + 2,
        codigo: normalizar(fila.Codigo ?? ''),
        estado: 'advertencia',
        motivo: 'La descripción tiene espacios externos y será recortada.',
      })
    }
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
        'Pueden mantenerse en el catálogo, pero quedarán sin precio ni unidad comercial.',
      cantidad: codigosSinPrecio.length,
      unidad: 'producto',
      ejemplos: ejemplosLimitados(codigosSinPrecio),
    })
    agregarObservaciones(
      filasObservadas,
      'producto',
      productos,
      (fila) => fila.Codigo ?? '',
      new Set(codigosSinPrecio),
      'advertencia',
      'El producto no tiene una fila de precio relacionada.',
    )
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
    datos: crearDatosImportacion(productos, precios),
    filasObservadas,
  }
}
