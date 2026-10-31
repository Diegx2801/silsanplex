import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock=vi.hoisted(()=>({data:undefined as unknown,permissions:new Set<string>(),execute:vi.fn(),recover:vi.fn(),invalidate:vi.fn().mockResolvedValue(undefined)}))
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:mock.data,isLoading:false,error:null}),useQueryClient:()=>({invalidateQueries:mock.invalidate})}))
vi.mock('@/features/auth/useAuth',()=>({useAuth:()=>({user:{id:'user'},hasPermission:(p:string)=>mock.permissions.has(p)})}))
vi.mock('../servicios/costoRealService',()=>({ejecutarCostoReal:mock.execute,recuperarCostoPendiente:mock.recover,obtenerDetalleCosto:vi.fn()}))
import { PanelCostoReal } from './CostoRealReparacion'
import type { Reparacion } from '../modelo/reparacion'
const id='b1400000-0000-4000-8000-000000000001'
const reparacion={id,organizationId:'org',lockVersion:4} as Reparacion
function datos(state='partial') { return {summary:{repair_id:id,lock_version:4,state,can_confirm:true,total:null,subtotals:[{amount:'9999999999999999.99',currency:'PEN',cost_basis:'not_applicable'}],components:[],item_count:1,
 source_fingerprint:'a'.repeat(64),pending:[{reason:'scope_review_required'}],warnings:[],latest_review:null},items:[],history:[],total_items:0,total_history:0} }
