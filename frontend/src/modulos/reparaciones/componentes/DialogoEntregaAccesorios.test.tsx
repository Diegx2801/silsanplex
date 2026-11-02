import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccesorioReparacion } from '../modelo/accesorios'
import type { Reparacion } from '../modelo/reparacion'
const estado=vi.hoisted(()=>({data:undefined as unknown,error:null as Error|null,isLoading:false,guardar:vi.fn(),recuperar:vi.fn(),refetch:vi.fn(),excepcion:true,entregar:true}))
vi.mock('@/features/auth/useAuth',()=>({useAuth:()=>({hasPermission:(p:string)=>p==='REPAIRS_DELIVER'?estado.entregar:p==='REPAIRS_AUTHORIZE_ACCESSORY_EXCEPTION'&&estado.excepcion})}))
vi.mock('../estado/useAccesoriosReparacion',()=>({useAccesoriosReparacion:()=>({consulta:estado,guardar:estado.guardar,recuperar:estado.recuperar})}))
import { DialogoEntregaAccesorios } from './DialogoEntregaAccesorios'
const id='a0000000-0000-4000-8000-000000000001'
const reparacion={id:'repair',organizationId:'org',estado:'ready_for_delivery',lockVersion:7} as Reparacion
const cable={id,name:'Cable',quantity_received:3,quantity_returned:1,quantity_pending:2,received_condition:null,observations:null,voided_at:null} as AccesorioReparacion
beforeEach(()=>{vi.clearAllMocks();estado.data={reviewed_at:'date',lock_version:7,accessories:[cable]};estado.error=null;estado.isLoading=false;estado.excepcion=true;estado.entregar=true;estado.recuperar.mockReturnValue(null);estado.guardar.mockResolvedValue(undefined)})
describe('Entrega ordinaria y excepción explícita',()=>{
  it('devolución sin reparar utiliza su RPC y conserva el contrato de accesorios',async()=>{
    render(<DialogoEntregaAccesorios abierto sinReparar reparacion={{...reparacion,estado:'non_repairable',decisionNoReparable:{id:'9007199254740993'} as Reparacion['decisionNoReparable']}} alCambiarApertura={vi.fn()} />)
    expect(screen.getByText(/no inicia garantía de reparación/)).toBeVisible()
    fireEvent.click(screen.getByText('Devolver todos los accesorios junto al equipo sin reparar'))
    fireEvent.click(screen.getByText('Confirmar devolución sin reparar'))
    await waitFor(()=>expect(estado.guardar).toHaveBeenCalledWith(expect.objectContaining({tipo:'return_unrepaired_repair',expectedLockVersion:7,
      datos:expect.objectContaining({decision_event_id:'9007199254740993',returns:[{accessory_id:id,quantity:2,observation:'Devuelto junto al equipo sin reparar'}]})}),expect.any(String)))
  })
  it('distingue la confirmación de excepción y recuperación del modo sin reparar',async()=>{
    estado.recuperar.mockReturnValue({tipo:'return_unrepaired_repair',expectedLockVersion:6,
      datos:{decision_event_id:'123',returns:[],authorize_exception:true,exception_reason:'Pendientes reales'},clave:id})
    render(<DialogoEntregaAccesorios abierto sinReparar reparacion={{...reparacion,estado:'returned_unrepaired'}} alCambiarApertura={vi.fn()} />)
    expect(screen.getByRole('checkbox',{name:'Confirmo la devolución sin reparar con los accesorios pendientes indicados'})).toBeChecked()
    expect(screen.queryByText('Volver a entrega ordinaria')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Reintentar devolución sin reparar'}))
    await waitFor(()=>expect(estado.guardar).toHaveBeenCalledWith(expect.objectContaining({tipo:'return_unrepaired_repair',expectedLockVersion:6}),id))
  })
  it('sin accesorios conserva entrega habitual',async()=>{
    estado.data={reviewed_at:'date',lock_version:7,accessories:[]};const cerrar=vi.fn()
    render(<DialogoEntregaAccesorios abierto reparacion={reparacion} alCambiarApertura={cerrar} />)
    fireEvent.click(screen.getByText('Confirmar entrega'))
    await waitFor(()=>expect(estado.guardar).toHaveBeenCalledWith({tipo:'deliver_repair_with_accessories',expectedLockVersion:7,datos:{returns:[],authorize_exception:false,exception_reason:''}},expect.any(String)))
    expect(cerrar).toHaveBeenCalledWith(false)
  })
  it('explica los pendientes y presenta rechazo SQL',async()=>{
    estado.guardar.mockRejectedValue(new Error('Entrega bloqueada por accesorios pendientes'))
    render(<DialogoEntregaAccesorios abierto reparacion={reparacion} alCambiarApertura={vi.fn()} />)
    expect(screen.getByText(/Entrega ordinaria bloqueada/)).toBeVisible()
    fireEvent.click(screen.getByText('Confirmar entrega'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Entrega bloqueada')
  })
  it('registra devoluciones de entrega sin excepción ficticia',async()=>{
    render(<DialogoEntregaAccesorios abierto reparacion={reparacion} alCambiarApertura={vi.fn()} />)
    fireEvent.click(screen.getByText('Devolver todos los pendientes en esta entrega'));fireEvent.click(screen.getByText('Confirmar entrega'))
    await waitFor(()=>expect(estado.guardar).toHaveBeenCalledWith(expect.objectContaining({datos:{returns:[{accessory_id:id,quantity:2,observation:'Devuelto al entregar el equipo'}],authorize_exception:false,exception_reason:''}}),expect.any(String)))
  })
  it('oculta la excepción sin permiso especial',()=>{
    estado.excepcion=false;render(<DialogoEntregaAccesorios abierto reparacion={reparacion} alCambiarApertura={vi.fn()} />)
    expect(screen.queryByText('Autorizar entrega con accesorios pendientes')).not.toBeInTheDocument()
  })
  it('no autoriza solo con el permiso especial',()=>{
    estado.entregar=false;render(<DialogoEntregaAccesorios abierto reparacion={reparacion} alCambiarApertura={vi.fn()} />)
    expect(screen.queryByText('Autorizar entrega con accesorios pendientes')).not.toBeInTheDocument()
    expect(screen.getByText('Confirmar entrega')).toBeDisabled()
  })
  it('exige motivo y confirmación expresa',async()=>{
    render(<DialogoEntregaAccesorios abierto reparacion={reparacion} alCambiarApertura={vi.fn()} />)
    fireEvent.click(screen.getByText('Autorizar entrega con accesorios pendientes'))
    fireEvent.change(screen.getByLabelText('Motivo de excepción *'),{target:{value:' '}})
    fireEvent.click(screen.getByText('Confirmar entrega excepcional'))
    expect(await screen.findByRole('alert')).toHaveTextContent('motivo')
    expect(estado.guardar).not.toHaveBeenCalled()
  })
  it('envía la excepción sin inventar devoluciones',async()=>{
    render(<DialogoEntregaAccesorios abierto reparacion={reparacion} alCambiarApertura={vi.fn()} />)
    fireEvent.click(screen.getByText('Autorizar entrega con accesorios pendientes'))
    fireEvent.change(screen.getByLabelText('Motivo de excepción *'),{target:{value:'Acuerdo con el cliente'}})
    fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByText('Confirmar entrega excepcional'))
    await waitFor(()=>expect(estado.guardar).toHaveBeenCalledWith(expect.objectContaining({datos:{returns:[],authorize_exception:true,exception_reason:'Acuerdo con el cliente'}}),expect.any(String)))
  })
  it('no permite operar con error de lectura',()=>{
    estado.error=new Error('Lectura fallida');estado.data=undefined
    render(<DialogoEntregaAccesorios abierto reparacion={reparacion} alCambiarApertura={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Lectura fallida')
    expect(screen.queryByText('Confirmar entrega')).not.toBeInTheDocument()
  })
  it('recupera motivo y versión originales de entrega confirmada',async()=>{
    estado.recuperar.mockReturnValue({tipo:'deliver_repair_with_accessories',expectedLockVersion:6,datos:{returns:[],authorize_exception:true,exception_reason:'Motivo original'},clave:id})
    render(<DialogoEntregaAccesorios abierto reparacion={{...reparacion,estado:'delivered',lockVersion:8}} alCambiarApertura={vi.fn()} />)
    expect(screen.getByLabelText('Motivo de excepción *')).toHaveValue('Motivo original')
    fireEvent.click(screen.getByText('Reintentar entrega'))
    await waitFor(()=>expect(estado.guardar).toHaveBeenCalledWith(expect.objectContaining({expectedLockVersion:6}),id))
  })
  it('almacenamiento ilegible impide otra entrega',()=>{
    estado.recuperar.mockImplementation(()=>{throw new Error('Almacenamiento ilegible')})
    render(<DialogoEntregaAccesorios abierto reparacion={reparacion} alCambiarApertura={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Almacenamiento ilegible')
    expect(screen.getByText('Confirmar entrega')).toBeDisabled()
  })
})
