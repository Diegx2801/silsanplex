import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { useOpcionesProductoInventario } from '@/modulos/inventario/estado/useOpcionesProductoInventario'
import type { ProductoInventarioOpcion } from '@/modulos/inventario/modelo/productoInventarioRead'

interface Props {
  id: string
  name: string
  etiqueta: string
  organizationId: string
  deshabilitado?: boolean
  value?: string
  selectedOption?: ProductoInventarioOpcion | null
  onValueChange?: (value: string, option?: ProductoInventarioOpcion) => void
}

export function SelectorProductoInventario({
  id,
  name,
  etiqueta,
  organizationId,
  deshabilitado = false,
  value,
  selectedOption = null,
  onValueChange,
}: Props) {
  const [busqueda, setBusqueda] = useState('')
  const [seleccionInterna, setSeleccionInterna] = useState(value ?? '')
  const opcionesQuery = useOpcionesProductoInventario(busqueda, !deshabilitado, organizationId)
  const opciones = useMemo(() => {
    const remotas = opcionesQuery.data?.items ?? []
    if (selectedOption && !remotas.some((opcion) => opcion.id === selectedOption.id)) {
      return [selectedOption, ...remotas]
    }
    return remotas
  }, [opcionesQuery.data?.items, selectedOption])
  const seleccion = value ?? seleccionInterna
  const sinOpciones = opciones.length === 0

  useEffect(() => {
    if (opciones.length === 0) return
    if (!opciones.some((opcion) => opcion.id === seleccion)) {
      const siguiente = opciones[0]
      if (value === undefined) setSeleccionInterna(siguiente.id)
      onValueChange?.(siguiente.id, siguiente)
    }
  }, [onValueChange, opciones, seleccion, value])

  const cambiarSeleccion = (nextValue: string) => {
    if (value === undefined) setSeleccionInterna(nextValue)
    onValueChange?.(nextValue, opciones.find((opcion) => opcion.id === nextValue))
  }

  return (
    <div>
      <label className="field-label" htmlFor={`${id}-busqueda`}>
        Buscar {etiqueta.toLocaleLowerCase('es-PE')}
      </label>
      <span className="relative block">
        <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={`${id}-busqueda`}
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          className="field-control ps-9"
          placeholder="Código, descripción o barcode"
          disabled={deshabilitado}
        />
      </span>
      <label className="field-label mt-2" htmlFor={id}>{etiqueta}</label>
      <select
        id={id}
        name={name}
        value={seleccion}
        onChange={(evento) => cambiarSeleccion(evento.target.value)}
        className="field-control"
        required
        disabled={deshabilitado || sinOpciones}
      >
        {sinOpciones ? <option value="">{opcionesQuery.isLoading ? 'Consultando productos...' : 'No hay productos disponibles'}</option> : null}
        {opciones.map((opcion) => (
          <option key={opcion.id} value={opcion.id}>
            {opcion.codigo} · {opcion.descripcion}
          </option>
        ))}
      </select>
      {opcionesQuery.error ? (
        <span className="field-error mt-1 block" role="alert">
          {opcionesQuery.error instanceof Error
            ? opcionesQuery.error.message
            : 'No se pudieron consultar los productos de Inventario'}
        </span>
      ) : null}
      {!sinOpciones ? (
        <span className="mt-1 block text-xs text-muted-foreground" aria-live="polite">
          {opciones.length} opciones encontradas{opcionesQuery.data ? ` de ${opcionesQuery.data.totalCount}` : ''}
        </span>
      ) : null}
    </div>
  )
}
