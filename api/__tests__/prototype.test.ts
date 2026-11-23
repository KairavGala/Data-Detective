import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_TIMEOUT_MS,
  DEFAULT_HANDLER_TIMEOUT_MS,
  loadAiServerConfig,
  MAX_SAFE_HANDLER_TIMEOUT_MS,
  SDK_ATTEMPTS_CONFIGURED,
  type AiServerConfig,
} from '../_lib/config.js';
import type {
  HealthResponse,
  PrototypeErrorResponse,
  PrototypeSuccessResponse,
} from '../_lib/contracts.js';
import { createPrototypeHandler } from '../_lib/prototypeHandler.js';
import { parseAndValidateStructuredOutput } from '../_lib/validation.js';
import healthHandler from '../ai/health.js';

interface RunningTestServer {
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
}

async function startNodeHandlerServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
): Promise<RunningTestServer> {
  const server = http.createServer((req, res) => {
    void handler(req, res);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function buildGeminiSuccessResponse(text: string): Response {
  const payload = {
    candidates: [
      {
        content: {
          role: 'model',
          parts: [{ text }],
        },
        finishReason: 'STOP',
      },
    ],
  };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildGeminiErrorResponse(
  status: number,
  statusText: string,
  message: string,
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: status,
        message,
        status: statusText,
      },
    }),
    {
      status,
      statusText,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

const activeServers: RunningTestServer[] = [];

async function launchPrototype(
  configOverrides: Partial<AiServerConfig> = {},
  customFetch?: typeof fetch,
): Promise<RunningTestServer> {
  const config: AiServerConfig = {
    apiKey: 'test-server-key-never-leak-98765',
    model: DEFAULT_GEMINI_MODEL,
    geminiTimeoutMs: DEFAULT_GEMINI_TIMEOUT_MS,
    handlerTimeoutMs: DEFAULT_HANDLER_TIMEOUT_MS,
    prototypeEnabled: true,
    ...configOverrides,
  };

  const server = await startNodeHandlerServer(
    createPrototypeHandler({
      loadConfig: () => config,
      customFetch,
    }),
  );
  activeServers.push(server);
  return server;
}

afterEach(async () => {
  vi.restoreAllMocks();
  while (activeServers.length > 0) {
    const srv = activeServers.pop();
    if (srv) {
      await srv.close();
    }
  }
});

describe('Stage 1 AI Prototype — Config & Key Boundary (Test A)', () => {
  it('enforces approved timeout defaults and clamps misconfigured overrides safely', () => {
    const defaults = loadAiServerConfig({});
    expect(defaults.model).toBe('gemini-4-hydrogen');
    expect(defaults.geminiTimeoutMs).toBe(18_000);
    expect(defaults.handlerTimeoutMs).toBe(22_000);
    expect(defaults.apiKey).toBeNull();
    expect(defaults.prototypeEnabled).toBe(true);

    const inverted = loadAiServerConfig({
      GEMINI_TIMEOUT_MS: '25000',
      API_HANDLER_TIMEOUT_MS: '22000',
      VERCEL_ENV: 'production',
    });
    expect(inverted.handlerTimeoutMs).toBe(22_000);
    expect(inverted.geminiTimeoutMs).toBeLessThan(inverted.handlerTimeoutMs);
    expect(inverted.prototypeEnabled).toBe(false);

    const overCap = loadAiServerConfig({
      API_HANDLER_TIMEOUT_MS: '60000',
      GEMINI_TIMEOUT_MS: '55000',
    });
    expect(overCap.handlerTimeoutMs).toBe(MAX_SAFE_HANDLER_TIMEOUT_MS);
    expect(overCap.geminiTimeoutMs).toBeLessThan(overCap.handlerTimeoutMs);
  });

  it('selects DATA_DETECTIVE_GEMINI_API_KEY first, falls back to GEMINI_API_KEY, and returns null when both are absent', () => {
    const bothSet = loadAiServerConfig({
      DATA_DETECTIVE_GEMINI_API_KEY: '  custom-primary-key  ',
      GEMINI_API_KEY: 'legacy-fallback-key',
    });
    expect(bothSet.apiKey).toBe('custom-primary-key');

    const customOnly = loadAiServerConfig({
      DATA_DETECTIVE_GEMINI_API_KEY: 'custom-only-key',
    });
    expect(customOnly.apiKey).toBe('custom-only-key');

    const fallbackOnly = loadAiServerConfig({
      GEMINI_API_KEY: '  legacy-fallback-key  ',
    });
    expect(fallbackOnly.apiKey).toBe('legacy-fallback-key');

    const blankCustomFallsBack = loadAiServerConfig({
      DATA_DETECTIVE_GEMINI_API_KEY: '   ',
      GEMINI_API_KEY: 'legacy-fallback-key',
    });
    expect(blankCustomFallsBack.apiKey).toBe('legacy-fallback-key');

    const neitherSet = loadAiServerConfig({
      DATA_DETECTIVE_GEMINI_API_KEY: '   ',
      GEMINI_API_KEY: '',
    });
    expect(neitherSet.apiKey).toBeNull();
  });

  it('reports configured state on GET /api/ai/health for custom key, fallback key, and missing keys without exposing secrets', async () => {
    const originalCustomKey = process.env.DATA_DETECTIVE_GEMINI_API_KEY;
    const originalFallbackKey = process.env.GEMINI_API_KEY;
    const customSecret = 'custom-secret-never-expose-777';
    const fallbackSecret = 'fallback-secret-never-expose-888';

    try {
      const healthServer = await startNodeHandlerServer(healthHandler);
      activeServers.push(healthServer);

      // 1. Both absent -> configured: false
      delete process.env.DATA_DETECTIVE_GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      const missingRes = await fetch(`${healthServer.baseUrl}/api/ai/health`);
      const missingBody = (await missingRes.json()) as HealthResponse;

      expect(missingRes.status).toBe(200);
      expect(missingRes.headers.get('cache-control')).toBe('no-store');
      expect(missingRes.headers.get('x-request-id')).toMatch(/^req_/);
      expect(missingBody.ok).toBe(true);
      expect(missingBody.configured).toBe(false);
      expect(missingBody.model).toBe(DEFAULT_GEMINI_MODEL);
      expect(missingBody.sdkAttemptsConfigured).toBe(SDK_ATTEMPTS_CONFIGURED);
      expect(missingBody.timeouts).toEqual({
        geminiTimeoutMs: 18_000,
        handlerTimeoutMs: 22_000,
        frontendRecommendedTimeoutMs: 27_000,
        vercelMaxDurationSec: 30,
      });

      // 2. Custom variable supplied -> configured: true and secret never exposed
      process.env.DATA_DETECTIVE_GEMINI_API_KEY = customSecret;
      const customRes = await fetch(`${healthServer.baseUrl}/api/ai/health`);
      const customText = await customRes.text();
      const customBody = JSON.parse(customText) as HealthResponse;
      expect(customRes.status).toBe(200);
      expect(customBody.configured).toBe(true);
      expect(customText).not.toContain(customSecret);

      // 3. Custom absent, GEMINI_API_KEY supplied -> configured: true and secret never exposed
      delete process.env.DATA_DETECTIVE_GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = fallbackSecret;
      const fallbackRes = await fetch(`${healthServer.baseUrl}/api/ai/health`);
      const fallbackText = await fallbackRes.text();
      const fallbackBody = JSON.parse(fallbackText) as HealthResponse;
      expect(fallbackRes.status).toBe(200);
      expect(fallbackBody.configured).toBe(true);
      expect(fallbackText).not.toContain(fallbackSecret);
    } finally {
      if (originalCustomKey !== undefined) {
        process.env.DATA_DETECTIVE_GEMINI_API_KEY = originalCustomKey;
      } else {
        delete process.env.DATA_DETECTIVE_GEMINI_API_KEY;
      }
      if (originalFallbackKey !== undefined) {
        process.env.GEMINI_API_KEY = originalFallbackKey;
      } else {
        delete process.env.GEMINI_API_KEY;
      }
    }
  });

  it('passes DATA_DETECTIVE_GEMINI_API_KEY over GEMINI_API_KEY to @google/genai and falls back when custom key is absent without leaking keys', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const customSecret = 'custom-key-priority-alpha-999';
    const fallbackSecret = 'fallback-key-beta-888';

    // Case 1: Both supplied -> custom key selected and sent to SDK
    let sentKey = '';
    const mockFetchCustom = vi.fn<typeof fetch>(async (_input, init) => {
      const headers = new Headers(init?.headers);
      sentKey = headers.get('x-goog-api-key') ?? '';
      return buildGeminiSuccessResponse('Custom key verified.');
    });

    const customServer = await startNodeHandlerServer(
      createPrototypeHandler({
        loadConfig: () =>
          loadAiServerConfig({
            DATA_DETECTIVE_GEMINI_API_KEY: customSecret,
            GEMINI_API_KEY: fallbackSecret,
            AI_PROTOTYPE_ENABLED: 'true',
          }),
        customFetch: mockFetchCustom,
      }),
    );
    activeServers.push(customServer);

    const customRes = await fetch(`${customServer.baseUrl}/api/ai/prototype`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'text', prompt: 'Verify custom key selection' }),
    });
    const customResText = await customRes.text();
    expect(customRes.status).toBe(200);
    expect(sentKey).toBe(customSecret);
    expect(customResText).not.toContain(customSecret);
    expect(customResText).not.toContain(fallbackSecret);

    // Case 2: Custom absent -> fallback GEMINI_API_KEY used
    sentKey = '';
    const mockFetchFallback = vi.fn<typeof fetch>(async (_input, init) => {
      const headers = new Headers(init?.headers);
      sentKey = headers.get('x-goog-api-key') ?? '';
      return buildGeminiSuccessResponse('Fallback key verified.');
    });

    const fallbackServer = await startNodeHandlerServer(
      createPrototypeHandler({
        loadConfig: () =>
          loadAiServerConfig({
            GEMINI_API_KEY: fallbackSecret,
            AI_PROTOTYPE_ENABLED: 'true',
          }),
        customFetch: mockFetchFallback,
      }),
    );
    activeServers.push(fallbackServer);

    const fallbackRes = await fetch(`${fallbackServer.baseUrl}/api/ai/prototype`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'text', prompt: 'Verify fallback key selection' }),
    });
    const fallbackResText = await fallbackRes.text();
    expect(fallbackRes.status).toBe(200);
    expect(sentKey).toBe(fallbackSecret);
    expect(fallbackResText).not.toContain(fallbackSecret);

    const serializedLogs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(serializedLogs).not.toContain(customSecret);
    expect(serializedLogs).not.toContain(fallbackSecret);
  });

  it('returns 503 CONFIG_MISSING when both DATA_DETECTIVE_GEMINI_API_KEY and GEMINI_API_KEY are absent and never calls upstream', async () => {
    const mockFetch = vi.fn<typeof fetch>();
    const server = await startNodeHandlerServer(
      createPrototypeHandler({
        loadConfig: () =>
          loadAiServerConfig({
            AI_PROTOTYPE_ENABLED: 'true',
          }),
        customFetch: mockFetch,
      }),
    );
    activeServers.push(server);

    const res = await fetch(`${server.baseUrl}/api/ai/prototype`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'text', prompt: 'Ping backend' }),
    });
    const body = (await res.json()) as PrototypeErrorResponse;

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('CONFIG_MISSING');
    expect(body.requestId).toMatch(/^req_/);
    expect(body.meta.sdkAttemptsConfigured).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 403 PROTOTYPE_DISABLED when prototype is disabled', async () => {
    const server = await launchPrototype({ prototypeEnabled: false });

    const res = await fetch(`${server.baseUrl}/api/ai/prototype`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'text', prompt: 'Hello' }),
    });
    const body = (await res.json()) as PrototypeErrorResponse;

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('PROTOTYPE_DISABLED');
  });

  it('resolves AI_PROTOTYPE_ENABLED="true" (with whitespace trimming) identically across health and prototype handlers', async () => {
    // Unit-level verification of resolvePrototypeEnabled() via loadAiServerConfig()
    expect(
      loadAiServerConfig({ AI_PROTOTYPE_ENABLED: 'true', VERCEL_ENV: 'preview' })
        .prototypeEnabled,
    ).toBe(true);
    expect(
      loadAiServerConfig({ AI_PROTOTYPE_ENABLED: '  true  ', VERCEL_ENV: 'preview' })
        .prototypeEnabled,
    ).toBe(true);
    expect(
      loadAiServerConfig({ AI_PROTOTYPE_ENABLED: 'TRUE', VERCEL_ENV: 'production' })
        .prototypeEnabled,
    ).toBe(true);
    expect(
      loadAiServerConfig({ AI_PROTOTYPE_ENABLED: '  true\n', VERCEL_ENV: 'production' })
        .prototypeEnabled,
    ).toBe(true);
    expect(
      loadAiServerConfig({ VERCEL_ENV: 'preview' }).prototypeEnabled,
    ).toBe(true);
    expect(
      loadAiServerConfig({ VERCEL_ENV: 'production' }).prototypeEnabled,
    ).toBe(false);
    expect(
      loadAiServerConfig({ AI_PROTOTYPE_ENABLED: 'false', VERCEL_ENV: 'preview' })
        .prototypeEnabled,
    ).toBe(false);

    // End-to-end verification that GET /api/ai/health and POST /api/ai/prototype
    // share the exact same live loadAiServerConfig(process.env) resolution.
    const originalEnabled = process.env.AI_PROTOTYPE_ENABLED;
    const originalVercelEnv = process.env.VERCEL_ENV;
    const originalCustomKey = process.env.DATA_DETECTIVE_GEMINI_API_KEY;
    const originalFallbackKey = process.env.GEMINI_API_KEY;

    try {
      const mockFetch = vi.fn<typeof fetch>(async () =>
        buildGeminiSuccessResponse('Prototype enabled regression passed.'),
      );
      const healthServer = await startNodeHandlerServer(healthHandler);
      const protoServer = await startNodeHandlerServer(
        createPrototypeHandler({ customFetch: mockFetch }),
      );
      activeServers.push(healthServer, protoServer);

      process.env.DATA_DETECTIVE_GEMINI_API_KEY = 'regression-test-key-001';
      delete process.env.GEMINI_API_KEY;

      // 1. Preview with AI_PROTOTYPE_ENABLED="true"
      process.env.VERCEL_ENV = 'preview';
      process.env.AI_PROTOTYPE_ENABLED = 'true';

      const healthPreviewRes = await fetch(`${healthServer.baseUrl}/api/ai/health`);
      const healthPreviewBody = (await healthPreviewRes.json()) as HealthResponse;
      expect(healthPreviewRes.status).toBe(200);
      expect(healthPreviewBody.prototypeEnabled).toBe(true);

      const protoPreviewRes = await fetch(`${protoServer.baseUrl}/api/ai/prototype`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'text', prompt: 'Check enabled on preview' }),
      });
      expect(protoPreviewRes.status).toBe(200);

      // 2. Whitespace-padded "  true  " even under VERCEL_ENV="production"
      process.env.VERCEL_ENV = 'production';
      process.env.AI_PROTOTYPE_ENABLED = '  true  ';

      const healthTrimmedRes = await fetch(`${healthServer.baseUrl}/api/ai/health`);
      const healthTrimmedBody = (await healthTrimmedRes.json()) as HealthResponse;
      expect(healthTrimmedBody.prototypeEnabled).toBe(true);

      const protoTrimmedRes = await fetch(`${protoServer.baseUrl}/api/ai/prototype`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'text', prompt: 'Check trimmed true' }),
      });
      expect(protoTrimmedRes.status).toBe(200);

      // 3. Production with AI_PROTOTYPE_ENABLED unset -> both report disabled
      delete process.env.AI_PROTOTYPE_ENABLED;

      const healthProdRes = await fetch(`${healthServer.baseUrl}/api/ai/health`);
      const healthProdBody = (await healthProdRes.json()) as HealthResponse;
      expect(healthProdBody.prototypeEnabled).toBe(false);

      const protoProdRes = await fetch(`${protoServer.baseUrl}/api/ai/prototype`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'text', prompt: 'Check disabled on production' }),
      });
      const protoProdBody = (await protoProdRes.json()) as PrototypeErrorResponse;
      expect(protoProdRes.status).toBe(403);
      expect(protoProdBody.error.code).toBe('PROTOTYPE_DISABLED');
    } finally {
      if (originalEnabled !== undefined) {
        process.env.AI_PROTOTYPE_ENABLED = originalEnabled;
      } else {
        delete process.env.AI_PROTOTYPE_ENABLED;
      }
      if (originalVercelEnv !== undefined) {
        process.env.VERCEL_ENV = originalVercelEnv;
      } else {
        delete process.env.VERCEL_ENV;
      }
      if (originalCustomKey !== undefined) {
        process.env.DATA_DETECTIVE_GEMINI_API_KEY = originalCustomKey;
      } else {
        delete process.env.DATA_DETECTIVE_GEMINI_API_KEY;
      }
      if (originalFallbackKey !== undefined) {
        process.env.GEMINI_API_KEY = originalFallbackKey;
      } else {
        delete process.env.GEMINI_API_KEY;
      }
    }
  });
});

