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

interface ComboboxProps {
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
}: ComboboxProps) {
  const listboxId = `${id}-listbox`
  const helperId = `${id}-helper`
  const errorId = `${id}-error`
  const reactId = useId().replace(/:/g, '')
  const rootRef = useRef<HTMLDivElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [indiceActivo, setIndiceActivo] = useState(-1)
  const seleccion = options.find((option) => option.value === value)

  const opcionesFiltradas = useMemo(() => {
    const termino = normalizar(busqueda)
    const coincidencias = termino
      ? options.filter((option) =>
          normalizar(
            [option.label, option.secondaryText ?? '', ...(option.keywords ?? [])].join(' '),
          ).includes(termino),
        )
      : [...options]

    return coincidencias.slice(0, maxVisibleOptions)
  }, [busqueda, maxVisibleOptions, options])

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
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border bg-background p-1 shadow-xl"
        >
          {!opcionesFiltradas.length ? (
            <p className="px-3 py-2 text-sm text-muted-foreground" role="status">
              {options.length ? noResultsMessage : noOptionsMessage}
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
