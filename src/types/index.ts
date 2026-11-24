/**
 * Data Detective — Core Foundational & Ingestion Types
 * Shared TypeScript contracts across design system primitives,
 * the React-independent analysis/ingestion engine, and feature modules.
 */

export type SemanticTone = 'analytical' | 'verified' | 'warning' | 'anomaly' | 'neutral';

export type SeverityLevel = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type ColumnDataType =
  | 'numeric'
  | 'categorical'
  | 'datetime'
  | 'boolean'
  | 'text'
  | 'unknown';

export type InvestigationStatus =
  | 'idle'
  | 'ingesting'
  | 'profiling'
  | 'ready'
  | 'error';

export interface DatasetColumnSchema {
  readonly id: string;
  readonly name: string;
  readonly inferredType: ColumnDataType;
  readonly nullable: boolean;
}

export interface DatasetDescriptor {
  readonly id: string;
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly columns: readonly DatasetColumnSchema[];
  readonly ingestedAt: string;
}

export interface EvidenceReference {
  readonly columnName: string;
  readonly rowIndices?: readonly number[];
  readonly metricLabel: string;
  readonly metricValue: string;
}

export interface AnalyticalFinding {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly severity: SeverityLevel;
  readonly evidence: readonly EvidenceReference[];
}

/* ── Module 02: Evidence Intake & Imported Dataset Model ──────────────── */

export type ImportedFileType = 'csv' | 'xlsx';

export interface ImportedColumn {
  readonly id: string;
  readonly name: string;
  readonly originalName: string;
  readonly index: number;
  readonly wasEmptyHeader: boolean;
  readonly wasDuplicateHeader: boolean;
}

export type IntakeWarningCode =
  | 'UTF8_BOM_STRIPPED'
  | 'EMPTY_HEADER'
  | 'DUPLICATE_HEADER'
  | 'INCONSISTENT_ROW_LENGTH'
  | 'NO_DATA_ROWS'
  | 'SINGLE_COLUMN_OR_DELIMITER'
  | 'CSV_MINOR_PARSE_WARNING';

export interface IntakeWarning {
  readonly code: IntakeWarningCode;
  readonly message: string;
  readonly details?: string;
}

export type IntakeErrorCode =
  | 'LEGACY_XLS_UNSUPPORTED'
  | 'UNSUPPORTED_EXTENSION'
  | 'FILE_TOO_LARGE'
  | 'EMPTY_FILE'
  | 'UNREADABLE_FILE'
  | 'INVALID_XLSX_SIGNATURE'
  | 'INVALID_CSV_CONTENT'
  | 'CORRUPTED_WORKBOOK'
  | 'NO_WORKSHEETS'
  | 'EMPTY_WORKSHEET'
  | 'MALFORMED_CSV'
  | 'ROW_LIMIT_EXCEEDED'
  | 'COLUMN_LIMIT_EXCEEDED'
  | 'CANCELLED';

export interface IntakeError {
  readonly code: IntakeErrorCode;
  readonly title: string;
  readonly message: string;
  readonly details?: string;
}

export interface WorksheetInfo {
  readonly name: string;
  readonly index: number;
  readonly estimatedRows: number;
  readonly estimatedColumns: number;
  readonly isEmpty: boolean;
}

export interface ParsedTableDraft {
  readonly fileName: string;
  readonly fileType: ImportedFileType;
  readonly fileSizeBytes: number;
  readonly sheetName?: string;
  readonly availableSheets?: readonly WorksheetInfo[];
  readonly hasHeaders: boolean;
  readonly delimiter?: string;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly columns: readonly ImportedColumn[];
  readonly rows: readonly (readonly unknown[])[];
  readonly warnings: readonly IntakeWarning[];
}

/**
 * Canonical active dataset representation stored in browser memory
 * and accessible to all future analytical modules.
 */
export interface ImportedDataset {
  readonly id: string;
  readonly fileName: string;
  readonly fileType: ImportedFileType;
  readonly fileSizeBytes: number;
  readonly sheetName?: string;
  readonly hasHeaders: boolean;
  readonly importedAt: number;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly columns: readonly ImportedColumn[];
  readonly rows: readonly (readonly unknown[])[];
  readonly warnings: readonly IntakeWarning[];
}

export type IntakeStage =
  | 'empty'
  | 'file_selected'
  | 'validating'
  | 'parsing'
  | 'worksheet_selection'
  | 'preview_ready'
  | 'importing'
  | 'import_success'
  | 'error';

