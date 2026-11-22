import { APP_CONFIG, type IntakeLimits } from '@/config/app.config';
import type { ImportedColumn, IntakeWarning } from '@/types';
import { formatCount } from '@/utils/format';
import { IntakeValidationError } from './errors';

export interface NormalizedTableResult {
  readonly columns: readonly ImportedColumn[];
  readonly rows: readonly (readonly unknown[])[];
  readonly rowCount: number;
  readonly columnCount: number;
  readonly warnings: readonly IntakeWarning[];
}

const DEFAULT_LIMITS: IntakeLimits = {
  maxFileSizeBytes: APP_CONFIG.intake.maxFileSizeBytes,
  maxRows: APP_CONFIG.intake.maxRows,
  maxColumns: APP_CONFIG.intake.maxColumns,
};

function toSafeSlug(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return cleaned || 'col';
}

function isEmptyHeaderCell(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return String(value).trim().length === 0;
}

/**
 * Normalizes a raw 2D matrix into an ordered ImportedColumn array and row matrix.
 *
 * Guarantees:
 * - Enforces maxColumns and maxRows strictly without silent truncation.
 * - Preserves original column order and original header text.
 * - Never overwrites duplicate column names; assigns unique internal IDs and disambiguated display names.
 * - Detects empty headers and generates `Column N` labels.
 * - Detects inconsistent row lengths and pads short rows with `null` without discarding records.
 */
