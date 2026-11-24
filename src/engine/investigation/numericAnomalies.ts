import {
  classifyMissingValue,
  classifyNumericValue,
  compileMissingPolicy,
} from '@/engine/profiling';
import type {
  AnomalyDetectionConfig,
  DatasetInsight,
  DatasetProfileSummary,
  DatasetStatisticalSummary,
  EvidenceStrength,
  ImportedDataset,
  InsightSeverity,
  NumericColumnStatistics,
  RecordAnomalySample,
} from '@/types';
import {
  formatCellValue,
  formatCount,
  formatPercentage,
  formatStatNumber,
} from '@/utils/format';

export const MAX_RECORD_ANOMALY_SAMPLES = 12;
export const MIN_IQR_OBSERVATIONS = 4;
export const MIN_ZSCORE_OBSERVATIONS = 5;
export const MIN_SKEWNESS_OBSERVATIONS = 8;
export const MIN_CORRELATION_PAIRS = 5;
export const STRONG_CORRELATION_THRESHOLD = 0.75;
export const SKEWNESS_MEDIUM_THRESHOLD = 1.0;
export const SKEWNESS_HIGH_THRESHOLD = 2.0;
export const MAX_CORRELATION_COLUMNS = 20;

interface NumericColumnAccumulator {
  readonly stats: NumericColumnStatistics;
  readonly colIndex: number;
  readonly checkIqr: boolean;
  readonly iqrLower: number;
  readonly iqrUpper: number;
  readonly checkZScore: boolean;
  readonly checkSkewness: boolean;
  readonly trackInvalidSamples: boolean;
  iqrTotalCount: number;
  iqrLowCount: number;
  iqrHighCount: number;
  iqrSamples: RecordAnomalySample[];
  zTotalCount: number;
  zSamples: RecordAnomalySample[];
  invalidSamples: RecordAnomalySample[];
  m3Sum: number;
  skewCount: number;
}

interface PairCorrelationAccumulator {
  readonly colAIdx: number;
  readonly colBIdx: number;
  count: number;
  sumDx: number;
  sumDy: number;
  sumDx2: number;
  sumDy2: number;
  sumDxDy: number;
}

export interface NumericScanResult {
  readonly insights: readonly DatasetInsight[];
  readonly invalidRowSamplesByColumn: ReadonlyMap<
    string,
    readonly RecordAnomalySample[]
  >;
}

function insertTopSample(
  list: RecordAnomalySample[],
  candidate: RecordAnomalySample,
  scoreFn: (s: RecordAnomalySample) => number,
): void {
  const candScore = scoreFn(candidate);
  if (list.length < MAX_RECORD_ANOMALY_SAMPLES) {
    list.push(candidate);
    return;
  }

  // Find current smallest-magnitude sample in the bounded list
  let weakestIdx = 0;
  let weakestScore = scoreFn(list[0]!);
  for (let i = 1; i < list.length; i += 1) {
    const sc = scoreFn(list[i]!);
    if (
      sc < weakestScore ||
      (sc === weakestScore && list[i]!.rowNumber > list[weakestIdx]!.rowNumber)
    ) {
      weakestScore = sc;
      weakestIdx = i;
    }
  }

  if (
    candScore > weakestScore ||
    (candScore === weakestScore &&
      candidate.rowNumber < list[weakestIdx]!.rowNumber)
  ) {
    list[weakestIdx] = candidate;
  }
}

function evidenceStrengthForSample(validCount: number): EvidenceStrength {
  if (validCount >= 30) return 'high';
  if (validCount >= 10) return 'moderate';
  return 'preliminary';
}

/**
 * Executes a single deterministic O(N) pass over dataset.rows for all eligible
 * numeric columns to detect:
 *  - Tukey IQR outliers (configurable multiplier, guarded against IQR = 0 / small N)
 *  - Optional Z-score outliers (guarded against stdDev = 0 / small N)
 *  - Fisher-Pearson sample skewness (G1)
 *  - Strong pairwise Pearson correlations (with explicit non-causation disclaimer)
 *  - Bounded record-level samples of confirmed invalid numeric entries
 *
 * Strictly read-only: never mutates dataset.rows.
 */
