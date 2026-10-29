import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ list: vi.fn(), upload: vi.fn(), download: vi.fn(), validate: vi.fn() }))
vi.mock('@/features/auth/useAuth', () => ({ useAuth: () => ({ access: { organizationId: 'org' }, user: { id: 'user' } }) }))
vi.mock('../servicios/adjuntosReparacionService', () => ({
  listarAdjuntosReparacion: mocks.list, adjuntarArchivoReparacion: mocks.upload,
  obtenerDescargaAdjuntoReparacion: mocks.download, validarAdjuntoReparacion: mocks.validate,
}))
import { AdjuntosReparacion } from './AdjuntosReparacion'
function mostrar(puedeAdjuntar = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><AdjuntosReparacion reparacionId="repair" puedeAdjuntar={puedeAdjuntar} /></QueryClientProvider>)
}
beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue([]); mocks.upload.mockResolvedValue({}); mocks.validate.mockReturnValue(undefined) })
async function abrir() {
  fireEvent.click(screen.getByText('Archivos de la reparación'))
  await waitFor(() => expect(mocks.list).toHaveBeenCalled())
}
describe('Archivos de la reparación', () => {
  it('empieza plegado y no consulta archivos hasta abrir el apartado', async () => {
    mostrar()
    expect(screen.getByText('Archivos de la reparación').closest('details')).not.toHaveAttribute('open')
    expect(mocks.list).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Foto o documento')).not.toBeInTheDocument()
    await abrir()
    expect(screen.getByLabelText('Foto o documento')).toBeInTheDocument()
  })
  it('no muestra campos de carga a usuarios de consulta', async () => {
    mostrar(false)
    await abrir()
    expect(await screen.findByText('Todavía no hay archivos adjuntos.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Foto o documento')).not.toBeInTheDocument()
  })
  it('deshabilita adjuntar hasta elegir un archivo y confirma la carga', async () => {
    mostrar()
    await abrir()
    const boton = screen.getByRole('button', { name: 'Adjuntar' })
    expect(boton).toBeDisabled()
    const archivo = new File(['test'], 'foto.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Foto o documento'), { target: { files: [archivo] } })
    fireEvent.click(boton)
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith('org', 'repair', 'user', archivo))
    expect(await screen.findByText('Archivo adjuntado.')).toBeInTheDocument()
    expect(boton).toBeDisabled()
  })
  it('explica un archivo inválido y no envía nada', async () => {
    mocks.validate.mockImplementation(() => { throw new Error('El archivo pesa más de 5 MB.') })
    mostrar()
    await abrir()
    fireEvent.change(screen.getByLabelText('Foto o documento'), { target: { files: [new File(['x'], 'grande.png')] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('5 MB')
    expect(screen.getByRole('button', { name: 'Adjuntar' })).toBeDisabled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })
  it('permite reintentar la lista y no presenta el error como lista vacía', async () => {
    mocks.list.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce([])
    mostrar()
    await abrir()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar')
    expect(screen.queryByText('Todavía no hay archivos adjuntos.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Todavía no hay archivos adjuntos.')).toBeInTheDocument()
  })
})
