import { Pencil, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { tiposDocumentoProveedor, type Proveedor } from '@/modulos/proveedores/modelo/proveedor'

interface Props {
  abierto: boolean
  proveedor: Proveedor
  puedeGestionar: boolean
  alEditar: () => void
  alCambiarEstado: () => void
  alCambiarApertura: (abierto: boolean) => void
  alRestaurarFoco: () => void
}

const documentos = new Map(tiposDocumentoProveedor.map((item) => [item.valor, item.etiqueta]))
const valor = (dato: string) => dato || 'Sin registrar'

export function DetalleProveedor({ abierto, proveedor, puedeGestionar, alEditar, alCambiarEstado, alCambiarApertura, alRestaurarFoco }: Props) {
  return <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}><DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
    <DialogPrimitive.Content className="fixed start-1/2 top-1/2 z-50 max-h-[92svh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-background shadow-xl outline-none" onCloseAutoFocus={(evento) => { evento.preventDefault(); alRestaurarFoco() }}>
      <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7"><div><p className="font-mono text-xs text-primary">{documentos.get(proveedor.tipoDocumento)} {proveedor.numeroDocumento}</p><DialogPrimitive.Title className="mt-2 text-2xl font-semibold">{proveedor.razonSocial}</DialogPrimitive.Title><DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">Ficha fiscal y comercial del proveedor.</DialogPrimitive.Description></div><div className="flex items-center gap-3"><span className="status-label" data-tone={proveedor.activo ? 'listo' : 'revision'}>{proveedor.activo ? 'Activo' : 'Inactivo'}</span><DialogPrimitive.Close asChild><button type="button" aria-label="Cerrar detalle" className="grid size-9 place-items-center rounded-md hover:bg-muted"><X className="size-5" /></button></DialogPrimitive.Close></div></header>
      <div className="space-y-6 px-5 py-6 sm:px-7">
        <Seccion titulo="Identidad fiscal"><Dato etiqueta="Código interno" contenido={valor(proveedor.codigo)} /><Dato etiqueta="Nombre comercial" contenido={valor(proveedor.nombreComercial)} /><Dato etiqueta="Estado SUNAT" contenido={valor(proveedor.estadoContribuyente)} /><Dato etiqueta="Condición del domicilio" contenido={valor(proveedor.condicionDomicilio)} /><Dato etiqueta="Dirección fiscal" contenido={valor(proveedor.direccion)} /><Dato etiqueta="Ubigeo" contenido={valor(proveedor.ubigeo)} /></Seccion>
        <Seccion titulo="Contacto principal"><Dato etiqueta="Persona" contenido={valor(proveedor.contacto)} /><Dato etiqueta="Cargo" contenido={valor(proveedor.cargoContacto)} /><Dato etiqueta="Teléfono" contenido={valor(proveedor.telefono)} /><Dato etiqueta="Correo" contenido={valor(proveedor.email)} /></Seccion>
        <Seccion titulo="Condición comercial"><Dato etiqueta="Forma de pago" contenido={proveedor.condicionCredito === 'contado' ? 'Contado' : 'Crédito'} /><Dato etiqueta="Plazo" contenido={proveedor.condicionCredito === 'contado' ? 'Pago inmediato' : `${proveedor.diasCredito} días`} /><Dato etiqueta="Fuente fiscal" contenido={valor(proveedor.fuenteDatosFiscales)} /><Dato etiqueta="Última consulta" contenido={proveedor.fechaConsultaSunat ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(proveedor.fechaConsultaSunat)) : 'Sin consultar'} /></Seccion>
        {proveedor.observaciones ? <section className="border-t pt-5"><h2 className="font-semibold">Observaciones</h2><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{proveedor.observaciones}</p></section> : null}
      </div>
      {puedeGestionar ? <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7"><Button type="button" variant="outline" onClick={alCambiarEstado}>{proveedor.activo ? 'Desactivar' : 'Activar'}</Button><Button type="button" onClick={alEditar}><Pencil /> Editar</Button></footer> : null}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal></DialogPrimitive.Root>
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) { return <section><h2 className="border-b pb-3 font-semibold">{titulo}</h2><dl className="mt-4 grid gap-5 sm:grid-cols-2">{children}</dl></section> }
function Dato({ etiqueta, contenido }: { etiqueta: string; contenido: string }) { return <div><dt className="font-mono text-[0.68rem] uppercase text-muted-foreground">{etiqueta}</dt><dd className="mt-1 text-sm">{contenido}</dd></div> }
