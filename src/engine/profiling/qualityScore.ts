import type {
  DatasetColumnProfile,
  DatasetQualityAssessment,
  ImportedDataset,
  ProfileWarning,
  QualityDimensionScore,
  QualityGrade,
} from '@/types';

const WEIGHT_COMPLETENESS = 0.45;
const WEIGHT_TYPE_CONSISTENCY = 0.35;
const WEIGHT_STRUCTURAL_VALIDITY = 0.2;

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function toQualityGrade(score: number, isEmpty: boolean): QualityGrade {
  if (isEmpty) return 'Empty';
  if (score >= 90) return 'High';
  if (score >= 75) return 'Moderate';
  if (score >= 55) return 'Fair';
  return 'Poor';
}

export interface QualityScoreInput {
  readonly dataset: ImportedDataset;
  readonly columns: readonly DatasetColumnProfile[];
  readonly totalCells: number;
  readonly totalMissingCount: number;
  readonly warnings: readonly ProfileWarning[];
}

/**
 * Computes an explainable, deterministic DatasetQualityAssessment using
 * three documented dimensions:
 *   Overall = round(Completeness * 0.45 + TypeConsistency * 0.35 + StructuralValidity * 0.20)
 *
 * Architectural guarantees:
 * - Empty datasets (0 rows or 0 columns) ALWAYS score 0 (never a misleading 100).
 * - Statistical outliers are never treated as data-quality errors.
 */
