import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock=vi.hoisted(()=>({get:vi.fn()}))
vi.mock('../servicios/costoRealService',()=>({obtenerResumenesCosto:mock.get}))
import { ResumenCostosPagina } from './ResumenCostosPagina'
import type { Reparacion } from '../modelo/reparacion'
const ids=['b1400000-0000-4000-8000-000000000001','b1400000-0000-4000-8000-000000000002']
const filas=ids.map((id,i)=>({id,organizationId:'org',lockVersion:4,codigo:`REP-${i}`} as Reparacion))
const resumenes=ids.map(repair_id=>({repair_id,lock_version:4,state:'partial',subtotals:[{amount:'2.50',currency:'PEN',cost_basis:'not_applicable'}]}))
function mostrar(f=filas){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={client}><ResumenCostosPagina reparaciones={f}/></QueryClientProvider>)}
function abrir(){const elemento=screen.getByText('Costos de las órdenes visibles').closest('details')!;elemento.open=true;fireEvent(elemento,new Event('toggle'))}
beforeEach(()=>{mock.get.mockReset();mock.get.mockResolvedValue(resumenes)})
describe('R14 lote de listado',()=>{
 it('consulta solo al abrir y hace una petición por página, no por fila',async()=>{
  mostrar();expect(mock.get).not.toHaveBeenCalled();abrir()
  await waitFor(()=>expect(mock.get).toHaveBeenCalledWith('org',ids))
  expect(mock.get).toHaveBeenCalledTimes(1)
  expect(await screen.findAllByText(/2.50 PEN/)).toHaveLength(2)
 })
 it('no utiliza un resumen con otra versión para certificar la fila',async()=>{
  mock.get.mockResolvedValue(resumenes.map(s=>({...s,lock_version:3,state:'confirmed'})))
  mostrar();abrir()
  expect(await screen.findAllByText(/La versión cambió; actualiza el listado/)).toHaveLength(2)
  expect(screen.queryByText(/Costo real confirmado/)).not.toBeInTheDocument()
 })
 it('un error de acceso no se presenta como costo cero',async()=>{
  mock.get.mockRejectedValue(new Error('Sin permiso de consulta'))
  mostrar();abrir()
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin permiso de consulta')
  expect(screen.queryByText(/0.00/)).not.toBeInTheDocument()
 })
})