/* ── Module 03: Dataset Schema Detection & Intelligent Profiling ────────── */

export type ProfileColumnType =
  | 'numeric'
  | 'categorical'
  | 'date'
  | 'boolean'
  | 'identifier'
  | 'unknown';

export type TypeConfidence = 'high' | 'medium' | 'low';

export type ProfilingStatus = 'idle' | 'profiling' | 'ready' | 'error';

export interface MissingValuePolicy {
  readonly treatEmptyStringAsMissing: boolean;
  readonly treatWhitespaceOnlyAsMissing: boolean;
  /** Case-insensitive trimmed string markers treated as missing values */
  readonly stringMarkers: readonly string[];
  /** Human-readable summary of the active missing-value policy */
  readonly description: string;
}

export interface NumericValidityStats {
  readonly validCount: number;
  readonly invalidCount: number;
  readonly integerCount: number;
  readonly decimalCount: number;
  readonly formattedStringCount: number;
  readonly hasLeadingZeros: boolean;
}

export interface DateDetectionStats {
  readonly validCount: number;
  readonly ambiguousCount: number;
  readonly invalidCount: number;
  readonly detectedFormats: readonly string[];
  readonly conventionNote?: string;
}

export interface CategoryFrequency {
  readonly value: string;
  readonly count: number;
  readonly percentage: number;
}

export type ProfileWarningCode =
  | 'EMPTY_DATASET'
  | 'ALL_MISSING'
  | 'HIGH_MISSING_RATE'
  | 'MIXED_TYPES'
  | 'AMBIGUOUS_DATES'
  | 'INVALID_DATES'
  | 'POSSIBLE_IDENTIFIER'
  | 'CONSTANT_COLUMN'
  | 'DUPLICATE_COLUMN_NAME'
  | 'EMPTY_HEADER'
  | 'MISSING_MARKER_NORMALIZED';

export interface ProfileWarning {
  readonly code: ProfileWarningCode;
  readonly severity: SeverityLevel;
  readonly columnId?: string;
  readonly columnName?: string;
  readonly title: string;
  readonly message: string;
}

export interface DatasetColumnProfile {
  readonly columnId: string;
  readonly name: string;
  readonly originalName: string;
  readonly index: number;
  readonly detectedType: ProfileColumnType;
  readonly confidence: TypeConfidence;
  readonly confidenceScore: number;
  readonly detectionReason: string;
  readonly totalCount: number;
  readonly nonMissingCount: number;
  readonly validCount: number;
  readonly invalidCount: number;
  readonly missingCount: number;
  readonly missingPercentage: number;
  readonly structuralMissingCount: number;
  readonly markerMissingCount: number;
  readonly matchedMissingMarkers: readonly string[];
  readonly uniqueCount: number;
  readonly duplicateCount: number;
  readonly distinctRatio: number;
  readonly sampleValues: readonly string[];
  readonly numericStats?: NumericValidityStats;
  readonly dateStats?: DateDetectionStats;
  readonly topCategories?: readonly CategoryFrequency[];
  readonly warnings: readonly ProfileWarning[];
}

export type QualityDimensionId =
  | 'completeness'
  | 'type_consistency'
  | 'structural_validity';

export interface QualityDimensionScore {
  readonly id: QualityDimensionId;
  readonly label: string;
  readonly score: number;
  readonly weight: number;
  readonly weightedContribution: number;
  readonly explanation: string;
}

export type QualityGrade = 'High' | 'Moderate' | 'Fair' | 'Poor' | 'Empty';

export interface DatasetQualityAssessment {
  readonly overallScore: number;
  readonly grade: QualityGrade;
  readonly dimensions: readonly QualityDimensionScore[];
  readonly formulaDescription: string;
  readonly limitations: readonly string[];
}

export interface DatasetProfileSummary {
  readonly datasetId: string;
  readonly fileName: string;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly totalCells: number;
  readonly totalMissingCount: number;
  readonly overallMissingPercentage: number;
  readonly typeDistribution: Readonly<Record<ProfileColumnType, number>>;
  readonly missingValuePolicy: MissingValuePolicy;
  readonly columns: readonly DatasetColumnProfile[];
  readonly quality: DatasetQualityAssessment;
  readonly warnings: readonly ProfileWarning[];
  readonly profiledAt: number;
  readonly durationMs: number;
}

/* ── Module 04: Statistical Analysis Engine ────────────────────────────── */

