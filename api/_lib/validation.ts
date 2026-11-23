/**
 * Data Detective — Request & Model Output Validation
 *
 * Enforces compact prompt-only inputs (blocking raw spreadsheet payloads)
 * and deterministically validates structured JSON returned by Gemini.
 */

import type {
  PrototypeMode,
  PrototypeRequestPayload,
  PrototypeStructuredOutput,
} from './contracts.js';
import { ApiPrototypeError } from './errors.js';

export const MAX_PROMPT_LENGTH = 1_000;
export const MAX_KEY_POINTS = 5;

const FORBIDDEN_RAW_DATA_KEYS = new Set([
  'rows',
  'rawrows',
  'rawdata',
  'cells',
  'csv',
  'rawcsv',
  'workbook',
  'worksheet',
  'filecontent',
  'spreadsheet',
  'datasetrows',
]);

const ALLOWED_REQUEST_KEYS = new Set(['mode', 'prompt']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates Stage 1 prototype request payloads.
 * Strictly rejects raw spreadsheet data fields and oversized prompts.
 */
export function validatePrototypeRequest(body: unknown): PrototypeRequestPayload {
  if (!isPlainObject(body)) {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Request body must be a JSON object.',
    });
  }

  for (const key of Object.keys(body)) {
    const normalized = key.toLowerCase();
    if (FORBIDDEN_RAW_DATA_KEYS.has(normalized)) {
      throw new ApiPrototypeError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Raw spreadsheet rows or file contents are not permitted in AI requests.',
      });
    }
    if (!ALLOWED_REQUEST_KEYS.has(key)) {
      throw new ApiPrototypeError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: `Unsupported request field "${key}". Only "mode" and "prompt" are allowed.`,
      });
    }
  }

  const rawMode = body.mode;
  let mode: PrototypeMode;
  if (rawMode === undefined) {
    mode = 'text';
  } else if (rawMode === 'text' || rawMode === 'structured') {
    mode = rawMode;
  } else {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Field "mode" must be either "text" or "structured".',
    });
  }

  const rawPrompt = body.prompt;
  if (typeof rawPrompt !== 'string') {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Field "prompt" is required and must be a string.',
    });
  }

  const prompt = rawPrompt.trim();
  if (prompt.length === 0) {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Field "prompt" must not be empty.',
    });
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Field "prompt" exceeds the maximum length of ${MAX_PROMPT_LENGTH} characters.`,
    });
  }

  return { mode, prompt };
}

/**
 * Validates basic text generation output from Gemini.
 */
export function validateTextOutput(rawText: string | undefined): string {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message: 'Model returned an empty text response.',
    });
  }
  return rawText.trim();
}

/**
 * Deterministically parses and validates structured JSON output from Gemini.
 * Never returns unvalidated JSON to clients.
 */
export function parseAndValidateStructuredOutput(
  rawText: string | undefined,
): PrototypeStructuredOutput {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message: 'Model returned an empty response when structured JSON was expected.',
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message: 'Model returned invalid JSON that could not be parsed.',
    });
  }

  if (!isPlainObject(parsed)) {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message: 'Model returned a non-object JSON payload.',
    });
  }

  if (parsed.status !== 'ok') {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message: 'Structured model response failed contract check: "status" must equal "ok".',
    });
  }

  if (typeof parsed.summary !== 'string' || parsed.summary.trim().length === 0) {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message: 'Structured model response failed contract check: "summary" must be a non-empty string.',
    });
  }

  if (!Array.isArray(parsed.keyPoints) || parsed.keyPoints.length === 0) {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message: 'Structured model response failed contract check: "keyPoints" must be a non-empty string array.',
    });
  }

  if (parsed.keyPoints.length > MAX_KEY_POINTS) {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message: `Structured model response exceeded maximum of ${MAX_KEY_POINTS} keyPoints.`,
    });
  }

  const normalizedKeyPoints: string[] = [];
  for (const item of parsed.keyPoints) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new ApiPrototypeError({
        code: 'MALFORMED_MODEL_RESPONSE',
        statusCode: 502,
        message: 'Structured model response failed contract check: every item in "keyPoints" must be a non-empty string.',
      });
    }
    normalizedKeyPoints.push(item.trim());
  }

  return {
    status: 'ok',
    summary: parsed.summary.trim(),
    keyPoints: normalizedKeyPoints,
  };
}
