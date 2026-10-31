import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { obtenerResumenesCosto } from '../servicios/costoRealService'
import { etiquetasBaseCosto, etiquetasEstadoCosto, importeCostoExacto } from '../modelo/costoReal'
import type { Reparacion } from '../modelo/reparacion'

export function ResumenCostosPagina({ reparaciones }: { reparaciones: Reparacion[] }) {
  const [abierto,setAbierto] = useState(false)
  if (!reparaciones.length) return null
  return <details className="border px-5 py-3" open={abierto} onToggle={e=>setAbierto(e.currentTarget.open)}>
    <summary className="cursor-pointer font-medium">Costos de las órdenes visibles</summary>
    {abierto ? <Panel reparaciones={reparaciones} /> : null}
  </details>
}
function Panel({ reparaciones }: { reparaciones: Reparacion[] }) {
  const org = reparaciones[0].organizationId
  const consulta = useQuery({ queryKey:['repair-cost-page',org,reparaciones.map(r=>[r.id,r.lockVersion])],
    queryFn:()=>obtenerResumenesCosto(org,reparaciones.map(r=>r.id)) })
  if (consulta.error) return <p role="alert">{consulta.error.message}</p>
  if (!consulta.data) return <p role="status">Consultando costos de esta página…</p>
  return <ul className="mt-3 space-y-2 text-sm">{reparaciones.map(r=>{
    const resumen = consulta.data.find(s=>s.repair_id===r.id && s.lock_version===r.lockVersion)
    return <li key={r.id}>{r.codigo} · {resumen ? etiquetasEstadoCosto[resumen.state] : 'La versión cambió; actualiza el listado.'}
      {resumen?.subtotals.map(s=><span className="ms-2" key={`${s.currency}:${s.cost_basis}`}>{importeCostoExacto(s.amount)} {s.currency} ({etiquetasBaseCosto[s.cost_basis]})</span>)}</li>
  })}</ul>
}