export function computeDatasetQuality(
  input: QualityScoreInput,
): DatasetQualityAssessment {
  const { dataset, columns, totalCells, totalMissingCount, warnings } = input;
  const formulaDescription =
    'Weighted deterministic index: Completeness (45%) + Type Consistency (35%) + Structural Validity (20%).';

  const limitations: string[] = [
    'Measures structural completeness, schema consistency, and syntactic validity only — does not validate domain/business logic.',
    'Statistical outliers and skewed distributions are intentionally excluded from quality penalties (reserved for statistical analysis modules).',
    'Missingness counts reflect the active missing-value normalization policy.',
  ];

  // Guard: never assign a perfect or non-zero score to an empty dataset
  if (dataset.rowCount === 0 || dataset.columnCount === 0 || totalCells === 0) {
    const emptyDimensions: QualityDimensionScore[] = [
      {
        id: 'completeness',
        label: 'Completeness',
        score: 0,
        weight: WEIGHT_COMPLETENESS,
        weightedContribution: 0,
        explanation: 'No data cells are present to evaluate completeness.',
      },
      {
        id: 'type_consistency',
        label: 'Type Consistency',
        score: 0,
        weight: WEIGHT_TYPE_CONSISTENCY,
        weightedContribution: 0,
        explanation: 'No populated columns are available for type inference.',
      },
      {
        id: 'structural_validity',
        label: 'Structural Validity',
        score: 0,
        weight: WEIGHT_STRUCTURAL_VALIDITY,
        weightedContribution: 0,
        explanation:
          'Dataset contains zero data rows or zero columns and cannot be profiled.',
      },
    ];

    return {
      overallScore: 0,
      grade: 'Empty',
      dimensions: emptyDimensions,
      formulaDescription,
      limitations: [
        'Empty datasets automatically receive a score of 0 to prevent misleading quality indicators.',
        ...limitations,
      ],
    };
  }

  // 1. Completeness (45%): ratio of populated cells across the full dataset
  const completenessRaw = ((totalCells - totalMissingCount) / totalCells) * 100;
  const completenessScore = roundTwo(clampScore(completenessRaw));
  const populatedCells = totalCells - totalMissingCount;

  // 2. Type Consistency (35%): average per-column adherence to detected schema type
  // - All-missing or unknown/mixed columns contribute 0 consistency.
  // - Ambiguous date values receive 0.5 credit (recognized date shape, uncertain convention).
  let consistencySum = 0;
  let unknownColumnsCount = 0;
  let totalInvalidCells = 0;
  let totalAmbiguousDates = 0;

  for (const col of columns) {
    totalInvalidCells += col.invalidCount;
    if (col.dateStats) {
      totalAmbiguousDates += col.dateStats.ambiguousCount;
    }

    if (col.nonMissingCount === 0 || col.detectedType === 'unknown') {
      if (col.detectedType === 'unknown') {
        unknownColumnsCount += 1;
      }
      continue;
    }

    if (col.detectedType === 'date' && col.dateStats) {
      const effectiveValid =
        col.dateStats.validCount + col.dateStats.ambiguousCount * 0.5;
      consistencySum += clampScore(
        (effectiveValid / col.nonMissingCount) * 100,
      );
    } else {
      consistencySum += clampScore((col.validCount / col.nonMissingCount) * 100);
    }
  }

  const typeConsistencyScore = roundTwo(
    clampScore(columns.length > 0 ? consistencySum / columns.length : 0),
  );

  // 3. Structural Validity (20%): bounded deductions strictly for schema/structural defects
  let structuralDeductions = 0;
  const structuralReasons: string[] = [];

  const headerIssueCols = dataset.columns.filter(
    (c) => c.wasEmptyHeader || c.wasDuplicateHeader,
  ).length;
  if (headerIssueCols > 0) {
    const deduction = Math.min(30, headerIssueCols * 8);
    structuralDeductions += deduction;
    structuralReasons.push(
      `${headerIssueCols} header issue${headerIssueCols === 1 ? '' : 's'} (-${deduction})`,
    );
  }

  const allMissingCols = columns.filter((c) => c.nonMissingCount === 0).length;
  if (allMissingCols > 0) {
    const deduction = Math.min(36, allMissingCols * 12);
    structuralDeductions += deduction;
    structuralReasons.push(
      `${allMissingCols} completely empty column${allMissingCols === 1 ? '' : 's'} (-${deduction})`,
    );
  }

  const ambiguousDateCols = warnings.filter(
    (w) => w.code === 'AMBIGUOUS_DATES',
  ).length;
  if (ambiguousDateCols > 0) {
    const deduction = Math.min(24, ambiguousDateCols * 8);
    structuralDeductions += deduction;
    structuralReasons.push(
      `${ambiguousDateCols} ambiguous date column${ambiguousDateCols === 1 ? '' : 's'} (-${deduction})`,
    );
  }

  const hasInconsistentRows = dataset.warnings.some(
    (w) => w.code === 'INCONSISTENT_ROW_LENGTH',
  );
  if (hasInconsistentRows) {
    structuralDeductions += 15;
    structuralReasons.push('inconsistent row lengths (-15)');
  }

  const hasDelimiterSuspicion = dataset.warnings.some(
    (w) => w.code === 'SINGLE_COLUMN_OR_DELIMITER',
  );
  if (hasDelimiterSuspicion) {
    structuralDeductions += 15;
    structuralReasons.push('single-column delimiter ambiguity (-15)');
  }

  const structuralValidityScore = roundTwo(
    clampScore(100 - structuralDeductions),
  );

  const completenessContribution = roundTwo(
    completenessScore * WEIGHT_COMPLETENESS,
  );
  const typeConsistencyContribution = roundTwo(
    typeConsistencyScore * WEIGHT_TYPE_CONSISTENCY,
  );
  const structuralContribution = roundTwo(
    structuralValidityScore * WEIGHT_STRUCTURAL_VALIDITY,
  );

  const overallScore = Math.round(
    clampScore(
      completenessContribution +
        typeConsistencyContribution +
        structuralContribution,
    ),
  );

  const typeExplanationParts: string[] = [];
  if (unknownColumnsCount > 0) {
    typeExplanationParts.push(
      `${unknownColumnsCount} unclassifiable/mixed column${unknownColumnsCount === 1 ? '' : 's'}`,
    );
  }
  if (totalInvalidCells > 0) {
    typeExplanationParts.push(
      `${totalInvalidCells.toLocaleString('en-US')} non-conforming value${totalInvalidCells === 1 ? '' : 's'}`,
    );
  }
  if (totalAmbiguousDates > 0) {
    typeExplanationParts.push(
      `${totalAmbiguousDates.toLocaleString('en-US')} ambiguous date value${totalAmbiguousDates === 1 ? '' : 's'}`,
    );
  }

  const dimensions: QualityDimensionScore[] = [
    {
      id: 'completeness',
      label: 'Completeness',
      score: completenessScore,
      weight: WEIGHT_COMPLETENESS,
      weightedContribution: completenessContribution,
      explanation: `${populatedCells.toLocaleString('en-US')} of ${totalCells.toLocaleString('en-US')} cells populated (${totalMissingCount.toLocaleString('en-US')} missing).`,
    },
    {
      id: 'type_consistency',
      label: 'Type Consistency',
      score: typeConsistencyScore,
      weight: WEIGHT_TYPE_CONSISTENCY,
      weightedContribution: typeConsistencyContribution,
      explanation:
        typeExplanationParts.length > 0
          ? `Average column type conformance across ${columns.length} columns; reduced by ${typeExplanationParts.join(', ')}.`
          : `All non-missing values across ${columns.length} columns conform cleanly to their detected types.`,
    },
    {
      id: 'structural_validity',
      label: 'Structural Validity',
      score: structuralValidityScore,
      weight: WEIGHT_STRUCTURAL_VALIDITY,
      weightedContribution: structuralContribution,
      explanation:
        structuralReasons.length > 0
          ? `Deductions applied for ${structuralReasons.join(', ')}.`
          : 'Clean headers, uniform row lengths, and no structural schema defects detected.',
    },
  ];

  return {
    overallScore,
    grade: toQualityGrade(overallScore, false),
    dimensions,
    formulaDescription,
    limitations,
  };
}