export type StatisticalAnalysisStatus = 'idle' | 'analyzing' | 'ready' | 'error';

export type NumericModeStatus = 'unimodal' | 'multimodal' | 'no_mode' | 'empty';

export interface NumericModeSummary {
  readonly status: NumericModeStatus;
  /** Sorted ascending numeric mode values (empty when status is 'no_mode' or 'empty') */
  readonly values: readonly number[];
  /** Occurrence count of each mode value (0 when empty, 1 when no_mode) */
  readonly frequency: number;
  /** Total count of tied modes before any display cap */
  readonly totalModeCount: number;
  /** True when tied modes exceeded the stored display cap */
  readonly isTruncated: boolean;
}

export interface NumericColumnStatistics {
  readonly columnId: string;
  readonly name: string;
  readonly originalName: string;
  readonly index: number;
  readonly totalCount: number;
  readonly validCount: number;
  readonly missingCount: number;
  readonly invalidCount: number;
  readonly excludedCount: number;
  readonly validPercentage: number;
  readonly distinctCount: number;
  readonly hasValidData: boolean;
  readonly mean: number | null;
  readonly median: number | null;
  readonly mode: NumericModeSummary;
  readonly min: number | null;
  readonly max: number | null;
  readonly range: number | null;
  readonly populationVariance: number | null;
  readonly sampleVariance: number | null;
  readonly populationStdDev: number | null;
  readonly sampleStdDev: number | null;
  readonly q1: number | null;
  readonly q2: number | null;
  readonly q3: number | null;
  readonly iqr: number | null;
}

export interface CategoricalDistributionEntry {
  readonly value: string;
  readonly count: number;
  /** Percentage of valid (non-missing, non-invalid) observations (0–100) */
  readonly percentage: number;
  /** Percentage of all dataset rows (0–100) */
  readonly percentageOfTotal: number;
}

export interface CategoricalExtremumSummary {
  readonly count: number;
  /** Percentage of valid observations for each tied category (0–100) */
  readonly percentage: number;
  /** Deterministically sorted tied category labels */
  readonly values: readonly string[];
  readonly isTie: boolean;
  /** Total count of tied categories before any display cap */
  readonly totalTiedCount: number;
  readonly isTruncated: boolean;
}

export interface CategoricalColumnStatistics {
  readonly columnId: string;
  readonly name: string;
  readonly originalName: string;
  readonly index: number;
  readonly totalCount: number;
  readonly validCount: number;
  readonly missingCount: number;
  readonly invalidCount: number;
  readonly excludedCount: number;
  readonly validPercentage: number;
  readonly distinctCount: number;
  readonly hasValidData: boolean;
  readonly isUniformDistribution: boolean;
  readonly mostFrequent: CategoricalExtremumSummary | null;
  readonly leastFrequent: CategoricalExtremumSummary | null;
  readonly distribution: readonly CategoricalDistributionEntry[];
  readonly isDistributionTruncated: boolean;
  readonly omittedCategoryCount: number;
  readonly omittedObservationCount: number;
}

export interface UnsupportedColumnStatistics {
  readonly columnId: string;
  readonly name: string;
  readonly originalName: string;
  readonly index: number;
  readonly detectedType: Exclude<ProfileColumnType, 'numeric' | 'categorical'>;
  readonly totalCount: number;
  readonly nonMissingCount: number;
  readonly missingCount: number;
  readonly reason: string;
}

export interface DatasetStatisticalOverview {
  readonly totalRows: number;
  readonly totalColumns: number;
  readonly numericColumnCount: number;
  readonly categoricalColumnCount: number;
  readonly unsupportedColumnCount: number;
  readonly analyzedColumnCount: number;
  readonly emptyNumericColumnCount: number;
  readonly emptyCategoricalColumnCount: number;
  readonly totalAnalyzedCells: number;
  readonly totalValidObservations: number;
  readonly totalMissingExcluded: number;
  readonly totalInvalidExcluded: number;
  readonly quartileMethod: string;
}

export interface DatasetStatisticalSummary {
  readonly datasetId: string;
  readonly fileName: string;
  readonly profiledAt: number;
  readonly missingValuePolicy: MissingValuePolicy;
  readonly overview: DatasetStatisticalOverview;
  readonly numericColumns: readonly NumericColumnStatistics[];
  readonly categoricalColumns: readonly CategoricalColumnStatistics[];
  readonly unsupportedColumns: readonly UnsupportedColumnStatistics[];
  readonly computedAt: number;
  readonly durationMs: number;
}

