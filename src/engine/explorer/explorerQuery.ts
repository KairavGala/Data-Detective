import {
  classifyMissingValue,
  classifyNumericValue,
  compileMissingPolicy,
  DEFAULT_MISSING_VALUE_POLICY,
  type CompiledMissingPolicy,
} from '@/engine/profiling';
import type {
  DatasetProfileSummary,
  DatasetStatisticalSummary,
  ExplorerCategoryOption,
  ExplorerColumnFilter,
  ExplorerPageSize,
  ExplorerPageSlice,
  ExplorerQueryConfig,
  ExplorerSortConfig,
  ImportedColumn,
  ImportedDataset,
  MissingValuePolicy,
  ProfileColumnType,
} from '@/types';
import { formatCellValue } from '@/utils/format';

export const EXPLORER_PAGE_SIZES: readonly ExplorerPageSize[] = [
  25, 50, 100, 250,
] as const;

export const DEFAULT_EXPLORER_PAGE_SIZE: ExplorerPageSize = 50;
export const DEFAULT_MAX_CATEGORY_FILTER_OPTIONS = 500;

export interface ExplorerColumnDescriptor {
  readonly column: ImportedColumn;
  readonly detectedType: ProfileColumnType;
}

/**
 * Resolves each column's authoritative Module 03 classification without
 * introducing any conflicting type-detection heuristic.
 */
export function resolveExplorerColumns(
  dataset: ImportedDataset,
  profile: DatasetProfileSummary | null,
): readonly ExplorerColumnDescriptor[] {
  const typeByColumnId = new Map<string, ProfileColumnType>();
  if (profile && profile.datasetId === dataset.id) {
    for (let i = 0; i < profile.columns.length; i += 1) {
      const colProf = profile.columns[i]!;
      typeByColumnId.set(colProf.columnId, colProf.detectedType);
    }
  }

  return dataset.columns.map((column) => ({
    column,
    detectedType: typeByColumnId.get(column.id) ?? 'unknown',
  }));
}

/**
 * Returns true if a column filter object contains at least one active constraint.
 */
export function isColumnFilterActive(
  filter: ExplorerColumnFilter | undefined,
): boolean {
  if (!filter) return false;
  if (filter.textQuery && filter.textQuery.trim().length > 0) return true;
  if (
    filter.numericMin !== undefined &&
    filter.numericMin !== null &&
    Number.isFinite(filter.numericMin)
  ) {
    return true;
  }
  if (
    filter.numericMax !== undefined &&
    filter.numericMax !== null &&
    Number.isFinite(filter.numericMax)
  ) {
    return true;
  }
  if (filter.selectedCategories && filter.selectedCategories.length > 0) {
    return true;
  }
  if (filter.missingMode && filter.missingMode !== 'all') return true;
  return false;
}

/**
 * Counts active query constraints (1 for global search if non-empty + 1 per active column filter).
 */
export function countActiveFilters(
  globalSearch: string,
  columnFilters: Readonly<Record<string, ExplorerColumnFilter>>,
): number {
  let count = globalSearch.trim().length > 0 ? 1 : 0;
  for (const key of Object.keys(columnFilters)) {
    if (isColumnFilterActive(columnFilters[key])) {
      count += 1;
    }
  }
  return count;
}

interface CompiledColumnFilter {
  readonly colIndex: number;
  readonly textNeedle: string | null;
  readonly hasNumericRange: boolean;
  readonly numericMin: number | null;
  readonly numericMax: number | null;
  readonly categorySet: ReadonlySet<string> | null;
  readonly missingMode: 'all' | 'exclude_missing' | 'only_missing';
}

