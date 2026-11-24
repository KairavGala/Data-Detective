import {
  classifyMissingValue,
  type CompiledMissingPolicy,
} from '@/engine/profiling';
import type {
  CategoricalColumnStatistics,
  CategoricalDistributionEntry,
  CategoricalExtremumSummary,
  ImportedColumn,
} from '@/types';
import { formatCellValue } from '@/utils/format';

export const DEFAULT_MAX_DISTRIBUTION_CATEGORIES = 500;
export const DEFAULT_MAX_TIED_EXTREMA = 50;

export interface CategoricalStatisticsOptions {
  readonly maxCategories?: number;
  readonly maxTiedExtrema?: number;
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Deterministic, locale-independent lexicographical comparator for category ties.
 */
function compareCategoryLabels(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Validates whether a non-missing cell value can be represented as a valid
 * categorical label. Rejects non-finite numbers (Infinity/-Infinity), invalid
 * Date instances, non-Date objects, functions, and symbols.
 */
function extractValidCategoryLabel(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return String(Object.is(value, -0) ? 0 : value);
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'boolean') {
    return String(value);
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  // Reject objects, arrays, symbols, functions rather than silently converting to "[object Object]"
  if (
    typeof value === 'object' ||
    typeof value === 'symbol' ||
    typeof value === 'function'
  ) {
    return null;
  }

  return formatCellValue(value).trim();
}

function buildExtremumSummary(
  entries: readonly (readonly [string, number])[],
  targetCount: number,
  validCount: number,
  maxTiedExtrema: number,
): CategoricalExtremumSummary {
  const values: string[] = [];
  let totalTiedCount = 0;

  for (let i = 0; i < entries.length; i += 1) {
    const [label, count] = entries[i]!;
    if (count === targetCount) {
      totalTiedCount += 1;
      if (values.length < maxTiedExtrema) {
        values.push(label);
      }
    }
  }

  return {
    count: targetCount,
    percentage: validCount > 0 ? (targetCount / validCount) * 100 : 0,
    values,
    isTie: totalTiedCount > 1,
    totalTiedCount,
    isTruncated: totalTiedCount > values.length,
  };
}

/**
 * Computes deterministic categorical frequency & percentage distributions,
 * distinct category counts, and tie-aware most/least frequent categories
 * without mutating source dataset rows.
 */
export function computeCategoricalColumnStatistics(
  column: ImportedColumn,
  rows: readonly (readonly unknown[])[],
  compiledMissing: CompiledMissingPolicy,
  options: CategoricalStatisticsOptions = {},
): CategoricalColumnStatistics {
  const colIndex = column.index;
  const totalCount = rows.length;
  const maxCategories = Math.max(
    1,
    options.maxCategories ?? DEFAULT_MAX_DISTRIBUTION_CATEGORIES,
  );
  const maxTiedExtrema = Math.max(
    1,
    options.maxTiedExtrema ?? DEFAULT_MAX_TIED_EXTREMA,
  );

  const frequencyMap = new Map<string, number>();
  let validCount = 0;
  let missingCount = 0;
  let invalidCount = 0;

  for (let r = 0; r < totalCount; r += 1) {
    const row = rows[r];
    const raw =
      row !== undefined && colIndex < row.length ? row[colIndex] : undefined;

    const missingResult = classifyMissingValue(raw, compiledMissing);
    if (missingResult.kind !== 'present') {
      missingCount += 1;
      continue;
    }

    const label = extractValidCategoryLabel(raw);
    if (label === null) {
      invalidCount += 1;
      continue;
    }

    validCount += 1;
    const prev = frequencyMap.get(label);
    frequencyMap.set(label, prev === undefined ? 1 : prev + 1);
  }

  const excludedCount = missingCount + invalidCount;
  const validPercentage =
    totalCount > 0 ? roundTwo((validCount / totalCount) * 100) : 0;

  if (validCount === 0 || frequencyMap.size === 0) {
    return {
      columnId: column.id,
      name: column.name,
      originalName: column.originalName,
      index: column.index,
      totalCount,
      validCount: 0,
      missingCount,
      invalidCount,
      excludedCount,
      validPercentage: 0,
      distinctCount: 0,
      hasValidData: false,
      isUniformDistribution: false,
      mostFrequent: null,
      leastFrequent: null,
      distribution: [],
      isDistributionTruncated: false,
      omittedCategoryCount: 0,
      omittedObservationCount: 0,
    };
  }

  // Deterministic ordering: count DESC, then label ASC
  const sortedEntries = Array.from(frequencyMap.entries()).sort((a, b) =>
    b[1] !== a[1] ? b[1] - a[1] : compareCategoryLabels(a[0], b[0]),
  );

  const distinctCount = sortedEntries.length;
  const maxCount = sortedEntries[0]![1];
  const minCount = sortedEntries[distinctCount - 1]![1];
  const isUniformDistribution = maxCount === minCount;

  const mostFrequent = buildExtremumSummary(
    sortedEntries,
    maxCount,
    validCount,
    maxTiedExtrema,
  );
  const leastFrequent = buildExtremumSummary(
    sortedEntries,
    minCount,
    validCount,
    maxTiedExtrema,
  );

  const isDistributionTruncated = distinctCount > maxCategories;
  const visibleLimit = isDistributionTruncated ? maxCategories : distinctCount;
  const distribution: CategoricalDistributionEntry[] = new Array(visibleLimit);

  let shownObservations = 0;
  for (let i = 0; i < visibleLimit; i += 1) {
    const [value, count] = sortedEntries[i]!;
    shownObservations += count;
    distribution[i] = {
      value,
      count,
      percentage: (count / validCount) * 100,
      percentageOfTotal: totalCount > 0 ? (count / totalCount) * 100 : 0,
    };
  }

  const omittedCategoryCount = isDistributionTruncated
    ? distinctCount - visibleLimit
    : 0;
  const omittedObservationCount = isDistributionTruncated
    ? validCount - shownObservations
    : 0;

  return {
    columnId: column.id,
    name: column.name,
    originalName: column.originalName,
    index: column.index,
    totalCount,
    validCount,
    missingCount,
    invalidCount,
    excludedCount,
    validPercentage,
    distinctCount,
    hasValidData: true,
    isUniformDistribution,
    mostFrequent,
    leastFrequent,
    distribution,
    isDistributionTruncated,
    omittedCategoryCount,
    omittedObservationCount,
  };
}
