import { useFieldArray, type UseFormReturn } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import type { DatosReparacion } from '../modelo/reparacion'
import { accesorioInicial } from '../modelo/accesorios'

export function FormularioAccesoriosRecepcion({ formulario, bloqueado }: { formulario: UseFormReturn<DatosReparacion>; bloqueado: boolean }) {
  const { fields, append, remove } = useFieldArray({ control: formulario.control, name: 'accesorios' })
  const errores = formulario.formState.errors.accesorios
  return <fieldset disabled={bloqueado} className="mt-5 border-t pt-5">
    <legend className="pt-4 text-sm font-semibold">Accesorios recibidos</legend>
    <p className="mt-1 text-sm text-muted-foreground">Registra pertenencias del equipo. No generan stock ni reservas. Puedes dejar la lista vacía.</p>
    {fields.map((fila, indice) => <div key={fila.id} className="mt-4 grid gap-3 border p-4 sm:grid-cols-2" aria-label={`Accesorio ${indice + 1}`}>
      <div><label htmlFor={`accesorio-nombre-${indice}`} className="field-label">Accesorio {indice + 1} · Nombre *</label>
        <input id={`accesorio-nombre-${indice}`} className="field-control" maxLength={160} aria-invalid={Boolean(errores?.[indice]?.nombre)} {...formulario.register(`accesorios.${indice}.nombre`)} />
        {errores?.[indice]?.nombre ? <p role="alert" className="field-error">{errores[indice]?.nombre?.message}</p> : null}</div>
      <div><label htmlFor={`accesorio-cantidad-${indice}`} className="field-label">Accesorio {indice + 1} · Cantidad *</label>
        <input id={`accesorio-cantidad-${indice}`} className="field-control" type="number" step="1" aria-invalid={Boolean(errores?.[indice]?.cantidadRecibida)} {...formulario.register(`accesorios.${indice}.cantidadRecibida`, { valueAsNumber: true })} />
        {errores?.[indice]?.cantidadRecibida ? <p role="alert" className="field-error">{errores[indice]?.cantidadRecibida?.message}</p> : null}</div>
      <div><label htmlFor={`accesorio-condicion-${indice}`} className="field-label">Accesorio {indice + 1} · Condición</label>
        <input id={`accesorio-condicion-${indice}`} className="field-control" maxLength={500} {...formulario.register(`accesorios.${indice}.condicion`)} /></div>
      <div><label htmlFor={`accesorio-observaciones-${indice}`} className="field-label">Accesorio {indice + 1} · Observaciones</label>
        <input id={`accesorio-observaciones-${indice}`} className="field-control" maxLength={2000} {...formulario.register(`accesorios.${indice}.observaciones`)} /></div>
      <Button type="button" variant="outline" onClick={() => remove(indice)}>Quitar accesorio {indice + 1}</Button>
    </div>)}
    <Button type="button" variant="outline" className="mt-3" disabled={fields.length >= 100} onClick={() => append(accesorioInicial())}>Agregar accesorio</Button>
    {bloqueado ? <p className="field-help">La creación pendiente conserva su listado original hasta confirmar el reintento.</p> : null}
  </fieldset>
}
