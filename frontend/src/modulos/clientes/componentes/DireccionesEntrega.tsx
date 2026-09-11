import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FieldErrors, UseFieldArrayReturn, UseFormClearErrors, UseFormGetValues, UseFormRegister, UseFormSetValue } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import type { DatosCliente } from '@/modulos/clientes/modelo/cliente'
import { DireccionEntregaCard } from './DireccionEntregaCard'

interface Props {
  fieldArray: UseFieldArrayReturn<DatosCliente, 'direccionesEntrega', 'fieldKey'>
  errors: FieldErrors<DatosCliente>
  register: UseFormRegister<DatosCliente>
  getValues: UseFormGetValues<DatosCliente>
  setValue: UseFormSetValue<DatosCliente>
  clearErrors: UseFormClearErrors<DatosCliente>
}

export function DireccionesEntrega({ fieldArray, errors, register, getValues, setValue, clearErrors }: Props) {
  const { fields, append, remove } = fieldArray
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({})
  const cantidadAnterior = useRef(fields.length)
  const erroresDirecciones = errors.direccionesEntrega

  useEffect(() => {
    setAbiertas((actuales) => {
      const siguiente = { ...actuales }
      fields.forEach((field, index) => {
        if (erroresDirecciones?.[index]) siguiente[field.fieldKey] = true
      })
      Object.keys(siguiente).forEach((key) => { if (!fields.some((field) => field.fieldKey === key)) delete siguiente[key] })
      return siguiente
    })
  }, [fields, erroresDirecciones])

  useEffect(() => {
    if (fields.length > cantidadAnterior.current && fields.at(-1)) {
      const ultimo = fields.at(-1)
      if (ultimo) setAbiertas((actuales) => ({ ...actuales, [ultimo.fieldKey]: true }))
    }
    cantidadAnterior.current = fields.length
  }, [fields])

  const agregar = () => {
    if (fields.length >= 20) return
    append({ etiqueta: '', direccion: '', ubigeo: '', referencia: '', principal: fields.length === 0 })
    clearErrors('direccionesEntrega')
  }

  return <fieldset className="space-y-3 border-t pt-5 sm:col-span-2"><legend className="font-semibold">Direcciones de entrega</legend><div className="flex justify-end"><Button type="button" variant="outline" onClick={agregar} disabled={fields.length >= 20}><Plus /> Agregar</Button></div><p className="text-sm text-muted-foreground">Registra hasta 20 direcciones. La principal se usará como destino predeterminado.</p>
    {fields.length === 0 ? <p className="border border-dashed px-4 py-4 text-sm text-muted-foreground">Sin direcciones adicionales.</p> : <div className="space-y-2">{fields.map((field, index) => <DireccionEntregaCard key={field.fieldKey} field={field} index={index} abierta={Boolean(abiertas[field.fieldKey])} errores={erroresDirecciones?.[index] as { etiqueta?: { message?: string }; ubigeo?: { message?: string }; direccion?: { message?: string }; referencia?: { message?: string }; principal?: { message?: string } } | undefined} register={register} getValues={getValues} setValue={setValue} clearErrors={clearErrors} alAlternar={() => setAbiertas((actuales) => ({ ...actuales, [field.fieldKey]: !actuales[field.fieldKey] }))} alQuitar={() => { remove(index); clearErrors('direccionesEntrega') }} />)}</div>}
    {erroresDirecciones?.root?.message ? <p role="alert" className="field-error">{erroresDirecciones.root.message}</p> : null}
  </fieldset>
}
