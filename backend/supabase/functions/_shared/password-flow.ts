export interface PasswordFlowState {
  passwordSetupRequired: boolean
  emailConfirmed: boolean
  isEmailActionSession: boolean
  isRecoverySession: boolean
  passwordRecoveryPending: boolean
}

export type PasswordUpdateFlow =
  | 'invitation'
  | 'recovery'
  | 'email-unconfirmed'
  | 'flow-conflict'
  | 'not-pending'

export function resolvePasswordUpdateFlow(
  state: PasswordFlowState,
): PasswordUpdateFlow {
  if (state.passwordSetupRequired) {
    if (!state.emailConfirmed) return 'email-unconfirmed'
    if (state.isRecoverySession) return 'flow-conflict'
    if (!state.isEmailActionSession) return 'not-pending'
    return 'invitation'
  }

  if (state.passwordRecoveryPending && state.isEmailActionSession) {
    return state.emailConfirmed ? 'recovery' : 'email-unconfirmed'
  }

  return 'not-pending'
}
