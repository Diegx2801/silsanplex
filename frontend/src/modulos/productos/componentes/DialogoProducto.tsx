import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { type ComponentProps, useEffect, useId, useRef } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { afectacionesIgv, esquemaProducto, productoInicial, type DatosProducto, type Producto, type UnidadMedida } from '@/modulos/productos/modelo/producto'

interface CampoTextoProps extends ComponentProps<'input'> { etiqueta: string; error?: string; ayuda?: string }
function CampoTexto({ etiqueta, error, ayuda, id: idRecibido, ...props }: CampoTextoProps) {
  const idGenerado = useId()
  const id = idRecibido ?? idGenerado
  const descripcionId = error || ayuda ? `${id}-descripcion` : undefined
  return <div><label htmlFor={id} className="field-label">{etiqueta}</label><input id={id} aria-describedby={descripcionId} aria-invalid={Boolean(error)} className="field-control" {...props} />{error ? <p id={descripcionId} className="field-error">{error}</p> : null}{!error && ayuda ? <p id={descripcionId} className="field-help">{ayuda}</p> : null}</div>
}

interface OpcionBinariaProps extends ComponentProps<'input'> { etiqueta: string; descripcion: string }
function OpcionBinaria({ etiqueta, descripcion, id: idRecibido, ...props }: OpcionBinariaProps) {
  const idGenerado = useId()
  const id = idRecibido ?? idGenerado
  return <label htmlFor={id} className="flex cursor-pointer items-start gap-3 border-t py-4 first:border-t-0"><input id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" {...props} /><span><span className="block text-sm font-medium">{etiqueta}</span><span className="mt-1 block text-sm leading-5 text-muted-foreground">{descripcion}</span></span></label>
}

interface DialogoProductoProps {
  abierto: boolean
  producto: Producto | null
  unidadesMedida: UnidadMedida[]
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosProducto, productoId?: string) => Promise<string | undefined>
  alRestaurarFoco: () => void
}

