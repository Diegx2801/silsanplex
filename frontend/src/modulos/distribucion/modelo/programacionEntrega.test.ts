import { describe, expect, it } from 'vitest'

import { esquemaDatosEntrega, fechaLocalISO, type DatosEntrega } from './programacionEntrega'

const pedido = {
  id: '43b7caf5-8d28-443d-82bd-68f7a821208f',
  numero: 'PED-000001',
  clienteId: '3a3a285b-272d-4f40-96ce-ae5649b86847',
  clienteDocumento: '20548796321',
  clienteNombre: 'Boticas El Sol SAC',
  fechaPedido: '2026-08-26',
  direccionEntrega: 'Av. Los Álamos 120',
  referenciaEntrega: 'Frente al parque',
  contactoNombre: 'Ana Torres',
  contactoTelefono: '999888777',
  estado: 'pendiente' as const,
  lineas: [{
    id: 'de8d8990-ad7e-433e-b508-dcf8ef44ba44',
    productoId: '5486f016-cb62-43bc-8497-7c4201fecb42',
    productoCodigo: 'MED-001',
    productoDescripcion: 'Paracetamol 500 mg',
    unidadMedida: 'Caja',
    cantidadOrdenada: 10,
  }],
}

const datosBase: DatosEntrega = {
  pedido,
  fechaEntrega: '2026-08-27',
  numeroGuiaRemision: 'T001-000001',
  tipoTransporte: 'interno',
  transportistaNombre: '',
  transportistaDocumento: '',
  conductorNombre: 'Carlos Díaz',
  conductorDocumento: '45678901',
  conductorLicencia: 'Q12345678',
  vehiculoPlaca: 'ABC-123',
  direccionEntrega: pedido.direccionEntrega,
  referenciaEntrega: pedido.referenciaEntrega,
  contactoNombre: pedido.contactoNombre,
  contactoTelefono: pedido.contactoTelefono,
  observaciones: '',
  lineas: [{ fuenteLineaId: pedido.lineas[0].id, cantidad: 6, lote: 'L-001', fechaVencimiento: '2027-12-31' }],
}

describe('programación de distribución', () => {
  it('acepta un despacho parcial con trazabilidad logística', () => {
    expect(esquemaDatosEntrega.safeParse(datosBase).success).toBe(true)
  })

  it('exige transportista cuando el servicio es externo', () => {
    const resultado = esquemaDatosEntrega.safeParse({ ...datosBase, tipoTransporte: 'externo' })

    expect(resultado.success).toBe(false)
    if (!resultado.success) expect(resultado.error.issues[0]).toMatchObject({ path: ['transportistaNombre'] })
  })

  it('rechaza cantidades nulas o negativas', () => {
    const resultado = esquemaDatosEntrega.safeParse({
      ...datosBase,
      lineas: [{ ...datosBase.lineas[0], cantidad: 0 }],
    })

    expect(resultado.success).toBe(false)
  })

  it('calcula la fecha operativa con la zona horaria de Lima', () => {
    expect(fechaLocalISO(new Date('2026-08-27T02:30:00.000Z'))).toBe('2026-08-26')
  })
})
