import { SimuladorEmisionFiscalLocal } from "./simulador-local.ts";
import type { ComprobanteCongelado } from "./adapter.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const documentId = "22222222-2222-4222-8222-222222222222";
const idempotencyKey = "33333333-3333-4333-8333-333333333333";

function documento(
  overrides: Partial<ComprobanteCongelado> = {},
): ComprobanteCongelado {
  return {
    identity: {
      organizationId,
      documentId,
      environment: "sandbox",
      issuerRuc: "20000000001",
      documentType: "01",
      series: "F001",
      number: "1",
      snapshotHash: "a".repeat(64),
    },
    organizationId,
    documentId,
    environment: "sandbox",
    state: "frozen",
    snapshotHash: "a".repeat(64),
    snapshot: {
      organizationId,
      environment: "sandbox",
      modality: "local_test",
      issuer: { ruc: "20000000001" },
      documentType: "01",
      series: "F001",
      number: "1",
      total: "118.00",
    },
    ...overrides,
  };
}

Deno.test("recupera por identidad fiscal y clave idempotente sin crear otro envÃ­o", async () => {
  const simulator = new SimuladorEmisionFiscalLocal();
  const doc = documento();
  const submitted = await simulator.submit(doc, idempotencyKey);
  const recovered = await simulator.recover(doc.identity, idempotencyKey);
  assert(
    recovered?.providerReference === submitted.providerReference &&
      recovered.status === "pending",
    "Debe recuperar el resultado original correlacionado",
  );
  assert(
    await simulator.recover(doc.identity, "55555555-5555-4555-8555-555555555555") === null,
    "Una clave desconocida debe indicar que no hay envÃ­o recuperable",
  );
  const afterQuery = await simulator.query(doc.identity, submitted.providerReference);
  const recoveredAfterQuery = await simulator.recover(doc.identity, idempotencyKey);
  assert(
    recoveredAfterQuery?.status === afterQuery.status &&
      recoveredAfterQuery.providerReference === afterQuery.providerReference,
    "La recuperaciÃ³n debe devolver el Ãºltimo estado simulado",
  );
});

Deno.test("no asocia un resultado recuperado a otra identidad fiscal", async () => {
  const simulator = new SimuladorEmisionFiscalLocal();
  const doc = documento();
  await simulator.submit(doc, idempotencyKey);
  const error = await simulator.recover({
    ...doc.identity,
    documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }, idempotencyKey).catch((caught: unknown) => caught);
  assert(
    error instanceof Error && error.message === "FISCAL_RECOVERY_IDENTITY_CONFLICT",
    "La recuperaciÃ³n debe rechazar una identidad de documento distinta",
  );
  const queryError = await simulator.query({
    ...doc.identity,
    organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }, (await simulator.submit(doc, "66666666-6666-4666-8666-666666666666")).providerReference)
    .catch((caught: unknown) => caught);
  assert(
    queryError instanceof Error && queryError.message === "FISCAL_RECOVERY_IDENTITY_CONFLICT",
    "La consulta de estado debe respetar la identidad de organizaciÃ³n",
  );
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("simulador envía un snapshot congelado sandbox y no produce respuesta tributaria", async () => {
  const simulator = new SimuladorEmisionFiscalLocal({
    now: () => new Date("2026-11-03T10:00:00.000Z"),
  });
  const submitted = await simulator.submit(documento(), idempotencyKey);
  assert(
    submitted.status === "pending",
    "La respuesta inicial debe quedar pendiente de consulta",
  );
  assert(submitted.simulated, "Debe identificar el resultado como simulado");
  assert(
    submitted.providerReference.startsWith("SIM-"),
    "Debe usar una referencia local identificable",
  );
  assert(
    submitted.message.includes("no se transmitió"),
    "Debe aclarar que no se envió el comprobante",
  );
});

Deno.test("repite la misma operación idempotente y rechaza reutilizar la clave con otro snapshot", async () => {
  const simulator = new SimuladorEmisionFiscalLocal();
  const first = await simulator.submit(documento(), idempotencyKey);
  const replay = await simulator.submit(
    documento({ snapshot: { ...documento().snapshot, total: "119.00" } }),
    idempotencyKey,
  )
    .catch((error: unknown) => error);
  assert(
    replay instanceof Error && replay.message === "FISCAL_IDEMPOTENCY_CONFLICT",
    "Debe rechazar el payload distinto",
  );
  const identicalReplay = await simulator.submit(documento(), idempotencyKey);
  assert(
    identicalReplay.providerReference === first.providerReference,
    "Debe conservar la referencia idempotente",
  );
});

Deno.test("no acepta borradores, producción ni snapshots de otra organización", async () => {
  const simulator = new SimuladorEmisionFiscalLocal();
  const invalidDocuments = [
    documento({ state: "prepared" as "frozen" }),
    documento({
      environment: "production",
      snapshot: {
        organizationId,
        environment: "production",
        modality: "production",
      },
    }),
    documento({
      snapshot: {
        organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        environment: "sandbox",
        modality: "local_test",
      },
    }),
  ];
  for (const invalid of invalidDocuments) {
    const result = await simulator.submit(invalid, idempotencyKey).catch((
      error: unknown,
    ) => error);
    assert(
      result instanceof Error &&
        result.message === "FISCAL_SIMULATION_SANDBOX_ONLY",
      "Debe fallar cerrado fuera del sandbox congelado",
    );
  }
});

Deno.test("consulta estado y descarga un recibo ficticio con integridad verificable", async () => {
  const simulator = new SimuladorEmisionFiscalLocal({
    now: () => new Date("2026-11-03T10:00:00.000Z"),
  });
  const doc = documento();
  const submitted = await simulator.submit(doc, idempotencyKey);
  const final = await simulator.query(doc.identity, submitted.providerReference);
  assert(
    final.status === "accepted" && final.simulated,
    "Debe completar la transición simulada",
  );
  const evidence = await simulator.downloadEvidence(doc.identity, submitted.providerReference);
  assert(
    evidence.length === 1,
    "Debe permitir descargar una evidencia simulada",
  );
  assert(
    evidence[0].kind === "simulation_receipt",
    "No debe etiquetar el recibo como CDR",
  );
  assert(
    evidence[0].simulated,
    "La evidencia debe estar marcada como simulada",
  );
  assert(
    evidence[0].identity.documentId === doc.documentId,
    "La evidencia debe conservar la identidad fiscal de su documento",
  );
  assert(evidence[0].sha256.length === 64, "Debe incluir un hash SHA-256");
  const body = new TextDecoder().decode(evidence[0].content);
  assert(
    body.includes("carece de validez tributaria"),
    "Debe declarar la falta de validez tributaria",
  );
  evidence[0].content[0] = 0;
  const downloadedAgain = await simulator.downloadEvidence(doc.identity, submitted.providerReference);
  assert(
    new TextDecoder().decode(downloadedAgain[0].content).startsWith("{"),
    "La descarga no debe exponer el buffer interno",
  );
});

Deno.test("una decisión simulada de rechazo se conserva al consultar el resultado", async () => {
  const simulator = new SimuladorEmisionFiscalLocal({ decision: "rejected" });
  const doc = documento();
  const submitted = await simulator.submit(doc, idempotencyKey);
  const result = await simulator.query(doc.identity, submitted.providerReference);
  assert(result.status === "rejected", "Debe conservar el rechazo simulado");
  assert(
    result.responseCode === "SIMULATED_REJECTED",
    "Debe usar un código exclusivo de simulación",
  );
});