export function buildColumnsAndRows(
  rawMatrix: readonly (readonly unknown[])[],
  hasHeaders: boolean,
  limits: IntakeLimits = DEFAULT_LIMITS,
): NormalizedTableResult {
  if (rawMatrix.length === 0) {
    throw new IntakeValidationError({
      code: 'EMPTY_FILE',
      title: 'No tabular records found',
      message:
        'The selected source does not contain any readable rows. Verify the file or worksheet has data and try again.',
    });
  }

  const warnings: IntakeWarning[] = [];

  // Determine widest row across entire matrix without truncating any columns
  let columnCount = 0;
  for (let i = 0; i < rawMatrix.length; i += 1) {
    const row = rawMatrix[i];
    if (row && row.length > columnCount) {
      columnCount = row.length;
    }
  }

  if (columnCount === 0) {
    throw new IntakeValidationError({
      code: 'EMPTY_FILE',
      title: 'No columns detected',
      message: 'The parsed records contain zero columns.',
    });
  }

  if (columnCount > limits.maxColumns) {
    throw new IntakeValidationError({
      code: 'COLUMN_LIMIT_EXCEEDED',
      title: 'Column limit exceeded',
      message: `This file contains ${formatCount(columnCount)} columns, which exceeds the maximum limit of ${formatCount(limits.maxColumns)} columns. Remove unnecessary columns before importing.`,
      details: `Detected: ${formatCount(columnCount)} columns · Maximum allowed: ${formatCount(limits.maxColumns)}`,
    });
  }

  const rawHeaderRow = hasHeaders ? (rawMatrix[0] ?? []) : null;
  const rawDataRows = hasHeaders ? rawMatrix.slice(1) : rawMatrix;

  if (rawDataRows.length > limits.maxRows) {
    throw new IntakeValidationError({
      code: 'ROW_LIMIT_EXCEEDED',
      title: 'Row limit exceeded',
      message: `This file contains ${formatCount(rawDataRows.length)} data rows, which exceeds the maximum limit of ${formatCount(limits.maxRows)} rows. Filter or split the dataset before importing.`,
      details: `Detected: ${formatCount(rawDataRows.length)} rows · Maximum allowed: ${formatCount(limits.maxRows)}`,
    });
  }

  // Build ordered columns with empty & duplicate header detection
  const columns: ImportedColumn[] = [];
  const emptyHeaderIndices: number[] = [];
  const duplicateNames = new Set<string>();
  const seenCounts = new Map<string, number>();

  for (let colIdx = 0; colIdx < columnCount; colIdx += 1) {
    if (!hasHeaders) {
      const generatedName = `Column ${colIdx + 1}`;
      columns.push({
        id: `col_${colIdx}_${toSafeSlug(generatedName)}`,
        name: generatedName,
        originalName: '',
        index: colIdx,
        wasEmptyHeader: false,
        wasDuplicateHeader: false,
      });
      continue;
    }

    const rawCell = rawHeaderRow?.[colIdx];
    const isEmpty = isEmptyHeaderCell(rawCell);
    const originalName =
      rawCell === null || rawCell === undefined ? '' : String(rawCell);
    const trimmed = originalName.trim();

    if (isEmpty) {
      emptyHeaderIndices.push(colIdx + 1);
      const fallbackName = `Column ${colIdx + 1}`;
      const existingCount = seenCounts.get(fallbackName) ?? 0;
      seenCounts.set(fallbackName, existingCount + 1);
      const disambiguated =
        existingCount === 0
          ? fallbackName
          : `${fallbackName} (${existingCount + 1})`;

      columns.push({
        id: `col_${colIdx}_${toSafeSlug(disambiguated)}`,
        name: disambiguated,
        originalName,
        index: colIdx,
        wasEmptyHeader: true,
        wasDuplicateHeader: existingCount > 0,
      });
      continue;
    }

    const priorOccurrences = seenCounts.get(trimmed) ?? 0;
    seenCounts.set(trimmed, priorOccurrences + 1);

    const isDuplicate = priorOccurrences > 0;
    if (isDuplicate) {
      duplicateNames.add(trimmed);
    }

    const resolvedName = isDuplicate
      ? `${trimmed} (${priorOccurrences + 1})`
      : trimmed;

    columns.push({
      id: `col_${colIdx}_${toSafeSlug(trimmed)}`,
      name: resolvedName,
      originalName,
      index: colIdx,
      wasEmptyHeader: false,
      wasDuplicateHeader: isDuplicate,
    });
  }

  if (emptyHeaderIndices.length > 0) {
    const previewPositions = emptyHeaderIndices
      .slice(0, 6)
      .map((n) => `#${n}`)
      .join(', ');
    const overflow =
      emptyHeaderIndices.length > 6
        ? ` and ${emptyHeaderIndices.length - 6} more`
        : '';

    warnings.push({
      code: 'EMPTY_HEADER',
      message:
        emptyHeaderIndices.length === columnCount
          ? 'The first row contains no header names. Consider disabling "First row contains column headers".'
          : `${emptyHeaderIndices.length} column header${emptyHeaderIndices.length === 1 ? '' : 's'} ${emptyHeaderIndices.length === 1 ? 'was' : 'were'} empty and assigned default names.`,
      details: `Affected column position(s): ${previewPositions}${overflow}`,
    });
  }

  if (duplicateNames.size > 0) {
    const nameList = Array.from(duplicateNames).slice(0, 5).join(', ');
    const overflow =
      duplicateNames.size > 5 ? ` (+${duplicateNames.size - 5} more)` : '';
    warnings.push({
      code: 'DUPLICATE_HEADER',
      message: `Duplicate column headers were detected and preserved with numbered suffixes.`,
      details: `Duplicated header(s): ${nameList}${overflow}`,
    });
  }

  // Normalize row lengths without dropping records or cells
  let inconsistentRowCount = 0;
  const expectedBaseline =
    hasHeaders && rawHeaderRow ? rawHeaderRow.length : columnCount;

  const normalizedRows: unknown[][] = new Array(rawDataRows.length);

  for (let rowIdx = 0; rowIdx < rawDataRows.length; rowIdx += 1) {
    const sourceRow = rawDataRows[rowIdx] ?? [];
    if (sourceRow.length !== expectedBaseline || sourceRow.length !== columnCount) {
      inconsistentRowCount += 1;
    }

    if (sourceRow.length === columnCount) {
      normalizedRows[rowIdx] = [...sourceRow];
    } else {
      const padded = new Array<unknown>(columnCount);
      for (let c = 0; c < columnCount; c += 1) {
        padded[c] = c < sourceRow.length ? sourceRow[c] : null;
      }
      normalizedRows[rowIdx] = padded;
    }
  }

  if (inconsistentRowCount > 0) {
    warnings.push({
      code: 'INCONSISTENT_ROW_LENGTH',
      message: `${formatCount(inconsistentRowCount)} record${inconsistentRowCount === 1 ? '' : 's'} had a different column count than expected. Missing trailing cells were padded with empty values and no records were discarded.`,
    });
  }

  if (hasHeaders && normalizedRows.length === 0) {
    warnings.push({
      code: 'NO_DATA_ROWS',
      message:
        'Only a single header row was found with 0 data records. Disable "First row contains column headers" if this row is data.',
    });
  }

  return {
    columns,
    rows: normalizedRows,
    rowCount: normalizedRows.length,
    columnCount,
    warnings,
  };
}
