import type {
  DatasetInsight,
  DatasetProfileSummary,
  DatasetStatisticalSummary,
  EvidenceStrength,
  InsightSeverity,
} from '@/types';
import {
  formatCount,
  formatPercentage,
  formatStatNumber,
} from '@/utils/format';

export const HIGH_MISSING_MEDIUM_PCT = 20;
export const HIGH_MISSING_HIGH_PCT = 35;
export const HIGH_MISSING_CRITICAL_PCT = 50;
export const MISSING_SPREAD_THRESHOLD_PCT = 25;
export const NEAR_CONSTANT_SHARE_PCT = 95;
export const DOMINANT_CATEGORY_MIN_PCT = 70;
export const RARE_CATEGORY_MAX_PCT = 1.5;
export const RARE_CATEGORY_MIN_VALID = 20;
export const HIGH_CARDINALITY_MIN_DISTINCT = 30;
export const HIGH_CARDINALITY_RATIO = 0.5;
export const SUSPICIOUS_MODE_CLUMP_PCT = 40;

function evidenceStrengthForSample(validCount: number): EvidenceStrength {
  if (validCount >= 30) return 'high';
  if (validCount >= 10) return 'moderate';
  return 'preliminary';
}

/**
 * Generates deterministic insights directly from Module 03 profiling summaries
 * and Module 04 statistical summaries without rescanning raw dataset rows.
 */
