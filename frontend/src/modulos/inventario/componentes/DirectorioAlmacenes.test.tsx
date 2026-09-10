import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DirectorioAlmacenes } from './DirectorioAlmacenes'

const almacenes = [
  { id: '10000000-0000-4000-8000-000000000001', codigo: 'CENTRAL', nombre: 'Almacén Central', direccion: 'Trujillo', activo: true, version: 1 },
  { id: '10000000-0000-4000-8000-000000000002', codigo: 'ANTIGUO', nombre: 'Almacén Antiguo', direccion: '', activo: false, version: 3 },
]

const ubicaciones = [
  { id: '20000000-0000-4000-8000-000000000001', almacenId: almacenes[0].id, codigo: 'GENERAL', nombre: 'General', descripcion: '', activa: true, version: 1 },
  { id: '20000000-0000-4000-8000-000000000002', almacenId: almacenes[1].id, codigo: 'BAJA', nombre: 'Zona de baja', descripcion: '', activa: false, version: 2 },
]

function propiedades(puedeGestionar = true) {
  return {
    almacenes,
    ubicaciones,
    puedeGestionar,
    cargando: false,
    error: '',
    alReintentar: vi.fn().mockResolvedValue(undefined),
    alGuardarAlmacen: vi.fn().mockResolvedValue(undefined),
    alGuardarUbicacion: vi.fn().mockResolvedValue(undefined),
    alCambiarEstadoAlmacen: vi.fn().mockResolvedValue(undefined),
    alCambiarEstadoUbicacion: vi.fn().mockResolvedValue(undefined),
  }
}

describe('DirectorioAlmacenes', () => {
  it('permite consultar los maestros sin exponer acciones a usuarios de solo lectura', () => {
    render(<DirectorioAlmacenes {...propiedades(false)} />)

    expect(screen.getAllByText('Almacén Central')).not.toHaveLength(0)
    expect(screen.queryByText('Almacén Antiguo')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar almacén' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar Almacén Central/ })).not.toBeInTheDocument()
  })

  it('despliega únicamente las ubicaciones del almacén seleccionado', () => {
    render(<DirectorioAlmacenes {...propiedades()} />)

    const desplegar = screen.getByRole('button', { name: 'Mostrar ubicaciones de Almacén Central' })
    expect(desplegar).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('General')).not.toBeInTheDocument()

    fireEvent.click(desplegar)

    expect(screen.getByRole('button', { name: 'Ocultar ubicaciones de Almacén Central' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('General')).toBeVisible()
    expect(screen.queryByText('Zona de baja')).not.toBeInTheDocument()
  })

  it('busca por ubicación y revela su almacén padre', () => {
    render(<DirectorioAlmacenes {...propiedades()} />)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'GENERAL' } })

    expect(screen.getByText('Almacén Central')).toBeVisible()
    expect(screen.getByText('General')).toBeVisible()
    expect(screen.queryByText('Almacén Antiguo')).not.toBeInTheDocument()
  })

  it('registra una ubicación dentro del almacén contextual', async () => {
    const props = propiedades()
    render(<DirectorioAlmacenes {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar ubicaciones de Almacén Central' }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ubicación' }))

    expect(screen.getByDisplayValue('CENTRAL · Almacén Central')).toHaveAttribute('readonly')
    fireEvent.change(screen.getByPlaceholderText('Ej. A-01-N2'), { target: { value: 'A-01' } })
    fireEvent.change(screen.getByPlaceholderText('Ej. Anaquel 1'), { target: { value: 'Anaquel 1' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Registrar ubicación' }).at(-1)!)

    await waitFor(() => {
      expect(props.alGuardarUbicacion).toHaveBeenCalledWith(expect.objectContaining({
        almacenId: almacenes[0].id,
        codigo: 'A-01',
        nombre: 'Anaquel 1',
      }), undefined)
    })
  })

  it('identifica los campos inválidos dentro del modal de registro', async () => {
    const props = propiedades()
    render(<DirectorioAlmacenes {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Registrar almacén' }))
    const botonesRegistrar = screen.getAllByRole('button', { name: 'Registrar almacén' })
    fireEvent.click(botonesRegistrar[botonesRegistrar.length - 1])

    expect(await screen.findByText('Usa de 1 a 20 letras, números, puntos, guiones o guiones bajos')).toBeVisible()
    expect(screen.getByText('Ingresa un nombre de al menos 2 caracteres')).toBeVisible()
    expect(props.alGuardarAlmacen).not.toHaveBeenCalled()
  })
})
