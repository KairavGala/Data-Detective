import type {
  CategorySortOrder,
  ChartType,
  DatasetProfileSummary,
} from '@/types';
import { getEligibleColumnsForChartType } from '@/engine/visualization';

export const CHART_TYPE_OPTIONS: readonly {
  readonly value: ChartType;
  readonly label: string;
  readonly shortTag: string;
  readonly description: string;
}[] = [
  {
    value: 'bar',
    label: 'Bar Chart',
    shortTag: 'BAR · CATEGORICAL',
    description: 'Categorical frequency distribution from Module 04',
  },
  {
    value: 'histogram',
    label: 'Histogram',
    shortTag: 'HISTOGRAM · NUMERIC',
    description: 'Binned numeric distribution with M04 mean and median',
  },
  {
    value: 'line',
    label: 'Line Chart',
    shortTag: 'LINE · ORDERED SERIES',
    description: 'Trend across an ordered date or numeric X-axis',
  },
  {
    value: 'scatter',
    label: 'Scatter Plot',
    shortTag: 'SCATTER · BIVARIATE',
    description: 'Paired relationship between two numeric columns',
  },
  {
    value: 'boxplot',
    label: 'Box Plot',
    shortTag: 'BOX PLOT · QUARTILES',
    description: 'Exact M04 five-number quartile summary (Min–Max)',
  },
];

export const CATEGORY_SORT_OPTIONS: readonly {
  readonly value: CategorySortOrder;
  readonly label: string;
}[] = [
  { value: 'freq_desc', label: 'Frequency (High to Low)' },
  { value: 'freq_asc', label: 'Frequency (Low to High)' },
  { value: 'label_asc', label: 'Label (A to Z)' },
  { value: 'label_desc', label: 'Label (Z to A)' },
];

export function getChartTypeMeta(type: ChartType) {
  return (
    CHART_TYPE_OPTIONS.find((opt) => opt.value === type) ?? CHART_TYPE_OPTIONS[0]!
  );
}

/**
 * Checks whether a chart type has at least one valid column pairing in the
 * active dataset profile.
 */
export function isChartTypeSupported(
  chartType: ChartType,
  profile: DatasetProfileSummary,
): boolean {
  const eligible = getEligibleColumnsForChartType(chartType, profile);
  if (eligible.xColumns.length === 0) return false;
  if (!eligible.requiresY) return true;
  if (eligible.yColumns.length === 0) return false;

  // Must have at least one pair where xColumnId !== yColumnId
  return eligible.xColumns.some((x) =>
    eligible.yColumns.some((y) => y.columnId !== x.columnId),
  );
}

/**
 * Picks valid default X/Y columns and labels for a given chart type.
 */
export function buildDefaultAxesForType(
  chartType: ChartType,
  profile: DatasetProfileSummary,
): {
  xColumnId: string;
  yColumnId?: string;
  title: string;
  xAxisLabel: string;
  yAxisLabel: string;
} | null {
  const eligible = getEligibleColumnsForChartType(chartType, profile);
  if (eligible.xColumns.length === 0) return null;

  if (!eligible.requiresY) {
    const xCol = eligible.xColumns[0]!;
    if (chartType === 'bar') {
      return {
        xColumnId: xCol.columnId,
        title: `${xCol.name} Frequency Distribution`,
        xAxisLabel: xCol.name,
        yAxisLabel: 'Count',
      };
    }
    if (chartType === 'histogram') {
      return {
        xColumnId: xCol.columnId,
        title: `${xCol.name} Distribution`,
        xAxisLabel: xCol.name,
        yAxisLabel: 'Frequency',
      };
    }
    return {
      xColumnId: xCol.columnId,
      title: `${xCol.name} Quartile Box Plot`,
      xAxisLabel: xCol.name,
      yAxisLabel: '',
    };
  }

  for (const xCol of eligible.xColumns) {
    const yCol = eligible.yColumns.find((y) => y.columnId !== xCol.columnId);
    if (yCol) {
      return {
        xColumnId: xCol.columnId,
        yColumnId: yCol.columnId,
        title:
          chartType === 'line'
            ? `${yCol.name} over ${xCol.name}`
            : `${yCol.name} vs ${xCol.name}`,
        xAxisLabel: xCol.name,
        yAxisLabel: yCol.name,
      };
    }
  }

  return null;
}
