import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDebounceInventario } from './useDebounceInventario'

function Probe() {
  const [valor, setValor] = useState('inicial')
  const debounced = useDebounceInventario(valor, 300)
  return <button type="button" onClick={() => setValor('nuevo')}>{debounced}</button>
}

describe('useDebounceInventario', () => {
  afterEach(() => vi.useRealTimers())

  it('espera el intervalo real antes de publicar la búsqueda', async () => {
    vi.useFakeTimers()
    render(<Probe />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent('inicial')
    act(() => vi.advanceTimersByTime(299))
    expect(screen.getByRole('button')).toHaveTextContent('inicial')
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(screen.getByRole('button')).toHaveTextContent('nuevo')
  })
})
