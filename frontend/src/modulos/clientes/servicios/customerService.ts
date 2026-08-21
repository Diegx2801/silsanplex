import type { Cliente, DatosCliente } from '@/modulos/clientes/modelo/cliente'
import { supabase } from '@/lib/supabase'

export type EstadoFiltroCliente = 'todos' | 'activos' | 'inactivos'
export interface FiltrosClientes { busqueda: string; estado: EstadoFiltroCliente; pagina: number; porPagina: number }
export interface PaginaClientes { clientes: Cliente[]; total: number }

interface FilaCliente {
  id: string; organization_id: string; document_type: string; document_number: string
  legal_name: string; trade_name: string | null; taxpayer_status: string | null
  domicile_condition: string | null; tax_data_source: string | null; tax_checked_at: string | null; is_active: boolean
  created_at: string; updated_at: string
  customer_addresses: Array<{ id: string; address_type: string; label: string | null; address_line: string; ubigeo_code: string | null; reference: string | null; is_default: boolean; is_active: boolean }>
  customer_contacts: Array<{ id: string; full_name: string | null; email: string | null; phone: string | null; is_primary: boolean; is_active: boolean }>
}

const seleccion = 'id, organization_id, document_type, document_number, legal_name, trade_name, taxpayer_status, domicile_condition, tax_data_source, tax_checked_at, is_active, created_at, updated_at, customer_addresses(id,address_type,label,address_line,ubigeo_code,reference,is_default,is_active), customer_contacts(id,full_name,email,phone,is_primary,is_active)'

function reportarErrorDeLectura(error: unknown) {
  if (import.meta.env.DEV) {
    console.error('No se pudo consultar el directorio de clientes.', error)
  }
}

function mapear(fila: FilaCliente): Cliente {
  const fiscal = fila.customer_addresses.find((d) => d.address_type === 'FISCAL' && d.is_active)
  const contacto = fila.customer_contacts.find((c) => c.is_primary && c.is_active) ?? fila.customer_contacts.find((c) => c.is_active)
  return {
    id: fila.id, organizacionId: fila.organization_id,
    tipoDocumento: fila.document_type.toLowerCase() as Cliente['tipoDocumento'],
    numeroDocumento: fila.document_number, nombreRazonSocial: fila.legal_name,
    nombreComercial: fila.trade_name ?? '', contacto: contacto?.full_name ?? '',
    email: contacto?.email ?? '', telefono: contacto?.phone ?? '',
    direccion: fiscal?.address_line ?? '', ubigeo: fiscal?.ubigeo_code ?? '',
    direccionFiscalId: fiscal?.id,
    contactoPrincipalId: contacto?.id,
    estadoSunat: fila.taxpayer_status ?? '',
    condicionDomicilio: (fila.domicile_condition ?? '') as Cliente['condicionDomicilio'],
    fuenteDatosFiscales: fila.tax_data_source ?? '',
    direccionesEntrega: fila.customer_addresses.filter((d) => d.address_type === 'DELIVERY' && d.is_active).map((d) => ({ id: d.id, etiqueta: d.label ?? '', direccion: d.address_line, ubigeo: d.ubigeo_code ?? '', referencia: d.reference ?? '', principal: d.is_default })),
    activo: fila.is_active, fechaRegistro: fila.created_at, fechaActualizacion: fila.updated_at,
    fechaConsultaSunat: fila.tax_checked_at,
  }
}

export async function listarClientes(filtros: FiltrosClientes): Promise<PaginaClientes> {
  const desde = (filtros.pagina - 1) * filtros.porPagina
  let consulta = supabase.from('customers').select(seleccion, { count: 'exact' }).order('legal_name').range(desde, desde + filtros.porPagina - 1)
  if (filtros.estado !== 'todos') consulta = consulta.eq('is_active', filtros.estado === 'activos')
  const termino = filtros.busqueda.trim().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ')
  if (termino) consulta = consulta.or(`document_number.ilike.%${termino}%,legal_name.ilike.%${termino}%,trade_name.ilike.%${termino}%`)
  const { data, error, count } = await consulta
  if (error) {
    reportarErrorDeLectura(error)
    throw error
  }
  return { clientes: ((data ?? []) as unknown as FilaCliente[]).map(mapear), total: count ?? 0 }
}

export async function guardarCliente(datos: DatosCliente, id?: string) {
  const addresses = [
    ...(datos.direccion ? [{ id: datos.direccionFiscalId, addressType: 'FISCAL', addressLine: datos.direccion, ubigeoCode: datos.ubigeo, isDefault: true }] : []),
    ...datos.direccionesEntrega.map((d) => ({ id: d.id, addressType: 'DELIVERY', label: d.etiqueta, addressLine: d.direccion, ubigeoCode: d.ubigeo, reference: d.referencia, isDefault: d.principal })),
  ]
  const contacts = datos.contacto || datos.email || datos.telefono ? [{ id: datos.contactoPrincipalId, fullName: datos.contacto, email: datos.email, phone: datos.telefono, isPrimary: true }] : []
  const fuenteFiscal = datos.fuenteDatosFiscales || (datos.estadoSunat || datos.condicionDomicilio ? 'MANUAL' : null)
  const { data, error } = await supabase.rpc('save_customer', { payload: { id, documentType: datos.tipoDocumento.toUpperCase(), documentNumber: datos.numeroDocumento, legalName: datos.nombreRazonSocial, tradeName: datos.nombreComercial, taxpayerStatus: datos.estadoSunat, domicileCondition: datos.condicionDomicilio, taxDataSource: fuenteFiscal, taxCheckedAt: fuenteFiscal === 'APISPERU' ? datos.fechaConsultaSunat : null, isActive: datos.activo, addresses, contacts } })
  if (error) throw new Error(error.message.includes('CUSTOMER_DOCUMENT_ALREADY_EXISTS') ? 'Ya existe un cliente con este documento.' : error.message)
  return data as string
}

export async function cambiarEstadoCliente(id: string, activo: boolean) {
  const { error } = await supabase.rpc('set_customer_status', { requested_customer_id: id, requested_active: activo })
  if (error) throw error
}

export async function listarClientesActivos() {
  return listarTodosLosClientes({ busqueda: '', estado: 'activos' })
}

export async function listarTodosLosClientes(filtros: Pick<FiltrosClientes, 'busqueda' | 'estado'>) {
  const clientes: Cliente[] = []
  const porPagina = 500
  for (let pagina = 1; pagina <= 20; pagina += 1) {
    const resultado = await listarClientes({ ...filtros, pagina, porPagina })
    clientes.push(...resultado.clientes)
    if (clientes.length >= resultado.total) return clientes
  }
  throw new Error('La exportación supera el límite seguro de 10 000 clientes.')
}
