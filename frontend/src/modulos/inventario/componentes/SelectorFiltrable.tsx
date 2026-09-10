import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

export interface OpcionSelectorFiltrable {
  id: string
  etiqueta: string
  textoBusqueda?: string
}

interface Props {
  id: string
  name: string
  etiqueta: string
  opciones: OpcionSelectorFiltrable[]
  deshabilitado?: boolean
  limiteVisible?: number
}

function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es-PE').trim()
}

/**
 * Selector nativo precedido por búsqueda. Mantiene la semántica y navegación del
 * navegador, pero evita desplegar catálogos completos en formularios operativos.
 */
export function SelectorFiltrable({
  id,
  name,
  etiqueta,
  opciones,
  deshabilitado = false,
  limiteVisible = 50,
}: Props) {
  const [busqueda, setBusqueda] = useState('')
  const [seleccion, setSeleccion] = useState(opciones[0]?.id ?? '')
  const termino = normalizar(busqueda)

  useEffect(() => {
    if (!opciones.some((opcion) => opcion.id === seleccion)) {
      setSeleccion(opciones[0]?.id ?? '')
    }
  }, [opciones, seleccion])

  const coincidencias = useMemo(() => {
    const filtradas = termino
      ? opciones.filter((opcion) => normalizar(`${opcion.etiqueta} ${opcion.textoBusqueda ?? ''}`).includes(termino))
      : opciones
    const visibles = filtradas.slice(0, limiteVisible)
    const seleccionActual = opciones.find((opcion) => opcion.id === seleccion)
    if (seleccionActual && !visibles.some((opcion) => opcion.id === seleccionActual.id)) {
      return [seleccionActual, ...visibles].slice(0, limiteVisible)
    }
    return visibles
  }, [limiteVisible, opciones, seleccion, termino])

  const sinOpciones = opciones.length === 0

  return (
    <div>
      <label className="field-label" htmlFor={`${id}-busqueda`}>Buscar {etiqueta.toLocaleLowerCase('es-PE')}</label>
      <span className="relative block">
        <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={`${id}-busqueda`}
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          className="field-control ps-9"
          placeholder="Código o descripción"
          disabled={deshabilitado || sinOpciones}
        />
      </span>
      <label className="field-label mt-2" htmlFor={id}>{etiqueta}</label>
      <select
        id={id}
        name={name}
        value={seleccion}
        onChange={(evento) => setSeleccion(evento.target.value)}
        className="field-control"
        required
        disabled={deshabilitado || sinOpciones}
      >
        {sinOpciones ? <option value="">No hay productos disponibles</option> : null}
        {coincidencias.map((opcion) => <option key={opcion.id} value={opcion.id}>{opcion.etiqueta}</option>)}
      </select>
      {!sinOpciones ? (
        <span className="mt-1 block text-xs text-muted-foreground" aria-live="polite">
          {coincidencias.length} de {opciones.length} opciones mostradas
        </span>
      ) : null}
    </div>
  )
}
