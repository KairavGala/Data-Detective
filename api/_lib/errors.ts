/**
 * Data Detective — Normalized Serverless Error Taxonomy & Classification
 *
 * Maps SDK, HTTP, validation, and lifecycle errors into safe client-facing JSON
 * responses without leaking API keys, raw prompts, or internal stack traces.
 */

import type {
  ApiErrorCode,
  PrototypeErrorResponse,
  PrototypeResponseMeta,
} from './contracts.js';

export class ApiPrototypeError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly timeoutPhase?: 'gemini_sdk' | 'backend_deadline';
  readonly upstreamStatus?: number;

  constructor(options: {
    code: ApiErrorCode;
    statusCode: number;
    message: string;
    retryable?: boolean;
    timeoutPhase?: 'gemini_sdk' | 'backend_deadline';
    upstreamStatus?: number;
  }) {
    super(options.message);
    this.name = 'ApiPrototypeError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.timeoutPhase = options.timeoutPhase;
    this.upstreamStatus = options.upstreamStatus;
  }
}

interface UpstreamLikeError {
  status?: number;
  code?: number | string;
  name?: string;
  message?: string;
  cause?: unknown;
}

function extractHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') {
    return undefined;
  }
  const candidate = err as UpstreamLikeError;
  if (typeof candidate.status === 'number' && Number.isFinite(candidate.status)) {
    return candidate.status;
  }
  if (typeof candidate.code === 'number' && Number.isFinite(candidate.code)) {
    return candidate.code;
  }
  if (candidate.cause && typeof candidate.cause === 'object') {
    const causeStatus = (candidate.cause as UpstreamLikeError).status;
    if (typeof causeStatus === 'number' && Number.isFinite(causeStatus)) {
      return causeStatus;
    }
  }
  return undefined;
}

function extractMessageLower(err: unknown): string {
  if (err instanceof Error) {
    return err.message.toLowerCase();
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string') {
      return msg.toLowerCase();
    }
  }
  return '';
}

function isAbortOrTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const name = (err as { name?: unknown }).name;
  if (name === 'AbortError' || name === 'TimeoutError') {
    return true;
  }
  const msg = extractMessageLower(err);
  return (
    msg.includes('aborted') ||
    msg.includes('timed out') ||
    msg.includes('timeout')
  );
}

/**
 * Classifies errors raised during Gemini invocation into deterministic API errors.
 * Never echoes raw upstream error bodies (which may contain sensitive request context).
 */
export function classifyGeminiError(
  err: unknown,
  context: {
    readonly geminiTimedOut: boolean;
    readonly handlerTimedOut: boolean;
    readonly clientDisconnected: boolean;
  },
): ApiPrototypeError {
  if (err instanceof ApiPrototypeError) {
    return err;
  }

  if (context.clientDisconnected) {
    return new ApiPrototypeError({
      code: 'CLIENT_DISCONNECTED',
      statusCode: 499,
      message: 'Client closed the connection before the response completed.',
      retryable: false,
    });
  }

  if (context.handlerTimedOut) {
    return new ApiPrototypeError({
      code: 'UPSTREAM_TIMEOUT',
      statusCode: 504,
      message: 'Backend request deadline exceeded before model generation completed.',
      retryable: true,
      timeoutPhase: 'backend_deadline',
    });
  }

  if (context.geminiTimedOut || isAbortOrTimeoutError(err)) {
    return new ApiPrototypeError({
      code: 'UPSTREAM_TIMEOUT',
      statusCode: 504,
      message: 'Gemini request timed out before returning a response.',
      retryable: true,
      timeoutPhase: 'gemini_sdk',
    });
  }

  const status = extractHttpStatus(err);
  const messageLower = extractMessageLower(err);

  if (
    status === 401 ||
    messageLower.includes('api key not valid') ||
    messageLower.includes('api_key_invalid') ||
    messageLower.includes('invalid api key') ||
    messageLower.includes('unauthenticated')
  ) {
    return new ApiPrototypeError({
      code: 'AUTH_INVALID',
      statusCode: 401,
      message: 'Upstream Gemini authentication failed. Verify server API key configuration.',
      retryable: false,
    });
  }

  if (
    status === 403 ||
    messageLower.includes('permission denied') ||
    messageLower.includes('permission_denied')
  ) {
    return new ApiPrototypeError({
      code: 'PERMISSION_DENIED',
      statusCode: 403,
      message: 'Upstream Gemini access was denied for the configured credentials or model.',
      retryable: false,
    });
  }

  if (
    status === 404 ||
    messageLower.includes('is not found') ||
    messageLower.includes('not supported for generatecontent') ||
    messageLower.includes('model not found')
  ) {
    return new ApiPrototypeError({
      code: 'MODEL_UNAVAILABLE',
      statusCode: 502,
      message: 'Configured Gemini model is unavailable or does not support generation.',
      retryable: false,
    });
  }

  if (status === 429) {
    return new ApiPrototypeError({
      code: 'RATE_LIMITED',
      statusCode: 429,
      message: 'Gemini API rate limit or quota exceeded. Try again later.',
      retryable: true,
      upstreamStatus: status,
    });
  }

  if (status === 504) {
    return new ApiPrototypeError({
      code: 'UPSTREAM_TIMEOUT',
      statusCode: 504,
      message: 'Upstream Gemini service timed out before completing generation.',
      retryable: true,
      timeoutPhase: 'gemini_sdk',
      upstreamStatus: status,
    });
  }

  if (status !== undefined && status >= 500) {
    return new ApiPrototypeError({
      code: 'UPSTREAM_ERROR',
      statusCode: 502,
      message: 'Gemini service encountered a temporary upstream error.',
      retryable: true,
      upstreamStatus: status,
    });
  }

  if (
    messageLower.includes('resource_exhausted') ||
    messageLower.includes('quota') ||
    messageLower.includes('rate limit')
  ) {
    return new ApiPrototypeError({
      code: 'RATE_LIMITED',
      statusCode: 429,
      message: 'Gemini API rate limit or quota exceeded. Try again later.',
      retryable: true,
      upstreamStatus: status,
    });
  }

  if (status === 400) {
    return new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Upstream Gemini rejected the request parameters.',
      retryable: false,
      upstreamStatus: status,
    });
  }

  return new ApiPrototypeError({
    code: 'UPSTREAM_ERROR',
    statusCode: 502,
    message: 'Failed to complete Gemini generation request.',
    retryable: false,
    upstreamStatus: status,
  });
}

export function buildErrorEnvelope(
  error: ApiPrototypeError,
  requestId: string,
  meta: Omit<PrototypeResponseMeta, 'timeoutPhase' | 'upstreamStatus'>,
): PrototypeErrorResponse {
  return {
    ok: false,
    requestId,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    },
    meta: {
      ...meta,
      ...(error.timeoutPhase ? { timeoutPhase: error.timeoutPhase } : {}),
      ...(error.upstreamStatus !== undefined
        ? { upstreamStatus: error.upstreamStatus }
        : {}),
    },
  };
}
