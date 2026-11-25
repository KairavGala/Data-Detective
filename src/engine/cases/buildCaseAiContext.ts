/**
 * Data Detective — Module 09 Bounded Aggregate-Only Case AI Context Builder
 *
 * Prepares a focused, strictly aggregate-only payload for `POST /api/ai/investigate`
 * (`mode: 'case'`). Reuses the Module 08 `buildInvestigationContext` pipeline so
 * raw spreadsheet rows, free-text cell samples, and M07 `recordAnomalies` can
 * NEVER leave the browser.
 */

import {
  buildInvestigationContext,
  DEFAULT_QUESTION_TARGET_CHARS,
  HARD_MAX_CONTEXT_CHARS,
} from '@/engine/assistant';
import type {
  AiBriefGenerationData,
  CaseAiRequestInfo,
  DatasetInsight,
  DatasetInvestigationSummary,
  DatasetProfileSummary,
  DatasetStatisticalSummary,
  InvestigationCase,
  InvestigationContextPayload,
} from '@/types';

const MAX_CASE_CONTEXT_CHARS = DEFAULT_QUESTION_TARGET_CHARS;

function sanitizeText(raw: string, maxLen: number): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export interface BuiltCaseAiRequest {
  readonly context: InvestigationContextPayload;
  readonly caseInfo: CaseAiRequestInfo;
  readonly validSelectedFindingIds: readonly string[];
  readonly skippedInvalidFindingIds: readonly string[];
}

/**
 * Compiles a focused, privacy-safe request payload for AI-assisted analysis
 * of a single investigation case.
 *
 * Enforces:
 * - Dataset identity match (`caseItem.datasetId === profile.datasetId`).
 * - Strict filtering of `caseItem.findingIds` against verified M07 findings
 *   belonging to the active dataset (never sends invalid or cross-dataset IDs).
 * - Prioritizes case-relevant findings and columns inside the aggregate context.
 * - Includes existing Module 08 brief summary ONLY when verified for the same dataset.
 * - Never accesses `dataset.rows`, `sampleValues`, or `recordAnomalies`.
 */
export function buildCaseAiRequest(params: {
  readonly caseItem: InvestigationCase;
  readonly profile: DatasetProfileSummary;
  readonly stats: DatasetStatisticalSummary;
  readonly investigation: DatasetInvestigationSummary;
  readonly userQuestion?: string;
  readonly existingBrief?: {
    readonly datasetId: string;
    readonly profiledAt: number;
    readonly data: AiBriefGenerationData;
  } | null;
}): BuiltCaseAiRequest {
  const { caseItem, profile, stats, investigation, userQuestion, existingBrief } =
    params;

  if (caseItem.datasetId !== profile.datasetId) {
    throw new Error(
      'Dataset identity mismatch: cannot run AI analysis for a case from a previous dataset.',
    );
  }

  const insightsById = new Map<string, DatasetInsight>(
    investigation.insights.map((f) => [f.id, f]),
  );

  // Separate valid finding IDs belonging to this dataset from stale/invalid ones
  const validSelectedFindingIds: string[] = [];
  const skippedInvalidFindingIds: string[] = [];
  const selectedFindingIdSet = new Set<string>();

  for (const fid of caseItem.findingIds) {
    if (insightsById.has(fid)) {
      if (!selectedFindingIdSet.has(fid)) {
        selectedFindingIdSet.add(fid);
        validSelectedFindingIds.push(fid);
      }
    } else {
      skippedInvalidFindingIds.push(fid);
    }
  }

  // Reorder M07 findings so the case's selected findings are prioritized first
  // within the bounded aggregate context (still keeping supporting context findings).
  const prioritizedInsights: DatasetInsight[] = [
    ...validSelectedFindingIds
      .map((id) => insightsById.get(id))
      .filter((f): f is DatasetInsight => f !== undefined),
    ...investigation.insights.filter((f) => !selectedFindingIdSet.has(f.id)),
  ];

  // Collect columns referenced by the case's selected findings & evidence items
  const caseColumnIds = new Set<string>();
  for (const fid of validSelectedFindingIds) {
    const f = insightsById.get(fid);
    if (f) {
      for (const cid of f.affectedColumnIds) caseColumnIds.add(cid);
    }
  }
  for (const ev of caseItem.evidence) {
    for (const cid of ev.columnIds ?? []) caseColumnIds.add(cid);
  }

  // Build focused investigation summary preserving original overview metadata
  const focusedInvestigation: DatasetInvestigationSummary = {
    ...investigation,
    insights: prioritizedInsights,
  };

  // Prioritize case columns first in the profile view passed to the context builder
  const prioritizedProfile: DatasetProfileSummary =
    caseColumnIds.size > 0
      ? {
          ...profile,
          columns: [
            ...profile.columns.filter((c) => caseColumnIds.has(c.columnId)),
            ...profile.columns.filter((c) => !caseColumnIds.has(c.columnId)),
          ],
        }
      : profile;

  const context = buildInvestigationContext(
    prioritizedProfile,
    stats,
    focusedInvestigation,
    {
      maxChars: Math.min(MAX_CASE_CONTEXT_CHARS, HARD_MAX_CONTEXT_CHARS),
      maxColumns: 40,
      maxFindings: 35,
      maxCategoriesPerColumn: 8,
      maxRelationships: 10,
      maxCharts: 6,
    },
  );

  // Only include selectedFindingIds that survived compaction into `context.findings`
  const includedFindingIds = new Set(context.findings.map((f) => f.id));
  const transmittedFindingIds = validSelectedFindingIds.filter((id) =>
    includedFindingIds.has(id),
  );

  const evidenceItems = caseItem.evidence.slice(0, 25).map((ev) => ({
    type: ev.type,
    title: sanitizeText(ev.title, 140),
    sourceRef: sanitizeText(ev.sourceRef, 120),
  }));

  const priorBriefSummary =
    existingBrief &&
    existingBrief.datasetId === profile.datasetId &&
    existingBrief.profiledAt === profile.profiledAt
      ? sanitizeText(existingBrief.data.brief.executiveSummary, 750)
      : undefined;

  const cleanQuestion = userQuestion
    ? sanitizeText(userQuestion, 600)
    : undefined;

  const caseInfo: CaseAiRequestInfo = {
    caseTitle: sanitizeText(caseItem.title, 140) || 'Untitled Investigation Case',
    caseDescription: sanitizeText(caseItem.description, 500),
    selectedFindingIds: transmittedFindingIds,
    evidenceItems,
    ...(cleanQuestion ? { userQuestion: cleanQuestion } : {}),
    ...(priorBriefSummary ? { priorBriefSummary } : {}),
  };

  return {
    context,
    caseInfo,
    validSelectedFindingIds: transmittedFindingIds,
    skippedInvalidFindingIds,
  };
}
