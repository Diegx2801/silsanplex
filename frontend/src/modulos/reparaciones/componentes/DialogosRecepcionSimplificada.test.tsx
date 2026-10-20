import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Reparacion } from '@/modulos/reparaciones/modelo/reparacion'
import { DialogoDiagnostico } from './DialogoDiagnostico'
import { DialogoPrueba } from './DialogoPrueba'
import { DialogoObservacion } from './DialogosAccionReparacion'

const reparacion = {
  codigo: 'REP-0001',
  productoDescripcionSnapshot: 'Equipo prueba',
  tecnicoAsignadoId: null,
} as Reparacion

describe('Formularios técnicos simplificados', () => {
  it('mantiene el diagnóstico específico y guarda sin notas genéricas', async () => {
    const alGuardar = vi.fn().mockResolvedValue(undefined)
    render(<DialogoDiagnostico abierto reparacion={reparacion} alCambiarApertura={vi.fn()} alGuardar={alGuardar} />)
    expect(screen.getByText('Detalle adicional del diagnóstico').closest('details')).not.toHaveAttribute('open')
    fireEvent.change(screen.getByLabelText('Síntomas observados *'), { target: { value: 'No enciende durante la revisión' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar diagnóstico' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(expect.objectContaining({ sintomas: 'No enciende durante la revisión', notas: '' })))
  })

  it('registra resultado y aprobación sin exigir mediciones adicionales', async () => {
    const alGuardar = vi.fn().mockResolvedValue(undefined)
    render(<DialogoPrueba abierto reparacion={reparacion} alCambiarApertura={vi.fn()} alGuardar={alGuardar} />)
    expect(screen.getByText('Condiciones y mediciones adicionales').closest('details')).not.toHaveAttribute('open')
    fireEvent.change(screen.getByLabelText('Tipo de prueba *'), { target: { value: 'Encendido' } })
    fireEvent.change(screen.getByLabelText('Resultado *'), { target: { value: 'Enciende correctamente' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar prueba' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(expect.objectContaining({ aprobada: true, resultado: 'Enciende correctamente', notas: '' })))
  })

  it('confirma una acción ordinaria sin un campo de observación', async () => {
    const alGuardar = vi.fn().mockResolvedValue(undefined)
    render(<DialogoObservacion abierto titulo="Entregar reparación" descripcion="Confirma la entrega de REP-0001." etiquetaAccion="Confirmar entrega" alCambiarApertura={vi.fn()} alGuardar={alGuardar} />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith({ observacion: '' }))
  })

  it('exige un único motivo claro para rechazo o cancelación', async () => {
    const alGuardar = vi.fn().mockResolvedValue(undefined)
    render(<DialogoObservacion abierto titulo="Rechazar cotización" descripcion="Explica por qué se rechaza." etiquetaAccion="Rechazar" observacionObligatoria alCambiarApertura={vi.fn()} alGuardar={alGuardar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
    expect(await screen.findByText('Indica el motivo de esta acción')).toBeInTheDocument()
    expect(alGuardar).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Motivo *'), { target: { value: 'El cliente no acepta el presupuesto' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith({ observacion: 'El cliente no acepta el presupuesto' }))
  })
})
