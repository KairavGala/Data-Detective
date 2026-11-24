import {
  classifyDateValue,
  classifyMissingValue,
  classifyNumericValue,
  compileMissingPolicy,
} from '@/engine/profiling';
import type {
  CategorySortOrder,
  ChartConfig,
  ChartType,
  DatasetColumnProfile,
  DatasetProfileSummary,
  DatasetStatisticalSummary,
  ImportedDataset,
  PreparedBarChartData,
  PreparedBarDatum,
  PreparedBoxPlotData,
  PreparedChartData,
  PreparedHistogramBin,
  PreparedHistogramData,
  PreparedLineChartData,
  PreparedLinePoint,
  PreparedScatterChartData,
  PreparedScatterPoint,
} from '@/types';
import { formatStatNumber } from '@/utils/format';

export const MIN_HISTOGRAM_BINS = 5;
export const MAX_HISTOGRAM_BINS = 24;
export const MIN_CHART_CATEGORIES = 3;
export const MAX_CHART_CATEGORIES = 30;
export const MAX_LINE_POINTS = 250;
export const MAX_SCATTER_POINTS = 1500;

const MONTH_INDEX: Readonly<Record<string, number>> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const ISO_DATE_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const YMD_SLASH_RE =
  /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const DELIMITED_4Y_RE = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})$/;
const MONTH_FIRST_RE =
  /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/;
const DAY_FIRST_NAMED_RE =
  /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})$/;

/**
 * Deterministically parses a valid date cell into UTC epoch ms without
 * mutating the source value or guessing conflicting ambiguous date orders.
 */
