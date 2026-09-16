import type { Cliente } from '@/modulos/clientes/modelo/cliente'

export async function exportarClientes(clientes: Cliente[]) {
  const XLSX = await import('xlsx')
  const filas = clientes.map((cliente) => ({
    TIPO_DOCUMENTO: cliente.tipoDocumento.toUpperCase(),
    NUMERO_DOCUMENTO: cliente.numeroDocumento,
    RAZON_SOCIAL: cliente.nombreRazonSocial,
    NOMBRE_COMERCIAL: cliente.nombreComercial,
    CONTACTO: cliente.contacto,
    TELEFONO: cliente.telefono,
    EMAIL: cliente.email,
    DIRECCION_FISCAL: cliente.direccion,
    UBIGEO: cliente.ubigeo,
    ESTADO_SUNAT: cliente.estadoSunat,
    CONDICION_DOMICILIO: cliente.condicionDomicilio,
    ACTIVO: cliente.activo ? 'SI' : 'NO',
  }))
  const filasDirecciones = clientes.flatMap((cliente) => cliente.direccionesEntrega.map((direccion) => ({
    TIPO_DOCUMENTO: cliente.tipoDocumento.toUpperCase(),
    NUMERO_DOCUMENTO: cliente.numeroDocumento,
    ID_DIRECCION: direccion.id ?? '',
    ETIQUETA: direccion.etiqueta,
    DIRECCION: direccion.direccion,
    UBIGEO: direccion.ubigeo,
    REFERENCIA: direccion.referencia,
    PRINCIPAL: direccion.principal ? 'SI' : 'NO',
  })))
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), 'Clientes')
  XLSX.utils.book_append_sheet(
    libro,
    XLSX.utils.json_to_sheet(filasDirecciones, {
      header: [
        'TIPO_DOCUMENTO', 'NUMERO_DOCUMENTO', 'ID_DIRECCION', 'ETIQUETA',
        'DIRECCION', 'UBIGEO', 'REFERENCIA', 'PRINCIPAL',
      ],
    }),
    'DireccionesEntrega',
  )
  XLSX.writeFile(libro, `clientes-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