describe('Stage 1 AI Prototype — SDK Generation, Single Attempt & Validation (Tests B, C, D)', () => {
  it('invokes real @google/genai SDK with configured model for basic text generation (Tests B & C)', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    let capturedUrl = '';
    let capturedUserAgent = '';

    const mockFetch = vi.fn<typeof fetch>(async (input, init) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      const headers = new Headers(init?.headers);
      capturedUserAgent = headers.get('user-agent') ?? '';
      return buildGeminiSuccessResponse(
        'Data Detective prototype operational with Gemini backend.',
      );
    });

    const secretKey = 'super-secret-api-key-12345';
    const sensitivePrompt = 'Confirm telemetry does not log this exact prompt phrase.';
    const server = await launchPrototype({ apiKey: secretKey }, mockFetch);

    const res = await fetch(`${server.baseUrl}/api/ai/prototype`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'text', prompt: sensitivePrompt }),
    });
    const body = (await res.json()) as PrototypeSuccessResponse;

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('text');
    expect(body.data).toEqual({
      text: 'Data Detective prototype operational with Gemini backend.',
    });
    expect(body.meta.model).toBe('gemini-4-hydrogen');
    expect(body.meta.sdkAttemptsConfigured).toBe(1);
    expect(body.meta.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(capturedUrl).toContain('models/gemini-4-hydrogen:generateContent');
    expect(capturedUserAgent).toContain('aistudio-build');

    // Verify neither API key nor prompt content appears in logs or response.
    const serializedLogs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(serializedLogs).not.toContain(secretKey);
    expect(serializedLogs).not.toContain(sensitivePrompt);
    expect(JSON.stringify(body)).not.toContain(secretKey);
  });

  it('parses and validates structured JSON responses end-to-end (Test D)', async () => {
    const mockFetch = vi.fn<typeof fetch>(async () =>
      buildGeminiSuccessResponse(
        JSON.stringify({
          status: 'ok',
          summary: 'Structured verification succeeded cleanly.',
          keyPoints: ['Native ESM handler verified', 'Schema contract validated'],
        }),
      ),
    );

    const server = await launchPrototype({}, mockFetch);

    const res = await fetch(`${server.baseUrl}/api/ai/prototype`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'structured',
        prompt: 'Return a structured diagnostic check.',
      }),
    });
    const body = (await res.json()) as PrototypeSuccessResponse;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('structured');
    expect(body.data).toEqual({
      status: 'ok',
      summary: 'Structured verification succeeded cleanly.',
      keyPoints: ['Native ESM handler verified', 'Schema contract validated'],
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed or contract-violating structured JSON deterministically (Test D)', () => {
    const invalidSamples: (string | undefined)[] = [
      undefined,
      '   ',
      '{not-valid-json',
      '[]',
      JSON.stringify({ status: 'failed', summary: 'x', keyPoints: ['a'] }),
      JSON.stringify({ status: 'ok', summary: '', keyPoints: ['a'] }),
      JSON.stringify({ status: 'ok', summary: 'Valid', keyPoints: [] }),
      JSON.stringify({ status: 'ok', summary: 'Valid', keyPoints: [123] }),
      JSON.stringify({
        status: 'ok',
        summary: 'Valid',
        keyPoints: ['1', '2', '3', '4', '5', '6'],
      }),
    ];

    for (const sample of invalidSamples) {
      expect(() => parseAndValidateStructuredOutput(sample)).toThrowError(
        expect.objectContaining({
          code: 'MALFORMED_MODEL_RESPONSE',
          statusCode: 502,
        }),
      );
    }
  });
});