function parseDateCellToUtcMs(
  raw: unknown,
  resolvedConvention: 'dmy' | 'mdy' | null,
): number | null {
  const cls = classifyDateValue(raw);
  if (cls.status === 'invalid' || cls.status === 'not_date') {
    return null;
  }

  if (raw instanceof Date) {
    const ms = raw.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();

  const iso = ISO_DATE_RE.exec(trimmed);
  if (iso) {
    if (iso[7]) {
      const ms = Date.parse(trimmed);
      return Number.isFinite(ms) ? ms : null;
    }
    return Date.UTC(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
      iso[4] ? Number(iso[4]) : 0,
      iso[5] ? Number(iso[5]) : 0,
      iso[6] ? Number(iso[6]) : 0,
    );
  }

  const ymd = YMD_SLASH_RE.exec(trimmed);
  if (ymd) {
    return Date.UTC(
      Number(ymd[1]),
      Number(ymd[2]) - 1,
      Number(ymd[3]),
      ymd[4] ? Number(ymd[4]) : 0,
      ymd[5] ? Number(ymd[5]) : 0,
      ymd[6] ? Number(ymd[6]) : 0,
    );
  }

  const monthFirst = MONTH_FIRST_RE.exec(trimmed);
  if (monthFirst) {
    const m = MONTH_INDEX[monthFirst[1]!.toLowerCase()];
    if (m !== undefined) {
      return Date.UTC(Number(monthFirst[3]), m, Number(monthFirst[2]));
    }
  }

  const dayFirst = DAY_FIRST_NAMED_RE.exec(trimmed);
  if (dayFirst) {
    const m = MONTH_INDEX[dayFirst[2]!.toLowerCase()];
    if (m !== undefined) {
      return Date.UTC(Number(dayFirst[3]), m, Number(dayFirst[1]));
    }
  }

  const delim = DELIMITED_4Y_RE.exec(trimmed);
  if (delim) {
    const first = Number(delim[1]);
    const second = Number(delim[3]);
    const year = Number(delim[4]);
    if (cls.format === 'DMY-Unambiguous') {
      return Date.UTC(year, second - 1, first);
    }
    if (cls.format === 'MDY-Unambiguous') {
      return Date.UTC(year, first - 1, second);
    }
    if (cls.format === 'Numeric-SameDayMonth') {
      return Date.UTC(year, first - 1, second);
    }
    if (cls.status === 'ambiguous' && resolvedConvention !== null) {
      return resolvedConvention === 'dmy'
        ? Date.UTC(year, second - 1, first)
        : Date.UTC(year, first - 1, second);
    }
  }

  return null;
}

function inferResolvedDateConvention(
  colProfile: DatasetColumnProfile,
): 'dmy' | 'mdy' | null {
  const formats = colProfile.dateStats?.detectedFormats ?? [];
  const hasDmy = formats.includes('DMY-Unambiguous');
  const hasMdy = formats.includes('MDY-Unambiguous');
  if (hasDmy && !hasMdy) return 'dmy';
  if (hasMdy && !hasDmy) return 'mdy';
  return null;
}

function formatDateTick(epochMs: number): string {
  const d = new Date(epochMs);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface EligibleChartColumns {
  readonly xColumns: readonly DatasetColumnProfile[];
  readonly yColumns: readonly DatasetColumnProfile[];
  readonly requiresY: boolean;
}

/**
 * Returns strictly valid M03 columns for each chart type so invalid
 * column combinations cannot be selected or recommended.
 */
export function getEligibleColumnsForChartType(
  chartType: ChartType,
  profile: DatasetProfileSummary,
): EligibleChartColumns {
  const numericCols = profile.columns.filter((c) => c.detectedType === 'numeric');
  const categoricalCols = profile.columns.filter(
    (c) => c.detectedType === 'categorical',
  );
  const dateCols = profile.columns.filter((c) => c.detectedType === 'date');

  switch (chartType) {
    case 'bar':
      return {
        xColumns: categoricalCols,
        yColumns: [],
        requiresY: false,
      };
    case 'histogram':
    case 'boxplot':
      return {
        xColumns: numericCols,
        yColumns: [],
        requiresY: false,
      };
    case 'line':
      return {
        xColumns: [...dateCols, ...numericCols],
        yColumns: numericCols,
        requiresY: true,
      };
    case 'scatter':
      return {
        xColumns: numericCols,
        yColumns: numericCols,
        requiresY: true,
      };
  }
}

function sortBarEntries(
  entries: readonly PreparedBarDatum[],
  sortOrder: CategorySortOrder,
): PreparedBarDatum[] {
  const copy = [...entries];
  switch (sortOrder) {
    case 'freq_desc':
      return copy.sort((a, b) =>
        b.count !== a.count
          ? b.count - a.count
          : a.label < b.label
            ? -1
            : a.label > b.label
              ? 1
              : 0,
      );
    case 'freq_asc':
      return copy.sort((a, b) =>
        a.count !== b.count
          ? a.count - b.count
          : a.label < b.label
            ? -1
            : a.label > b.label
              ? 1
              : 0,
      );
    case 'label_asc':
      return copy.sort((a, b) =>
        a.label.toLowerCase() !== b.label.toLowerCase()
          ? a.label.toLowerCase() < b.label.toLowerCase()
            ? -1
            : 1
          : a.label < b.label
            ? -1
            : a.label > b.label
              ? 1
              : 0,
      );
    case 'label_desc':
      return copy.sort((a, b) =>
        a.label.toLowerCase() !== b.label.toLowerCase()
          ? a.label.toLowerCase() > b.label.toLowerCase()
            ? -1
            : 1
          : a.label > b.label
            ? -1
            : a.label < b.label
              ? 1
              : 0,
      );
  }
}

function prepareBarChart(
  profile: DatasetProfileSummary,
  stats: DatasetStatisticalSummary,
  config: ChartConfig,
): PreparedBarChartData {
  const colProfile = profile.columns.find(
    (c) => c.columnId === config.xColumnId,
  );
  if (!colProfile || colProfile.detectedType !== 'categorical') {
    return {
      type: 'bar',
      status: 'invalid_config',
      emptyReason:
        'Bar charts require a column classified as categorical by Module 03.',
      xColumnName: colProfile?.name ?? 'Unknown',
      totalRows: profile.rowCount,
      validCount: 0,
      missingExcluded: 0,
      invalidExcluded: 0,
      bars: [],
      distinctCount: 0,
      omittedCategoryCount: 0,
      omittedObservationCount: 0,
    };
  }

  // Reuse Module 04 categorical distribution directly (zero redundant dataset scan)
  const catStats = stats.categoricalColumns.find(
    (c) => c.columnId === config.xColumnId,
  );

  if (!catStats || !catStats.hasValidData || catStats.distribution.length === 0) {
    return {
      type: 'bar',
      status: 'empty',
      emptyReason: `Column "${colProfile.name}" has no valid categorical observations to plot.`,
      xColumnName: colProfile.name,
      totalRows: profile.rowCount,
      validCount: 0,
      missingExcluded: catStats?.missingCount ?? colProfile.missingCount,
      invalidExcluded: catStats?.invalidCount ?? 0,
      bars: [],
      distinctCount: 0,
      omittedCategoryCount: 0,
      omittedObservationCount: 0,
    };
  }

  const maxBars = Math.min(
    MAX_CHART_CATEGORIES,
    Math.max(MIN_CHART_CATEGORIES, Math.floor(config.maxCategories)),
  );

  // Select top maxBars by frequency first (keeps most significant categories when bounded),
  // then apply user's chosen visual sort order
  const topSlice = catStats.distribution.slice(0, maxBars);
  const bars = sortBarEntries(
    topSlice.map((entry) => ({
      label: entry.value,
      count: entry.count,
      percentage: entry.percentage,
    })),
    config.categorySort,
  );

  const shownCount = topSlice.reduce((sum, entry) => sum + entry.count, 0);
  const omittedCategoryCount = Math.max(
    0,
    catStats.distinctCount - topSlice.length,
  );
  const omittedObservationCount = Math.max(0, catStats.validCount - shownCount);

  return {
    type: 'bar',
    status: 'ready',
    xColumnName: colProfile.name,
    totalRows: catStats.totalCount,
    validCount: catStats.validCount,
    missingExcluded: catStats.missingCount,
    invalidExcluded: catStats.invalidCount,
    bars,
    distinctCount: catStats.distinctCount,
    omittedCategoryCount,
    omittedObservationCount,
  };
}

function computeAutoBinCount(validCount: number): number {
  const sturges = Math.ceil(Math.log2(Math.max(2, validCount)) + 1);
  return Math.min(20, Math.max(MIN_HISTOGRAM_BINS, sturges));
}

function prepareHistogramChart(
  dataset: ImportedDataset,
  profile: DatasetProfileSummary,
  stats: DatasetStatisticalSummary,
  config: ChartConfig,
): PreparedHistogramData {
  const colProfile = profile.columns.find(
    (c) => c.columnId === config.xColumnId,
  );
  if (!colProfile || colProfile.detectedType !== 'numeric') {
    return {
      type: 'histogram',
      status: 'invalid_config',
      emptyReason:
        'Histograms require a column classified as numeric by Module 03.',
      xColumnName: colProfile?.name ?? 'Unknown',
      totalRows: dataset.rowCount,
      validCount: 0,
      missingExcluded: 0,
      invalidExcluded: 0,
      bins: [],
      min: null,
      max: null,
      mean: null,
      median: null,
      isConstant: false,
    };
  }

  // Reuse Module 04 exact min, max, mean, median, and counts
  const numStats = stats.numericColumns.find(
    (c) => c.columnId === config.xColumnId,
  );

  if (
    !numStats ||
    !numStats.hasValidData ||
    numStats.min === null ||
    numStats.max === null
  ) {
    return {
      type: 'histogram',
      status: 'empty',
      emptyReason: `Column "${colProfile.name}" has no valid numeric observations to bin.`,
      xColumnName: colProfile.name,
      totalRows: dataset.rowCount,
      validCount: 0,
      missingExcluded: numStats?.missingCount ?? colProfile.missingCount,
      invalidExcluded: numStats?.invalidCount ?? 0,
      bins: [],
      min: null,
      max: null,
      mean: null,
      median: null,
      isConstant: false,
    };
  }

  const { min, max, validCount } = numStats;

  // Constant or single-value column -> 1 exact bin without division by zero
  if (min === max) {
    return {
      type: 'histogram',
      status: 'ready',
      xColumnName: colProfile.name,
      totalRows: numStats.totalCount,
      validCount,
      missingExcluded: numStats.missingCount,
      invalidExcluded: numStats.invalidCount,
      bins: [
        {
          start: min,
          end: max,
          label: formatStatNumber(min, 2),
          count: validCount,
          percentage: 100,
          isLastInclusive: true,
        },
      ],
      min,
      max,
      mean: numStats.mean,
      median: numStats.median,
      isConstant: true,
    };
  }

  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) {
    return {
      type: 'histogram',
      status: 'empty',
      emptyReason: `Numeric range of "${colProfile.name}" exceeds finite histogram binning bounds.`,
      xColumnName: colProfile.name,
      totalRows: numStats.totalCount,
      validCount,
      missingExcluded: numStats.missingCount,
      invalidExcluded: numStats.invalidCount,
      bins: [],
      min,
      max,
      mean: numStats.mean,
      median: numStats.median,
      isConstant: false,
    };
  }

  const desiredBins =
    config.binCount !== undefined && Number.isFinite(config.binCount)
      ? Math.min(
          MAX_HISTOGRAM_BINS,
          Math.max(MIN_HISTOGRAM_BINS, Math.floor(config.binCount)),
        )
      : computeAutoBinCount(validCount);

  const counts = new Uint32Array(desiredBins);
  const compiledMissing = compileMissingPolicy(profile.missingValuePolicy);
  const colIndex = colProfile.index;

  for (let r = 0; r < dataset.rows.length; r += 1) {
    const row = dataset.rows[r];
    const raw =
      row !== undefined && colIndex < row.length ? row[colIndex] : undefined;
    if (classifyMissingValue(raw, compiledMissing).kind !== 'present') {
      continue;
    }
    const num = classifyNumericValue(raw);
    if (
      !num.isValid ||
      num.numericValue === undefined ||
      !Number.isFinite(num.numericValue)
    ) {
      continue;
    }
    const v = num.numericValue;
    const rawIdx = Math.floor(((v - min) / span) * desiredBins);
    const binIdx = Math.min(desiredBins - 1, Math.max(0, rawIdx));
    counts[binIdx] = counts[binIdx]! + 1;
  }

  const binWidth = span / desiredBins;
  const bins: PreparedHistogramBin[] = new Array(desiredBins);

  for (let i = 0; i < desiredBins; i += 1) {
    const start = min + i * binWidth;
    const end = i === desiredBins - 1 ? max : min + (i + 1) * binWidth;
    const count = counts[i]!;
    bins[i] = {
      start,
      end,
      label: `${formatStatNumber(start, 2)}–${formatStatNumber(end, 2)}`,
      count,
      percentage: validCount > 0 ? (count / validCount) * 100 : 0,
      isLastInclusive: i === desiredBins - 1,
    };
  }

  return {
    type: 'histogram',
    status: 'ready',
    xColumnName: colProfile.name,
    totalRows: numStats.totalCount,
    validCount,
    missingExcluded: numStats.missingCount,
    invalidExcluded: numStats.invalidCount,
    bins,
    min,
    max,
    mean: numStats.mean,
    median: numStats.median,
    isConstant: false,
  };
}

function prepareLineChart(
  dataset: ImportedDataset,
  profile: DatasetProfileSummary,
  config: ChartConfig,
): PreparedLineChartData {
  const xProfile = profile.columns.find((c) => c.columnId === config.xColumnId);
  const yProfile = config.yColumnId
    ? profile.columns.find((c) => c.columnId === config.yColumnId)
    : undefined;

  if (
    !xProfile ||
    !yProfile ||
    (xProfile.detectedType !== 'date' && xProfile.detectedType !== 'numeric') ||
    yProfile.detectedType !== 'numeric' ||
    xProfile.columnId === yProfile.columnId
  ) {
    return {
      type: 'line',
      status: 'invalid_config',
      emptyReason:
        'Line charts require a date or numeric X-axis column paired with a different numeric Y-axis column.',
      xColumnName: xProfile?.name ?? 'Unknown',
      yColumnName: yProfile?.name ?? 'Unknown',
      totalRows: dataset.rowCount,
      validCount: 0,
      missingExcluded: 0,
      invalidExcluded: 0,
      xKind: xProfile?.detectedType === 'date' ? 'date' : 'numeric',
      points: [],
      originalPointCount: 0,
      isAggregated: false,
      isDownsampled: false,
      yMin: null,
      yMax: null,
    };
  }

  const xKind: 'date' | 'numeric' =
    xProfile.detectedType === 'date' ? 'date' : 'numeric';
  const compiledMissing = compileMissingPolicy(profile.missingValuePolicy);
  const resolvedDateConv =
    xKind === 'date' ? inferResolvedDateConvention(xProfile) : null;

  const xColIndex = xProfile.index;
  const yColIndex = yProfile.index;

  let validCount = 0;
  let missingExcluded = 0;
  let invalidExcluded = 0;

  // Group by exact X value to aggregate duplicate timestamps/X values deterministically
  const grouped = new Map<number, { sumY: number; count: number }>();

  for (let r = 0; r < dataset.rows.length; r += 1) {
    const row = dataset.rows[r];
    const rawX =
      row !== undefined && xColIndex < row.length ? row[xColIndex] : undefined;
    const rawY =
      row !== undefined && yColIndex < row.length ? row[yColIndex] : undefined;

    const xMiss = classifyMissingValue(rawX, compiledMissing).kind !== 'present';
    const yMiss = classifyMissingValue(rawY, compiledMissing).kind !== 'present';
    if (xMiss || yMiss) {
      missingExcluded += 1;
      continue;
    }

    const parsedX =
      xKind === 'date'
        ? parseDateCellToUtcMs(rawX, resolvedDateConv)
        : (() => {
            const num = classifyNumericValue(rawX);
            return num.isValid &&
              num.numericValue !== undefined &&
              Number.isFinite(num.numericValue)
              ? num.numericValue
              : null;
          })();

    const numY = classifyNumericValue(rawY);
    const parsedY =
      numY.isValid &&
      numY.numericValue !== undefined &&
      Number.isFinite(numY.numericValue)
        ? numY.numericValue
        : null;

    if (parsedX === null || parsedY === null) {
      invalidExcluded += 1;
      continue;
    }

    validCount += 1;
    const existing = grouped.get(parsedX);
    if (existing) {
      existing.sumY += parsedY;
      existing.count += 1;
    } else {
      grouped.set(parsedX, { sumY: parsedY, count: 1 });
    }
  }

  if (validCount === 0 || grouped.size === 0) {
    return {
      type: 'line',
      status: 'empty',
      emptyReason: `No valid paired (${xProfile.name}, ${yProfile.name}) records were available to plot.`,
      xColumnName: xProfile.name,
      yColumnName: yProfile.name,
      totalRows: dataset.rowCount,
      validCount: 0,
      missingExcluded,
      invalidExcluded,
      xKind,
      points: [],
      originalPointCount: 0,
      isAggregated: false,
      isDownsampled: false,
      yMin: null,
      yMax: null,
    };
  }

  const sortedXs = Array.from(grouped.keys()).sort((a, b) => a - b);
  const originalPointCount = sortedXs.length;
  const isAggregated = validCount > originalPointCount;

  let points: PreparedLinePoint[];
  let isDownsampled = false;

  if (originalPointCount > MAX_LINE_POINTS) {
    // Deterministic bucket-mean downsampling to <= MAX_LINE_POINTS
    isDownsampled = true;
    points = [];
    const bucketSize = originalPointCount / MAX_LINE_POINTS;
    for (let b = 0; b < MAX_LINE_POINTS; b += 1) {
      const start = Math.floor(b * bucketSize);
      const end = Math.min(originalPointCount, Math.floor((b + 1) * bucketSize));
      if (start >= end) continue;
      let sumX = 0;
      let sumY = 0;
      let totalSamples = 0;
      for (let i = start; i < end; i += 1) {
        const xv = sortedXs[i]!;
        const bucket = grouped.get(xv)!;
        sumX += xv * bucket.count;
        sumY += bucket.sumY;
        totalSamples += bucket.count;
      }
      const meanX = sumX / totalSamples;
      const meanY = sumY / totalSamples;
      points.push({
        xValue: meanX,
        xLabel:
          xKind === 'date'
            ? formatDateTick(meanX)
            : formatStatNumber(meanX, 2),
        yValue: meanY,
        sampleCount: totalSamples,
      });
    }
  } else {
    points = sortedXs.map((xv) => {
      const entry = grouped.get(xv)!;
      return {
        xValue: xv,
        xLabel:
          xKind === 'date' ? formatDateTick(xv) : formatStatNumber(xv, 2),
        yValue: entry.sumY / entry.count,
        sampleCount: entry.count,
      };
    });
  }

  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const y = points[i]!.yValue;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }

  return {
    type: 'line',
    status: 'ready',
    xColumnName: xProfile.name,
    yColumnName: yProfile.name,
    totalRows: dataset.rowCount,
    validCount,
    missingExcluded,
    invalidExcluded,
    xKind,
    points,
    originalPointCount,
    isAggregated,
    isDownsampled,
    yMin: Number.isFinite(yMin) ? yMin : null,
    yMax: Number.isFinite(yMax) ? yMax : null,
  };
}

