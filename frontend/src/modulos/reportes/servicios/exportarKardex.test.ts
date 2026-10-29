import { utils } from 'xlsx'
import { describe, expect, it } from 'vitest'

import type { MovimientoKardexReporte } from '@/modulos/reportes/modelo/reporteKardex'
import { crearFilasKardex, crearLibroKardex, crearNombreArchivoKardex } from './exportarKardex'

const movimiento: MovimientoKardexReporte = {
  id: 'movement-1', secuencia: 1, fechaOperacion: '2026-09-03', fechaRegistro: '2026-09-03T15:00:00Z',
  productoId: 'product-1', productoCodigo: 'SKU-01', productoDescripcion: '=HYPERLINK("https://malicioso.test")',
  unidadMedida: 'Caja', almacenId: 'warehouse-1', almacen: 'Central', ubicacionCodigo: 'A-01',
  ubicacionNombre: 'Anaquel 1', estado: 'available', lote: 'LOT-1', fechaVencimiento: '2030-12-31',
  tipo: 'salida', entrada: 0, salida: 2, saldoAnterior: 8, saldoPosterior: 6,
  documentoReferencia: '', tipoOrigen: 'manual', motivo: '+formula como texto', responsable: 'Almacenero',
}

const filtros = {
  productoCodigo: 'SKU-01', productoDescripcion: movimiento.productoDescripcion,
  almacen: 'Central', lote: 'LOT-1', fechaDesde: '2026-09-01', fechaHasta: '2026-09-30',
}

describe('exportación del Kardex', () => {
  it('incluye trazabilidad, saldos por movimiento y no incorpora costos', () => {
    const filas = crearFilasKardex([movimiento])
    expect(filas[0]).toMatchObject({
      'Código': 'SKU-01', 'Ubicación': 'A-01 · Anaquel 1', 'Documento de origen': 'Movimiento manual',
      'Entrada': 0, 'Salida': 2, 'Saldo anterior': 8, 'Saldo posterior': 6,
    })
    expect(Object.keys(filas[0])).not.toContain('Costo unitario')
    expect(Object.keys(filas[0])).not.toContain('Valor saldo')
  })

  it('neutraliza valores tipo fórmula y conserva metadatos de filtros en el libro', () => {
    const libro = crearLibroKardex([movimiento], filtros, new Date('2026-09-30T15:00:00Z'))
    const detalle = utils.sheet_to_json<Record<string, unknown>>(libro.Sheets.Kardex!)[0]
    const resumen = utils.sheet_to_json<unknown[]>(libro.Sheets.Resumen!, { header: 1 })

    expect(detalle.Producto).toBe("'=HYPERLINK(\"https://malicioso.test\")")
    expect(detalle.Motivo).toBe("'+formula como texto")
    expect(resumen).toContainEqual(['Periodo', '2026-09-01 al 2026-09-30'])
    expect(libro.SheetNames).toEqual(['Kardex', 'Resumen'])
  })

  it('genera nombres de archivo deterministas y seguros', () => {
    expect(crearNombreArchivoKardex('PARACETAMOL 500mg', new Date('2026-09-30T15:00:00Z')))
      .toBe('kardex-paracetamol-500mg-2026-09-30.xlsx')
    expect(crearNombreArchivoKardex('=SKU/../../', new Date('2026-09-30T15:00:00Z')))
      .toMatch(/^kardex-sku-2026-09-30\.xlsx$/)
  })
})
