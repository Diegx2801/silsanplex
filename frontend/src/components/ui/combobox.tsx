import { ChevronDown, Search } from 'lucide-react'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEventHandler,
  type KeyboardEvent,
} from 'react'

export interface ComboboxOption {
  value: string
  label: string
  keywords?: readonly string[]
  secondaryText?: string
  disabled?: boolean
}

export interface ComboboxProps {
  id: string
  label: string
  value: string
  options: readonly ComboboxOption[]
  onChange: (value: string) => void
  onBlur?: FocusEventHandler<HTMLInputElement>
  placeholder?: string
  helperText?: string
  error?: string
  disabled?: boolean
  required?: boolean
  noResultsMessage?: string
  noOptionsMessage?: string
  maxVisibleOptions?: number
  /**
   * Busca opciones en el servidor cuando el catálogo puede crecer más que el
   * primer lote renderizado. Las opciones estáticas siguen sirviendo para
   * mostrar el valor seleccionado y como fallback de compatibilidad.
   */
  loadOptions?: (query: string) => Promise<readonly ComboboxOption[]>
  minSearchLength?: number
  debounceMs?: number
  loadingMessage?: string
}

function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-PE')
    .trim()
}

function primerIndiceSeleccionable(opciones: readonly ComboboxOption[], desde = 0) {
  for (let indice = desde; indice < opciones.length; indice += 1) {
    if (!opciones[indice]?.disabled) return indice
  }
  return -1
}

