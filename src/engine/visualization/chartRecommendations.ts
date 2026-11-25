import type {
  ChartConfig,
  ChartRecommendation,
  DatasetProfileSummary,
  DatasetStatisticalSummary,
} from '@/types';

export const DEFAULT_MAX_CHART_CATEGORIES = 15;
export const INITIAL_WORKSPACE_RECOMMENDATION_LIMIT = 4;

/**
 * Generates deterministic, schema-validated chart recommendations strictly from
 * Module 03 column classifications and Module 04 statistical summaries.
 *
 * Never recommends invalid column combinations, empty columns, identifiers,
 * or unknown/mixed-type columns.
 */
export function generateChartRecommendations(
  profile: DatasetProfileSummary,
  stats: DatasetStatisticalSummary,
): readonly ChartRecommendation[] {
  if (profile.rowCount === 0 || profile.columnCount === 0) {
    return [];
  }

  const recommendations: ChartRecommendation[] = [];
  const seenKeys = new Set<string>();

  const pushUnique = (rec: ChartRecommendation) => {
    const key = `${rec.type}:${rec.xColumnId}:${rec.yColumnId ?? ''}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    recommendations.push(rec);
  };

  // Eligible numeric columns with valid data from M04
  const validNumeric = stats.numericColumns.filter((c) => c.hasValidData);
  const variedNumeric = validNumeric.filter(
    (c) => c.validCount >= 2 && c.distinctCount >= 2,
  );

  // Eligible categorical columns with valid data from M04
  const validCategorical = stats.categoricalColumns.filter(
    (c) => c.hasValidData && c.distinctCount >= 1,
  );
  // Prefer clean low-to-moderate cardinality categoricals first (2..25 distinct)
  const sortedCategorical = [...validCategorical].sort((a, b) => {
    const aIdeal = a.distinctCount >= 2 && a.distinctCount <= 25 ? 0 : 1;
    const bIdeal = b.distinctCount >= 2 && b.distinctCount <= 25 ? 0 : 1;
    if (aIdeal !== bIdeal) return aIdeal - bIdeal;
    return a.index - b.index;
  });

  // Eligible unambiguous date columns from M03 (must have >= 2 valid dates and no conflicting formats)
  const validDates = profile.columns.filter((col) => {
    if (col.detectedType !== 'date' || !col.dateStats) return false;
    const hasConflict = col.warnings.some(
      (w) =>
        w.code === 'AMBIGUOUS_DATES' &&
        w.title.toLowerCase().includes('conflicting'),
    );
    return col.dateStats.validCount >= 2 && !hasConflict;
  });

  // 1. Temporal Line Chart: valid Date column × primary varied Numeric column
  if (validDates.length > 0 && variedNumeric.length > 0) {
    const dateCol = validDates[0]!;
    const primaryNum = variedNumeric[0]!;
    pushUnique({
      id: `rec-line-${dateCol.columnId}-${primaryNum.columnId}`,
      type: 'line',
      title: `${primaryNum.name} over ${dateCol.name}`,
      xColumnId: dateCol.columnId,
      yColumnId: primaryNum.columnId,
      xAxisLabel: dateCol.name,
      yAxisLabel: primaryNum.name,
      reason: `Chronological trend pairing date column "${dateCol.name}" with numeric measure "${primaryNum.name}".`,
      priority: 10,
    });
  }

  // 2. Categorical Bar Charts: up to 3 top categorical columns
  for (let i = 0; i < Math.min(3, sortedCategorical.length); i += 1) {
    const cat = sortedCategorical[i]!;
    pushUnique({
      id: `rec-bar-${cat.columnId}`,
      type: 'bar',
      title: `${cat.name} Frequency Distribution`,
      xColumnId: cat.columnId,
      xAxisLabel: cat.name,
      yAxisLabel: 'Count',
      reason: `Categorical frequency breakdown across ${cat.distinctCount.toLocaleString('en-US')} distinct values (${cat.validCount.toLocaleString('en-US')} valid observations).`,
      priority: 20 + i,
    });
  }

  // 3. Numeric Histograms: up to 3 numeric columns (prefer varied, fallback to valid)
  const histCandidates = variedNumeric.length > 0 ? variedNumeric : validNumeric;
  for (let i = 0; i < Math.min(3, histCandidates.length); i += 1) {
    const num = histCandidates[i]!;
    pushUnique({
      id: `rec-hist-${num.columnId}`,
      type: 'histogram',
      title: `${num.name} Distribution`,
      xColumnId: num.columnId,
      xAxisLabel: num.name,
      yAxisLabel: 'Frequency',
      reason: `Distribution shape of numeric column "${num.name}" across ${num.validCount.toLocaleString('en-US')} valid observations.`,
      priority: 30 + i,
    });
  }

  // 4. Scatter Plot: top pair of distinct varied numeric columns
  if (variedNumeric.length >= 2) {
    const xCol = variedNumeric[0]!;
    const yCol = variedNumeric[1]!;
    pushUnique({
      id: `rec-scatter-${xCol.columnId}-${yCol.columnId}`,
      type: 'scatter',
      title: `${yCol.name} vs ${xCol.name}`,
      xColumnId: xCol.columnId,
      yColumnId: yCol.columnId,
      xAxisLabel: xCol.name,
      yAxisLabel: yCol.name,
      reason: `Bivariate relationship between numeric columns "${xCol.name}" and "${yCol.name}".`,
      priority: 40,
    });
  }

  // 5. Box Plot: primary varied numeric column (exact M04 5-number summary)
  if (variedNumeric.length > 0) {
    const num = variedNumeric[0]!;
    pushUnique({
      id: `rec-box-${num.columnId}`,
      type: 'boxplot',
      title: `${num.name} Quartile Box Plot`,
      xColumnId: num.columnId,
      xAxisLabel: num.name,
      yAxisLabel: '',
      reason: `Exact five-number quartile summary (Min, Q1, Median, Q3, Max) for "${num.name}".`,
      priority: 50,
    });
  }

  return recommendations.sort((a, b) => a.priority - b.priority);
}

/**
 * Converts a deterministic recommendation into an editable workspace ChartConfig.
 */
export function recommendationToChartConfig(
  rec: ChartRecommendation,
  instanceId?: string,
): ChartConfig {
  return {
    id: instanceId ?? rec.id,
    type: rec.type,
    title: rec.title,
    xColumnId: rec.xColumnId,
    ...(rec.yColumnId ? { yColumnId: rec.yColumnId } : {}),
    xAxisLabel: rec.xAxisLabel,
    yAxisLabel: rec.yAxisLabel,
    categorySort: 'freq_desc',
    maxCategories: DEFAULT_MAX_CHART_CATEGORIES,
    showLegend: true,
    recommendationReason: rec.reason,
  };
}
