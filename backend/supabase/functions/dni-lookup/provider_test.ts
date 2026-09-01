import { DecolectaDniProvider } from "../_shared/dni/decolecta-provider.ts";
import { DniLookupError } from "../_shared/dni/types.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    first_name: "ERACLEO JUAN",
    first_last_name: "HUAMANI",
    second_last_name: "MENDOZA",
    full_name: "HUAMANI MENDOZA ERACLEO JUAN",
    document_number: "46027897",
    ...overrides,
  };
}

Deno.test("consulta DNI por numero y autentica por Bearer", async () => {
  let requestedUrl = "";
  let requestedAuthorization = "";
  const provider = new DecolectaDniProvider({
    token: "token-de-prueba",
    fetcher: (input, init) => {
      requestedUrl = String(input);
      requestedAuthorization = new Headers(init?.headers).get("Authorization") ?? "";
      return Promise.resolve(new Response(JSON.stringify(validPayload()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    },
  });

  const result = await provider.lookup("46027897");
  assert(result.fullName === "HUAMANI MENDOZA ERACLEO JUAN", "No mapeó el nombre completo");
  const url = new URL(requestedUrl);
  assert(url.pathname === "/v1/reniec/dni", "Usó un endpoint incorrecto");
  assert(url.searchParams.get("numero") === "46027897", "No envió el DNI como numero");
  assert(url.searchParams.get("token") === null, "Expuso el token en la URL");
  assert(requestedAuthorization === "Bearer token-de-prueba", "No envió el token por Bearer");
});

Deno.test("rechaza un DNI no encontrado", async () => {
  const provider = new DecolectaDniProvider({
    token: "token-de-prueba",
    fetcher: () => Promise.resolve(new Response(JSON.stringify({ message: "not found" }), { status: 404 })),
  });
  try {
    await provider.lookup("46027897");
    throw new Error("La consulta debería fallar");
  } catch (error) {
    assert(error instanceof DniLookupError, "No devolvió un error de dominio");
    assert(error.code === "DNI_NOT_FOUND" && error.status === 404, "No tradujo el DNI inexistente");
  }
});

Deno.test("traduce un DNI inválido y el límite del proveedor", async () => {
  const invalidProvider = new DecolectaDniProvider({
    token: "token-de-prueba",
    fetcher: () => Promise.resolve(new Response(JSON.stringify({ message: "dni no valido" }), { status: 422 })),
  });
  try {
    await invalidProvider.lookup("46027897");
    throw new Error("La consulta debería fallar");
  } catch (error) {
    assert(error instanceof DniLookupError && error.code === "DNI_INVALID", "No tradujo el DNI inválido");
  }

  const limitedProvider = new DecolectaDniProvider({
    token: "token-de-prueba",
    fetcher: () => Promise.resolve(new Response("{}", { status: 429 })),
  });
  try {
    await limitedProvider.lookup("46027897");
    throw new Error("La consulta debería fallar");
  } catch (error) {
    assert(error instanceof DniLookupError && error.code === "DNI_PROVIDER_RATE_LIMITED", "No tradujo el límite de cuota");
  }
});

Deno.test("no permite consultar sin token", async () => {
  const provider = new DecolectaDniProvider({ token: "" });
  try {
    await provider.lookup("46027897");
    throw new Error("La consulta debería fallar");
  } catch (error) {
    assert(error instanceof DniLookupError && error.code === "DNI_PROVIDER_NOT_CONFIGURED", "No detectó el token ausente");
  }
});
