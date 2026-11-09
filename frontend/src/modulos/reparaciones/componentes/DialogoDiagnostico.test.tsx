import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Reparacion } from '../modelo/reparacion'
import { DialogoDiagnostico } from './DialogoDiagnostico'

describe('DialogoDiagnostico', () => {
  it('muestra el problema original como contexto sin pedir que se vuelva a escribir', () => {
    const reparacion = {
      codigo: 'REP-0001',
      productoDescripcionSnapshot: 'Impresora',
      problema: 'No imprime después de cambiar el cartucho',
      tecnicoAsignadoId: null,
      prioridad: 'normal',
      fechaEntregaEstimada: '',
    } as Reparacion

    render(<DialogoDiagnostico abierto reparacion={reparacion} alCambiarApertura={vi.fn()} alGuardar={vi.fn()} />)

    expect(screen.getByText('Problema reportado en la recepción')).toBeVisible()
    expect(screen.getByText('No imprime después de cambiar el cartucho')).toBeVisible()
    expect(screen.getByLabelText('Síntomas observados *')).toBeVisible()
  })
})
