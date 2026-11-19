import { resolvePasswordUpdateFlow } from '../_shared/password-flow.ts'

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Se esperaba ${String(expected)} y se recibió ${String(actual)}`)
  }
}

Deno.test('una sesión común no cambia contraseña por el endpoint de invitación', () => {
  assertEquals(resolvePasswordUpdateFlow({
    passwordSetupRequired: false,
    emailConfirmed: true,
    isRecoverySession: false,
  }), 'not-pending')
})

Deno.test('solo una sesión AMR recovery puede iniciar la recuperación', () => {
  assertEquals(resolvePasswordUpdateFlow({
    passwordSetupRequired: false,
    emailConfirmed: true,
    isRecoverySession: true,
  }), 'recovery')
})

Deno.test('rechaza recuperación sin correo confirmado', () => {
  assertEquals(resolvePasswordUpdateFlow({
    passwordSetupRequired: false,
    emailConfirmed: false,
    isRecoverySession: true,
  }), 'email-unconfirmed')
})

Deno.test('una invitación confirmada completa solo el flujo de configuración inicial', () => {
  assertEquals(resolvePasswordUpdateFlow({
    passwordSetupRequired: true,
    emailConfirmed: true,
    isRecoverySession: false,
  }), 'invitation')
})

Deno.test('rechaza una invitación aún no confirmada', () => {
  assertEquals(resolvePasswordUpdateFlow({
    passwordSetupRequired: true,
    emailConfirmed: false,
    isRecoverySession: false,
  }), 'email-unconfirmed')
})

Deno.test('rechaza una sesión de recuperación sobre una invitación pendiente', () => {
  assertEquals(resolvePasswordUpdateFlow({
    passwordSetupRequired: true,
    emailConfirmed: true,
    isRecoverySession: true,
  }), 'flow-conflict')
})
