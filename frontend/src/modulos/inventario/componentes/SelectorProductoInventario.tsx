import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { useOpcionesProductoInventario } from '@/modulos/inventario/estado/useOpcionesProductoInventario'
import type { ProductoInventarioOpcion } from '@/modulos/inventario/modelo/productoInventarioRead'
import { listarOpcionesProductoInventario } from '@/modulos/inventario/servicios/productoInventarioReadService'

interface Props {
  id: string
  name: string
  etiqueta: string
  organizationId: string
  requerido?: boolean
  deshabilitado?: boolean
  error?: string
  autoSeleccionarPrimeraOpcion?: boolean
  value?: string
  selectedOption?: ProductoInventarioOpcion | null
  onValueChange?: (value: string, option?: ProductoInventarioOpcion) => void
}

const opcionesVacias: ProductoInventarioOpcion[] = []

function convertirOpcionProducto(opcion: ProductoInventarioOpcion): ComboboxOption {
  return {
    value: opcion.id,
    label: `${opcion.codigo} · ${opcion.descripcion}`,
    secondaryText: opcion.unidadMedida ? `Unidad: ${opcion.unidadMedida}` : undefined,
    keywords: [opcion.codigo, opcion.descripcion, opcion.codigoBarras],
  }
}

export function SelectorProductoInventario({
  id,
  name,
  etiqueta,
  organizationId,
  requerido = true,
  deshabilitado = false,
  error,
  autoSeleccionarPrimeraOpcion = true,
  value,
  selectedOption = null,
  onValueChange,
}: Props) {
  const queryClient = useQueryClient()
  const [seleccionInterna, setSeleccionInterna] = useState(value ?? '')
  const [opcionInterna, setOpcionInterna] = useState<ProductoInventarioOpcion | null>(null)
  const [opcionesConsultadas, setOpcionesConsultadas] = useState<ProductoInventarioOpcion[]>([])
  const opcionesInicialesQuery = useOpcionesProductoInventario('', !deshabilitado, organizationId)
  const opcionesIniciales = opcionesInicialesQuery.data?.items ?? opcionesVacias
  const seleccion = value ?? seleccionInterna

  const productos = useMemo(() => {
    const porId = new Map<string, ProductoInventarioOpcion>()
    for (const opcion of [
      ...opcionesIniciales,
      ...opcionesConsultadas,
      selectedOption,
      opcionInterna,
    ]) {
      if (opcion) porId.set(opcion.id, opcion)
    }
    return [...porId.values()]
  }, [opcionInterna, opcionesConsultadas, opcionesIniciales, selectedOption])

  const opciones = useMemo(() => productos.map(convertirOpcionProducto), [productos])

  const cargarProductos = useCallback(async (busqueda: string) => {
    const termino = busqueda.trim()
    const respuesta = await queryClient.fetchQuery({
      queryKey: ['inventory-product-options', organizationId, termino],
      queryFn: () => listarOpcionesProductoInventario(organizationId, termino, 50, 0),
      staleTime: 30_000,
    })
    setOpcionesConsultadas(respuesta.items)
    return respuesta.items.map(convertirOpcionProducto)
  }, [organizationId, queryClient])

  useEffect(() => {
    if (
      opcionesInicialesQuery.isLoading ||
      opcionesInicialesQuery.error ||
      opcionesIniciales.length === 0 ||
      !autoSeleccionarPrimeraOpcion
    ) return

    if (!productos.some((opcion) => opcion.id === seleccion)) {
      const siguiente = opcionesIniciales[0]
      if (value === undefined) setSeleccionInterna(siguiente.id)
      setOpcionInterna(siguiente)
      onValueChange?.(siguiente.id, siguiente)
    }
  }, [
    autoSeleccionarPrimeraOpcion,
    onValueChange,
    opcionesIniciales,
    opcionesInicialesQuery.error,
    opcionesInicialesQuery.isLoading,
    productos,
    seleccion,
    value,
  ])

  const cambiarSeleccion = (nextValue: string) => {
    const opcion = productos.find((item) => item.id === nextValue)
    if (value === undefined) setSeleccionInterna(nextValue)
    setOpcionInterna(opcion ?? null)
    onValueChange?.(nextValue, opcion)
  }

  const errorInicial = opcionesInicialesQuery.error instanceof Error
    ? 'No se pudo cargar la lista de productos. Vuelve a intentarlo.'
    : undefined

  return (
    <div>
      <input type="hidden" name={name} value={seleccion} />
      <Combobox
        id={id}
        label={etiqueta}
        value={seleccion}
        options={opciones}
        onChange={cambiarSeleccion}
        loadOptions={cargarProductos}
        placeholder="Código, descripción o código de barras"
        helperText="Busca por código, nombre o código de barras."
        error={error ?? errorInicial}
        required={requerido}
        disabled={deshabilitado}
        noOptionsMessage="No hay productos disponibles."
        noResultsMessage="No se encontraron productos con esos datos."
        loadingMessage="Buscando productos…"
      />
    </div>
  )
}
