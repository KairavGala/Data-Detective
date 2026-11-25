/**
 * Data Detective — Module 10 Pure Report Builder & Lifecycle Engine
 *
 * Architectural invariants:
 * - React-independent and deterministic.
 * - Compiles reports strictly from real M02–M09 analytical outputs (never fabricates data).
 * - Never stores raw spreadsheet rows or cell-level `recordAnomalies` inside reports.
 * - Enforces dataset identity isolation so reports from previous datasets are never
 *   silently re-bound to a newly imported dataset.
 */

import {
  getEligibleColumnsForChartType,
  prepareChartData,
} from '@/engine/visualization';
import type {
  AiBriefGenerationData,
  AiInvestigationResponseMeta,
  CategoricalColumnStatistics,
  ChartConfig,
  ChartType,
  CompiledReportDocument,
  DatasetInsight,
  DatasetInvestigationSummary,
  DatasetProfileSummary,
  DatasetStatisticalSummary,
  ImportedDataset,
  InvestigationCase,
  InvestigationReport,
  NumericColumnStatistics,
  ReportAiInclusion,
  ReportChartSnapshot,
  ReportDatasetOverviewSnapshot,
  ReportFindingSnapshot,
  ReportModule08BriefSnapshot,
  ReportSectionConfig,
  ReportSectionKey,
  ReportSourceKind,
  ReportSourceSnapshot,
  ReportType,
} from '@/types';
import {
  buildDefaultSections,
  buildDeterministicExecutiveSummary,
  deriveLimitationsAndConclusions,
  deriveMethodologyItems,
  REPORT_TYPE_META,
} from './reportTemplates';

export interface ActiveReportSources {
  readonly dataset: ImportedDataset;
  readonly profile: DatasetProfileSummary;
  readonly stats: DatasetStatisticalSummary;
  readonly investigation: DatasetInvestigationSummary;
  readonly activeCases: readonly InvestigationCase[];
  readonly verifiedAiBrief?: {
    readonly datasetId: string;
    readonly profiledAt: number;
    readonly data: AiBriefGenerationData;
    readonly meta: AiInvestigationResponseMeta | null;
  } | null;
}

export interface CreateReportInput {
  readonly title?: string;
  readonly subtitle?: string;
  readonly author?: string;
  readonly introDescription?: string;
  readonly reportType: ReportType;
  readonly sourceKind: ReportSourceKind;
  readonly caseId?: string;
  readonly selectedFindingIds?: readonly string[];
  readonly selectedStatColumnIds?: readonly string[];
  readonly selectedCharts?: readonly ChartConfig[];
  readonly sections?: readonly ReportSectionConfig[];
  readonly aiInclusion?: ReportAiInclusion;
  readonly customLimitations?: string;
  readonly customConclusion?: string;
}

