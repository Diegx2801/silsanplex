import { beforeEach, describe, expect, it, vi } from 'vitest'

import { productoInicial } from '@/modulos/productos/modelo/producto'

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  storage: {
    from: vi.fn(),
  },
}))

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }))

import {
  actualizarDescripcionArchivoProducto,
  buscarProductos,
  cambiarEstadoProducto,
  contarProductos,
  crearProducto,
  editarProducto,
  importarProductos,
  listarArchivosProducto,
  listarOpcionesProductos,
  listarProductosPaginados,
  listarProductos,
  listarVersionesProducto,
  organizarImagenesProducto,
  restaurarVersionProducto,
  subirArchivoProducto,
} from './productosService'

interface RespuestaSupabase {
  data: unknown
  error: { code: string } | null
  count?: number | null
}

function crearCadena(respuestaActual: () => RespuestaSupabase) {
  const cadena = {
    select: vi.fn(),
    eq: vi.fn(),
    ilike: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    or: vi.fn(),
    range: vi.fn(),
    limit: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    then: (
      resolver: (respuesta: RespuestaSupabase) => unknown,
      rechazador?: (motivo: unknown) => unknown,
    ) => Promise.resolve(respuestaActual()).then(resolver, rechazador),
  }

  cadena.select.mockReturnValue(cadena)
  cadena.eq.mockReturnValue(cadena)
  cadena.ilike.mockReturnValue(cadena)
  cadena.in.mockReturnValue(cadena)
  cadena.is.mockReturnValue(cadena)
  cadena.order.mockReturnValue(cadena)
  cadena.or.mockReturnValue(cadena)
  cadena.range.mockReturnValue(cadena)
  cadena.limit.mockReturnValue(cadena)
  cadena.insert.mockReturnValue(cadena)
  cadena.update.mockReturnValue(cadena)

  return cadena
}

const productoFila = {
  id: 'producto-1',
  code: 'MED-001',
  description: 'Producto de prueba',
  extended_description: 'Descripción ampliada',
  barcode: '775000000001',
  category: 'Línea',
  subline: 'Sublínea',
  laboratory: 'Marca',
  presentation: 'Caja',
  unit_of_measure: 'Unidad',
  tax_affectation: 'por-definir' as const,
  cost: 10,
  sale_price: 15,
  minimum_sale_price: 12,
  maximum_stock: 100,
  width_cm: 10,
  height_cm: 20,
  length_cm: 30,
  weight_kg: 0.5,
  health_registry: null,
  batch_control: true,
  expiration_control: false,
  prescription_sale: false,
  is_active: true,
}

