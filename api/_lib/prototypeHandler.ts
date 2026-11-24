/**
 * Data Detective — Stage 1 Prototype Handler Factory
 *
 * Shared between the native Vercel Serverless Function (`/api/ai/prototype.ts`),
 * the local dev server (`/server.ts`), and automated Node HTTP integration tests.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import {
  type AiServerConfig,
  loadAiServerConfig,
  SDK_ATTEMPTS_CONFIGURED,
} from './config.js';
import type { PrototypeSuccessResponse } from './contracts.js';
import { ApiPrototypeError, buildErrorEnvelope } from './errors.js';
import { runPrototypeGeneration } from './geminiClient.js';
import {
  createRequestId,
  createRequestLifecycle,
  logSafeTelemetry,
  MAX_PROTOTYPE_BODY_BYTES,
  readBoundedJsonBody,
  sendJson,
} from './http.js';
import { validatePrototypeRequest } from './validation.js';

export interface PrototypeHandlerOptions {
  /** Optional config resolver override strictly for controlled tests. */
  readonly loadConfig?: () => AiServerConfig;
  /** Optional fetch override passed into the real GoogleGenAI SDK for controlled tests. */
  readonly customFetch?: typeof fetch;
  /** Optional body byte limit override for tests. */
  readonly maxBodyBytes?: number;
}

export function createPrototypeHandler(
  options: PrototypeHandlerOptions = {},
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const resolveConfig = options.loadConfig ?? (() => loadAiServerConfig(process.env));
  const maxBodyBytes = options.maxBodyBytes ?? MAX_PROTOTYPE_BODY_BYTES;

  return async function handlePrototypeRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const requestId = createRequestId();
    const startedAt = performance.now();
    const config = resolveConfig();
    const elapsedMs = (): number => Math.round(performance.now() - startedAt);

    if (req.method !== 'POST') {
      const error = new ApiPrototypeError({
        code: 'METHOD_NOT_ALLOWED',
        statusCode: 405,
        message: 'Only POST requests are supported on /api/ai/prototype.',
      });
      res.setHeader('Allow', 'POST');
      const durationMs = elapsedMs();
      sendJson(
        res,
        error.statusCode,
        buildErrorEnvelope(error, requestId, {
          model: config.model,
          durationMs,
          sdkAttemptsConfigured: SDK_ATTEMPTS_CONFIGURED,
        }),
        requestId,
      );
      logSafeTelemetry({
        event: 'ai_prototype_rejected',
        requestId,
        route: '/api/ai/prototype',
        model: config.model,
        statusCode: error.statusCode,
        errorCode: error.code,
        durationMs,
        sdkAttemptsConfigured: SDK_ATTEMPTS_CONFIGURED,
      });
      return;
    }

    if (!config.prototypeEnabled) {
      const error = new ApiPrototypeError({
        code: 'PROTOTYPE_DISABLED',
        statusCode: 403,
        message: 'The Stage 1 AI prototype endpoint is disabled in this environment.',
      });
      const durationMs = elapsedMs();
      sendJson(
        res,
        error.statusCode,
        buildErrorEnvelope(error, requestId, {
          model: config.model,
          durationMs,
          sdkAttemptsConfigured: SDK_ATTEMPTS_CONFIGURED,
        }),
        requestId,
      );
      logSafeTelemetry({
        event: 'ai_prototype_disabled',
        requestId,
        route: '/api/ai/prototype',
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
      const validatedRequest = validatePrototypeRequest(rawBody);
      requestMode = validatedRequest.mode;

      if (!config.apiKey) {
        throw new ApiPrototypeError({
          code: 'CONFIG_MISSING',
          statusCode: 503,
          message: 'Server Gemini API configuration is missing.',
          retryable: false,
        });
      }

      const result = await runPrototypeGeneration({
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
      const payload: PrototypeSuccessResponse = {
        ok: true,
        requestId,
        mode: result.mode,
        data: result.data,
        meta: {
          model: config.model,
          durationMs,
          sdkAttemptsConfigured: SDK_ATTEMPTS_CONFIGURED,
        },
      };

      sendJson(res, 200, payload, requestId);
      logSafeTelemetry({
        event: 'ai_prototype_succeeded',
        requestId,
        route: '/api/ai/prototype',
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
              message: 'Unexpected server error while processing prototype request.',
            });

      const durationMs = elapsedMs();
      if (!lifecycle.isClientDisconnected()) {
        sendJson(
          res,
          normalizedError.statusCode,
          buildErrorEnvelope(normalizedError, requestId, {
            model: config.model,
            durationMs,
            sdkAttemptsConfigured: SDK_ATTEMPTS_CONFIGURED,
          }),
          requestId,
        );
      }

      logSafeTelemetry({
        event: 'ai_prototype_failed',
        requestId,
        route: '/api/ai/prototype',
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
