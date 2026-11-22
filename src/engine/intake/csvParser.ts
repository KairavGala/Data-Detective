import Papa, { type ParseError } from 'papaparse';
import { APP_CONFIG, type IntakeLimits } from '@/config/app.config';
import type { IntakeWarning, ParsedTableDraft } from '@/types';
import { IntakeValidationError } from './errors';
import { buildColumnsAndRows } from './headers';

export interface CsvParseOptions {
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly hasHeaders: boolean;
  readonly limits?: IntakeLimits;
}

export interface CsvRawParseOutput {
  readonly rawMatrix: readonly (readonly string[])[];
  readonly delimiter: string;
  readonly preWarnings: readonly IntakeWarning[];
}

const DEFAULT_LIMITS: IntakeLimits = {
  maxFileSizeBytes: APP_CONFIG.intake.maxFileSizeBytes,
  maxRows: APP_CONFIG.intake.maxRows,
  maxColumns: APP_CONFIG.intake.maxColumns,
};

const DELIMITERS_TO_GUESS = [',', '\t', ';', '|'];

function isBlankRow(row: readonly string[]): boolean {
  return row.length === 0 || (row.length === 1 && (row[0] ?? '') === '');
}

/**
 * Strips trailing empty EOF rows produced by final line breaks
 * while preserving internal records so malformed rows are never silently lost.
 */
function trimTrailingEofEmptyRows(rows: string[][]): string[][] {
  let end = rows.length;
  while (end > 0) {
    const candidate = rows[end - 1];
    if (candidate && isBlankRow(candidate)) {
      end -= 1;
    } else {
      break;
    }
  }
  return end === rows.length ? rows : rows.slice(0, end);
}

/**
 * Distinguishes fatal structural quoting failures from recoverable field-length
 * or single-column delimiter notices.
 */
function classifyPapaErrors(
  errors: readonly ParseError[],
  preWarnings: IntakeWarning[],
): void {
  const fatalQuoteError = errors.find(
    (err) => err.type === 'Quotes' && err.code === 'MissingQuotes',
  );

  if (fatalQuoteError) {
    const rowLabel =
      typeof fatalQuoteError.row === 'number'
        ? ` near row ${fatalQuoteError.row + 1}`
        : '';
    throw new IntakeValidationError({
      code: 'MALFORMED_CSV',
      title: 'Malformed CSV quoting structure',
      message: `Unclosed quoted field detected${rowLabel}. Fix mismatched quotes in the source CSV and try again.`,
      details: fatalQuoteError.message,
    });
  }

  const invalidQuoteErrors = errors.filter(
    (err) => err.type === 'Quotes' && err.code === 'InvalidQuotes',
  );
  if (invalidQuoteErrors.length > 0) {
    preWarnings.push({
      code: 'CSV_MINOR_PARSE_WARNING',
      message: `${invalidQuoteErrors.length} quoting irregularit${invalidQuoteErrors.length === 1 ? 'y was' : 'ies were'} encountered during CSV parsing. Inspect the preview carefully before importing.`,
    });
  }
}

/**
 * Parses CSV text using Papa Parse into a raw string matrix + detected delimiter.
 * Preserves original text cell values (dynamicTyping is strictly disabled).
 */
export function parseCsvToRawMatrix(csvText: string): CsvRawParseOutput {
  const preWarnings: IntakeWarning[] = [];
  let normalizedText = csvText;

  // Strip UTF-8 BOM cleanly if present
  if (normalizedText.startsWith('\uFEFF')) {
    normalizedText = normalizedText.slice(1);
    preWarnings.push({
      code: 'UTF8_BOM_STRIPPED',
      message:
        'A UTF-8 byte order mark (BOM) was detected at the start of the file and removed cleanly.',
    });
  }

  if (normalizedText.trim().length === 0) {
    throw new IntakeValidationError({
      code: 'EMPTY_FILE',
      title: 'CSV file contains no records',
      message:
        'The CSV file is empty or contains only whitespace. Select a file with data rows and retry.',
    });
  }

  const result = Papa.parse<string[]>(normalizedText, {
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
    delimitersToGuess: DELIMITERS_TO_GUESS,
  });

  classifyPapaErrors(result.errors, preWarnings);

  const rawRows = trimTrailingEofEmptyRows(result.data);
  if (rawRows.length === 0) {
    throw new IntakeValidationError({
      code: 'EMPTY_FILE',
      title: 'CSV file contains no records',
      message: 'No readable rows were detected in this CSV file.',
    });
  }

  const delimiter = result.meta.delimiter || ',';

  return {
    rawMatrix: rawRows,
    delimiter,
    preWarnings,
  };
}

/**
 * Builds a complete ParsedTableDraft from an already-parsed CSV raw matrix.
 * Allows instant header toggling without re-reading the file.
 */
export function buildCsvDraftFromRaw(
  raw: CsvRawParseOutput,
  options: CsvParseOptions,
): ParsedTableDraft {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const normalized = buildColumnsAndRows(
    raw.rawMatrix,
    options.hasHeaders,
    limits,
  );

  return {
    fileName: options.fileName,
    fileType: 'csv',
    fileSizeBytes: options.fileSizeBytes,
    hasHeaders: options.hasHeaders,
    delimiter: raw.delimiter,
    rowCount: normalized.rowCount,
    columnCount: normalized.columnCount,
    columns: normalized.columns,
    rows: normalized.rows,
    warnings: [...raw.preWarnings, ...normalized.warnings],
  };
}