beforeEach(()=>{mock.data=datos();mock.permissions.clear();mock.execute.mockReset();mock.execute.mockResolvedValue(undefined);mock.recover.mockReset();mock.recover.mockReturnValue(null);mock.invalidate.mockClear()})
describe('R14 sección económica',()=>{
 it('lector no obtiene acciones por ser ADMIN o técnico y ve decimales sin pérdida',()=>{
   render(<PanelCostoReal reparacion={reparacion}/>)
   expect(screen.getByText('Costo parcial registrado')).toBeVisible()
   expect(screen.getByText(/9,999,999,999,999,999.99 PEN/)).toBeVisible()
   expect(screen.queryByRole('button',{name:'Registrar mano de obra real'})).not.toBeInTheDocument()
   expect(screen.queryByRole('button',{name:'Revisar y confirmar costo'})).not.toBeInTheDocument()
   expect(screen.getByText('No existe un total único confirmado.')).toBeVisible()
 })
 it('distingue monedas mixtas de un total escalar',()=>{
   const d=datos('confirmed');Object.assign(d.summary,{warnings:['multiple_currencies_no_conversion'],subtotals:[{amount:'1.00',currency:'PEN',cost_basis:'not_applicable'},{amount:'2.00',currency:'USD',cost_basis:'not_applicable'}]});mock.data=d
   render(<PanelCostoReal reparacion={reparacion}/>)
   expect(screen.getByText('Costo real confirmado')).toBeVisible()
   expect(screen.getByText(/Hay PEN y USD/)).toBeVisible()
   expect(screen.queryByText(/^Total confirmado:/)).not.toBeInTheDocument()
 })
 it('recuperar sin pendiente no abre una nueva operación ni envía',()=>{
   mock.permissions.add('REPAIRS_MANAGE_ACTUAL_COST')
   render(<PanelCostoReal reparacion={reparacion}/>)
   fireEvent.click(screen.getByRole('button',{name:'Recuperar operación económica pendiente'}))
   expect(screen.getByText('No hay una operación económica pendiente de confirmar en esta pestaña.')).toBeVisible()
   expect(screen.queryByRole('form',{name:'Operación económica'})).not.toBeInTheDocument()
   expect(mock.execute).not.toHaveBeenCalled()
 })
 it('recupera y reenvía la intención original con versión y clave, no los datos actuales',async()=>{
   mock.permissions.add('REPAIRS_MANAGE_ACTUAL_COST')
   const pendiente={tipo:'record_repair_actual_cost',datos:{category:'labor',description:'Original',amount:'4.00',currency:'PEN',cost_basis:'not_applicable',incurred_on:'2026-10-01',reason:'Original reason',evidence_reference:'Original doc'},expectedLockVersion:1,clave:crypto.randomUUID()}
   mock.recover.mockReturnValue(pendiente)
   render(<PanelCostoReal reparacion={reparacion}/>)
   fireEvent.click(screen.getByRole('button',{name:'Recuperar operación económica pendiente'}))
   expect(screen.getByLabelText(/^Importe real/)).toHaveValue('4.00')
   expect(screen.getByLabelText(/^Importe real/)).toBeDisabled()
   fireEvent.submit(screen.getByRole('form',{name:'Operación económica'}))
   const {clave,...comando}=pendiente
   await waitFor(()=>expect(mock.execute).toHaveBeenCalledWith(`org:user:${id}:actual-cost`,'org',id,comando,clave))
 })
 it('una intención incierta impide iniciar otra',()=>{
   mock.permissions.add('REPAIRS_MANAGE_ACTUAL_COST');mock.recover.mockReturnValue({tipo:'record_repair_actual_cost'})
   render(<PanelCostoReal reparacion={reparacion}/>)
   fireEvent.click(screen.getByRole('button',{name:'Registrar mano de obra real'}))
   expect(screen.getByText(/Hay una intención económica pendiente/)).toBeVisible()
   expect(screen.queryByRole('form',{name:'Operación económica'})).not.toBeInTheDocument()
 })
 it('no presenta confirmación con una versión distinta de la orden',()=>{
   mock.data=datos('confirmed')
   render(<PanelCostoReal reparacion={{...reparacion,lockVersion:5}}/>)
   expect(screen.getByText(/La orden cambió; actualizando/)).toBeVisible()
   expect(screen.queryByText('Costo real confirmado')).not.toBeInTheDocument()
 })
  it('el permiso de confirmación no concede gestión y exige aceptación del alcance',()=>{
   mock.permissions.add('REPAIRS_CONFIRM_ACTUAL_COST')
   render(<PanelCostoReal reparacion={reparacion}/>)
   expect(screen.queryByRole('button',{name:'Registrar mano de obra real'})).not.toBeInTheDocument()
   fireEvent.click(screen.getByRole('button',{name:'Revisar y confirmar costo'}))
   const form=screen.getByRole('form',{name:'Operación económica'})
   fireEvent.submit(form)
   expect(within(form).getByText(/Revisé fuentes/)).toBeVisible()
   expect(screen.getByText('Confirma que revisaste el alcance y sus evidencias.')).toBeVisible()
    expect(mock.execute).not.toHaveBeenCalled()
  })
  it('muestra importes y bases anteriores, valor efectivo y alcance histórico sin inferir datos',()=>{
    const common={reason:'Documento corregido',evidence_reference:'Factura línea 2',actor_name:'Responsable histórico',recorded_at:'2026-10-01T12:00:00Z'}
    mock.data={...datos(),history:[
      {...common,id:'revision',kind:'source_review',amount:'8.25',currency:'PEN',cost_basis:'tax_exclusive',previous_amount:'10.00',previous_currency:'USD',previous_cost_basis:'tax_inclusive',is_effective:true},
      {...common,id:'old-review',kind:'confirmation',is_current:false,scope:{consumption:'not_applicable',external:'complete',labor:'not_applicable',other:'not_applicable'}},
      {...common,id:'new-review',kind:'confirmation',is_current:true,scope:{consumption:'not_applicable',external:'complete',labor:'complete',other:'not_applicable'}},
    ]}
    render(<PanelCostoReal reparacion={reparacion}/>)
    expect(screen.getByText('Importe anterior: 10.00 USD')).toBeVisible()
    expect(screen.getByText(/Importe de esta revisión: 8.25 PEN · Valor efectivo vigente/)).toBeVisible()
    expect(screen.getByText('Base anterior: Incluye impuestos · Base de esta revisión: Sin impuestos')).toBeVisible()
    expect(screen.getByText('Confirmación histórica; no vigente')).toBeVisible()
    expect(screen.getByText('Confirmación económica vigente')).toBeVisible()
    expect(screen.getAllByRole('list',{name:'Alcance de esta confirmación'})).toHaveLength(2)
    expect(screen.getByText('Mano de obra interna: Fuentes completas')).toBeVisible()
    expect(screen.getByText('Mano de obra interna: No aplicable')).toBeVisible()
  })
})