function compileActiveColumnFilters(
  dataset: ImportedDataset,
  columnFilters: Readonly<Record<string, ExplorerColumnFilter>>,
): readonly CompiledColumnFilter[] {
  const indexById = new Map<string, number>();
  for (let i = 0; i < dataset.columns.length; i += 1) {
    const col = dataset.columns[i]!;
    indexById.set(col.id, col.index);
  }

  const compiled: CompiledColumnFilter[] = [];
  for (const [columnId, filter] of Object.entries(columnFilters)) {
    if (!isColumnFilterActive(filter)) continue;
    const colIndex = indexById.get(columnId);
    if (colIndex === undefined) continue;

    const trimmedText = filter.textQuery?.trim() ?? '';
    const numericMin =
      filter.numericMin !== undefined &&
      filter.numericMin !== null &&
      Number.isFinite(filter.numericMin)
        ? filter.numericMin
        : null;
    const numericMax =
      filter.numericMax !== undefined &&
      filter.numericMax !== null &&
      Number.isFinite(filter.numericMax)
        ? filter.numericMax
        : null;
    const categorySet =
      filter.selectedCategories && filter.selectedCategories.length > 0
        ? new Set<string>(filter.selectedCategories)
        : null;
    const missingMode = filter.missingMode ?? 'all';

    compiled.push({
      colIndex,
      textNeedle: trimmedText.length > 0 ? trimmedText.toLowerCase() : null,
      hasNumericRange: numericMin !== null || numericMax !== null,
      numericMin,
      numericMax,
      categorySet,
      missingMode,
    });
  }

  return compiled;
}

function matchesColumnFilter(
  raw: unknown,
  filter: CompiledColumnFilter,
  compiledMissing: CompiledMissingPolicy,
): boolean {
  const missingResult = classifyMissingValue(raw, compiledMissing);
  const isMissing = missingResult.kind !== 'present';

  if (filter.missingMode === 'only_missing') {
    if (!isMissing) return false;
  } else if (filter.missingMode === 'exclude_missing') {
    if (isMissing) return false;
  }

  if (filter.textNeedle !== null) {
    const formatted = formatCellValue(raw).toLowerCase();
    if (!formatted.includes(filter.textNeedle)) {
      return false;
    }
  }

  if (filter.hasNumericRange) {
    if (isMissing) return false;
    const num = classifyNumericValue(raw);
    if (
      !num.isValid ||
      num.numericValue === undefined ||
      !Number.isFinite(num.numericValue)
    ) {
      return false;
    }
    if (filter.numericMin !== null && num.numericValue < filter.numericMin) {
      return false;
    }
    if (filter.numericMax !== null && num.numericValue > filter.numericMax) {
      return false;
    }
  }

  if (filter.categorySet !== null) {
    if (isMissing) return false;
    const label = formatCellValue(raw).trim();
    if (!filter.categorySet.has(label)) {
      return false;
    }
  }

  return true;
}

function matchesGlobalSearch(
  row: readonly unknown[] | undefined,
  colCount: number,
  needle: string,
): boolean {
  if (!row) return false;
  const len = Math.min(row.length, colCount);
  for (let c = 0; c < len; c += 1) {
    const raw = row[c];
    if (raw === null || raw === undefined) continue;
    const formatted = formatCellValue(raw);
    if (formatted.length === 0) continue;
    if (formatted.toLowerCase().includes(needle)) {
      return true;
    }
  }
  return false;
}

/**
 * Single-pass immutable row filtering returning matching original 0-based row indices.
 * Never clones or mutates `dataset.rows`.
 */
