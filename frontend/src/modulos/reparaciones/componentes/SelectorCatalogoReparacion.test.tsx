import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { SelectorCatalogoReparacion } from './SelectorCatalogoReparacion'

const iniciales = Array.from({ length: 25 }, (_, indice) => ({ id: String(indice + 1), nombre: `Opción ${indice + 1}` }))

it('consulta páginas remotas y conserva una selección situada después del registro 1000', async () => {
  const buscar = vi.fn()
    .mockResolvedValueOnce({ elementos: [{ id: '26', nombre: 'Opción 26' }], total: 1001 })
    .mockResolvedValueOnce({ elementos: [{ id: '1001', nombre: 'Opción 1001' }], total: 1 })
  const alCambiar = vi.fn()
  render(<SelectorCatalogoReparacion id="catalogo" etiqueta="Producto *"
    etiquetaBusqueda="Buscar producto" valor="" opcionesIniciales={iniciales}
    totalInicial={1001} buscar={buscar} representar={(opcion) => opcion.nombre}
    alCambiar={alCambiar} textoVacio="Selecciona" />)
  expect(screen.getAllByRole('option')).toHaveLength(26)
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  await waitFor(() => expect(buscar).toHaveBeenLastCalledWith({ busqueda: '', pagina: 2, tamanioPagina: 25 }))
  fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'Opción 1001' } })
  await screen.findByRole('option', { name: 'Opción 1001' })
  fireEvent.change(screen.getByLabelText('Producto *'), { target: { value: '1001' } })
  expect(alCambiar).toHaveBeenCalledWith('1001', { id: '1001', nombre: 'Opción 1001' })
})

it('busca remotamente y mantiene la opción seleccionada al cambiar los resultados', async () => {
  const buscar = vi.fn()
    .mockResolvedValueOnce({ elementos: [{ id: 'found', nombre: 'Encontrada' }], total: 1 })
    .mockResolvedValueOnce({ elementos: [], total: 0 })
  const alCambiar = vi.fn()
  const { rerender } = render(<SelectorCatalogoReparacion id="catalogo" etiqueta="Cliente *"
    etiquetaBusqueda="Buscar cliente" valor="" opcionesIniciales={iniciales}
    totalInicial={25} buscar={buscar} representar={(opcion) => opcion.nombre}
    alCambiar={alCambiar} textoVacio="Selecciona" />)
  fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Encontrada' } })
  await screen.findByRole('option', { name: 'Encontrada' })
  fireEvent.change(screen.getByLabelText('Cliente *'), { target: { value: 'found' } })
  rerender(<SelectorCatalogoReparacion id="catalogo" etiqueta="Cliente *"
    etiquetaBusqueda="Buscar cliente" valor="found" opcionesIniciales={iniciales}
    totalInicial={25} buscar={buscar} representar={(opcion) => opcion.nombre}
    alCambiar={alCambiar} textoVacio="Selecciona" />)
  fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Sin resultados' } })
  await waitFor(() => expect(buscar).toHaveBeenLastCalledWith({ busqueda: 'Sin resultados', pagina: 1, tamanioPagina: 25 }))
  await waitFor(() => expect(screen.getByText(/0 coincidencias/)).toBeInTheDocument())
  expect(screen.getByRole('option', { name: 'Encontrada' })).toBeInTheDocument()
})

it('resuelve por ID una opción actual inactiva fuera de la página', async () => {
  const resolver = vi.fn().mockResolvedValue({ id: 'legacy', nombre: 'Referencia histórica' })
  render(<SelectorCatalogoReparacion id="catalogo" etiqueta="Cliente *"
    etiquetaBusqueda="Buscar cliente" valor="legacy" opcionesIniciales={iniciales}
    totalInicial={1001} resolver={resolver} representar={(opcion) => opcion.nombre}
    alCambiar={vi.fn()} textoVacio="Selecciona" />)
  expect(await screen.findByRole('option', { name: 'Referencia histórica' })).toBeInTheDocument()
  expect(screen.getByLabelText('Cliente *')).toHaveValue('legacy')
  expect(resolver).toHaveBeenCalledWith('legacy')
})
