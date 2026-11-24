/**
 * Data Detective — Official @google/genai Server Client Wrapper
 *
 * Verified retry behavior against `@google/genai@2.32.0`:
 * - Uses strictly ONE retry layer inside the official SDK (`httpOptions.retryOptions`),
 *   with zero application-level retry loops.
 * - Retries ONLY transient HTTP `503` (Service Unavailable) up to
 *   `SDK_ATTEMPTS_CONFIGURED` total attempts (1 initial + up to 2 retries) with
 *   short capped jittered backoff (`0.4s` initial, `1.0s` max).
 * - Never retries `400`, `401`, `403`, `404`, `429`, or `504`.
 * - Total elapsed time across all attempts remains hard-bounded by `combinedSignal`
 *   (`GEMINI_TIMEOUT_MS` 18s and `API_HANDLER_TIMEOUT_MS` 22s).
 *
 * Note on cancellation:
 * - Aborting `AbortSignal` stops this server function from waiting on the HTTP
 *   response and releases local resources; it does NOT guarantee provider-side
 *   generation cancellation on Google's servers once accepted.
 */

import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  SDK_ATTEMPTS_CONFIGURED,
  SDK_RETRY_INITIAL_DELAY_SEC,
  SDK_RETRY_MAX_DELAY_SEC,
  SDK_RETRYABLE_STATUS_CODES,
} from './config.js';
import type {
  PrototypeRequestPayload,
  PrototypeStructuredOutput,
  PrototypeTextOutput,
} from './contracts.js';
import { ApiPrototypeError, classifyGeminiError } from './errors.js';
import {
  parseAndValidateStructuredOutput,
  validateTextOutput,
} from './validation.js';

function supportsThinkingLevel(model: string): boolean {
  return model.startsWith('gemini-4-') || model.startsWith('gemini-3');
}

export const PROTOTYPE_STRUCTURED_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    status: {
      type: Type.STRING,
      description: 'Must always be the exact lowercase literal string "ok".',
    },
    summary: {
      type: Type.STRING,
      description: 'A concise 1-2 sentence response addressing the user prompt.',
    },
    keyPoints: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
      },
      description: 'Between 1 and 5 concise bullet points.',
    },
  },
  required: ['status', 'summary', 'keyPoints'],
};

export interface GeminiExecutionOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly geminiTimeoutMs: number;
  readonly request: PrototypeRequestPayload;
  readonly lifecycleSignal: AbortSignal;
  readonly isHandlerTimedOut: () => boolean;
  readonly isClientDisconnected: () => boolean;
  /**
   * Optional fetch override strictly for controlled automated testing of the
   * real GoogleGenAI SDK (retry count, error classification, timeout behavior).
   */
  readonly customFetch?: typeof fetch;
}

export type GeminiExecutionResult =
  | {
      readonly mode: 'text';
      readonly data: PrototypeTextOutput;
    }
  | {
      readonly mode: 'structured';
      readonly data: PrototypeStructuredOutput;
    };

export async function runPrototypeGeneration(
  options: GeminiExecutionOptions,
): Promise<GeminiExecutionResult> {
  if (options.isClientDisconnected()) {
    throw new ApiPrototypeError({
      code: 'CLIENT_DISCONNECTED',
      statusCode: 499,
      message: 'Client closed the connection before generation began.',
    });
  }

  if (options.isHandlerTimedOut()) {
    throw new ApiPrototypeError({
      code: 'UPSTREAM_TIMEOUT',
      statusCode: 504,
      message: 'Backend request deadline exceeded before generation began.',
      retryable: true,
      timeoutPhase: 'backend_deadline',
    });
  }

  const geminiTimeoutController = new AbortController();
  let geminiTimedOut = false;

  const geminiTimer = setTimeout(() => {
    if (!geminiTimeoutController.signal.aborted) {
      geminiTimedOut = true;
      geminiTimeoutController.abort(new Error('GEMINI_SDK_TIMEOUT'));
    }
  }, options.geminiTimeoutMs);

  const combinedSignal = AbortSignal.any([
    geminiTimeoutController.signal,
    options.lifecycleSignal,
  ]);

  try {
    const ai = new GoogleGenAI({
      apiKey: options.apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
        timeout: options.geminiTimeoutMs,
        retryOptions: {
          attempts: SDK_ATTEMPTS_CONFIGURED,
          httpStatusCodes: [...SDK_RETRYABLE_STATUS_CODES],
          initialDelay: SDK_RETRY_INITIAL_DELAY_SEC,
          maxDelay: SDK_RETRY_MAX_DELAY_SEC,
          expBase: 2,
          jitter: 1,
        },
        ...(options.customFetch ? { fetch: options.customFetch } : {}),
      },
    });

    const isStructured = options.request.mode === 'structured';

    const response = await ai.models.generateContent({
      model: options.model,
      contents: options.request.prompt,
      config: {
        abortSignal: combinedSignal,
        ...(supportsThinkingLevel(options.model)
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : {}),
        systemInstruction: isStructured
          ? 'You are a concise backend API verification responder for Data Detective. Return strictly valid JSON matching the requested schema with status set to "ok", a concise 1-2 sentence summary, and 1 to 3 short keyPoints.'
          : 'You are a concise backend API verification responder for Data Detective. Respond clearly in 1 to 3 plain-text sentences without markdown code fences.',
        ...(isStructured
          ? {
              responseMimeType: 'application/json',
              responseSchema: PROTOTYPE_STRUCTURED_RESPONSE_SCHEMA,
            }
          : {}),
      },
    });

    // Guard against race where the handler deadline fired right as the response resolved.
    if (options.isHandlerTimedOut()) {
      throw new ApiPrototypeError({
        code: 'UPSTREAM_TIMEOUT',
        statusCode: 504,
        message: 'Backend request deadline exceeded before returning response.',
        retryable: true,
        timeoutPhase: 'backend_deadline',
      });
    }

    const rawText = response.text;

    if (isStructured) {
      const validated = parseAndValidateStructuredOutput(rawText);
      return { mode: 'structured', data: validated };
    }

    const validatedText = validateTextOutput(rawText);
    return { mode: 'text', data: { text: validatedText } };
  } catch (err: unknown) {
    throw classifyGeminiError(err, {
      geminiTimedOut,
      handlerTimedOut: options.isHandlerTimedOut(),
      clientDisconnected: options.isClientDisconnected(),
    });
  } finally {
    clearTimeout(geminiTimer);
  }
}