export function filterDatasetRowIndices(
  dataset: ImportedDataset,
  query: Pick<ExplorerQueryConfig, 'globalSearch' | 'columnFilters'>,
  missingValuePolicy: MissingValuePolicy = DEFAULT_MISSING_VALUE_POLICY,
): number[] {
  const rowCount = dataset.rows.length;
  const colCount = dataset.columns.length;
  const globalNeedle = query.globalSearch.trim().toLowerCase();
  const hasGlobal = globalNeedle.length > 0;
  const activeColFilters = compileActiveColumnFilters(
    dataset,
    query.columnFilters,
  );
  const hasColFilters = activeColFilters.length > 0;

  // Fast path: no search or filters active -> return identity index sequence
  if (!hasGlobal && !hasColFilters) {
    const allIndices = new Array<number>(rowCount);
    for (let r = 0; r < rowCount; r += 1) {
      allIndices[r] = r;
    }
    return allIndices;
  }

  // Short-circuit if any active numeric filter has an impossible range (min > max)
  for (let f = 0; f < activeColFilters.length; f += 1) {
    const cf = activeColFilters[f]!;
    if (
      cf.numericMin !== null &&
      cf.numericMax !== null &&
      cf.numericMin > cf.numericMax
    ) {
      return [];
    }
  }

  const compiledMissing = compileMissingPolicy(missingValuePolicy);
  const matched: number[] = [];

  for (let r = 0; r < rowCount; r += 1) {
    const row = dataset.rows[r];

    let passes = true;
    if (hasColFilters) {
      for (let f = 0; f < activeColFilters.length; f += 1) {
        const cf = activeColFilters[f]!;
        const raw =
          row !== undefined && cf.colIndex < row.length
            ? row[cf.colIndex]
            : undefined;
        if (!matchesColumnFilter(raw, cf, compiledMissing)) {
          passes = false;
          break;
        }
      }
    }

    if (!passes) continue;

    if (hasGlobal && !matchesGlobalSearch(row, colCount, globalNeedle)) {
      continue;
    }

    matched.push(r);
  }

  return matched;
}

function parseSortableDateMs(value: unknown): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  // Prefer unambiguous ISO / YYYY-MM-DD timestamps
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Deterministic, stable sort over row indices using a Schwartzian key-extraction
 * pass for high speed on 100,000-row datasets.
 *
 * Semantics:
 * - Numeric columns sort numerically (via M03 `classifyNumericValue`).
 * - Date columns sort chronologically when parseable.
 * - Categorical/text/identifier/boolean/unknown columns sort case-insensitively
 *   with deterministic case tie-breaking.
 * - Missing (per M03 policy) and unparseable values ALWAYS sort at the end
 *   (NULLS LAST) in both ascending and descending order.
 * - Stability guaranteed via original 0-based row index tie-breaker.
 * - Never mutates `dataset.rows` or the input `rowIndices` array.
 */
