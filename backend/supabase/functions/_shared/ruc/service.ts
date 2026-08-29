import type { SupabaseClient } from '@supabase/supabase-js'
import type { RucData, RucLookupResult, RucProvider } from './types.ts'
import { RucLookupError } from './types.ts'

interface CacheRow {
  id: string
  ruc: string
  legal_name: string
  taxpayer_status: string | null
  domicile_condition: string | null
  ubigeo_code: string | null
  fiscal_address: string | null
  source: string
  source_checked_at: string
}

function fromCache(row: CacheRow): RucLookupResult {
  return {
    lookupId: row.id,
    ruc: row.ruc,
    legalName: row.legal_name,
    taxpayerStatus: row.taxpayer_status ?? '',
    domicileCondition: row.domicile_condition ?? '',
    ubigeoCode: row.ubigeo_code ?? '',
    fiscalAddress: row.fiscal_address ?? '',
    source: row.source,
    checkedAt: row.source_checked_at,
    cacheHit: true,
  }
}

export class RucLookupService {
  constructor(
    private readonly adminClient: SupabaseClient,
    private readonly provider: RucProvider,
    private readonly cacheTtlHours: number,
  ) {}

  async lookup(ruc: string): Promise<RucLookupResult> {
    const { data: cached, error: cacheReadError } = await this.adminClient
      .from('ruc_lookup_cache')
      .select(
        'id,ruc,legal_name,taxpayer_status,domicile_condition,ubigeo_code,fiscal_address,source,source_checked_at',
      )
      .eq('ruc', ruc)
      .eq('source', this.provider.source)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (cacheReadError) {
      throw new RucLookupError(
        'RUC_LOOKUP_STORAGE_FAILED',
        'No se pudo acceder temporalmente al servicio de consultas.',
        500,
      )
    }
    if (cached) return fromCache(cached as CacheRow)

    const result = await this.provider.lookup(ruc)
    const expiresAt = new Date(
      new Date(result.checkedAt).getTime() + this.cacheTtlHours * 60 * 60 * 1_000,
    ).toISOString()
    const row = {
      ruc: result.ruc,
      legal_name: result.legalName,
      taxpayer_status: result.taxpayerStatus || null,
      domicile_condition: result.domicileCondition || null,
      ubigeo_code: result.ubigeoCode || null,
      fiscal_address: result.fiscalAddress || null,
      source: result.source,
      source_checked_at: result.checkedAt,
      expires_at: expiresAt,
    }
    const { data: saved, error: cacheWriteError } = await this.adminClient
      .from('ruc_lookup_cache')
      .upsert(row, { onConflict: 'ruc' })
      .select('id')
      .maybeSingle()

    if (cacheWriteError) {
      throw new RucLookupError(
        'RUC_LOOKUP_STORAGE_FAILED',
        'No se pudo conservar la consulta tributaria.',
        500,
      )
    }

    return {
      ...result,
      lookupId: typeof saved?.id === 'string' ? saved.id : null,
      cacheHit: false,
    }
  }
}

export function toCustomerTaxMetadata(data: RucData) {
  return {
    taxDataSource: data.source,
    taxCheckedAt: data.checkedAt,
  }
}
