export type EntornoFiscal = "sandbox" | "production";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Identidad fiscal inmutable usada para correlacionar envíos y recuperar resultados. */
export interface IdentidadComprobanteFiscal {
  readonly organizationId: string;
  readonly documentId: string;
  readonly environment: EntornoFiscal;
  readonly issuerRuc: string;
  readonly documentType: "01" | "03";
  readonly series: string;
  readonly number: string;
  readonly snapshotHash: string;
}

export interface ComprobanteCongelado {
  readonly identity: IdentidadComprobanteFiscal;
  readonly organizationId: string;
  readonly documentId: string;
  readonly environment: EntornoFiscal;
  readonly state: "frozen";
  readonly snapshotHash: string;
  readonly snapshot: Readonly<Record<string, JsonValue>>;
}

export type EstadoProveedorFiscal =
  | "pending"
  | "accepted"
  | "rejected"
  | "observation";

/** Estado normalizado del PSE; `accepted` no equivale por sí solo a aceptación SUNAT. */
export interface ResultadoProveedorFiscal {
  readonly identity: IdentidadComprobanteFiscal;
  readonly providerReference: string;
  readonly status: EstadoProveedorFiscal;
  readonly receivedAt: string;
  readonly responseCode: string | null;
  readonly message: string;
  readonly simulated: boolean;
}

/** Registro durable que la capa de aplicación guardará junto al resultado del proveedor. */
export interface RegistroEnvioFiscal {
  readonly identity: IdentidadComprobanteFiscal;
  readonly idempotencyKey: string;
  readonly result: ResultadoProveedorFiscal;
  readonly updatedAt: string;
}

export type TipoEvidenciaFiscal =
  | "provider_response"
  | "cdr"
  | "xml"
  | "simulation_receipt";

export interface EvidenciaFiscal {
  readonly identity: IdentidadComprobanteFiscal;
  readonly documentId: string;
  readonly providerReference: string;
  readonly kind: TipoEvidenciaFiscal;
  readonly fileName: string;
  readonly mediaType: string;
  readonly content: Uint8Array;
  readonly sha256: string;
  readonly createdAt: string;
  readonly simulated: boolean;
}

/**
 * Puerto para persistir/reconstruir el envío y sus evidencias, con alcance por identidad fiscal.
 * No está conectado a la persistencia actual, que sigue limitada a sandbox y outbox bloqueada.
 */
export interface PersistenciaEnviosFiscales {
  registrarResultado(registro: RegistroEnvioFiscal): Promise<void>;
  recuperarPorIdentidad(
    identity: IdentidadComprobanteFiscal,
    idempotencyKey: string,
  ): Promise<RegistroEnvioFiscal | null>;
  guardarEvidencias(
    identity: IdentidadComprobanteFiscal,
    providerReference: string,
    evidence: readonly EvidenciaFiscal[],
  ): Promise<void>;
  listarEvidencias(
    identity: IdentidadComprobanteFiscal,
  ): Promise<readonly EvidenciaFiscal[]>;
}

/** Implementaciones reales deben residir en backend y obtener sus credenciales de secretos del servidor. */
export interface AdaptadorEmisionFiscal {
  submit(
    document: ComprobanteCongelado,
    idempotencyKey: string,
  ): Promise<ResultadoProveedorFiscal>;
  query(
    identity: IdentidadComprobanteFiscal,
    providerReference: string,
  ): Promise<ResultadoProveedorFiscal>;
  /** Reconciliación si se interrumpió el proceso y no se conservó la referencia de respuesta. */
  recover(
    identity: IdentidadComprobanteFiscal,
    idempotencyKey: string,
  ): Promise<ResultadoProveedorFiscal | null>;
  downloadEvidence(
    identity: IdentidadComprobanteFiscal,
    providerReference: string,
  ): Promise<readonly EvidenciaFiscal[]>;
}
