import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
  },
}))

import { SESSION_INVALIDATED_EVENT } from '@/features/auth/sessionEvents'
import { EdgeFunctionError, invokeEdgeFunction } from '@/lib/edgeFunctions'

describe('invokeEdgeFunction', () => {
  it('notifica globalmente cuando la API rechaza una sesión', async () => {
    const listener = vi.fn()
    window.addEventListener(SESSION_INVALIDATED_EVENT, listener)
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({
            error: { code: 'UNAUTHORIZED', message: 'Sesión inválida.' },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      },
    })

    await expect(
      invokeEdgeFunction('admin-users', { action: 'list' }),
    ).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    } satisfies Partial<EdgeFunctionError>)
    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener(SESSION_INVALIDATED_EVENT, listener)
  })

  it('no invalida la sesión ante un fallo interno reintentable', async () => {
    const listener = vi.fn()
    window.addEventListener(SESSION_INVALIDATED_EVENT, listener)
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({
            error: { code: 'INTERNAL_ERROR', message: 'Error interno.' },
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        ),
      },
    })

    await expect(
      invokeEdgeFunction('admin-users', { action: 'list' }),
    ).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' })
    expect(listener).not.toHaveBeenCalled()
    window.removeEventListener(SESSION_INVALIDATED_EVENT, listener)
  })
})
