import { expect, test as base, type Request } from '@playwright/test'
import { assertSilsanInstance } from './operational.js'

// Applied to every context, including extra tabs used by auth and repairs.
// Normal backend preflight remains unchanged; isolation is explicitly opted in.
export const test = base.extend<{ isolatedDestination: void }>({
  isolatedDestination: [async ({ context, request }, runTest) => {
    if (process.env.SILSAN_ACCESSORY_CI_E2E === '1') {
      assertSilsanInstance('isolated-accessory-ci')
      const api = process.env.E2E_ACCESSORY_API_URL?.trim()
      const web = process.env.E2E_ACCESSORY_WEB_URL?.trim()
      expect(process.env.VITE_SUPABASE_URL).toBe(api)
      const forbidden: string[] = []
      const allowed = (address: string) => {
        const url = new URL(address)
        if (['54321','54322'].includes(url.port)) return false
        if (/^\/(auth|rest|functions|storage)\/v1\//.test(url.pathname)) return url.origin === api
        return !/^https?:$/.test(url.protocol) || [web,api].includes(url.origin)
      }
      const observe = (item: Request) => { if (!allowed(item.url())) forbidden.push(new URL(item.url()).origin) }
      context.on('request',observe)
      await context.route('**/*',async route => {
        if (!allowed(route.request().url())) {
          forbidden.push(new URL(route.request().url()).origin)
          await route.abort('blockedbyclient')
        } else await route.fallback()
      })
      await context.routeWebSocket(/.*/,socket => {
        if (new URL(socket.url()).origin === web?.replace('http:','ws:')) socket.connectToServer()
        else { forbidden.push(new URL(socket.url()).origin); socket.close() }
      })
      try { await runTest() } finally {
        context.off('request',observe)
        expect(forbidden,'Disposable operational E2E cannot access a persistent/external service').toEqual([])
      }
      return
    }
    if (process.env.SILSAN_PHASE2C2_E2E !== '1') {
      await runTest()
      return
    }
    assertSilsanInstance('isolated-phase2c2')
    expect(process.env.VITE_SUPABASE_URL).toBe('http://127.0.0.1:58121')
    const moduleResponse = await request.get('/src/lib/supabase.ts')
    expect(moduleResponse.ok()).toBeTruthy()
    const moduleSource = await moduleResponse.text()
    expect(moduleSource).toContain('http://127.0.0.1:58121')
    expect(moduleSource).not.toContain('http://127.0.0.1:54321')
    const forbidden: string[] = []
    const allowed = (address: string) => {
      const url = new URL(address)
      if (['54321', '54322'].includes(url.port)) return false
      if (/^\/(auth|rest|functions|storage)\/v1\//.test(url.pathname)) {
        return url.origin === 'http://127.0.0.1:58121'
      }
      return !/^https?:$/.test(url.protocol)
        || ['http://127.0.0.1:5173', 'http://127.0.0.1:58121'].includes(url.origin)
    }
    const observe = (item: Request) => {
      if (!allowed(item.url())) forbidden.push(new URL(item.url()).origin)
    }
    context.on('request', observe)
    await context.route('**/*', async (route) => {
      if (!allowed(route.request().url())) {
        forbidden.push(new URL(route.request().url()).origin)
        await route.abort('blockedbyclient')
      } else await route.fallback()
    })
    try { await runTest() } finally {
      context.off('request', observe)
      expect(forbidden, 'No request may target backend or an external API').toEqual([])
    }
  }, { auto: true }],
})
