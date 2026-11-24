import {
  classifyMissingValue,
  classifyNumericValue,
  type CompiledMissingPolicy,
} from '@/engine/profiling';
import type {
  ImportedColumn,
  NumericColumnStatistics,
  NumericModeSummary,
} from '@/types';

export const QUARTILE_METHOD_LABEL = 'Linear interpolation (R-7 / Excel INC)';
export const DEFAULT_MAX_MODES = 50;

export interface NumericStatisticsOptions {
  readonly maxModes?: number;
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) || value === 0 ? 0 : value;
}

function safeFinite(value: number): number | null {
  return Number.isFinite(value) ? normalizeZero(value) : null;
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Computes an inclusive linearly interpolated quantile (R Type 7 / NumPy / Excel PERCENTILE.INC)
 * on a non-empty ascending sorted numeric array.
 */
export function computeQuantile(
  sorted: ArrayLike<number>,
  probability: number,
): number | null {
  const n = sorted.length;
  if (n === 0 || !Number.isFinite(probability)) return null;

  const p = Math.min(1, Math.max(0, probability));
  if (n === 1) {
    return safeFinite(sorted[0]!);
  }

  const h = p * (n - 1);
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  const loVal = sorted[lo]!;
  if (lo === hi) {
    return safeFinite(loVal);
  }

  const hiVal = sorted[hi]!;
  const weight = h - lo;
  return safeFinite(loVal + weight * (hiVal - loVal));
}

/**
 * Computes exact mode(s) and distinct value count in a single linear O(n) pass
 * over a sorted Float64Array with O(1) extra memory (bounded by maxModes).
 */
export function computeModeFromSorted(
  sorted: ArrayLike<number>,
  maxModes = DEFAULT_MAX_MODES,
): { readonly mode: NumericModeSummary; readonly distinctCount: number } {
  const n = sorted.length;
  if (n === 0) {
    return {
      distinctCount: 0,
      mode: {
        status: 'empty',
        values: [],
        frequency: 0,
        totalModeCount: 0,
        isTruncated: false,
      },
    };
  }

  const limit = Math.max(1, maxModes);
  let distinctCount = 0;
  let maxFreq = 0;
  let totalModeCount = 0;
  let modeValues: number[] = [];

  let i = 0;
  while (i < n) {
    const val = normalizeZero(sorted[i]!);
    let j = i + 1;
    while (j < n && sorted[j] === val) {
      j += 1;
    }
    const freq = j - i;
    distinctCount += 1;

    if (freq > maxFreq) {
      maxFreq = freq;
      totalModeCount = 1;
      modeValues = [val];
    } else if (freq === maxFreq) {
      totalModeCount += 1;
      if (modeValues.length < limit) {
        modeValues.push(val);
      }
    }

    i = j;
  }

  // If no value repeats (max frequency is 1), the distribution has no mode
  if (maxFreq <= 1) {
    return {
      distinctCount,
      mode: {
        status: 'no_mode',
        values: [],
        frequency: maxFreq,
        totalModeCount: 0,
        isTruncated: false,
      },
    };
  }

  if (totalModeCount === 1) {
    return {
      distinctCount,
      mode: {
        status: 'unimodal',
        values: modeValues,
        frequency: maxFreq,
        totalModeCount: 1,
        isTruncated: false,
      },
    };
  }

  return {
    distinctCount,
    mode: {
      status: 'multimodal',
      values: modeValues,
      frequency: maxFreq,
      totalModeCount,
      isTruncated: totalModeCount > modeValues.length,
    },
  };
}

/**
 * Computes complete deterministic descriptive statistics for a single M03-classified
 * numeric column without mutating the source dataset rows.
 *
 * Uses Welford's one-pass algorithm for numerically stable mean/variance and
 * sorts a reusable Float64Array slice for exact min, max, quartiles, IQR, and mode.
 */
export function computeNumericColumnStatistics(
  column: ImportedColumn,
  rows: readonly (readonly unknown[])[],
  compiledMissing: CompiledMissingPolicy,
  scratchBuffer?: Float64Array,
  options: NumericStatisticsOptions = {},
): NumericColumnStatistics {
  const colIndex = column.index;
  const totalCount = rows.length;
  const buffer =
    scratchBuffer && scratchBuffer.length >= totalCount
      ? scratchBuffer
      : new Float64Array(totalCount);

  let validCount = 0;
  let missingCount = 0;
  let invalidCount = 0;

  // Welford's online accumulators for numerically stable mean and M2
  let meanAcc = 0;
  let m2Acc = 0;

  for (let r = 0; r < totalCount; r += 1) {
    const row = rows[r];
    const raw =
      row !== undefined && colIndex < row.length ? row[colIndex] : undefined;

    const missingResult = classifyMissingValue(raw, compiledMissing);
    if (missingResult.kind !== 'present') {
      missingCount += 1;
      continue;
    }

    const numClass = classifyNumericValue(raw);
    if (
      !numClass.isValid ||
      numClass.numericValue === undefined ||
      !Number.isFinite(numClass.numericValue)
    ) {
      invalidCount += 1;
      continue;
    }

    const val = normalizeZero(numClass.numericValue);
    buffer[validCount] = val;
    validCount += 1;

    const delta = val - meanAcc;
    meanAcc += delta / validCount;
    const delta2 = val - meanAcc;
    m2Acc += delta * delta2;
  }

  const excludedCount = missingCount + invalidCount;
  const validPercentage =
    totalCount > 0 ? roundTwo((validCount / totalCount) * 100) : 0;

  if (validCount === 0) {
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
      mean: null,
      median: null,
      mode: {
        status: 'empty',
        values: [],
        frequency: 0,
        totalModeCount: 0,
        isTruncated: false,
      },
      min: null,
      max: null,
      range: null,
      populationVariance: null,
      sampleVariance: null,
      populationStdDev: null,
      sampleStdDev: null,
      q1: null,
      q2: null,
      q3: null,
      iqr: null,
    };
  }

  const sorted = buffer.subarray(0, validCount);
  sorted.sort();

  const min = safeFinite(sorted[0]!);
  const max = safeFinite(sorted[validCount - 1]!);
  const range =
    min !== null && max !== null ? safeFinite(max - min) : null;

  const q1 = computeQuantile(sorted, 0.25);
  const q2 = computeQuantile(sorted, 0.5);
  const q3 = computeQuantile(sorted, 0.75);
  const iqr = q1 !== null && q3 !== null ? safeFinite(q3 - q1) : null;

  const mean = safeFinite(meanAcc);
  const clampedM2 = Number.isFinite(m2Acc) ? Math.max(0, m2Acc) : Number.NaN;
  const populationVariance = safeFinite(clampedM2 / validCount);
  const populationStdDev =
    populationVariance !== null
      ? safeFinite(Math.sqrt(populationVariance))
      : null;

  const sampleVariance =
    validCount >= 2 ? safeFinite(clampedM2 / (validCount - 1)) : null;
  const sampleStdDev =
    sampleVariance !== null ? safeFinite(Math.sqrt(sampleVariance)) : null;

  const { mode, distinctCount } = computeModeFromSorted(
    sorted,
    options.maxModes ?? DEFAULT_MAX_MODES,
  );

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
    mean,
    median: q2,
    mode,
    min,
    max,
    range,
    populationVariance,
    sampleVariance,
    populationStdDev,
    sampleStdDev,
    q1,
    q2,
    q3,
    iqr,
  };
}
