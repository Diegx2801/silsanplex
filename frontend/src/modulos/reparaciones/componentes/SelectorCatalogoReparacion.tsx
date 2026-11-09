import { useCallback, useEffect, useMemo, useRef, useState, type FocusEventHandler } from 'react'

import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import type {
  ConsultaCatalogoReparacion,
  ResultadoCatalogoReparacion,
} from '../modelo/reparacion'

interface SelectorCatalogoReparacionProps<T extends { id: string }> {
  id: string
  etiqueta: string
  valor: string
  opcionesIniciales: readonly T[]
  opcionActual?: T | null
  buscar?: (consulta: ConsultaCatalogoReparacion) => Promise<ResultadoCatalogoReparacion<T>>
  resolver?: (id: string) => Promise<T | null>
  representar: (opcion: T) => string
  textoSecundario?: (opcion: T) => string | undefined
  palabrasClave?: (opcion: T) => readonly string[]
  alCambiar: (valor: string, opcion: T | null) => void
  alPerderFoco?: FocusEventHandler<HTMLInputElement>
  error?: string
  deshabilitado?: boolean
  ayuda?: string
  placeholder?: string
  noOptionsMessage?: string
  noResultsMessage?: string
}

const tamanioPagina = 25

export function SelectorCatalogoReparacion<T extends { id: string }>({
  id,
  etiqueta,
  valor,
  opcionesIniciales,
  opcionActual,
  buscar,
  resolver,
  representar,
  textoSecundario,
  palabrasClave,
  alCambiar,
  alPerderFoco,
  error,
  deshabilitado,
  ayuda = 'Escribe para buscar en el catálogo.',
  placeholder,
  noOptionsMessage = 'No hay opciones disponibles.',
  noResultsMessage = 'No se encontraron coincidencias.',
}: SelectorCatalogoReparacionProps<T>) {
  const [opcionesRemotas, setOpcionesRemotas] = useState<readonly T[]>([])
  const [seleccionConocida, setSeleccionConocida] = useState<T | null>(opcionActual ?? null)
  const [errorResolucion, setErrorResolucion] = useState('')
  const [resolucion, setResolucion] = useState<{ id: string; opcion: T | null } | null>(null)
  const solicitudBusquedaRef = useRef(0)
  const opcionesRemotasRef = useRef(new Map<string, T>())

  const registros = useMemo(() => {
    const porId = new Map<string, T>()
    opcionesIniciales.forEach((opcion) => porId.set(opcion.id, opcion))
    opcionesRemotas.forEach((opcion) => porId.set(opcion.id, opcion))
    if (opcionActual?.id === valor) porId.set(opcionActual.id, opcionActual)
    if (seleccionConocida?.id === valor) porId.set(seleccionConocida.id, seleccionConocida)
    if (resolucion?.id === valor && resolucion.opcion) porId.set(resolucion.opcion.id, resolucion.opcion)
    return [...porId.values()]
  }, [opcionActual, opcionesIniciales, opcionesRemotas, resolucion, seleccionConocida, valor])

  const opciones = useMemo<ComboboxOption[]>(() => registros.map((opcion) => ({
    value: opcion.id,
    label: representar(opcion),
    secondaryText: textoSecundario?.(opcion),
    keywords: palabrasClave?.(opcion),
  })), [palabrasClave, registros, representar, textoSecundario])

  const cargarOpciones = useCallback(async (busqueda: string) => {
    if (!buscar) return []
    const solicitud = ++solicitudBusquedaRef.current
    const respuesta = await buscar({ busqueda, pagina: 1, tamanioPagina })
    if (solicitud === solicitudBusquedaRef.current) {
      opcionesRemotasRef.current = new Map(respuesta.elementos.map((opcion) => [opcion.id, opcion]))
      setOpcionesRemotas(respuesta.elementos)
    }
    return respuesta.elementos.map((opcion) => ({
      value: opcion.id,
      label: representar(opcion),
      secondaryText: textoSecundario?.(opcion),
      keywords: palabrasClave?.(opcion),
    }))
  }, [buscar, palabrasClave, representar, textoSecundario])

  const opcionDisponible = registros.find((opcion) => opcion.id === valor)
  const requerido = etiqueta.trim().endsWith('*')
  const etiquetaVisible = etiqueta.replace(/\s*\*$/, '')

  useEffect(() => {
    if (!valor) {
      setSeleccionConocida(null)
      setErrorResolucion('')
      return
    }

    if (opcionActual?.id === valor) {
      setSeleccionConocida(opcionActual)
      setErrorResolucion('')
      return
    }

    if (opcionDisponible || seleccionConocida?.id === valor || resolucion?.id === valor) return
    if (!resolver) return

    let vigente = true
    setErrorResolucion('')
    void resolver(valor).then((opcion) => {
      if (vigente) setResolucion({ id: valor, opcion })
    }).catch(() => {
      if (vigente) setErrorResolucion('No se pudo recuperar la opción seleccionada.')
    })
    return () => { vigente = false }
  }, [opcionActual, opcionDisponible, resolver, resolucion, seleccionConocida, valor])

  const cambiar = (siguiente: string) => {
    const opcion = registros.find((item) => item.id === siguiente)
      ?? opcionesRemotasRef.current.get(siguiente)
      ?? null
    setSeleccionConocida(opcion)
    setResolucion(null)
    setErrorResolucion('')
    alCambiar(siguiente, opcion)
  }

  return (
    <Combobox
      id={id}
      label={etiquetaVisible}
      value={valor}
      options={opciones}
      onChange={cambiar}
      onBlur={alPerderFoco}
      loadOptions={buscar ? cargarOpciones : undefined}
      placeholder={placeholder ?? `Buscar ${etiquetaVisible.toLocaleLowerCase('es-PE')}…`}
      helperText={ayuda}
      error={error ?? (errorResolucion || undefined)}
      disabled={deshabilitado}
      required={requerido}
      noOptionsMessage={noOptionsMessage}
      noResultsMessage={noResultsMessage}
      loadingMessage={`Buscando ${etiquetaVisible.toLocaleLowerCase('es-PE')}…`}
    />
  )
}
