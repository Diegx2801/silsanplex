import { z } from "zod";
import type { RucData, RucProvider } from "./types.ts";
import { RucLookupError } from "./types.ts";

const responseSchema = z.object({
  razon_social: z.string().trim().min(2).max(300),
  numero_documento: z.string().regex(/^\d{11}$/),
  estado: z.string().trim().max(80).nullish(),
  condicion: z.string().trim().max(80).nullish(),
  direccion: z.string().trim().max(500).nullish(),
  ubigeo: z.string().trim().nullish(),
});

const errorSchema = z.object({
  error: z.string().trim().min(1).max(500).optional(),
  message: z.string().trim().min(1).max(500).optional(),
  detail: z.string().trim().min(1).max(500).optional(),
}).passthrough();

export interface DecolectaProviderOptions {
  token: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

const DEFAULT_URL = "https://api.decolecta.com/v1/sunat/ruc";

function optionalText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function providerFailure(status: number) {
  if (status === 404) {
    return new RucLookupError("RUC_NOT_FOUND", "No se encontró el RUC consultado.", 404);
  }
  if (status === 400 || status === 422) {
    return new RucLookupError("RUC_INVALID", "El RUC consultado no es válido.", 422);
  }
  if (status === 401 || status === 403) {
    return new RucLookupError(
      "RUC_PROVIDER_NOT_CONFIGURED",
      "La integración tributaria necesita revisar su configuración.",
      503,
    );
  }
  if (status === 429) {
    return new RucLookupError(
      "RUC_PROVIDER_RATE_LIMITED",
      "El servicio tributario alcanzó temporalmente su límite de consultas.",
      503,
    );
  }
  return new RucLookupError(
    "RUC_PROVIDER_UNAVAILABLE",
    "El servicio tributario no está disponible temporalmente.",
    502,
  );
}

function payloadFailure(payload: unknown) {
  const parsed = errorSchema.safeParse(payload);
  if (!parsed.success) return null;
  const message = parsed.data.error ?? parsed.data.message ?? parsed.data.detail;
  if (!message) return null;
  const normalized = message.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalized.includes("no encontr") || normalized.includes("no existe")) {
    return new RucLookupError("RUC_NOT_FOUND", "No se encontró el RUC consultado.", 404);
  }
  return new RucLookupError(
    "RUC_PROVIDER_RESPONSE_INVALID",
    "El servicio tributario devolvió una respuesta inválida.",
    502,
  );
}

export class DecolectaRucProvider implements RucProvider {
  readonly source = "DECOLECTA";
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options: DecolectaProviderOptions) {
    this.token = options.token.trim();
    this.baseUrl = (options.baseUrl ?? DEFAULT_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  async lookup(ruc: string): Promise<RucData> {
    if (!this.token) {
      throw new RucLookupError(
        "RUC_PROVIDER_NOT_CONFIGURED",
        "La integración tributaria no está configurada.",
        503,
      );
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set("numero", ruc);

    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new RucLookupError(
        "RUC_PROVIDER_UNAVAILABLE",
        "El servicio tributario no respondió a tiempo.",
        504,
      );
    }

    if (!response.ok) throw providerFailure(response.status);

    const payload: unknown = await response.json().catch(() => null);
    const failure = payloadFailure(payload);
    if (failure) throw failure;

    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.numero_documento !== ruc) {
      throw new RucLookupError(
        "RUC_PROVIDER_RESPONSE_INVALID",
        "El servicio tributario devolvió una respuesta inválida.",
        502,
      );
    }

    const ubigeo = optionalText(parsed.data.ubigeo);
    return {
      ruc,
      legalName: parsed.data.razon_social.trim(),
      taxpayerStatus: optionalText(parsed.data.estado).toUpperCase(),
      domicileCondition: optionalText(parsed.data.condicion).toUpperCase(),
      ubigeoCode: /^\d{6}$/.test(ubigeo) ? ubigeo : "",
      fiscalAddress: optionalText(parsed.data.direccion),
      source: this.source,
      checkedAt: new Date().toISOString(),
    };
  }
}
