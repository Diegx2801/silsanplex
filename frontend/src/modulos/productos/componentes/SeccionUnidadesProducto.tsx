import { Plus, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { type Control, type FieldErrors, type UseFormRegister, useFieldArray, useWatch } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import type { DatosProducto, UnidadMedida } from '@/modulos/productos/modelo/producto'

interface Props {
  control: Control<DatosProducto>
  register: UseFormRegister<DatosProducto>
  errors: FieldErrors<DatosProducto>
  unidades: UnidadMedida[]
  nombreBaseOriginal?: string
  editable: boolean
  comprobando: boolean
  errorConsulta: boolean
  alReintentar: () => void
}

export function SeccionUnidadesProducto({ control, register, errors, unidades, nombreBaseOriginal, editable, comprobando, errorConsulta, alReintentar }: Props) {
  const id = useId()
  const tipo = useWatch({ control, name: 'tipo' })
  const baseId = useWatch({ control, name: 'unidadBaseId' })
  const alternativas = useWatch({ control, name: 'unidadesAlternativas' })
  const { fields, append, remove } = useFieldArray({ control, name: 'unidadesAlternativas' })
  const base = unidades.find((unidad) => unidad.id === baseId)?.nombre ?? nombreBaseOriginal ?? 'unidad base'
  const ayudaBase = comprobando
    ? 'Comprobando el historial antes de permitir cambios.'
    : errorConsulta
      ? 'No se pudo comprobar el historial. Puedes guardar los demás campos conservando esta unidad.'
      : !editable
        ? 'No puede cambiarse: este producto tiene historial de inventario o reservas activas.'
        : 'Unidad en la que se guarda el stock. No tiene que ser “Unidad”: usa Caja si controlas cajas completas.'

  return <section className="border-t px-5 py-6 sm:px-7">
    <h2 className="mb-4 font-semibold">Unidades de medida</h2>
    <div className="grid gap-5 sm:grid-cols-2">
      <div>
        <label htmlFor={`${id}-base`} className="field-label">Unidad base *</label>
        {editable ? <select id={`${id}-base`} className="field-control" aria-invalid={Boolean(errors.unidadBaseId)} aria-describedby={`${id}-base-ayuda`} {...register('unidadBaseId')}>
          <option value="">Seleccionar unidad</option>
          {unidades.map((unidad) => <option key={unidad.id} value={unidad.id}>{unidad.nombre}</option>)}
        </select> : <>
          <input type="hidden" {...register('unidadBaseId')} />
          <input id={`${id}-base`} className="field-control" readOnly value={base} aria-describedby={`${id}-base-ayuda`} />
        </>}
        <p id={`${id}-base-ayuda`} className={errors.unidadBaseId ? 'field-error' : 'field-help'}>{errors.unidadBaseId?.message ?? ayudaBase}</p>
        {errorConsulta ? <Button type="button" variant="ghost" size="sm" onClick={alReintentar}>Reintentar comprobación</Button> : null}
      </div>
    </div>
    {tipo === 'good' ? <div className="mt-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div><h3 className="text-sm font-medium">Unidades alternativas (opcional)</h3><p className="mt-1 text-sm text-muted-foreground">Permiten registrar el mismo stock en otras unidades. Define cuántas unidades base contiene cada una.</p></div>
        <Button type="button" variant="outline" size="sm" aria-label="Agregar unidad alternativa" disabled={!baseId || fields.length >= 12} onClick={() => append({ unidadId: '', unidadNombre: '', equivalencia: '', codigoBarras: '', precioVenta: '' })}><Plus aria-hidden="true" className="size-4" />Agregar</Button>
      </div>
      {fields.length > 0 ? <div className="space-y-4">{fields.map((field, indice) => {
        const valores = alternativas?.[indice]
        const alternativa = unidades.find((unidad) => unidad.id === valores?.unidadId)?.nombre
        const error = errors.unidadesAlternativas?.[indice]
        const filaId = `${id}-${field.id}`
        return <div key={field.id} className="rounded-md border p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <div><label htmlFor={`${filaId}-unidad`} className="field-label">Unidad alternativa *</label><select id={`${filaId}-unidad`} className="field-control" aria-invalid={Boolean(error?.unidadId)} aria-describedby={error?.unidadId ? `${filaId}-unidad-error` : undefined} {...register(`unidadesAlternativas.${indice}.unidadId`)}><option value="">Seleccionar</option>{unidades.filter((unidad) => unidad.id !== baseId).map((unidad) => <option key={unidad.id} value={unidad.id}>{unidad.nombre}</option>)}</select>{error?.unidadId ? <p id={`${filaId}-unidad-error`} className="field-error">{error.unidadId.message}</p> : null}</div>
            <div><label htmlFor={`${filaId}-factor`} className="field-label">Cantidad de {base} *</label><input id={`${filaId}-factor`} className="field-control" inputMode="decimal" placeholder="Ej. 20" aria-invalid={Boolean(error?.equivalencia)} aria-describedby={error?.equivalencia ? `${filaId}-factor-error` : `${filaId}-equivalencia`} {...register(`unidadesAlternativas.${indice}.equivalencia`)} />{error?.equivalencia ? <p id={`${filaId}-factor-error`} className="field-error">{error.equivalencia.message}</p> : null}</div>
            <div><label htmlFor={`${filaId}-barcode`} className="field-label">Código de barras</label><input id={`${filaId}-barcode`} className="field-control" placeholder="Opcional" aria-invalid={Boolean(error?.codigoBarras)} aria-describedby={error?.codigoBarras ? `${filaId}-barcode-error` : undefined} {...register(`unidadesAlternativas.${indice}.codigoBarras`)} />{error?.codigoBarras ? <p id={`${filaId}-barcode-error`} className="field-error">{error.codigoBarras.message}</p> : null}</div>
            <Button type="button" variant="ghost" size="icon" className="sm:mt-6" aria-label={`Eliminar unidad alternativa ${indice + 1}`} onClick={() => remove(indice)}><Trash2 aria-hidden="true" className="size-4" /></Button>
          </div>
          <p id={`${filaId}-equivalencia`} className="mt-3 text-sm text-muted-foreground">{alternativa && valores?.equivalencia ? `1 ${alternativa} = ${valores.equivalencia} × ${base}` : 'Selecciona la unidad alternativa e indica su contenido en unidades base.'}</p>
        </div>
      })}</div> : null}
      {errors.unidadesAlternativas?.root?.message ? <p role="alert" className="field-error">{errors.unidadesAlternativas.root.message}</p> : null}
    </div> : null}
  </section>
}
