/**
 * Data Detective — Module 08 Aggregate-Only Investigation Context Builder
 *
 * Pure, React-independent module that compiles deterministic Module 02–07
 * metadata and aggregate statistics into a compact, bounded JSON payload for
 * server-side Gemini investigation.
 *
 * Privacy invariants:
 * - NEVER reads or includes raw spreadsheet rows (`dataset.rows`).
 * - NEVER includes M03 free-text/identifier `sampleValues` (potential PII).
 * - NEVER includes M07 `recordAnomalies` (row-level values or row indices).
 * - Treats all column names, file names, and category labels as untrusted data
 *   by sanitizing control characters and strictly capping lengths.
 * - Deterministic multi-stage reduction guarantees valid JSON strictly within
 *   `maxChars` (hard cap 20,000 serialized characters) without slicing JSON.
 */

import { generateChartRecommendations } from '@/engine/visualization';
import type {
  CategoricalColumnStatistics,
  DatasetInsight,
  DatasetInvestigationSummary,
  DatasetProfileSummary,
  DatasetStatisticalSummary,
  InsightSeverity,
  InvestigationContextCategorySummary,
  InvestigationContextChartAvailability,
  InvestigationContextColumn,
  InvestigationContextFinding,
  InvestigationContextPayload,
  InvestigationContextRelationship,
  NumericColumnStatistics,
} from '@/types';

export const MAX_CONTEXT_COLUMNS = 100;
export const MAX_CONTEXT_FINDINGS = 100;
export const MAX_CONTEXT_CATEGORIES_PER_COLUMN = 20;
export const MAX_CONTEXT_RELATIONSHIPS = 20;
export const MAX_CONTEXT_CHARTS = 12;
export const HARD_MAX_CONTEXT_CHARS = 20_000;
export const DEFAULT_BRIEF_TARGET_CHARS = 18_000;
export const DEFAULT_QUESTION_TARGET_CHARS = 12_000;

const MAX_FILENAME_CHARS = 140;
const MAX_COL_NAME_CHARS = 80;
const MAX_CATEGORY_LABEL_CHARS = 60;
const MAX_POLICY_SUMMARY_CHARS = 220;
const MAX_FINDING_TITLE_CHARS = 140;
const MAX_EVIDENCE_VALUE_CHARS = 80;
const MAX_EVIDENCE_ITEMS = 6;

const SEVERITY_PRIORITY: Readonly<Record<InsightSeverity, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export interface BuildInvestigationContextOptions {
  /**
   * Maximum serialized JSON character budget. Clamped strictly to <= 20,000.
   * Defaults to 18,000 for briefs and 12,000 for follow-up questions.
   */
  readonly maxChars?: number;
  readonly maxColumns?: number;
  readonly maxFindings?: number;
  readonly maxCategoriesPerColumn?: number;
  readonly maxRelationships?: number;
  readonly maxCharts?: number;
}

/**
 * Strips ASCII control characters / newlines and collapses whitespace so
 * untrusted column names or category labels cannot inject prompt delimiters.
 */
