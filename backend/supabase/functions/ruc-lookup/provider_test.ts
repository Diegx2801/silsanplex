import { DecolectaRucProvider } from "../_shared/ruc/decolecta-provider.ts";
import { RucLookupError } from "../_shared/ruc/types.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    razon_social: "EMPRESA DE PRUEBA S.A.C.",
    numero_documento: "20550154065",
    estado: "Activo",
    condicion: "Habido",
    direccion: "AV. PRUEBA 123",
    ubigeo: "150140",
    ...overrides,
  };
}

Deno.test("normaliza la respuesta oficial de Decolecta y autentica por Bearer", async () => {
  let requestedUrl = "";
  let requestedAuthorization = "";
  const provider = new DecolectaRucProvider({
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

  const result = await provider.lookup("20550154065");
  assert(result.legalName === "EMPRESA DE PRUEBA S.A.C.", "No mapeó la razón social");
  assert(result.taxpayerStatus === "ACTIVO", "No normalizó el estado");
  assert(result.domicileCondition === "HABIDO", "No normalizó la condición");
  assert(result.ubigeoCode === "150140", "No mapeó el ubigeo");
  assert(result.source === "DECOLECTA", "No registró la fuente");
  const url = new URL(requestedUrl);
  assert(url.pathname === "/v1/sunat/ruc", "Usó un endpoint incorrecto");
  assert(url.searchParams.get("numero") === "20550154065", "No envió el RUC como numero");
  assert(url.searchParams.get("token") === null, "Expuso el token en la URL");
  assert(requestedAuthorization === "Bearer token-de-prueba", "No envió el token por Bearer");
});

Deno.test("descarta marcadores vacíos de Decolecta", async () => {
  const provider = new DecolectaRucProvider({
    token: "token-de-prueba",
    fetcher: () => Promise.resolve(new Response(JSON.stringify(validPayload({ direccion: "-" })), { status: 200 })),
  });
  const result = await provider.lookup("20550154065");
  assert(result.fiscalAddress === "", "Interpretó el guion como una dirección real");
});

Deno.test("traduce un RUC inexistente a un error de dominio", async () => {
  const provider = new DecolectaRucProvider({ token: "token-de-prueba", fetcher: () => Promise.resolve(new Response("{}", { status: 404 })) });
  try {
    await provider.lookup("20550154065");
    throw new Error("La consulta debería fallar");
  } catch (error) {
    assert(error instanceof RucLookupError, "No devolvió un error de dominio");
    assert(error.code === "RUC_NOT_FOUND", "El código de error no corresponde");
  }
});

Deno.test("rechaza una respuesta cuyo RUC no coincide", async () => {
  const provider = new DecolectaRucProvider({
    token: "token-de-prueba",
    fetcher: () => Promise.resolve(new Response(JSON.stringify(validPayload({ numero_documento: "20111111111" })), { status: 200 })),
  });
  try {
    await provider.lookup("20550154065");
    throw new Error("La consulta debería fallar");
  } catch (error) {
    assert(error instanceof RucLookupError, "No devolvió un error de dominio");
    assert(error.code === "RUC_PROVIDER_RESPONSE_INVALID", "Aceptó datos de otro RUC");
  }
});

Deno.test("exige configurar el token solo en el backend", async () => {
  const provider = new DecolectaRucProvider({ token: "" });
  try {
    await provider.lookup("20550154065");
    throw new Error("La consulta debería fallar");
  } catch (error) {
    assert(error instanceof RucLookupError, "No devolvió un error de dominio");
    assert(error.code === "RUC_PROVIDER_NOT_CONFIGURED", "No detectó el token ausente");
  }
});

Deno.test("interpreta el error funcional de RUC no encontrado", async () => {
  const provider = new DecolectaRucProvider({
    token: "token-de-prueba",
    fetcher: () => Promise.resolve(new Response(JSON.stringify({ error: "RUC no encontrado" }), { status: 200 })),
  });
  try {
    await provider.lookup("20550154065");
    throw new Error("La consulta debería fallar");
  } catch (error) {
    assert(error instanceof RucLookupError, "No devolvió un error de dominio");
    assert(error.code === "RUC_NOT_FOUND", "No interpretó el error funcional");
  }
});

Deno.test("distingue una credencial de Decolecta rechazada", async () => {
  const provider = new DecolectaRucProvider({ token: "token-de-prueba", fetcher: () => Promise.resolve(new Response("{}", { status: 401 })) });
  try {
    await provider.lookup("20550154065");
    throw new Error("La consulta debería fallar");
  } catch (error) {
    assert(error instanceof RucLookupError, "No devolvió un error de dominio");
    assert(error.code === "RUC_PROVIDER_NOT_CONFIGURED", "No distinguió la credencial rechazada");
  }
});

Deno.test("traduce el límite de cuota de Decolecta", async () => {
  const provider = new DecolectaRucProvider({ token: "token-de-prueba", fetcher: () => Promise.resolve(new Response("{}", { status: 429 })) });
  try {
    await provider.lookup("20550154065");
    throw new Error("La consulta debería fallar");
  } catch (error) {
    assert(error instanceof RucLookupError, "No devolvió un error de dominio");
    assert(error.code === "RUC_PROVIDER_RATE_LIMITED", "No distinguió el límite de cuota");
  }
});
