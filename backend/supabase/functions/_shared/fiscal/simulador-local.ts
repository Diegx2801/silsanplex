import type {
  AdaptadorEmisionFiscal,
  ComprobanteCongelado,
  EstadoProveedorFiscal,
  EvidenciaFiscal,
  IdentidadComprobanteFiscal,
  ResultadoProveedorFiscal,
} from "./adapter.ts";

type DecisiónSimulada = "accepted" | "rejected";

interface RegistroSimulado {
  readonly fingerprint: string;
  readonly document: ComprobanteCongelado;
  readonly identity: IdentidadComprobanteFiscal;
  receipt: ResultadoProveedorFiscal;
  status: EstadoProveedorFiscal;
  evidence?: EvidenciaFiscal;
}

interface OpcionesSimulador {
  readonly decision?: DecisiónSimulada;
  readonly now?: () => Date;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;

function canonicalJson(value: unknown): string {
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new Error("FISCAL_SIMULATION_SNAPSHOT_INVALID");
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${
    Object.keys(object).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(object[key])}`
    ).join(",")
  }}`;
}

async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  const ownedBytes = new Uint8Array(bytes.byteLength);
  ownedBytes.set(bytes);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    ownedBytes.buffer as ArrayBuffer,
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function copyReceipt(
  receipt: ResultadoProveedorFiscal,
): ResultadoProveedorFiscal {
  return { ...receipt, identity: { ...receipt.identity } };
}

function validateIdentity(identity: IdentidadComprobanteFiscal): void {
  if (
    !identity || !UUID.test(identity.organizationId) ||
    !UUID.test(identity.documentId) ||
    identity.environment !== "sandbox" || !/^\d{11}$/.test(identity.issuerRuc) ||
    !["01", "03"].includes(identity.documentType) ||
    !/^[FB][A-Z0-9]{3}$/.test(identity.series) ||
    !/^[1-9]\d{0,7}$/.test(identity.number) || !HASH.test(identity.snapshotHash)
  ) {
    throw new Error("FISCAL_SIMULATION_REFERENCE_INVALID");
  }
  if (
    !identity.series.startsWith(identity.documentType === "01" ? "F" : "B")
  ) {
    throw new Error("FISCAL_SIMULATION_REFERENCE_INVALID");
  }
}

function validateSubmission(
  document: ComprobanteCongelado,
  idempotencyKey: string,
): void {
  if (
    !document || typeof document !== "object" || !document.snapshot ||
    typeof document.snapshot !== "object"
  ) {
    throw new Error("FISCAL_SIMULATION_REFERENCE_INVALID");
  }
  if (
    !UUID.test(document.organizationId) || !UUID.test(document.documentId) ||
    !UUID.test(idempotencyKey)
  ) {
    throw new Error("FISCAL_SIMULATION_REFERENCE_INVALID");
  }
  if (
    document.state !== "frozen" || document.environment !== "sandbox" ||
    document.snapshot.environment !== "sandbox" ||
    document.snapshot.modality !== "local_test" ||
    document.snapshot.organizationId !== document.organizationId ||
    !HASH.test(document.snapshotHash)
  ) {
    throw new Error("FISCAL_SIMULATION_SANDBOX_ONLY");
  }
  validateIdentity(document.identity);
  const snapshot = document.snapshot as Record<string, unknown>;
  const issuer = snapshot.issuer as Record<string, unknown> | undefined;
  if (
    document.identity.organizationId !== document.organizationId ||
    document.identity.documentId !== document.documentId ||
    document.identity.environment !== document.environment ||
    document.identity.snapshotHash !== document.snapshotHash ||
    document.identity.issuerRuc !== issuer?.ruc ||
    document.identity.documentType !== snapshot.documentType ||
    document.identity.series !== snapshot.series ||
    document.identity.number !== snapshot.number
  ) {
    throw new Error("FISCAL_SIMULATION_REFERENCE_INVALID");
  }
}

/**
 * Simulador local determinista: no hace fetch, no lee secretos y no emite una factura,
 * un XML tributario ni un CDR de SUNAT. Sus registros solo viven en memoria.
 */
export class SimuladorEmisionFiscalLocal implements AdaptadorEmisionFiscal {
  readonly #byIdempotency = new Map<string, RegistroSimulado>();
  readonly #byReference = new Map<string, RegistroSimulado>();
  readonly #decision: DecisiónSimulada;
  readonly #now: () => Date;

  constructor(options: OpcionesSimulador = {}) {
    this.#decision = options.decision ?? "accepted";
    this.#now = options.now ?? (() => new Date());
  }

