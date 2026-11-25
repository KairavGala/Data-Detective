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

/* ── Module 08: AI Investigation & Intelligence ─────────────────────────── */

export type AiAnswerSupportType =
  | 'directly_supported'
  | 'reasonable_interpretation'
  | 'insufficient_evidence';

export type AiRecommendationPriority = 'high' | 'medium' | 'low';

export type AiDestinationType = 'explorer' | 'visualizations' | 'investigation';

export interface InvestigationContextCategorySummary {
  readonly value: string;
  readonly count: number;
  readonly percentage: number;
}

export interface InvestigationContextNumericSummary {
  readonly validCount: number;
  readonly mean: number | null;
  readonly median: number | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly range: number | null;
  readonly sampleStdDev: number | null;
  readonly q1: number | null;
  readonly q3: number | null;
  readonly iqr: number | null;
  readonly modeStatus: NumericModeStatus;
}

export interface InvestigationContextCategoricalSummary {
  readonly validCount: number;
  readonly distinctCount: number;
  readonly isUniform: boolean;
  readonly topCategories: readonly InvestigationContextCategorySummary[];
}

export interface InvestigationContextColumn {
  readonly columnId: string;
  readonly name: string;
  readonly detectedType: ProfileColumnType;
  readonly confidence: TypeConfidence;
  readonly missingPercentage: number;
  readonly invalidCount: number;
  readonly uniqueCount: number;
  readonly distinctRatio: number;
  readonly numericSummary?: InvestigationContextNumericSummary;
  readonly categoricalSummary?: InvestigationContextCategoricalSummary;
}

export interface InvestigationContextFinding {
  readonly id: string;
  readonly category: InsightCategory;
  readonly classification: InsightClassification;
  readonly severity: InsightSeverity;
  readonly confidence: EvidenceStrength;
  readonly title: string;
  readonly explanation: string;
  readonly affectedColumnIds: readonly string[];
  readonly evidence: readonly InsightEvidenceMetric[];
  readonly totalAnomalyCount?: number;
  readonly recommendedChartType?: ChartType;
}

export interface InvestigationContextRelationship {
  readonly findingId: string;
  readonly columnIds: readonly [string, string];
  readonly columnNames: readonly [string, string];
  readonly metricSummary: string;
}

export interface InvestigationContextChartAvailability {
  readonly chartType: ChartType;
  readonly xColumnId: string;
  readonly yColumnId?: string;
  readonly title: string;
}

export interface InvestigationContextMeta {
  readonly truncated: boolean;
  readonly reductionNotes: readonly string[];
  readonly includedColumnCount: number;
  readonly totalColumnCount: number;
  readonly includedFindingCount: number;
  readonly totalFindingCount: number;
  readonly serializedCharCount: number;
}

/**
 * Privacy-safe, aggregate-only context payload transmitted to `/api/ai/investigate`.
 * Strictly excludes raw spreadsheet rows, full CSV/XLSX contents, sample cell
 * values from free-text/identifier columns, and record-level anomaly samples.
 */
export interface InvestigationContextPayload {
  readonly dataset: {
    readonly fileName: string;
    readonly rowCount: number;
    readonly columnCount: number;
    readonly totalCells: number;
    readonly overallMissingPercentage: number;
    readonly qualityScore: number;
    readonly qualityGrade: QualityGrade;
    readonly qualityDimensions: readonly {
      readonly label: string;
      readonly score: number;
    }[];
    readonly missingPolicySummary: string;
    readonly typeDistribution: Readonly<Record<ProfileColumnType, number>>;
  };
  readonly columns: readonly InvestigationContextColumn[];
  readonly findings: readonly InvestigationContextFinding[];
  readonly numericRelationships: readonly InvestigationContextRelationship[];
  readonly availableCharts: readonly InvestigationContextChartAvailability[];
  readonly contextMeta: InvestigationContextMeta;
}

export interface AiMajorFindingInterpretation {
  readonly title: string;
  readonly interpretation: string;
  readonly whyItMatters: string;
  readonly supportingFindingIds: readonly string[];
  readonly relevantColumnIds: readonly string[];
}

