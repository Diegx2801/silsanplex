export const SESSION_INVALIDATED_EVENT = 'silsanplex:session-invalidated'

export interface SessionInvalidatedDetail {
  message: string
}

export function notifySessionInvalidated(
  message = 'Tu sesión expiró. Inicia sesión nuevamente.',
) {
  window.dispatchEvent(
    new CustomEvent<SessionInvalidatedDetail>(SESSION_INVALIDATED_EVENT, {
      detail: { message },
    }),
  )
}

export function isSessionInvalidationEvent(
  event: Event,
): event is CustomEvent<SessionInvalidatedDetail> {
  return (
    event instanceof CustomEvent &&
    typeof event.detail?.message === 'string'
  )
}
