import { z } from "zod";
import type { DniData } from "./types.ts";
import { DniLookupError } from "./types.ts";

const responseSchema = z.object({
  first_name: z.string().trim().max(160).optional(),
  first_last_name: z.string().trim().max(160).optional(),
  second_last_name: z.string().trim().max(160).optional(),
  full_name: z.string().trim().min(2).max(320),
  document_number: z.string().regex(/^\d{8}$/),
}).passthrough();

const errorSchema = z.object({
  error: z.string().trim().min(1).max(500).optional(),
  message: z.string().trim().min(1).max(500).optional(),
  detail: z.string().trim().min(1).max(500).optional(),
}).passthrough();

export interface DecolectaDniProviderOptions {
  token: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

const DEFAULT_URL = "https://api.decolecta.com/v1/reniec/dni";

function providerFailure(status: number) {
  if (status === 404) {
    return new DniLookupError("DNI_NOT_FOUND", "No se encontró el DNI consultado.", 404);
  }
  if (status === 400 || status === 422) {
    return new DniLookupError("DNI_INVALID", "El DNI consultado no es válido.", 422);
  }
  if (status === 401 || status === 403) {
    return new DniLookupError(
      "DNI_PROVIDER_NOT_CONFIGURED",
      "La integración de identidad necesita revisar su configuración.",
      503,
    );
  }
  if (status === 429) {
    return new DniLookupError(
      "DNI_PROVIDER_RATE_LIMITED",
      "El servicio de identidad alcanzó temporalmente su límite de consultas.",
      429,
    );
  }
  return new DniLookupError(
    "DNI_PROVIDER_UNAVAILABLE",
    "El servicio de identidad no está disponible temporalmente.",
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
  if (normalized.includes("no encontr") || normalized.includes("not found") || normalized.includes("no existe")) {
    return new DniLookupError("DNI_NOT_FOUND", "No se encontró el DNI consultado.", 404);
  }
  if (normalized.includes("dni no valido") || normalized.includes("dni invalido")) {
    return new DniLookupError("DNI_INVALID", "El DNI consultado no es válido.", 422);
  }
  return new DniLookupError(
    "DNI_PROVIDER_RESPONSE_INVALID",
    "El servicio de identidad devolvió una respuesta inválida.",
    502,
  );
}

export class DecolectaDniProvider {
  readonly source = "DECOLECTA_RENIEC";
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options: DecolectaDniProviderOptions) {
    this.token = options.token.trim();
    this.baseUrl = (options.baseUrl ?? DEFAULT_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  async lookup(dni: string): Promise<DniData> {
    if (!this.token) {
      throw new DniLookupError(
        "DNI_PROVIDER_NOT_CONFIGURED",
        "La integración de identidad no está configurada.",
        503,
      );
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set("numero", dni);

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
      throw new DniLookupError(
        "DNI_PROVIDER_UNAVAILABLE",
        "El servicio de identidad no respondió a tiempo.",
        504,
      );
    }

    if (!response.ok) throw providerFailure(response.status);

    const payload: unknown = await response.json().catch(() => null);
    const failure = payloadFailure(payload);
    if (failure) throw failure;

    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.document_number !== dni) {
      throw new DniLookupError(
        "DNI_PROVIDER_RESPONSE_INVALID",
        "El servicio de identidad devolvió una respuesta inválida.",
        502,
      );
    }

    return {
      dni,
      firstName: parsed.data.first_name?.trim() ?? "",
      firstLastName: parsed.data.first_last_name?.trim() ?? "",
      secondLastName: parsed.data.second_last_name?.trim() ?? "",
      fullName: parsed.data.full_name.trim(),
      source: this.source,
      checkedAt: new Date().toISOString(),
    };
  }
}
