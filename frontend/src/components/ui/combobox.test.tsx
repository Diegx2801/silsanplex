import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Combobox, type ComboboxOption } from './combobox'

const opciones: ComboboxOption[] = [
  {
    value: 'producto-1',
    label: 'PARA-500 · Paracetamol 500 mg',
    secondaryText: 'Producto físico · Unidad: Caja',
    keywords: ['paracetamol', '750000000001'],
  },
  {
    value: 'producto-2',
    label: 'IBU-400 · Ibuprofeno 400 mg',
    secondaryText: 'Producto físico · Unidad: Caja',
    keywords: ['ibuprofeno', '750000000002'],
  },
  {
    value: 'producto-inactivo',
    label: 'AMO-500 · Amoxicilina 500 mg',
    keywords: ['amoxicilina'],
    disabled: true,
  },
]

describe('Combobox', () => {
  it('filtra por etiquetas y palabras clave y selecciona una opción', async () => {
    const onChange = vi.fn()
    function ComboboxControlado() {
      const [value, setValue] = useState('')

      return (
        <Combobox
          id="producto"
          label="Producto"
          value={value}
          options={opciones}
          onChange={(nextValue) => {
            setValue(nextValue)
            onChange(nextValue)
          }}
        />
      )
    }

    render(
      <ComboboxControlado />,
    )

    const input = screen.getByRole('combobox', { name: 'Producto' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '750000000002' } })

    expect(screen.getByRole('option', { name: /IBU-400/ })).toBeVisible()
    expect(screen.queryByRole('option', { name: /PARA-500/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('option', { name: /IBU-400/ }))
    expect(onChange).toHaveBeenCalledWith('producto-2')
    await waitFor(() => expect(input).toHaveValue('IBU-400 · Ibuprofeno 400 mg'))
  })

  it('selecciona con teclado y no permite opciones inactivas', () => {
    const onChange = vi.fn()
    render(
      <Combobox
        id="producto"
        label="Producto"
        value=""
        options={opciones}
        onChange={onChange}
      />,
    )

    const input = screen.getByRole('combobox', { name: 'Producto' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'amoxicilina' } })
    expect(screen.getByRole('option', { name: /AMO-500/ })).toBeDisabled()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: 'ibuprofeno' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('producto-2')
  })
})