export interface AiInvestigationBrief {
  readonly executiveSummary: string;
  readonly majorFindings: readonly AiMajorFindingInterpretation[];
  readonly dataQualityAssessment: string;
  readonly relationshipsAndPatterns: string;
  readonly potentialRisks: readonly string[];
  readonly recommendedNextSteps: readonly string[];
  readonly confidenceAndLimitations: string;
}

export interface AiCrossFindingConnection {
  readonly id: string;
  readonly title: string;
  readonly findingIds: readonly string[];
  readonly columnIds: readonly string[];
  readonly evidenceSummary: string;
  readonly possibleInterpretation: string;
  readonly alternativeExplanations: readonly string[];
  readonly confidence: EvidenceStrength;
  readonly suggestedInvestigation: string;
}

export interface AiRecommendedInvestigation {
  readonly id: string;
  readonly title: string;
  readonly reason: string;
  readonly supportingFindingIds: readonly string[];
  readonly relevantColumnIds: readonly string[];
  readonly priority: AiRecommendationPriority;
  readonly destinationType: AiDestinationType;
  readonly destinationUrl: string;
  readonly whatToLookFor: string;
}

export interface AiBriefGenerationData {
  readonly brief: AiInvestigationBrief;
  readonly connections: readonly AiCrossFindingConnection[];
  readonly recommendations: readonly AiRecommendedInvestigation[];
}

