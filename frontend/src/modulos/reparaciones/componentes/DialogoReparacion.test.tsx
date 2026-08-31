import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Reparacion } from '@/modulos/reparaciones/modelo/reparacion'

import { DialogoReparacion } from './DialogoReparacion'

const clienteId = '00000000-0000-4000-8000-000000000001'
const productoId = '00000000-0000-4000-8000-000000000002'

const clientes = [{
  id: clienteId,
  nombre: 'Cliente prueba',
  nombreComercial: '',
  documento: 'DNI 00000001',
}]

const productos = [{
  id: productoId,
  codigo: 'PROD-1',
  descripcion: 'Equipo prueba',
  unidadMedida: 'unidad',
  serialControl: false,
  controlLote: false,
  controlVencimiento: false,
}]

const reparacion: Reparacion = {
  id: 'repair-1',
  organizationId: 'org-1',
  codigo: 'REP-0001',
  clienteId,
  productoId,
  numeroSerie: 'SER-ORIGINAL',
  recibidaEn: '2026-08-30T12:00:00Z',
  fechaEntregaEstimada: '',
  entregadaEn: '',
  estado: 'diagnosis',
  prioridad: 'normal',
  problema: 'No enciende',
  diagnostico: 'Fuente dañada',
  diagnosticoRegistrado: true,
  solucionAplicada: '',
  solucionAplicadaRegistrada: false,
  notas: '',
  referenciaCliente: '',
  documentoVentaId: '',
  referenciaGarantia: '',
  tecnicoAsignadoId: null,
  clienteNombreSnapshot: 'Cliente prueba',
  clienteDocumentoSnapshot: 'DNI 00000001',
  productoCodigoSnapshot: 'PROD-1',
  productoDescripcionSnapshot: 'Equipo prueba',
  creadoPor: null,
  actualizadoPor: null,
  creadoEn: '2026-08-30T12:00:00Z',
  actualizadoEn: '2026-08-30T12:00:00Z',
}

function renderizarDialogo(
  reparacionActual: Reparacion | null,
  identidadEditable: boolean,
) {
  const alGuardar = vi.fn().mockResolvedValue(undefined)
  render(
    <DialogoReparacion
      abierto
      reparacion={reparacionActual}
      identidadEditable={identidadEditable}
      clientes={clientes}
      productos={productos}
      alCambiarApertura={vi.fn()}
      alGuardar={alGuardar}
      alRestaurarFoco={vi.fn()}
    />,
  )
  return alGuardar
}

describe('DialogoReparacion', () => {
  it('permite editar la identidad durante la creación', () => {
    renderizarDialogo(null, true)

    expect(screen.getByLabelText('Cliente *')).toBeEnabled()
    expect(screen.getByLabelText('Producto o equipo *')).toBeEnabled()
  })

  it('presenta la identidad bloqueada como información de solo lectura', () => {
    renderizarDialogo(reparacion, false)

    expect(screen.queryByLabelText('Cliente *')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Producto o equipo *')).not.toBeInTheDocument()
    expect(screen.getByText('Cliente prueba')).toBeVisible()
    expect(screen.getByText('Equipo prueba')).toBeVisible()
    expect(screen.getByText('SER-ORIGINAL')).toBeVisible()
  })

  it('conserva la serie y envía cambios generales cuando la identidad está bloqueada', async () => {
    const alGuardar = renderizarDialogo(reparacion, false)

    fireEvent.change(screen.getByLabelText('Prioridad *'), { target: { value: 'high' } })
    fireEvent.change(screen.getByLabelText('Problema reportado *'), {
      target: { value: 'No enciende con su cargador' },
    })
    fireEvent.change(screen.getByLabelText('Notas de recepción'), {
      target: { value: 'Editar desde VENTAS' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId,
        productoId,
        numeroSerie: 'SER-ORIGINAL',
        prioridad: 'high',
        problema: 'No enciende con su cargador',
        notas: 'Editar desde VENTAS',
      }),
      'repair-1',
      false,
    ))
  })
})