  async submit(
    document: ComprobanteCongelado,
    idempotencyKey: string,
  ): Promise<ResultadoProveedorFiscal> {
    validateSubmission(document, idempotencyKey);

    const fingerprint = await sha256(canonicalJson({
      identity: document.identity,
      organizationId: document.organizationId,
      documentId: document.documentId,
      snapshotHash: document.snapshotHash,
      snapshot: document.snapshot,
    }));
    const scopedKey =
      `${document.organizationId}:${idempotencyKey.toLowerCase()}`;
    const existing = this.#byIdempotency.get(scopedKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error("FISCAL_IDEMPOTENCY_CONFLICT");
      }
      return copyReceipt(existing.receipt);
    }

    const providerReference = `SIM-${
      (await sha256(`${scopedKey}:${fingerprint}`)).slice(0, 24)
    }`;
    const receipt: ResultadoProveedorFiscal = {
      identity: { ...document.identity },
      providerReference,
      status: "pending",
      receivedAt: this.#now().toISOString(),
      responseCode: null,
      message:
        "Simulación local pendiente; no se transmitió ningún comprobante.",
      simulated: true,
    };
    const record: RegistroSimulado = {
      fingerprint,
      document,
      identity: { ...document.identity },
      receipt,
      status: "pending",
    };
    this.#byIdempotency.set(scopedKey, record);
    this.#byReference.set(providerReference, record);
    return copyReceipt(receipt);
  }

  async recover(
    identity: IdentidadComprobanteFiscal,
    idempotencyKey: string,
  ): Promise<ResultadoProveedorFiscal | null> {
    validateIdentity(identity);
    if (!UUID.test(idempotencyKey)) {
      throw new Error("FISCAL_SIMULATION_REFERENCE_INVALID");
    }
    const record = this.#byIdempotency.get(
      `${identity.organizationId}:${idempotencyKey.toLowerCase()}`,
    );
    if (!record) return null;
    if (canonicalJson(record.identity) !== canonicalJson(identity)) {
      throw new Error("FISCAL_RECOVERY_IDENTITY_CONFLICT");
    }
    return copyReceipt(record.receipt);
  }

  async query(
    identity: IdentidadComprobanteFiscal,
    providerReference: string,
  ): Promise<ResultadoProveedorFiscal> {
    validateIdentity(identity);
    const record = this.#byReference.get(providerReference);
    if (!record) throw new Error("FISCAL_SIMULATION_REFERENCE_NOT_FOUND");
    if (canonicalJson(record.identity) !== canonicalJson(identity)) {
      throw new Error("FISCAL_RECOVERY_IDENTITY_CONFLICT");
    }
    if (record.status === "pending") {
      record.status = this.#decision;
      const receivedAt = this.#now().toISOString();
      const response = {
        identity: record.identity,
        simulated: true,
        providerReference,
        documentId: record.document.documentId,
        organizationId: record.document.organizationId,
        snapshotHash: record.document.snapshotHash,
        status: record.status,
        message:
          "Evidencia de prueba local. No es un CDR de SUNAT y carece de validez tributaria.",
      };
      const content = new TextEncoder().encode(JSON.stringify(response));
      record.evidence = {
        documentId: record.document.documentId,
        providerReference,
        kind: "simulation_receipt",
        identity: { ...record.identity },
        fileName: `simulacion-${record.document.documentId}.json`,
        mediaType: "application/json; charset=utf-8",
        content,
        sha256: await sha256(content),
        createdAt: receivedAt,
        simulated: true,
      };
      record.receipt = {
        identity: { ...record.identity },
        providerReference,
        status: record.status,
        receivedAt,
        responseCode: this.#decision === "accepted"
          ? "SIMULATED_ACCEPTED"
          : "SIMULATED_REJECTED",
        message: response.message,
        simulated: true,
      };
    }
    return copyReceipt(record.receipt);
  }

  async downloadEvidence(
    identity: IdentidadComprobanteFiscal,
    providerReference: string,
  ): Promise<readonly EvidenciaFiscal[]> {
    validateIdentity(identity);
    const record = this.#byReference.get(providerReference);
    if (!record) throw new Error("FISCAL_SIMULATION_REFERENCE_NOT_FOUND");
    if (canonicalJson(record.identity) !== canonicalJson(identity)) {
      throw new Error("FISCAL_RECOVERY_IDENTITY_CONFLICT");
    }
    if (!record.evidence) return [];
    return [{
      ...record.evidence,
      identity: { ...record.evidence.identity },
      content: record.evidence.content.slice(),
    }];
  }
}
