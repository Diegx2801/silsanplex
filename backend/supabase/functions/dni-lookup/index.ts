import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AuthorizationError,
  authorizeRequest,
  ConfigurationError,
} from "../_shared/authorization.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import { DecolectaDniProvider } from "../_shared/dni/decolecta-provider.ts";
import { DniLookupError } from "../_shared/dni/types.ts";

const requestSchema = z.object({
  dni: z.string().trim().regex(/^\d{8}$/),
}).strict();

async function resolveCustomerOrganization(
  adminClient: SupabaseClient,
  userId: string,
) {
  const { data, error } = await adminClient.rpc(
    "resolve_edge_user_organization_permission",
    { requested_user_id: userId, requested_permission: "CUSTOMERS_MANAGE" },
  );
  return !error && typeof data === "string" ? data : null;
}

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
  adminClient: SupabaseClient,
  organizationId: string,
  actorId: string,
  dni: string,
  success: boolean,
  errorCode?: string,
) {
  const { error } = await adminClient.rpc(
    "record_customer_identity_lookup_audit",
    {
      requested_organization_id: organizationId,
      requested_actor_user_id: actorId,
      requested_document_type: "DNI",
      requested_document_number: dni,
      requested_source: "DECOLECTA_RENIEC",
      requested_success: success,
      requested_error_code: errorCode ?? null,
    },
  );
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
  let requestedDni = "";
  let adminClient: SupabaseClient | null = null;
  try {
    const authorization = await authorizeRequest(request);
    adminClient = authorization.adminClient;
    actorId = authorization.actor.id;
    const parsed = requestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return errorResponse(
        { code: "DNI_INVALID", message: "Ingresa un DNI válido de 8 dígitos." },
        422,
        headers,
      );
    }
    requestedDni = parsed.data.dni;

    organizationId = await resolveCustomerOrganization(
      authorization.adminClient,
      actorId,
    );
    if (!organizationId) {
      return errorResponse(
        {
          code: "FORBIDDEN",
          message: "No tienes permiso para consultar datos de identidad.",
        },
        403,
        headers,
      );
    }

    // Resolving the organization above scopes the audit event to an authorized
    // customer-management actor; no provider payload is persisted.
    const provider = new DecolectaDniProvider({
      token: Deno.env.get("DECOLECTA_API_TOKEN") ?? "",
      baseUrl: Deno.env.get("DECOLECTA_DNI_API_URL"),
      timeoutMs: integerEnvironmentValue(
        "DNI_LOOKUP_TIMEOUT_MS",
        5_000,
        1_000,
        15_000,
      ),
    });
    const result = await provider.lookup(requestedDni);
    if (organizationId && actorId && adminClient) {
      try {
        await auditLookup(
          adminClient,
          organizationId,
          actorId,
          requestedDni,
          true,
        );
      } catch {
        // La auditoría no debe ocultar una consulta DNI exitosa.
      }
    }
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
    if (error instanceof DniLookupError) {
      if (organizationId && actorId && requestedDni && adminClient) {
        try {
          await auditLookup(
            adminClient,
            organizationId,
            actorId,
            requestedDni,
            false,
            error.code,
          );
        } catch {
          // Sin datos personales ni secretos en logs si falla la auditoría.
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
        code: "DNI_LOOKUP_FAILED",
        message:
          "No se pudo consultar el DNI. Puedes continuar con el registro manual.",
      },
      500,
      headers,
    );
  }
});
