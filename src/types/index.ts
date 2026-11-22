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
