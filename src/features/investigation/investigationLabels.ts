import type {
  ChartType,
  EvidenceStrength,
  InsightCategory,
  InsightChartLink,
  InsightClassification,
  InsightSeverity,
} from '@/types';

export const CATEGORY_ORDER: readonly InsightCategory[] = [
  'data_quality',
  'numeric_outliers',
  'distribution',
  'categorical',
  'relationship',
  'structural',
];

export const CATEGORY_META: Readonly<
  Record<
    InsightCategory,
    {
      readonly label: string;
      readonly code: string;
      readonly description: string;
    }
  >
> = {
  data_quality: {
    label: 'Data Quality Issues',
    code: 'CAT-DQ',
    description:
      'Confirmed completeness gaps, cross-column missingness skew, and unparseable or non-finite cells.',
  },
  numeric_outliers: {
    label: 'Numeric Statistical Outliers',
    code: 'CAT-OUT',
    description:
      'Extreme numeric observations detected via Tukey IQR fences and optional Z-score thresholds.',
  },
  distribution: {
    label: 'Distribution & Range Patterns',
    code: 'CAT-DIST',
    description:
      'Skewed numeric shapes, unusually wide spans, and concentrated boundary or sentinel spikes.',
  },
  categorical: {
    label: 'Categorical Anomalies',
    code: 'CAT-CAT',
    description:
      'Dominant categories, rare labels, and steep category frequency imbalances.',
  },
  relationship: {
    label: 'Numeric Relationships',
    code: 'CAT-REL',
    description:
      'Strong linear Pearson correlations between numeric columns (association only, not causation).',
  },
  structural: {
    label: 'Structural Column Signals',
    code: 'CAT-STR',
    description:
      'Zero-variance constant fields, near-constant columns, and high-cardinality text or categories.',
  },
};

export const SEVERITY_ORDER: readonly InsightSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
];

export const SEVERITY_META: Readonly<
  Record<
    InsightSeverity,
    {
      readonly label: string;
      readonly rank: number;
      readonly textClass: string;
    }
  >
> = {
  critical: {
    label: 'Critical',
    rank: 0,
    textClass: 'text-[var(--dd-status-anomaly)]',
  },
  high: {
    label: 'High',
    rank: 1,
    textClass: 'text-[var(--dd-status-anomaly)]',
  },
  medium: {
    label: 'Medium',
    rank: 2,
    textClass: 'text-[var(--dd-status-warning)]',
  },
  low: {
    label: 'Low',
    rank: 3,
    textClass: 'text-[var(--dd-text-secondary)]',
  },
  info: {
    label: 'Info',
    rank: 4,
    textClass: 'text-[var(--dd-accent-teal)]',
  },
};

export const CLASSIFICATION_META: Readonly<
  Record<
    InsightClassification,
    {
      readonly shortLabel: string;
      readonly fullLabel: string;
      readonly textClass: string;
    }
  >
> = {
  data_quality_issue: {
    shortLabel: 'DATA-QUALITY ISSUE',
    fullLabel: 'Confirmed Data-Quality Issue',
    textClass: 'text-[var(--dd-status-anomaly)]',
  },
  statistical_outlier: {
    shortLabel: 'STATISTICAL OUTLIER',
    fullLabel: 'Statistical Outlier (Not Automatically an Error)',
    textClass: 'text-[var(--dd-accent-teal)]',
  },
  notable_observation: {
    shortLabel: 'NOTABLE OBSERVATION',
    fullLabel: 'Unusual / Potentially Legitimate Observation',
    textClass: 'text-[var(--dd-status-warning)]',
  },
};

export const CONFIDENCE_LABELS: Readonly<Record<EvidenceStrength, string>> = {
  high: 'High evidence',
  moderate: 'Moderate evidence',
  preliminary: 'Preliminary (small N)',
};

const CHART_ACTION_LABELS: Readonly<Record<ChartType, string>> = {
  bar: 'Bar Chart',
  histogram: 'Histogram',
  line: 'Line Chart',
  scatter: 'Scatter Plot',
  boxplot: 'Box Plot',
};

export function getChartActionLabel(type: ChartType): string {
  return CHART_ACTION_LABELS[type];
}

export function buildExplorerColumnUrl(columnId: string): string {
  const params = new URLSearchParams({ column: columnId });
  return `/explorer?${params.toString()}`;
}

export function buildExplorerRowUrl(
  rowNumber: number,
  columnId?: string,
): string {
  const params = new URLSearchParams({ row: String(rowNumber) });
  if (columnId) params.set('column', columnId);
  return `/explorer?${params.toString()}`;
}

export function buildVisualizationUrl(link: InsightChartLink): string {
  const params = new URLSearchParams({
    chartType: link.chartType,
    x: link.xColumnId,
    title: link.title,
  });
  if (link.yColumnId) {
    params.set('y', link.yColumnId);
  }
  return `/visualizations?${params.toString()}`;
}
