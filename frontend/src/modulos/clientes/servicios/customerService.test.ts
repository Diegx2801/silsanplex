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

  it('conserva un mensaje seguro para errores desconocidos', () => {
    expect(mensajeErrorGuardadoCliente({ code: 'XX000', message: 'detalle interno' }))
      .toBe('No se pudo guardar el cliente. Revisa los datos e inténtalo nuevamente.')
  })
})
