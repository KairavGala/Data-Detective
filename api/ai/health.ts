/**
 * Data Detective — Native Vercel Node.js Serverless Function
 * GET /api/ai/health
 *
 * Non-billable configuration diagnostic endpoint.
 * Never calls Gemini and never returns or logs secret values.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import {
  loadAiServerConfig,
  RECOMMENDED_FRONTEND_TIMEOUT_MS,
  SDK_ATTEMPTS_CONFIGURED,
  VERCEL_MAX_DURATION_SEC,
} from '../_lib/config.js';
import type { HealthResponse } from '../_lib/contracts.js';
import { ApiPrototypeError, buildErrorEnvelope } from '../_lib/errors.js';
import {
  createRequestId,
  logSafeTelemetry,
  sendJson,
} from '../_lib/http.js';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const requestId = createRequestId();
  const startedAt = performance.now();
  const config = loadAiServerConfig(process.env);
  const durationMs = Math.round(performance.now() - startedAt);

  if (req.method !== 'GET') {
    const error = new ApiPrototypeError({
      code: 'METHOD_NOT_ALLOWED',
      statusCode: 405,
      message: 'Only GET requests are supported on /api/ai/health.',
    });
    res.setHeader('Allow', 'GET');
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
      event: 'ai_health_rejected',
      requestId,
      route: '/api/ai/health',
      model: config.model,
      statusCode: error.statusCode,
      errorCode: error.code,
      durationMs,
      sdkAttemptsConfigured: SDK_ATTEMPTS_CONFIGURED,
    });
    return;
  }

  const payload: HealthResponse = {
    ok: true,
    requestId,
    configured: config.apiKey !== null,
    prototypeEnabled: config.prototypeEnabled,
    investigationEnabled: config.investigationEnabled ?? true,
    model: config.model,
    sdkAttemptsConfigured: SDK_ATTEMPTS_CONFIGURED,
    timeouts: {
      geminiTimeoutMs: config.geminiTimeoutMs,
      handlerTimeoutMs: config.handlerTimeoutMs,
      frontendRecommendedTimeoutMs: RECOMMENDED_FRONTEND_TIMEOUT_MS,
      vercelMaxDurationSec: VERCEL_MAX_DURATION_SEC,
    },
    nodeVersion: process.version,
  };

  sendJson(res, 200, payload, requestId);
  logSafeTelemetry({
    event: 'ai_health_checked',
    requestId,
    route: '/api/ai/health',
    model: config.model,
    statusCode: 200,
    durationMs,
    sdkAttemptsConfigured: SDK_ATTEMPTS_CONFIGURED,
  });
}