export function runSinglePassNumericInvestigation(
  dataset: ImportedDataset,
  profile: DatasetProfileSummary,
  stats: DatasetStatisticalSummary,
  config: AnomalyDetectionConfig,
): NumericScanResult {
  const invalidRowSamplesByColumn = new Map<
    string,
    readonly RecordAnomalySample[]
  >();

  if (dataset.rowCount === 0 || stats.numericColumns.length === 0) {
    return { insights: [], invalidRowSamplesByColumn };
  }

  const iqrMultiplier =
    Number.isFinite(config.iqrMultiplier) && config.iqrMultiplier > 0
      ? config.iqrMultiplier
      : 1.5;
  const zThreshold =
    Number.isFinite(config.zScoreThreshold) && config.zScoreThreshold > 0
      ? config.zScoreThreshold
      : 3.0;

  // Build per-column accumulators grounded in M04 stats
  const accumulators: NumericColumnAccumulator[] = [];
  for (const num of stats.numericColumns) {
    const checkIqr =
      num.hasValidData &&
      num.validCount >= MIN_IQR_OBSERVATIONS &&
      num.q1 !== null &&
      num.q3 !== null &&
      num.iqr !== null &&
      num.iqr > 0;

    const checkZScore =
      config.enableZScore &&
      num.hasValidData &&
      num.validCount >= MIN_ZSCORE_OBSERVATIONS &&
      num.mean !== null &&
      num.sampleStdDev !== null &&
      num.sampleStdDev > 0;

    const checkSkewness =
      num.hasValidData &&
      num.validCount >= MIN_SKEWNESS_OBSERVATIONS &&
      num.mean !== null &&
      num.sampleStdDev !== null &&
      num.sampleStdDev > 0;

    const trackInvalidSamples = num.invalidCount > 0;

    if (
      checkIqr ||
      checkZScore ||
      checkSkewness ||
      trackInvalidSamples ||
      (num.hasValidData &&
        num.validCount >= MIN_CORRELATION_PAIRS &&
        num.sampleStdDev !== null &&
        num.sampleStdDev > 0)
    ) {
      accumulators.push({
        stats: num,
        colIndex: num.index,
        checkIqr,
        iqrLower: checkIqr ? num.q1! - iqrMultiplier * num.iqr! : 0,
        iqrUpper: checkIqr ? num.q3! + iqrMultiplier * num.iqr! : 0,
        checkZScore,
        checkSkewness,
        trackInvalidSamples,
        iqrTotalCount: 0,
        iqrLowCount: 0,
        iqrHighCount: 0,
        iqrSamples: [],
        zTotalCount: 0,
        zSamples: [],
        invalidSamples: [],
        m3Sum: 0,
        skewCount: 0,
      });
    }
  }

  if (accumulators.length === 0) {
    return { insights: [], invalidRowSamplesByColumn };
  }

  // Select up to MAX_CORRELATION_COLUMNS varied numeric columns for pairwise Pearson r
  const corrIndices: number[] = [];
  for (let i = 0; i < accumulators.length; i += 1) {
    const st = accumulators[i]!.stats;
    if (
      st.hasValidData &&
      st.validCount >= MIN_CORRELATION_PAIRS &&
      st.mean !== null &&
      st.sampleStdDev !== null &&
      st.sampleStdDev > 0
    ) {
      corrIndices.push(i);
      if (corrIndices.length >= MAX_CORRELATION_COLUMNS) break;
    }
  }

  const pairAccumulators: PairCorrelationAccumulator[] = [];
  for (let a = 0; a < corrIndices.length; a += 1) {
    for (let b = a + 1; b < corrIndices.length; b += 1) {
      pairAccumulators.push({
        colAIdx: corrIndices[a]!,
        colBIdx: corrIndices[b]!,
        count: 0,
        sumDx: 0,
        sumDy: 0,
        sumDx2: 0,
        sumDy2: 0,
        sumDxDy: 0,
      });
    }
  }

  const compiledMissing = compileMissingPolicy(profile.missingValuePolicy);
  const accCount = accumulators.length;
  const rowNumericValues = new Float64Array(accCount);
  const rowNumericPresent = new Uint8Array(accCount);

  // ── SINGLE O(N) PASS OVER ALL DATASET ROWS ────────────────────────────────
  for (let r = 0; r < dataset.rows.length; r += 1) {
    const row = dataset.rows[r];
    const rowNumber = r + 1;

    for (let c = 0; c < accCount; c += 1) {
      const acc = accumulators[c]!;
      const raw =
        row !== undefined && acc.colIndex < row.length
          ? row[acc.colIndex]
          : undefined;

      if (classifyMissingValue(raw, compiledMissing).kind !== 'present') {
        rowNumericPresent[c] = 0;
        continue;
      }

      const parsed = classifyNumericValue(raw);
      if (
        !parsed.isValid ||
        parsed.numericValue === undefined ||
        !Number.isFinite(parsed.numericValue)
      ) {
        rowNumericPresent[c] = 0;
        if (
          acc.trackInvalidSamples &&
          acc.invalidSamples.length < MAX_RECORD_ANOMALY_SAMPLES
        ) {
          acc.invalidSamples.push({
            rowNumber,
            rowIndex: r,
            value: formatCellValue(raw) || '(empty)',
            reason: 'Non-numeric or non-finite value in M03 numeric column',
          });
        }
        continue;
      }

      const v = Object.is(parsed.numericValue, -0) ? 0 : parsed.numericValue;
      rowNumericValues[c] = v;
      rowNumericPresent[c] = 1;

      // 1. IQR outlier check
      if (acc.checkIqr && (v < acc.iqrLower || v > acc.iqrUpper)) {
        acc.iqrTotalCount += 1;
        const isHigh = v > acc.iqrUpper;
        if (isHigh) acc.iqrHighCount += 1;
        else acc.iqrLowCount += 1;

        const fence = isHigh ? acc.iqrUpper : acc.iqrLower;
        const dist = Math.abs(v - fence) / acc.stats.iqr!;
        insertTopSample(
          acc.iqrSamples,
          {
            rowNumber,
            rowIndex: r,
            value: formatCellValue(raw),
            numericValue: v,
            iqrDistance: dist,
            reason: isHigh
              ? `Above upper IQR fence (${formatStatNumber(acc.iqrUpper, 2)})`
              : `Below lower IQR fence (${formatStatNumber(acc.iqrLower, 2)})`,
          },
          (s) => s.iqrDistance ?? 0,
        );
      }

      // 2. Z-score outlier check (optional)
      if (acc.checkZScore) {
        const z = (v - acc.stats.mean!) / acc.stats.sampleStdDev!;
        const absZ = Math.abs(z);
        if (absZ > zThreshold) {
          acc.zTotalCount += 1;
          insertTopSample(
            acc.zSamples,
            {
              rowNumber,
              rowIndex: r,
              value: formatCellValue(raw),
              numericValue: v,
              zScore: z,
              reason: `z = ${z >= 0 ? '+' : ''}${formatStatNumber(z, 2)} (|z| > ${formatStatNumber(zThreshold, 1)})`,
            },
            (s) => Math.abs(s.zScore ?? 0),
          );
        }
      }

      // 3. Skewness third central moment accumulator
      if (acc.checkSkewness) {
        const diff = v - acc.stats.mean!;
        acc.m3Sum += diff * diff * diff;
        acc.skewCount += 1;
      }
    }

    // 4. Pairwise Pearson correlation accumulation using M04 means as centering offsets
    for (let p = 0; p < pairAccumulators.length; p += 1) {
      const pair = pairAccumulators[p]!;
      if (
        rowNumericPresent[pair.colAIdx] === 1 &&
        rowNumericPresent[pair.colBIdx] === 1
      ) {
        const accA = accumulators[pair.colAIdx]!;
        const accB = accumulators[pair.colBIdx]!;
        const dx = rowNumericValues[pair.colAIdx]! - accA.stats.mean!;
        const dy = rowNumericValues[pair.colBIdx]! - accB.stats.mean!;
        pair.count += 1;
        pair.sumDx += dx;
        pair.sumDy += dy;
        pair.sumDx2 += dx * dx;
        pair.sumDy2 += dy * dy;
        pair.sumDxDy += dx * dy;
      }
    }
  }

  // ── MATERIALIZE INSIGHTS FROM SINGLE-PASS ACCUMULATORS ────────────────────
  const insights: DatasetInsight[] = [];

  for (const acc of accumulators) {
    const num = acc.stats;

    if (acc.invalidSamples.length > 0) {
      invalidRowSamplesByColumn.set(num.columnId, acc.invalidSamples);
    }

    // A. IQR Outliers
    if (acc.iqrTotalCount > 0) {
      const outlierPct = (acc.iqrTotalCount / num.validCount) * 100;
      const sortedSamples = [...acc.iqrSamples].sort((a, b) => {
        const dDiff = (b.iqrDistance ?? 0) - (a.iqrDistance ?? 0);
        return dDiff !== 0 ? dDiff : a.rowNumber - b.rowNumber;
      });

      const severity: InsightSeverity =
        outlierPct >= 10 || (sortedSamples[0]?.iqrDistance ?? 0) >= 5
          ? 'high'
          : outlierPct >= 2 || acc.iqrTotalCount >= 3
            ? 'medium'
            : 'low';

      insights.push({
        id: `anom-iqr-${num.columnId}`,
        category: 'numeric_outliers',
        classification: 'statistical_outlier',
        title: `IQR statistical ${acc.iqrTotalCount === 1 ? 'outlier' : 'outliers'} in "${num.name}" (${formatCount(acc.iqrTotalCount)})`,
        explanation: `${formatCount(acc.iqrTotalCount)} of ${formatCount(num.validCount)} valid numeric observations (${formatPercentage(outlierPct, 2)}) fall outside the ${formatStatNumber(iqrMultiplier, 2)}× IQR fence [${formatStatNumber(acc.iqrLower, 2)}, ${formatStatNumber(acc.iqrUpper, 2)}]. Outliers represent statistical extremes and may be legitimate high-magnitude events rather than errors.`,
        affectedColumnIds: [num.columnId],
        affectedColumnNames: [num.name],
        evidence: [
          {
            label: 'Outlier Count',
            value: `${formatCount(acc.iqrTotalCount)} (${formatPercentage(outlierPct, 2)})`,
          },
          {
            label: 'IQR Fences',
            value: `[${formatStatNumber(acc.iqrLower, 2)}, ${formatStatNumber(acc.iqrUpper, 2)}]`,
          },
          {
            label: 'Multiplier / IQR',
            value: `${formatStatNumber(iqrMultiplier, 2)}× · IQR = ${formatStatNumber(num.iqr, 2)}`,
          },
          {
            label: 'Direction Split',
            value: `${formatCount(acc.iqrLowCount)} low · ${formatCount(acc.iqrHighCount)} high`,
          },
        ],
        severity,
        confidence: evidenceStrengthForSample(num.validCount),
        suggestedAction:
          'Jump to individual flagged rows in Data Explorer or open the quartile box plot to verify whether extreme values reflect valid spikes or entry mistakes.',
        recordAnomalies: sortedSamples,
        totalAnomalyCount: acc.iqrTotalCount,
        recommendedChart: {
          chartType: 'boxplot',
          xColumnId: num.columnId,
          title: `${num.name} Quartile Box Plot`,
        },
      });
    }

    // B. Optional Z-score Outliers
    if (acc.checkZScore && acc.zTotalCount > 0) {
      const zPct = (acc.zTotalCount / num.validCount) * 100;
      const sortedZ = [...acc.zSamples].sort((a, b) => {
        const zDiff = Math.abs(b.zScore ?? 0) - Math.abs(a.zScore ?? 0);
        return zDiff !== 0 ? zDiff : a.rowNumber - b.rowNumber;
      });
      const maxAbsZ = Math.abs(sortedZ[0]?.zScore ?? 0);

      const severity: InsightSeverity =
        maxAbsZ >= 5 || zPct >= 5
          ? 'high'
          : maxAbsZ >= 3.5 || acc.zTotalCount >= 3
            ? 'medium'
            : 'low';

      insights.push({
        id: `anom-zscore-${num.columnId}`,
        category: 'numeric_outliers',
        classification: 'statistical_outlier',
        title: `Z-score extreme ${acc.zTotalCount === 1 ? 'observation' : 'observations'} in "${num.name}" (|z| > ${formatStatNumber(zThreshold, 1)})`,
        explanation: `${formatCount(acc.zTotalCount)} ${acc.zTotalCount === 1 ? 'observation exceeds' : 'observations exceed'} ${formatStatNumber(zThreshold, 1)} sample standard deviations from the mean (${formatStatNumber(num.mean, 2)} ± ${formatStatNumber(num.sampleStdDev, 2)}). In skewed distributions, Z-score flags should be interpreted alongside IQR quartiles.`,
        affectedColumnIds: [num.columnId],
        affectedColumnNames: [num.name],
        evidence: [
          {
            label: 'Flagged Rows',
            value: `${formatCount(acc.zTotalCount)} (${formatPercentage(zPct, 2)})`,
          },
          {
            label: 'Max |z-score|',
            value: formatStatNumber(maxAbsZ, 2),
          },
          {
            label: 'Mean / Sample SD',
            value: `${formatStatNumber(num.mean, 2)} / ${formatStatNumber(num.sampleStdDev, 2)}`,
          },
        ],
        severity,
        confidence: evidenceStrengthForSample(num.validCount),
        suggestedAction:
          'Inspect the highest-|z| rows in Data Explorer and compare with the distribution histogram to distinguish genuine tail events from anomalies.',
        recordAnomalies: sortedZ,
        totalAnomalyCount: acc.zTotalCount,
        recommendedChart: {
          chartType: 'histogram',
          xColumnId: num.columnId,
          title: `${num.name} Distribution`,
        },
      });
    }

    // C. Highly skewed numeric distribution (adjusted Fisher-Pearson G1)
    if (acc.checkSkewness && acc.skewCount >= MIN_SKEWNESS_OBSERVATIONS) {
      const n = acc.skewCount;
      const sd = num.sampleStdDev!;
      const g1 = (n / ((n - 1) * (n - 2))) * (acc.m3Sum / (sd * sd * sd));

      if (Number.isFinite(g1) && Math.abs(g1) >= SKEWNESS_MEDIUM_THRESHOLD) {
        const direction = g1 > 0 ? 'right (positive)' : 'left (negative)';
        const severity: InsightSeverity =
          Math.abs(g1) >= SKEWNESS_HIGH_THRESHOLD ? 'medium' : 'low';

        insights.push({
          id: `dist-skew-${num.columnId}`,
          category: 'distribution',
          classification: 'notable_observation',
          title: `Highly ${g1 > 0 ? 'right' : 'left'}-skewed distribution in "${num.name}"`,
          explanation: `Adjusted Fisher-Pearson skewness is ${formatStatNumber(g1, 2)} (${direction} skew), with mean ${formatStatNumber(num.mean, 2)} diverging from median ${formatStatNumber(num.median, 2)}. Skewed distributions are common in financial, count, or latency metrics; prefer median and IQR over mean alone.`,
          affectedColumnIds: [num.columnId],
          affectedColumnNames: [num.name],
          evidence: [
            { label: 'Skewness (G1)', value: formatStatNumber(g1, 3) },
            { label: 'Mean', value: formatStatNumber(num.mean, 2) },
            { label: 'Median', value: formatStatNumber(num.median, 2) },
            { label: 'Valid Observations', value: formatCount(num.validCount) },
          ],
          severity,
          confidence: evidenceStrengthForSample(num.validCount),
          suggestedAction:
            'Open the histogram in Visualization Studio to examine tail shape and evaluate whether log-scale or median-based summaries are more appropriate.',
          recommendedChart: {
            chartType: 'histogram',
            xColumnId: num.columnId,
            title: `${num.name} Distribution`,
          },
        });
      }
    }
  }

  // D. Strong numeric pairwise correlations (Pearson r — never claiming causation)
  for (const pair of pairAccumulators) {
    if (pair.count < MIN_CORRELATION_PAIRS) continue;

    const n = pair.count;
    const covNum = pair.sumDxDy - (pair.sumDx * pair.sumDy) / n;
    const varXNum = pair.sumDx2 - (pair.sumDx * pair.sumDx) / n;
    const varYNum = pair.sumDy2 - (pair.sumDy * pair.sumDy) / n;

    if (varXNum <= 0 || varYNum <= 0) continue;

    const denom = Math.sqrt(varXNum * varYNum);
    if (!Number.isFinite(denom) || denom === 0) continue;

    const rawR = covNum / denom;
    if (!Number.isFinite(rawR)) continue;
    const r = Math.max(-1, Math.min(1, rawR));
    const absR = Math.abs(r);

    if (absR >= STRONG_CORRELATION_THRESHOLD) {
      const colA = accumulators[pair.colAIdx]!.stats;
      const colB = accumulators[pair.colBIdx]!.stats;
      const direction = r > 0 ? 'positive' : 'negative';

      insights.push({
        id: `rel-corr-${colA.columnId}-${colB.columnId}`,
        category: 'relationship',
        classification: 'notable_observation',
        title: `Strong ${direction} linear correlation: "${colA.name}" & "${colB.name}" (r = ${formatStatNumber(r, 2)})`,
        explanation: `Across ${formatCount(n)} paired valid observations, Pearson r = ${formatStatNumber(r, 3)} (R² = ${formatPercentage(r * r * 100, 1)}). Correlation measures linear association only and does not imply causation.`,
        affectedColumnIds: [colA.columnId, colB.columnId],
        affectedColumnNames: [colA.name, colB.name],
        evidence: [
          { label: 'Pearson r', value: formatStatNumber(r, 4) },
          { label: 'R² (Shared Variance)', value: formatPercentage(r * r * 100, 1) },
          { label: 'Paired Observations', value: formatCount(n) },
          { label: 'Direction', value: r > 0 ? 'Positive' : 'Negative' },
        ],
        severity: absR >= 0.9 ? 'medium' : 'info',
        confidence: evidenceStrengthForSample(n),
        suggestedAction:
          'Open the scatter plot in Visualization Studio to check whether the linear relationship is consistent across the full range or driven by a few extreme points.',
        recommendedChart: {
          chartType: 'scatter',
          xColumnId: colA.columnId,
          yColumnId: colB.columnId,
          title: `${colB.name} vs ${colA.name}`,
        },
      });
    }
  }

  return {
    insights,
    invalidRowSamplesByColumn,
  };
}
