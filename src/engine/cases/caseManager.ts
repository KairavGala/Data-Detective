/**
 * Data Detective — Module 09 Investigation Case Engine (Pure / React-Independent)
 *
 * Manages deterministic case lifecycle transitions, duplicate case prevention,
 * evidence board attachment/removal, structured investigation journal notes,
 * chronological timeline generation, and dataset identity guards.
 *
 * Privacy & integrity invariants:
 * - Never stores raw spreadsheet rows, cell-level anomaly samples, or file contents.
 * - Never mutates original datasets, profiles, statistics, or M07 findings.
 * - Never auto-promotes AI interpretations or hypotheses into verified evidence.
 * - Validates internal navigation URLs and dataset IDs before mutating cases.
 */

import type {
  CaseAiAnalysisRecord,
  CaseEvidenceItem,
  CaseEvidenceType,
  CaseNote,
  CaseNoteType,
  CaseTimelineEvent,
  CaseTimelineEventType,
  DatasetColumnProfile,
  DatasetInsight,
  DatasetStatisticalSummary,
  InsightChartLink,
  InsightSeverity,
  InvestigationCase,
  InvestigationCasePriority,
  InvestigationCaseStatus,
} from '@/types';

const MAX_TIMELINE_EVENTS = 120;
const MAX_AI_ANALYSES_PER_CASE = 8;

const STATUS_LABELS: Readonly<Record<InvestigationCaseStatus, string>> = {
  open: 'Open',
  in_progress: 'In Progress',
  under_review: 'Under Review',
  resolved: 'Resolved',
};

const PRIORITY_LABELS: Readonly<Record<InvestigationCasePriority, string>> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const NOTE_TYPE_LABELS: Readonly<Record<CaseNoteType, string>> = {
  observation: 'Observation',
  hypothesis: 'Hypothesis',
  question: 'Question',
  conclusion: 'Conclusion',
};

const EVIDENCE_TYPE_LABELS: Readonly<Record<CaseEvidenceType, string>> = {
  finding: 'Finding',
  column: 'Column',
  statistic: 'Statistic',
  visualization: 'Visualization',
  related_finding: 'Related Finding',
};

let idCounter = 0;
function nextLocalId(prefix: string, now: number): string {
  idCounter += 1;
  return `${prefix}-${now}-${idCounter}`;
}

export function isSafeCaseDestinationUrl(url: string): boolean {
  if (typeof url !== 'string' || url.length === 0) return false;
  if (url.startsWith('//') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
    return false;
  }
  return (
    url === '/explorer' ||
    url.startsWith('/explorer?') ||
    url === '/analysis' ||
    url.startsWith('/analysis?') ||
    url === '/visualizations' ||
    url.startsWith('/visualizations?') ||
    url === '/investigation' ||
    url.startsWith('/investigation?')
  );
}

export function buildFindingDeepLink(findingId: string): string {
  const params = new URLSearchParams({ finding: findingId });
  return `/investigation?${params.toString()}`;
}

export function buildExplorerColumnDeepLink(columnId: string): string {
  const params = new URLSearchParams({ column: columnId });
  return `/explorer?${params.toString()}`;
}

