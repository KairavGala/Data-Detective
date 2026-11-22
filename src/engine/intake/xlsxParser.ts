import * as XLSX from 'xlsx';
import { APP_CONFIG, type IntakeLimits } from '@/config/app.config';
import type { ParsedTableDraft, WorksheetInfo } from '@/types';
import { formatCount } from '@/utils/format';
import { IntakeValidationError } from './errors';
import { buildColumnsAndRows } from './headers';
import { validateFileContentSignature } from './validation';

const DEFAULT_LIMITS: IntakeLimits = {
  maxFileSizeBytes: APP_CONFIG.intake.maxFileSizeBytes,
  maxRows: APP_CONFIG.intake.maxRows,
  maxColumns: APP_CONFIG.intake.maxColumns,
};

export interface InspectedWorkbook {
  readonly workbook: XLSX.WorkBook;
  readonly sheets: readonly WorksheetInfo[];
}

export interface XlsxExtractOptions {
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly sheetName: string;
  readonly availableSheets: readonly WorksheetInfo[];
  readonly hasHeaders: boolean;
  readonly limits?: IntakeLimits;
}

/**
 * Inspects an ArrayBuffer as an OpenXML .xlsx workbook using SheetJS.
 * Validates ZIP signature, detects corrupted workbooks, and enumerates worksheets.
 */
export function inspectXlsxBuffer(
  buffer: ArrayBuffer,
  fileName: string,
): InspectedWorkbook {
  const bytes = new Uint8Array(buffer);
  validateFileContentSignature(bytes, 'xlsx', fileName);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, {
      type: 'array',
      cellFormula: false, // Never extract or evaluate formulas
      cellHTML: false,
      cellText: false,
      cellDates: false,
      cellStyles: false,
      cellNF: false,
      bookVBA: false,
      bookDeps: false,
      bookFiles: false,
      bookProps: false,
      bookSheets: false,
      WTF: false,
    });
  } catch {
    throw new IntakeValidationError({
      code: 'CORRUPTED_WORKBOOK',
      title: 'Corrupted or unreadable Excel workbook',
      message: `"${fileName}" could not be parsed as a valid .xlsx workbook. The file may be corrupted, password-protected, or truncated.`,
    });
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new IntakeValidationError({
      code: 'NO_WORKSHEETS',
      title: 'Workbook contains no worksheets',
      message: `"${fileName}" does not contain any readable worksheets.`,
    });
  }

  const sheets: WorksheetInfo[] = workbook.SheetNames.map((name, index) => {
    const sheet = Object.prototype.hasOwnProperty.call(workbook.Sheets, name)
      ? workbook.Sheets[name]
      : undefined;
    const ref = sheet?.['!ref'];
    if (!sheet || !ref) {
      return {
        name,
        index,
        estimatedRows: 0,
        estimatedColumns: 0,
        isEmpty: true,
      };
    }

    const range = XLSX.utils.decode_range(ref);
    const estimatedRows = Math.max(0, range.e.r - range.s.r + 1);
    const estimatedColumns = Math.max(0, range.e.c - range.s.c + 1);

    return {
      name,
      index,
      estimatedRows,
      estimatedColumns,
      isEmpty: estimatedRows === 0 || estimatedColumns === 0,
    };
  });

  return { workbook, sheets };
}

function isMatrixRowEmpty(row: readonly unknown[]): boolean {
  for (let i = 0; i < row.length; i += 1) {
    const v = row[i];
    if (v !== null && v !== undefined && String(v).trim() !== '') {
      return false;
    }
  }
  return true;
}

/**
 * Extracts raw 2D matrix from a specific worksheet in a loaded SheetJS WorkBook.
 * Enforces declared range row/column limits BEFORE allocating large arrays.
 */
