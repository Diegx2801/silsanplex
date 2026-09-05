import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Reparacion } from '../modelo/reparacion'
import { DialogoCotizacion } from './DialogoCotizacion'
import { DialogoReservaParte } from './DialogoRepuesto'

const fefo = vi.hoisted(() => ({
    candidatos: [{ ubicacionId: '00000000-0000-4000-8000-000000000003',
      ubicacionCodigo: 'A1', ubicacionNombre: 'Estante', lote: '',
      fechaVencimiento: '', cantidadAsignable: 10 }],
    cargando: false, error: '',
}))
vi.mock('@/modulos/inventario/estado/useCandidatosFefo', () => ({
  useCandidatosFefo: () => fefo,
}))

const productos = [{
  id: '00000000-0000-4000-8000-000000000001', codigo: 'P1',
  descripcion: 'Repuesto', unidadMedida: 'UND', serialControl: false,
  controlLote: false, controlVencimiento: false,
}]
const almacenes = [{
  id: '00000000-0000-4000-8000-000000000002', codigo: 'A',
  nombre: 'Almacén', direccion: '', activo: true,
}]
const ubicaciones = [{
  id: '00000000-0000-4000-8000-000000000003', almacenId: almacenes[0].id,
  codigo: 'A1', nombre: 'Estante', descripcion: '', activa: true,
}]
const reparacion: Reparacion = {
  id: 'repair-1', organizationId: 'org-1', lockVersion: 1, codigo: 'REP-1',
  clienteId: 'customer-1', productoId: productos[0].id, numeroSerie: '',
  recibidaEn: '', fechaEntregaEstimada: '', entregadaEn: '', estado: 'in_repair',
  prioridad: 'normal', problema: 'No enciende', diagnostico: '',
  diagnosticoRegistrado: true, solucionAplicada: '', solucionAplicadaRegistrada: false,
  notas: '', referenciaCliente: '', documentoVentaId: '', referenciaGarantia: '',
  tecnicoAsignadoId: null, clienteNombreSnapshot: '', clienteDocumentoSnapshot: '',
  productoCodigoSnapshot: '', productoDescripcionSnapshot: '', serialControlSnapshot: false,
  creadoPor: null, actualizadoPor: null, creadoEn: '', actualizadoEn: '',
}

describe('Claves de reintento de comandos', () => {
  beforeEach(() => {
    fefo.candidatos = [{ ubicacionId: ubicaciones[0].id, ubicacionCodigo: 'A1',
      ubicacionNombre: 'Estante', lote: '', fechaVencimiento: '', cantidadAsignable: 10 }]
  })

  it.each(['agotado', 'reducido', 'otro lote'])('reintenta la reserva original con stock %s tras el timeout', async (escenario) => {
    const alGuardar = vi.fn().mockResolvedValue('Tiempo de espera agotado')
    const props = { abierto: true, reparacion, productos, almacenes, ubicaciones,
      alGuardar, alCambiarApertura: vi.fn() }
    const { rerender } = render(<DialogoReservaParte {...props} />)
    fireEvent.change(screen.getByLabelText('Cantidad solicitada *'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reservar repuesto' }))
    await screen.findByRole('alert')
    fefo.candidatos = escenario === 'agotado' ? [] : [{ ...fefo.candidatos[0],
      cantidadAsignable: escenario === 'reducido' ? 1 : 10,
      lote: escenario === 'otro lote' ? 'LOTE-2' : '' }]
    rerender(<DialogoReservaParte {...props} ubicaciones={[...ubicaciones]} />)
    expect(screen.getByRole('button', { name: 'Reservar repuesto' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Reservar repuesto' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledTimes(2))
    expect(alGuardar.mock.calls[1]).toEqual(alGuardar.mock.calls[0])
  })

  it('conserva la reserva y su clave tras un timeout y una recarga del catálogo', async () => {
    const alGuardar = vi.fn().mockResolvedValue('Tiempo de espera agotado')
    const props = { abierto: true, reparacion, productos, almacenes, ubicaciones,
      alGuardar, alCambiarApertura: vi.fn() }
    const { rerender } = render(<DialogoReservaParte {...props} />)
    fireEvent.change(screen.getByLabelText('Cantidad solicitada *'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reservar repuesto' }))
    await screen.findByRole('alert')
    rerender(<DialogoReservaParte {...props} productos={[...productos]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reservar repuesto' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledTimes(2))
    expect(alGuardar.mock.calls[0][1]).toEqual(expect.any(String))
    expect(alGuardar.mock.calls[1]).toEqual(alGuardar.mock.calls[0])

    fireEvent.change(screen.getByLabelText('Cantidad solicitada *'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reservar repuesto' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledTimes(3))
    expect(alGuardar.mock.calls[2][1]).not.toBe(alGuardar.mock.calls[0][1])
  })

  it('reutiliza la clave del borrador y genera otra para una intención distinta', async () => {
    const alGuardar = vi.fn().mockResolvedValue('Tiempo de espera agotado')
    render(<DialogoCotizacion abierto reparacion={reparacion} cotizacion={null}
      productos={productos} alGuardar={alGuardar} alCambiarApertura={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Descripción *'), { target: { value: 'Diagnóstico' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledTimes(2))
    expect(alGuardar.mock.calls[0][2]).toEqual(expect.any(String))
    expect(alGuardar.mock.calls[1]).toEqual(alGuardar.mock.calls[0])
    fireEvent.change(screen.getByLabelText('Descripción *'), { target: { value: 'Diagnóstico completo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledTimes(3))
    expect(alGuardar.mock.calls[2][2]).not.toBe(alGuardar.mock.calls[0][2])
  })
})
