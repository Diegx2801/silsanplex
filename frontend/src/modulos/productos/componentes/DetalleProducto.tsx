import {
  Barcode,
  Boxes,
  Building2,
  CirclePower,
  Pencil,
  ReceiptText,
  ShieldCheck,
  Tag,
  X,
} from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  afectacionesIgv,
  type Producto,
} from '@/modulos/productos/modelo/producto'

const formatoMoneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

interface DatoProductoProps {
  etiqueta: string
  valor: ReactNode
}

function DatoProducto({ etiqueta, valor }: DatoProductoProps) {
  return (
    <div className="border-t py-4 first:border-t-0">
      <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">
        {etiqueta}
      </dt>
      <dd className="mt-1.5 text-sm leading-6">{valor}</dd>
    </div>
  )
}

function mostrarValor(valor: string) {
  return valor || 'Sin definir'
}

function mostrarPrecio(precio: string) {
  return precio ? formatoMoneda.format(Number(precio)) : 'Sin definir'
}

function mostrarAfectacionIgv(valor: Producto['afectacionIgv']) {
  return (
    afectacionesIgv.find((opcion) => opcion.valor === valor)?.etiqueta ??
    'Sin definir'
  )
}

interface DetalleProductoProps {
  abierto: boolean
  producto: Producto
  alCambiarApertura: (abierto: boolean) => void
  alEditar?: () => void
  alSolicitarCambioEstado?: (
    evento: ReactMouseEvent<HTMLButtonElement>,
  ) => void
  alRestaurarFoco: () => void
}

export function DetalleProducto({
  abierto,
  producto,
  alCambiarApertura,
  alEditar,
  alSolicitarCambioEstado,
  alRestaurarFoco,
}: DetalleProductoProps) {
  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 end-0 z-50 flex w-full max-w-xl flex-col border-s bg-background shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <div className="flex items-center justify-between gap-4 border-b bg-muted/45 px-5 py-3 sm:px-7">
            <span className="font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">
              Ficha de catálogo / {producto.codigo}
            </span>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar detalle"
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </div>

          <header className="border-b px-5 py-6 sm:px-7">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-2xl font-semibold tracking-[-0.03em] text-balance">
                  {producto.descripcion}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                  Información registrada para identificación, venta y control
                  operativo del producto.
                </DialogPrimitive.Description>
              </div>
              <span
                className="status-label"
                data-tone={producto.activo ? 'listo' : 'revision'}
              >
                {producto.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <section aria-labelledby="detalle-identificacion" className="px-5 py-6 sm:px-7">
              <h2
                id="detalle-identificacion"
                className="flex items-center gap-2 font-semibold"
              >
                <Barcode aria-hidden="true" className="size-4 text-primary" />
                Identificación
              </h2>
              <dl className="mt-4 grid sm:grid-cols-2 sm:gap-x-6">
                <DatoProducto etiqueta="Código interno" valor={producto.codigo} />
                <DatoProducto
                  etiqueta="Código de barras"
                  valor={mostrarValor(producto.codigoBarras)}
                />
                <DatoProducto
                  etiqueta="Línea"
                  valor={
                    <span className="inline-flex items-center gap-2">
                      <Tag aria-hidden="true" className="size-3.5 text-muted-foreground" />
                      {mostrarValor(producto.categoria)}
                    </span>
                  }
                />
                <DatoProducto
                  etiqueta="Sublínea"
                  valor={mostrarValor(producto.sublinea ?? '')}
                />
                <DatoProducto
                  etiqueta="Marca"
                  valor={
                    <span className="inline-flex items-center gap-2">
                      <Building2
                        aria-hidden="true"
                        className="size-3.5 text-muted-foreground"
                      />
                      {mostrarValor(producto.laboratorio)}
                    </span>
                  }
                />
                <DatoProducto
                  etiqueta="Presentación"
                  valor={mostrarValor(producto.presentacion)}
                />
                <DatoProducto
                  etiqueta="Unidad de medida"
                  valor={mostrarValor(producto.unidadMedida)}
                />
              </dl>
            </section>

            <section
              aria-labelledby="detalle-comercial"
              className="border-t px-5 py-6 sm:px-7"
            >
              <h2
                id="detalle-comercial"
                className="flex items-center gap-2 font-semibold"
              >
                <ReceiptText aria-hidden="true" className="size-4 text-primary" />
                Información comercial y sanitaria
              </h2>
              <dl className="mt-4 grid sm:grid-cols-2 sm:gap-x-6">
                <DatoProducto
                  etiqueta="Costo base"
                  valor={
                    <span className="font-mono text-xs tabular-nums">
                      {mostrarPrecio(producto.costo ?? '')}
                    </span>
                  }
                />
                <DatoProducto
                  etiqueta="Precio de venta base"
                  valor={
                    <span className="font-mono text-xs tabular-nums">
                      {mostrarPrecio(producto.precioVenta)}
                    </span>
                  }
                />
                <DatoProducto
                  etiqueta="Afectación de IGV"
                  valor={mostrarAfectacionIgv(producto.afectacionIgv)}
                />
                <DatoProducto
                  etiqueta="Registro sanitario"
                  valor={mostrarValor(producto.registroSanitario)}
                />
              </dl>
            </section>

            <section
              aria-labelledby="detalle-control"
              className="border-t px-5 py-6 sm:px-7"
            >
              <h2
                id="detalle-control"
                className="flex items-center gap-2 font-semibold"
              >
                <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
                Control operativo
              </h2>
              <dl className="mt-4 grid sm:grid-cols-2 sm:gap-x-6">
                <DatoProducto
                  etiqueta="Control por lote"
                  valor={producto.controlLote ? 'Sí' : 'No'}
                />
                <DatoProducto
                  etiqueta="Venta con receta"
                  valor={producto.ventaReceta ? 'Sí' : 'No'}
                />
              </dl>
              <div className="mt-2 flex items-start gap-3 border bg-muted/35 p-4 text-sm leading-6 text-muted-foreground">
                <Boxes aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                <p>
                  {producto.controlLote
                    ? 'Este producto está preparado para registrar lotes y fechas de vencimiento.'
                    : 'Este producto no requiere seguimiento por lote en su configuración actual.'}
                </p>
              </div>
            </section>
          </div>

          {alEditar && alSolicitarCambioEstado ? <footer className="grid grid-cols-2 gap-2 border-t bg-background px-5 py-4 sm:flex sm:justify-end sm:px-7">
            <Button type="button" variant="outline" size="lg" onClick={alEditar}>
              <Pencil aria-hidden="true" />
              Editar
            </Button>
            <Button
              type="button"
              variant={producto.activo ? 'destructive' : 'default'}
              size="lg"
              onClick={alSolicitarCambioEstado}
            >
              <CirclePower aria-hidden="true" />
              {producto.activo ? 'Desactivar' : 'Activar'}
            </Button>
          </footer> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
