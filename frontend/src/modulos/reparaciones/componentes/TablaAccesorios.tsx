import type { AccesorioReparacion } from '../modelo/accesorios'

export function TablaAccesorios({ accesorios }: { accesorios: readonly AccesorioReparacion[] }) {
  return <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm">
    <caption className="sr-only">Cantidades recibidas, devueltas y pendientes de accesorios</caption>
    <thead className="border-b"><tr><th className="py-2 pe-3">Accesorio</th><th className="p-2 text-end">Recibido</th><th className="p-2 text-end">Devuelto</th><th className="p-2 text-end">Pendiente</th></tr></thead>
    <tbody className="divide-y">{accesorios.map(a => <tr key={a.id}>
      <td className="py-3 pe-3"><span className="font-medium">{a.name}</span>{a.voided_at ? <span className="ms-2">Anulado</span> : null}
        {a.received_condition ? <p className="mt-1 text-muted-foreground">Condición: {a.received_condition}</p> : null}
        {a.observations ? <p className="mt-1 text-muted-foreground">{a.observations}</p> : null}</td>
      <td className="p-2 text-end tabular-nums">{a.quantity_received}</td><td className="p-2 text-end tabular-nums">{a.quantity_returned}</td>
      <td className="p-2 text-end font-semibold tabular-nums">{a.quantity_pending}</td>
    </tr>)}</tbody>
  </table></div>
}