function sanitizeUntrustedLabel(raw: string, maxLength: number): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(1, maxLength - 1))}…`;
}

function roundCompact(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  if (Math.abs(value) >= 1_000_000 || (value !== 0 && Math.abs(value) < 0.0001)) {
    return Number(value.toPrecision(6));
  }
  return Math.round(value * 10_000) / 10_000;
}

function roundPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function buildNumericSummary(stat: NumericColumnStatistics) {
  return {
    validCount: stat.validCount,
    mean: roundCompact(stat.mean),
    median: roundCompact(stat.median),
    min: roundCompact(stat.min),
    max: roundCompact(stat.max),
    range: roundCompact(stat.range),
    sampleStdDev: roundCompact(stat.sampleStdDev),
    q1: roundCompact(stat.q1),
    q3: roundCompact(stat.q3),
    iqr: roundCompact(stat.iqr),
    modeStatus: stat.mode.status,
  };
}

function buildCategoricalSummary(
  stat: CategoricalColumnStatistics,
  distinctRatio: number,
  maxCategories: number,
): {
  readonly validCount: number;
  readonly distinctCount: number;
  readonly isUniform: boolean;
  readonly topCategories: readonly InvestigationContextCategorySummary[];
} {
  const boundedCount = Math.max(
    0,
    Math.min(maxCategories, MAX_CONTEXT_CATEGORIES_PER_COLUMN),
  );

  // Privacy guard: suppress raw label values on near-unique high-cardinality
  // text columns (potential PII such as notes, emails, or IDs) and omit
  // singleton-only labels when distinctRatio >= 0.8.
  const isLikelyFreeTextOrUnique =
    stat.distinctCount >= 10 && distinctRatio >= 0.8;

  const topCategories: InvestigationContextCategorySummary[] =
    isLikelyFreeTextOrUnique
      ? []
      : stat.distribution
          .filter((entry) => entry.count >= 2 || stat.distinctCount <= 10)
          .slice(0, boundedCount)
          .map((entry) => ({
            value: sanitizeUntrustedLabel(entry.value, MAX_CATEGORY_LABEL_CHARS),
            count: entry.count,
            percentage: roundPercent(entry.percentage),
          }));

  return {
    validCount: stat.validCount,
    distinctCount: stat.distinctCount,
    isUniform: stat.isUniformDistribution,
    topCategories,
  };
}

function buildFindingContext(
  insight: DatasetInsight,
  maxExplanationChars: number,
  maxEvidenceItems: number,
): InvestigationContextFinding {
  // Strictly exclude `recordAnomalies` AND any "Sample ..." cell-label metrics
  // so zero raw row values, row numbers, or rare unique cell text leak.
  const safeEvidence = insight.evidence
    .filter((metric) => !metric.label.toLowerCase().includes('sample'))
    .slice(0, maxEvidenceItems)
    .map((metric) => ({
      label: sanitizeUntrustedLabel(metric.label, 48),
      value: sanitizeUntrustedLabel(metric.value, MAX_EVIDENCE_VALUE_CHARS),
    }));

  return {
    id: insight.id,
    category: insight.category,
    classification: insight.classification,
    severity: insight.severity,
    confidence: insight.confidence,
    title: sanitizeUntrustedLabel(insight.title, MAX_FINDING_TITLE_CHARS),
    explanation: sanitizeUntrustedLabel(insight.explanation, maxExplanationChars),
    affectedColumnIds: [...insight.affectedColumnIds],
    evidence: safeEvidence,
    ...(insight.totalAnomalyCount !== undefined
      ? { totalAnomalyCount: insight.totalAnomalyCount }
      : {}),
    ...(insight.recommendedChart
      ? { recommendedChartType: insight.recommendedChart.chartType }
      : {}),
  };
}

function buildRelationships(
  insights: readonly DatasetInsight[],
  validColumnIds: ReadonlySet<string>,
  maxRelationships: number,
): readonly InvestigationContextRelationship[] {
  const relationships: InvestigationContextRelationship[] = [];
  const cap = Math.min(maxRelationships, MAX_CONTEXT_RELATIONSHIPS);

  for (const insight of insights) {
    if (relationships.length >= cap) break;
    if (insight.category !== 'relationship') continue;
    if (insight.affectedColumnIds.length < 2) continue;

    const colA = insight.affectedColumnIds[0]!;
    const colB = insight.affectedColumnIds[1]!;
    if (!validColumnIds.has(colA) || !validColumnIds.has(colB)) continue;

    const nameA = sanitizeUntrustedLabel(
      insight.affectedColumnNames[0] ?? colA,
      MAX_COL_NAME_CHARS,
    );
    const nameB = sanitizeUntrustedLabel(
      insight.affectedColumnNames[1] ?? colB,
      MAX_COL_NAME_CHARS,
    );
    const metricSummary = insight.evidence
      .slice(0, 3)
      .map((m) => `${sanitizeUntrustedLabel(m.label, 32)}=${sanitizeUntrustedLabel(m.value, 40)}`)
      .join(', ');

    relationships.push({
      findingId: insight.id,
      columnIds: [colA, colB],
      columnNames: [nameA, nameB],
      metricSummary: metricSummary || sanitizeUntrustedLabel(insight.title, 120),
    });
  }

  return relationships;
}

function buildAvailableCharts(
  profile: DatasetProfileSummary,
  stats: DatasetStatisticalSummary,
  validColumnIds: ReadonlySet<string>,
  maxCharts: number,
): readonly InvestigationContextChartAvailability[] {
  const recs = generateChartRecommendations(profile, stats);
  const filtered: InvestigationContextChartAvailability[] = [];

  for (const rec of recs) {
    if (filtered.length >= maxCharts) break;
    if (!validColumnIds.has(rec.xColumnId)) continue;
    if (rec.yColumnId && !validColumnIds.has(rec.yColumnId)) continue;

    filtered.push({
      chartType: rec.type,
      xColumnId: rec.xColumnId,
      ...(rec.yColumnId ? { yColumnId: rec.yColumnId } : {}),
      title: sanitizeUntrustedLabel(rec.title, 90),
    });
  }

  return filtered;
}

function sortColumnsByAnalyticalPriority(
  profile: DatasetProfileSummary,
  findings: readonly DatasetInsight[],
): readonly DatasetProfileSummary['columns'][number][] {
  const findingHitsByCol = new Map<string, number>();
  for (const finding of findings) {
    const weight = 5 - SEVERITY_PRIORITY[finding.severity];
    for (const colId of finding.affectedColumnIds) {
      findingHitsByCol.set(colId, (findingHitsByCol.get(colId) ?? 0) + weight);
    }
  }

  return [...profile.columns].sort((a, b) => {
    const scoreA =
      (findingHitsByCol.get(a.columnId) ?? 0) * 10 +
      (a.missingPercentage >= 10 ? 3 : 0) +
      (a.invalidCount > 0 ? 4 : 0) +
      (a.detectedType === 'numeric' || a.detectedType === 'categorical' ? 2 : 0);
    const scoreB =
      (findingHitsByCol.get(b.columnId) ?? 0) * 10 +
      (b.missingPercentage >= 10 ? 3 : 0) +
      (b.invalidCount > 0 ? 4 : 0) +
      (b.detectedType === 'numeric' || b.detectedType === 'categorical' ? 2 : 0);

    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.index - b.index;
  });
}

function measurePayloadSize(payload: InvestigationContextPayload): number {
  return JSON.stringify(payload).length;
}

interface ReductionProfile {
  readonly maxColumns: number;
  readonly maxFindings: number;
  readonly maxCategories: number;
  readonly maxExplanationChars: number;
  readonly maxEvidenceItems: number;
  readonly maxRelationships: number;
  readonly maxCharts: number;
  readonly includeColumnStats: boolean;
  readonly note?: string;
}

/**
 * Deterministically builds an aggregate-only `InvestigationContextPayload`
 * from Modules 03, 04, 06, and 07 without ever accessing raw dataset rows.
 */
export function buildInvestigationContext(
  profile: DatasetProfileSummary,
  stats: DatasetStatisticalSummary,
  investigation: DatasetInvestigationSummary,
  options: BuildInvestigationContextOptions = {},
): InvestigationContextPayload {
  const maxChars = Math.max(
    1_500,
    Math.min(options.maxChars ?? DEFAULT_BRIEF_TARGET_CHARS, HARD_MAX_CONTEXT_CHARS),
  );
  const initialMaxColumns = Math.max(
    1,
    Math.min(options.maxColumns ?? MAX_CONTEXT_COLUMNS, MAX_CONTEXT_COLUMNS),
  );
  const initialMaxFindings = Math.max(
    0,
    Math.min(options.maxFindings ?? MAX_CONTEXT_FINDINGS, MAX_CONTEXT_FINDINGS),
  );
  const initialMaxCategories = Math.max(
    0,
    Math.min(
      options.maxCategoriesPerColumn ?? MAX_CONTEXT_CATEGORIES_PER_COLUMN,
      MAX_CONTEXT_CATEGORIES_PER_COLUMN,
    ),
  );
  const initialMaxRelationships = Math.max(
    0,
    Math.min(options.maxRelationships ?? MAX_CONTEXT_RELATIONSHIPS, MAX_CONTEXT_RELATIONSHIPS),
  );
  const initialMaxCharts = Math.max(
    0,
    Math.min(options.maxCharts ?? MAX_CONTEXT_CHARTS, MAX_CONTEXT_CHARTS),
  );

  const numericByColId = new Map<string, NumericColumnStatistics>(
    stats.numericColumns.map((col) => [col.columnId, col]),
  );
  const categoricalByColId = new Map<string, CategoricalColumnStatistics>(
    stats.categoricalColumns.map((col) => [col.columnId, col]),
  );

  // Findings are already sorted by severity -> category -> id in M07,
  // but re-sort deterministically so caller ordering cannot break determinism.
  const orderedFindings = [...investigation.insights].sort((a, b) => {
    const sevDiff = SEVERITY_PRIORITY[a.severity] - SEVERITY_PRIORITY[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const prioritizedColumns = sortColumnsByAnalyticalPriority(profile, orderedFindings);

  const reductionStages: readonly ReductionProfile[] = [
    {
      maxColumns: initialMaxColumns,
      maxFindings: initialMaxFindings,
      maxCategories: initialMaxCategories,
      maxExplanationChars: 320,
      maxEvidenceItems: MAX_EVIDENCE_ITEMS,
      maxRelationships: initialMaxRelationships,
      maxCharts: initialMaxCharts,
      includeColumnStats: true,
    },
    {
      maxColumns: initialMaxColumns,
      maxFindings: initialMaxFindings,
      maxCategories: Math.min(initialMaxCategories, 10),
      maxExplanationChars: 220,
      maxEvidenceItems: 4,
      maxRelationships: Math.min(initialMaxRelationships, 15),
      maxCharts: Math.min(initialMaxCharts, 8),
      includeColumnStats: true,
      note: 'Reduced category depth to top 10 and tightened finding descriptions to fit context budget.',
    },
    {
      maxColumns: Math.min(initialMaxColumns, 60),
      maxFindings: Math.min(initialMaxFindings, 50),
      maxCategories: Math.min(initialMaxCategories, 5),
      maxExplanationChars: 160,
      maxEvidenceItems: 3,
      maxRelationships: Math.min(initialMaxRelationships, 10),
      maxCharts: Math.min(initialMaxCharts, 6),
      includeColumnStats: true,
      note: 'Prioritized top 60 columns and top 50 highest-severity findings to fit context budget.',
    },
    {
      maxColumns: Math.min(initialMaxColumns, 35),
      maxFindings: Math.min(initialMaxFindings, 30),
      maxCategories: Math.min(initialMaxCategories, 3),
      maxExplanationChars: 120,
      maxEvidenceItems: 2,
      maxRelationships: Math.min(initialMaxRelationships, 8),
      maxCharts: Math.min(initialMaxCharts, 4),
      includeColumnStats: true,
      note: 'Prioritized top 35 columns and top 30 findings with compact summaries.',
    },
    {
      maxColumns: Math.min(initialMaxColumns, 20),
      maxFindings: Math.min(initialMaxFindings, 18),
      maxCategories: 0,
      maxExplanationChars: 100,
      maxEvidenceItems: 2,
      maxRelationships: Math.min(initialMaxRelationships, 5),
      maxCharts: Math.min(initialMaxCharts, 3),
      includeColumnStats: true,
      note: 'Compacted to top 20 columns and top 18 findings without category lists.',
    },
    {
      maxColumns: Math.min(initialMaxColumns, 15),
      maxFindings: Math.min(initialMaxFindings, 12),
      maxCategories: 0,
      maxExplanationChars: 80,
      maxEvidenceItems: 1,
      maxRelationships: Math.min(initialMaxRelationships, 4),
      maxCharts: 2,
      includeColumnStats: false,
      note: 'Applied strict minimal schema & high-priority findings summary to stay within character limit.',
    },
    {
      maxColumns: Math.min(initialMaxColumns, 8),
      maxFindings: Math.min(initialMaxFindings, 6),
      maxCategories: 0,
      maxExplanationChars: 64,
      maxEvidenceItems: 1,
      maxRelationships: 2,
      maxCharts: 0,
      includeColumnStats: false,
      note: 'Applied minimal emergency context budget (8 columns, 6 findings).',
    },
  ];

  const assembleForStage = (stage: ReductionProfile): InvestigationContextPayload => {
    const selectedColumns = prioritizedColumns
      .slice(0, stage.maxColumns)
      // Restore original column index order for readability
      .sort((a, b) => a.index - b.index);

    const includedColumnIdSet = new Set(selectedColumns.map((c) => c.columnId));

    const columnsPayload: InvestigationContextColumn[] = selectedColumns.map((col) => {
      const numericStat = stage.includeColumnStats
        ? numericByColId.get(col.columnId)
        : undefined;
      const catStat =
        stage.includeColumnStats && stage.maxCategories > 0
          ? categoricalByColId.get(col.columnId)
          : undefined;

      return {
        columnId: col.columnId,
        name: sanitizeUntrustedLabel(col.name, MAX_COL_NAME_CHARS),
        detectedType: col.detectedType,
        confidence: col.confidence,
        missingPercentage: roundPercent(col.missingPercentage),
        invalidCount: col.invalidCount,
        uniqueCount: col.uniqueCount,
        distinctRatio: roundCompact(col.distinctRatio) ?? 0,
        ...(numericStat && numericStat.hasValidData
          ? { numericSummary: buildNumericSummary(numericStat) }
          : {}),
        ...(catStat && catStat.hasValidData
          ? {
              categoricalSummary: buildCategoricalSummary(
                catStat,
                col.distinctRatio,
                stage.maxCategories,
              ),
            }
          : {}),
      };
    });

    // Keep findings whose affected columns are all represented (or dataset-level findings with 0 columns)
    const eligibleFindings = orderedFindings.filter((f) =>
      f.affectedColumnIds.every((colId) => includedColumnIdSet.has(colId)),
    );
    const selectedFindings = eligibleFindings.slice(0, stage.maxFindings);

    const findingsPayload = selectedFindings.map((f) =>
      buildFindingContext(f, stage.maxExplanationChars, stage.maxEvidenceItems),
    );

    const relationshipsPayload = buildRelationships(
      selectedFindings,
      includedColumnIdSet,
      stage.maxRelationships,
    );

    const chartsPayload = buildAvailableCharts(
      profile,
      stats,
      includedColumnIdSet,
      stage.maxCharts,
    );

    const reductionNotes: string[] = [];
    if (profile.columns.length > selectedColumns.length) {
      reductionNotes.push(
        `Included ${selectedColumns.length} of ${profile.columns.length} columns prioritized by analytical findings.`,
      );
    }
    if (investigation.insights.length > selectedFindings.length) {
      reductionNotes.push(
        `Included ${selectedFindings.length} of ${investigation.insights.length} findings ordered by severity.`,
      );
    }
    if (stage.note) {
      reductionNotes.push(stage.note);
    }

    const basePayload: InvestigationContextPayload = {
      dataset: {
        fileName: sanitizeUntrustedLabel(profile.fileName, MAX_FILENAME_CHARS),
        rowCount: profile.rowCount,
        columnCount: profile.columnCount,
        totalCells: profile.totalCells,
        overallMissingPercentage: roundPercent(profile.overallMissingPercentage),
        qualityScore: roundCompact(profile.quality.overallScore) ?? 0,
        qualityGrade: profile.quality.grade,
        qualityDimensions: profile.quality.dimensions.slice(0, 5).map((d) => ({
          label: sanitizeUntrustedLabel(d.label, 40),
          score: roundCompact(d.score) ?? 0,
        })),
        missingPolicySummary: sanitizeUntrustedLabel(
          profile.missingValuePolicy.description,
          MAX_POLICY_SUMMARY_CHARS,
        ),
        typeDistribution: { ...profile.typeDistribution },
      },
      columns: columnsPayload,
      findings: findingsPayload,
      numericRelationships: relationshipsPayload,
      availableCharts: chartsPayload,
      contextMeta: {
        truncated:
          reductionNotes.length > 0 ||
          selectedColumns.length < profile.columns.length ||
          selectedFindings.length < investigation.insights.length,
        reductionNotes,
        includedColumnCount: selectedColumns.length,
        totalColumnCount: profile.columns.length,
        includedFindingCount: selectedFindings.length,
        totalFindingCount: investigation.insights.length,
        serializedCharCount: 0,
      },
    };

    const measured = measurePayloadSize(basePayload);
    const finalized: InvestigationContextPayload = {
      ...basePayload,
      contextMeta: {
        ...basePayload.contextMeta,
        serializedCharCount: measured,
      },
    };

    // Recompute exact serialized char count including the digit length of serializedCharCount
    const exactLength = measurePayloadSize(finalized);
    return {
      ...finalized,
      contextMeta: {
        ...finalized.contextMeta,
        serializedCharCount: exactLength,
      },
    };
  };

  let lastCandidate: InvestigationContextPayload | null = null;
  for (const stage of reductionStages) {
    const candidate = assembleForStage(stage);
    lastCandidate = candidate;
    if (measurePayloadSize(candidate) <= maxChars) {
      return candidate;
    }
  }

  return lastCandidate!;
}

/**
 * Builds a smaller aggregate context specifically tuned for interactive Q&A
 * follow-up requests so follow-up turns remain fast and cost-controlled.
 */
export function buildQuestionInvestigationContext(
  profile: DatasetProfileSummary,
  stats: DatasetStatisticalSummary,
  investigation: DatasetInvestigationSummary,
): InvestigationContextPayload {
  return buildInvestigationContext(profile, stats, investigation, {
    maxChars: DEFAULT_QUESTION_TARGET_CHARS,
    maxColumns: 60,
    maxFindings: 40,
    maxCategoriesPerColumn: 8,
    maxRelationships: 12,
    maxCharts: 6,
  });
}
