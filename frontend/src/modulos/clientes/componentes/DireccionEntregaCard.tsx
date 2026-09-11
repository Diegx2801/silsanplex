import { ChevronDown, Trash2 } from 'lucide-react'
import type { FieldArrayWithId, UseFormClearErrors, UseFormGetValues, UseFormRegister, UseFormSetValue } from 'react-hook-form'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { DatosCliente } from '@/modulos/clientes/modelo/cliente'

interface ErroresDireccion {
  etiqueta?: { message?: string }
  ubigeo?: { message?: string }
  direccion?: { message?: string }
  referencia?: { message?: string }
  principal?: { message?: string }
}

interface Props {
  field: FieldArrayWithId<DatosCliente, 'direccionesEntrega', 'fieldKey'>
  index: number
  abierta: boolean
  errores?: ErroresDireccion
  register: UseFormRegister<DatosCliente>
  getValues: UseFormGetValues<DatosCliente>
  setValue: UseFormSetValue<DatosCliente>
  clearErrors: UseFormClearErrors<DatosCliente>
  alAlternar: () => void
  alQuitar: () => void
}

export function DireccionEntregaCard({ field, index, abierta, errores, register, getValues, setValue, clearErrors, alAlternar, alQuitar }: Props) {
  const prefijo = `direccionesEntrega.${index}` as const
  const limpiarErrores = () => clearErrors('direccionesEntrega')
  const registrar = (campo: 'etiqueta' | 'ubigeo' | 'direccion' | 'referencia') => register(`${prefijo}.${campo}`, { onChange: limpiarErrores })
  const titulo = field.etiqueta?.trim() || `Dirección ${index + 1}`
  const tieneErrores = Boolean(errores && Object.keys(errores).length)

  return <article className={`border ${tieneErrores ? 'border-destructive/60' : 'border-border'}`} data-address-index={index}>
    <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/35" aria-expanded={abierta} aria-controls={`cliente-direccion-panel-${index}`} data-address-toggle onClick={alAlternar}>
      <span className="min-w-0"><strong className="block truncate text-sm">{titulo}</strong><span className="text-xs text-muted-foreground">{field.direccion?.trim() || 'Completa la dirección de entrega'}</span></span>
      <ChevronDown className={`size-4 shrink-0 transition-transform ${abierta ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
    <div id={`cliente-direccion-panel-${index}`} hidden={!abierta} className="grid gap-3 border-t px-4 py-4 sm:grid-cols-2">
      <Campo label="Etiqueta" error={errores?.etiqueta?.message} errorId={`cliente-direccion-${index}-etiqueta-error`}><input className="field-control" placeholder="Ej. Almacén principal" aria-invalid={Boolean(errores?.etiqueta)} aria-describedby={errores?.etiqueta ? `cliente-direccion-${index}-etiqueta-error` : undefined} {...registrar('etiqueta')} /></Campo>
      <Campo label="Ubigeo" error={errores?.ubigeo?.message} errorId={`cliente-direccion-${index}-ubigeo-error`}><input inputMode="numeric" maxLength={6} className="field-control" aria-invalid={Boolean(errores?.ubigeo)} aria-describedby={errores?.ubigeo ? `cliente-direccion-${index}-ubigeo-error` : undefined} {...registrar('ubigeo')} /></Campo>
      <Campo label="Dirección *" error={errores?.direccion?.message} errorId={`cliente-direccion-${index}-direccion-error`} ancho><input className="field-control" aria-invalid={Boolean(errores?.direccion)} aria-describedby={errores?.direccion ? `cliente-direccion-${index}-direccion-error` : undefined} {...registrar('direccion')} /></Campo>
      <Campo label="Referencia" error={errores?.referencia?.message} errorId={`cliente-direccion-${index}-referencia-error`} ancho><input className="field-control" aria-invalid={Boolean(errores?.referencia)} aria-describedby={errores?.referencia ? `cliente-direccion-${index}-referencia-error` : undefined} {...registrar('referencia')} /></Campo>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register(`${prefijo}.principal`, { onChange: (evento) => {
        if (evento.target.checked) {
          getValues('direccionesEntrega').forEach((_, posicion) => {
            setValue(`direccionesEntrega.${posicion}.principal`, posicion === index, { shouldDirty: true, shouldValidate: true })
          })
        }
        limpiarErrores()
      } })} /> Dirección principal</label>
      <Button type="button" variant="ghost" className="justify-self-end" onClick={alQuitar}><Trash2 /> Quitar</Button>
    </div>
  </article>
}

function Campo({ label, error, errorId, ancho, children }: { label: string; error?: string; errorId?: string; ancho?: boolean; children: ReactNode }) { return <div className={ancho ? 'sm:col-span-2' : ''}><label><span className="field-label">{label}</span>{children}</label>{error ? <span id={errorId} role="alert" className="field-error">{error}</span> : null}</div> }