export function extractRawMatrixFromSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  limits: IntakeLimits = DEFAULT_LIMITS,
): unknown[][] {
  const sheet = Object.prototype.hasOwnProperty.call(workbook.Sheets, sheetName)
    ? workbook.Sheets[sheetName]
    : undefined;
  if (!sheet || !sheet['!ref']) {
    throw new IntakeValidationError({
      code: 'EMPTY_WORKSHEET',
      title: 'Selected worksheet is empty',
      message: `Worksheet "${sheetName}" contains no cell data. Choose a different worksheet or upload another file.`,
    });
  }

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const declaredRows = range.e.r - range.s.r + 1;
  const declaredCols = range.e.c - range.s.c + 1;

  if (declaredCols > limits.maxColumns) {
    throw new IntakeValidationError({
      code: 'COLUMN_LIMIT_EXCEEDED',
      title: 'Column limit exceeded',
      message: `Worksheet "${sheetName}" spans ${formatCount(declaredCols)} columns, exceeding the maximum limit of ${formatCount(limits.maxColumns)} columns.`,
      details: `Detected: ${formatCount(declaredCols)} columns · Maximum allowed: ${formatCount(limits.maxColumns)}`,
    });
  }

  // Allow +1 row buffer for header row; exact limit enforced after header split
  if (declaredRows > limits.maxRows + 1) {
    throw new IntakeValidationError({
      code: 'ROW_LIMIT_EXCEEDED',
      title: 'Row limit exceeded',
      message: `Worksheet "${sheetName}" spans ${formatCount(declaredRows)} rows, exceeding the maximum limit of ${formatCount(limits.maxRows)} data rows.`,
      details: `Detected: ${formatCount(declaredRows)} rows · Maximum allowed: ${formatCount(limits.maxRows)}`,
    });
  }

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });

  // Trim completely empty rows if SheetJS included formatting-only rows
  const nonEmptyRows = rawRows.filter((row) => !isMatrixRowEmpty(row));

  if (nonEmptyRows.length === 0) {
    throw new IntakeValidationError({
      code: 'EMPTY_WORKSHEET',
      title: 'Selected worksheet is empty',
      message: `Worksheet "${sheetName}" contains no populated cells. Choose another worksheet or file.`,
    });
  }

  return nonEmptyRows;
}

/**
 * Extracts and normalizes a worksheet into a ParsedTableDraft.
 */
export function buildXlsxDraftFromRaw(
  rawMatrix: readonly (readonly unknown[])[],
  options: XlsxExtractOptions,
): ParsedTableDraft {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const normalized = buildColumnsAndRows(rawMatrix, options.hasHeaders, limits);

  return {
    fileName: options.fileName,
    fileType: 'xlsx',
    fileSizeBytes: options.fileSizeBytes,
    sheetName: options.sheetName,
    availableSheets: options.availableSheets,
    hasHeaders: options.hasHeaders,
    rowCount: normalized.rowCount,
    columnCount: normalized.columnCount,
    columns: normalized.columns,
    rows: normalized.rows,
    warnings: normalized.warnings,
  };
}

/**
 * Convenience entry point for extracting a worksheet directly from an ArrayBuffer
 * (used by unit tests and non-worker fallback).
 */
export function parseXlsxWorksheetFromBuffer(
  buffer: ArrayBuffer,
  options: {
    readonly fileName: string;
    readonly fileSizeBytes: number;
    readonly sheetName?: string;
    readonly hasHeaders: boolean;
    readonly limits?: IntakeLimits;
  },
): ParsedTableDraft {
  const { workbook, sheets } = inspectXlsxBuffer(buffer, options.fileName);
  const targetSheetName = options.sheetName ?? sheets[0]?.name;

  if (!targetSheetName) {
    throw new IntakeValidationError({
      code: 'NO_WORKSHEETS',
      title: 'Workbook contains no worksheets',
      message: `"${options.fileName}" does not contain any readable worksheets.`,
    });
  }

  const limits = options.limits ?? DEFAULT_LIMITS;
  const rawMatrix = extractRawMatrixFromSheet(workbook, targetSheetName, limits);

  return buildXlsxDraftFromRaw(rawMatrix, {
    fileName: options.fileName,
    fileSizeBytes: options.fileSizeBytes,
    sheetName: targetSheetName,
    availableSheets: sheets,
    hasHeaders: options.hasHeaders,
    limits,
  });
}
