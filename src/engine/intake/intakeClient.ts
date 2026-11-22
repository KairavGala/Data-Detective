import type * as XLSX from 'xlsx';
import { APP_CONFIG, type IntakeLimits } from '@/config/app.config';
import type {
  ImportedDataset,
  ParsedTableDraft,
  WorksheetInfo,
} from '@/types';
import {
  buildCsvDraftFromRaw,
  type CsvRawParseOutput,
  parseCsvToRawMatrix,
} from './csvParser';
import { IntakeValidationError, toIntakeError } from './errors';
import type {
  IntakeWorkerRequest,
  IntakeWorkerResponse,
} from './intake.worker';
import { validateFileContentSignature, validateFilePreFlight } from './validation';
import {
  buildXlsxDraftFromRaw,
  extractRawMatrixFromSheet,
  inspectXlsxBuffer,
} from './xlsxParser';

export type IntakeStartResult =
  | {
      readonly kind: 'draft';
      readonly draft: ParsedTableDraft;
    }
  | {
      readonly kind: 'worksheet_selection';
      readonly fileName: string;
      readonly fileSizeBytes: number;
      readonly sheets: readonly WorksheetInfo[];
    };

export interface IntakeStartOptions {
  readonly hasHeaders: boolean;
  readonly limits?: IntakeLimits;
  readonly onProgress?: (loadedBytes: number, totalBytes: number) => void;
  readonly signal?: AbortSignal;
}

const DEFAULT_LIMITS: IntakeLimits = {
  maxFileSizeBytes: APP_CONFIG.intake.maxFileSizeBytes,
  maxRows: APP_CONFIG.intake.maxRows,
  maxColumns: APP_CONFIG.intake.maxColumns,
};

async function readLeadingBytes(file: File, byteCount = 4096): Promise<Uint8Array> {
  const slice = file.slice(0, Math.min(file.size, byteCount));
  if (typeof slice.arrayBuffer === 'function') {
    const buffer = await slice.arrayBuffer();
    return new Uint8Array(buffer);
  }
  // Fallback for older jsdom File implementations without Blob.prototype.arrayBuffer
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error('Failed to read file bytes'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Read error'));
    reader.readAsArrayBuffer(slice);
  });
}

async function readFullArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file buffer'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Read error'));
    reader.readAsArrayBuffer(file);
  });
}

async function readFullText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file text'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Read error'));
    reader.readAsText(file, 'utf-8');
  });
}

function createCancelledError(): IntakeValidationError {
  return new IntakeValidationError({
    code: 'CANCELLED',
    title: 'Processing cancelled',
    message: 'File processing was cancelled before completion.',
  });
}

/**
 * Generates a unique dataset identifier and promotes a validated ParsedTableDraft
 * into the canonical ImportedDataset model.
 */
export function createDatasetFromDraft(draft: ParsedTableDraft): ImportedDataset {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return {
    id: `ds_${Date.now()}_${randomPart}`,
    fileName: draft.fileName,
    fileType: draft.fileType,
    fileSizeBytes: draft.fileSizeBytes,
    ...(draft.sheetName !== undefined ? { sheetName: draft.sheetName } : {}),
    hasHeaders: draft.hasHeaders,
    importedAt: Date.now(),
    rowCount: draft.rowCount,
    columnCount: draft.columnCount,
    columns: draft.columns,
    rows: draft.rows,
    warnings: draft.warnings,
  };
}

/**
 * Stateful ingestion controller coordinating Web Worker execution (when available)
 * with seamless async fallback in non-worker environments (e.g. jsdom/Vitest).
 */
export class EvidenceIntakeClient {
  private worker: Worker | null = null;
  private requestCounter = 0;
  private activeCancelCallback: (() => void) | null = null;

  // Fallback session cache used only when Web Workers are unavailable
  private fallbackFileName = '';
  private fallbackFileSizeBytes = 0;
  private fallbackCsvRaw: CsvRawParseOutput | null = null;
  private fallbackWorkbook: XLSX.WorkBook | null = null;
  private fallbackSheets: readonly WorksheetInfo[] = [];
  private fallbackActiveSheetName: string | null = null;
  private fallbackActiveSheetRaw: readonly (readonly unknown[])[] | null = null;

  private canUseWorker(): boolean {
    return typeof Worker !== 'undefined';
  }