describe('Stage 1 AI Prototype — Retry Count & Error Matrix (Test F)', () => {
  it('executes strictly 1 SDK attempt (0 retries) even on retryable 429 and 503 statuses', async () => {
    for (const [status, statusText, message, expectedCode, expectedHttp] of [
      [429, 'RESOURCE_EXHAUSTED', 'Quota exceeded', 'RATE_LIMITED', 429],
      [503, 'UNAVAILABLE', 'Service temporarily unavailable', 'UPSTREAM_ERROR', 502],
    ] as const) {
      const mockFetch = vi.fn<typeof fetch>(async () =>
        buildGeminiErrorResponse(status, statusText, message),
      );
      const server = await launchPrototype({}, mockFetch);

      const res = await fetch(`${server.baseUrl}/api/ai/prototype`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'text', prompt: 'Retry check' }),
      });
      const body = (await res.json()) as PrototypeErrorResponse;

      expect(res.status).toBe(expectedHttp);
      expect(body.error.code).toBe(expectedCode);
      // Empirical proof against the real @google/genai SDK: strictly 1 HTTP call.
      expect(mockFetch).toHaveBeenCalledTimes(1);
    }
  });

  it('classifies invalid key (401), permission denied (403), unavailable model (404), and malformed model response (502)', async () => {
    const cases = [
      {
        name: 'invalid key',
        response: () =>
          buildGeminiErrorResponse(401, 'UNAUTHENTICATED', 'API key not valid.'),
        expectedHttp: 401,
        expectedCode: 'AUTH_INVALID',
        retryable: false,
      },
      {
        name: 'permission denied',
        response: () =>
          buildGeminiErrorResponse(403, 'PERMISSION_DENIED', 'Permission denied.'),
        expectedHttp: 403,
        expectedCode: 'PERMISSION_DENIED',
        retryable: false,
      },
      {
        name: 'unavailable model',
        response: () =>
          buildGeminiErrorResponse(
            404,
            'NOT_FOUND',
            'models/unknown-model is not found for API version v1beta.',
          ),
        expectedHttp: 502,
        expectedCode: 'MODEL_UNAVAILABLE',
        retryable: false,
      },
      {
        name: 'malformed structured JSON',
        response: () => buildGeminiSuccessResponse('not json at all'),
        expectedHttp: 502,
        expectedCode: 'MALFORMED_MODEL_RESPONSE',
        retryable: false,
      },
    ] as const;

    for (const testCase of cases) {
      const mockFetch = vi.fn<typeof fetch>(async () => testCase.response());
      const server = await launchPrototype({}, mockFetch);

      const res = await fetch(`${server.baseUrl}/api/ai/prototype`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: testCase.name === 'malformed structured JSON' ? 'structured' : 'text',
          prompt: `Error test: ${testCase.name}`,
        }),
      });
      const body = (await res.json()) as PrototypeErrorResponse;

      expect(res.status).toBe(testCase.expectedHttp);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe(testCase.expectedCode);
      expect(body.error.retryable).toBe(testCase.retryable);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects oversized payloads (413), raw spreadsheet row payloads (400), and invalid methods (405)', async () => {
    const mockFetch = vi.fn<typeof fetch>();
    const server = await launchPrototype({}, mockFetch);

    // 1. Oversized request (> 16 KiB)
    const oversizedRes = await fetch(`${server.baseUrl}/api/ai/prototype`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'text', prompt: 'x'.repeat(20_000) }),
    });
    const oversizedBody = (await oversizedRes.json()) as PrototypeErrorResponse;
    expect(oversizedRes.status).toBe(413);
    expect(oversizedBody.error.code).toBe('PAYLOAD_TOO_LARGE');

    // 2. Raw spreadsheet rows rejected
    const rawRowsRes = await fetch(`${server.baseUrl}/api/ai/prototype`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'text',
        prompt: 'Analyze rows',
        rows: [['Alice', 100]],
      }),
    });
    const rawRowsBody = (await rawRowsRes.json()) as PrototypeErrorResponse;
    expect(rawRowsRes.status).toBe(400);
    expect(rawRowsBody.error.code).toBe('VALIDATION_ERROR');

    // 3. Invalid HTTP method
    const getRes = await fetch(`${server.baseUrl}/api/ai/prototype`, {
      method: 'GET',
    });
    const getBody = (await getRes.json()) as PrototypeErrorResponse;
    expect(getRes.status).toBe(405);
    expect(getBody.error.code).toBe('METHOD_NOT_ALLOWED');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('Stage 1 AI Prototype — Timeout & Lifecycle Behavior (Test E)', () => {
  function createAbortableStallFetch(stallMs: number): typeof fetch {
    return vi.fn<typeof fetch>(async (_input, init) => {
      return new Promise<Response>((resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
          return;
        }

        const timer = setTimeout(() => {
          resolve(buildGeminiSuccessResponse('Too late'));
        }, stallMs);

        const onAbort = (): void => {
          clearTimeout(timer);
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        };

        signal?.addEventListener('abort', onAbort, { once: true });
      });
    });
  }

  it('aborts waiting on a short simulated Gemini SDK timeout and returns 504 UPSTREAM_TIMEOUT', async () => {
    const slowFetch = createAbortableStallFetch(5_000);
    const server = await launchPrototype(
      {
        geminiTimeoutMs: 80,
        handlerTimeoutMs: 1_000,
      },
      slowFetch,
    );

    const res = await fetch(`${server.baseUrl}/api/ai/prototype`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'text', prompt: 'Trigger short SDK timeout' }),
    });
    const body = (await res.json()) as PrototypeErrorResponse;

    expect(res.status).toBe(504);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('UPSTREAM_TIMEOUT');
    expect(body.meta.timeoutPhase).toBe('gemini_sdk');
    expect(body.meta.durationMs).toBeGreaterThanOrEqual(70);
    expect(body.meta.durationMs).toBeLessThan(800);
    expect(slowFetch).toHaveBeenCalledTimes(1);
  });

  it('enforces the REAL 22,000 ms backend deadline with a controlled slow mock before Vercel 30s and frontend 27s caps', async () => {
    // Set geminiTimeoutMs above 22,000 ms strictly for this controlled test so
    // the real 22,000 ms backend deadline timer is what triggers and responds.
    const slowFetch = createAbortableStallFetch(29_000);
    const server = await launchPrototype(
      {
        geminiTimeoutMs: 25_000,
        handlerTimeoutMs: DEFAULT_HANDLER_TIMEOUT_MS, // real 22,000 ms deadline
      },
      slowFetch,
    );

    // Simulate frontend client with the approved 27,000 ms timeout receiving the
    // backend's 22,000 ms structured 504 response before timing out itself.
    const frontendController = new AbortController();
    const frontendTimer = setTimeout(() => frontendController.abort(), 27_000);

    try {
      const startedAt = performance.now();
      const res = await fetch(`${server.baseUrl}/api/ai/prototype`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'text',
          prompt: 'Verify real 22s backend deadline',
        }),
        signal: frontendController.signal,
      });
      const clientElapsedMs = Math.round(performance.now() - startedAt);
      const body = (await res.json()) as PrototypeErrorResponse;

      expect(frontendController.signal.aborted).toBe(false);
      expect(res.status).toBe(504);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('UPSTREAM_TIMEOUT');
      expect(body.meta.timeoutPhase).toBe('backend_deadline');
      expect(body.meta.durationMs).toBeGreaterThanOrEqual(21_900);
      expect(body.meta.durationMs).toBeLessThan(24_000);
      expect(clientElapsedMs).toBeLessThan(27_000);
      expect(slowFetch).toHaveBeenCalledTimes(1);
    } finally {
      clearTimeout(frontendTimer);
    }
  }, 30_000);

  it('does NOT falsely abort POST requests after body stream closes, and detects genuine premature client disconnects', async () => {
    // 1. Delayed response proves normal POST body end (`req` close) does NOT abort.
    const delayedFetch = vi.fn<typeof fetch>(async (_input, init) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 120);
        init?.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          },
          { once: true },
        );
      });
      return buildGeminiSuccessResponse('Completed after POST body finished');
    });

    const server1 = await launchPrototype({}, delayedFetch);
    const okRes = await fetch(`${server1.baseUrl}/api/ai/prototype`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'text', prompt: 'Wait 120ms cleanly' }),
    });
    expect(okRes.status).toBe(200);

    // 2. Genuine premature client disconnect aborts the upstream wait cleanly.
    let upstreamSignalAborted = false;
    const stallFetch = vi.fn<typeof fetch>(async (_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            upstreamSignalAborted = true;
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          },
          { once: true },
        );
      });
    });

    const server2 = await launchPrototype({}, stallFetch);
    const clientAbort = new AbortController();
    setTimeout(() => clientAbort.abort(), 80);

    await expect(
      fetch(`${server2.baseUrl}/api/ai/prototype`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'text', prompt: 'Disconnect early' }),
        signal: clientAbort.signal,
      }),
    ).rejects.toThrow();

    // Give Node socket close event a brief tick to propagate to res.on('close').
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(upstreamSignalAborted).toBe(true);
  });
});
