import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { condicionesDomicilio, esquemaDatosCliente, tiposDocumentoCliente, type Cliente, type DatosCliente } from '@/modulos/clientes/modelo/cliente'
import type { ResultadoConsultaRuc } from '@/modulos/clientes/servicios/rucLookupService'

const inicial: DatosCliente = { tipoDocumento: 'ruc', numeroDocumento: '', nombreRazonSocial: '', nombreComercial: '', contacto: '', email: '', telefono: '', direccion: '', ubigeo: '', estadoSunat: '', condicionDomicilio: '', fuenteDatosFiscales: '', fechaConsultaSunat: null, direccionesEntrega: [], activo: true }

interface Props { abierto: boolean; cliente: Cliente | null; alCambiarApertura: (abierto: boolean) => void; alGuardar: (datos: DatosCliente, clienteId?: string) => Promise<void>; alConsultarRuc: (ruc: string) => Promise<ResultadoConsultaRuc>; alRestaurarFoco: () => void }

export function DialogoCliente({ abierto, cliente, alCambiarApertura, alGuardar, alConsultarRuc, alRestaurarFoco }: Props) {
  const { register, control, handleSubmit, setError, setValue, getValues, clearErrors, formState: { errors, isSubmitting } } = useForm<DatosCliente>({ resolver: zodResolver(esquemaDatosCliente), defaultValues: cliente ?? inicial })
  const direcciones = useFieldArray({ control, name: 'direccionesEntrega' })
  const tipoDocumento = useWatch({ control, name: 'tipoDocumento' })
  const fuenteFiscal = useWatch({ control, name: 'fuenteDatosFiscales' })
  const fechaConsulta = useWatch({ control, name: 'fechaConsultaSunat' })
  const [consultandoRuc, setConsultandoRuc] = useState(false)
  const [mensajeRuc, setMensajeRuc] = useState('')
  useEffect(() => {
    register('direccionFiscalId')
    register('contactoPrincipalId')
    register('fuenteDatosFiscales')
    register('fechaConsultaSunat')
  }, [register])
  const limpiarProcedenciaFiscal = () => {
    setValue('fuenteDatosFiscales', '')
    setValue('fechaConsultaSunat', null)
    setMensajeRuc('')
  }
  const consultar = async () => {
    const ruc = getValues('numeroDocumento').trim()
    if (!/^\d{11}$/.test(ruc)) {
      setError('numeroDocumento', { message: 'El RUC debe contener 11 dígitos' })
      return
    }
    clearErrors('numeroDocumento')
    setConsultandoRuc(true)
    setMensajeRuc('')
    try {
      const resultado = await alConsultarRuc(ruc)
      setValue('nombreRazonSocial', resultado.legalName, { shouldValidate: true, shouldDirty: true })
      setValue('direccion', resultado.fiscalAddress, { shouldValidate: true, shouldDirty: true })
      setValue('ubigeo', resultado.ubigeoCode, { shouldValidate: true, shouldDirty: true })
      setValue('estadoSunat', resultado.taxpayerStatus, { shouldValidate: true, shouldDirty: true })
      setValue(
        'condicionDomicilio',
        condicionesDomicilio.includes(resultado.domicileCondition as typeof condicionesDomicilio[number])
          ? resultado.domicileCondition as DatosCliente['condicionDomicilio']
          : '',
        { shouldValidate: true, shouldDirty: true },
      )
      setValue('fuenteDatosFiscales', resultado.source)
      setValue('fechaConsultaSunat', resultado.checkedAt)
      setMensajeRuc(`Datos tributarios consultados el ${new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(resultado.checkedAt))}.`)
    } catch (error) {
      setMensajeRuc(error instanceof Error ? error.message : 'No se pudo consultar el RUC. Completa los datos manualmente.')
    } finally {
      setConsultandoRuc(false)
    }
  }
  const guardar = async (datos: DatosCliente) => {
    try { await alGuardar(datos, cliente?.id); alCambiarApertura(false) }
    catch (error) { setError('root', { message: error instanceof Error ? error.message : 'No se pudo guardar el cliente.' }) }
  }
  return <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}><DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
    <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-50 max-h-[92svh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-background shadow-xl outline-none" onCloseAutoFocus={(e) => { e.preventDefault(); alRestaurarFoco() }}>
      <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7"><div><DialogPrimitive.Title className="text-xl font-semibold">{cliente ? 'Editar cliente' : 'Registrar cliente'}</DialogPrimitive.Title><DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">Datos fiscales, contacto y lugares de entrega.</DialogPrimitive.Description></div><DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar cliente" className="grid size-9 place-items-center rounded-md hover:bg-muted"><X className="size-5" /></button></DialogPrimitive.Close></header>
      <form id="formulario-cliente" className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-7" onSubmit={handleSubmit(guardar)}>
        <Campo label="Tipo de documento *">{cliente ? <><input className="field-control" value={tiposDocumentoCliente.find((item) => item.valor === tipoDocumento)?.etiqueta ?? tipoDocumento} readOnly /><input type="hidden" {...register('tipoDocumento')} /></> : <select className="field-control" {...register('tipoDocumento', { onChange: limpiarProcedenciaFiscal })}>{tiposDocumentoCliente.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}</select>}</Campo>
        <Campo label="Número de documento *" error={errors.numeroDocumento?.message}><div className="flex gap-2"><input autoFocus={!cliente} className="field-control" readOnly={Boolean(cliente)} {...register('numeroDocumento', { onChange: limpiarProcedenciaFiscal })} />{tipoDocumento === 'ruc' ? <Button type="button" variant="outline" disabled={consultandoRuc} onClick={() => void consultar()}>{consultandoRuc ? 'Consultando…' : cliente ? 'Actualizar SUNAT' : 'Consultar RUC'}</Button> : null}</div>{cliente ? <span className="mt-1 block text-xs text-muted-foreground">La identidad fiscal no se modifica. Registra otro cliente si el documento es distinto.</span> : null}</Campo>
        {mensajeRuc ? <p role="status" aria-live="polite" className="text-sm text-muted-foreground sm:col-span-2">{mensajeRuc}</p> : null}
        {fuenteFiscal ? <div className="border bg-muted/25 px-4 py-3 text-sm sm:col-span-2"><strong>Procedencia fiscal:</strong> {fuenteFiscal}{fechaConsulta ? ` · consultada ${new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(fechaConsulta))}` : ' · ingreso manual o importado'}</div> : null}
        <Campo label="Nombre o razón social *" error={errors.nombreRazonSocial?.message} ancho><input autoFocus={Boolean(cliente)} autoComplete="organization" className="field-control" {...register('nombreRazonSocial', { onChange: limpiarProcedenciaFiscal })} /></Campo>
        <Campo label="Nombre comercial" ancho><input className="field-control" {...register('nombreComercial')} /></Campo>
        <Campo label="Persona de contacto"><input autoComplete="name" className="field-control" {...register('contacto')} /></Campo>
        <Campo label="Teléfono"><input inputMode="tel" autoComplete="tel" className="field-control" {...register('telefono')} /></Campo>
        <Campo label="Correo" error={errors.email?.message} ancho><input type="email" autoComplete="email" className="field-control" {...register('email')} /></Campo>
        <Campo label="Dirección fiscal"><input autoComplete="street-address" className="field-control" {...register('direccion', { onChange: limpiarProcedenciaFiscal })} /></Campo>
        <Campo label="Ubigeo fiscal" error={errors.ubigeo?.message}><input inputMode="numeric" maxLength={6} className="field-control" {...register('ubigeo', { onChange: limpiarProcedenciaFiscal })} /></Campo>
        <Campo label="Estado SUNAT"><input className="field-control" placeholder="Ej. ACTIVO" {...register('estadoSunat', { onChange: limpiarProcedenciaFiscal })} /></Campo>
        <Campo label="Condición de domicilio"><select className="field-control" {...register('condicionDomicilio', { onChange: limpiarProcedenciaFiscal })}><option value="">Sin verificar</option>{condicionesDomicilio.map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <fieldset className="space-y-4 border-t pt-5 sm:col-span-2"><div className="flex items-center justify-between"><legend className="font-semibold">Direcciones de entrega</legend><Button type="button" variant="outline" onClick={() => direcciones.append({ etiqueta: '', direccion: '', ubigeo: '', referencia: '', principal: direcciones.fields.length === 0 })}><Plus /> Agregar</Button></div>
          {direcciones.fields.length === 0 ? <p className="text-sm text-muted-foreground">Sin direcciones adicionales.</p> : direcciones.fields.map((field, index) => <div key={field.id} className="grid gap-3 border p-4 sm:grid-cols-2">
            <Campo label="Etiqueta"><input className="field-control" placeholder="Ej. Almacén principal" {...register(`direccionesEntrega.${index}.etiqueta`)} /></Campo>
            <Campo label="Ubigeo" error={errors.direccionesEntrega?.[index]?.ubigeo?.message}><input inputMode="numeric" maxLength={6} className="field-control" {...register(`direccionesEntrega.${index}.ubigeo`)} /></Campo>
            <Campo label="Dirección *" error={errors.direccionesEntrega?.[index]?.direccion?.message} ancho><input className="field-control" {...register(`direccionesEntrega.${index}.direccion`)} /></Campo>
            <Campo label="Referencia" ancho><input className="field-control" {...register(`direccionesEntrega.${index}.referencia`)} /></Campo>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register(`direccionesEntrega.${index}.principal`)} /> Dirección principal</label>
            <Button type="button" variant="ghost" className="justify-self-end" onClick={() => direcciones.remove(index)}><Trash2 /> Quitar</Button>
          </div>)}
        </fieldset>
        <label className="flex gap-3 border-t pt-4 sm:col-span-2"><input type="checkbox" {...register('activo')} /><span><span className="block text-sm font-medium">Cliente activo</span><span className="text-sm text-muted-foreground">Disponible para nuevas operaciones comerciales.</span></span></label>
        {errors.root?.message ? <p role="alert" className="field-error sm:col-span-2">{errors.root.message}</p> : null}
      </form>
      <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7"><DialogPrimitive.Close asChild><Button type="button" variant="outline">Cancelar</Button></DialogPrimitive.Close><Button type="submit" form="formulario-cliente" disabled={isSubmitting}>{isSubmitting ? 'Guardando…' : cliente ? 'Guardar cambios' : 'Registrar cliente'}</Button></footer>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal></DialogPrimitive.Root>
}

function Campo({ label, error, ancho, children }: { label: string; error?: string; ancho?: boolean; children: ReactNode }) { return <label className={ancho ? 'sm:col-span-2' : ''}><span className="field-label">{label}</span>{children}{error ? <span className="field-error">{error}</span> : null}</label> }
