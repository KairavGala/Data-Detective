import type * as XLSX from 'xlsx';
import type { IntakeLimits } from '@/config/app.config';
import type { IntakeError, ParsedTableDraft, WorksheetInfo } from '@/types';
import {
  buildCsvDraftFromRaw,
  type CsvRawParseOutput,
  parseCsvFileChunked,
} from './csvParser';
import { toIntakeError } from './errors';
import {
  buildXlsxDraftFromRaw,
  extractRawMatrixFromSheet,
  inspectXlsxBuffer,
} from './xlsxParser';

export type IntakeWorkerRequest =
  | {
      readonly type: 'parse-csv';
      readonly requestId: number;
      readonly file: File;
      readonly hasHeaders: boolean;
      readonly limits: IntakeLimits;
    }
  | {
      readonly type: 'inspect-xlsx';
      readonly requestId: number;
      readonly file: File;
      readonly hasHeaders: boolean;
      readonly limits: IntakeLimits;
    }
  | {
      readonly type: 'extract-xlsx-sheet';
      readonly requestId: number;
      readonly sheetName: string;
      readonly hasHeaders: boolean;
      readonly limits: IntakeLimits;
    }
  | {
      readonly type: 'reapply-headers';
      readonly requestId: number;
      readonly hasHeaders: boolean;
      readonly limits: IntakeLimits;
    }
  | {
      readonly type: 'reset';
    };

export type IntakeWorkerResponse =
  | {
      readonly type: 'progress';
      readonly requestId: number;
      readonly loadedBytes: number;
      readonly totalBytes: number;
    }
  | {
      readonly type: 'draft';
      readonly requestId: number;
      readonly draft: ParsedTableDraft;
    }
  | {
      readonly type: 'worksheet-selection';
      readonly requestId: number;
      readonly fileName: string;
      readonly fileSizeBytes: number;
      readonly sheets: readonly WorksheetInfo[];
    }
  | {
      readonly type: 'error';
      readonly requestId: number;
      readonly error: IntakeError;
    };

interface WorkerSessionCache {
  fileName: string;
  fileSizeBytes: number;
  csvRaw: CsvRawParseOutput | null;
  workbook: XLSX.WorkBook | null;
  sheets: readonly WorksheetInfo[];
  activeSheetName: string | null;
  activeSheetRaw: readonly (readonly unknown[])[] | null;
}

const cache: WorkerSessionCache = {
  fileName: '',
  fileSizeBytes: 0,
  csvRaw: null,
  workbook: null,
  sheets: [],
  activeSheetName: null,
  activeSheetRaw: null,
};

function clearCache(): void {
  cache.fileName = '';
  cache.fileSizeBytes = 0;
  cache.csvRaw = null;
  cache.workbook = null;
  cache.sheets = [];
  cache.activeSheetName = null;
  cache.activeSheetRaw = null;
}

const workerScope = self as unknown as {
  postMessage: (message: IntakeWorkerResponse) => void;
  onmessage: ((event: MessageEvent<IntakeWorkerRequest>) => void) | null;
};

