import { Eye, MapPin, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { Button } from '@/components/ui/button'
import type { Cliente } from '@/modulos/clientes/modelo/cliente'

interface DetalleClienteProps {
  abierto: boolean
  cliente: Cliente
  alCambiarApertura: (abierto: boolean) => void
  alRestaurarFoco: () => void
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="border-t py-3 first:border-t-0">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-1 text-sm leading-6">{valor || 'Sin registrar'}</dd>
    </div>
  )
}

const etiquetasDocumento: Record<Cliente['tipoDocumento'], string> = {
  ruc: 'RUC',
  dni: 'DNI',
  ce: 'Carné de extranjería',
  otro: 'Otro',
}

export function DetalleCliente({
  abierto,
  cliente,
  alCambiarApertura,
  alRestaurarFoco,
}: DetalleClienteProps) {
  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-60 bg-foreground/30" />
        <DialogPrimitive.Content
          className="fixed start-1/2 top-1/2 z-70 flex max-h-[92svh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background shadow-xl outline-none"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div>
              <div className="grid size-10 place-items-center rounded-full bg-accent text-primary">
                <Eye aria-hidden="true" className="size-5" />
              </div>
              <DialogPrimitive.Title className="mt-4 text-xl font-semibold tracking-[-0.025em]">
                Detalle del cliente
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                Consulta los datos fiscales, de contacto y entrega sin modificar el registro.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar detalle del cliente"
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <section className="px-5 py-6 sm:px-7" aria-labelledby="detalle-cliente-identidad">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs tracking-[0.08em] text-primary uppercase">Cliente comercial</p>
                  <h2 id="detalle-cliente-identidad" className="mt-2 text-lg font-semibold">{cliente.nombreRazonSocial}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{etiquetasDocumento[cliente.tipoDocumento]} · {cliente.numeroDocumento}</p>
                </div>
                <span className="status-label" data-tone={cliente.activo ? 'listo' : 'revision'}>{cliente.activo ? 'Activo' : 'Inactivo'}</span>
              </div>
              <dl className="mt-5 grid gap-x-8 sm:grid-cols-2">
                <Dato etiqueta="Nombre comercial" valor={cliente.nombreComercial} />
                <Dato etiqueta="Persona de contacto" valor={cliente.contacto} />
                <Dato etiqueta="Teléfono" valor={cliente.telefono} />
                <Dato etiqueta="Correo" valor={cliente.email} />
              </dl>
            </section>

            <section className="border-t px-5 py-6 sm:px-7" aria-labelledby="detalle-cliente-fiscal">
              <h2 id="detalle-cliente-fiscal" className="font-semibold">Información fiscal</h2>
              <dl className="mt-3 grid gap-x-8 sm:grid-cols-2">
                <Dato etiqueta="Dirección fiscal" valor={cliente.direccion} />
                <Dato etiqueta="Ubigeo fiscal" valor={cliente.ubigeo} />
                <Dato etiqueta="Estado SUNAT" valor={cliente.estadoSunat} />
                <Dato etiqueta="Condición de domicilio" valor={cliente.condicionDomicilio} />
              </dl>
            </section>

            <section className="border-t px-5 py-6 sm:px-7" aria-labelledby="detalle-cliente-entregas">
              <h2 id="detalle-cliente-entregas" className="flex items-center gap-2 font-semibold"><MapPin aria-hidden="true" className="size-4 text-primary" />Direcciones de entrega</h2>
              {cliente.direccionesEntrega.length ? (
                <ul className="mt-4 space-y-2">
                  {cliente.direccionesEntrega.map((direccion) => (
                    <li key={direccion.id ?? `${direccion.etiqueta}-${direccion.direccion}`} className="border bg-muted/20 px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2"><strong>{direccion.etiqueta || 'Dirección de entrega'}</strong>{direccion.principal ? <span className="status-label" data-tone="listo">Principal</span> : null}</div>
                      <p className="mt-1 leading-6">{direccion.direccion}</p>
                      {direccion.referencia ? <p className="mt-1 text-xs text-muted-foreground">Referencia: {direccion.referencia}</p> : null}
                      {direccion.ubigeo ? <p className="mt-1 text-xs text-muted-foreground">Ubigeo: {direccion.ubigeo}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-3 text-sm text-muted-foreground">Sin direcciones de entrega adicionales.</p>}
            </section>
          </div>

          <footer className="flex justify-end border-t px-5 py-4 sm:px-7"><Button type="button" variant="outline" onClick={() => alCambiarApertura(false)}>Cerrar</Button></footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
