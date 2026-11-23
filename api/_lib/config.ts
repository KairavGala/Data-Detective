/**
 * Data Detective — Server-Only Gemini Configuration
 *
 * Reads environment variables exclusively on the server.
 * Never throws at module import time and never exposes or logs secrets.
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';
export const DEFAULT_GEMINI_TIMEOUT_MS = 18_000;
export const DEFAULT_HANDLER_TIMEOUT_MS = 22_000;
export const RECOMMENDED_FRONTEND_TIMEOUT_MS = 27_000;
export const VERCEL_MAX_DURATION_SEC = 30 as const;
export const MAX_SAFE_HANDLER_TIMEOUT_MS = 28_000;
export const MIN_TIMEOUT_MS = 50;
export const SDK_ATTEMPTS_CONFIGURED = 1 as const;

export interface AiServerConfig {
  readonly apiKey: string | null;
  readonly model: string;
  readonly geminiTimeoutMs: number;
  readonly handlerTimeoutMs: number;
  readonly prototypeEnabled: boolean;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Resolves whether /api/ai/prototype is enabled.
 * - Explicit AI_PROTOTYPE_ENABLED="true" / "false" always wins.
 * - Defaults to disabled on Vercel Production (VERCEL_ENV === "production").
 * - Defaults to enabled in local development and Vercel Preview.
 */
function resolvePrototypeEnabled(env: NodeJS.ProcessEnv): boolean {
  const explicit = env.AI_PROTOTYPE_ENABLED?.trim().toLowerCase();
  if (explicit === 'true' || explicit === '1') {
    return true;
  }
  if (explicit === 'false' || explicit === '0') {
    return false;
  }
  return env.VERCEL_ENV !== 'production';
}

export function loadAiServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): AiServerConfig {
  const rawKey = env.GEMINI_API_KEY?.trim();
  const apiKey = rawKey && rawKey.length > 0 ? rawKey : null;

  const rawModel = env.GEMINI_MODEL?.trim();
  const model = rawModel && rawModel.length > 0 ? rawModel : DEFAULT_GEMINI_MODEL;

  const rawHandlerTimeout = parsePositiveInt(
    env.API_HANDLER_TIMEOUT_MS,
    DEFAULT_HANDLER_TIMEOUT_MS,
  );
  const handlerTimeoutMs = clamp(
    rawHandlerTimeout,
    MIN_TIMEOUT_MS + 50,
    MAX_SAFE_HANDLER_TIMEOUT_MS,
  );

  const rawGeminiTimeout = parsePositiveInt(
    env.GEMINI_TIMEOUT_MS,
    DEFAULT_GEMINI_TIMEOUT_MS,
  );
  // Enforce invariant: GEMINI_TIMEOUT_MS < API_HANDLER_TIMEOUT_MS <= 28000
  const maxAllowedGeminiTimeout = Math.max(MIN_TIMEOUT_MS, handlerTimeoutMs - 50);
  const geminiTimeoutMs = clamp(
    rawGeminiTimeout,
    MIN_TIMEOUT_MS,
    maxAllowedGeminiTimeout,
  );

  return {
    apiKey,
    model,
    geminiTimeoutMs,
    handlerTimeoutMs,
    prototypeEnabled: resolvePrototypeEnabled(env),
  };
}