export function DialogoProducto({ abierto, producto, unidadesMedida, alCambiarApertura, alGuardar, alRestaurarFoco }: DialogoProductoProps) {
  const valores = producto ? { ...producto, sublinea: producto.sublinea ?? '', costo: producto.costo ?? '' } : { ...productoInicial }
  const { register, control, handleSubmit, setError, setValue, watch, formState: { errors, isSubmitting } } = useForm<DatosProducto>({ resolver: zodResolver(esquemaProducto), defaultValues: valores })
  const formularioRef = useRef<HTMLFormElement | null>(null)
  const { fields, append, remove } = useFieldArray({ control, name: 'unidadesAlternativas' })
  const tipo = watch('tipo')
  const unidadBaseId = watch('unidadBaseId')

  useEffect(() => {
    if (tipo === 'service') {
      setValue('controlLote', false)
      setValue('controlVencimiento', false)
    }
  }, [setValue, tipo])

  const guardar = async (datos: DatosProducto) => {
    const unidad = unidadesMedida.find((opcion) => opcion.id === datos.unidadBaseId)
    const error = await alGuardar({ ...datos, unidadMedida: unidad?.nombre ?? datos.unidadMedida }, producto?.id)
    if (error) {
      setError('root.server', { message: error })
      formularioRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    alCambiarApertura(false)
  }

  return <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" /><DialogPrimitive.Content className="fixed inset-0 z-50 m-auto flex h-dvh w-full flex-col bg-background shadow-xl outline-none sm:h-[min(90vh,860px)] sm:max-w-3xl sm:rounded-lg sm:border" onCloseAutoFocus={(evento) => { evento.preventDefault(); alRestaurarFoco() }}>
    <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7"><div><DialogPrimitive.Title className="text-xl font-semibold">{producto ? 'Editar producto' : 'Registrar producto'}</DialogPrimitive.Title><DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">Cada presentación con stock propio se registra como un SKU.</DialogPrimitive.Description></div><DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar formulario" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted"><X className="size-5" /></button></DialogPrimitive.Close></header>
    <form ref={formularioRef} id="formulario-producto" className="min-h-0 flex-1 overflow-y-auto" onSubmit={handleSubmit(guardar)}>
      <section className="px-5 py-6 sm:px-7">{errors.root?.server ? <div role="alert" className="mb-5 border border-destructive/35 bg-destructive/5 px-4 py-3 text-sm text-destructive"><p className="font-medium">No se pudo guardar el producto</p><p className="mt-1 text-muted-foreground">{errors.root.server.message}</p></div> : null}<div className="mb-5 border-b pb-3"><h2 className="font-semibold">Identificación</h2><p className="mt-1 text-sm text-muted-foreground">Solo SKU, nombre, tipo y unidad base son obligatorios.</p></div><div className="grid gap-5 sm:grid-cols-2">
        <CampoTexto etiqueta="SKU / código interno *" autoFocus placeholder="Ej. PARA-CJ20" error={errors.codigo?.message} {...register('codigo')} />
        <div><label htmlFor="tipo-producto" className="field-label">Tipo *</label><select id="tipo-producto" className="field-control" {...register('tipo')}><option value="good">Producto físico</option><option value="service">Servicio</option></select>{errors.tipo ? <p className="field-error">{errors.tipo.message}</p> : null}</div>
        <div className="sm:col-span-2"><CampoTexto etiqueta="Nombre o descripción *" placeholder="Ej. Paracetamol 500 mg" error={errors.descripcion?.message} {...register('descripcion')} /></div>
        <CampoTexto etiqueta="Presentación" placeholder="Ej. Caja x 20 tabletas" error={errors.presentacion?.message} {...register('presentacion')} />
        <div><label htmlFor="unidad-base" className="field-label">Unidad base *</label><select id="unidad-base" className="field-control" aria-invalid={Boolean(errors.unidadBaseId)} {...register('unidadBaseId')}><option value="">Seleccionar unidad</option>{unidadesMedida.map((unidad) => <option key={unidad.id} value={unidad.id}>{unidad.nombre}</option>)}</select>{errors.unidadBaseId ? <p className="field-error">{errors.unidadBaseId.message}</p> : <p className="field-help">Unidad mínima utilizada para controlar el stock.</p>}</div>
        <CampoTexto etiqueta="Código de barras" placeholder="Opcional" error={errors.codigoBarras?.message} {...register('codigoBarras')} />
      </div></section>
      <section className="border-t px-5 py-6 sm:px-7"><div className="mb-5"><h2 className="font-semibold">Clasificación</h2><p className="mt-1 text-sm text-muted-foreground">Campos opcionales para ordenar el catálogo.</p></div><div className="grid gap-5 sm:grid-cols-2"><CampoTexto etiqueta="Línea" placeholder="Ej. Medicamentos" error={errors.categoria?.message} {...register('categoria')} /><CampoTexto etiqueta="Sublínea" placeholder="Ej. Analgésicos" error={errors.sublinea?.message} {...register('sublinea')} /><CampoTexto etiqueta="Marca o laboratorio" error={errors.laboratorio?.message} {...register('laboratorio')} /><CampoTexto etiqueta="Registro sanitario" error={errors.registroSanitario?.message} {...register('registroSanitario')} /></div></section>
      <section className="border-t px-5 py-6 sm:px-7"><div className="mb-5"><h2 className="font-semibold">Información comercial</h2><p className="mt-1 text-sm text-muted-foreground">El costo real se determinará desde Compras.</p></div><div className="grid gap-5 sm:grid-cols-2"><CampoTexto etiqueta="Precio de venta base (S/)" inputMode="decimal" placeholder="0.00" error={errors.precioVenta?.message} {...register('precioVenta')} /><div><label htmlFor="afectacion-igv" className="field-label">Afectación de IGV</label><select id="afectacion-igv" className="field-control" {...register('afectacionIgv')}>{afectacionesIgv.map((opcion) => <option key={opcion.valor || 'sin-definir'} value={opcion.valor}>{opcion.etiqueta}</option>)}</select></div></div></section>
      {tipo === 'good' ? <section className="border-t px-5 py-6 sm:px-7"><div className="mb-4 flex items-start justify-between gap-4"><div><h2 className="font-semibold">Unidades alternativas</h2><p className="mt-1 text-sm text-muted-foreground">Ejemplo: 1 caja equivale a 20 unidades base.</p></div><Button type="button" variant="outline" size="sm" onClick={() => append({ unidadId: '', unidadNombre: '', equivalencia: '', codigoBarras: '', precioVenta: '' })}><Plus className="size-4" /> Agregar</Button></div>{fields.length === 0 ? <p className="text-sm text-muted-foreground">Sin unidades alternativas.</p> : <div className="space-y-4">{fields.map((field, indice) => <div key={field.id} className="grid gap-3 rounded-md border p-4 sm:grid-cols-[1fr_0.8fr_1fr_auto]"><div><label className="field-label">Unidad</label><select className="field-control" {...register(`unidadesAlternativas.${indice}.unidadId`)}><option value="">Seleccionar</option>{unidadesMedida.filter((unidad) => unidad.id !== unidadBaseId).map((unidad) => <option key={unidad.id} value={unidad.id}>{unidad.nombre}</option>)}</select>{errors.unidadesAlternativas?.[indice]?.unidadId ? <p className="field-error">{errors.unidadesAlternativas[indice]?.unidadId?.message}</p> : null}</div><CampoTexto etiqueta="Equivalencia" inputMode="decimal" placeholder="Ej. 20" error={errors.unidadesAlternativas?.[indice]?.equivalencia?.message} {...register(`unidadesAlternativas.${indice}.equivalencia`)} /><CampoTexto etiqueta="Código de barras" placeholder="Opcional" error={errors.unidadesAlternativas?.[indice]?.codigoBarras?.message} {...register(`unidadesAlternativas.${indice}.codigoBarras`)} /><Button type="button" variant="ghost" size="icon" className="mt-6" aria-label="Eliminar unidad alternativa" onClick={() => remove(indice)}><Trash2 className="size-4" /></Button></div>)}</div>}</section> : null}
      <section className="border-t px-5 py-6 sm:px-7"><h2 className="mb-2 font-semibold">Control operativo</h2>{tipo === 'good' ? <><OpcionBinaria etiqueta="Controlar por lote" descripcion="Solicita lote al ingresar inventario." {...register('controlLote')} /><OpcionBinaria etiqueta="Controlar vencimiento" descripcion="Solicita vencimiento en las entradas." {...register('controlVencimiento')} /><OpcionBinaria etiqueta="Venta con receta" descripcion="Marca esta condición comercial." {...register('ventaReceta')} /></> : <p className="py-3 text-sm text-muted-foreground">Los servicios no generan stock, lotes ni vencimientos.</p>}<OpcionBinaria etiqueta="Activo" descripcion="Permite usar este registro en operaciones nuevas." {...register('activo')} /></section>
    </form>
    <footer className="flex flex-col-reverse gap-3 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7"><DialogPrimitive.Close asChild><Button type="button" variant="outline" size="lg">Cancelar</Button></DialogPrimitive.Close><Button type="submit" form="formulario-producto" size="lg" disabled={isSubmitting}>{isSubmitting ? 'Guardando…' : producto ? 'Guardar cambios' : 'Registrar producto'}</Button></footer>
  </DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>
}
