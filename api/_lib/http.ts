/**
 * Data Detective — Shared Node.js HTTP & Lifecycle Utilities
 *
 * Uses standard Node `IncomingMessage` / `ServerResponse` so the exact same
 * handlers run identically as native Vercel Node.js Serverless Functions and
 * inside the local Express dev server.
 *
 * Cancellation semantics:
 * - Never relies on `req.on('close')` alone (which fires normally when a POST
 *   request body stream finishes reading).
 * - Uses `res.on('close')` guarded by `!res.writableEnded` to detect genuine
 *   premature client disconnects, plus `req.on('aborted')` during body upload.
 * - Aborting the controller stops local waiting and releases server resources;
 *   it does NOT guarantee provider-side generation cancellation on Gemini.
 */

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiPrototypeError } from './errors.js';

export const MAX_PROTOTYPE_BODY_BYTES = 16 * 1024; // 16 KiB

type IncomingMessageWithOptionalBody = IncomingMessage & {
  body?: unknown;
};

export function createRequestId(): string {
  return `req_${randomUUID()}`;
}

export function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  requestId: string,
): void {
  if (res.writableEnded || res.destroyed) {
    return;
  }

  const serialized = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Request-Id', requestId);
  res.end(serialized);
}

/**
 * Reads and parses a bounded JSON request body.
 * Supports both raw Node streams and Vercel's pre-parsed `req.body` property
 * while enforcing `maxBytes` in both cases.
 */
export async function readBoundedJsonBody(
  req: IncomingMessage,
  maxBytes: number = MAX_PROTOTYPE_BODY_BYTES,
): Promise<unknown> {
  const contentLengthHeader = req.headers['content-length'];
  if (typeof contentLengthHeader === 'string') {
    const declaredBytes = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw new ApiPrototypeError({
        code: 'PAYLOAD_TOO_LARGE',
        statusCode: 413,
        message: `Request payload exceeds the ${maxBytes}-byte limit.`,
      });
    }
  }

  // Handle runtimes (e.g., Vercel Node helper) where the stream was already
  // consumed and attached to `req.body`.
  const preParsedReq = req as IncomingMessageWithOptionalBody;
  if (req.readableEnded && preParsedReq.body !== undefined) {
    if (typeof preParsedReq.body === 'string') {
      const byteLen = Buffer.byteLength(preParsedReq.body, 'utf8');
      if (byteLen > maxBytes) {
        throw new ApiPrototypeError({
          code: 'PAYLOAD_TOO_LARGE',
          statusCode: 413,
          message: `Request payload exceeds the ${maxBytes}-byte limit.`,
        });
      }
      try {
        return JSON.parse(preParsedReq.body);
      } catch {
        throw new ApiPrototypeError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'Request body contains invalid JSON.',
        });
      }
    }

    if (Buffer.isBuffer(preParsedReq.body)) {
      if (preParsedReq.body.byteLength > maxBytes) {
        throw new ApiPrototypeError({
          code: 'PAYLOAD_TOO_LARGE',
          statusCode: 413,
          message: `Request payload exceeds the ${maxBytes}-byte limit.`,
        });
      }
      try {
        return JSON.parse(preParsedReq.body.toString('utf8'));
      } catch {
        throw new ApiPrototypeError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'Request body contains invalid JSON.',
        });
      }
    }

    const serializedSize = Buffer.byteLength(
      JSON.stringify(preParsedReq.body) ?? '',
      'utf8',
    );
    if (serializedSize > maxBytes) {
      throw new ApiPrototypeError({
        code: 'PAYLOAD_TOO_LARGE',
        statusCode: 413,
        message: `Request payload exceeds the ${maxBytes}-byte limit.`,
      });
    }
    return preParsedReq.body;
  }

  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const finishReject = (error: ApiPrototypeError): void => {
      if (settled) return;
      settled = true;
      cleanupListeners();
      reject(error);
    };

    const finishResolve = (value: unknown): void => {
      if (settled) return;
      settled = true;
      cleanupListeners();
      resolve(value);
    };

    const onData = (chunk: Buffer | string): void => {
      if (settled) return;
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      totalBytes += buf.byteLength;
      if (totalBytes > maxBytes) {
        req.pause();
        finishReject(
          new ApiPrototypeError({
            code: 'PAYLOAD_TOO_LARGE',
            statusCode: 413,
            message: `Request payload exceeds the ${maxBytes}-byte limit.`,
          }),
        );
        return;
      }
      chunks.push(buf);
    };

    const onEnd = (): void => {
      if (settled) return;
      const rawText = Buffer.concat(chunks).toString('utf8').trim();
      if (rawText.length === 0) {
        finishReject(
          new ApiPrototypeError({
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            message: 'Request body must not be empty.',
          }),
        );
        return;
      }
      try {
        finishResolve(JSON.parse(rawText));
      } catch {
        finishReject(
          new ApiPrototypeError({
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            message: 'Request body contains invalid JSON.',
          }),
        );
      }
    };

    const onAborted = (): void => {
      finishReject(
        new ApiPrototypeError({
          code: 'CLIENT_DISCONNECTED',
          statusCode: 499,
          message: 'Client aborted the request while uploading the body.',
        }),
      );
    };

    const onError = (): void => {
      finishReject(
        new ApiPrototypeError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'Failed to read request body stream.',
        }),
      );
    };

    const cleanupListeners = (): void => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('aborted', onAborted);
      req.off('error', onError);
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('aborted', onAborted);
    req.on('error', onError);
  });
}

export interface RequestLifecycleHandle {
  readonly signal: AbortSignal;
  readonly isHandlerTimedOut: () => boolean;
  readonly isClientDisconnected: () => boolean;
  readonly cleanup: () => void;
}

/**
 * Tracks the backend total execution deadline and genuine premature client
 * disconnection using `res.on('close')` guarded by `!res.writableEnded`.
 */
export function createRequestLifecycle(
  res: ServerResponse,
  handlerTimeoutMs: number,
): RequestLifecycleHandle {
  const controller = new AbortController();
  let handlerTimedOut = false;
  let clientDisconnected = false;

  const deadlineTimer = setTimeout(() => {
    if (!controller.signal.aborted) {
      handlerTimedOut = true;
      controller.abort(new Error('HANDLER_DEADLINE'));
    }
  }, handlerTimeoutMs);

  const onResponseClose = (): void => {
    // Only treat as premature disconnect if response has NOT finished writing.
    if (!res.writableEnded && !controller.signal.aborted) {
      clientDisconnected = true;
      controller.abort(new Error('CLIENT_DISCONNECTED'));
    }
  };

  const cleanup = (): void => {
    clearTimeout(deadlineTimer);
    res.off('close', onResponseClose);
    res.off('finish', cleanup);
  };

  res.on('close', onResponseClose);
  res.on('finish', cleanup);

  return {
    signal: controller.signal,
    isHandlerTimedOut: () => handlerTimedOut,
    isClientDisconnected: () => clientDisconnected,
    cleanup,
  };
}

/**
 * Emits safe, structured, single-line JSON telemetry to server logs.
 * Never logs API keys, request headers, or user prompt contents.
 */
export function logSafeTelemetry(entry: {
  readonly event: string;
  readonly requestId: string;
  readonly route: string;
  readonly mode?: string;
  readonly model?: string;
  readonly statusCode: number;
  readonly errorCode?: string;
  readonly upstreamStatus?: number;
  readonly upstreamErrorStatus?: string;
  readonly durationMs: number;
  readonly sdkAttemptsConfigured?: number;
}): void {
  console.info(JSON.stringify(entry));
}