export function Combobox({
  id,
  label,
  value,
  options,
  onChange,
  onBlur,
  placeholder = 'Buscar…',
  helperText,
  error,
  disabled = false,
  required = false,
  noResultsMessage = 'No se encontraron coincidencias.',
  noOptionsMessage = 'No hay opciones disponibles.',
  maxVisibleOptions = 50,
  loadOptions,
  minSearchLength = 2,
  debounceMs = 220,
  loadingMessage = 'Buscando opciones…',
}: ComboboxProps) {
  const listboxId = `${id}-listbox`
  const helperId = `${id}-helper`
  const errorId = `${id}-error`
  const reactId = useId().replace(/:/g, '')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const interactuandoListaRef = useRef(false)
  const solicitudRef = useRef(0)
  const loadOptionsRef = useRef(loadOptions)
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [indiceActivo, setIndiceActivo] = useState(-1)
  const [opcionesRemotas, setOpcionesRemotas] = useState<readonly ComboboxOption[]>([])
  const [cargando, setCargando] = useState(false)
  const [errorCarga, setErrorCarga] = useState(false)
  const seleccion = options.find((option) => option.value === value)
    ?? opcionesRemotas.find((option) => option.value === value)

  const opcionesFiltradas = useMemo(() => {
    if (loadOptions) return opcionesRemotas.slice(0, maxVisibleOptions)
    const termino = normalizar(busqueda)
    const coincidencias = termino
      ? options.filter((option) =>
          normalizar(
            [option.label, option.secondaryText ?? '', ...(option.keywords ?? [])].join(' '),
          ).includes(termino),
        )
      : [...options]

    return coincidencias.slice(0, maxVisibleOptions)
  }, [busqueda, loadOptions, maxVisibleOptions, opcionesRemotas, options])

  useEffect(() => {
    loadOptionsRef.current = loadOptions
  }, [loadOptions])

  useEffect(() => {
    if (!loadOptionsRef.current || !abierto) return
    const solicitud = ++solicitudRef.current
    const termino = busqueda.trim()
    if (termino.length > 0 && termino.length < minSearchLength) {
      setOpcionesRemotas([])
      setCargando(false)
      setErrorCarga(false)
      return
    }

    setCargando(true)
    setErrorCarga(false)
    const temporizador = window.setTimeout(() => {
      void loadOptionsRef.current?.(termino)
        .then((resultados) => {
          if (solicitud !== solicitudRef.current) return
          setOpcionesRemotas(resultados)
        })
        .catch(() => {
          if (solicitud !== solicitudRef.current) return
          setOpcionesRemotas([])
          setErrorCarga(true)
        })
        .finally(() => {
          if (solicitud === solicitudRef.current) setCargando(false)
        })
    }, debounceMs)

    return () => window.clearTimeout(temporizador)
  }, [abierto, busqueda, debounceMs, minSearchLength])

  useEffect(() => {
    if (!abierto) {
      setBusqueda('')
      setIndiceActivo(-1)
      return
    }
    setIndiceActivo((actual) => {
      if (actual >= 0 && actual < opcionesFiltradas.length && !opcionesFiltradas[actual]?.disabled) {
        return actual
      }
      return primerIndiceSeleccionable(opcionesFiltradas)
    })
  }, [abierto, opcionesFiltradas])

  const seleccionar = (option: ComboboxOption) => {
    if (option.disabled) return
    onChange(option.value)
    setBusqueda('')
    setAbierto(false)
    setIndiceActivo(-1)
  }

  const moverIndice = (direccion: 1 | -1) => {
    if (!opcionesFiltradas.length) return
    const inicio = indiceActivo < 0 ? (direccion === 1 ? -1 : opcionesFiltradas.length) : indiceActivo
    for (let paso = 1; paso <= opcionesFiltradas.length; paso += 1) {
      const indice = (inicio + direccion * paso + opcionesFiltradas.length) % opcionesFiltradas.length
      if (!opcionesFiltradas[indice]?.disabled) {
        setIndiceActivo(indice)
        return
      }
    }
  }

  const controlarTeclado = (evento: KeyboardEvent<HTMLInputElement>) => {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault()
      setAbierto(true)
      moverIndice(1)
      return
    }
    if (evento.key === 'ArrowUp') {
      evento.preventDefault()
      setAbierto(true)
      moverIndice(-1)
      return
    }
    if (evento.key === 'Enter' && abierto && indiceActivo >= 0) {
      evento.preventDefault()
      const option = opcionesFiltradas[indiceActivo]
      if (option) seleccionar(option)
      return
    }
    if ((evento.key === 'Backspace' || evento.key === 'Delete') && value && !busqueda) {
      evento.preventDefault()
      onChange('')
      setAbierto(true)
      setIndiceActivo(-1)
      return
    }
    if (evento.key === 'Escape' && abierto) {
      evento.preventDefault()
      setAbierto(false)
      setBusqueda('')
      setIndiceActivo(-1)
      return
    }
    if (evento.key === 'Tab') {
      setAbierto(false)
      setBusqueda('')
      setIndiceActivo(-1)
    }
  }

  const descripcion = error ? errorId : helperText ? helperId : undefined

  return (
    <div ref={rootRef} className="relative min-w-0">
      <label htmlFor={id} className="field-label">
        {label}{required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          value={abierto ? busqueda : seleccion?.label ?? ''}
          placeholder={placeholder}
          className="field-control w-full ps-9 pe-9"
          autoComplete="off"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-expanded={abierto}
          aria-controls={abierto ? listboxId : undefined}
          aria-required={required || undefined}
          aria-activedescendant={
            abierto && indiceActivo >= 0 ? `${reactId}-${listboxId}-${indiceActivo}` : undefined
          }
          aria-invalid={Boolean(error)}
          aria-describedby={descripcion}
          onFocus={() => {
            setBusqueda('')
            setAbierto(true)
          }}
          onBlur={(evento) => {
            window.setTimeout(() => {
              if (interactuandoListaRef.current) return
              if (!rootRef.current?.contains(document.activeElement)) {
                setAbierto(false)
                setBusqueda('')
                setIndiceActivo(-1)
              }
            }, 0)
            onBlur?.(evento)
          }}
          onChange={(evento) => {
            const siguiente = evento.target.value
            setBusqueda(siguiente)
            setAbierto(true)
            setIndiceActivo(-1)
            if (value && siguiente !== seleccion?.label) onChange('')
          }}
          onKeyDown={controlarTeclado}
        />
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      {abierto ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border bg-background p-1 pe-2 shadow-xl"
          style={{ scrollbarGutter: 'stable' }}
          onPointerDown={() => {
            interactuandoListaRef.current = true
          }}
          onMouseDown={(evento) => {
            // Al hacer clic o arrastrar la barra no debemos perder el foco ni
            // cerrar la lista antes de que el navegador pueda desplazarla.
            const objetivo = evento.target as HTMLElement
            if (!objetivo.closest('[role="option"]')) {
              const rectangulo = evento.currentTarget.getBoundingClientRect()
              const anchoBarra = evento.currentTarget.offsetWidth - evento.currentTarget.clientWidth
              const estaEnBarra = anchoBarra > 0 && evento.clientX >= rectangulo.right - anchoBarra
              if (!estaEnBarra) {
                evento.preventDefault()
                inputRef.current?.focus()
              }
              setAbierto(true)
            }
          }}
          onPointerUp={(evento) => {
            interactuandoListaRef.current = false
            const objetivo = evento.target as HTMLElement
            if (!objetivo.closest('[role="option"]')) inputRef.current?.focus()
          }}
          onPointerCancel={() => {
            interactuandoListaRef.current = false
          }}
        >
          {cargando ? (
            <p className="px-3 py-2 text-sm text-muted-foreground" role="status" aria-live="polite">
              {loadingMessage}
            </p>
          ) : errorCarga ? (
            <p className="px-3 py-2 text-sm text-destructive" role="alert">
              No se pudieron cargar las opciones. Inténtalo nuevamente.
            </p>
          ) : loadOptions && busqueda.trim().length > 0 && busqueda.trim().length < minSearchLength ? (
            <p className="px-3 py-2 text-sm text-muted-foreground" role="status">
              Escribe al menos {minSearchLength} caracteres para buscar.
            </p>
          ) : !opcionesFiltradas.length ? (
            <p className="px-3 py-2 text-sm text-muted-foreground" role="status">
              {loadOptions || options.length ? noResultsMessage : noOptionsMessage}
            </p>
          ) : (
            opcionesFiltradas.map((option, indice) => (
              <button
                key={option.value}
                id={`${reactId}-${listboxId}-${indice}`}
                type="button"
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                disabled={option.disabled}
                className={`block w-full rounded-sm px-3 py-2 text-start text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                  indice === indiceActivo ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                }`}
                onMouseDown={(evento) => evento.preventDefault()}
                onClick={() => seleccionar(option)}
              >
                <span className="block truncate font-medium">{option.label}</span>
                {option.secondaryText ? (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {option.secondaryText}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}

      {helperText ? <p id={helperId} className="mt-1 text-xs text-muted-foreground">{helperText}</p> : null}
      {error ? <p id={errorId} className="field-error">{error}</p> : null}
    </div>
  )
}