  private getOrCreateWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./intake.worker.ts', import.meta.url), {
        type: 'module',
      });
    }
    return this.worker;
  }

  private clearFallbackCache(): void {
    this.fallbackFileName = '';
    this.fallbackFileSizeBytes = 0;
    this.fallbackCsvRaw = null;
    this.fallbackWorkbook = null;
    this.fallbackSheets = [];
    this.fallbackActiveSheetName = null;
    this.fallbackActiveSheetRaw = null;
  }

  /**
   * Immediately terminates any active worker, rejects any in-flight request,
   * and releases cached workbook memory.
   */
  cancelAndReset(): void {
    const pendingCancel = this.activeCancelCallback;
    this.activeCancelCallback = null;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.clearFallbackCache();
    pendingCancel?.();
  }

  /**
   * Releases temporary parsing memory while keeping the client reusable.
   */
  resetSession(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'reset' } satisfies IntakeWorkerRequest);
    }
    this.clearFallbackCache();
  }

  private dispatchToWorker<T>(
    request: IntakeWorkerRequest,
    requestId: number,
    onProgress?: (loadedBytes: number, totalBytes: number) => void,
    signal?: AbortSignal,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(createCancelledError());
        return;
      }

      const worker = this.getOrCreateWorker();
      let settled = false;

      const cleanup = () => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        signal?.removeEventListener('abort', handleAbort);
        if (this.activeCancelCallback === rejectAsCancelled) {
          this.activeCancelCallback = null;
        }
      };

      const rejectAsCancelled = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(createCancelledError());
      };

      const handleAbort = () => {
        this.cancelAndReset();
      };

      const handleError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        this.cancelAndReset();
        reject(
          new IntakeValidationError({
            code: 'UNREADABLE_FILE',
            title: 'Background parser encountered an error',
            message:
              'The parsing worker stopped unexpectedly while processing this file. Retry with a valid .csv or .xlsx file.',
          }),
        );
      };

      const handleMessage = (event: MessageEvent<IntakeWorkerResponse>) => {
        if (settled) return;
        const msg = event.data;
        if (msg.requestId !== requestId) return;

        if (msg.type === 'progress') {
          if (!signal?.aborted) {
            onProgress?.(msg.loadedBytes, msg.totalBytes);
          }
          return;
        }

        settled = true;
        cleanup();

        if (msg.type === 'error') {
          reject(new IntakeValidationError(msg.error));
          return;
        }

        if (msg.type === 'draft') {
          resolve({ kind: 'draft', draft: msg.draft } as T);
          return;
        }

        if (msg.type === 'worksheet-selection') {
          resolve({
            kind: 'worksheet_selection',
            fileName: msg.fileName,
            fileSizeBytes: msg.fileSizeBytes,
            sheets: msg.sheets,
          } as T);
        }
      };

      this.activeCancelCallback = rejectAsCancelled;
      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      signal?.addEventListener('abort', handleAbort, { once: true });

      worker.postMessage(request);
    });
  }

  async startFileIntake(
    file: File,
    options: IntakeStartOptions,
  ): Promise<IntakeStartResult> {
    const limits = options.limits ?? DEFAULT_LIMITS;

    // 1. Pre-flight extension & size validation
    const fileType = validateFilePreFlight(
      { name: file.name, size: file.size, type: file.type },
      limits,
    );

    if (options.signal?.aborted) {
      throw createCancelledError();
    }

    // 2. Content signature verification (independent of browser MIME type)
    let leadingBytes: Uint8Array;
    try {
      leadingBytes = await readLeadingBytes(file);
    } catch {
      throw new IntakeValidationError({
        code: 'UNREADABLE_FILE',
        title: 'File could not be read',
        message: `Browser access to "${file.name}" failed. Check file permissions and try again.`,
      });
    }

    if (options.signal?.aborted) {
      throw createCancelledError();
    }

    validateFileContentSignature(leadingBytes, fileType, file.name);

    // 3. Parse off the main thread in Web Worker when supported
    if (this.canUseWorker()) {
      const requestId = ++this.requestCounter;
      const request: IntakeWorkerRequest =
        fileType === 'csv'
          ? {
              type: 'parse-csv',
              requestId,
              file,
              hasHeaders: options.hasHeaders,
              limits,
            }
          : {
              type: 'inspect-xlsx',
              requestId,
              file,
              hasHeaders: options.hasHeaders,
              limits,
            };

      return this.dispatchToWorker<IntakeStartResult>(
        request,
        requestId,
        options.onProgress,
        options.signal,
      );
    }

    // 4. Direct async fallback (jsdom / test environments without Web Workers)
    this.clearFallbackCache();
    this.fallbackFileName = file.name;
    this.fallbackFileSizeBytes = file.size;

    try {
      if (fileType === 'csv') {
        const text = await readFullText(file);
        if (options.signal?.aborted) throw createCancelledError();
        options.onProgress?.(file.size, file.size);
        const raw = parseCsvToRawMatrix(text);
        this.fallbackCsvRaw = raw;
        const draft = buildCsvDraftFromRaw(raw, {
          fileName: file.name,
          fileSizeBytes: file.size,
          hasHeaders: options.hasHeaders,
          limits,
        });
        return { kind: 'draft', draft };
      }

      const buffer = await readFullArrayBuffer(file);
      if (options.signal?.aborted) throw createCancelledError();

      const inspected = inspectXlsxBuffer(buffer, file.name);
      this.fallbackWorkbook = inspected.workbook;
      this.fallbackSheets = inspected.sheets;

      if (inspected.sheets.length > 1) {
        return {
          kind: 'worksheet_selection',
          fileName: file.name,
          fileSizeBytes: file.size,
          sheets: inspected.sheets,
        };
      }

      const onlySheet = inspected.sheets[0]!;
      const rawMatrix = extractRawMatrixFromSheet(
        inspected.workbook,
        onlySheet.name,
        limits,
      );
      this.fallbackActiveSheetName = onlySheet.name;
      this.fallbackActiveSheetRaw = rawMatrix;

      const draft = buildXlsxDraftFromRaw(rawMatrix, {
        fileName: file.name,
        fileSizeBytes: file.size,
        sheetName: onlySheet.name,
        availableSheets: inspected.sheets,
        hasHeaders: options.hasHeaders,
        limits,
      });

      return { kind: 'draft', draft };
    } catch (err) {
      throw new IntakeValidationError(toIntakeError(err));
    }
  }

  async selectWorksheet(
    sheetName: string,
    hasHeaders: boolean,
    limits: IntakeLimits = DEFAULT_LIMITS,
    signal?: AbortSignal,
  ): Promise<ParsedTableDraft> {
    if (signal?.aborted) {
      throw createCancelledError();
    }

    if (this.canUseWorker()) {
      const requestId = ++this.requestCounter;
      const result = await this.dispatchToWorker<{
        readonly kind: 'draft';
        readonly draft: ParsedTableDraft;
      }>(
        {
          type: 'extract-xlsx-sheet',
          requestId,
          sheetName,
          hasHeaders,
          limits,
        },
        requestId,
        undefined,
        signal,
      );
      return result.draft;
    }

    if (!this.fallbackWorkbook) {
      throw new IntakeValidationError({
        code: 'UNREADABLE_FILE',
        title: 'Workbook session expired',
        message: 'Select the Excel file again to inspect its worksheets.',
      });
    }

    const rawMatrix = extractRawMatrixFromSheet(
      this.fallbackWorkbook,
      sheetName,
      limits,
    );
    this.fallbackActiveSheetName = sheetName;
    this.fallbackActiveSheetRaw = rawMatrix;

    return buildXlsxDraftFromRaw(rawMatrix, {
      fileName: this.fallbackFileName,
      fileSizeBytes: this.fallbackFileSizeBytes,
      sheetName,
      availableSheets: this.fallbackSheets,
      hasHeaders,
      limits,
    });
  }

  async updateHasHeaders(
    hasHeaders: boolean,
    limits: IntakeLimits = DEFAULT_LIMITS,
    signal?: AbortSignal,
  ): Promise<ParsedTableDraft> {
    if (signal?.aborted) {
      throw createCancelledError();
    }

    if (this.canUseWorker()) {
      const requestId = ++this.requestCounter;
      const result = await this.dispatchToWorker<{
        readonly kind: 'draft';
        readonly draft: ParsedTableDraft;
      }>(
        {
          type: 'reapply-headers',
          requestId,
          hasHeaders,
          limits,
        },
        requestId,
        undefined,
        signal,
      );
      return result.draft;
    }

    if (this.fallbackCsvRaw) {
      return buildCsvDraftFromRaw(this.fallbackCsvRaw, {
        fileName: this.fallbackFileName,
        fileSizeBytes: this.fallbackFileSizeBytes,
        hasHeaders,
        limits,
      });
    }

    if (this.fallbackActiveSheetRaw && this.fallbackActiveSheetName) {
      return buildXlsxDraftFromRaw(this.fallbackActiveSheetRaw, {
        fileName: this.fallbackFileName,
        fileSizeBytes: this.fallbackFileSizeBytes,
        sheetName: this.fallbackActiveSheetName,
        availableSheets: this.fallbackSheets,
        hasHeaders,
        limits,
      });
    }

    throw new IntakeValidationError({
      code: 'UNREADABLE_FILE',
      title: 'No parsed file in memory',
      message: 'Select a file again before changing header options.',
    });
  }
}
