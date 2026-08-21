export interface RucData {
  ruc: string
  legalName: string
  taxpayerStatus: string
  domicileCondition: string
  ubigeoCode: string
  fiscalAddress: string
  source: string
  checkedAt: string
}

export interface RucLookupResult extends RucData {
  lookupId: string | null
  cacheHit: boolean
}

export interface RucProvider {
  lookup(ruc: string): Promise<RucData>
}

export type RucLookupErrorCode =
  | 'RUC_INVALID'
  | 'RUC_NOT_FOUND'
  | 'RUC_PROVIDER_NOT_CONFIGURED'
  | 'RUC_PROVIDER_RATE_LIMITED'
  | 'RUC_PROVIDER_UNAVAILABLE'
  | 'RUC_PROVIDER_RESPONSE_INVALID'
  | 'RUC_LOOKUP_STORAGE_FAILED'

export class RucLookupError extends Error {
  readonly code: RucLookupErrorCode
  readonly status: number

  constructor(code: RucLookupErrorCode, message: string, status: number) {
    super(message)
    this.name = 'RucLookupError'
    this.code = code
    this.status = status
  }
}