export function sortDatasetRowIndices(
  dataset: ImportedDataset,
  rowIndices: readonly number[],
  sort: ExplorerSortConfig | null,
  profile: DatasetProfileSummary | null,
  missingValuePolicy: MissingValuePolicy = DEFAULT_MISSING_VALUE_POLICY,
): number[] {
  const n = rowIndices.length;
  if (!sort || n <= 1) {
    return rowIndices.slice();
  }

  const targetColumn = dataset.columns.find((c) => c.id === sort.columnId);
  if (!targetColumn) {
    return rowIndices.slice();
  }

  const colIndex = targetColumn.index;
  const detectedType: ProfileColumnType =
    profile && profile.datasetId === dataset.id
      ? (profile.columns.find((c) => c.columnId === sort.columnId)
          ?.detectedType ?? 'unknown')
      : 'unknown';

  const compiledMissing = compileMissingPolicy(missingValuePolicy);
  const dir = sort.direction === 'asc' ? 1 : -1;

  // Build position array 0..n-1 so pre-extracted key arrays index in O(1)
  const positions = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    positions[i] = i;
  }

  if (detectedType === 'numeric') {
    const numKeys = new Float64Array(n);
    const isMissingOrInvalid = new Uint8Array(n);

    for (let i = 0; i < n; i += 1) {
      const origIdx = rowIndices[i]!;
      const row = dataset.rows[origIdx];
      const raw =
        row !== undefined && colIndex < row.length ? row[colIndex] : undefined;

      if (classifyMissingValue(raw, compiledMissing).kind !== 'present') {
        isMissingOrInvalid[i] = 1;
        continue;
      }

      const num = classifyNumericValue(raw);
      if (
        !num.isValid ||
        num.numericValue === undefined ||
        !Number.isFinite(num.numericValue)
      ) {
        isMissingOrInvalid[i] = 1;
        continue;
      }

      numKeys[i] = Object.is(num.numericValue, -0) ? 0 : num.numericValue;
    }

    positions.sort((aPos, bPos) => {
      const aMiss = isMissingOrInvalid[aPos]!;
      const bMiss = isMissingOrInvalid[bPos]!;
      if (aMiss !== bMiss) return aMiss - bMiss; // Missing/invalid always last
      if (aMiss === 0) {
        const diff = numKeys[aPos]! - numKeys[bPos]!;
        if (diff !== 0) return diff * dir;
      }
      // Strict stability: preserve original dataset row order
      return rowIndices[aPos]! - rowIndices[bPos]!;
    });
  } else if (detectedType === 'date') {
    const dateKeys = new Float64Array(n);
    const fallbackLower = new Array<string>(n);
    const isMissing = new Uint8Array(n);
    const hasParsedDate = new Uint8Array(n);

    for (let i = 0; i < n; i += 1) {
      const origIdx = rowIndices[i]!;
      const row = dataset.rows[origIdx];
      const raw =
        row !== undefined && colIndex < row.length ? row[colIndex] : undefined;

      if (classifyMissingValue(raw, compiledMissing).kind !== 'present') {
        isMissing[i] = 1;
        continue;
      }

      const ms = parseSortableDateMs(raw);
      if (ms !== null) {
        hasParsedDate[i] = 1;
        dateKeys[i] = ms;
      } else {
        fallbackLower[i] = formatCellValue(raw).trim().toLowerCase();
      }
    }

    positions.sort((aPos, bPos) => {
      const aMiss = isMissing[aPos]!;
      const bMiss = isMissing[bPos]!;
      if (aMiss !== bMiss) return aMiss - bMiss;
      if (aMiss === 0) {
        const aParsed = hasParsedDate[aPos]!;
        const bParsed = hasParsedDate[bPos]!;
        if (aParsed !== bParsed) return bParsed - aParsed; // Valid dates before unparsed text
        if (aParsed === 1) {
          const diff = dateKeys[aPos]! - dateKeys[bPos]!;
          if (diff !== 0) return diff * dir;
        } else {
          const aTxt = fallbackLower[aPos]!;
          const bTxt = fallbackLower[bPos]!;
          if (aTxt !== bTxt) return (aTxt < bTxt ? -1 : 1) * dir;
        }
      }
      return rowIndices[aPos]! - rowIndices[bPos]!;
    });
  } else {
    // Text / categorical / boolean / identifier / unknown deterministic sort
    const lowerKeys = new Array<string>(n);
    const exactKeys = new Array<string>(n);
    const isMissing = new Uint8Array(n);

    for (let i = 0; i < n; i += 1) {
      const origIdx = rowIndices[i]!;
      const row = dataset.rows[origIdx];
      const raw =
        row !== undefined && colIndex < row.length ? row[colIndex] : undefined;

      if (classifyMissingValue(raw, compiledMissing).kind !== 'present') {
        isMissing[i] = 1;
        continue;
      }

      const exact = formatCellValue(raw).trim();
      exactKeys[i] = exact;
      lowerKeys[i] = exact.toLowerCase();
    }

    positions.sort((aPos, bPos) => {
      const aMiss = isMissing[aPos]!;
      const bMiss = isMissing[bPos]!;
      if (aMiss !== bMiss) return aMiss - bMiss; // Missing always last
      if (aMiss === 0) {
        const aLow = lowerKeys[aPos]!;
        const bLow = lowerKeys[bPos]!;
        if (aLow !== bLow) return (aLow < bLow ? -1 : 1) * dir;
        const aEx = exactKeys[aPos]!;
        const bEx = exactKeys[bPos]!;
        if (aEx !== bEx) return (aEx < bEx ? -1 : 1) * dir;
      }
      return rowIndices[aPos]! - rowIndices[bPos]!;
    });
  }

  const sortedIndices = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    sortedIndices[i] = rowIndices[positions[i]!]!;
  }
  return sortedIndices;
}

