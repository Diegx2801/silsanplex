import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ParteReparacion } from '../modelo/reparacion'
import { DialogoConsumoParte } from './DialogoRepuesto'

const parte: ParteReparacion = {
  id: 'parte-1', organizationId: 'org-1', reparacionId: 'rep-1', productoId: 'prod-1',
  productoCodigoSnapshot: 'R1', productoDescripcionSnapshot: 'Repuesto',
  almacenId: 'alm-1', ubicacionId: 'ubic-1', estadoStock: 'available',
  lote: '', fechaVencimiento: '', cantidadSolicitada: 2, cantidadConsumida: 0,
  estado: 'reserved', notas: '', creadoPor: null, actualizadoPor: null,
  creadoEn: '', actualizadoEn: '', consumos: [],
}

describe('Consumo de repuestos con unidad y reintento', () => {
  it('conserva la clave y cantidad tras una respuesta ambigua', async () => {
    const alGuardar = vi.fn().mockResolvedValue('Tiempo de espera agotado')
    render(<DialogoConsumoParte abierto parte={parte} unidadMedida="Unidad"
      alGuardar={alGuardar} alCambiarApertura={vi.fn()} />)
    expect(screen.getByText(/Saldo pendiente: 2 Unidad/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar consumo' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar consumo' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledTimes(2))
    expect(alGuardar.mock.calls[1]).toEqual(alGuardar.mock.calls[0])
    expect(alGuardar.mock.calls[0]).toEqual([{ cantidad: '2' }, expect.any(String)])
  })

  it('recupera el consumo original aunque ya no quede saldo', async () => {
    const alGuardar = vi.fn().mockResolvedValue(undefined)
    const cerrar = vi.fn()
    render(<DialogoConsumoParte abierto parte={{ ...parte, cantidadConsumida: 2 }}
      unidadMedida="Unidad" operacionPendiente={{ datos: { cantidad: '2' },
        clave: 'clave-original', expectedLockVersion: 3 }}
      alGuardar={alGuardar} alCambiarApertura={cerrar} />)
    expect(screen.getByLabelText('Cantidad a consumir *')).toHaveAttribute('readonly')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar consumo' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith({ cantidad: '2' }, 'clave-original'))
    expect(cerrar).toHaveBeenCalledWith(false)
  })

  it('no permite consumir sin conocer la unidad base', () => {
    render(<DialogoConsumoParte abierto parte={parte} unidadMedida=""
      alGuardar={vi.fn()} alCambiarApertura={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Confirmar consumo' })).toBeDisabled()
    expect(screen.getByText(/unidad base pendiente de consultar/)).toBeInTheDocument()
  })
})
