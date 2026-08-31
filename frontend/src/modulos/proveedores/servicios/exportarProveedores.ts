import type { Proveedor } from '@/modulos/proveedores/modelo/proveedor'

export async function exportarProveedores(proveedores: readonly Proveedor[]) {
  const XLSX = await import('xlsx')
  const rows = proveedores.map((item) => ({
    RUC_DNI: item.numeroDocumento,
    CODIGO: item.codigo,
    TIPO_DOCUMENTO_IDENTIDAD: item.tipoDocumento.toUpperCase(),
    RAZON_SOCIAL: item.razonSocial,
    NOMBRE_COMERCIAL: item.nombreComercial,
    CONTACTO: item.contacto,
    TELEFONO: item.telefono,
    DIRECCION: item.direccion,
    EMAIL: item.email,
    UBIGEO: item.ubigeo,
    ESTADO_SUNAT: item.estadoContribuyente,
    CONDICION_DOMICILIO: item.condicionDomicilio,
    ACTIVO: item.activo ? 'SI' : 'NO',
  }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Proveedores')
  XLSX.writeFile(workbook, `proveedores-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true })
}
