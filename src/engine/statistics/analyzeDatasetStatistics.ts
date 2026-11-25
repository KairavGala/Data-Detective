import { compileMissingPolicy } from '@/engine/profiling';
import type {
  CategoricalColumnStatistics,
  DatasetColumnProfile,
  DatasetProfileSummary,
  DatasetStatisticalSummary,
  ImportedColumn,
  ImportedDataset,
  NumericColumnStatistics,
  ProfileColumnType,
  UnsupportedColumnStatistics,
} from '@/types';
import {
  computeCategoricalColumnStatistics,
  DEFAULT_MAX_DISTRIBUTION_CATEGORIES,
  DEFAULT_MAX_TIED_EXTREMA,
} from './categoricalStatistics';
import {
  computeNumericColumnStatistics,
  DEFAULT_MAX_MODES,
  QUARTILE_METHOD_LABEL,
} from './numericStatistics';

export interface AnalyzeDatasetStatisticsOptions {
  readonly maxModes?: number;
  readonly maxCategories?: number;
  readonly maxTiedExtrema?: number;
}

function describeUnsupportedReason(
  colProfile: DatasetColumnProfile,
  detectedType: Exclude<ProfileColumnType, 'numeric' | 'categorical'>,
): string {
  switch (detectedType) {
    case 'identifier':
      return 'Classified as an identifier during schema profiling; entity keys and codes are excluded from numeric and categorical statistical aggregation.';
    case 'date':
      return 'Classified as a date column during schema profiling; chronological and time-series statistics are outside numeric and categorical aggregation scope.';
    case 'boolean':
      return 'Classified as a boolean column during schema profiling; binary flag columns are listed separately from continuous numeric and general categorical statistics.';
    case 'unknown':
      return colProfile.nonMissingCount === 0
        ? 'Column contains no populated values under the active missing-value policy (classified as unknown).'
        : 'Classified as unknown due to mixed incompatible value types; excluded to avoid misleading statistical summaries.';
  }
}

/**
 * Pure, React-independent Module 04 statistical analysis orchestrator.
 *
 * Architectural guarantees:
 * - Relies exclusively on Module 03 column classifications (`profile.columns`)
 *   and `profile.missingValuePolicy` (never introduces conflicting type detection).
 * - Never mutates `dataset`, `dataset.columns`, `dataset.rows`, or `profile`.
 * - Reuses a single Float64Array scratch buffer across numeric columns to keep
 *   peak memory low (~0.8 MB at 100,000 rows) and scans each analyzed column once.
 */
export function analyzeDatasetStatistics(
  dataset: ImportedDataset,
  profile: DatasetProfileSummary,
  options: AnalyzeDatasetStatisticsOptions = {},
): DatasetStatisticalSummary {
  if (profile.datasetId !== dataset.id) {
    throw new Error(
      `Cannot compute statistics: profile datasetId ("${profile.datasetId}") does not match active dataset ("${dataset.id}").`,
    );
  }

  const startMs =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  const compiledMissing = compileMissingPolicy(profile.missingValuePolicy);

  // Map columnId -> ImportedColumn for O(1) authoritative lookup
  const columnById = new Map<string, ImportedColumn>();
  for (let i = 0; i < dataset.columns.length; i += 1) {
    const col = dataset.columns[i]!;
    columnById.set(col.id, col);
  }

  const numericColumns: NumericColumnStatistics[] = [];
  const categoricalColumns: CategoricalColumnStatistics[] = [];
  const unsupportedColumns: UnsupportedColumnStatistics[] = [];

  const hasNumericColumns = profile.columns.some(
    (c) => c.detectedType === 'numeric',
  );
  // Allocate one reusable scratch buffer across all numeric columns
  const numericScratch =
    hasNumericColumns && dataset.rows.length > 0
      ? new Float64Array(dataset.rows.length)
      : undefined;

  let emptyNumericColumnCount = 0;
  let emptyCategoricalColumnCount = 0;
  let totalValidObservations = 0;
  let totalMissingExcluded = 0;
  let totalInvalidExcluded = 0;

  for (let i = 0; i < profile.columns.length; i += 1) {
    const colProfile = profile.columns[i]!;
    const sourceColumn =
      columnById.get(colProfile.columnId) ?? dataset.columns[colProfile.index];

    if (!sourceColumn) {
      continue;
    }

    if (colProfile.detectedType === 'numeric') {
      const stats = computeNumericColumnStatistics(
        sourceColumn,
        dataset.rows,
        compiledMissing,
        numericScratch,
        {
          maxModes: options.maxModes ?? DEFAULT_MAX_MODES,
        },
      );
      numericColumns.push(stats);
      if (!stats.hasValidData) {
        emptyNumericColumnCount += 1;
      }
      totalValidObservations += stats.validCount;
      totalMissingExcluded += stats.missingCount;
      totalInvalidExcluded += stats.invalidCount;
    } else if (colProfile.detectedType === 'categorical') {
      const stats = computeCategoricalColumnStatistics(
        sourceColumn,
        dataset.rows,
        compiledMissing,
        {
          maxCategories:
            options.maxCategories ?? DEFAULT_MAX_DISTRIBUTION_CATEGORIES,
          maxTiedExtrema: options.maxTiedExtrema ?? DEFAULT_MAX_TIED_EXTREMA,
        },
      );
      categoricalColumns.push(stats);
      if (!stats.hasValidData) {
        emptyCategoricalColumnCount += 1;
      }
      totalValidObservations += stats.validCount;
      totalMissingExcluded += stats.missingCount;
      totalInvalidExcluded += stats.invalidCount;
    } else {
      unsupportedColumns.push({
        columnId: colProfile.columnId,
        name: colProfile.name,
        originalName: colProfile.originalName,
        index: colProfile.index,
        detectedType: colProfile.detectedType,
        totalCount: colProfile.totalCount,
        nonMissingCount: colProfile.nonMissingCount,
        missingCount: colProfile.missingCount,
        reason: describeUnsupportedReason(colProfile, colProfile.detectedType),
      });
    }
  }

  const analyzedColumnCount = numericColumns.length + categoricalColumns.length;
  const totalAnalyzedCells = analyzedColumnCount * dataset.rowCount;

  const endMs =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    datasetId: dataset.id,
    fileName: dataset.fileName,
    profiledAt: profile.profiledAt,
    missingValuePolicy: profile.missingValuePolicy,
    overview: {
      totalRows: dataset.rowCount,
      totalColumns: dataset.columnCount,
      numericColumnCount: numericColumns.length,
      categoricalColumnCount: categoricalColumns.length,
      unsupportedColumnCount: unsupportedColumns.length,
      analyzedColumnCount,
      emptyNumericColumnCount,
      emptyCategoricalColumnCount,
      totalAnalyzedCells,
      totalValidObservations,
      totalMissingExcluded,
      totalInvalidExcluded,
      quartileMethod: QUARTILE_METHOD_LABEL,
    },
    numericColumns,
    categoricalColumns,
    unsupportedColumns,
    computedAt: Date.now(),
    durationMs: Math.max(0, Math.round(endMs - startMs)),
  };
}