export function generateProfileAndStatInsights(
  profile: DatasetProfileSummary,
  stats: DatasetStatisticalSummary,
): DatasetInsight[] {
  if (profile.rowCount === 0 || profile.columnCount === 0) {
    return [];
  }

  const insights: DatasetInsight[] = [];

  // ── 1. High missing-value concentrations (per column, M03) ────────────────
  for (const col of profile.columns) {
    if (col.missingPercentage >= HIGH_MISSING_MEDIUM_PCT) {
      let severity: InsightSeverity = 'medium';
      if (col.missingPercentage >= HIGH_MISSING_CRITICAL_PCT) {
        severity = 'critical';
      } else if (col.missingPercentage >= HIGH_MISSING_HIGH_PCT) {
        severity = 'high';
      }

      insights.push({
        id: `dq-missing-high-${col.columnId}`,
        category: 'data_quality',
        classification: 'data_quality_issue',
        title: `High missing-value concentration in "${col.name}"`,
        explanation: `${formatPercentage(col.missingPercentage, 1)} of rows (${formatCount(col.missingCount)} of ${formatCount(col.totalCount)}) are missing under the active Module 03 missing-value policy.`,
        affectedColumnIds: [col.columnId],
        affectedColumnNames: [col.name],
        evidence: [
          {
            label: 'Missing Rate',
            value: formatPercentage(col.missingPercentage, 2),
          },
          {
            label: 'Missing Rows',
            value: `${formatCount(col.missingCount)} / ${formatCount(col.totalCount)}`,
          },
          {
            label: 'Present Rows',
            value: formatCount(col.nonMissingCount),
          },
        ],
        severity,
        confidence: 'high',
        suggestedAction:
          'Open in Data Explorer filtered to missing values to verify whether gaps reflect optional fields, join failures, or upstream collection issues.',
      });
    }
  }

  // ── 2. Unusual missing-value differences between columns (M03) ────────────
  if (profile.columns.length >= 2) {
    let minCol = profile.columns[0]!;
    let maxCol = profile.columns[0]!;
    for (const col of profile.columns) {
      if (col.missingPercentage < minCol.missingPercentage) minCol = col;
      if (col.missingPercentage > maxCol.missingPercentage) maxCol = col;
    }
    const spread = maxCol.missingPercentage - minCol.missingPercentage;
    if (spread >= MISSING_SPREAD_THRESHOLD_PCT && maxCol.missingPercentage >= 25) {
      const affectedIds = [maxCol.columnId, minCol.columnId];
      const affectedNames = [maxCol.name, minCol.name];
      insights.push({
        id: `dq-missing-spread-${maxCol.columnId}-${minCol.columnId}`,
        category: 'data_quality',
        classification: 'data_quality_issue',
        title: `Asymmetric missingness across columns (${formatPercentage(spread, 1)} gap)`,
        explanation: `Completeness varies sharply across columns: "${maxCol.name}" is missing ${formatPercentage(maxCol.missingPercentage, 1)} of records whereas "${minCol.name}" is missing only ${formatPercentage(minCol.missingPercentage, 1)}.`,
        affectedColumnIds: affectedIds,
        affectedColumnNames: affectedNames,
        evidence: [
          {
            label: 'Highest Missingness',
            value: `${maxCol.name} (${formatPercentage(maxCol.missingPercentage, 1)})`,
          },
          {
            label: 'Lowest Missingness',
            value: `${minCol.name} (${formatPercentage(minCol.missingPercentage, 1)})`,
          },
          {
            label: 'Completeness Gap',
            value: `${formatStatNumber(spread, 1)} pp`,
          },
        ],
        severity: spread >= 50 ? 'high' : 'medium',
        confidence: 'high',
        suggestedAction:
          'Compare rows where the sparse column is populated versus blank to check for partial merges or schema changes over time.',
      });
    }
  }

  // ── 3. Invalid / non-finite numeric values (M04) & invalid dates (M03) ────
  for (const num of stats.numericColumns) {
    if (num.invalidCount > 0) {
      const invalidPct =
        num.totalCount > 0 ? (num.invalidCount / num.totalCount) * 100 : 0;
      insights.push({
        id: `dq-invalid-numeric-${num.columnId}`,
        category: 'data_quality',
        classification: 'data_quality_issue',
        title: `Invalid or non-finite values in numeric column "${num.name}"`,
        explanation: `${formatCount(num.invalidCount)} non-missing ${num.invalidCount === 1 ? 'cell' : 'cells'} (${formatPercentage(invalidPct, 2)} of rows) could not be parsed as finite numbers and were excluded from Module 04 statistics.`,
        affectedColumnIds: [num.columnId],
        affectedColumnNames: [num.name],
        evidence: [
          { label: 'Invalid Cells', value: formatCount(num.invalidCount) },
          {
            label: 'Invalid Rate',
            value: formatPercentage(invalidPct, 2),
          },
          { label: 'Valid Numeric Rows', value: formatCount(num.validCount) },
        ],
        severity: invalidPct >= 5 ? 'high' : 'medium',
        confidence: 'high',
        suggestedAction:
          'Inspect the flagged rows in Data Explorer to confirm whether malformed symbols, units, or text notes were entered in a numeric field.',
        totalAnomalyCount: num.invalidCount,
      });
    }
  }

  for (const col of profile.columns) {
    if (
      col.detectedType === 'date' &&
      col.dateStats &&
      col.dateStats.invalidCount > 0
    ) {
      const invalidPct =
        col.totalCount > 0
          ? (col.dateStats.invalidCount / col.totalCount) * 100
          : 0;
      insights.push({
        id: `dq-invalid-date-${col.columnId}`,
        category: 'data_quality',
        classification: 'data_quality_issue',
        title: `Unparseable date entries in "${col.name}"`,
        explanation: `${formatCount(col.dateStats.invalidCount)} non-missing entries (${formatPercentage(invalidPct, 2)} of rows) failed Module 03 date validation.`,
        affectedColumnIds: [col.columnId],
        affectedColumnNames: [col.name],
        evidence: [
          {
            label: 'Invalid Dates',
            value: formatCount(col.dateStats.invalidCount),
          },
          {
            label: 'Valid Dates',
            value: formatCount(col.dateStats.validCount),
          },
          {
            label: 'Detected Formats',
            value: col.dateStats.detectedFormats.join(', ') || 'None',
          },
        ],
        severity: invalidPct >= 5 ? 'high' : 'medium',
        confidence: 'high',
        suggestedAction:
          'Review affected entries in Data Explorer to standardize date formatting or identify malformed timestamps.',
      });
    }
  }

  // ── 4. Constant & near-constant columns (M03 + M04) ───────────────────────
  for (const col of profile.columns) {
    if (col.nonMissingCount >= 2 && col.uniqueCount === 1) {
      insights.push({
        id: `struct-constant-${col.columnId}`,
        category: 'structural',
        classification: 'data_quality_issue',
        title: `Constant column "${col.name}" has zero variance`,
        explanation: `All ${formatCount(col.nonMissingCount)} non-missing observations contain the single value "${col.sampleValues[0] ?? '—'}". Constant fields carry zero variance and cannot discriminate between records.`,
        affectedColumnIds: [col.columnId],
        affectedColumnNames: [col.name],
        evidence: [
          { label: 'Distinct Values', value: '1' },
          { label: 'Non-Missing Rows', value: formatCount(col.nonMissingCount) },
          { label: 'Observed Value', value: col.sampleValues[0] ?? '—' },
        ],
        severity: 'low',
        confidence: 'high',
        suggestedAction:
          'Confirm whether this column reflects a fixed export filter (e.g., single region or currency) or an upstream default-value bug.',
      });
    }
  }

  // Near-constant numeric columns (using M04 exact mode frequency)
  for (const num of stats.numericColumns) {
    if (
      num.validCount >= 10 &&
      num.distinctCount >= 2 &&
      num.mode.status === 'unimodal' &&
      num.mode.values.length > 0
    ) {
      const topShare = (num.mode.frequency / num.validCount) * 100;
      if (topShare >= NEAR_CONSTANT_SHARE_PCT) {
        const modeVal = formatStatNumber(num.mode.values[0], 4);
        insights.push({
          id: `struct-near-constant-num-${num.columnId}`,
          category: 'structural',
          classification: 'notable_observation',
          title: `Near-constant numeric column "${num.name}" (${formatPercentage(topShare, 1)} identical)`,
          explanation: `Value ${modeVal} accounts for ${formatPercentage(topShare, 2)} of valid numeric observations (${formatCount(num.mode.frequency)} of ${formatCount(num.validCount)}), leaving only ${formatCount(num.validCount - num.mode.frequency)} differing records.`,
          affectedColumnIds: [num.columnId],
          affectedColumnNames: [num.name],
          evidence: [
            { label: 'Dominant Value', value: modeVal },
            { label: 'Dominant Share', value: formatPercentage(topShare, 2) },
            { label: 'Distinct Values', value: formatCount(num.distinctCount) },
          ],
          severity: 'low',
          confidence: evidenceStrengthForSample(num.validCount),
          suggestedAction:
            'Inspect the small subset of non-dominant values in Data Explorer to see whether they represent rare exceptions or meaningful events.',
          recommendedChart: {
            chartType: 'histogram',
            xColumnId: num.columnId,
            title: `${num.name} Distribution`,
          },
        });
      }
    }
  }

  // ── 5. Categorical anomalies: near-constant, dominant, rare, unexpected ───
  for (const cat of stats.categoricalColumns) {
    if (!cat.hasValidData || cat.distinctCount < 2) continue;

    const top = cat.mostFrequent;
    const topShare = top?.percentage ?? 0;
    const topLabel = top ? top.values.join(', ') : '—';

    // 5a. Near-constant categorical (>= 95%)
    if (cat.validCount >= 10 && top && !top.isTie && topShare >= NEAR_CONSTANT_SHARE_PCT) {
      insights.push({
        id: `struct-near-constant-cat-${cat.columnId}`,
        category: 'structural',
        classification: 'notable_observation',
        title: `Near-constant categorical column "${cat.name}" (${formatPercentage(topShare, 1)} "${topLabel}")`,
        explanation: `A single category ("${topLabel}") accounts for ${formatPercentage(topShare, 2)} of valid rows (${formatCount(top.count)} of ${formatCount(cat.validCount)}).`,
        affectedColumnIds: [cat.columnId],
        affectedColumnNames: [cat.name],
        evidence: [
          { label: 'Dominant Category', value: topLabel },
          { label: 'Dominant Share', value: formatPercentage(topShare, 2) },
          { label: 'Distinct Categories', value: formatCount(cat.distinctCount) },
        ],
        severity: 'low',
        confidence: evidenceStrengthForSample(cat.validCount),
        suggestedAction:
          'Verify in Data Explorer whether minority labels represent rare edge cases or inconsistent labeling.',
        recommendedChart: {
          chartType: 'bar',
          xColumnId: cat.columnId,
          title: `${cat.name} Frequency Distribution`,
        },
      });
    } else if (
      // 5b. Highly dominant category (70% .. <95%)
      cat.validCount >= 5 &&
      top &&
      !top.isTie &&
      topShare >= DOMINANT_CATEGORY_MIN_PCT
    ) {
      insights.push({
        id: `cat-dominant-${cat.columnId}`,
        category: 'categorical',
        classification: 'notable_observation',
        title: `Highly dominant category in "${cat.name}" ("${topLabel}")`,
        explanation: `"${topLabel}" represents ${formatPercentage(topShare, 1)} of valid observations (${formatCount(top.count)} of ${formatCount(cat.validCount)}) across ${formatCount(cat.distinctCount)} categories.`,
        affectedColumnIds: [cat.columnId],
        affectedColumnNames: [cat.name],
        evidence: [
          { label: 'Top Category', value: topLabel },
          { label: 'Top Share', value: formatPercentage(topShare, 2) },
          { label: 'Distinct Categories', value: formatCount(cat.distinctCount) },
        ],
        severity: topShare >= 85 ? 'medium' : 'low',
        confidence: evidenceStrengthForSample(cat.validCount),
        suggestedAction:
          'Inspect the frequency chart and verify whether strong class concentration is expected for this domain.',
        recommendedChart: {
          chartType: 'bar',
          xColumnId: cat.columnId,
          title: `${cat.name} Frequency Distribution`,
        },
      });
    }

    // 5c. Rare categories (<= 1.5% share or singleton in >= 20 rows)
    if (cat.validCount >= RARE_CATEGORY_MIN_VALID && cat.distinctCount >= 3) {
      const rareEntries = cat.distribution.filter(
        (d) => d.percentage <= RARE_CATEGORY_MAX_PCT || d.count === 1,
      );
      const totalRareCount = rareEntries.length + cat.omittedCategoryCount;
      if (totalRareCount > 0) {
        const sampleLabels = rareEntries
          .slice(0, 5)
          .map((e) => `"${e.value}" (${formatCount(e.count)})`)
          .join(', ');
        const least = cat.leastFrequent;
        insights.push({
          id: `cat-rare-${cat.columnId}`,
          category: 'categorical',
          classification: 'notable_observation',
          title: `Rare ${totalRareCount === 1 ? 'category' : 'categories'} detected in "${cat.name}"`,
          explanation: `${formatCount(totalRareCount)} of ${formatCount(cat.distinctCount)} categories each represent ${formatPercentage(RARE_CATEGORY_MAX_PCT, 1)} or less of valid observations (or occur only once). Rare labels may reflect legitimate niche cases or typos.`,
          affectedColumnIds: [cat.columnId],
          affectedColumnNames: [cat.name],
          evidence: [
            {
              label: 'Rare Categories',
              value: `${formatCount(totalRareCount)} of ${formatCount(cat.distinctCount)}`,
            },
            {
              label: 'Lowest Frequency',
              value: least
                ? `${formatCount(least.count)} (${formatPercentage(least.percentage, 2)})`
                : '—',
            },
            {
              label: 'Sample Rare Labels',
              value: sampleLabels || 'See distribution',
            },
          ],
          severity: totalRareCount >= 5 ? 'medium' : 'low',
          confidence: evidenceStrengthForSample(cat.validCount),
          suggestedAction:
            'Filter to rare category labels in Data Explorer to check for typos, inconsistent casing, or genuine rare occurrences.',
          recommendedChart: {
            chartType: 'bar',
            xColumnId: cat.columnId,
            title: `${cat.name} Frequency Distribution`,
          },
        });
      }
    }

    // 5d. Unexpected category frequency concentration / imbalance ratio
    if (
      cat.validCount >= 15 &&
      cat.distinctCount >= 3 &&
      cat.mostFrequent &&
      cat.leastFrequent &&
      cat.leastFrequent.count > 0
    ) {
      const ratio = cat.mostFrequent.count / cat.leastFrequent.count;
      if (ratio >= 10 && topShare < DOMINANT_CATEGORY_MIN_PCT) {
        insights.push({
          id: `cat-imbalance-${cat.columnId}`,
          category: 'categorical',
          classification: 'notable_observation',
          title: `Steep category frequency imbalance in "${cat.name}" (${formatStatNumber(ratio, 1)}× ratio)`,
          explanation: `The most common category ("${cat.mostFrequent.values[0]}") appears ${formatStatNumber(ratio, 1)}× more often than the least common category ("${cat.leastFrequent.values[0]}"), indicating a skewed long-tail distribution.`,
          affectedColumnIds: [cat.columnId],
          affectedColumnNames: [cat.name],
          evidence: [
            {
              label: 'Most Frequent',
              value: `${cat.mostFrequent.values[0]} (${formatCount(cat.mostFrequent.count)})`,
            },
            {
              label: 'Least Frequent',
              value: `${cat.leastFrequent.values[0]} (${formatCount(cat.leastFrequent.count)})`,
            },
            { label: 'Max/Min Ratio', value: `${formatStatNumber(ratio, 1)}×` },
          ],
          severity: 'info',
          confidence: evidenceStrengthForSample(cat.validCount),
          suggestedAction:
            'Open the bar chart to inspect the frequency drop-off across categories.',
          recommendedChart: {
            chartType: 'bar',
            xColumnId: cat.columnId,
            title: `${cat.name} Frequency Distribution`,
          },
        });
      }
    }
  }

  // ── 6. High cardinality columns (M03) ─────────────────────────────────────
  for (const col of profile.columns) {
    if (col.detectedType === 'categorical' || col.detectedType === 'unknown') {
      const isHighCard =
        (col.uniqueCount >= HIGH_CARDINALITY_MIN_DISTINCT &&
          col.distinctRatio >= HIGH_CARDINALITY_RATIO) ||
        (col.detectedType === 'categorical' && col.uniqueCount >= 50);

      if (isHighCard) {
        insights.push({
          id: `struct-high-cardinality-${col.columnId}`,
          category: 'structural',
          classification: 'notable_observation',
          title: `High cardinality in ${col.detectedType} column "${col.name}"`,
          explanation: `"${col.name}" contains ${formatCount(col.uniqueCount)} unique values across ${formatCount(col.nonMissingCount)} non-missing rows (${formatPercentage(col.distinctRatio * 100, 1)} uniqueness), which can fragment grouping and visual summaries.`,
          affectedColumnIds: [col.columnId],
          affectedColumnNames: [col.name],
          evidence: [
            { label: 'Distinct Values', value: formatCount(col.uniqueCount) },
            {
              label: 'Uniqueness Ratio',
              value: formatPercentage(col.distinctRatio * 100, 1),
            },
            { label: 'Column Type (M03)', value: col.detectedType },
          ],
          severity: col.distinctRatio >= 0.85 ? 'medium' : 'low',
          confidence: 'high',
          suggestedAction:
            'Inspect sample values in Data Explorer to confirm whether this field is an unformatted identifier, free text, or needs grouping.',
          ...(col.detectedType === 'categorical'
            ? {
                recommendedChart: {
                  chartType: 'bar' as const,
                  xColumnId: col.columnId,
                  title: `${col.name} Frequency Distribution`,
                },
              }
            : {}),
        });
      }
    }
  }

  // ── 7. Unusual numeric ranges & potentially suspicious distributions (M04) ─
  for (const num of stats.numericColumns) {
    if (
      !num.hasValidData ||
      num.validCount < 5 ||
      num.min === null ||
      num.max === null ||
      num.range === null ||
      num.mean === null ||
      num.median === null
    ) {
      continue;
    }

    // 7a. Unusual numeric range (huge range/IQR or multi-order-of-magnitude span or negative tail in positive distribution)
    const rangeToIqr =
      num.iqr !== null && num.iqr > 0 ? num.range / num.iqr : null;
    const orderSpan =
      num.min > 0 && num.max > 0 ? num.max / num.min : null;
    const hasUnexpectedNegatives =
      num.min < 0 && num.q1 !== null && num.q1 > 0 && num.median > 0;

    if (
      (rangeToIqr !== null && rangeToIqr >= 15) ||
      (orderSpan !== null && orderSpan >= 1000) ||
      hasUnexpectedNegatives
    ) {
      const reasons: string[] = [];
      if (rangeToIqr !== null && rangeToIqr >= 15) {
        reasons.push(
          `total span (${formatStatNumber(num.range, 2)}) is ${formatStatNumber(rangeToIqr, 1)}× wider than the interquartile range`,
        );
      }
      if (orderSpan !== null && orderSpan >= 1000) {
        reasons.push(
          `positive values span ${formatStatNumber(orderSpan, 0)}× from minimum to maximum`,
        );
      }
      if (hasUnexpectedNegatives) {
        reasons.push(
          `negative minimum (${formatStatNumber(num.min, 2)}) appears in a distribution whose Q1 (${formatStatNumber(num.q1, 2)}) and median (${formatStatNumber(num.median, 2)}) are positive`,
        );
      }

      insights.push({
        id: `dist-unusual-range-${num.columnId}`,
        category: 'distribution',
        classification: 'notable_observation',
        title: `Unusual numeric range in "${num.name}"`,
        explanation: `Values span from ${formatStatNumber(num.min, 2)} to ${formatStatNumber(num.max, 2)}: ${reasons.join('; ')}. Extreme spans may be legitimate (e.g., revenue or refunds) or reflect mixed units.`,
        affectedColumnIds: [num.columnId],
        affectedColumnNames: [num.name],
        evidence: [
          {
            label: 'Min / Max',
            value: `${formatStatNumber(num.min, 2)} to ${formatStatNumber(num.max, 2)}`,
          },
          { label: 'Range', value: formatStatNumber(num.range, 2) },
          {
            label: 'IQR (Q3 − Q1)',
            value: formatStatNumber(num.iqr, 2),
          },
          ...(rangeToIqr !== null
            ? [{ label: 'Range / IQR', value: `${formatStatNumber(rangeToIqr, 1)}×` }]
            : []),
        ],
        severity: hasUnexpectedNegatives || (rangeToIqr !== null && rangeToIqr >= 30) ? 'medium' : 'low',
        confidence: evidenceStrengthForSample(num.validCount),
        suggestedAction:
          'Sort ascending and descending in Data Explorer or open the quartile box plot to inspect boundary values and verify unit consistency.',
        recommendedChart: {
          chartType: 'boxplot',
          xColumnId: num.columnId,
          title: `${num.name} Quartile Box Plot`,
        },
      });
    }

    // 7b. Potentially suspicious distribution: heavy value clumping / capping / zero-inflation
    if (
      num.validCount >= 10 &&
      num.distinctCount >= 3 &&
      num.mode.status === 'unimodal' &&
      num.mode.values.length > 0
    ) {
      const modeVal = num.mode.values[0]!;
      const clumpPct = (num.mode.frequency / num.validCount) * 100;
      if (clumpPct >= SUSPICIOUS_MODE_CLUMP_PCT && clumpPct < NEAR_CONSTANT_SHARE_PCT) {
        const isBoundary = modeVal === num.min || modeVal === num.max || modeVal === 0;
        insights.push({
          id: `dist-clumping-${num.columnId}`,
          category: 'distribution',
          classification: 'notable_observation',
          title: `Heavy value concentration at ${formatStatNumber(modeVal, 2)} in "${num.name}"`,
          explanation: `${formatPercentage(clumpPct, 1)} of valid numeric observations (${formatCount(num.mode.frequency)} of ${formatCount(num.validCount)}) equal exactly ${formatStatNumber(modeVal, 2)}${isBoundary ? ' (a boundary or zero value)' : ''}. Concentrated spikes can indicate default placeholders, sensor floors/ceilings, or zero-inflated metrics.`,
          affectedColumnIds: [num.columnId],
          affectedColumnNames: [num.name],
          evidence: [
            { label: 'Repeated Value', value: formatStatNumber(modeVal, 4) },
            { label: 'Concentration Share', value: formatPercentage(clumpPct, 1) },
            { label: 'Occurrences', value: formatCount(num.mode.frequency) },
            { label: 'Distinct Values', value: formatCount(num.distinctCount) },
          ],
          severity: isBoundary && clumpPct >= 60 ? 'medium' : 'low',
          confidence: evidenceStrengthForSample(num.validCount),
          suggestedAction:
            'Inspect the histogram and filter to the concentrated value in Data Explorer to confirm whether it represents a genuine zero/cap or sentinel default.',
          recommendedChart: {
            chartType: 'histogram',
            xColumnId: num.columnId,
            title: `${num.name} Distribution`,
          },
        });
      }
    }
  }

  return insights;
}
