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
  lockVersion: 4,
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
  serialControlSnapshot: false,
  creadoPor: null,
  actualizadoPor: null,
  creadoEn: '2026-08-30T12:00:00Z',
  actualizadoEn: '2026-08-30T12:00:00Z',
}

function renderizarDialogo(
  reparacionActual: Reparacion | null,
  identidadEditable: boolean,
  clientesDisponibles = clientes,
  productosDisponibles = productos,
) {
  const alGuardar = vi.fn().mockResolvedValue(undefined)
  render(
    <DialogoReparacion
      abierto
      reparacion={reparacionActual}
      identidadEditable={identidadEditable}
      clientes={clientesDisponibles}
      productos={productosDisponibles}
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
      undefined,
    ))
  })

  it('permite conservar referencias ausentes de las listas activas', async () => {
    const alGuardar = renderizarDialogo(reparacion, true, [], [])

    expect(screen.getByRole('option', {
      name: 'Cliente prueba · DNI 00000001 (referencia de la orden)',
    })).toBeInTheDocument()
    expect(screen.getByRole('option', {
      name: 'PROD-1 · Equipo prueba (referencia de la orden)',
    })).toBeInTheDocument()
    expect(screen.getByLabelText('Cliente *')).toHaveValue(clienteId)
    expect(screen.getByLabelText('Producto o equipo *')).toHaveValue(productoId)
    expect(screen.getByLabelText('Número de serie')).toHaveValue('SER-ORIGINAL')

    fireEvent.change(screen.getByLabelText('Notas de recepción'), {
      target: { value: 'Actualización administrativa' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId,
        productoId,
        numeroSerie: 'SER-ORIGINAL',
        notas: 'Actualización administrativa',
      }),
      'repair-1',
      true,
      undefined,
    ))
  })

  it('usa la regla de serie conservada aunque el maestro actual difiera', async () => {
    const alGuardar = renderizarDialogo({
      ...reparacion,
      serialControlSnapshot: true,
    }, true)

    expect(screen.getByLabelText('Número de serie *')).toHaveValue('SER-ORIGINAL')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({ numeroSerie: 'SER-ORIGINAL' }),
      'repair-1',
      true,
      undefined,
    ))
  })

  it('limpia la serie al seleccionar otro producto conocido sin series', async () => {
    const otroProductoId = '00000000-0000-4000-8000-000000000003'
    const alGuardar = renderizarDialogo({
      ...reparacion,
      serialControlSnapshot: true,
    }, true, clientes, [
      productos[0],
      {
        ...productos[0],
        id: otroProductoId,
        codigo: 'PROD-2',
        descripcion: 'Equipo sin serie',
      },
    ])

    fireEvent.change(screen.getByLabelText('Producto o equipo *'), {
      target: { value: otroProductoId },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({
        productoId: otroProductoId,
        numeroSerie: '',
      }),
      'repair-1',
      true,
      undefined,
    ))
  })

  it('reutiliza la clave de creación al reintentar los mismos datos', async () => {
    const alGuardar = vi.fn()
      .mockResolvedValueOnce('Tiempo de espera agotado')
      .mockResolvedValueOnce(undefined)
    render(
      <DialogoReparacion
        abierto
        reparacion={null}
        identidadEditable
        clientes={clientes}
        productos={productos}
        alCambiarApertura={vi.fn()}
        alGuardar={alGuardar}
        alRestaurarFoco={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Cliente *'), { target: { value: clienteId } })
    fireEvent.change(screen.getByLabelText('Producto o equipo *'), { target: { value: productoId } })
    fireEvent.change(screen.getByLabelText('Problema reportado *'), {
      target: { value: 'No enciende después del transporte' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Registrar reparación' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Tiempo de espera agotado')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar reparación' }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledTimes(2))
    const primeraClave = alGuardar.mock.calls[0][3]
    expect(primeraClave).toEqual(expect.any(String))
    expect(alGuardar.mock.calls[1][3]).toBe(primeraClave)
  })
})
