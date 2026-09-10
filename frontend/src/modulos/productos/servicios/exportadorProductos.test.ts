import { utils } from 'xlsx'
import { describe, expect, it } from 'vitest'

import { productoInicial, type Producto } from '../modelo/producto'
import {
  crearFilasProductos,
  crearLibroCatalogoProductos,
  crearNombreArchivoCatalogo,
} from './exportadorProductos'

const productos = [
  {
    ...productoInicial,
    id: '1',
    codigo: 'MED-001',
    descripcion: 'Paracetamol 500 mg',
    codigoBarras: '7751234567890',
    categoria: 'Analgésicos',
    laboratorio: 'Laboratorio Central',
    afectacionIgv: 'gravado',
    precioVenta: '12.50',
    precioMinimo: '10.00',
    stockMaximo: '100',
    anchoCm: '12.5',
    controlVencimiento: true,
    controlLote: true,
    serialControl: true,
    activo: true,
  },
  {
    ...productoInicial,
    id: '2',
    codigo: 'MED-002',
    descripcion: 'Producto sin precio',
    activo: false,
  },
] satisfies Producto[]

describe('exportadorProductos', () => {
  it('convierte los productos a filas legibles sin mutar la colección', () => {
    const filas = crearFilasProductos(productos)

    expect(filas[0]).toMatchObject({
      SKU: 'MED-001',
      Producto: 'Paracetamol 500 mg',
      AfectacionTributaria: 'gravado',
      'Precio de venta final': 12.5,
      'Precio mínimo final': 10,
      'Control por lote': 'Sí',
      'Control de vencimiento': 'Sí',
      'Control por serie': 'Sí',
      Estado: 'Activo',
    })
    expect(filas[1]?.['Precio de venta final']).toBe('')
    expect(filas[1]?.['Precio mínimo final']).toBe('')
    expect(filas[1]?.Estado).toBe('Inactivo')
    expect(productos[0]?.precioVenta).toBe('12.50')
  })

  it('crea un libro con catálogo, resumen y autofiltro', () => {
    const libro = crearLibroCatalogoProductos(
      productos,
      new Date(2026, 7, 19, 15, 30),
    )

    expect(libro.SheetNames).toEqual(['Productos', 'Resumen'])
    expect(libro.Sheets.Productos?.['!autofilter']).toEqual({ ref: 'A1:S3' })
    expect(libro.Sheets.Productos?.['!cols']).toHaveLength(19)

    const catalogo = utils.sheet_to_json<(string | number)[]>(
      libro.Sheets.Productos!,
      { header: 1 },
    )
    expect(catalogo[0]).toHaveLength(19)
    expect(catalogo[0]).toContain('Control por serie')
    expect(catalogo[1]?.[15]).toBe('Sí')
    expect(catalogo[2]?.[15]).toBe('No')

    const resumen = utils.sheet_to_json<(string | number)[]>(
      libro.Sheets.Resumen!,
      { header: 1 },
    )
    expect(resumen).toContainEqual(['Total exportado', 2])
    expect(resumen).toContainEqual(['Activos', 1])
    expect(resumen).toContainEqual(['Inactivos', 1])
  })

  it('genera un nombre estable usando la fecha local', () => {
    expect(crearNombreArchivoCatalogo(new Date(2026, 0, 5))).toBe(
      'catalogo-productos-2026-01-05.xlsx',
    )
  })
})
