import { useEffect, useState } from 'react'

export function useDebounceInventario<T>(valor: T, demora = 350) {
  const [valorDebounced, setValorDebounced] = useState(valor)

  useEffect(() => {
    const temporizador = window.setTimeout(() => setValorDebounced(valor), demora)
    return () => window.clearTimeout(temporizador)
  }, [demora, valor])

  return valorDebounced
}
