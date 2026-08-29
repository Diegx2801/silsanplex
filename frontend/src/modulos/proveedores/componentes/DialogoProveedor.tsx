import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import type { ResultadoConsultaRuc } from '@/modulos/clientes/servicios/rucLookupService'
import { esquemaDatosProveedor, proveedorAFormulario, proveedorInicial, tiposDocumentoProveedor, type DatosProveedor, type Proveedor } from '@/modulos/proveedores/modelo/proveedor'

interface Props { abierto: boolean; proveedor: Proveedor | null; alCambiarApertura: (abierto: boolean) => void; alGuardar: (datos: DatosProveedor, proveedorId?: string) => Promise<void>; alConsultarRuc: (ruc: string) => Promise<ResultadoConsultaRuc>; alRestaurarFoco: () => void }

export function DialogoProveedor({ abierto, proveedor, alCambiarApertura, alGuardar, alConsultarRuc, alRestaurarFoco }: Props) {
  const { register, control, handleSubmit, setError, setValue, getValues, clearErrors, formState: { errors, isSubmitting } } = useForm<DatosProveedor>({ resolver: zodResolver(esquemaDatosProveedor), defaultValues: proveedor ? proveedorAFormulario(proveedor) : proveedorInicial })
  const tipoDocumento = useWatch({ control, name: 'tipoDocumento' })
  const condicionCredito = useWatch({ control, name: 'condicionCredito' })
  const fuenteFiscal = useWatch({ control, name: 'fuenteDatosFiscales' })
  const fechaConsulta = useWatch({ control, name: 'fechaConsultaSunat' })
  const [consultandoRuc, setConsultandoRuc] = useState(false)
  const [mensajeRuc, setMensajeRuc] = useState('')

  function limpiarProcedenciaFiscal() { setValue('fuenteDatosFiscales', ''); setValue('fechaConsultaSunat', null); setMensajeRuc('') }
  async function consultar() {
    const ruc = getValues('numeroDocumento').trim()
    if (!/^\d{11}$/.test(ruc)) { setError('numeroDocumento', { message: 'El RUC debe contener 11 dígitos' }); return }
    clearErrors('numeroDocumento'); setConsultandoRuc(true); setMensajeRuc('')
    try {
      const resultado = await alConsultarRuc(ruc)
      setValue('razonSocial', resultado.legalName, { shouldDirty: true, shouldValidate: true })
      setValue('direccion', resultado.fiscalAddress, { shouldDirty: true, shouldValidate: true })
      setValue('ubigeo', resultado.ubigeoCode, { shouldDirty: true, shouldValidate: true })
      setValue('estadoContribuyente', resultado.taxpayerStatus, { shouldDirty: true })
      setValue('condicionDomicilio', resultado.domicileCondition, { shouldDirty: true })
      setValue('fuenteDatosFiscales', resultado.source); setValue('fechaConsultaSunat', resultado.checkedAt)
      setMensajeRuc('Datos tributarios encontrados y aplicados al formulario.')
    } catch (error) { setMensajeRuc(error instanceof Error ? error.message : 'No se pudo consultar el RUC. Puedes completar los datos manualmente.') }
    finally { setConsultandoRuc(false) }
  }
  async function guardar(datos: DatosProveedor) { try { await alGuardar(datos, proveedor?.id); alCambiarApertura(false) } catch (error) { setError('root.server', { message: error instanceof Error ? error.message : 'No se pudo guardar el proveedor.' }) } }

  return <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}><DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
    <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-50 max-h-[92svh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-background shadow-xl outline-none" onCloseAutoFocus={(evento) => { evento.preventDefault(); alRestaurarFoco() }}>
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-background px-5 py-5 sm:px-7"><div><DialogPrimitive.Title className="text-xl font-semibold">{proveedor ? 'Editar proveedor' : 'Registrar proveedor'}</DialogPrimitive.Title><DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">Datos fiscales, contacto y condición comercial.</DialogPrimitive.Description></div><DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar proveedor" className="grid size-9 place-items-center rounded-md hover:bg-muted"><X className="size-5" /></button></DialogPrimitive.Close></header>
      <form id="formulario-proveedor" className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-7" onSubmit={handleSubmit(guardar)}>
        <Campo label="Tipo de documento *"><select disabled={Boolean(proveedor)} className="field-control" {...register('tipoDocumento', { onChange: limpiarProcedenciaFiscal })}>{tiposDocumentoProveedor.map((tipo) => <option key={tipo.valor} value={tipo.valor}>{tipo.etiqueta}</option>)}</select></Campo>
        <Campo label="Número de documento *" error={errors.numeroDocumento?.message}><div className="flex gap-2"><input autoFocus={!proveedor} readOnly={Boolean(proveedor)} className="field-control" {...register('numeroDocumento', { onChange: limpiarProcedenciaFiscal })} />{tipoDocumento === 'ruc' ? <Button type="button" variant="outline" disabled={consultandoRuc} onClick={() => void consultar()}>{consultandoRuc ? 'Consultando…' : proveedor ? 'Actualizar SUNAT' : 'Consultar RUC'}</Button> : null}</div>{proveedor ? <span className="mt-1 block text-xs text-muted-foreground">La identidad fiscal no se modifica.</span> : null}</Campo>
        {mensajeRuc ? <p role="status" className="text-sm text-muted-foreground sm:col-span-2">{mensajeRuc}</p> : null}
        {fuenteFiscal ? <div className="border bg-muted/25 px-4 py-3 text-sm sm:col-span-2"><strong>Procedencia fiscal:</strong> {fuenteFiscal}{fechaConsulta ? ` · ${new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(fechaConsulta))}` : ''}</div> : null}
        <Campo label="Razón social o nombre *" error={errors.razonSocial?.message} ancho><input autoFocus={Boolean(proveedor)} autoComplete="organization" className="field-control" {...register('razonSocial', { onChange: limpiarProcedenciaFiscal })} /></Campo>
        <Campo label="Nombre comercial" ancho><input className="field-control" {...register('nombreComercial')} /></Campo>
        <Campo label="Código interno" error={errors.codigo?.message}><input className="field-control uppercase" placeholder="Opcional" {...register('codigo')} /></Campo>
        <Campo label="Ubigeo fiscal" error={errors.ubigeo?.message}><input inputMode="numeric" maxLength={6} className="field-control" {...register('ubigeo', { onChange: limpiarProcedenciaFiscal })} /></Campo>
        <Campo label="Dirección fiscal" ancho><input autoComplete="street-address" className="field-control" {...register('direccion', { onChange: limpiarProcedenciaFiscal })} /></Campo>
        <Campo label="Estado SUNAT"><input className="field-control" placeholder="Ej. ACTIVO" {...register('estadoContribuyente', { onChange: limpiarProcedenciaFiscal })} /></Campo>
        <Campo label="Condición del domicilio"><input className="field-control" placeholder="Ej. HABIDO" {...register('condicionDomicilio', { onChange: limpiarProcedenciaFiscal })} /></Campo>
        <fieldset className="grid gap-5 border-t pt-5 sm:col-span-2 sm:grid-cols-2"><legend className="mb-4 font-semibold">Contacto principal</legend><Campo label="Persona de contacto"><input autoComplete="name" className="field-control" {...register('contacto')} /></Campo><Campo label="Cargo"><input className="field-control" {...register('cargoContacto')} /></Campo><Campo label="Teléfono"><input inputMode="tel" autoComplete="tel" className="field-control" {...register('telefono')} /></Campo><Campo label="Correo" error={errors.email?.message}><input type="email" autoComplete="email" className="field-control" {...register('email')} /></Campo></fieldset>
        <fieldset className="grid gap-5 border-t pt-5 sm:col-span-2 sm:grid-cols-2"><legend className="mb-4 font-semibold">Condición comercial</legend><Campo label="Condición de pago"><select className="field-control" {...register('condicionCredito', { onChange: (evento) => { if (evento.target.value === 'contado') setValue('diasCredito', '0', { shouldValidate: true }) } })}><option value="contado">Contado</option><option value="credito">Crédito</option></select></Campo><Campo label="Días de crédito" error={errors.diasCredito?.message}><input inputMode="numeric" disabled={condicionCredito === 'contado'} className="field-control disabled:bg-muted" {...register('diasCredito')} /></Campo></fieldset>
        <Campo label="Observaciones" ancho><textarea rows={3} className="field-control py-2" {...register('observaciones')} /></Campo>
        <label className="flex gap-3 border-t pt-4 sm:col-span-2"><input type="checkbox" {...register('activo')} /><span><span className="block text-sm font-medium">Proveedor activo</span><span className="text-sm text-muted-foreground">Disponible para nuevas operaciones de compra.</span></span></label>
        {errors.root?.server ? <p role="alert" className="field-error sm:col-span-2">{errors.root.server.message}</p> : null}
      </form>
      <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t bg-background px-5 py-4 sm:flex-row sm:justify-end sm:px-7"><DialogPrimitive.Close asChild><Button type="button" variant="outline">Cancelar</Button></DialogPrimitive.Close><Button type="submit" form="formulario-proveedor" disabled={isSubmitting}>{isSubmitting ? 'Guardando…' : proveedor ? 'Guardar cambios' : 'Registrar proveedor'}</Button></footer>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal></DialogPrimitive.Root>
}

function Campo({ label, error, ancho, children }: { label: string; error?: string; ancho?: boolean; children: ReactNode }) { return <label className={ancho ? 'sm:col-span-2' : ''}><span className="field-label">{label}</span>{children}{error ? <span className="field-error">{error}</span> : null}</label> }