describe('productosService', () => {
  let respuesta: RespuestaSupabase
  let cadena: ReturnType<typeof crearCadena>
  let storage: {
    createSignedUrl: ReturnType<typeof vi.fn>
    createSignedUrls: ReturnType<typeof vi.fn>
    upload: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    respuesta = { data: [], error: null }
    cadena = crearCadena(() => respuesta)
    supabaseMock.from.mockReset()
    supabaseMock.from.mockReturnValue(cadena)
    supabaseMock.rpc.mockReset()
    storage = {
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://storage.test/archivo' },
        error: null,
      }),
      createSignedUrls: vi.fn().mockResolvedValue({ data: [], error: null }),
      upload: vi.fn().mockResolvedValue({ data: { path: 'ruta' }, error: null }),
      remove: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    supabaseMock.storage.from.mockReset()
    supabaseMock.storage.from.mockReturnValue(storage)
  })

  it('lista únicamente los productos de la organización recibida', async () => {
    respuesta = { data: [productoFila], error: null }

    const productos = await listarProductos('org-1')

    expect(supabaseMock.from).toHaveBeenCalledWith('products')
    expect(cadena.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(productos[0]).toMatchObject({
      id: 'producto-1',
      codigo: 'MED-001',
      sublinea: 'Sublínea',
      costo: '10',
      precioMinimo: '12',
      controlVencimiento: false,
    })
  })

  it('usa un mensaje específico cuando falla la consulta', async () => {
    respuesta = { data: null, error: { code: 'XX000' } }

    await expect(listarProductos('org-1')).rejects.toThrow(
      'No se pudo cargar el catálogo de productos',
    )
  })

  it('busca en los campos del catálogo sin perder el filtro de organización', async () => {
    respuesta = { data: [productoFila], error: null }

    const productos = await buscarProductos('org-1', 'producto')

    expect(cadena.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(cadena.or).toHaveBeenCalledWith(
      expect.stringContaining('description.ilike.%producto%'),
    )
    expect(productos).toHaveLength(1)
  })

  it('usa un mensaje específico cuando falla la búsqueda', async () => {
    respuesta = { data: null, error: { code: 'XX000' } }

    await expect(buscarProductos('org-1', 'producto')).rejects.toThrow(
      'No se pudo cargar el catálogo de productos',
    )
  })

  it('aplica filtros, orden y rango en la consulta paginada', async () => {
    respuesta = { data: [productoFila], error: null, count: 27 }

    const resultado = await listarProductosPaginados('org-1', {
      busqueda: 'producto',
      estado: 'activos',
      categoria: 'Línea',
      laboratorio: 'Marca',
      orden: 'precio-desc',
      pagina: 2,
      tamanioPagina: 10,
    })

    expect(cadena.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(cadena.eq).toHaveBeenCalledWith('is_active', true)
    expect(cadena.ilike).toHaveBeenCalledWith('category', 'Línea')
    expect(cadena.ilike).toHaveBeenCalledWith('laboratory', 'Marca')
    expect(cadena.or).toHaveBeenCalledWith(
      expect.stringContaining('description.ilike.%producto%'),
    )
    expect(cadena.order).toHaveBeenCalledWith('sale_price', {
      ascending: false,
      nullsFirst: false,
    })
    expect(cadena.range).toHaveBeenCalledWith(10, 19)
    expect(resultado).toMatchObject({
      totalFiltrado: 27,
      elementos: [{ id: 'producto-1' }],
    })
  })

  it('limita el tamaño de página antes de enviarlo a Supabase', async () => {
    respuesta = { data: [], error: null, count: 0 }

    await listarProductosPaginados('org-1', {
      busqueda: '',
      estado: 'todos',
      categoria: '',
      laboratorio: '',
      orden: 'codigo-asc',
      pagina: 1,
      tamanioPagina: 500,
    })

    expect(cadena.range).toHaveBeenCalledWith(0, 49)
  })

  it('cuenta el total de productos de la organización sin descargar filas', async () => {
    respuesta = { data: null, error: null, count: 34 }

    await expect(contarProductos('org-1')).resolves.toBe(34)
    expect(cadena.select).toHaveBeenCalledWith('id', {
      count: 'exact',
      head: true,
    })
    expect(cadena.eq).toHaveBeenCalledWith('organization_id', 'org-1')
  })

  it('obtiene opciones únicas de la vista segura del catálogo', async () => {
    respuesta = {
      data: [
        { category: 'Línea', laboratory: 'Marca' },
        { category: 'línea', laboratory: 'Marca secundaria' },
      ],
      error: null,
    }

    await expect(listarOpcionesProductos('org-1')).resolves.toEqual({
      categorias: ['Línea'],
      laboratorios: ['Marca', 'Marca secundaria'],
    })
    expect(supabaseMock.from).toHaveBeenCalledWith('product_catalog_options')
    expect(cadena.eq).toHaveBeenCalledWith('organization_id', 'org-1')
  })

  it('envía la carga normalizada a la RPC transaccional', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: {
        estado: 'completado',
        hash: 'a'.repeat(64),
        id_lote: 'lote-1',
        creados: 2,
        sin_cambios: 1,
        filas_rechazadas: [],
      },
      error: null,
    })

    const resultado = await importarProductos('org-1', {
      productos: [
        {
          fila: 2,
          codigo: 'MED-001',
          descripcion: 'Producto',
          categoria: 'Línea',
          sublinea: '',
          laboratorio: 'Marca',
          descripcionAmpliada: 'Detalle técnico',
          codigoBarras: '775000000001',
          presentacion: 'Caja',
          registroSanitario: 'RS-001',
          stockMaximo: '100',
          anchoCm: '10',
          altoCm: '20',
          largoCm: '30',
          pesoKg: '0.5',
          controlLote: true,
          controlVencimiento: true,
          ventaReceta: false,
        },
      ],
      precios: [
        {
          fila: 2,
          codigoProducto: 'MED-001',
          producto: 'Producto',
          unidadMedida: 'Unidad',
          precioVenta: '10.50',
          incIgv: 'Sí',
          costoBase: '8.00',
          precioMinimo: '9.50',
        },
      ],
    })

    expect(supabaseMock.rpc).toHaveBeenCalledWith('import_products', {
      requested_organization_id: 'org-1',
      payload: {
        productos: [
          {
            fila: 2,
            codigo: 'MED-001',
            descripcion: 'Producto',
            categoria: 'Línea',
            sublinea: '',
            laboratorio: 'Marca',
            descripcion_ampliada: 'Detalle técnico',
            codigo_barras: '775000000001',
            presentacion: 'Caja',
            registro_sanitario: 'RS-001',
            stock_maximo: '100',
            ancho_cm: '10',
            alto_cm: '20',
            largo_cm: '30',
            peso_kg: '0.5',
            control_lote: true,
            control_vencimiento: true,
            venta_receta: false,
          },
        ],
        precios: [
          {
            fila: 2,
            codigo_producto: 'MED-001',
            producto: 'Producto',
            unidad_medida: 'Unidad',
            precio_venta: '10.50',
            inc_igv: 'Sí',
            costo_base: '8.00',
            precio_minimo: '9.50',
          },
        ],
      },
    })
    expect(resultado).toEqual({
      estado: 'completado',
      hash: 'a'.repeat(64),
      idLote: 'lote-1',
      creados: 2,
      sinCambios: 1,
      filasRechazadas: [],
    })
  })

  it('crea un producto normalizando el código y enviando el actor', async () => {
    const datos = {
      ...productoInicial,
      codigo: ' med-001 ',
      descripcion: 'Producto de prueba',
      costo: '10.00',
      precioVenta: '15.00',
      precioMinimo: '12.00',
      stockMaximo: '100',
    }

    await crearProducto('org-1', 'user-1', datos)

    const payload = cadena.insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(payload).toMatchObject({
      organization_id: 'org-1',
      code: 'MED-001',
      cost: 10,
      sale_price: 15,
      minimum_sale_price: 12,
      maximum_stock: 100,
      created_by: 'user-1',
      updated_by: 'user-1',
    })
  })

  it('usa un mensaje específico cuando falla el registro', async () => {
    respuesta = { data: null, error: { code: 'XX000' } }

    await expect(
      crearProducto('org-1', 'user-1', {
        ...productoInicial,
        codigo: 'MED-001',
        descripcion: 'Producto de prueba',
      }),
    ).rejects.toThrow('No se pudo registrar el producto')
  })

  it('edita un producto dentro de la organización indicada', async () => {
    const datos = {
      ...productoInicial,
      codigo: 'MED-001',
      descripcion: 'Producto actualizado',
    }

    await editarProducto('org-1', 'user-1', 'producto-1', datos)

    expect(cadena.update).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-1',
        code: 'MED-001',
        updated_by: 'user-1',
      }),
    )
    expect(cadena.eq).toHaveBeenCalledWith('id', 'producto-1')
    expect(cadena.eq).toHaveBeenCalledWith('organization_id', 'org-1')
  })

  it('usa un mensaje específico cuando falla la edición', async () => {
    respuesta = { data: null, error: { code: 'XX000' } }

    await expect(
      editarProducto('org-1', 'user-1', 'producto-1', {
        ...productoInicial,
        codigo: 'MED-001',
        descripcion: 'Producto actualizado',
      }),
    ).rejects.toThrow('No se pudo actualizar el producto')
  })

  it('cambia el estado usando el id y la organización', async () => {
    await cambiarEstadoProducto('org-1', 'user-1', {
      ...productoInicial,
      id: 'producto-1',
    })

    expect(cadena.update).toHaveBeenCalledWith({
      is_active: false,
      updated_by: 'user-1',
    })
    expect(cadena.eq).toHaveBeenCalledWith('organization_id', 'org-1')
  })

  it('usa un mensaje específico cuando falla el cambio de estado', async () => {
    respuesta = { data: null, error: { code: 'XX000' } }

    await expect(
      cambiarEstadoProducto('org-1', 'user-1', {
        ...productoInicial,
        id: 'producto-1',
      }),
    ).rejects.toThrow('No se pudo cambiar el estado del producto')
  })

  it('traduce el duplicado de código o barras a un error de dominio', async () => {
    respuesta = { data: null, error: { code: '23505' } }

    await expect(
      crearProducto('org-1', 'user-1', {
        ...productoInicial,
        codigo: 'MED-001',
        descripcion: 'Producto duplicado',
      }),
    ).rejects.toThrow('Ya existe un producto con este código o código de barras')
  })

  it('adjunta la miniatura principal con una sola firma múltiple por página', async () => {
    const cadenaProductos = crearCadena(() => ({
      data: [productoFila],
      error: null,
      count: 1,
    }))
    const cadenaArchivos = crearCadena(() => ({
      data: [
        {
          product_id: 'producto-1',
          storage_path: 'org-1/producto-1/principal.webp',
          is_primary: true,
          sort_order: 0,
        },
      ],
      error: null,
    }))
    supabaseMock.from.mockImplementation((tabla: string) =>
      tabla === 'product_files' ? cadenaArchivos : cadenaProductos,
    )
    storage.createSignedUrls.mockResolvedValue({
      data: [{ signedUrl: 'https://storage.test/principal.webp' }],
      error: null,
    })

    const resultado = await listarProductosPaginados('org-1', {
      busqueda: '',
      estado: 'todos',
      categoria: '',
      laboratorio: '',
      orden: 'descripcion-asc',
      pagina: 1,
      tamanioPagina: 20,
    })

    expect(resultado.elementos[0]?.miniaturaUrl).toBe(
      'https://storage.test/principal.webp',
    )
    expect(storage.createSignedUrls).toHaveBeenCalledWith(
      ['org-1/producto-1/principal.webp'],
      900,
    )
  })

  it('carga archivos privados y genera URLs temporales en paralelo', async () => {
    respuesta = {
      data: [
        {
          id: 'archivo-1',
          kind: 'technical-sheet',
          storage_path: 'org-1/producto-1/ficha.pdf',
          file_name: 'ficha.pdf',
          mime_type: 'application/pdf',
          byte_size: 2048,
          description: 'Ficha vigente',
          is_primary: false,
          created_at: '2026-08-25T10:00:00.000Z',
        },
      ],
      error: null,
    }

    await expect(listarArchivosProducto('org-1', 'producto-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'archivo-1',
        tipo: 'technical-sheet',
        url: 'https://storage.test/archivo',
      }),
    ])
    expect(cadena.is).toHaveBeenCalledWith('deleted_at', null)
    expect(storage.createSignedUrl).toHaveBeenCalledWith(
      'org-1/producto-1/ficha.pdf',
      900,
    )
  })

  it('sube un archivo a una ruta única y registra su metadata', async () => {
    const archivo = new File(['contenido'], 'Ficha Técnica.pdf', {
      type: 'application/pdf',
    })

    await subirArchivoProducto('org-1', 'producto-1', 'user-1', {
      archivo,
      tipo: 'technical-sheet',
    })

    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^org-1\/producto-1\/.+-Ficha-Tecnica\.pdf$/),
      archivo,
      expect.objectContaining({ upsert: false, contentType: 'application/pdf' }),
    )
    expect(cadena.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-1',
        product_id: 'producto-1',
        kind: 'technical-sheet',
        created_by: 'user-1',
      }),
    )
  })

  it('actualiza la descripción de un archivo mediante el contrato seguro', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null })

    await actualizarDescripcionArchivoProducto(
      'org-1',
      'producto-1',
      'archivo-1',
      'Vista frontal',
    )

    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'update_product_file_description',
      {
        requested_organization_id: 'org-1',
        requested_product_id: 'producto-1',
        requested_file_id: 'archivo-1',
        requested_description: 'Vista frontal',
      },
    )
  })

  it('guarda en una operación el orden y la imagen principal', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null })
    const imagenes = [
      {
        id: 'imagen-2', ruta: 'dos.webp', tipo: 'image' as const,
        nombre: 'dos.webp', mimeType: 'image/webp', bytes: 10,
        descripcion: '', principal: true, orden: 0, creadoEn: '', url: '',
      },
      {
        id: 'imagen-1', ruta: 'uno.webp', tipo: 'image' as const,
        nombre: 'uno.webp', mimeType: 'image/webp', bytes: 10,
        descripcion: '', principal: false, orden: 1, creadoEn: '', url: '',
      },
    ]

    await organizarImagenesProducto(
      'org-1',
      'producto-1',
      imagenes,
      'imagen-2',
    )

    expect(supabaseMock.rpc).toHaveBeenCalledWith('organize_product_images', {
      requested_organization_id: 'org-1',
      requested_product_id: 'producto-1',
      ordered_image_ids: ['imagen-2', 'imagen-1'],
      primary_image_id: 'imagen-2',
    })
  })

  it('restaura una versión mediante el contrato seguro', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null })

    await restaurarVersionProducto('org-1', 'producto-1', 3)

    expect(supabaseMock.rpc).toHaveBeenCalledWith('restore_product_version', {
      requested_organization_id: 'org-1',
      requested_product_id: 'producto-1',
      requested_version_number: 3,
    })
  })

  it('rechaza imágenes mayores al límite antes de invocar Storage', async () => {
    const archivo = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.webp', {
      type: 'image/webp',
    })

    await expect(
      subirArchivoProducto('org-1', 'producto-1', 'user-1', {
        archivo,
        tipo: 'image',
      }),
    ).rejects.toThrow('máximo 5 MB')
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('mapea el historial ordenado del producto', async () => {
    respuesta = {
      data: [
        {
          id: 2,
          version_number: 2,
          event_type: 'updated',
          summary: 'Ficha actualizada',
          snapshot: productoFila,
          changes: { description: { before: 'A', after: 'B' } },
          actor_user_id: 'user-1',
          created_at: '2026-08-25T10:00:00.000Z',
        },
      ],
      error: null,
    }

    await expect(listarVersionesProducto('org-1', 'producto-1')).resolves.toEqual([
      expect.objectContaining({
        numero: 2,
        tipo: 'updated',
        actorId: 'user-1',
        snapshot: expect.objectContaining({ codigo: 'MED-001' }),
      }),
    ])
    expect(cadena.order).toHaveBeenCalledWith('version_number', {
      ascending: false,
    })
  })
})
