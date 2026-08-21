import type { PostgrestError } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import type {
  DatosProveedor,
  Proveedor,
} from '@/modulos/proveedores/modelo/proveedor'

interface ProveedorFila {
  id: string
  organization_id: string
  code: string | null
  document_type: Proveedor['tipoDocumento']
  document_number: string
  business_name: string
  trade_name: string | null
  contact_name: string | null
  contact_position: string | null
  email: string | null
  phone: string | null
  fiscal_address: string | null
  geographic_zone: string | null
  product_types: string | null
  category: Proveedor['categoria']
  delivery_frequency: Proveedor['frecuenciaEntrega']
  performance_rating: number | null
  credit_condition: Proveedor['condicionCredito']
  credit_days: number
  currency: Proveedor['moneda']
  bank_name: string | null
  sunat_status: Proveedor['estadoSunat']
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

const columnasProveedor =
  'id,organization_id,code,document_type,document_number,business_name,trade_name,contact_name,contact_position,email,phone,fiscal_address,geographic_zone,product_types,category,delivery_frequency,performance_rating,credit_condition,credit_days,currency,bank_name,sunat_status,notes,is_active,created_at,updated_at' as const

function textoONulo(valor: string) {
  const normalizado = valor.trim()
  return normalizado === '' ? null : normalizado
}

function mapearProveedor(fila: ProveedorFila): Proveedor {
  return {
    id: fila.id,
    organizationId: fila.organization_id,
    codigo: fila.code ?? '',
    tipoDocumento: fila.document_type,
    numeroDocumento: fila.document_number,
    razonSocial: fila.business_name,
    nombreComercial: fila.trade_name ?? '',
    contacto: fila.contact_name ?? '',
    cargoContacto: fila.contact_position ?? '',
    email: fila.email ?? '',
    telefono: fila.phone ?? '',
    direccion: fila.fiscal_address ?? '',
    zonaGeografica: fila.geographic_zone ?? '',
    tiposProducto: fila.product_types ?? '',
    categoria: fila.category,
    frecuenciaEntrega: fila.delivery_frequency,
    calificacionDesempeno: fila.performance_rating,
    condicionCredito: fila.credit_condition,
    diasCredito: fila.credit_days,
    moneda: fila.currency,
    banco: fila.bank_name ?? '',
    cuentaBancaria: '',
    cuentaDetraccion: '',
    estadoSunat: fila.sunat_status,
    observaciones: fila.notes ?? '',
    activo: fila.is_active,
    fechaRegistro: fila.created_at,
    fechaActualizacion: fila.updated_at,
  }
}

function mensajeError(error: PostgrestError) {
  if (error.code === '23505') {
    if (error.message.includes('organization_document')) {
      return 'Ya existe un proveedor con este documento.'
    }
    if (error.message.includes('organization_code')) {
      return 'Ya existe un proveedor con este código.'
    }
  }
  if (error.code === '42501') {
    return 'No tienes permiso para realizar esta operación.'
  }
  if (error.code === '23514') {
    return 'Los datos no cumplen las reglas fiscales o comerciales.'
  }
  return 'No se pudo guardar el proveedor. Revisa los datos e inténtalo nuevamente.'
}

function prepararFila(
  organizationId: string,
  userId: string,
  datos: DatosProveedor,
  esNuevo: boolean,
) {
  const cuentas = {
    ...(esNuevo || datos.cuentaBancaria.trim()
      ? { bank_account: textoONulo(datos.cuentaBancaria) }
      : {}),
    ...(esNuevo || datos.cuentaDetraccion.trim()
      ? { detraccion_account: textoONulo(datos.cuentaDetraccion) }
      : {}),
  }

  return {
    organization_id: organizationId,
    code: textoONulo(datos.codigo.toUpperCase()),
    document_type: datos.tipoDocumento,
    document_number: datos.numeroDocumento.toUpperCase(),
    business_name: datos.razonSocial,
    trade_name: textoONulo(datos.nombreComercial),
    contact_name: textoONulo(datos.contacto),
    contact_position: textoONulo(datos.cargoContacto),
    email: textoONulo(datos.email.toLowerCase()),
    phone: textoONulo(datos.telefono),
    fiscal_address: textoONulo(datos.direccion),
    geographic_zone: textoONulo(datos.zonaGeografica),
    product_types: textoONulo(datos.tiposProducto),
    category: datos.categoria,
    delivery_frequency: datos.frecuenciaEntrega,
    performance_rating:
      datos.calificacionDesempeno === ''
        ? null
        : Number(datos.calificacionDesempeno),
    credit_condition: datos.condicionCredito,
    credit_days: Number(datos.diasCredito),
    currency: datos.moneda,
    bank_name: textoONulo(datos.banco),
    ...cuentas,
    sunat_status: datos.estadoSunat,
    notes: textoONulo(datos.observaciones),
    is_active: datos.activo,
    updated_by: userId,
  }
}

export async function listarProveedores(
  organizationId: string,
): Promise<Proveedor[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select(columnasProveedor)
    .eq('organization_id', organizationId)
    .order('business_name', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw new Error(mensajeError(error))
  return ((data ?? []) as ProveedorFila[]).map(mapearProveedor)
}

export async function guardarProveedor(
  organizationId: string,
  userId: string,
  datos: DatosProveedor,
  proveedorId?: string,
): Promise<Proveedor> {
  const fila = prepararFila(organizationId, userId, datos, !proveedorId)

  if (proveedorId) {
    const { data, error } = await supabase
      .from('suppliers')
      .update(fila)
      .eq('id', proveedorId)
      .eq('organization_id', organizationId)
      .select(columnasProveedor)
      .single()

    if (error) throw new Error(mensajeError(error))
    return mapearProveedor(data as ProveedorFila)
  }

  const { data, error } = await supabase
    .from('suppliers')
    .insert({ ...fila, created_by: userId })
    .select(columnasProveedor)
    .single()

  if (error) throw new Error(mensajeError(error))
  return mapearProveedor(data as ProveedorFila)
}
