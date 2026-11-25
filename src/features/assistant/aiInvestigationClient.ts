/**
 * Data Detective — Module 08 Frontend AI Investigation Client
 *
 * Strictly communicates with same-origin `/api/ai/health` and `/api/ai/investigate`.
 * Never accesses API keys, never calls Gemini from the browser, and never runs
 * unbounded automatic retry loops.
 */

import type {
  AiBriefGenerationData,
  AiCaseAnalysisData,
  AiDatasetAnswerData,
  AiDatasetQuestionHistoryItem,
  AiHealthStatus,
  AiInvestigationResponseMeta,
  CaseAiRequestInfo,
  InvestigationContextPayload,
} from '@/types';

export const FRONTEND_INVESTIGATION_TIMEOUT_MS = 27_000;
const HEALTH_TIMEOUT_MS = 8_000;

export class AiInvestigationClientError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly timeoutPhase?: 'gemini_sdk' | 'backend_deadline';

  constructor(options: {
    code: string;
    message: string;
    statusCode: number;
    retryable: boolean;
    timeoutPhase?: 'gemini_sdk' | 'backend_deadline';
  }) {
    super(options.message);
    this.name = 'AiInvestigationClientError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable;
    this.timeoutPhase = options.timeoutPhase;
  }
}

interface RawErrorEnvelope {
  readonly ok: false;
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly retryable?: boolean;
  };
  readonly meta?: {
    readonly timeoutPhase?: 'gemini_sdk' | 'backend_deadline';
  };
}

interface RawBriefSuccessEnvelope {
  readonly ok: true;
  readonly mode: 'brief';
  readonly data: AiBriefGenerationData;
  readonly meta: AiInvestigationResponseMeta;
}

interface RawQuestionSuccessEnvelope {
  readonly ok: true;
  readonly mode: 'question';
  readonly data: AiDatasetAnswerData;
  readonly meta: AiInvestigationResponseMeta;
}

interface RawCaseSuccessEnvelope {
  readonly ok: true;
  readonly mode: 'case';
  readonly data: AiCaseAnalysisData;
  readonly meta: AiInvestigationResponseMeta;
}

/**
 * Defense-in-depth frontend guard ensuring recommended destinations only ever
 * navigate to supported internal Data Detective routes.
 */
export function isSafeInternalDestination(url: string): boolean {
  if (typeof url !== 'string' || url.length === 0) return false;
  if (url.startsWith('//') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
    return false;
  }
  return (
    url === '/explorer' ||
    url.startsWith('/explorer?') ||
    url === '/analysis' ||
    url.startsWith('/analysis?') ||
    url === '/visualizations' ||
    url.startsWith('/visualizations?') ||
    url === '/investigation' ||
    url.startsWith('/investigation?')
  );
}

function createTimedSignal(
  timeoutMs: number,
  externalSignal?: AbortSignal,
): {
  readonly signal: AbortSignal;
  readonly didTimeout: () => boolean;
  readonly cleanup: () => void;
} {
  const timeoutController = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    if (!timeoutController.signal.aborted) {
      timedOut = true;
      timeoutController.abort(new Error('FRONTEND_TIMEOUT'));
    }
  }, timeoutMs);

  const onExternalAbort = () => {
    if (!timeoutController.signal.aborted) {
      timeoutController.abort(externalSignal?.reason);
    }
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      timeoutController.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    signal: timeoutController.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    },
  };
}

export async function fetchAiHealth(
  externalSignal?: AbortSignal,
): Promise<AiHealthStatus> {
  const timed = createTimedSignal(HEALTH_TIMEOUT_MS, externalSignal);

  try {
    const response = await fetch('/api/ai/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: timed.signal,
    });

    const parsed = (await response.json()) as Partial<AiHealthStatus>;
    if (!response.ok || parsed.ok !== true) {
      throw new AiInvestigationClientError({
        code: 'HEALTH_UNAVAILABLE',
        message: 'AI service health endpoint returned an unexpected status.',
        statusCode: response.status,
        retryable: true,
      });
    }

    return {
      ok: true,
      configured: Boolean(parsed.configured),
      investigationEnabled: parsed.investigationEnabled ?? true,
      prototypeEnabled: Boolean(parsed.prototypeEnabled),
      model: typeof parsed.model === 'string' ? parsed.model : 'gemini-4-hydrogen',
      sdkAttemptsConfigured:
        typeof parsed.sdkAttemptsConfigured === 'number'
          ? parsed.sdkAttemptsConfigured
          : 3,
      timeouts: parsed.timeouts ?? {
        geminiTimeoutMs: 18_000,
        handlerTimeoutMs: 22_000,
        frontendRecommendedTimeoutMs: FRONTEND_INVESTIGATION_TIMEOUT_MS,
        vercelMaxDurationSec: 30,
      },
    };
  } catch (err: unknown) {
    if (err instanceof AiInvestigationClientError) {
      throw err;
    }
    if (externalSignal?.aborted) {
      throw err;
    }
    throw new AiInvestigationClientError({
      code: timed.didTimeout() ? 'FRONTEND_TIMEOUT' : 'NETWORK_ERROR',
      message: timed.didTimeout()
        ? 'AI health check timed out.'
        : 'Unable to reach the AI backend health endpoint.',
      statusCode: 0,
      retryable: true,
    });
  } finally {
    timed.cleanup();
  }
}

