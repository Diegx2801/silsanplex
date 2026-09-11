import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { mensajeErrorGuardadoCliente } from './customerService'

describe('mensajes de persistencia de clientes', () => {
  it('traduce errores de validación de direcciones', () => {
    expect(mensajeErrorGuardadoCliente({ code: '23514', message: 'customer_addresses_ubigeo_format' }))
      .toBe('El ubigeo de una dirección debe contener 6 dígitos.')
    expect(mensajeErrorGuardadoCliente({ code: '23505', message: 'customer_addresses_one_default_delivery_idx' }))
      .toBe('Solo puede existir una dirección de entrega principal.')
  })

  it('traduce el formato telefónico inválido', () => {
    expect(mensajeErrorGuardadoCliente({ code: '23514', message: 'customer_contacts_phone_format' }))
      .toBe('El teléfono debe tener entre 7 y 15 dígitos y usar un formato válido.')
  })

  it('conserva un mensaje seguro para errores desconocidos', () => {
    expect(mensajeErrorGuardadoCliente({ code: 'XX000', message: 'detalle interno' }))
      .toBe('No se pudo guardar el cliente. Revisa los datos e inténtalo nuevamente.')
  })
})
