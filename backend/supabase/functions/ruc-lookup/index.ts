import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AuthorizationError,
  authorizeRequest,
  ConfigurationError,
} from "../_shared/authorization.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import { DecolectaRucProvider } from "../_shared/ruc/decolecta-provider.ts";
import { RucLookupService } from "../_shared/ruc/service.ts";
import { RucLookupError } from "../_shared/ruc/types.ts";

const requestSchema = z.object({
  ruc: z.string().trim().regex(/^\d{11}$/),
}).strict();

function integerEnvironmentValue(
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const configured = Number(Deno.env.get(name) ?? fallback);
  return Number.isInteger(configured) && configured >= min && configured <= max
    ? configured
    : fallback;
}

async function auditLookup(
  adminClient: Awaited<ReturnType<typeof authorizeRequest>>["adminClient"],
  organizationId: string,
  userId: string,
  ruc: string,
  source: string,
  cacheHit: boolean,
  success: boolean,
) {
  const { error } = await adminClient.rpc("record_ruc_lookup_audit", {
    requested_organization_id: organizationId,
    requested_actor_user_id: userId,
    requested_ruc: ruc,
    requested_source: source,
    requested_cache_hit: cacheHit,
    requested_success: success,
  });
  if (error) throw error;
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (!headers) {
    return errorResponse(
      { code: "ORIGIN_NOT_ALLOWED", message: "Origen no permitido." },
      403,
      {},
    );
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    return errorResponse(
      { code: "METHOD_NOT_ALLOWED", message: "Método no permitido." },
      405,
      headers,
    );
  }

  let organizationId: string | null = null;
  let actorId: string | null = null;
  let adminClient: SupabaseClient | null = null;
  let requestedRuc = "";
  try {
    const authorization = await authorizeRequest(request);
    adminClient = authorization.adminClient;
    actorId = authorization.actor.id;
    const parsed = requestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return errorResponse(
        {
          code: "RUC_INVALID",
          message: "Ingresa un RUC válido de 11 dígitos.",
        },
        422,
        headers,
      );
    }
    requestedRuc = parsed.data.ruc;

    const { data: resolvedOrganization, error: organizationError } =
      await authorization.adminClient.rpc(
        "resolve_edge_user_organization_permission",
        {
          requested_user_id: actorId,
          requested_permission: "CUSTOMERS_MANAGE",
        },
      );
    if (organizationError || typeof resolvedOrganization !== "string") {
      return errorResponse(
        {
          code: "FORBIDDEN",
          message: "No tienes permiso para consultar datos tributarios.",
        },
        403,
        headers,
      );
    }
    organizationId = resolvedOrganization;

    const rateLimit = integerEnvironmentValue(
      "RUC_LOOKUP_RATE_LIMIT_PER_MINUTE",
      30,
      1,
      1000,
    );
    const { data: allowed, error: rateLimitError } = await authorization
      .adminClient.rpc(
        "consume_ruc_lookup_rate_limit",
        {
          requested_organization_id: organizationId,
          requested_user_id: actorId,
          requested_limit: rateLimit,
          requested_window_seconds: 60,
        },
      );
    if (rateLimitError) throw rateLimitError;
    if (allowed !== true) {
      return errorResponse(
        {
          code: "RUC_LOOKUP_RATE_LIMITED",
          message:
            "Realizaste demasiadas consultas. Intenta nuevamente en un minuto.",
        },
        429,
        headers,
      );
    }

    const provider = new DecolectaRucProvider({
      token: Deno.env.get("DECOLECTA_API_TOKEN") ?? "",
      baseUrl: Deno.env.get("DECOLECTA_API_URL"),
      timeoutMs: integerEnvironmentValue(
        "RUC_LOOKUP_TIMEOUT_MS",
        5_000,
        1_000,
        15_000,
      ),
    });
    const service = new RucLookupService(
      authorization.adminClient,
      provider,
      integerEnvironmentValue("RUC_LOOKUP_CACHE_TTL_HOURS", 24, 1, 168),
    );
    const result = await service.lookup(requestedRuc);
    await auditLookup(
      authorization.adminClient,
      organizationId,
      actorId,
      requestedRuc,
      result.source,
      result.cacheHit,
      true,
    );
    return jsonResponse({ data: result }, 200, headers);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(
        { code: "UNAUTHORIZED", message: error.message },
        401,
        headers,
      );
    }
    if (error instanceof ConfigurationError) {
      return errorResponse(
        {
          code: "SERVER_NOT_CONFIGURED",
          message: "El servidor no está configurado correctamente.",
        },
        503,
        headers,
      );
    }
    if (error instanceof RucLookupError) {
      if (organizationId && actorId && requestedRuc && adminClient) {
        // La auditoría no debe ocultar el error funcional original.
        try {
          await auditLookup(
            adminClient,
            organizationId,
            actorId,
            requestedRuc,
            "DECOLECTA",
            false,
            false,
          );
        } catch {
          // Sin datos tributarios ni secretos en logs.
        }
      }
      return errorResponse(
        { code: error.code, message: error.message },
        error.status,
        headers,
      );
    }
    return errorResponse(
      {
        code: "RUC_LOOKUP_FAILED",
        message:
          "No se pudo consultar el RUC. Puedes continuar con el registro manual.",
      },
      500,
      headers,
    );
  }
});
