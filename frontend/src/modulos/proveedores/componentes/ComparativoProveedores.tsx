import { useQuery } from '@tanstack/react-query'
import { LoaderCircle, Scale, TrendingDown } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { Proveedor } from '@/modulos/proveedores/modelo/proveedor'
import { listarComparativoProductosProveedor } from '@/modulos/proveedores/servicios/proveedorDetalleService'

function moneda(valor: number) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(valor)
}

function fecha(valor: string) {
  const fechaLocal = valor.length === 10 ? `${valor}T12:00:00` : valor
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(fechaLocal))
}

interface ComparativoProveedoresProps {
  organizationId: string
  proveedores: readonly Proveedor[]
}

export function ComparativoProveedores({ organizationId, proveedores }: ComparativoProveedoresProps) {
  const [productoSeleccionado, setProductoSeleccionado] = useState('')
  const comparativoQuery = useQuery({
    queryKey: ['supplier-comparison', organizationId],
    queryFn: () => listarComparativoProductosProveedor(organizationId),
    enabled: Boolean(organizationId),
  })
  const proveedoresPorId = useMemo(
    () => new Map(proveedores.map((proveedor) => [proveedor.id, proveedor])),
    [proveedores],
  )
  const productos = useMemo(() => {
    const unicos = new Map<string, { id: string; codigo: string; descripcion: string }>()
    for (const item of comparativoQuery.data ?? []) {
      if (!unicos.has(item.productoId)) {
        unicos.set(item.productoId, { id: item.productoId, codigo: item.codigo, descripcion: item.descripcion })
      }
    }
    return [...unicos.values()]
  }, [comparativoQuery.data])
  const productoActivo = productos.some((producto) => producto.id === productoSeleccionado)
    ? productoSeleccionado
    : (productos[0]?.id ?? '')
  const alternativas = useMemo(
    () => (comparativoQuery.data ?? [])
      .filter((item) => item.productoId === productoActivo)
      .toSorted((a, b) => a.ultimoCosto - b.ultimoCosto),
    [comparativoQuery.data, productoActivo],
  )

  return (
    <section className="ledger-sheet" aria-labelledby="comparativo-proveedores-title">
      <div className="flex flex-col gap-4 border-b px-5 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="font-mono text-[0.68rem] tracking-[0.06em] text-primary uppercase">Decisión de compra</span>
          <h2 id="comparativo-proveedores-title" className="mt-1 flex items-center gap-2 text-lg font-semibold">
            <Scale aria-hidden="true" className="size-4 text-primary" /> Comparativo real por producto
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Contrasta costos y experiencia utilizando únicamente recepciones confirmadas.</p>
        </div>
        {productos.length ? (
          <label className="w-full lg:max-w-md">
            <span className="field-label">Producto suministrado</span>
            <select className="field-control" value={productoActivo} onChange={(evento) => setProductoSeleccionado(evento.target.value)}>
              {productos.map((producto) => <option key={producto.id} value={producto.id}>{producto.codigo} · {producto.descripcion}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      {comparativoQuery.isLoading ? (
        <p className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />Calculando comparativo…</p>
      ) : comparativoQuery.isError ? (
        <p role="alert" className="px-6 py-12 text-center text-sm text-destructive">{comparativoQuery.error.message}</p>
      ) : !alternativas.length ? (
        <div className="px-6 py-12 text-center"><TrendingDown aria-hidden="true" className="mx-auto size-7 text-primary" /><p className="mt-3 text-sm text-muted-foreground">El comparativo aparecerá cuando existan compras recibidas.</p></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="bg-muted/45 font-mono text-[0.68rem] tracking-[0.05em] text-muted-foreground uppercase">
              <tr><th className="px-6 py-3">Proveedor</th><th className="px-4 py-3 text-end">Último costo</th><th className="px-4 py-3 text-end">Costo promedio</th><th className="px-4 py-3 text-end">Rango</th><th className="px-4 py-3 text-end">Compras</th><th className="px-6 py-3">Última recepción</th></tr>
            </thead>
            <tbody className="divide-y">
              {alternativas.map((item, indice) => {
                const proveedor = proveedoresPorId.get(item.proveedorId)
                return <tr key={item.proveedorId} className="hover:bg-muted/35"><td className="px-6 py-4"><div className="flex items-center gap-2"><p className="font-medium">{proveedor?.razonSocial ?? 'Proveedor no disponible'}</p>{indice === 0 && alternativas.length > 1 ? <span className="status-label" data-tone="listo">Menor último costo</span> : null}</div><p className="mt-1 font-mono text-xs text-muted-foreground">{proveedor?.numeroDocumento ?? item.proveedorId}</p></td><td className="px-4 py-4 text-end font-mono font-semibold">{moneda(item.ultimoCosto)}</td><td className="px-4 py-4 text-end font-mono">{moneda(item.costoPromedio)}</td><td className="px-4 py-4 text-end font-mono text-xs">{moneda(item.costoMinimo)} – {moneda(item.costoMaximo)}</td><td className="px-4 py-4 text-end font-mono">{item.compras}</td><td className="px-6 py-4">{fecha(item.ultimaRecepcionEn)}</td></tr>
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
