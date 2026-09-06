import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import type {
  ConsultaCatalogoReparacion,
  ResultadoCatalogoReparacion,
} from '../modelo/reparacion'

interface SelectorCatalogoReparacionProps<T extends { id: string }> {
  id: string
  etiqueta: string
  etiquetaBusqueda: string
  valor: string
  opcionesIniciales: readonly T[]
  totalInicial: number
  opcionActual?: T | null
  buscar?: (consulta: ConsultaCatalogoReparacion) => Promise<ResultadoCatalogoReparacion<T>>
  resolver?: (id: string) => Promise<T | null>
  representar: (opcion: T) => string
  alCambiar: (valor: string, opcion: T | null) => void
  error?: string
  deshabilitado?: boolean
  textoVacio: string
}

const tamanioPagina = 25

export function SelectorCatalogoReparacion<T extends { id: string }>({
  id, etiqueta, etiquetaBusqueda, valor, opcionesIniciales, totalInicial,
  opcionActual, buscar, resolver, representar, alCambiar, error, deshabilitado, textoVacio,
}: SelectorCatalogoReparacionProps<T>) {
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const [resultado, setResultado] = useState<ResultadoCatalogoReparacion<T>>({
    elementos: [...opcionesIniciales], total: totalInicial,
  })
  const [seleccionConocida, setSeleccionConocida] = useState<T | null>(opcionActual ?? null)
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    if (opcionActual?.id === valor) setSeleccionConocida(opcionActual)
  }, [opcionActual, valor])

  useEffect(() => {
    if (!valor || !resolver || opcionActual?.id === valor || seleccionConocida?.id === valor
      || resultado.elementos.some((item) => item.id === valor)) return
    let vigente = true
    setCargando(true)
    setMensaje('')
    void resolver(valor).then((opcion) => {
      if (vigente) setSeleccionConocida(opcion)
    }).catch((error: unknown) => {
      if (vigente) setMensaje(error instanceof Error ? error.message : 'No se pudo resolver la opción actual.')
    }).finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [opcionActual, resolver, resultado.elementos, seleccionConocida, valor])

  useEffect(() => {
    if (!busqueda && pagina === 1) {
      setResultado({ elementos: [...opcionesIniciales], total: totalInicial })
    }
  }, [busqueda, opcionesIniciales, pagina, totalInicial])

  useEffect(() => {
    if (!buscar || (!busqueda && pagina === 1)) return
    let vigente = true
    const espera = window.setTimeout(() => {
      setCargando(true)
      setMensaje('')
      void buscar({ busqueda, pagina, tamanioPagina }).then((respuesta) => {
        if (vigente) setResultado(respuesta)
      }).catch((error: unknown) => {
        if (vigente) setMensaje(error instanceof Error ? error.message : 'No se pudo consultar el catálogo.')
      }).finally(() => { if (vigente) setCargando(false) })
    }, 250)
    return () => { vigente = false; window.clearTimeout(espera) }
  }, [buscar, busqueda, pagina])

  const opciones = useMemo(() => {
    const elegida = seleccionConocida?.id === valor ? seleccionConocida
      : opcionActual?.id === valor ? opcionActual : null
    return elegida && !resultado.elementos.some((item) => item.id === elegida.id)
      ? [elegida, ...resultado.elementos] : resultado.elementos
  }, [opcionActual, resultado.elementos, seleccionConocida, valor])
  const paginas = Math.max(1, Math.ceil(resultado.total / tamanioPagina))

  return <div>
    <label htmlFor={`${id}-busqueda`} className="field-label">{etiquetaBusqueda}</label>
    <input id={`${id}-busqueda`} type="search" className="field-control mb-2"
      value={busqueda} disabled={deshabilitado} placeholder="Escribe para buscar en todo el catálogo"
      onChange={(evento) => { setBusqueda(evento.target.value); setPagina(1) }} />
    <label htmlFor={id} className="field-label">{etiqueta}</label>
    <select id={id} className="field-control" value={valor} disabled={deshabilitado}
      aria-invalid={Boolean(error)} onChange={(evento) => {
        const siguiente = evento.target.value
        const opcion = resultado.elementos.find((item) => item.id === siguiente) ?? null
        setSeleccionConocida(opcion)
        alCambiar(siguiente, opcion)
      }}>
      <option value="">{cargando ? 'Consultando…' : textoVacio}</option>
      {opciones.map((opcion) => <option key={opcion.id} value={opcion.id}>{representar(opcion)}</option>)}
    </select>
    {error ? <p className="field-error">{error}</p> : null}
    {mensaje ? <p role="alert" className="field-error">{mensaje}</p> : null}
    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{resultado.total} coincidencias · página {pagina} de {paginas}</span>
      <span className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={deshabilitado || cargando || pagina <= 1}
          onClick={() => setPagina((actual) => Math.max(1, actual - 1))}>Anterior</Button>
        <Button type="button" size="sm" variant="outline" disabled={deshabilitado || cargando || pagina >= paginas}
          onClick={() => setPagina((actual) => actual + 1)}>Siguiente</Button>
      </span>
    </div>
  </div>
}