/**
 * Full synchronous CSV text parsing entry point (used by tests & non-worker fallback).
 */
export function parseCsvText(
  csvText: string,
  options: CsvParseOptions,
): ParsedTableDraft {
  const raw = parseCsvToRawMatrix(csvText);
  return buildCsvDraftFromRaw(raw, options);
}

const DEFAULT_CSV_CHUNK_SIZE = 256 * 1024; // 256 KB chunks keep event loop responsive

/**
 * Streams a browser File through Papa Parse in chunks with honest byte-level progress
 * and early row-limit protection.
 */
export function parseCsvFileChunked(
  file: File,
  limits: IntakeLimits = DEFAULT_LIMITS,
  onProgress?: (loadedBytes: number, totalBytes: number) => void,
  chunkSize: number = DEFAULT_CSV_CHUNK_SIZE,
): Promise<CsvRawParseOutput> {
  return new Promise((resolve, reject) => {
    const effectiveChunkSize = Math.max(16, Math.floor(chunkSize));
    const preWarnings: IntakeWarning[] = [];
    const collectedRows: string[][] = [];
    const collectedErrors: ParseError[] = [];
    let detectedDelimiter = ',';
    let checkedBom = false;
    let abortedForLimit = false;
    let chunksProcessed = 0;
    let lastReportedBytes = 0;
    const maxRawRowsAllowed = limits.maxRows + 2; // +1 header +1 trailing EOF

    Papa.parse<string[]>(file, {
      header: false,
      dynamicTyping: false,
      skipEmptyLines: false,
      delimitersToGuess: DELIMITERS_TO_GUESS,
      chunkSize: effectiveChunkSize,
      chunk: (results, parser) => {
        chunksProcessed += 1;

        if (results.meta.delimiter) {
          detectedDelimiter = results.meta.delimiter;
        }
        if (results.errors.length > 0) {
          collectedErrors.push(...results.errors);
        }

        const chunkRows = results.data;
        if (!checkedBom && chunkRows.length > 0) {
          checkedBom = true;
          const firstRow = chunkRows[0];
          const firstCell = firstRow?.[0];
          if (
            firstRow &&
            typeof firstCell === 'string' &&
            firstCell.startsWith('\uFEFF')
          ) {
            firstRow[0] = firstCell.slice(1);
            preWarnings.push({
              code: 'UTF8_BOM_STRIPPED',
              message:
                'A UTF-8 byte order mark (BOM) was detected at the start of the file and removed cleanly.',
            });
          }
        }

        for (let i = 0; i < chunkRows.length; i += 1) {
          const row = chunkRows[i];
          if (row) {
            if (row.length > limits.maxColumns) {
              abortedForLimit = true;
              parser.abort();
              reject(
                new IntakeValidationError({
                  code: 'COLUMN_LIMIT_EXCEEDED',
                  title: 'Column limit exceeded',
                  message: `Detected ${row.length.toLocaleString('en-US')} columns, which exceeds the maximum limit of ${limits.maxColumns.toLocaleString('en-US')} columns.`,
                }),
              );
              return;
            }
            collectedRows.push(row);
          }
        }

        if (collectedRows.length > maxRawRowsAllowed) {
          abortedForLimit = true;
          parser.abort();
          reject(
            new IntakeValidationError({
              code: 'ROW_LIMIT_EXCEEDED',
              title: 'Row limit exceeded',
              message: `This CSV file exceeds the maximum limit of ${limits.maxRows.toLocaleString('en-US')} rows. Filter or split the dataset before importing.`,
            }),
          );
          return;
        }

        if (onProgress && file.size > 0) {
          // Track exact processed input bytes sliced by FileStreamer (clamped, monotonic)
          const processedBytes = Math.min(
            chunksProcessed * effectiveChunkSize,
            file.size,
          );
          if (processedBytes >= lastReportedBytes) {
            lastReportedBytes = processedBytes;
            onProgress(processedBytes, file.size);
          }
        }
      },
      complete: () => {
        if (abortedForLimit) return;
        try {
          classifyPapaErrors(collectedErrors, preWarnings);
          const trimmedRows = trimTrailingEofEmptyRows(collectedRows);
          if (trimmedRows.length === 0) {
            reject(
              new IntakeValidationError({
                code: 'EMPTY_FILE',
                title: 'CSV file contains no records',
                message:
                  'The CSV file is empty or contains only blank lines. Select a file with data rows and retry.',
              }),
            );
            return;
          }
          if (onProgress) {
            onProgress(file.size, file.size);
          }
          resolve({
            rawMatrix: trimmedRows,
            delimiter: detectedDelimiter,
            preWarnings,
          });
        } catch (err) {
          reject(err);
        }
      },
      error: () => {
        if (abortedForLimit) return;
        reject(
          new IntakeValidationError({
            code: 'UNREADABLE_FILE',
            title: 'Unable to read CSV file',
            message:
              'The browser could not read this CSV file. Ensure the file is accessible and encoded in UTF-8.',
          }),
        );
      },
    });
  });
}
