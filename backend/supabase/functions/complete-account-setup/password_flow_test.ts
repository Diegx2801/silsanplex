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
    isEmailActionSession: false,
    isRecoverySession: false,
    passwordRecoveryPending: false,
  }), 'not-pending')
})

Deno.test('una sesión de correo OTP con recuperación solicitada puede cambiar contraseña', () => {
  assertEquals(resolvePasswordUpdateFlow({
    passwordSetupRequired: false,
    emailConfirmed: true,
    isEmailActionSession: true,
    isRecoverySession: false,
    passwordRecoveryPending: true,
  }), 'recovery')
})

Deno.test('rechaza recuperación sin correo confirmado', () => {
  assertEquals(resolvePasswordUpdateFlow({
    passwordSetupRequired: false,
    emailConfirmed: false,
    isEmailActionSession: true,
    isRecoverySession: true,
    passwordRecoveryPending: true,
  }), 'email-unconfirmed')
})

Deno.test('una invitación confirmada completa solo el flujo de configuración inicial', () => {
  assertEquals(resolvePasswordUpdateFlow({
    passwordSetupRequired: true,
    emailConfirmed: true,
    isEmailActionSession: true,
    isRecoverySession: false,
    passwordRecoveryPending: false,
  }), 'invitation')
})

Deno.test('rechaza una invitación aún no confirmada', () => {
  assertEquals(resolvePasswordUpdateFlow({
    passwordSetupRequired: true,
    emailConfirmed: false,
    isEmailActionSession: true,
    isRecoverySession: false,
    passwordRecoveryPending: false,
  }), 'email-unconfirmed')
})

Deno.test('rechaza una sesión de recuperación sobre una invitación pendiente', () => {
  assertEquals(resolvePasswordUpdateFlow({
    passwordSetupRequired: true,
    emailConfirmed: true,
    isEmailActionSession: true,
    isRecoverySession: true,
    passwordRecoveryPending: true,
  }), 'flow-conflict')
})

Deno.test('rechaza OTP de correo cuando no hay recuperación autorizada por administración', () => {
  assertEquals(resolvePasswordUpdateFlow({
    passwordSetupRequired: false,
    emailConfirmed: true,
    isEmailActionSession: true,
    isRecoverySession: false,
    passwordRecoveryPending: false,
  }), 'not-pending')
})

Deno.test('rechaza una sesión normal aunque el perfil tenga recuperación pendiente', () => {
  assertEquals(resolvePasswordUpdateFlow({
    passwordSetupRequired: false,
    emailConfirmed: true,
    isEmailActionSession: false,
    isRecoverySession: false,
    passwordRecoveryPending: true,
  }), 'not-pending')
})

Deno.test('rechaza una sesión normal para completar una invitación pendiente', () => {
  assertEquals(resolvePasswordUpdateFlow({
    passwordSetupRequired: true,
    emailConfirmed: true,
    isEmailActionSession: false,
    isRecoverySession: false,
    passwordRecoveryPending: false,
  }), 'not-pending')
})