/* ── Module 05: Interactive Data Explorer ──────────────────────────────── */

export type ExplorerSortDirection = 'asc' | 'desc';

export interface ExplorerSortConfig {
  readonly columnId: string;
  readonly direction: ExplorerSortDirection;
}

export type ExplorerMissingFilterMode =
  | 'all'
  | 'exclude_missing'
  | 'only_missing';

export interface ExplorerColumnFilter {
  /** Case-insensitive substring match against the column's plain-text cell value */
  readonly textQuery?: string;
  /** Inclusive numeric lower bound (numeric columns) */
  readonly numericMin?: number | null;
  /** Inclusive numeric upper bound (numeric columns) */
  readonly numericMax?: number | null;
  /** Multi-selected exact category labels (categorical/boolean columns) */
  readonly selectedCategories?: readonly string[];
  /** Explicit missing-value filter aligned with Module 03 missing-value policy */
  readonly missingMode?: ExplorerMissingFilterMode;
}

export type ExplorerPageSize = 25 | 50 | 100 | 250;

export interface ExplorerCategoryOption {
  readonly value: string;
  readonly count: number;
}

export interface ExplorerQueryConfig {
  readonly globalSearch: string;
  readonly columnFilters: Readonly<Record<string, ExplorerColumnFilter>>;
  readonly sort: ExplorerSortConfig | null;
}

export interface ExplorerPageSlice {
  readonly page: number;
  readonly pageSize: ExplorerPageSize;
  readonly totalRows: number;
  readonly filteredRows: number;
  readonly totalPages: number;
  readonly startRowNumber: number;
  readonly endRowNumber: number;
  /** Original 0-based row indices into ImportedDataset.rows for the active page */
  readonly pageRowIndices: readonly number[];
}

/* ── Module 06: Visualization Studio ───────────────────────────────────── */

export type ChartType = 'bar' | 'histogram' | 'line' | 'scatter' | 'boxplot';

export type CategorySortOrder =
  | 'freq_desc'
  | 'freq_asc'
  | 'label_asc'
  | 'label_desc';

export interface ChartConfig {
  readonly id: string;
  readonly type: ChartType;
  readonly title: string;
  readonly xColumnId: string;
  readonly yColumnId?: string;
  readonly xAxisLabel: string;
  readonly yAxisLabel: string;
  readonly categorySort: CategorySortOrder;
  readonly maxCategories: number;
  readonly binCount?: number;
  readonly showLegend: boolean;
  readonly recommendationReason?: string;
}

export interface ChartRecommendation {
  readonly id: string;
  readonly type: ChartType;
  readonly title: string;
  readonly xColumnId: string;
  readonly yColumnId?: string;
  readonly xAxisLabel: string;
  readonly yAxisLabel: string;
  readonly reason: string;
  readonly priority: number;
}

export interface PreparedBarDatum {
  readonly label: string;
  readonly count: number;
  readonly percentage: number;
}

export interface PreparedHistogramBin {
  readonly start: number;
  readonly end: number;
  readonly label: string;
  readonly count: number;
  readonly percentage: number;
  readonly isLastInclusive: boolean;
}

export interface PreparedLinePoint {
  readonly xValue: number;
  readonly xLabel: string;
  readonly yValue: number;
  readonly sampleCount: number;
}

export interface PreparedScatterPoint {
  readonly x: number;
  readonly y: number;
  readonly rowNumber: number;
}

export type PreparedChartStatus = 'ready' | 'empty' | 'invalid_config';

interface PreparedChartBase {
  readonly status: PreparedChartStatus;
  readonly emptyReason?: string;
  readonly xColumnName: string;
  readonly yColumnName?: string;
  readonly totalRows: number;
  readonly validCount: number;
  readonly missingExcluded: number;
  readonly invalidExcluded: number;
}

export interface PreparedBarChartData extends PreparedChartBase {
  readonly type: 'bar';
  readonly bars: readonly PreparedBarDatum[];
  readonly distinctCount: number;
  readonly omittedCategoryCount: number;
  readonly omittedObservationCount: number;
}

export interface PreparedHistogramData extends PreparedChartBase {
  readonly type: 'histogram';
  readonly bins: readonly PreparedHistogramBin[];
  readonly min: number | null;
  readonly max: number | null;
  readonly mean: number | null;
  readonly median: number | null;
  readonly isConstant: boolean;
}

