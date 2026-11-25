import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  FolderPlus,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { useDataset } from '@/context/DatasetContext';
import {
  InvestigationProvider,
  useInvestigation,
  useOptionalInvestigation,
} from '@/context/InvestigationContext';
import {
  analyzeDatasetInsights,
  DEFAULT_ANOMALY_CONFIG,
} from '@/engine/investigation';
import type {
  AnomalyDetectionConfig,
  DatasetInsight,
  InsightCategory,
  InsightClassification,
  InsightSeverity,
  InvestigationCasePriority,
} from '@/types';
import { cn, formatCount } from '@/utils';
import { CaseDetailView } from './CaseDetailView';
import { CasesOverviewPanel } from './CasesOverviewPanel';
import { InsightCard, type LinkedCaseRef } from './InsightCard';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  SEVERITY_META,
  SEVERITY_ORDER,
} from './investigationLabels';

type SeverityFilter = 'all' | InsightSeverity;
type ClassificationFilter = 'all' | InsightClassification;
type AssignmentFilter = 'all' | 'unassigned' | 'important_unresolved';
type InsightSortMode = 'severity' | 'category' | 'column';

const IQR_MULTIPLIER_OPTIONS = [
  { value: 1.5, label: '1.5× (Standard Tukey)' },
  { value: 2.0, label: '2.0× (Moderate)' },
  { value: 3.0, label: '3.0× (Extreme Only)' },
] as const;

const ZSCORE_THRESHOLD_OPTIONS = [
  { value: 2.5, label: '|z| > 2.5σ' },
  { value: 3.0, label: '|z| > 3.0σ (Standard)' },
  { value: 3.5, label: '|z| > 3.5σ (Strict)' },
] as const;

/**
 * Module 07 + Module 09 — Integrated Investigation Center (`/investigation`).
 *
 * Unifies deterministic Module 07 findings, Module 08 AI intelligence (when
 * available), and Module 09 investigation case management, evidence boards,
 * structured notes/hypotheses, AI-assisted case analysis, and timelines.
 */
export function InvestigationCenterPage() {
  const existing = useOptionalInvestigation();
  if (!existing) {
    return (
      <InvestigationProvider>
        <InvestigationCenterContent />
      </InvestigationProvider>
    );
  }
  return <InvestigationCenterContent />;
}