export function buildVisualizationDeepLink(link: InsightChartLink): string {
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

export function mapSeverityToPriority(
  severity: InsightSeverity,
): InvestigationCasePriority {
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'high';
  if (severity === 'medium') return 'medium';
  return 'low';
}

function createTimelineEvent(
  type: CaseTimelineEventType,
  label: string,
  now: number,
  detail?: string,
): CaseTimelineEvent {
  return {
    id: nextLocalId('evt', now),
    type,
    label,
    ...(detail ? { detail: detail.slice(0, 140) } : {}),
    timestamp: now,
  };
}

function appendTimeline(
  existing: readonly CaseTimelineEvent[],
  event: CaseTimelineEvent,
): readonly CaseTimelineEvent[] {
  const next = [...existing, event];
  if (next.length <= MAX_TIMELINE_EVENTS) return next;
  return next.slice(next.length - MAX_TIMELINE_EVENTS);
}

/**
 * Builds an aggregate-only evidence reference for a Module 07 finding.
 * Deliberately excludes raw rows and `recordAnomalies`.
 */
export function buildFindingEvidenceItem(
  finding: DatasetInsight,
  now: number = Date.now(),
  asRelated = false,
): CaseEvidenceItem {
  const topMetrics = finding.evidence
    .filter((m) => !m.label.toLowerCase().includes('sample'))
    .slice(0, 2)
    .map((m) => `${m.label}: ${m.value}`)
    .join(' · ');

  return {
    id: nextLocalId('ev', now),
    type: asRelated ? 'related_finding' : 'finding',
    title: finding.title,
    sourceRef: finding.id,
    description: topMetrics || finding.explanation.slice(0, 160),
    addedAt: now,
    destinationUrl: buildFindingDeepLink(finding.id),
    findingId: finding.id,
    columnIds: [...finding.affectedColumnIds],
    ...(finding.recommendedChart ? { chartLink: finding.recommendedChart } : {}),
  };
}

export function buildColumnEvidenceItem(
  column: DatasetColumnProfile,
  now: number = Date.now(),
): CaseEvidenceItem {
  return {
    id: nextLocalId('ev', now),
    type: 'column',
    title: `Column: ${column.name}`,
    sourceRef: column.columnId,
    description: `${column.detectedType} (${column.confidence} confidence) · ${column.missingPercentage.toFixed(1)}% missing · ${column.uniqueCount} unique values`,
    addedAt: now,
    destinationUrl: buildExplorerColumnDeepLink(column.columnId),
    columnIds: [column.columnId],
  };
}

export function buildStatisticEvidenceItem(
  column: DatasetColumnProfile,
  stats: DatasetStatisticalSummary,
  now: number = Date.now(),
): CaseEvidenceItem {
  const numStat = stats.numericColumns.find((c) => c.columnId === column.columnId);
  const catStat = stats.categoricalColumns.find(
    (c) => c.columnId === column.columnId,
  );

  let description = `Statistical summary for ${column.name} (${column.detectedType}).`;
  if (numStat && numStat.hasValidData) {
    const meanStr = numStat.mean !== null ? numStat.mean.toFixed(2) : 'n/a';
    const medStr = numStat.median !== null ? numStat.median.toFixed(2) : 'n/a';
    const iqrStr = numStat.iqr !== null ? numStat.iqr.toFixed(2) : 'n/a';
    description = `n=${numStat.validCount} · mean=${meanStr} · median=${medStr} · IQR=${iqrStr}`;
  } else if (catStat && catStat.hasValidData) {
    description = `n=${catStat.validCount} · ${catStat.distinctCount} distinct categories · ${catStat.isUniformDistribution ? 'uniform distribution' : 'non-uniform frequency distribution'}`;
  }

  return {
    id: nextLocalId('ev', now),
    type: 'statistic',
    title: `Statistics: ${column.name}`,
    sourceRef: `stat:${column.columnId}`,
    description,
    addedAt: now,
    destinationUrl: '/analysis',
    columnIds: [column.columnId],
  };
}

export function buildVisualizationEvidenceItem(
  chartLink: InsightChartLink,
  description: string,
  now: number = Date.now(),
): CaseEvidenceItem {
  const sourceRef = chartLink.yColumnId
    ? `chart:${chartLink.chartType}:${chartLink.xColumnId}:${chartLink.yColumnId}`
    : `chart:${chartLink.chartType}:${chartLink.xColumnId}`;

  return {
    id: nextLocalId('ev', now),
    type: 'visualization',
    title: chartLink.title,
    sourceRef,
    description: description.slice(0, 180),
    addedAt: now,
    destinationUrl: buildVisualizationDeepLink(chartLink),
    columnIds: chartLink.yColumnId
      ? [chartLink.xColumnId, chartLink.yColumnId]
      : [chartLink.xColumnId],
    chartLink,
  };
}

function allocateCaseId(existingCases: readonly InvestigationCase[]): string {
  let maxNum = 0;
  for (const c of existingCases) {
    const match = /^CASE-(\d+)$/.exec(c.id);
    if (match) {
      const n = Number.parseInt(match[1]!, 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `CASE-${String(maxNum + 1).padStart(3, '0')}`;
}

export interface CreateCaseInput {
  readonly title: string;
  readonly description?: string;
  readonly priority?: InvestigationCasePriority;
  readonly datasetId: string;
  readonly datasetFileName: string;
  readonly datasetProfiledAt: number;
  readonly initialFindings?: readonly DatasetInsight[];
  readonly initialEvidence?: readonly CaseEvidenceItem[];
}

export interface CreateCaseResult {
  readonly created: boolean;
  readonly caseItem: InvestigationCase;
  readonly duplicateReason?: 'duplicate_finding_case' | 'duplicate_title';
}

/**
 * Creates a new investigation case with built-in duplicate prevention for
 * repeated clicks (both finding-originated and identical-title manual cases).
 */
export function createInvestigationCase(
  existingCases: readonly InvestigationCase[],
  input: CreateCaseInput,
  now: number = Date.now(),
): CreateCaseResult {
  const trimmedTitle = input.title.trim().slice(0, 140);
  if (trimmedTitle.length === 0) {
    throw new Error('Case title must not be empty.');
  }

  const initialFindings = input.initialFindings ?? [];
  const normalizedTitle = trimmedTitle.toLowerCase();

  // Duplicate guard 1: single-finding creation when an active case for the same
  // dataset already investigates that exact finding.
  if (initialFindings.length === 1) {
    const primaryFindingId = initialFindings[0]!.id;
    const existingForFinding = existingCases.find(
      (c) =>
        !c.archived &&
        c.datasetId === input.datasetId &&
        c.findingIds.includes(primaryFindingId),
    );
    if (existingForFinding) {
      return {
        created: false,
        caseItem: existingForFinding,
        duplicateReason: 'duplicate_finding_case',
      };
    }
  }

  // Duplicate guard 2: active case with identical normalized title on same dataset
  const existingByTitle = existingCases.find(
    (c) =>
      !c.archived &&
      c.datasetId === input.datasetId &&
      c.title.trim().toLowerCase() === normalizedTitle,
  );
  if (existingByTitle) {
    return {
      created: false,
      caseItem: existingByTitle,
      duplicateReason: 'duplicate_title',
    };
  }

  const dedupedFindingIds: string[] = [];
  const evidenceItems: CaseEvidenceItem[] = [];
  const seenEvidenceKeys = new Set<string>();

  for (const finding of initialFindings) {
    if (!dedupedFindingIds.includes(finding.id)) {
      dedupedFindingIds.push(finding.id);
      const ev = buildFindingEvidenceItem(finding, now);
      seenEvidenceKeys.add(`${ev.type}:${ev.sourceRef}`);
      evidenceItems.push(ev);
    }
  }

  for (const extra of input.initialEvidence ?? []) {
    if (!isSafeCaseDestinationUrl(extra.destinationUrl)) continue;
    const key = `${extra.type}:${extra.sourceRef}`;
    if (!seenEvidenceKeys.has(key)) {
      seenEvidenceKeys.add(key);
      evidenceItems.push(extra);
    }
  }

  const priority: InvestigationCasePriority =
    input.priority ??
    (initialFindings[0]
      ? mapSeverityToPriority(initialFindings[0].severity)
      : 'medium');

  const id = allocateCaseId(existingCases);
  const timeline: CaseTimelineEvent[] = [
    createTimelineEvent(
      'case_created',
      'Case created',
      now,
      `${id} · Priority ${PRIORITY_LABELS[priority]}`,
    ),
  ];

  if (dedupedFindingIds.length > 0) {
    timeline.push(
      createTimelineEvent(
        'finding_attached',
        dedupedFindingIds.length === 1
          ? 'Finding attached'
          : `${dedupedFindingIds.length} findings attached`,
        now,
        dedupedFindingIds.slice(0, 3).join(', '),
      ),
    );
  }

  const newCase: InvestigationCase = {
    id,
    title: trimmedTitle,
    description: (input.description ?? '').trim().slice(0, 500),
    datasetId: input.datasetId,
    datasetFileName: input.datasetFileName,
    datasetProfiledAt: input.datasetProfiledAt,
    createdAt: now,
    updatedAt: now,
    status: 'open',
    priority,
    archived: false,
    findingIds: dedupedFindingIds,
    evidence: evidenceItems,
    notes: [],
    conclusion: '',
    aiAnalyses: [],
    timeline,
  };

  return {
    created: true,
    caseItem: newCase,
  };
}

export function updateCaseDetails(
  caseItem: InvestigationCase,
  updates: {
    readonly title?: string;
    readonly description?: string;
    readonly conclusion?: string;
  },
  now: number = Date.now(),
): InvestigationCase {
  const nextTitle =
    updates.title !== undefined
      ? updates.title.trim().slice(0, 140) || caseItem.title
      : caseItem.title;
  const nextDescription =
    updates.description !== undefined
      ? updates.description.trim().slice(0, 500)
      : caseItem.description;
  const nextConclusion =
    updates.conclusion !== undefined
      ? updates.conclusion.trim().slice(0, 1_200)
      : caseItem.conclusion;

  const titleChanged = nextTitle !== caseItem.title;
  const descChanged = nextDescription !== caseItem.description;
  const conclusionChanged = nextConclusion !== caseItem.conclusion;

  if (!titleChanged && !descChanged && !conclusionChanged) {
    return caseItem;
  }

  let timeline = caseItem.timeline;
  if (titleChanged || descChanged) {
    const parts: string[] = [];
    if (titleChanged) parts.push('title');
    if (descChanged) parts.push('description');
    timeline = appendTimeline(
      timeline,
      createTimelineEvent(
        'case_updated',
        `Updated case ${parts.join(' and ')}`,
        now,
      ),
    );
  }
  if (conclusionChanged) {
    timeline = appendTimeline(
      timeline,
      createTimelineEvent(
        'conclusion_updated',
        nextConclusion.length > 0 ? 'Conclusion documented' : 'Conclusion cleared',
        now,
      ),
    );
  }

  return {
    ...caseItem,
    title: nextTitle,
    description: nextDescription,
    conclusion: nextConclusion,
    updatedAt: now,
    timeline,
  };
}

export function changeCaseStatus(
  caseItem: InvestigationCase,
  nextStatus: InvestigationCaseStatus,
  now: number = Date.now(),
): InvestigationCase {
  if (caseItem.status === nextStatus) return caseItem;

  const eventType: CaseTimelineEventType =
    nextStatus === 'resolved'
      ? 'case_resolved'
      : caseItem.status === 'resolved'
        ? 'case_reopened'
        : 'status_changed';

  const label =
    nextStatus === 'resolved'
      ? 'Case resolved'
      : caseItem.status === 'resolved'
        ? `Case reopened (${STATUS_LABELS[nextStatus]})`
        : `Status changed to ${STATUS_LABELS[nextStatus]}`;

  return {
    ...caseItem,
    status: nextStatus,
    updatedAt: now,
    timeline: appendTimeline(
      caseItem.timeline,
      createTimelineEvent(
        eventType,
        label,
        now,
        `${STATUS_LABELS[caseItem.status]} -> ${STATUS_LABELS[nextStatus]}`,
      ),
    ),
  };
}

export function changeCasePriority(
  caseItem: InvestigationCase,
  nextPriority: InvestigationCasePriority,
  now: number = Date.now(),
): InvestigationCase {
  if (caseItem.priority === nextPriority) return caseItem;

  return {
    ...caseItem,
    priority: nextPriority,
    updatedAt: now,
    timeline: appendTimeline(
      caseItem.timeline,
      createTimelineEvent(
        'priority_changed',
        `Priority changed to ${PRIORITY_LABELS[nextPriority]}`,
        now,
        `${PRIORITY_LABELS[caseItem.priority]} -> ${PRIORITY_LABELS[nextPriority]}`,
      ),
    ),
  };
}

export function archiveCase(
  caseItem: InvestigationCase,
  now: number = Date.now(),
): InvestigationCase {
  if (caseItem.archived) return caseItem;

  return {
    ...caseItem,
    archived: true,
    archivedAt: now,
    updatedAt: now,
    timeline: appendTimeline(
      caseItem.timeline,
      createTimelineEvent('case_archived', 'Case archived', now),
    ),
  };
}

export function reopenArchivedCase(
  caseItem: InvestigationCase,
  now: number = Date.now(),
): InvestigationCase {
  if (!caseItem.archived) return caseItem;

  const nextStatus: InvestigationCaseStatus =
    caseItem.status === 'resolved' ? 'open' : caseItem.status;

  return {
    ...caseItem,
    archived: false,
    archivedAt: undefined,
    status: nextStatus,
    updatedAt: now,
    timeline: appendTimeline(
      caseItem.timeline,
      createTimelineEvent('case_reopened', 'Archived case reopened', now),
    ),
  };
}

/**
 * Attaches a verified M07 finding to a case after checking dataset identity
 * and confirming the finding exists in the active dataset.
 */
export function attachFindingToCase(
  caseItem: InvestigationCase,
  finding: DatasetInsight,
  activeDatasetId: string,
  validFindingIds: ReadonlySet<string>,
  now: number = Date.now(),
  asRelated = false,
): InvestigationCase {
  if (caseItem.datasetId !== activeDatasetId) {
    throw new Error(
      'Cannot attach finding: case belongs to a different dataset.',
    );
  }
  if (!validFindingIds.has(finding.id)) {
    throw new Error(
      `Cannot attach finding "${finding.id}": finding does not exist in the active dataset.`,
    );
  }

  const alreadyAttachedFinding = caseItem.findingIds.includes(finding.id);
  const evType: CaseEvidenceType = asRelated ? 'related_finding' : 'finding';
  const alreadyHasEvidence = caseItem.evidence.some(
    (e) =>
      e.sourceRef === finding.id &&
      (e.type === 'finding' || e.type === 'related_finding'),
  );

  if (alreadyAttachedFinding && alreadyHasEvidence) {
    return caseItem;
  }

  const nextFindingIds = alreadyAttachedFinding
    ? caseItem.findingIds
    : [...caseItem.findingIds, finding.id];

  const nextEvidence = alreadyHasEvidence
    ? caseItem.evidence
    : [...caseItem.evidence, buildFindingEvidenceItem(finding, now, asRelated)];

  return {
    ...caseItem,
    findingIds: nextFindingIds,
    evidence: nextEvidence,
    updatedAt: now,
    timeline: appendTimeline(
      caseItem.timeline,
      createTimelineEvent(
        'finding_attached',
        asRelated ? 'Related finding attached' : 'Finding attached',
        now,
        `${EVIDENCE_TYPE_LABELS[evType]} · ${finding.id}`,
      ),
    ),
  };
}

export function addEvidenceToCase(
  caseItem: InvestigationCase,
  evidenceItem: CaseEvidenceItem,
  activeDatasetId: string,
  now: number = Date.now(),
): InvestigationCase {
  if (caseItem.datasetId !== activeDatasetId) {
    throw new Error(
      'Cannot add evidence: case belongs to a different dataset.',
    );
  }
  if (!isSafeCaseDestinationUrl(evidenceItem.destinationUrl)) {
    throw new Error('Evidence item contains an unsupported navigation destination.');
  }

  const duplicate = caseItem.evidence.some(
    (e) => e.type === evidenceItem.type && e.sourceRef === evidenceItem.sourceRef,
  );
  if (duplicate) return caseItem;

  const nextFindingIds =
    evidenceItem.findingId && !caseItem.findingIds.includes(evidenceItem.findingId)
      ? [...caseItem.findingIds, evidenceItem.findingId]
      : caseItem.findingIds;

  return {
    ...caseItem,
    findingIds: nextFindingIds,
    evidence: [...caseItem.evidence, evidenceItem],
    updatedAt: now,
    timeline: appendTimeline(
      caseItem.timeline,
      createTimelineEvent(
        'evidence_added',
        `Evidence added (${EVIDENCE_TYPE_LABELS[evidenceItem.type]})`,
        now,
        evidenceItem.title.slice(0, 100),
      ),
    ),
  };
}

export function removeEvidenceFromCase(
  caseItem: InvestigationCase,
  evidenceId: string,
  now: number = Date.now(),
): InvestigationCase {
  const target = caseItem.evidence.find((e) => e.id === evidenceId);
  if (!target) return caseItem;

  const nextEvidence = caseItem.evidence.filter((e) => e.id !== evidenceId);

  // If removing a finding evidence item and no remaining evidence references
  // that finding ID, also detach it from findingIds without modifying the source finding.
  const nextFindingIds = target.findingId
    ? nextEvidence.some((e) => e.findingId === target.findingId)
      ? caseItem.findingIds
      : caseItem.findingIds.filter((fid) => fid !== target.findingId)
    : caseItem.findingIds;

  const nextNotes = caseItem.notes.map((note) =>
    note.supportingEvidenceIds.includes(evidenceId)
      ? {
          ...note,
          supportingEvidenceIds: note.supportingEvidenceIds.filter(
            (id) => id !== evidenceId,
          ),
        }
      : note,
  );

  return {
    ...caseItem,
    findingIds: nextFindingIds,
    evidence: nextEvidence,
    notes: nextNotes,
    updatedAt: now,
    timeline: appendTimeline(
      caseItem.timeline,
      createTimelineEvent(
        'evidence_removed',
        `Evidence removed (${EVIDENCE_TYPE_LABELS[target.type]})`,
        now,
        target.title.slice(0, 100),
      ),
    ),
  };
}

export function addCaseNote(
  caseItem: InvestigationCase,
  input: {
    readonly type: CaseNoteType;
    readonly text: string;
    readonly supportingEvidenceIds?: readonly string[];
  },
  now: number = Date.now(),
): InvestigationCase {
  const trimmed = input.text.trim().slice(0, 1_200);
  if (trimmed.length === 0) return caseItem;

  const validEvidenceIdSet = new Set(caseItem.evidence.map((e) => e.id));
  const supportingEvidenceIds = (input.supportingEvidenceIds ?? []).filter(
    (id) => validEvidenceIdSet.has(id),
  );

  const note: CaseNote = {
    id: nextLocalId('note', now),
    type: input.type,
    text: trimmed,
    createdAt: now,
    updatedAt: now,
    supportingEvidenceIds,
  };

  // If the user logs a Conclusion note and no summary conclusion is recorded yet,
  // mirror it cleanly as the case conclusion (always editable independently).
  const nextConclusion =
    input.type === 'conclusion' && caseItem.conclusion.trim().length === 0
      ? trimmed
      : caseItem.conclusion;

  return {
    ...caseItem,
    notes: [note, ...caseItem.notes],
    conclusion: nextConclusion,
    updatedAt: now,
    timeline: appendTimeline(
      caseItem.timeline,
      createTimelineEvent(
        'note_created',
        `${NOTE_TYPE_LABELS[input.type]} logged`,
        now,
        supportingEvidenceIds.length > 0
          ? `Linked to ${supportingEvidenceIds.length} evidence ${supportingEvidenceIds.length === 1 ? 'item' : 'items'}`
          : undefined,
      ),
    ),
  };
}

export function editCaseNote(
  caseItem: InvestigationCase,
  noteId: string,
  updates: {
    readonly type?: CaseNoteType;
    readonly text?: string;
    readonly supportingEvidenceIds?: readonly string[];
  },
  now: number = Date.now(),
): InvestigationCase {
  const target = caseItem.notes.find((n) => n.id === noteId);
  if (!target) return caseItem;

  const validEvidenceIdSet = new Set(caseItem.evidence.map((e) => e.id));
  const nextText =
    updates.text !== undefined
      ? updates.text.trim().slice(0, 1_200) || target.text
      : target.text;
  const nextType = updates.type ?? target.type;
  const nextRefs =
    updates.supportingEvidenceIds !== undefined
      ? updates.supportingEvidenceIds.filter((id) => validEvidenceIdSet.has(id))
      : target.supportingEvidenceIds;

  const nextNotes = caseItem.notes.map((n) =>
    n.id === noteId
      ? {
          ...n,
          type: nextType,
          text: nextText,
          supportingEvidenceIds: nextRefs,
          updatedAt: now,
        }
      : n,
  );

  return {
    ...caseItem,
    notes: nextNotes,
    updatedAt: now,
    timeline: appendTimeline(
      caseItem.timeline,
      createTimelineEvent(
        'note_edited',
        `${NOTE_TYPE_LABELS[nextType]} updated`,
        now,
      ),
    ),
  };
}

export function deleteCaseNote(
  caseItem: InvestigationCase,
  noteId: string,
  now: number = Date.now(),
): InvestigationCase {
  const target = caseItem.notes.find((n) => n.id === noteId);
  if (!target) return caseItem;

  return {
    ...caseItem,
    notes: caseItem.notes.filter((n) => n.id !== noteId),
    updatedAt: now,
    timeline: appendTimeline(
      caseItem.timeline,
      createTimelineEvent(
        'note_deleted',
        `${NOTE_TYPE_LABELS[target.type]} deleted`,
        now,
      ),
    ),
  };
}

/**
 * Records an AI interpretation snapshot inside the case without ever modifying
 * or promoting items into the verified Evidence Board.
 */
export function recordCaseAiAnalysis(
  caseItem: InvestigationCase,
  record: CaseAiAnalysisRecord,
  activeDatasetId: string,
  now: number = Date.now(),
): InvestigationCase {
  if (caseItem.datasetId !== activeDatasetId) {
    throw new Error(
      'Cannot record AI analysis: case belongs to a different dataset.',
    );
  }

  const nextAnalyses = [record, ...caseItem.aiAnalyses].slice(
    0,
    MAX_AI_ANALYSES_PER_CASE,
  );

  return {
    ...caseItem,
    aiAnalyses: nextAnalyses,
    updatedAt: now,
    timeline: appendTimeline(
      caseItem.timeline,
      createTimelineEvent(
        'ai_analysis_generated',
        'AI case interpretation generated',
        now,
        `${record.model} · ${record.data.supportType.replace(/_/g, ' ')}`,
      ),
    ),
  };
}