export interface AiDatasetQuestionHistoryItem {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface AiDatasetAnswerData {
  readonly answer: string;
  readonly supportType: AiAnswerSupportType;
  readonly referencedFindingIds: readonly string[];
  readonly referencedColumnIds: readonly string[];
  readonly caveats: readonly string[];
  readonly suggestedFollowUps: readonly string[];
}

export interface AiInvestigationResponseMeta {
  readonly model: string;
  readonly durationMs: number;
  readonly sdkAttemptsConfigured: number;
  readonly generatedAt: string;
  readonly contextCharCount?: number;
  readonly strippedInvalidFindingRefs?: number;
  readonly strippedInvalidColumnRefs?: number;
  readonly timeoutPhase?: 'gemini_sdk' | 'backend_deadline';
  readonly upstreamStatus?: number;
}

export interface AiConversationTurn {
  readonly id: string;
  readonly question: string;
  readonly askedAt: number;
  readonly status: 'pending' | 'answered' | 'error';
  readonly answer?: AiDatasetAnswerData;
  readonly meta?: AiInvestigationResponseMeta;
  readonly errorMessage?: string;
  readonly errorCode?: string;
  readonly retryable?: boolean;
}

export interface AiHealthStatus {
  readonly ok: boolean;
  readonly configured: boolean;
  readonly investigationEnabled: boolean;
  readonly prototypeEnabled: boolean;
  readonly model: string;
  readonly sdkAttemptsConfigured: number;
  readonly timeouts: {
    readonly geminiTimeoutMs: number;
    readonly handlerTimeoutMs: number;
    readonly frontendRecommendedTimeoutMs: number;
    readonly vercelMaxDurationSec: number;
  };
}

/* ── Module 09: Integrated Investigation Center ─────────────────────────── */

export type InvestigationCaseStatus =
  | 'open'
  | 'in_progress'
  | 'under_review'
  | 'resolved';

export type InvestigationCasePriority = 'critical' | 'high' | 'medium' | 'low';

export type CaseEvidenceType =
  | 'finding'
  | 'column'
  | 'statistic'
  | 'visualization'
  | 'related_finding';

export interface CaseEvidenceItem {
  readonly id: string;
  readonly type: CaseEvidenceType;
  readonly title: string;
  readonly sourceRef: string;
  readonly description: string;
  readonly addedAt: number;
  readonly destinationUrl: string;
  readonly findingId?: string;
  readonly columnIds?: readonly string[];
  readonly chartLink?: InsightChartLink;
}

export type CaseNoteType =
  | 'observation'
  | 'hypothesis'
  | 'question'
  | 'conclusion';

export interface CaseNote {
  readonly id: string;
  readonly type: CaseNoteType;
  readonly text: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly supportingEvidenceIds: readonly string[];
}

export type CaseTimelineEventType =
  | 'case_created'
  | 'case_updated'
  | 'finding_attached'
  | 'finding_detached'
  | 'evidence_added'
  | 'evidence_removed'
  | 'note_created'
  | 'note_edited'
  | 'note_deleted'
  | 'ai_analysis_generated'
  | 'priority_changed'
  | 'status_changed'
  | 'case_resolved'
  | 'case_archived'
  | 'case_reopened'
  | 'conclusion_updated';

export interface CaseTimelineEvent {
  readonly id: string;
  readonly type: CaseTimelineEventType;
  readonly label: string;
  readonly detail?: string;
  readonly timestamp: number;
}

export interface CaseAiEvidenceSummary {
  readonly type: CaseEvidenceType;
  readonly title: string;
  readonly sourceRef: string;
}

export interface CaseAiRequestInfo {
  readonly caseTitle: string;
  readonly caseDescription: string;
  readonly selectedFindingIds: readonly string[];
  readonly evidenceItems: readonly CaseAiEvidenceSummary[];
  readonly userQuestion?: string;
  readonly priorBriefSummary?: string;
}

export interface AiCaseAnalysisData {
  readonly evidenceAssessment: string;
  readonly possibleConnections: readonly string[];
  readonly alternativeExplanations: readonly string[];
  readonly additionalEvidenceToExamine: readonly string[];
  readonly supportedConclusions: readonly string[];
  readonly unansweredQuestions: readonly string[];
  readonly supportType: AiAnswerSupportType;
  readonly referencedFindingIds: readonly string[];
  readonly referencedColumnIds: readonly string[];
  readonly caveats: readonly string[];
}

export interface CaseAiAnalysisRecord {
  readonly id: string;
  readonly generatedAt: string;
  readonly question: string;
  readonly model: string;
  readonly durationMs: number;
  readonly contextCharCount?: number;
  readonly data: AiCaseAnalysisData;
}

export interface InvestigationCase {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly datasetId: string;
  readonly datasetFileName: string;
  readonly datasetProfiledAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status: InvestigationCaseStatus;
  readonly priority: InvestigationCasePriority;
  readonly archived: boolean;
  readonly archivedAt?: number;
  readonly findingIds: readonly string[];
  readonly evidence: readonly CaseEvidenceItem[];
  readonly notes: readonly CaseNote[];
  readonly conclusion: string;
  readonly aiAnalyses: readonly CaseAiAnalysisRecord[];
  readonly timeline: readonly CaseTimelineEvent[];
}

/* ── Module 10: Investigation Reports & Dossiers ───────────────────────── */

export type ReportType =
  | 'dataset_analysis'
  | 'data_quality'
  | 'investigation_dossier'
  | 'statistical_analysis'
  | 'custom';

export type ReportSourceKind = 'dataset' | 'case' | 'findings';

export type ReportSectionKey =
  | 'cover'
  | 'executive_summary'
  | 'dataset_overview'
  | 'methodology'
  | 'statistical_findings'
  | 'insights_anomalies'
  | 'visualizations'
  | 'investigation_case'
  | 'ai_interpretation'
  | 'limitations_conclusion';

export interface ReportSectionConfig {
  readonly key: ReportSectionKey;
  readonly title: string;
  readonly enabled: boolean;
  readonly customNote?: string;
}

export interface ReportAiInclusion {
  readonly includeModule08Brief: boolean;
  readonly includeModule09CaseAnalyses: boolean;
}

export interface ReportDatasetOverviewSnapshot {
  readonly fileName: string;
  readonly fileType: string;
  readonly fileSizeBytes: number;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly totalCells: number;
  readonly totalMissingCount: number;
  readonly overallMissingPercentage: number;
  readonly qualityScore: number;
  readonly qualityGrade: string;
  readonly qualitySummary: string;
  readonly typeDistribution: Readonly<Record<ProfileColumnType, number>>;
  readonly warningCount: number;
  readonly missingValuePolicyNote: string;
  readonly columns: readonly {
    readonly columnId: string;
    readonly name: string;
    readonly detectedType: ProfileColumnType;
    readonly confidence: string;
    readonly missingCount: number;
    readonly missingPercentage: number;
    readonly uniqueCount: number;
  }[];
}

export interface ReportFindingSnapshot {
  readonly id: string;
  readonly title: string;
  readonly category: InsightCategory;
  readonly severity: InsightSeverity;
  readonly classification: InsightClassification;
  readonly affectedColumnIds: readonly string[];
  readonly affectedColumnNames: readonly string[];
  readonly evidenceMetrics: readonly InsightEvidenceMetric[];
  readonly explanation: string;
}

export interface ReportChartSnapshot {
  readonly config: ChartConfig;
  readonly prepared: PreparedChartData;
  readonly caption: string;
}

export interface ReportModule08BriefSnapshot {
  readonly datasetId: string;
  readonly profiledAt: number;
  readonly generatedAt: string;
  readonly model: string;
  readonly data: AiBriefGenerationData;
}

export interface ReportSourceSnapshot {
  readonly datasetOverview: ReportDatasetOverviewSnapshot;
  readonly numericStats: readonly NumericColumnStatistics[];
  readonly categoricalStats: readonly CategoricalColumnStatistics[];
  readonly findings: readonly ReportFindingSnapshot[];
  readonly charts: readonly ReportChartSnapshot[];
  readonly caseSnapshot?: InvestigationCase;
  readonly module08Brief?: ReportModule08BriefSnapshot;
}

export interface InvestigationReport {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly author: string;
  readonly introDescription: string;
  readonly reportType: ReportType;
  readonly sourceKind: ReportSourceKind;
  readonly datasetId: string;
  readonly datasetFileName: string;
  readonly datasetProfiledAt: number;
  readonly caseId?: string;
  readonly caseTitle?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly sections: readonly ReportSectionConfig[];
  readonly selectedFindingIds: readonly string[];
  readonly selectedStatColumnIds: readonly string[];
  readonly selectedCharts: readonly ChartConfig[];
  readonly aiInclusion: ReportAiInclusion;
  readonly customLimitations?: string;
  readonly customConclusion?: string;
  readonly snapshot: ReportSourceSnapshot;
}

export interface ReportMethodologyItem {
  readonly id: string;
  readonly name: string;
  readonly scope: string;
  readonly description: string;
}

export interface CompiledReportDocument {
  readonly report: InvestigationReport;
  readonly isActiveDatasetMatch: boolean;
  readonly generatedAt: number;
  readonly activeSections: readonly ReportSectionConfig[];
  readonly executiveSummary: {
    readonly deterministicSummary: string;
    readonly aiBriefSummary?: string;
    readonly aiBriefModel?: string;
    readonly aiBriefGeneratedAt?: string;
    readonly keyHighlights: readonly string[];
  };
  readonly datasetOverview: ReportDatasetOverviewSnapshot;
  readonly methodology: readonly ReportMethodologyItem[];
  readonly numericStats: readonly NumericColumnStatistics[];
  readonly categoricalStats: readonly CategoricalColumnStatistics[];
  readonly findings: readonly ReportFindingSnapshot[];
  readonly charts: readonly ReportChartSnapshot[];
  readonly investigationCase?: InvestigationCase;
  readonly aiInterpretations: {
    readonly module08Brief?: ReportModule08BriefSnapshot;
    readonly module09CaseAnalyses: readonly CaseAiAnalysisRecord[];
  };
  readonly limitations: {
    readonly dataLimitations: readonly string[];
    readonly analyticalLimitations: readonly string[];
    readonly unansweredQuestions: readonly string[];
    readonly supportedConclusions: readonly string[];
  };
}