export interface PreparedLineChartData extends PreparedChartBase {
  readonly type: 'line';
  readonly xKind: 'date' | 'numeric';
  readonly points: readonly PreparedLinePoint[];
  readonly originalPointCount: number;
  readonly isAggregated: boolean;
  readonly isDownsampled: boolean;
  readonly yMin: number | null;
  readonly yMax: number | null;
}

export interface PreparedScatterChartData extends PreparedChartBase {
  readonly type: 'scatter';
  readonly points: readonly PreparedScatterPoint[];
  readonly totalValidPairs: number;
  readonly isSampled: boolean;
  readonly xMin: number | null;
  readonly xMax: number | null;
  readonly yMin: number | null;
  readonly yMax: number | null;
}

export interface PreparedBoxPlotData extends PreparedChartBase {
  readonly type: 'boxplot';
  readonly min: number | null;
  readonly q1: number | null;
  readonly median: number | null;
  readonly q3: number | null;
  readonly max: number | null;
  readonly mean: number | null;
  readonly iqr: number | null;
}

export type PreparedChartData =
  | PreparedBarChartData
  | PreparedHistogramData
  | PreparedLineChartData
  | PreparedScatterChartData
  | PreparedBoxPlotData;

/* ── Module 07: Insights & Anomaly Detection ───────────────────────────── */

export type InsightCategory =
  | 'data_quality'
  | 'numeric_outliers'
  | 'distribution'
  | 'categorical'
  | 'relationship'
  | 'structural';

export type InsightClassification =
  | 'data_quality_issue'
  | 'statistical_outlier'
  | 'notable_observation';

export type InsightSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type EvidenceStrength = 'high' | 'moderate' | 'preliminary';

export interface AnomalyDetectionConfig {
  /** Tukey IQR fence multiplier (default 1.5; common values 1.5, 2.0, 3.0) */
  readonly iqrMultiplier: number;
  /** Whether optional Z-score outlier detection is enabled */
  readonly enableZScore: boolean;
  /** Absolute Z-score threshold when Z-score detection is enabled (default 3.0) */
  readonly zScoreThreshold: number;
}

export interface InsightEvidenceMetric {
  readonly label: string;
  readonly value: string;
}

export interface RecordAnomalySample {
  /** Original 1-based row number in ImportedDataset */
  readonly rowNumber: number;
  /** Original 0-based row index in ImportedDataset.rows */
  readonly rowIndex: number;
  /** Preserved plain-text representation of the observed value */
  readonly value: string;
  readonly numericValue?: number;
  readonly zScore?: number;
  readonly iqrDistance?: number;
  readonly reason: string;
}

export interface InsightChartLink {
  readonly chartType: ChartType;
  readonly xColumnId: string;
  readonly yColumnId?: string;
  readonly title: string;
}

export interface DatasetInsight {
  readonly id: string;
  readonly category: InsightCategory;
  readonly classification: InsightClassification;
  readonly title: string;
  readonly explanation: string;
  readonly affectedColumnIds: readonly string[];
  readonly affectedColumnNames: readonly string[];
  readonly evidence: readonly InsightEvidenceMetric[];
  readonly severity: InsightSeverity;
  readonly confidence: EvidenceStrength;
  readonly suggestedAction: string;
  /** Bounded sample of individual anomalous rows (for record-level navigation) */
  readonly recordAnomalies?: readonly RecordAnomalySample[];
  /** Total anomalous records detected before sample cap */
  readonly totalAnomalyCount?: number;
  /** Optional associated visualization deep-link */
  readonly recommendedChart?: InsightChartLink;
}

export interface DatasetInvestigationOverview {
  readonly totalFindings: number;
  readonly dataQualityIssueCount: number;
  readonly statisticalOutlierCount: number;
  readonly notableObservationCount: number;
  readonly affectedColumnCount: number;
  readonly totalRecordAnomalies: number;
  readonly bySeverity: Readonly<Record<InsightSeverity, number>>;
  readonly byCategory: Readonly<Record<InsightCategory, number>>;
}

export interface DatasetInvestigationSummary {
  readonly datasetId: string;
  readonly fileName: string;
  readonly profiledAt: number;
  readonly computedAt: number;
  readonly durationMs: number;
  readonly config: AnomalyDetectionConfig;
  readonly insights: readonly DatasetInsight[];
  readonly overview: DatasetInvestigationOverview;
}