function allocateReportId(existingReports: readonly InvestigationReport[]): string {
  let maxNum = 0;
  for (const r of existingReports) {
    const match = /^RPT-(\d+)$/.exec(r.id);
    if (match) {
      const n = Number.parseInt(match[1]!, 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `RPT-${String(maxNum + 1).padStart(3, '0')}`;
}

export function buildDatasetOverviewSnapshot(
  dataset: ImportedDataset,
  profile: DatasetProfileSummary,
): ReportDatasetOverviewSnapshot {
  const tokens = profile.missingValuePolicy.stringMarkers ?? [];
  const policyNote =
    profile.missingValuePolicy.description ||
    `empty strings${profile.missingValuePolicy.treatWhitespaceOnlyAsMissing ? ', whitespace-only cells' : ''}${tokens.length > 0 ? `, and markers (${tokens.slice(0, 6).join(', ')})` : ''} treated as missing`;

  return {
    fileName: dataset.fileName,
    fileType: dataset.fileType,
    fileSizeBytes: dataset.fileSizeBytes,
    rowCount: profile.rowCount,
    columnCount: profile.columnCount,
    totalCells: profile.totalCells,
    totalMissingCount: profile.totalMissingCount,
    overallMissingPercentage: profile.overallMissingPercentage,
    qualityScore: profile.quality.overallScore,
    qualityGrade: profile.quality.grade,
    qualitySummary: profile.quality.formulaDescription,
    typeDistribution: { ...profile.typeDistribution },
    warningCount: profile.warnings.length,
    missingValuePolicyNote: policyNote,
    columns: profile.columns.map((c) => ({
      columnId: c.columnId,
      name: c.name,
      detectedType: c.detectedType,
      confidence: c.confidence,
      missingCount: c.missingCount,
      missingPercentage: c.missingPercentage,
      uniqueCount: c.uniqueCount,
    })),
  };
}

/**
 * Projects a Module 07 finding into an aggregate-only report snapshot.
 * Deliberately strips `recordAnomalies` and raw sample values so raw rows
 * never enter report state.
 */
export function buildFindingSnapshot(
  finding: DatasetInsight,
): ReportFindingSnapshot {
  const safeMetrics = finding.evidence.filter(
    (m) => !m.label.toLowerCase().includes('sample'),
  );
  return {
    id: finding.id,
    title: finding.title,
    category: finding.category,
    severity: finding.severity,
    classification: finding.classification,
    affectedColumnIds: [...finding.affectedColumnIds],
    affectedColumnNames: [...finding.affectedColumnNames],
    evidenceMetrics: safeMetrics.map((m) => ({ label: m.label, value: m.value })),
    explanation: finding.explanation,
  };
}

function buildChartCaption(
  config: ChartConfig,
  prepared: ReturnType<typeof prepareChartData>,
): string {
  if (config.recommendationReason && config.recommendationReason.trim().length > 0) {
    return config.recommendationReason.trim();
  }
  const base = prepared.yColumnName
    ? `${config.type.toUpperCase()} comparing ${prepared.yColumnName} against ${prepared.xColumnName}`
    : `${config.type.toUpperCase()} summarizing ${prepared.xColumnName}`;
  return `${base} (n = ${prepared.validCount.toLocaleString()} valid observations; ${prepared.missingExcluded.toLocaleString()} missing excluded).`;
}

const VALID_CHART_TYPES: ReadonlySet<ChartType> = new Set([
  'bar',
  'histogram',
  'line',
  'scatter',
  'boxplot',
]);

/**
 * Deterministic signature distinguishing custom chart configurations by type,
 * columns, title, axes, and binning/category parameters so customized charts
 * are preserved alongside recommended charts without collapsing distinct views.
 */
export function getChartConfigSignature(cfg: ChartConfig): string {
  return [
    cfg.type,
    cfg.xColumnId,
    cfg.yColumnId ?? '',
    cfg.title.trim(),
    cfg.xAxisLabel ?? '',
    cfg.yAxisLabel ?? '',
    cfg.binCount ?? '',
    cfg.categorySort ?? '',
    cfg.maxCategories ?? '',
    cfg.showLegend === false ? '0' : '1',
  ].join('|');
}

export interface InvalidChartConfigEntry {
  readonly config: ChartConfig;
  readonly reason: string;
}

export interface ValidatedChartHandoffResult {
  readonly validCharts: readonly ChartConfig[];
  readonly invalidCharts: readonly InvalidChartConfigEntry[];
}

/**
 * Validates handed-off or user-configured chart definitions against the active
 * dataset schema and data preparation engine without substituting unrelated charts.
 */
export function validateChartConfigsForDataset(
  charts: readonly ChartConfig[],
  dataset: ImportedDataset,
  profile: DatasetProfileSummary,
  stats: DatasetStatisticalSummary,
): ValidatedChartHandoffResult {
  const validCharts: ChartConfig[] = [];
  const invalidCharts: InvalidChartConfigEntry[] = [];
  const seenSig = new Set<string>();

  for (const cfg of charts) {
    if (!cfg || !VALID_CHART_TYPES.has(cfg.type)) {
      invalidCharts.push({
        config: cfg,
        reason: `Unsupported chart type "${String(cfg?.type ?? 'unknown')}".`,
      });
      continue;
    }

    const sig = getChartConfigSignature(cfg);
    if (seenSig.has(sig)) continue;

    const eligible = getEligibleColumnsForChartType(cfg.type, profile);
    const hasValidX = eligible.xColumns.some(
      (col) => col.columnId === cfg.xColumnId,
    );
    if (!hasValidX) {
      invalidCharts.push({
        config: cfg,
        reason: `Column "${cfg.xColumnId}" is missing or incompatible with ${cfg.type} charts in ${dataset.fileName}.`,
      });
      continue;
    }

    if (eligible.requiresY) {
      const hasValidY = Boolean(
        cfg.yColumnId &&
          cfg.yColumnId !== cfg.xColumnId &&
          eligible.yColumns.some((col) => col.columnId === cfg.yColumnId),
      );
      if (!hasValidY) {
        invalidCharts.push({
          config: cfg,
          reason: `Y-axis column "${cfg.yColumnId ?? ''}" is missing or incompatible with ${cfg.type} charts in ${dataset.fileName}.`,
        });
        continue;
      }
    }

    const prepared = prepareChartData(dataset, profile, stats, cfg);
    if (prepared.status !== 'ready') {
      invalidCharts.push({
        config: cfg,
        reason:
          prepared.emptyReason ??
          `Chart "${cfg.title}" cannot be prepared from ${dataset.fileName}.`,
      });
      continue;
    }

    seenSig.add(sig);
    validCharts.push({ ...cfg });
  }

  return { validCharts, invalidCharts };
}

function buildChartSnapshots(
  charts: readonly ChartConfig[],
  dataset: ImportedDataset,
  profile: DatasetProfileSummary,
  stats: DatasetStatisticalSummary,
): readonly ReportChartSnapshot[] {
  const results: ReportChartSnapshot[] = [];
  const seenSig = new Set<string>();

  for (const cfg of charts) {
    const sig = getChartConfigSignature(cfg);
    if (seenSig.has(sig)) continue;
    const prepared = prepareChartData(dataset, profile, stats, cfg);
    if (prepared.status !== 'ready') continue;
    seenSig.add(sig);
    results.push({
      config: { ...cfg },
      prepared,
      caption: buildChartCaption(cfg, prepared),
    });
  }

  return results;
}

/**
 * Prevents high-uniqueness free-text columns (classified under M03's categorical
 * fallback when nearly every populated row is unique) from embedding raw row-level
 * text cells inside report snapshots or exported PDFs, while preserving all
 * aggregate structural counts.
 */
function sanitizeCategoricalStatsForReport(
  col: CategoricalColumnStatistics,
): CategoricalColumnStatistics {
  const distinctRatio =
    col.validCount > 0 ? col.distinctCount / col.validCount : 0;
  const isFreeTextLike =
    col.validCount >= 5 &&
    distinctRatio >= 0.85 &&
    (col.mostFrequent === null || col.mostFrequent.count <= 2);

  if (!isFreeTextLike) {
    return col;
  }

  return {
    ...col,
    mostFrequent: null,
    leastFrequent: null,
    distribution: [],
    isDistributionTruncated: true,
    omittedCategoryCount: col.distinctCount,
    omittedObservationCount: col.validCount,
  };
}

function buildSnapshotFromSources(params: {
  readonly sources: ActiveReportSources;
  readonly selectedFindingIds: readonly string[];
  readonly selectedStatColumnIds: readonly string[];
  readonly selectedCharts: readonly ChartConfig[];
  readonly caseItem?: InvestigationCase;
  readonly aiInclusion: ReportAiInclusion;
}): ReportSourceSnapshot {
  const {
    sources,
    selectedFindingIds,
    selectedStatColumnIds,
    selectedCharts,
    caseItem,
    aiInclusion,
  } = params;
  const { dataset, profile, stats, investigation, verifiedAiBrief } = sources;

  const selectedColSet = new Set(selectedStatColumnIds);
  const numericStats: readonly NumericColumnStatistics[] =
    stats.numericColumns.filter((c) => selectedColSet.has(c.columnId));
  const categoricalStats: readonly CategoricalColumnStatistics[] =
    stats.categoricalColumns
      .filter((c) => selectedColSet.has(c.columnId))
      .map(sanitizeCategoricalStatsForReport);

  const insightsById = new Map(investigation.insights.map((f) => [f.id, f]));
  const findings: ReportFindingSnapshot[] = [];
  for (const fid of selectedFindingIds) {
    const found = insightsById.get(fid);
    if (found) findings.push(buildFindingSnapshot(found));
  }

  const charts = buildChartSnapshots(selectedCharts, dataset, profile, stats);

  let module08Brief: ReportModule08BriefSnapshot | undefined;
  if (
    aiInclusion.includeModule08Brief &&
    verifiedAiBrief &&
    verifiedAiBrief.datasetId === dataset.id &&
    verifiedAiBrief.profiledAt === profile.profiledAt
  ) {
    module08Brief = {
      datasetId: verifiedAiBrief.datasetId,
      profiledAt: verifiedAiBrief.profiledAt,
      generatedAt: verifiedAiBrief.meta?.generatedAt
        ? new Date(verifiedAiBrief.meta.generatedAt).toISOString()
        : new Date().toISOString(),
      model: verifiedAiBrief.meta?.model ?? 'gemini',
      data: verifiedAiBrief.data,
    };
  }

  return {
    datasetOverview: buildDatasetOverviewSnapshot(dataset, profile),
    numericStats,
    categoricalStats,
    findings,
    charts,
    ...(caseItem ? { caseSnapshot: caseItem } : {}),
    ...(module08Brief ? { module08Brief } : {}),
  };
}

/**
 * Creates a new InvestigationReport bound strictly to the active dataset identity.
 */
export function createReportFromSources(
  existingReports: readonly InvestigationReport[],
  input: CreateReportInput,
  sources: ActiveReportSources,
  now: number = Date.now(),
): InvestigationReport {
  const { dataset, profile, stats, investigation, activeCases, verifiedAiBrief } =
    sources;

  if (dataset.id !== profile.datasetId) {
    throw new Error(
      'Dataset identity mismatch between active dataset and schema profile.',
    );
  }

  let matchedCase: InvestigationCase | undefined;
  if (input.caseId) {
    matchedCase = activeCases.find((c) => c.id === input.caseId);
    if (!matchedCase) {
      throw new Error(
        `Investigation case "${input.caseId}" was not found for the active dataset.`,
      );
    }
    if (matchedCase.datasetId !== dataset.id) {
      throw new Error(
        `Cannot create report: case "${matchedCase.id}" belongs to a previous dataset (${matchedCase.datasetFileName}).`,
      );
    }
  }

  const validFindingIdSet = new Set(investigation.insights.map((f) => f.id));
  const validStatColIdSet = new Set([
    ...stats.numericColumns.map((c) => c.columnId),
    ...stats.categoricalColumns.map((c) => c.columnId),
  ]);

  // Determine default finding selection strictly from verified M07 findings
  let selectedFindingIds: readonly string[];
  if (input.selectedFindingIds !== undefined) {
    selectedFindingIds = Array.from(
      new Set(input.selectedFindingIds.filter((id) => validFindingIdSet.has(id))),
    );
  } else if (matchedCase) {
    selectedFindingIds = matchedCase.findingIds.filter((id) =>
      validFindingIdSet.has(id),
    );
  } else if (input.reportType === 'data_quality') {
    selectedFindingIds = investigation.insights
      .filter(
        (f) =>
          f.category === 'data_quality' ||
          f.classification === 'data_quality_issue',
      )
      .map((f) => f.id);
  } else {
    selectedFindingIds = investigation.insights.map((f) => f.id);
  }

  // Determine default statistical column selection strictly from valid M04 columns
  const selectedStatColumnIds: readonly string[] =
    input.selectedStatColumnIds !== undefined
      ? Array.from(
          new Set(
            input.selectedStatColumnIds.filter((id) =>
              validStatColIdSet.has(id),
            ),
          ),
        )
      : [
          ...stats.numericColumns.map((c) => c.columnId),
          ...stats.categoricalColumns.map((c) => c.columnId),
        ];

  const selectedCharts: readonly ChartConfig[] = input.selectedCharts ?? [];

  const hasValidAiBrief = Boolean(
    verifiedAiBrief &&
      verifiedAiBrief.datasetId === dataset.id &&
      verifiedAiBrief.profiledAt === profile.profiledAt,
  );
  const hasCaseAi = Boolean(matchedCase && matchedCase.aiAnalyses.length > 0);

  const aiInclusion: ReportAiInclusion = {
    includeModule08Brief:
      Boolean(input.aiInclusion?.includeModule08Brief) && hasValidAiBrief,
    includeModule09CaseAnalyses:
      Boolean(input.aiInclusion?.includeModule09CaseAnalyses) && hasCaseAi,
  };

  const typeMeta = REPORT_TYPE_META[input.reportType];
  const defaultTitle = matchedCase
    ? `${matchedCase.title} — ${typeMeta.shortLabel}`
    : `${dataset.fileName} — ${typeMeta.label}`;

  const trimmedTitle = (input.title ?? '').trim().slice(0, 160) || defaultTitle;
  const trimmedSubtitle =
    (input.subtitle ?? '').trim().slice(0, 200) || typeMeta.defaultSubtitle;
  const trimmedAuthor = (input.author ?? '').trim().slice(0, 100);
  const trimmedIntro = (input.introDescription ?? '').trim().slice(0, 1_500);

  const sections: readonly ReportSectionConfig[] =
    input.sections && input.sections.length > 0
      ? input.sections.map((s) => ({
          key: s.key,
          title: s.title.trim().slice(0, 100) || s.key,
          enabled: Boolean(s.enabled),
          ...(s.customNote ? { customNote: s.customNote.slice(0, 800) } : {}),
        }))
      : buildDefaultSections(input.reportType, {
          hasCase: Boolean(matchedCase),
          includeAi:
            aiInclusion.includeModule08Brief ||
            aiInclusion.includeModule09CaseAnalyses,
          hasCharts: selectedCharts.length > 0,
          hasStats: selectedStatColumnIds.length > 0,
          hasFindings: selectedFindingIds.length > 0,
        });

  const snapshot = buildSnapshotFromSources({
    sources,
    selectedFindingIds,
    selectedStatColumnIds,
    selectedCharts,
    caseItem: matchedCase,
    aiInclusion,
  });

  const id = allocateReportId(existingReports);

  return {
    id,
    title: trimmedTitle,
    subtitle: trimmedSubtitle,
    author: trimmedAuthor,
    introDescription: trimmedIntro,
    reportType: input.reportType,
    sourceKind: input.sourceKind,
    datasetId: dataset.id,
    datasetFileName: dataset.fileName,
    datasetProfiledAt: profile.profiledAt,
    ...(matchedCase
      ? { caseId: matchedCase.id, caseTitle: matchedCase.title }
      : {}),
    createdAt: now,
    updatedAt: now,
    sections,
    selectedFindingIds,
    selectedStatColumnIds,
    selectedCharts: snapshot.charts.map((c) => c.config),
    aiInclusion,
    ...(input.customLimitations?.trim()
      ? { customLimitations: input.customLimitations.trim().slice(0, 1_000) }
      : {}),
    ...(input.customConclusion?.trim()
      ? { customConclusion: input.customConclusion.trim().slice(0, 1_200) }
      : {}),
    snapshot,
  };
}

/**
 * Refreshes a report's aggregate snapshot when the active dataset matches.
 * Throws if attempted against a mismatched dataset.
 */
export function refreshReportSnapshot(
  report: InvestigationReport,
  sources: ActiveReportSources,
  now: number = Date.now(),
): InvestigationReport {
  if (report.datasetId !== sources.dataset.id) {
    throw new Error(
      'Cannot refresh report against a different dataset identity.',
    );
  }

  const matchedCase = report.caseId
    ? sources.activeCases.find(
        (c) => c.id === report.caseId && c.datasetId === sources.dataset.id,
      )
    : undefined;

  const snapshot = buildSnapshotFromSources({
    sources,
    selectedFindingIds: report.selectedFindingIds,
    selectedStatColumnIds: report.selectedStatColumnIds,
    selectedCharts: report.selectedCharts,
    caseItem: matchedCase ?? report.snapshot.caseSnapshot,
    aiInclusion: report.aiInclusion,
  });

  return {
    ...report,
    updatedAt: now,
    snapshot,
  };
}

/**
 * Compiles a complete, self-consistent CompiledReportDocument ready for
 * both A4 HTML preview and real A4 PDF export.
 *
 * Enforces strict dataset identity isolation: if `activeSources` belongs to
 * a DIFFERENT dataset, the report compiles strictly from its frozen aggregate
 * snapshot with `isActiveDatasetMatch = false` (never mixing stale & new data).
 */
export function compileReportDocument(
  report: InvestigationReport,
  activeSources?: ActiveReportSources | null,
): CompiledReportDocument {
  const isActiveDatasetMatch = Boolean(
    activeSources && activeSources.dataset.id === report.datasetId,
  );

  let effectiveSnapshot = report.snapshot;
  if (isActiveDatasetMatch && activeSources) {
    const liveCase = report.caseId
      ? activeSources.activeCases.find(
          (c) =>
            c.id === report.caseId && c.datasetId === activeSources.dataset.id,
        )
      : undefined;
    effectiveSnapshot = buildSnapshotFromSources({
      sources: activeSources,
      selectedFindingIds: report.selectedFindingIds,
      selectedStatColumnIds: report.selectedStatColumnIds,
      selectedCharts: report.selectedCharts,
      caseItem: liveCase ?? report.snapshot.caseSnapshot,
      aiInclusion: report.aiInclusion,
    });
  }

  const activeSections = report.sections.filter((s) => s.enabled);
  const enabledKeySet = new Set<ReportSectionKey>(
    activeSections.map((s) => s.key),
  );

  const includeStatsSection = enabledKeySet.has('statistical_findings');
  const includeFindingsSection = enabledKeySet.has('insights_anomalies');
  const includeChartsSection = enabledKeySet.has('visualizations');
  const includeAiSection =
    enabledKeySet.has('ai_interpretation') &&
    (Boolean(effectiveSnapshot.module08Brief) ||
      (report.aiInclusion.includeModule09CaseAnalyses &&
        Boolean(effectiveSnapshot.caseSnapshot?.aiAnalyses.length)));

  const detSummary = buildDeterministicExecutiveSummary({
    datasetOverview: effectiveSnapshot.datasetOverview,
    numericStats: effectiveSnapshot.numericStats,
    categoricalStats: effectiveSnapshot.categoricalStats,
    findings: effectiveSnapshot.findings,
    investigationCase: effectiveSnapshot.caseSnapshot,
  });

  const aiBrief =
    report.aiInclusion.includeModule08Brief && effectiveSnapshot.module08Brief
      ? effectiveSnapshot.module08Brief
      : undefined;

  const caseAnalyses =
    report.aiInclusion.includeModule09CaseAnalyses &&
    effectiveSnapshot.caseSnapshot
      ? effectiveSnapshot.caseSnapshot.aiAnalyses
      : [];

  const methodology = deriveMethodologyItems({
    datasetOverview: effectiveSnapshot.datasetOverview,
    numericStats: effectiveSnapshot.numericStats,
    categoricalStats: effectiveSnapshot.categoricalStats,
    findings: effectiveSnapshot.findings,
    charts: effectiveSnapshot.charts,
    includeStatsSection,
    includeFindingsSection,
    includeChartsSection,
    includeAiSection,
  });

  const limitations = deriveLimitationsAndConclusions({
    datasetOverview: effectiveSnapshot.datasetOverview,
    numericStats: effectiveSnapshot.numericStats,
    categoricalStats: effectiveSnapshot.categoricalStats,
    findings: effectiveSnapshot.findings,
    charts: effectiveSnapshot.charts,
    investigationCase: effectiveSnapshot.caseSnapshot,
    includeAi: Boolean(aiBrief) || caseAnalyses.length > 0,
    customLimitations: report.customLimitations,
    customConclusion: report.customConclusion,
  });

  return {
    report,
    isActiveDatasetMatch,
    generatedAt: report.updatedAt,
    activeSections,
    executiveSummary: {
      deterministicSummary: detSummary.deterministicSummary,
      ...(aiBrief
        ? {
            aiBriefSummary: aiBrief.data.brief.executiveSummary,
            aiBriefModel: aiBrief.model,
            aiBriefGeneratedAt: aiBrief.generatedAt,
          }
        : {}),
      keyHighlights: detSummary.keyHighlights,
    },
    datasetOverview: effectiveSnapshot.datasetOverview,
    methodology,
    numericStats: effectiveSnapshot.numericStats,
    categoricalStats: effectiveSnapshot.categoricalStats,
    findings: effectiveSnapshot.findings,
    charts: effectiveSnapshot.charts,
    ...(effectiveSnapshot.caseSnapshot
      ? { investigationCase: effectiveSnapshot.caseSnapshot }
      : {}),
    aiInterpretations: {
      ...(aiBrief ? { module08Brief: aiBrief } : {}),
      module09CaseAnalyses: caseAnalyses,
    },
    limitations,
  };
}

/* ── Pure Report Editing & Library Operations ───────────────────────────── */

export function updateReportMetadata(
  report: InvestigationReport,
  updates: {
    readonly title?: string;
    readonly subtitle?: string;
    readonly author?: string;
    readonly introDescription?: string;
    readonly reportType?: ReportType;
    readonly customLimitations?: string;
    readonly customConclusion?: string;
  },
  now: number = Date.now(),
): InvestigationReport {
  return {
    ...report,
    title:
      updates.title !== undefined
        ? updates.title.trim().slice(0, 160) || report.title
        : report.title,
    subtitle:
      updates.subtitle !== undefined
        ? updates.subtitle.trim().slice(0, 200)
        : report.subtitle,
    author:
      updates.author !== undefined
        ? updates.author.trim().slice(0, 100)
        : report.author,
    introDescription:
      updates.introDescription !== undefined
        ? updates.introDescription.trim().slice(0, 1_500)
        : report.introDescription,
    reportType: updates.reportType ?? report.reportType,
    customLimitations:
      updates.customLimitations !== undefined
        ? updates.customLimitations.trim().slice(0, 1_000)
        : report.customLimitations,
    customConclusion:
      updates.customConclusion !== undefined
        ? updates.customConclusion.trim().slice(0, 1_200)
        : report.customConclusion,
    updatedAt: now,
  };
}

export function reorderReportSections(
  report: InvestigationReport,
  fromIndex: number,
  toIndex: number,
  now: number = Date.now(),
): InvestigationReport {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= report.sections.length ||
    toIndex >= report.sections.length ||
    fromIndex === toIndex
  ) {
    return report;
  }
  const next = [...report.sections];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return report;
  next.splice(toIndex, 0, moved);
  return {
    ...report,
    sections: next,
    updatedAt: now,
  };
}

export function toggleReportSection(
  report: InvestigationReport,
  sectionKey: ReportSectionKey,
  enabled?: boolean,
  now: number = Date.now(),
): InvestigationReport {
  const nextSections = report.sections.map((s) =>
    s.key === sectionKey
      ? { ...s, enabled: enabled !== undefined ? enabled : !s.enabled }
      : s,
  );
  return {
    ...report,
    sections: nextSections,
    updatedAt: now,
  };
}

export function updateReportSectionTitle(
  report: InvestigationReport,
  sectionKey: ReportSectionKey,
  title: string,
  now: number = Date.now(),
): InvestigationReport {
  const trimmed = title.trim().slice(0, 100);
  if (!trimmed) return report;
  return {
    ...report,
    sections: report.sections.map((s) =>
      s.key === sectionKey ? { ...s, title: trimmed } : s,
    ),
    updatedAt: now,
  };
}

export function updateReportSelections(
  report: InvestigationReport,
  updates: {
    readonly selectedFindingIds?: readonly string[];
    readonly selectedStatColumnIds?: readonly string[];
    readonly selectedCharts?: readonly ChartConfig[];
    readonly aiInclusion?: ReportAiInclusion;
  },
  activeSources?: ActiveReportSources | null,
  now: number = Date.now(),
): InvestigationReport {
  const nextReport: InvestigationReport = {
    ...report,
    selectedFindingIds: updates.selectedFindingIds ?? report.selectedFindingIds,
    selectedStatColumnIds:
      updates.selectedStatColumnIds ?? report.selectedStatColumnIds,
    selectedCharts: updates.selectedCharts ?? report.selectedCharts,
    aiInclusion: updates.aiInclusion ?? report.aiInclusion,
    updatedAt: now,
  };

  if (activeSources && activeSources.dataset.id === report.datasetId) {
    return refreshReportSnapshot(nextReport, activeSources, now);
  }
  return nextReport;
}

export function duplicateReport(
  existingReports: readonly InvestigationReport[],
  sourceReport: InvestigationReport,
  now: number = Date.now(),
): InvestigationReport {
  const id = allocateReportId(existingReports);
  const copyTitle = `${sourceReport.title.replace(/\s*\(Copy\)$/i, '')} (Copy)`.slice(
    0,
    160,
  );
  return {
    ...sourceReport,
    id,
    title: copyTitle,
    createdAt: now,
    updatedAt: now,
    sections: sourceReport.sections.map((s) => ({ ...s })),
    selectedFindingIds: [...sourceReport.selectedFindingIds],
    selectedStatColumnIds: [...sourceReport.selectedStatColumnIds],
    selectedCharts: sourceReport.selectedCharts.map((c) => ({ ...c })),
    aiInclusion: { ...sourceReport.aiInclusion },
  };
}

export function deleteReportById(
  reports: readonly InvestigationReport[],
  reportId: string,
): readonly InvestigationReport[] {
  return reports.filter((r) => r.id !== reportId);
}

export function partitionReportsByDataset(
  reports: readonly InvestigationReport[],
  activeDatasetId: string | null,
): {
  readonly currentDatasetReports: readonly InvestigationReport[];
  readonly previousDatasetReports: readonly InvestigationReport[];
} {
  if (!activeDatasetId) {
    return {
      currentDatasetReports: [],
      previousDatasetReports: reports,
    };
  }
  const currentDatasetReports: InvestigationReport[] = [];
  const previousDatasetReports: InvestigationReport[] = [];
  for (const r of reports) {
    if (r.datasetId === activeDatasetId) {
      currentDatasetReports.push(r);
    } else {
      previousDatasetReports.push(r);
    }
  }
  return { currentDatasetReports, previousDatasetReports };
}

export function buildReportSafeFilename(report: InvestigationReport): string {
  const slug = report.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const prefix = report.id.toLowerCase();
  return `${prefix}-${slug || 'data-detective-report'}.pdf`;
}