/**
 * Slices sorted/filtered row indices into a safe bounded pagination frame.
 * Clamps page bounds automatically and prevents out-of-range slices.
 */
export function paginateRowIndices(
  rowIndices: readonly number[],
  totalRows: number,
  requestedPage: number,
  pageSize: ExplorerPageSize,
): ExplorerPageSlice {
  const filteredRows = rowIndices.length;
  const safePageSize = EXPLORER_PAGE_SIZES.includes(pageSize)
    ? pageSize
    : DEFAULT_EXPLORER_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filteredRows / safePageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage)), totalPages);

  if (filteredRows === 0) {
    return {
      page: 1,
      pageSize: safePageSize,
      totalRows,
      filteredRows: 0,
      totalPages: 1,
      startRowNumber: 0,
      endRowNumber: 0,
      pageRowIndices: [],
    };
  }

  const startOffset = (page - 1) * safePageSize;
  const endOffset = Math.min(startOffset + safePageSize, filteredRows);
  const pageRowIndices = rowIndices.slice(startOffset, endOffset);

  return {
    page,
    pageSize: safePageSize,
    totalRows,
    filteredRows,
    totalPages,
    startRowNumber: startOffset + 1,
    endRowNumber: endOffset,
    pageRowIndices,
  };
}

/**
 * Extracts distinct category options with frequencies for a column's filter picker.
 * Reuses Module 04 statisticalSummary distribution when available (zero extra scan),
 * falling back to a single-column scan for boolean or uncomputed columns.
 */
export function extractColumnCategoryOptions(
  dataset: ImportedDataset,
  columnId: string,
  statisticalSummary: DatasetStatisticalSummary | null,
  missingValuePolicy: MissingValuePolicy = DEFAULT_MISSING_VALUE_POLICY,
  maxOptions = DEFAULT_MAX_CATEGORY_FILTER_OPTIONS,
): {
  readonly options: readonly ExplorerCategoryOption[];
  readonly totalDistinctCount: number;
  readonly isTruncated: boolean;
} {
  // Reuse M04 categorical distribution directly when available (zero redundant scan)
  if (statisticalSummary && statisticalSummary.datasetId === dataset.id) {
    const m04Cat = statisticalSummary.categoricalColumns.find(
      (c) => c.columnId === columnId,
    );
    if (m04Cat) {
      const options = m04Cat.distribution
        .slice(0, maxOptions)
        .map((entry) => ({ value: entry.value, count: entry.count }));
      return {
        options,
        totalDistinctCount: m04Cat.distinctCount,
        isTruncated:
          m04Cat.isDistributionTruncated || m04Cat.distinctCount > options.length,
      };
    }
  }

  const column = dataset.columns.find((c) => c.id === columnId);
  if (!column) {
    return { options: [], totalDistinctCount: 0, isTruncated: false };
  }

  const compiledMissing = compileMissingPolicy(missingValuePolicy);
  const freq = new Map<string, number>();
  const colIndex = column.index;

  for (let r = 0; r < dataset.rows.length; r += 1) {
    const row = dataset.rows[r];
    const raw =
      row !== undefined && colIndex < row.length ? row[colIndex] : undefined;
    if (classifyMissingValue(raw, compiledMissing).kind !== 'present') {
      continue;
    }
    const label = formatCellValue(raw).trim();
    const prev = freq.get(label);
    freq.set(label, prev === undefined ? 1 : prev + 1);
  }

  const sorted = Array.from(freq.entries()).sort((a, b) =>
    b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  );

  const visible = sorted
    .slice(0, maxOptions)
    .map(([value, count]) => ({ value, count }));

  return {
    options: visible,
    totalDistinctCount: sorted.length,
    isTruncated: sorted.length > visible.length,
  };
}