function prepareScatterChart(
  dataset: ImportedDataset,
  profile: DatasetProfileSummary,
  config: ChartConfig,
): PreparedScatterChartData {
  const xProfile = profile.columns.find((c) => c.columnId === config.xColumnId);
  const yProfile = config.yColumnId
    ? profile.columns.find((c) => c.columnId === config.yColumnId)
    : undefined;

  if (
    !xProfile ||
    !yProfile ||
    xProfile.detectedType !== 'numeric' ||
    yProfile.detectedType !== 'numeric' ||
    xProfile.columnId === yProfile.columnId
  ) {
    return {
      type: 'scatter',
      status: 'invalid_config',
      emptyReason:
        'Scatter plots require two distinct columns classified as numeric by Module 03.',
      xColumnName: xProfile?.name ?? 'Unknown',
      yColumnName: yProfile?.name ?? 'Unknown',
      totalRows: dataset.rowCount,
      validCount: 0,
      missingExcluded: 0,
      invalidExcluded: 0,
      points: [],
      totalValidPairs: 0,
      isSampled: false,
      xMin: null,
      xMax: null,
      yMin: null,
      yMax: null,
    };
  }

  const compiledMissing = compileMissingPolicy(profile.missingValuePolicy);
  const xColIndex = xProfile.index;
  const yColIndex = yProfile.index;
  const rowCount = dataset.rows.length;

  // Compact typed buffers avoid allocating 100,000 JS objects when sampling large datasets
  const xs = new Float64Array(rowCount);
  const ys = new Float64Array(rowCount);
  const rowNums = new Uint32Array(rowCount);

  let validCount = 0;
  let missingExcluded = 0;
  let invalidExcluded = 0;
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;

  for (let r = 0; r < rowCount; r += 1) {
    const row = dataset.rows[r];
    const rawX =
      row !== undefined && xColIndex < row.length ? row[xColIndex] : undefined;
    const rawY =
      row !== undefined && yColIndex < row.length ? row[yColIndex] : undefined;

    const xMiss = classifyMissingValue(rawX, compiledMissing).kind !== 'present';
    const yMiss = classifyMissingValue(rawY, compiledMissing).kind !== 'present';
    if (xMiss || yMiss) {
      missingExcluded += 1;
      continue;
    }

    const numX = classifyNumericValue(rawX);
    const numY = classifyNumericValue(rawY);
    if (
      !numX.isValid ||
      numX.numericValue === undefined ||
      !Number.isFinite(numX.numericValue) ||
      !numY.isValid ||
      numY.numericValue === undefined ||
      !Number.isFinite(numY.numericValue)
    ) {
      invalidExcluded += 1;
      continue;
    }

    const xv = Object.is(numX.numericValue, -0) ? 0 : numX.numericValue;
    const yv = Object.is(numY.numericValue, -0) ? 0 : numY.numericValue;
    xs[validCount] = xv;
    ys[validCount] = yv;
    rowNums[validCount] = r + 1;
    validCount += 1;

    if (xv < xMin) xMin = xv;
    if (xv > xMax) xMax = xv;
    if (yv < yMin) yMin = yv;
    if (yv > yMax) yMax = yv;
  }

  if (validCount === 0) {
    return {
      type: 'scatter',
      status: 'empty',
      emptyReason: `No valid paired numeric observations exist for "${xProfile.name}" and "${yProfile.name}".`,
      xColumnName: xProfile.name,
      yColumnName: yProfile.name,
      totalRows: rowCount,
      validCount: 0,
      missingExcluded,
      invalidExcluded,
      points: [],
      totalValidPairs: 0,
      isSampled: false,
      xMin: null,
      xMax: null,
      yMin: null,
      yMax: null,
    };
  }

  // Deterministic uniform stride sampling when valid pairs exceed MAX_SCATTER_POINTS
  const isSampled = validCount > MAX_SCATTER_POINTS;
  const outputLength = isSampled ? MAX_SCATTER_POINTS : validCount;
  const points: PreparedScatterPoint[] = new Array(outputLength);

  if (isSampled) {
    for (let i = 0; i < MAX_SCATTER_POINTS; i += 1) {
      const idx = Math.floor((i * validCount) / MAX_SCATTER_POINTS);
      points[i] = {
        x: xs[idx]!,
        y: ys[idx]!,
        rowNumber: rowNums[idx]!,
      };
    }
  } else {
    for (let i = 0; i < validCount; i += 1) {
      points[i] = {
        x: xs[i]!,
        y: ys[i]!,
        rowNumber: rowNums[i]!,
      };
    }
  }

  return {
    type: 'scatter',
    status: 'ready',
    xColumnName: xProfile.name,
    yColumnName: yProfile.name,
    totalRows: rowCount,
    validCount,
    missingExcluded,
    invalidExcluded,
    points,
    totalValidPairs: validCount,
    isSampled,
    xMin,
    xMax,
    yMin,
    yMax,
  };
}

