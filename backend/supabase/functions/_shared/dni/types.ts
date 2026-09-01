export interface DniData {
  dni: string
  firstName: string
  firstLastName: string
  secondLastName: string
  fullName: string
  source: string
  checkedAt: string
}

export type DniLookupErrorCode =
  | 'DNI_INVALID'
  | 'DNI_NOT_FOUND'
  | 'DNI_PROVIDER_NOT_CONFIGURED'
  | 'DNI_PROVIDER_RATE_LIMITED'
  | 'DNI_PROVIDER_UNAVAILABLE'
  | 'DNI_PROVIDER_RESPONSE_INVALID'

export class DniLookupError extends Error {
  readonly code: DniLookupErrorCode
  readonly status: number

  constructor(code: DniLookupErrorCode, message: string, status: number) {
    super(message)
    this.name = 'DniLookupError'
    this.code = code
    this.status = status
  }
}
