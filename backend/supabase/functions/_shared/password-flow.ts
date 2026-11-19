export interface PasswordFlowState {
  passwordSetupRequired: boolean
  emailConfirmed: boolean
  isRecoverySession: boolean
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
    return 'invitation'
  }

  if (state.isRecoverySession) {
    return state.emailConfirmed ? 'recovery' : 'email-unconfirmed'
  }

  return 'not-pending'
}
