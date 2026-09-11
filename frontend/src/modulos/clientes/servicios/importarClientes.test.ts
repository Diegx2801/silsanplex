import { describe, expect, it } from 'vitest'
import { mensajeErrorImportacionCliente } from './importarClientes'

describe('importarClientes', () => {
  it('traduce errores de permisos y validación sin exponer detalles del backend', () => {
    expect(mensajeErrorImportacionCliente({ code: '42501', message: 'permission denied for table customers' }))
      .toBe('No tienes permiso para importar clientes.')
    expect(mensajeErrorImportacionCliente({ code: '22023', message: 'INVALID_CUSTOMER_IMPORT_SIZE' }))
      .toBe('El archivo debe contener entre 1 y 500 filas válidas.')
    expect(mensajeErrorImportacionCliente({ code: 'XX000', message: 'internal database detail' }))
      .toBe('No se pudo importar el archivo. Revisa el formato e inténtalo nuevamente.')
  })
})