function InvestigationCenterContent() {
  const {
    activeDataset,
    datasetProfile,
    profilingStatus,
    profilingError,
    reprofileDataset,
    statisticalSummary,
    statisticsStatus,
    statisticsError,
    recomputeStatistics,
  } = useDataset();

  const {
    allCases,
    currentDatasetCases,
    previousDatasetCases,
    verifiedAiBrief,
    createCase,
    updateCase,
    setCaseStatus,
    setCasePriority,
    archiveCaseById,
    reopenCaseById,
    attachFinding,
    addEvidence,
    removeEvidence,
    addNote,
    editNote,
    deleteNote,
    saveCaseAiAnalysis,
  } = useInvestigation();

  const [searchParams, setSearchParams] = useSearchParams();
  const focusedFindingId = searchParams.get('finding');
  const activeCaseId = searchParams.get('case');

  const [detectionConfig, setDetectionConfig] =
    useState<AnomalyDetectionConfig>(DEFAULT_ANOMALY_CONFIG);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [classificationFilter, setClassificationFilter] =
    useState<ClassificationFilter>('all');
  const [assignmentFilter, setAssignmentFilter] =
    useState<AssignmentFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<InsightSortMode>('severity');
  const [selectedFindingIds, setSelectedFindingIds] = useState<string[]>([]);

  // Reset transient finding selections when dataset changes or is cleared
  useEffect(() => {
    setSelectedFindingIds([]);
  }, [activeDataset?.id]);

  const investigationSummary = useMemo(() => {
    if (!activeDataset || !datasetProfile || !statisticalSummary) return null;
    return analyzeDatasetInsights(
      activeDataset,
      datasetProfile,
      statisticalSummary,
      detectionConfig,
    );
  }, [activeDataset, datasetProfile, statisticalSummary, detectionConfig]);

  const validFindingIdSet = useMemo<ReadonlySet<string>>(() => {
    if (!investigationSummary) return new Set();
    return new Set(investigationSummary.insights.map((f) => f.id));
  }, [investigationSummary]);

  const insightsById = useMemo<ReadonlyMap<string, DatasetInsight>>(() => {
    if (!investigationSummary) return new Map();
    return new Map(investigationSummary.insights.map((f) => [f.id, f]));
  }, [investigationSummary]);

  // Map finding ID -> linked non-archived cases for the CURRENT dataset only
  const linkedCasesByFindingId = useMemo(() => {
    const map = new Map<string, LinkedCaseRef[]>();
    for (const c of currentDatasetCases) {
      if (c.archived) continue;
      for (const fid of c.findingIds) {
        const list = map.get(fid) ?? [];
        list.push({ id: c.id, title: c.title, status: c.status });
        map.set(fid, list);
      }
    }
    return map;
  }, [currentDatasetCases]);

  const resolvedFindingIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of currentDatasetCases) {
      if (c.status === 'resolved') {
        for (const fid of c.findingIds) set.add(fid);
      }
    }
    return set;
  }, [currentDatasetCases]);

  const activeCaseChoices = useMemo(
    () =>
      currentDatasetCases
        .filter((c) => !c.archived)
        .map((c) => ({ id: c.id, title: c.title })),
    [currentDatasetCases],
  );

  const openCaseById = (caseId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('case', caseId);
    next.delete('finding');
    setSearchParams(next);
  };

  const closeCaseDetail = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('case');
    setSearchParams(next);
  };

  const handleCreateCaseFromFinding = (finding: DatasetInsight) => {
    const res = createCase({
      title: finding.title,
      description: finding.explanation,
      initialFindings: [finding],
    });
    if (res) {
      openCaseById(res.caseItem.id);
    }
  };

  const handleCreateCaseFromSelected = () => {
    const findings = selectedFindingIds
      .map((id) => insightsById.get(id))
      .filter((f): f is DatasetInsight => f !== undefined);
    if (findings.length === 0) return;

    const title =
      findings.length === 1
        ? findings[0]!.title
        : `Combined Investigation: ${findings.length} Findings (${findings[0]!.affectedColumnNames[0] ?? activeDataset?.fileName ?? 'Dataset'})`;

    const res = createCase({
      title,
      description: `Investigating ${findings.length} selected deterministic findings together.`,
      initialFindings: findings,
    });
    if (res) {
      setSelectedFindingIds([]);
      openCaseById(res.caseItem.id);
    }
  };

  const handleAttachFinding = (caseId: string, finding: DatasetInsight) => {
    attachFinding(caseId, finding, validFindingIdSet);
  };

  const handleCreateManualCase = (input: {
    readonly title: string;
    readonly description: string;
    readonly priority: InvestigationCasePriority;
    readonly initialFindingIds: readonly string[];
  }) => {
    const initialFindings = input.initialFindingIds
      .map((id) => insightsById.get(id))
      .filter((f): f is DatasetInsight => f !== undefined);

    const res = createCase({
      title: input.title,
      description: input.description,
      priority: input.priority,
      initialFindings,
    });
    if (!res) return null;
    return {
      created: res.created,
      caseId: res.caseItem.id,
      duplicateReason: res.duplicateReason,
    };
  };

  const handleCreateCaseFromRecommendation = (
    title: string,
    reason: string,
    findingIds: readonly string[],
  ) => {
    const initialFindings = findingIds
      .map((id) => insightsById.get(id))
      .filter((f): f is DatasetInsight => f !== undefined);

    const res = createCase({
      title,
      description: reason,
      initialFindings,
    });
    if (res) {
      openCaseById(res.caseItem.id);
    }
  };

  const toggleSelectFinding = (findingId: string) => {
    setSelectedFindingIds((prev) =>
      prev.includes(findingId)
        ? prev.filter((id) => id !== findingId)
        : [...prev, findingId],
    );
  };

  const selectedCase = useMemo(
    () => (activeCaseId ? allCases.find((c) => c.id === activeCaseId) ?? null : null),
    [activeCaseId, allCases],
  );

  // Findings counts for Module 09 overview
  const unassignedCount = useMemo(() => {
    if (!investigationSummary) return 0;
    return investigationSummary.insights.filter(
      (f) => (linkedCasesByFindingId.get(f.id)?.length ?? 0) === 0,
    ).length;
  }, [investigationSummary, linkedCasesByFindingId]);

  const importantUnresolvedCount = useMemo(() => {
    if (!investigationSummary) return 0;
    return investigationSummary.insights.filter(
      (f) =>
        (f.severity === 'critical' || f.severity === 'high') &&
        !resolvedFindingIds.has(f.id),
    ).length;
  }, [investigationSummary, resolvedFindingIds]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredInsights = useMemo<readonly DatasetInsight[]>(() => {
    if (!investigationSummary) return [];

    const matched = investigationSummary.insights.filter((insight) => {
      if (severityFilter !== 'all' && insight.severity !== severityFilter) {
        return false;
      }
      if (
        classificationFilter !== 'all' &&
        insight.classification !== classificationFilter
      ) {
        return false;
      }
      if (assignmentFilter === 'unassigned') {
        if ((linkedCasesByFindingId.get(insight.id)?.length ?? 0) > 0) {
          return false;
        }
      } else if (assignmentFilter === 'important_unresolved') {
        const isImportant =
          insight.severity === 'critical' || insight.severity === 'high';
        if (!isImportant || resolvedFindingIds.has(insight.id)) {
          return false;
        }
      }
      if (normalizedQuery) {
        const haystack = [
          insight.title,
          insight.explanation,
          ...insight.affectedColumnNames,
          CATEGORY_META[insight.category].label,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });

    const sorted = [...matched];
    if (sortMode === 'column') {
      sorted.sort((a, b) => {
        const colA = (a.affectedColumnNames[0] ?? '').toLowerCase();
        const colB = (b.affectedColumnNames[0] ?? '').toLowerCase();
        if (colA !== colB) return colA < colB ? -1 : 1;
        return (
          SEVERITY_META[a.severity].rank - SEVERITY_META[b.severity].rank
        );
      });
    } else if (sortMode === 'category') {
      sorted.sort((a, b) => {
        const idxA = CATEGORY_ORDER.indexOf(a.category);
        const idxB = CATEGORY_ORDER.indexOf(b.category);
        if (idxA !== idxB) return idxA - idxB;
        return (
          SEVERITY_META[a.severity].rank - SEVERITY_META[b.severity].rank
        );
      });
    } else {
      sorted.sort((a, b) => {
        const sevDiff =
          SEVERITY_META[a.severity].rank - SEVERITY_META[b.severity].rank;
        if (sevDiff !== 0) return sevDiff;
        return (
          CATEGORY_ORDER.indexOf(a.category) -
          CATEGORY_ORDER.indexOf(b.category)
        );
      });
    }

    return sorted;
  }, [
    investigationSummary,
    severityFilter,
    classificationFilter,
    assignmentFilter,
    linkedCasesByFindingId,
    resolvedFindingIds,
    normalizedQuery,
    sortMode,
  ]);

  // Group filtered insights by category in canonical order
  const groupedInsights = useMemo(() => {
    const map = new Map<InsightCategory, DatasetInsight[]>();
    for (const insight of filteredInsights) {
      const existing = map.get(insight.category);
      if (existing) existing.push(insight);
      else map.set(insight.category, [insight]);
    }
    return CATEGORY_ORDER.filter((cat) => map.has(cat)).map((cat) => ({
      category: cat,
      items: map.get(cat)!,
    }));
  }, [filteredInsights]);

  // 0. If user explicitly opened a case detail (even a read-only previous-dataset case)
  if (selectedCase) {
    return (
      <PageContainer width="wide">
        <CaseDetailView
          caseItem={selectedCase}
          activeDatasetId={activeDataset?.id ?? null}
          activeDatasetFileName={activeDataset?.fileName ?? null}
          profile={datasetProfile}
          stats={statisticalSummary}
          investigation={investigationSummary}
          existingBrief={verifiedAiBrief}
          onBackToOverview={closeCaseDetail}
          onUpdateDetails={(updates) => updateCase(selectedCase.id, updates)}
          onChangeStatus={(status) => setCaseStatus(selectedCase.id, status)}
          onChangePriority={(priority) =>
            setCasePriority(selectedCase.id, priority)
          }
          onArchive={() => archiveCaseById(selectedCase.id)}
          onReopen={() => reopenCaseById(selectedCase.id)}
          onAddEvidence={(item) => addEvidence(selectedCase.id, item)}
          onRemoveEvidence={(evidenceId) =>
            removeEvidence(selectedCase.id, evidenceId)
          }
          onAddNote={(input) => addNote(selectedCase.id, input)}
          onEditNote={(noteId, updates) =>
            editNote(selectedCase.id, noteId, updates)
          }
          onDeleteNote={(noteId) => deleteNote(selectedCase.id, noteId)}
          onRecordAiAnalysis={(record) =>
            saveCaseAiAnalysis(selectedCase.id, record)
          }
        />
      </PageContainer>
    );
  }

  // 1. Empty state: no dataset loaded yet
  if (!activeDataset) {
    return (
      <PageContainer width="standard">
        <div
          className="dd-anim-file-enter space-y-6"
          data-testid="investigation-no-dataset-state"
        >
          <section className="dd-surface-primary space-y-5 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DossierLabel
                code="SEC-04"
                label="Automated Insights & Cases"
              />
              <StatusIndicator tone="neutral" label="No Active Dataset" />
            </div>

            <div className="space-y-2">
              <h2 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-[var(--dd-text-primary)]">
                Investigation Center
              </h2>
              <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--dd-text-secondary)]">
                Import a CSV or Excel (.xlsx) dataset on the Overview workspace
                to run deterministic anomaly detection (IQR & optional Z-score
                outliers), open investigation cases, build verified evidence
                boards, record hypotheses, and run aggregate-only AI case
                interpretations.
              </p>
            </div>

            <div className="border-t border-[var(--dd-border-subtle)] pt-5">
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20 whitespace-nowrap"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Import Dataset on Overview</span>
              </Link>
            </div>
          </section>

          {/* Clearly isolated previous-dataset case notice when dataset was cleared */}
          {previousDatasetCases.length > 0 && (
            <section
              data-testid="cleared-dataset-previous-cases"
              className="dd-surface-primary space-y-3 border-[var(--dd-status-warning-border)] p-5"
            >
              <div className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-status-warning)]">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  Inactive Session Cases from Previous Dataset (
                  {formatCount(previousDatasetCases.length)})
                </span>
              </div>
              <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
                The active dataset has been cleared. Previous cases are retained
                read-only for reference and are not attached to any active
                dataset.
              </p>
              <div className="divide-y divide-[var(--dd-border-subtle)] rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)]">
                {previousDatasetCases.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 px-3.5 py-2 text-[0.8125rem]"
                  >
                    <span className="truncate text-[var(--dd-text-primary)]">
                      <span className="font-mono text-[0.75rem] text-[var(--dd-text-muted)]">
                        {c.id} ({c.datasetFileName}) ·{' '}
                      </span>
                      {c.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => openCaseById(c.id)}
                      className="shrink-0 cursor-pointer font-mono text-[0.75rem] text-[var(--dd-accent-teal)] hover:underline"
                    >
                      Review (Read-Only)
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </PageContainer>
    );
  }

  // 2. Error state (if M03 or M04 errored)
  if (profilingStatus === 'error' || statisticsStatus === 'error') {
    const isProfileFailure = profilingStatus === 'error';
    const message = isProfileFailure
      ? (profilingError ??
        'Dataset schema profiling failed before investigation could run.')
      : (statisticsError ??
        'Statistical analysis failed before investigation could run.');

    return (
      <PageContainer width="standard">
        <div className="dd-anim-file-enter">
          <section
            role="alert"
            data-testid="investigation-error-state"
            className="dd-surface-primary flex flex-col gap-4 border-[var(--dd-status-anomaly-border)] p-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--dd-status-anomaly)]"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <h2 className="text-[1rem] font-semibold text-[var(--dd-text-primary)]">
                  Automated investigation failed
                </h2>
                <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
                  {message}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={
                isProfileFailure ? reprofileDataset : recomputeStatistics
              }
              className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:border-[var(--dd-accent-teal-border)] whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Retry Investigation</span>
            </button>
          </section>
        </div>
      </PageContainer>
    );
  }

  // 3. Loading state
  if (
    profilingStatus === 'profiling' ||
    statisticsStatus === 'analyzing' ||
    !datasetProfile ||
    !statisticalSummary ||
    !investigationSummary
  ) {
    return (
      <PageContainer width="standard">
        <div className="dd-anim-file-enter">
          <section
            data-testid="investigation-loading-state"
            className="dd-surface-primary flex items-center gap-4 p-6"
          >
            <Loader2
              className="h-5 w-5 animate-spin text-[var(--dd-accent-teal)]"
              aria-hidden="true"
            />
            <div className="space-y-0.5">
              <h2 className="text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
                Running Deterministic Investigation
              </h2>
              <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
                Evaluating data quality signals, statistical distributions, IQR
                fences, and pairwise correlations…
              </p>
            </div>
          </section>
        </div>
      </PageContainer>
    );
  }

  const { overview } = investigationSummary;
  const activeCaseCount = currentDatasetCases.filter((c) => !c.archived).length;
  const hasActiveUiFilters =
    severityFilter !== 'all' ||
    classificationFilter !== 'all' ||
    assignmentFilter !== 'all' ||
    normalizedQuery.length > 0;

  return (
    <PageContainer width="wide">
      <div
        className="dd-anim-file-enter space-y-8"
        data-testid="investigation-center-workspace"
      >
        {/* Shared Workspace Header */}
        <WorkspaceHeader
          code="SEC-04"
          sectionLabel="Automated Insights & Cases"
          title="Investigation Center"
          status={
            <StatusIndicator
              tone={
                overview.dataQualityIssueCount > 0
                  ? 'warning'
                  : overview.totalFindings > 0
                    ? 'analytical'
                    : 'verified'
              }
              label={
                overview.totalFindings === 0
                  ? 'No Anomalies Triggered'
                  : `${formatCount(overview.totalFindings)} ${overview.totalFindings === 1 ? 'Finding' : 'Findings'} · ${formatCount(activeCaseCount)} ${activeCaseCount === 1 ? 'Case' : 'Cases'}`
              }
            />
          }
          context={`Active dataset in memory: ${activeDataset.fileName} · ${formatCount(datasetProfile.rowCount)} rows · ${formatCount(datasetProfile.columnCount)} columns · Computed in ${formatCount(investigationSummary.durationMs)} ms`}
          navigationLinks={[
            {
              label: 'Data Explorer',
              to: '/explorer',
              testId: 'investigation-nav-explorer',
            },
            {
              label: 'Visualization Studio',
              to: '/visualizations',
              testId: 'investigation-nav-visualizations',
            },
            {
              label: 'AI Assistant',
              to: '/assistant',
              testId: 'investigation-nav-assistant',
            },
          ]}
          actions={
            <Link
              to="/reports?source=dataset&type=investigation_dossier"
              data-testid="investigation-create-report-link"
              className="inline-flex items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3.5 py-2 font-mono text-[0.78125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20 whitespace-nowrap"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Create Report</span>
            </Link>
          }
        />

        {/* Band 1: Clean 4-Column Investigation KPI Summary */}
        <section
          aria-label="Investigation summary metrics"
          className="dd-surface-primary p-5"
        >
          <dl
            data-testid="investigation-overview-strip"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="space-y-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-4 py-3.5">
              <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-text-muted)]">
                Total Findings
              </dt>
              <dd className="font-mono text-[1.5rem] font-semibold leading-tight text-[var(--dd-text-primary)] dd-tabular">
                {formatCount(overview.totalFindings)}
              </dd>
              <dd className="font-mono text-[0.71875rem] text-[var(--dd-text-secondary)] dd-tabular">
                {formatCount(overview.affectedColumnCount)} /{' '}
                {formatCount(datasetProfile.columnCount)} affected columns
              </dd>
            </div>

            <div className="space-y-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-4 py-3.5">
              <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-accent-teal)]">
                Active Cases
              </dt>
              <dd className="font-mono text-[1.5rem] font-semibold leading-tight text-[var(--dd-text-primary)] dd-tabular">
                {formatCount(activeCaseCount)}
              </dd>
              <dd className="font-mono text-[0.71875rem] text-[var(--dd-text-secondary)] dd-tabular">
                {formatCount(unassignedCount)} unassigned ·{' '}
                <span
                  className={
                    importantUnresolvedCount > 0
                      ? 'text-[var(--dd-status-anomaly)]'
                      : undefined
                  }
                >
                  {formatCount(importantUnresolvedCount)} urgent unresolved
                </span>
              </dd>
            </div>

            <div className="space-y-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-4 py-3.5">
              <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-status-anomaly)]">
                Data-Quality Issues
              </dt>
              <dd className="font-mono text-[1.5rem] font-semibold leading-tight text-[var(--dd-text-primary)] dd-tabular">
                {formatCount(overview.dataQualityIssueCount)}
              </dd>
              <dd className="font-mono text-[0.71875rem] text-[var(--dd-text-secondary)] dd-tabular">
                {formatCount(overview.bySeverity.critical)} critical ·{' '}
                {formatCount(overview.bySeverity.high)} high severity
              </dd>
            </div>

            <div className="space-y-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-4 py-3.5">
              <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-status-warning)]">
                Outliers &amp; Observations
              </dt>
              <dd className="font-mono text-[1.5rem] font-semibold leading-tight text-[var(--dd-text-primary)] dd-tabular">
                {formatCount(
                  overview.statisticalOutlierCount +
                    overview.notableObservationCount,
                )}
              </dd>
              <dd className="font-mono text-[0.71875rem] text-[var(--dd-text-secondary)] dd-tabular">
                {formatCount(overview.statisticalOutlierCount)} Statistical
                Outliers · {formatCount(overview.notableObservationCount)}{' '}
                Notable Observations
              </dd>
            </div>
          </dl>
        </section>

        {/* Band 2: Investigation Cases & AI Synthesis */}
        <section
          aria-label="Investigation cases workspace"
          data-testid="investigation-cases-section"
          className="space-y-4"
        >
          <CasesOverviewPanel
            currentDatasetCases={currentDatasetCases}
            previousDatasetCases={previousDatasetCases}
            insights={investigationSummary.insights}
            verifiedAiBrief={verifiedAiBrief}
            onCreateManualCase={handleCreateManualCase}
            onOpenCase={openCaseById}
            onReopenCase={reopenCaseById}
            onCreateCaseFromRecommendation={handleCreateCaseFromRecommendation}
          />
        </section>

        {/* Band 3: Automated Findings Registry (explicitly separated from Cases) */}
        <section
          aria-label="Automated findings registry"
          data-testid="investigation-findings-section"
          className="space-y-5 border-t border-[var(--dd-border-subtle)] pt-8"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <div className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
                AUTOMATED FINDINGS REGISTRY ·{' '}
                {formatCount(overview.totalFindings)}{' '}
                {overview.totalFindings === 1 ? 'SIGNAL' : 'SIGNALS'}
              </div>
              <h3 className="text-[1.125rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]">
                Deterministic Findings &amp; Anomaly Signals
              </h3>
            </div>

            {/* Detection Controls (IQR multiplier + optional Z-score) */}
            <div
              data-testid="anomaly-detection-controls"
              className="flex flex-wrap items-center gap-3 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] px-3.5 py-2"
            >
              <div className="flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Detector:</span>
              </div>

              <label className="inline-flex items-center gap-1.5 text-[0.75rem] text-[var(--dd-text-secondary)]">
                <span className="font-mono text-[0.6875rem] uppercase text-[var(--dd-text-muted)]">
                  IQR
                </span>
                <select
                  aria-label="IQR Multiplier"
                  value={detectionConfig.iqrMultiplier}
                  onChange={(e) =>
                    setDetectionConfig((prev) => ({
                      ...prev,
                      iqrMultiplier: Number(e.target.value),
                    }))
                  }
                  className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2 py-1 font-mono text-[0.75rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                >
                  {IQR_MULTIPLIER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="inline-flex cursor-pointer items-center gap-1.5 text-[0.75rem] text-[var(--dd-text-secondary)]">
                <input
                  type="checkbox"
                  checked={detectionConfig.enableZScore}
                  onChange={(e) =>
                    setDetectionConfig((prev) => ({
                      ...prev,
                      enableZScore: e.target.checked,
                    }))
                  }
                  className="h-3.5 w-3.5 accent-[var(--dd-accent-teal)]"
                />
                <span>Z-Score</span>
              </label>

              {detectionConfig.enableZScore && (
                <select
                  aria-label="Z-Score Threshold"
                  value={detectionConfig.zScoreThreshold}
                  onChange={(e) =>
                    setDetectionConfig((prev) => ({
                      ...prev,
                      zScoreThreshold: Number(e.target.value),
                    }))
                  }
                  className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2 py-1 font-mono text-[0.75rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                >
                  {ZSCORE_THRESHOLD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {overview.totalFindings === 0 ? (
            <div
              data-testid="investigation-clean-state"
              className="dd-surface-primary space-y-4 p-8 text-center"
            >
              <CheckCircle2
                className="mx-auto h-7 w-7 text-[var(--dd-status-verified)]"
                aria-hidden="true"
              />
              <div className="space-y-1.5">
                <h4 className="text-[1.0625rem] font-semibold text-[var(--dd-text-primary)]">
                  No deterministic anomalies or quality warnings triggered
                </h4>
                <p className="mx-auto max-w-xl text-[0.875rem] text-[var(--dd-text-secondary)]">
                  {datasetProfile.rowCount === 0
                    ? 'This dataset contains zero data rows. Import a file with observations to run automated anomaly checks.'
                    : 'All checked columns fall within the current IQR thresholds, completeness targets, and distribution bounds. You can enable Z-score detection, open a manual investigation case above, or inspect records in Data Explorer.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <Link
                  to="/explorer"
                  className="inline-flex items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3.5 py-1.5 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] hover:border-[var(--dd-accent-teal-border)]"
                >
                  Open Data Explorer
                </Link>
                <Link
                  to="/visualizations"
                  className="inline-flex items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3.5 py-1.5 text-[0.8125rem] font-medium text-[var(--dd-text-primary)]"
                >
                  Open Visualization Studio
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Search, Severity, Classification, Assignment & Sort Toolbar */}
              <div
                aria-label="Filter and sort findings"
                className="dd-surface-primary space-y-3.5 p-4 sm:p-5"
              >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                {/* Search input */}
                <div className="relative flex-1 lg:max-w-md">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[var(--dd-text-muted)]"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    aria-label="Search investigation findings"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search findings by column, title, or category…"
                    className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] py-2 pr-8 pl-9 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none placeholder:text-[var(--dd-text-muted)] focus:border-[var(--dd-accent-teal-border)]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear findings search"
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-[var(--dd-text-muted)] hover:text-[var(--dd-text-primary)]"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>

                {/* Sort, Assignment & Classification Filter */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <select
                    aria-label="Filter by case assignment"
                    value={assignmentFilter}
                    onChange={(e) =>
                      setAssignmentFilter(e.target.value as AssignmentFilter)
                    }
                    className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-2 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                  >
                    <option value="all">
                      All Findings ({formatCount(overview.totalFindings)})
                    </option>
                    <option value="unassigned">
                      Unassigned Findings ({formatCount(unassignedCount)})
                    </option>
                    <option value="important_unresolved">
                      Important Unresolved ({formatCount(importantUnresolvedCount)})
                    </option>
                  </select>

                  <select
                    aria-label="Filter by finding classification"
                    value={classificationFilter}
                    onChange={(e) =>
                      setClassificationFilter(
                        e.target.value as ClassificationFilter,
                      )
                    }
                    className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-2 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                  >
                    <option value="all">
                      All Types ({formatCount(overview.totalFindings)})
                    </option>
                    <option value="data_quality_issue">
                      Confirmed Data-Quality Issues (
                      {formatCount(overview.dataQualityIssueCount)})
                    </option>
                    <option value="statistical_outlier">
                      Statistical Outliers (
                      {formatCount(overview.statisticalOutlierCount)})
                    </option>
                    <option value="notable_observation">
                      Notable Observations (
                      {formatCount(overview.notableObservationCount)})
                    </option>
                  </select>

                  <select
                    aria-label="Sort investigation findings"
                    value={sortMode}
                    onChange={(e) =>
                      setSortMode(e.target.value as InsightSortMode)
                    }
                    className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-2 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                  >
                    <option value="severity">Sort: Severity</option>
                    <option value="category">Sort: Category</option>
                    <option value="column">Sort: Affected Column</option>
                  </select>
                </div>
              </div>

              {/* Severity filter bar */}
              <div
                role="tablist"
                aria-label="Filter findings by severity"
                className="flex flex-wrap items-center gap-1.5 border-t border-[var(--dd-border-subtle)] pt-3"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={severityFilter === 'all'}
                  onClick={() => setSeverityFilter('all')}
                  className={cn(
                    'cursor-pointer rounded-[var(--dd-radius-sm)] border px-2.5 py-1 font-mono text-[0.75rem] transition-colors',
                    severityFilter === 'all'
                      ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-text-primary)]'
                      : 'border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)]',
                  )}
                >
                  All ({formatCount(overview.totalFindings)})
                </button>

                {SEVERITY_ORDER.map((sev) => {
                  const count = overview.bySeverity[sev];
                  return (
                    <button
                      key={sev}
                      type="button"
                      role="tab"
                      aria-selected={severityFilter === sev}
                      onClick={() => setSeverityFilter(sev)}
                      className={cn(
                        'cursor-pointer rounded-[var(--dd-radius-sm)] border px-2.5 py-1 font-mono text-[0.75rem] transition-colors',
                        severityFilter === sev
                          ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-text-primary)]'
                          : 'border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)]',
                      )}
                    >
                      {SEVERITY_META[sev].label} ({formatCount(count)})
                    </button>
                  );
                })}

                {hasActiveUiFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSeverityFilter('all');
                      setClassificationFilter('all');
                      setAssignmentFilter('all');
                      setSearchQuery('');
                    }}
                    className="ml-auto cursor-pointer font-mono text-[0.75rem] text-[var(--dd-accent-teal)] hover:text-[var(--dd-accent-teal-hover)]"
                  >
                    Clear Filters
                  </button>
                )}
              </div>

              {/* Multi-finding selection bar */}
              {selectedFindingIds.length > 0 && (
                <div
                  data-testid="finding-selection-bar"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3.5 py-2"
                >
                  <span className="font-mono text-[0.75rem] text-[var(--dd-text-primary)]">
                    {formatCount(selectedFindingIds.length)} findings selected
                    for investigation
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCreateCaseFromSelected}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-surface-primary)] px-3 py-1 font-mono text-[0.75rem] text-[var(--dd-text-primary)] hover:text-[var(--dd-accent-teal)] whitespace-nowrap"
                    >
                      <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Create Case from Selected</span>
                    </button>
                    <Link
                      to={`/reports?source=findings&findings=${encodeURIComponent(selectedFindingIds.join(','))}`}
                      className="inline-flex items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3 py-1 font-mono text-[0.75rem] text-[var(--dd-text-primary)] hover:border-[var(--dd-accent-teal-border)] whitespace-nowrap"
                    >
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Create Report</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setSelectedFindingIds([])}
                      className="cursor-pointer font-mono text-[0.75rem] text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)]"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
              </div>

            {focusedFindingId &&
              investigationSummary.insights.some(
                (item) => item.id === focusedFindingId,
              ) && (
                <div
                  data-testid="investigation-focused-finding-banner"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-4 py-2.5 text-[0.8125rem] text-[var(--dd-text-primary)]"
                >
                  <span className="font-mono text-[0.75rem]">
                    Focused finding from navigation: {focusedFindingId}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.delete('finding');
                      setSearchParams(next, { replace: true });
                    }}
                    className="cursor-pointer font-mono text-[0.75rem] text-[var(--dd-accent-teal)] hover:text-[var(--dd-accent-teal-hover)]"
                  >
                    Clear Focus
                  </button>
                </div>
              )}

            {/* Filtered Results Grouped by Category */}
            {groupedInsights.length === 0 ? (
              <section
                data-testid="investigation-no-matches-state"
                className="dd-surface-primary space-y-2 p-8 text-center"
              >
                <p className="text-[0.9375rem] font-medium text-[var(--dd-text-primary)]">
                  No findings match your active filters.
                </p>
                <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
                  Clear your search query or severity/type filters to view all{' '}
                  {formatCount(overview.totalFindings)} findings.
                </p>
              </section>
            ) : (
              <div className="space-y-7">
                {groupedInsights.map(({ category, items }) => {
                  const meta = CATEGORY_META[category];
                  return (
                    <section
                      key={category}
                      data-testid={`investigation-category-group-${category}`}
                      className="space-y-3"
                    >
                      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--dd-border-subtle)] pb-2">
                        <div className="space-y-0.5">
                          <div className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
                            {meta.code} · {formatCount(items.length)}{' '}
                            {items.length === 1 ? 'FINDING' : 'FINDINGS'}
                          </div>
                          <h3 className="text-[1.0625rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]">
                            {meta.label}
                          </h3>
                        </div>
                        <p className="text-[0.75rem] text-[var(--dd-text-muted)]">
                          {meta.description}
                        </p>
                      </header>

                      <div className="grid grid-cols-1 gap-4">
                        {items.map((insight) => (
                          <InsightCard
                            key={`${insight.id}-${focusedFindingId === insight.id ? 'focused' : 'normal'}`}
                            insight={insight}
                            initiallyExpanded={focusedFindingId === insight.id}
                            isHighlighted={focusedFindingId === insight.id}
                            isSelected={selectedFindingIds.includes(insight.id)}
                            onToggleSelect={toggleSelectFinding}
                            linkedCases={
                              linkedCasesByFindingId.get(insight.id) ?? []
                            }
                            availableCases={activeCaseChoices}
                            onCreateCaseFromFinding={
                              handleCreateCaseFromFinding
                            }
                            onAttachToCase={handleAttachFinding}
                            onOpenCase={openCaseById}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
