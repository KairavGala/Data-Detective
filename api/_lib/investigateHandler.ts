/**
 * Data Detective — Module 08 Investigation Serverless Handler Factory
 *
 * Shared identically between the native Vercel Serverless Function
 * (`/api/ai/investigate.ts`), the local dev server (`/server.ts`),
 * and automated Node HTTP tests.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import {
  type AiServerConfig,
  loadAiServerConfig,
  SDK_ATTEMPTS_CONFIGURED,
} from './config.js';
import { ApiPrototypeError } from './errors.js';
import {
  createRequestId,
  createRequestLifecycle,
  logSafeTelemetry,
  readBoundedJsonBody,
  sendJson,
} from './http.js';
import {
  MAX_INVESTIGATE_BODY_BYTES,
  type InvestigateErrorResponse,
  type InvestigateResponseMeta,
  type InvestigateSuccessResponse,
} from './investigateContracts.js';
import { runInvestigationGeneration } from './investigateGemini.js';
import { validateInvestigateRequest } from './investigateValidation.js';

export interface InvestigateHandlerOptions {
  readonly loadConfig?: () => AiServerConfig;
  readonly customFetch?: typeof fetch;
  readonly maxBodyBytes?: number;
}

function buildInvestigateErrorEnvelope(
  error: ApiPrototypeError,
  requestId: string,
  meta: Omit<InvestigateResponseMeta, 'timeoutPhase' | 'upstreamStatus'>,
): InvestigateErrorResponse {
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

export function createInvestigateHandler(
  options: InvestigateHandlerOptions = {},
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const resolveConfig = options.loadConfig ?? (() => loadAiServerConfig(process.env));
  const maxBodyBytes = options.maxBodyBytes ?? MAX_INVESTIGATE_BODY_BYTES;

  return async function handleInvestigateRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const requestId = createRequestId();
    const startedAt = performance.now();
    const config = resolveConfig();
    const elapsedMs = (): number => Math.round(performance.now() - startedAt);
    const nowIso = (): string => new Date().toISOString();

    if (req.method !== 'POST') {
      const error = new ApiPrototypeError({
        code: 'METHOD_NOT_ALLOWED',
        statusCode: 405,
        message: 'Only POST requests are supported on /api/ai/investigate.',
      });
      res.setHeader('Allow', 'POST');
      const durationMs = elapsedMs();
      sendJson(
        res,
        error.statusCode,
        buildInvestigateErrorEnvelope(error, requestId, {
          model: config.model,
          durationMs,
          sdkAttemptsConfigured: SDK_ATTEMPTS_CONFIGURED,
          generatedAt: nowIso(),
        }),
        requestId,
      );
      logSafeTelemetry({
        event: 'ai_investigate_rejected',
        requestId,
        route: '/api/ai/investigate',
        model: config.model,
        statusCode: error.statusCode,
        errorCode: error.code,
        durationMs,
        sdkAttemptsConfigured: SDK_ATTEMPTS_CONFIGURED,
      });
      return;
    }

    if (config.investigationEnabled === false) {
      const error = new ApiPrototypeError({
        code: 'INVESTIGATION_DISABLED',
        statusCode: 403,
        message: 'The AI investigation endpoint is disabled in this environment.',
      });
      const durationMs = elapsedMs();
      sendJson(
        res,
        error.statusCode,
        buildInvestigateErrorEnvelope(error, requestId, {
          model: config.model,
          durationMs,
          sdkAttemptsConfigured: SDK_ATTEMPTS_CONFIGURED,
          generatedAt: nowIso(),
        }),
        requestId,
      );
      logSafeTelemetry({
        event: 'ai_investigate_disabled',
        requestId,
        route: '/api/ai/investigate',
        model: config.model,
        statusCode: error.statusCode,
        errorCode: error.code,
        durationMs,
        sdkAttemptsConfigured: SDK_ATTEMPTS_CONFIGURED,
      });
      return;
    }

    const lifecycle = createRequestLifecycle(res, config.handlerTimeoutMs);
    let requestMode: string | undefined;

    try {
      const rawBody = await readBoundedJsonBody(req, maxBodyBytes);
      const validatedRequest = validateInvestigateRequest(rawBody);
      requestMode = validatedRequest.mode;

      if (!config.apiKey) {
        throw new ApiPrototypeError({
          code: 'CONFIG_MISSING',
          statusCode: 503,
          message: 'Server Gemini API configuration is missing.',
          retryable: false,
        });
      }

      const result = await runInvestigationGeneration({
        apiKey: config.apiKey,
        model: config.model,
        geminiTimeoutMs: config.geminiTimeoutMs,
        request: validatedRequest,
        lifecycleSignal: lifecycle.signal,
        isHandlerTimedOut: lifecycle.isHandlerTimedOut,
        isClientDisconnected: lifecycle.isClientDisconnected,
        customFetch: options.customFetch,
      });

      const durationMs = elapsedMs();
      const meta: InvestigateResponseMeta = {
        model: config.model,
        durationMs,
        sdkAttemptsConfigured: SDK_ATTEMPTS_CONFIGURED,
        generatedAt: nowIso(),
        contextCharCount: validatedRequest.serializedContext.length,
        strippedInvalidFindingRefs: result.strippedInvalidFindingRefs,
        strippedInvalidColumnRefs: result.strippedInvalidColumnRefs,
      };

      const payload: InvestigateSuccessResponse =
        result.mode === 'brief'
          ? {
              ok: true,
              requestId,
              mode: 'brief',
              data: result.data,
              meta,
            }
          : result.mode === 'case'
            ? {
                ok: true,
                requestId,
                mode: 'case',
                data: result.data,
                meta,
              }
            : {
                ok: true,
                requestId,
                mode: 'question',
                data: result.data,
                meta,
              };

      sendJson(res, 200, payload, requestId);
      logSafeTelemetry({
        event: 'ai_investigate_succeeded',
        requestId,
        route: '/api/ai/investigate',
        mode: result.mode,
        model: config.model,
        statusCode: 200,
        durationMs,
        sdkAttemptsConfigured: SDK_ATTEMPTS_CONFIGURED,
      });
    } catch (err: unknown) {
      const normalizedError =
        err instanceof ApiPrototypeError
          ? err
          : new ApiPrototypeError({
              code: 'INTERNAL_ERROR',
              statusCode: 500,
              message: 'Unexpected server error while processing investigation request.',
            });

      const durationMs = elapsedMs();
      if (!lifecycle.isClientDisconnected()) {
        sendJson(
          res,
          normalizedError.statusCode,
          buildInvestigateErrorEnvelope(normalizedError, requestId, {
            model: config.model,
            durationMs,
            sdkAttemptsConfigured: SDK_ATTEMPTS_CONFIGURED,
            generatedAt: nowIso(),
          }),
          requestId,
        );
      }

      logSafeTelemetry({
        event: 'ai_investigate_failed',
        requestId,
        route: '/api/ai/investigate',
        mode: requestMode,
        model: config.model,
        statusCode: normalizedError.statusCode,
        errorCode: normalizedError.code,
        ...(normalizedError.upstreamStatus !== undefined
          ? { upstreamStatus: normalizedError.upstreamStatus }
          : {}),
        ...(normalizedError.upstreamErrorStatus
          ? { upstreamErrorStatus: normalizedError.upstreamErrorStatus }
          : {}),
        durationMs,
        sdkAttemptsConfigured: SDK_ATTEMPTS_CONFIGURED,
      });
    } finally {
      lifecycle.cleanup();
    }
  };
}
