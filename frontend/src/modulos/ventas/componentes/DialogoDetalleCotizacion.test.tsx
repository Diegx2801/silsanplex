import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Cotizacion } from '@/modulos/ventas/modelo/cotizacion'

import { DialogoDetalleCotizacion } from './DialogoDetalleCotizacion'

const cotizacion = {
  id: 'cotizacion-1',
  numero: 'COT-000001',
  clienteId: 'cliente-1',
  clienteDocumento: '20548796321',
  clienteNombre: 'Boticas El Sol SAC',
  fechaEmision: '2026-09-16',
  fechaValidez: '2026-09-23',
  preciosIncluyenIgv: true,
  observacion: 'Entrega coordinada con el cliente.',
  lineas: [{
    id: 'linea-1', productoId: 'producto-1', productoCodigo: 'PARA-500',
    productoDescripcion: 'Paracetamol 500 mg', unidadMedida: 'Unidad', cantidad: 2,
    precioUnitario: 25, afectacionIgv: 'gravado',
  }],
  estado: 'emitida',
  fechaRegistro: '2026-09-16T12:00:00.000Z',
  fechaCambioEstado: '2026-09-16T12:00:00.000Z',
} satisfies Cotizacion

describe('DialogoDetalleCotizacion', () => {
  it('muestra la cabecera, líneas, impuestos y observaciones en modo consulta', () => {
    render(
      <DialogoDetalleCotizacion
        abierto
        cotizacion={cotizacion}
        alCambiarApertura={vi.fn()}
        alRestaurarFoco={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Detalle de COT-000001' })).toBeVisible()
    expect(screen.getByText('Boticas El Sol SAC')).toBeVisible()
    expect(screen.getByText('Paracetamol 500 mg')).toBeVisible()
    expect(screen.getByText('Gravado')).toBeVisible()
    expect(screen.getByText('Entrega coordinada con el cliente.')).toBeVisible()
    expect(screen.getByText('Subtotal')).toBeVisible()
    expect(screen.getAllByText('IGV')).toHaveLength(2)
    expect(screen.getByText('Total')).toBeVisible()
  })
})
