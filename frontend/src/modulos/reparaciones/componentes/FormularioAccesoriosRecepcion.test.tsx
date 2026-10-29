import { zodResolver } from '@hookform/resolvers/zod'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { datosReparacionInicial, esquemaDatosReparacion, type DatosReparacion } from '../modelo/reparacion'
import { FormularioAccesoriosRecepcion } from './FormularioAccesoriosRecepcion'

function Formulario({ guardar, bloqueado = false }: { guardar: (datos: DatosReparacion) => void; bloqueado?: boolean }) {
  const formulario = useForm<DatosReparacion>({ resolver: zodResolver(esquemaDatosReparacion), defaultValues: {
    ...datosReparacionInicial(), tipoSolicitante: 'internal', areaSolicitante: 'Área interna', tipoEquipo: 'external', descripcionEquipoExterno: 'Equipo', problema: 'No enciende', accesorios: [],
  } })
  return <form noValidate onSubmit={formulario.handleSubmit(guardar)}><FormularioAccesoriosRecepcion formulario={formulario} bloqueado={bloqueado} /><button type="submit">Guardar recepción</button></form>
}
describe('Recepción de accesorios', () => {
  it('guarda sin crear filas ficticias', async () => {
    const guardar = vi.fn(); render(<Formulario guardar={guardar} />)
    fireEvent.click(screen.getByText('Guardar recepción'))
    await waitFor(() => expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ accesorios: [] }), expect.anything()))
  })
  it('registra varias filas con condiciones y observaciones', async () => {
    const guardar = vi.fn(); render(<Formulario guardar={guardar} />)
    for (let i = 1; i <= 3; i++) {
      fireEvent.click(screen.getByText('Agregar accesorio'))
      fireEvent.change(screen.getByLabelText(`Accesorio ${i} · Nombre *`), { target: { value: ['Cable','Sensor','Estuche'][i - 1] } })
      fireEvent.change(screen.getByLabelText(`Accesorio ${i} · Cantidad *`), { target: { value: i === 2 ? '2' : '1' } })
    }
    fireEvent.change(screen.getByLabelText('Accesorio 2 · Condición'), { target: { value: 'Regular' } })
    fireEvent.change(screen.getByLabelText('Accesorio 2 · Observaciones'), { target: { value: 'Etiqueta roja' } })
    fireEvent.click(screen.getByText('Guardar recepción'))
    await waitFor(() => expect(guardar).toHaveBeenCalled())
    expect(guardar.mock.calls[0][0].accesorios).toHaveLength(3)
    expect(guardar.mock.calls[0][0].accesorios[1]).toMatchObject({ nombre: 'Sensor', cantidadRecibida: 2, condicion: 'Regular', observaciones: 'Etiqueta roja' })
  })
  it('quita una fila antes de guardar', async () => {
    const guardar = vi.fn(); render(<Formulario guardar={guardar} />)
    fireEvent.click(screen.getByText('Agregar accesorio')); fireEvent.click(screen.getByText('Quitar accesorio 1'))
    fireEvent.click(screen.getByText('Guardar recepción'))
    await waitFor(() => expect(guardar).toHaveBeenCalled())
    expect(guardar.mock.calls[0][0].accesorios).toEqual([])
  })
  it.each(['0','-1','1.5'])('muestra error por cantidad %s en la fila', async cantidad => {
    const guardar = vi.fn(); render(<Formulario guardar={guardar} />)
    fireEvent.click(screen.getByText('Agregar accesorio'))
    fireEvent.change(screen.getByLabelText('Accesorio 1 · Nombre *'), { target: { value: 'Cable' } })
    fireEvent.change(screen.getByLabelText('Accesorio 1 · Cantidad *'), { target: { value: cantidad } })
    fireEvent.click(screen.getByText('Guardar recepción'))
    expect(await screen.findByRole('alert')).toBeVisible(); expect(guardar).not.toHaveBeenCalled()
  })
  it('nombre requerido con error por fila', async () => {
    render(<Formulario guardar={vi.fn()} />); fireEvent.click(screen.getByText('Agregar accesorio')); fireEvent.click(screen.getByText('Guardar recepción'))
    expect(await screen.findByText('Indica el nombre del accesorio')).toBeVisible()
  })
  it('bloquea cambios de una intención pendiente', () => {
    render(<Formulario guardar={vi.fn()} bloqueado />)
    expect(screen.getByText('Agregar accesorio')).toBeDisabled()
  })
})
