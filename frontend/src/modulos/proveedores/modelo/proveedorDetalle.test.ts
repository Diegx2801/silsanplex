import { describe, expect, it } from 'vitest'

import {
  esquemaDevolucionProveedor,
  esquemaEvaluacionProveedor,
  esquemaIncidenciaProveedor,
} from './proveedorDetalle'

describe('esquemaEvaluacionProveedor', () => {
  it('limita los criterios a una escala entera de uno a cinco', () => {
    const base = {
      evaluadaEn: '2026-08-26', calidad: 5, entrega: 4, servicio: 4, precio: 3, comentario: '',
    }
    expect(esquemaEvaluacionProveedor.safeParse(base).success).toBe(true)
    expect(esquemaEvaluacionProveedor.safeParse({ ...base, calidad: 6 }).success).toBe(false)
    expect(esquemaEvaluacionProveedor.safeParse({ ...base, entrega: 3.5 }).success).toBe(false)
  })
})

describe('esquemaIncidenciaProveedor', () => {
  const base = {
    compraId: '', productoId: '', tipo: 'quality' as const, severidad: 'medium' as const,
    estado: 'open' as const, ocurridaEn: '2026-08-26', descripcion: 'Producto recibido con daño visible.', resolucion: '',
  }

  it('permite registrar una incidencia abierta sin resolución', () => {
    expect(esquemaIncidenciaProveedor.safeParse(base).success).toBe(true)
  })

  it('exige evidencia de resolución al cerrar la incidencia', () => {
    expect(esquemaIncidenciaProveedor.safeParse({ ...base, estado: 'closed' }).success).toBe(false)
    expect(esquemaIncidenciaProveedor.safeParse({ ...base, estado: 'closed', resolucion: 'Se repuso el lote.' }).success).toBe(true)
  })
})

describe('esquemaDevolucionProveedor', () => {
  const base = {
    compraId: 'compra-1', lineaCompraId: 'linea-1', cantidad: '2.5',
    motivo: 'Producto no conforme', solicitadaEn: '2026-08-26',
  }

  it('acepta cantidades positivas con hasta tres decimales', () => {
    expect(esquemaDevolucionProveedor.safeParse(base).success).toBe(true)
    expect(esquemaDevolucionProveedor.safeParse({ ...base, cantidad: '0' }).success).toBe(false)
    expect(esquemaDevolucionProveedor.safeParse({ ...base, cantidad: '1.2345' }).success).toBe(false)
  })
})
