import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { SelectorCatalogoReparacion } from './SelectorCatalogoReparacion'

const iniciales = Array.from({ length: 25 }, (_, indice) => ({
  id: String(indice + 1),
  nombre: `Opción ${indice + 1}`,
}))

it('usa un único combobox compartido para buscar y seleccionar en el catálogo remoto', async () => {
  const encontrada = { id: '1001', nombre: 'Opción 1001' }
  const buscar = vi.fn().mockResolvedValue({ elementos: [encontrada] })
  const alCambiar = vi.fn()

  render(<SelectorCatalogoReparacion
    id="catalogo"
    etiqueta="Producto *"
    valor=""
    opcionesIniciales={iniciales}
    buscar={buscar}
    representar={(opcion) => opcion.nombre}
    alCambiar={alCambiar}
    placeholder="Buscar producto…"
  />)

  const campo = screen.getByLabelText('Producto *')
  fireEvent.change(campo, { target: { value: 'Opción 1001' } })

  const resultado = await screen.findByRole('option', { name: 'Opción 1001' })
  expect(buscar).toHaveBeenCalledWith({ busqueda: 'Opción 1001', pagina: 1, tamanioPagina: 25 })
  fireEvent.click(resultado)

  expect(alCambiar).toHaveBeenCalledWith('1001', encontrada)
  expect(screen.queryByLabelText('Buscar producto')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument()
})

it('resuelve y muestra una referencia histórica fuera de las opciones iniciales', async () => {
  const resolver = vi.fn().mockResolvedValue({ id: 'legacy', nombre: 'Referencia histórica' })
  render(<SelectorCatalogoReparacion
    id="catalogo"
    etiqueta="Cliente *"
    valor="legacy"
    opcionesIniciales={iniciales}
    resolver={resolver}
    representar={(opcion) => opcion.nombre}
    alCambiar={vi.fn()}
    placeholder="Buscar cliente…"
  />)

  await waitFor(() => expect(screen.getByLabelText('Cliente *')).toHaveValue('Referencia histórica'))
  expect(resolver).toHaveBeenCalledWith('legacy')
})
