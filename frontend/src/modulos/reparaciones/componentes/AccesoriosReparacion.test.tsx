import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccesorioReparacion, DetalleAccesorios } from '../modelo/accesorios'
import type { Reparacion } from '../modelo/reparacion'
const estado=vi.hoisted(()=>({data:undefined as unknown,error:null as Error|null,isLoading:false,guardar:vi.fn(),recuperar:vi.fn(),refetch:vi.fn()}))
vi.mock('../estado/useAccesoriosReparacion',()=>({useAccesoriosReparacion:()=>({consulta:estado,guardar:estado.guardar,recuperar:estado.recuperar})}))
import { AccesoriosReparacion } from './AccesoriosReparacion'
const id='a0000000-0000-4000-8000-000000000001'
const reparacion={id:'repair',organizationId:'org',estado:'received',lockVersion:7} as Reparacion
const cable:AccesorioReparacion={id,organization_id:'org',repair_id:'repair',name:'Cable',quantity_received:3,quantity_returned:1,quantity_pending:2,
  received_condition:'Bueno',observations:'Original',registered_by:id,registered_by_name:'Recepcionista',registered_at:'2026-10-29T12:00:00Z',updated_by:id,updated_at:'2026-10-29T12:00:00Z',voided_at:null,void_reason:null,
  returns:[{id,accessory_id:id,quantity:1,returned_by:id,returned_by_name:'Responsable devolución',returned_at:'2026-10-30T12:00:00Z',observation:'Primera devolución',operation_key:id}]}
beforeEach(()=>{vi.clearAllMocks();estado.data={reviewed_at:'2026-10-29T12:00:00Z',lock_version:7,accessories:[cable]} satisfies DetalleAccesorios;estado.error=null;estado.isLoading=false;estado.guardar.mockResolvedValue(undefined);estado.recuperar.mockReturnValue(null)})
describe('Detalle y custodia de accesorios',()=>{
  it('muestra recibidos, devueltos, pendientes y responsables reales',()=>{
    render(<AccesoriosReparacion reparacion={reparacion} puedeEditar puedeDevolver />)
    expect(screen.getByRole('row',{name:/Cable/})).toHaveTextContent('3')
    fireEvent.click(screen.getByText('Registro de Cable'))
    expect(screen.getByText(/Recibido por Recepcionista/)).toBeVisible()
    expect(screen.getByText(/Responsable devolución/)).toHaveTextContent('Primera devolución')
    expect(screen.queryByText('Corregir Cable')).not.toBeInTheDocument()
  })
  it('diferencia histórico de vacío revisado',()=>{
    estado.data={reviewed_at:null,lock_version:7,accessories:[]}
    const {rerender}=render(<AccesoriosReparacion reparacion={reparacion} puedeEditar={false} puedeDevolver={false} />)
    expect(screen.getByText(/Recepción histórica/)).toBeVisible()
    estado.data={reviewed_at:'date',lock_version:7,accessories:[]}
    rerender(<AccesoriosReparacion reparacion={reparacion} puedeEditar={false} puedeDevolver={false} />)
    expect(screen.getByText('Recepción revisada sin accesorios registrados.')).toBeVisible()
  })
  it('error de lectura no presenta ausencia ni acciones nuevas',()=>{
    estado.error=new Error('Consulta fallida')
    render(<AccesoriosReparacion reparacion={reparacion} puedeEditar puedeDevolver />)
    expect(screen.getByRole('alert')).toHaveTextContent('Consulta fallida')
    expect(screen.queryByText('Registrar accesorio adicional')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Reintentar accesorios'));expect(estado.refetch).toHaveBeenCalled()
  })
  it('explica estado de carga',()=>{
    estado.isLoading=true;render(<AccesoriosReparacion reparacion={reparacion} puedeEditar puedeDevolver />)
    expect(screen.getByRole('status')).toHaveTextContent('Consultando accesorios')
  })
  it('usuario de consulta no recibe escrituras',()=>{
    render(<AccesoriosReparacion reparacion={reparacion} puedeEditar={false} puedeDevolver={false} />)
    fireEvent.click(screen.getByText('Registro de Cable'))
    expect(screen.queryByText('Registrar devolución de Cable')).not.toBeInTheDocument()
  })
  it.each(['delivered','cancelled','rejected'] as const)('permite devolver sin reabrir %s',async estadoOrden=>{
    render(<AccesoriosReparacion reparacion={{...reparacion,estado:estadoOrden}} puedeEditar puedeDevolver />)
    fireEvent.click(screen.getByText('Registro de Cable'));fireEvent.click(screen.getByText('Registrar devolución de Cable'))
    fireEvent.change(screen.getByLabelText('Cantidad a devolver *'),{target:{value:'1'}})
    fireEvent.click(screen.getByText('Confirmar devolución'))
    await waitFor(()=>expect(estado.guardar).toHaveBeenCalledWith(expect.objectContaining({tipo:'record_repair_accessory_return',expectedLockVersion:7,datos:{returns:[{accessory_id:id,quantity:1,observation:''}]}}),expect.any(String)))
    expect(screen.queryByText('Registrar accesorio adicional')).not.toBeInTheDocument()
  })
  it('conserva entrada al detectar un conflicto',async()=>{
    estado.guardar.mockRejectedValue(new Error('La reparación cambió mientras realizabas esta acción.'))
    render(<AccesoriosReparacion reparacion={reparacion} puedeEditar puedeDevolver />)
    fireEvent.click(screen.getByText('Registro de Cable'));fireEvent.click(screen.getByText('Registrar devolución de Cable'))
    fireEvent.change(screen.getByLabelText('Cantidad a devolver *'),{target:{value:'1'}});fireEvent.click(screen.getByText('Confirmar devolución'))
    expect(await screen.findByRole('alert')).toHaveTextContent('cambió mientras')
    expect(screen.getByLabelText('Cantidad a devolver *')).toHaveValue(1)
  })
  it('recupera la intención original aunque ya no quede saldo',async()=>{
    estado.data={reviewed_at:'date',lock_version:8,accessories:[{...cable,quantity_returned:3,quantity_pending:0}]}
    estado.recuperar.mockReturnValue({tipo:'record_repair_accessory_return',expectedLockVersion:7,datos:{returns:[{accessory_id:id,quantity:2,observation:'Original'}]},clave:id})
    render(<AccesoriosReparacion reparacion={reparacion} puedeEditar puedeDevolver />)
    fireEvent.click(screen.getByText('Recuperar operación de accesorios pendiente'))
    expect(screen.getByLabelText('Cantidad a devolver *')).toBeDisabled()
    fireEvent.click(screen.getByText('Reintentar operación de accesorios'))
    await waitFor(()=>expect(estado.guardar).toHaveBeenCalledWith(expect.objectContaining({expectedLockVersion:7}),id))
  })
})
