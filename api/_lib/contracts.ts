/**
 * Data Detective — Stage 1 AI Prototype Wire Contracts
 * Self-contained server contracts (zero imports from `src/` or Vite aliases).
 */

export type PrototypeMode = 'text' | 'structured';

export interface PrototypeRequestPayload {
  readonly mode: PrototypeMode;
  readonly prompt: string;
}

export interface PrototypeTextOutput {
  readonly text: string;
}

export interface PrototypeStructuredOutput {
  readonly status: 'ok';
  readonly summary: string;
  readonly keyPoints: readonly string[];
}

export type ApiErrorCode =
  | 'CONFIG_MISSING'
  | 'PROTOTYPE_DISABLED'
  | 'METHOD_NOT_ALLOWED'
  | 'PAYLOAD_TOO_LARGE'
  | 'VALIDATION_ERROR'
  | 'AUTH_INVALID'
  | 'PERMISSION_DENIED'
  | 'MODEL_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'MALFORMED_MODEL_RESPONSE'
  | 'CLIENT_DISCONNECTED'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL_ERROR';

export interface PrototypeResponseMeta {
  readonly model: string;
  readonly durationMs: number;
  readonly sdkAttemptsConfigured: number;
  readonly timeoutPhase?: 'gemini_sdk' | 'backend_deadline';
  readonly upstreamStatus?: number;
}

export interface PrototypeSuccessResponse {
  readonly ok: true;
  readonly requestId: string;
  readonly mode: PrototypeMode;
  readonly data: PrototypeTextOutput | PrototypeStructuredOutput;
  readonly meta: PrototypeResponseMeta;
}

export interface PrototypeErrorResponse {
  readonly ok: false;
  readonly requestId: string;
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly meta: PrototypeResponseMeta;
}

export interface HealthResponse {
  readonly ok: true;
  readonly requestId: string;
  readonly configured: boolean;
  readonly prototypeEnabled: boolean;
  readonly model: string;
  readonly sdkAttemptsConfigured: number;
  readonly timeouts: {
    readonly geminiTimeoutMs: number;
    readonly handlerTimeoutMs: number;
    readonly frontendRecommendedTimeoutMs: number;
    readonly vercelMaxDurationSec: 30;
  };
  readonly nodeVersion: string;
}
