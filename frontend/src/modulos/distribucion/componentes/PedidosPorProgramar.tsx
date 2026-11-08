import { Eye, Plus } from 'lucide-react'
import type { MouseEvent } from 'react'

import { Button } from '@/components/ui/button'

export interface PedidoPorProgramarResumen {
  id: string
  numero: string
  clienteNombre: string
  clienteDocumento: string
  almacenNombre: string
  cantidadProductos: number
  estado: string
  estadoListo: boolean
}

interface Props {
  pedidos: PedidoPorProgramarResumen[]
  puedeProgramar: boolean
  alVerDetalle: (pedidoId: string, disparador: HTMLButtonElement) => void
  alProgramar: (pedidoId: string) => void
}

export function PedidosPorProgramar({
  pedidos,
  puedeProgramar,
  alVerDetalle,
  alProgramar,
}: Props) {
  return (
    <>
      <ul aria-label="Pedidos por programar" className="divide-y lg:hidden">
        {pedidos.map((pedido) => (
          <li key={pedido.id}>
            <article className="space-y-4 px-4 py-5 sm:px-6">
              <header className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-xs font-medium text-primary">
                    Pedido {pedido.numero}
                  </p>
                  <span
                    className="status-label"
                    data-tone={pedido.estadoListo ? 'listo' : 'pendiente'}
                  >
                    {pedido.estado}
                  </span>
                </div>
                <h3 className="mt-2 break-words font-semibold">
                  {pedido.clienteNombre}
                </h3>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {pedido.clienteDocumento}
                </p>
              </header>

              <dl className="grid min-w-0 grid-cols-2 gap-3 text-sm">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Almacén</dt>
                  <dd className="mt-1 break-words">{pedido.almacenNombre}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Bienes</dt>
                  <dd className="mt-1 font-mono tabular-nums">
                    {pedido.cantidadProductos} producto{pedido.cantidadProductos === 1 ? '' : 's'}
                  </dd>
                </div>
              </dl>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  aria-label={`Ver detalle de ${pedido.numero}`}
                  onClick={(evento: MouseEvent<HTMLButtonElement>) =>
                    alVerDetalle(pedido.id, evento.currentTarget)
                  }
                >
                  <Eye aria-hidden="true" /> Ver detalle
                </Button>
                {puedeProgramar ? (
                  <Button
                    type="button"
                    className="min-h-11"
                    onClick={() => alProgramar(pedido.id)}
                  >
                    <Plus aria-hidden="true" /> Programar envío
                  </Button>
                ) : null}
              </div>
            </article>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto lg:block">
        <table aria-label="Pedidos por programar" className="w-full min-w-[58rem] border-collapse text-left text-sm">
          <thead className="border-b bg-muted/45">
            <tr>
              <th className="px-5 py-3 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Pedido</th>
              <th className="px-4 py-3 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Cliente</th>
              <th className="px-4 py-3 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Almacén</th>
              <th className="px-4 py-3 text-end font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Bienes</th>
              <th className="px-4 py-3 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Estado</th>
              <th className="px-5 py-3 text-end font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pedidos.map((pedido) => (
              <tr key={pedido.id} className="hover:bg-muted/35">
                <td className="px-5 py-4 font-mono text-xs font-medium text-primary">
                  {pedido.numero}
                </td>
                <td className="max-w-[18rem] px-4 py-4">
                  <p className="truncate font-medium">{pedido.clienteNombre}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{pedido.clienteDocumento}</p>
                </td>
                <td className="px-4 py-4 text-sm text-muted-foreground">{pedido.almacenNombre}</td>
                <td className="px-4 py-4 text-end">
                  <p className="font-mono tabular-nums">
                    {pedido.cantidadProductos} producto{pedido.cantidadProductos === 1 ? '' : 's'}
                  </p>
                </td>
                <td className="px-4 py-4">
                  <span className="status-label" data-tone={pedido.estadoListo ? 'listo' : 'pendiente'}>
                    {pedido.estado}
                  </span>
                </td>
                <td className="px-5 py-4 text-end">
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Ver detalle de ${pedido.numero}`}
                      onClick={(evento: MouseEvent<HTMLButtonElement>) =>
                        alVerDetalle(pedido.id, evento.currentTarget)
                      }
                    >
                      <Eye aria-hidden="true" />
                    </Button>
                    {puedeProgramar ? (
                      <Button type="button" onClick={() => alProgramar(pedido.id)}>
                        <Plus aria-hidden="true" /> Programar envío
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