function prepareBoxPlotChart(
  profile: DatasetProfileSummary,
  stats: DatasetStatisticalSummary,
  config: ChartConfig,
): PreparedBoxPlotData {
  const colProfile = profile.columns.find(
    (c) => c.columnId === config.xColumnId,
  );
  if (!colProfile || colProfile.detectedType !== 'numeric') {
    return {
      type: 'boxplot',
      status: 'invalid_config',
      emptyReason:
        'Box plots require a column classified as numeric by Module 03.',
      xColumnName: colProfile?.name ?? 'Unknown',
      totalRows: profile.rowCount,
      validCount: 0,
      missingExcluded: 0,
      invalidExcluded: 0,
      min: null,
      q1: null,
      median: null,
      q3: null,
      max: null,
      mean: null,
      iqr: null,
    };
  }

  // 100% reuse of Module 04 exact quartiles — zero redundant dataset scan
  const numStats = stats.numericColumns.find(
    (c) => c.columnId === config.xColumnId,
  );

  if (
    !numStats ||
    !numStats.hasValidData ||
    numStats.min === null ||
    numStats.max === null
  ) {
    return {
      type: 'boxplot',
      status: 'empty',
      emptyReason: `Column "${colProfile.name}" has no valid numeric observations for a quartile box plot.`,
      xColumnName: colProfile.name,
      totalRows: profile.rowCount,
      validCount: 0,
      missingExcluded: numStats?.missingCount ?? colProfile.missingCount,
      invalidExcluded: numStats?.invalidCount ?? 0,
      min: null,
      q1: null,
      median: null,
      q3: null,
      max: null,
      mean: null,
      iqr: null,
    };
  }

  return {
    type: 'boxplot',
    status: 'ready',
    xColumnName: colProfile.name,
    totalRows: numStats.totalCount,
    validCount: numStats.validCount,
    missingExcluded: numStats.missingCount,
    invalidExcluded: numStats.invalidCount,
    min: numStats.min,
    q1: numStats.q1,
    median: numStats.median,
    q3: numStats.q3,
    max: numStats.max,
    mean: numStats.mean,
    iqr: numStats.iqr,
  };
}

/**
 * Pure, React-independent Module 06 chart data preparation entry point.
 * Reuses M03 column classifications and M04 statistics without mutating
 * source records or introducing divergent statistical formulas.
 */
export function prepareChartData(
  dataset: ImportedDataset,
  profile: DatasetProfileSummary,
  stats: DatasetStatisticalSummary,
  config: ChartConfig,
): PreparedChartData {
  switch (config.type) {
    case 'bar':
      return prepareBarChart(profile, stats, config);
    case 'histogram':
      return prepareHistogramChart(dataset, profile, stats, config);
    case 'line':
      return prepareLineChart(dataset, profile, config);
    case 'scatter':
      return prepareScatterChart(dataset, profile, config);
    case 'boxplot':
      return prepareBoxPlotChart(profile, stats, config);
  }
}