async function postInvestigate<T>(
  body: Record<string, unknown>,
  externalSignal?: AbortSignal,
): Promise<T> {
  const timed = createTimedSignal(
    FRONTEND_INVESTIGATION_TIMEOUT_MS,
    externalSignal,
  );

  try {
    const response = await fetch('/api/ai/investigate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: timed.signal,
    });

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new AiInvestigationClientError({
        code: 'MALFORMED_RESPONSE',
        message: 'Server returned an unreadable response.',
        statusCode: response.status,
        retryable: response.status >= 500,
      });
    }

    if (!response.ok || (parsed as { ok?: boolean })?.ok !== true) {
      const errBody = parsed as RawErrorEnvelope;
      throw new AiInvestigationClientError({
        code: errBody.error?.code ?? 'UPSTREAM_ERROR',
        message:
          errBody.error?.message ??
          `Investigation request failed (HTTP ${response.status}).`,
        statusCode: response.status,
        retryable: errBody.error?.retryable ?? response.status >= 500,
        timeoutPhase: errBody.meta?.timeoutPhase,
      });
    }

    return parsed as T;
  } catch (err: unknown) {
    if (err instanceof AiInvestigationClientError) {
      throw err;
    }
    if (externalSignal?.aborted) {
      throw err;
    }
    if (timed.didTimeout()) {
      throw new AiInvestigationClientError({
        code: 'UPSTREAM_TIMEOUT',
        message:
          'The investigation request timed out waiting for the server. You can safely retry.',
        statusCode: 504,
        retryable: true,
      });
    }
    throw new AiInvestigationClientError({
      code: 'NETWORK_ERROR',
      message:
        'Network error while contacting the AI investigation service. Check connectivity and retry.',
      statusCode: 0,
      retryable: true,
    });
  } finally {
    timed.cleanup();
  }
}

export interface BriefApiResult {
  readonly data: AiBriefGenerationData;
  readonly meta: AiInvestigationResponseMeta;
}

export async function requestInvestigationBrief(
  context: InvestigationContextPayload,
  externalSignal?: AbortSignal,
): Promise<BriefApiResult> {
  const envelope = await postInvestigate<RawBriefSuccessEnvelope>(
    {
      mode: 'brief',
      context,
    },
    externalSignal,
  );
  return {
    data: envelope.data,
    meta: envelope.meta,
  };
}

export interface QuestionApiResult {
  readonly data: AiDatasetAnswerData;
  readonly meta: AiInvestigationResponseMeta;
}

export async function requestDatasetAnswer(
  params: {
    readonly question: string;
    readonly context: InvestigationContextPayload;
    readonly briefSummary?: string;
    readonly history: readonly AiDatasetQuestionHistoryItem[];
  },
  externalSignal?: AbortSignal,
): Promise<QuestionApiResult> {
  const envelope = await postInvestigate<RawQuestionSuccessEnvelope>(
    {
      mode: 'question',
      question: params.question,
      context: params.context,
      ...(params.briefSummary ? { briefSummary: params.briefSummary } : {}),
      history: params.history.slice(-6),
    },
    externalSignal,
  );
  return {
    data: envelope.data,
    meta: envelope.meta,
  };
}

export interface CaseAnalysisApiResult {
  readonly data: AiCaseAnalysisData;
  readonly meta: AiInvestigationResponseMeta;
}

export async function requestCaseAnalysis(
  params: {
    readonly context: InvestigationContextPayload;
    readonly caseInfo: CaseAiRequestInfo;
  },
  externalSignal?: AbortSignal,
): Promise<CaseAnalysisApiResult> {
  const envelope = await postInvestigate<RawCaseSuccessEnvelope>(
    {
      mode: 'case',
      context: params.context,
      caseInfo: params.caseInfo,
    },
    externalSignal,
  );
  return {
    data: envelope.data,
    meta: envelope.meta,
  };
}