workerScope.onmessage = async (event: MessageEvent<IntakeWorkerRequest>) => {
  const msg = event.data;

  if (msg.type === 'reset') {
    clearCache();
    return;
  }

  try {
    if (msg.type === 'parse-csv') {
      clearCache();
      cache.fileName = msg.file.name;
      cache.fileSizeBytes = msg.file.size;

      const raw = await parseCsvFileChunked(
        msg.file,
        msg.limits,
        (loadedBytes, totalBytes) => {
          workerScope.postMessage({
            type: 'progress',
            requestId: msg.requestId,
            loadedBytes,
            totalBytes,
          });
        },
      );

      cache.csvRaw = raw;
      const draft = buildCsvDraftFromRaw(raw, {
        fileName: msg.file.name,
        fileSizeBytes: msg.file.size,
        hasHeaders: msg.hasHeaders,
        limits: msg.limits,
      });

      workerScope.postMessage({
        type: 'draft',
        requestId: msg.requestId,
        draft,
      });
      return;
    }

    if (msg.type === 'inspect-xlsx') {
      clearCache();
      cache.fileName = msg.file.name;
      cache.fileSizeBytes = msg.file.size;

      const buffer = await msg.file.arrayBuffer();
      const inspected = inspectXlsxBuffer(buffer, msg.file.name);
      cache.workbook = inspected.workbook;
      cache.sheets = inspected.sheets;

      if (inspected.sheets.length > 1) {
        workerScope.postMessage({
          type: 'worksheet-selection',
          requestId: msg.requestId,
          fileName: msg.file.name,
          fileSizeBytes: msg.file.size,
          sheets: inspected.sheets,
        });
        return;
      }

      const onlySheet = inspected.sheets[0];
      if (!onlySheet) {
        throw toIntakeError(new Error('No worksheets'));
      }

      const rawMatrix = extractRawMatrixFromSheet(
        inspected.workbook,
        onlySheet.name,
        msg.limits,
      );
      cache.activeSheetName = onlySheet.name;
      cache.activeSheetRaw = rawMatrix;

      const draft = buildXlsxDraftFromRaw(rawMatrix, {
        fileName: msg.file.name,
        fileSizeBytes: msg.file.size,
        sheetName: onlySheet.name,
        availableSheets: inspected.sheets,
        hasHeaders: msg.hasHeaders,
        limits: msg.limits,
      });

      workerScope.postMessage({
        type: 'draft',
        requestId: msg.requestId,
        draft,
      });
      return;
    }

    if (msg.type === 'extract-xlsx-sheet') {
      if (!cache.workbook) {
        workerScope.postMessage({
          type: 'error',
          requestId: msg.requestId,
          error: {
            code: 'UNREADABLE_FILE',
            title: 'Workbook session expired',
            message: 'Please select the Excel file again to inspect its worksheets.',
          },
        });
        return;
      }

      const rawMatrix = extractRawMatrixFromSheet(
        cache.workbook,
        msg.sheetName,
        msg.limits,
      );
      cache.activeSheetName = msg.sheetName;
      cache.activeSheetRaw = rawMatrix;

      const draft = buildXlsxDraftFromRaw(rawMatrix, {
        fileName: cache.fileName,
        fileSizeBytes: cache.fileSizeBytes,
        sheetName: msg.sheetName,
        availableSheets: cache.sheets,
        hasHeaders: msg.hasHeaders,
        limits: msg.limits,
      });

      workerScope.postMessage({
        type: 'draft',
        requestId: msg.requestId,
        draft,
      });
      return;
    }

    if (msg.type === 'reapply-headers') {
      if (cache.csvRaw) {
        const draft = buildCsvDraftFromRaw(cache.csvRaw, {
          fileName: cache.fileName,
          fileSizeBytes: cache.fileSizeBytes,
          hasHeaders: msg.hasHeaders,
          limits: msg.limits,
        });
        workerScope.postMessage({
          type: 'draft',
          requestId: msg.requestId,
          draft,
        });
        return;
      }

      if (cache.activeSheetRaw && cache.activeSheetName) {
        const draft = buildXlsxDraftFromRaw(cache.activeSheetRaw, {
          fileName: cache.fileName,
          fileSizeBytes: cache.fileSizeBytes,
          sheetName: cache.activeSheetName,
          availableSheets: cache.sheets,
          hasHeaders: msg.hasHeaders,
          limits: msg.limits,
        });
        workerScope.postMessage({
          type: 'draft',
          requestId: msg.requestId,
          draft,
        });
        return;
      }

      workerScope.postMessage({
        type: 'error',
        requestId: msg.requestId,
        error: {
          code: 'UNREADABLE_FILE',
          title: 'No parsed file in memory',
          message: 'Please select a file again before changing header options.',
        },
      });
    }
  } catch (err) {
    workerScope.postMessage({
      type: 'error',
      requestId: msg.requestId,
      error: toIntakeError(err),
    });
  }
};
