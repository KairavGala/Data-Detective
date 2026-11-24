import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { useDataset } from '@/context/DatasetContext';
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
} from '@/types';
import { cn, formatCount } from '@/utils';
import { InsightCard } from './InsightCard';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  SEVERITY_META,
  SEVERITY_ORDER,
} from './investigationLabels';

type SeverityFilter = 'all' | InsightSeverity;
type ClassificationFilter = 'all' | InsightClassification;
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
 * Module 07 — Investigation Center (`/investigation`).
 * Runs deterministic insight and anomaly detection over activeDataset using
 * Module 03 schema classifications and Module 04 statistical baselines.
 */
export function InvestigationCenterPage() {
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

  const [detectionConfig, setDetectionConfig] =
    useState<AnomalyDetectionConfig>(DEFAULT_ANOMALY_CONFIG);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [classificationFilter, setClassificationFilter] =
    useState<ClassificationFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<InsightSortMode>('severity');

  const investigationSummary = useMemo(() => {
    if (!activeDataset || !datasetProfile || !statisticalSummary) return null;
    return analyzeDatasetInsights(
      activeDataset,
      datasetProfile,
      statisticalSummary,
      detectionConfig,
    );
  }, [activeDataset, datasetProfile, statisticalSummary, detectionConfig]);

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
                label="Module 07 · Awaiting Dataset"
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
                outliers), data-quality audits, categorical concentration checks,
                distribution diagnostics, and pairwise correlation analysis
                locally in your browser.
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
        </div>
      </PageContainer>
    );
  }

  // 2. Error state (if M03 or M04 errored)
  if (profilingStatus === 'error' || statisticsStatus === 'error') {
    const isProfileFailure = profilingStatus === 'error';
    const message = isProfileFailure
      ? (profilingError ??
        'Module 03 schema profiling failed before investigation could run.')
      : (statisticsError ??
        'Module 04 statistical analysis failed before investigation could run.');

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
                Evaluating Module 03 quality signals, Module 04 statistical
                distributions, IQR fences, and pairwise correlations…
              </p>
            </div>
          </section>
        </div>
      </PageContainer>
    );
  }

  const { overview } = investigationSummary;
  const hasActiveUiFilters =
    severityFilter !== 'all' ||
    classificationFilter !== 'all' ||
    normalizedQuery.length > 0;

  return (
    <PageContainer width="wide">
      <div
        className="dd-anim-file-enter space-y-6"
        data-testid="investigation-center-workspace"
      >
        {/* Header Dossier & Detection Parameter Controls */}
        <section className="dd-surface-primary space-y-4 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <DossierLabel
                  code="SEC-04"
                  label="Module 07 · Deterministic Insights & Anomaly Detection"
                />
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
                      : `${formatCount(overview.totalFindings)} ${overview.totalFindings === 1 ? 'Finding' : 'Findings'}`
                  }
                />
              </div>

              <h2 className="truncate text-[1.25rem] font-semibold tracking-[-0.02em] text-[var(--dd-text-primary)]">
                {activeDataset.fileName}
              </h2>

              <p className="font-mono text-[0.75rem] text-[var(--dd-text-muted)] dd-tabular">
                Active dataset in memory: {activeDataset.fileName} ·{' '}
                {formatCount(datasetProfile.rowCount)} rows ·{' '}
                {formatCount(datasetProfile.columnCount)} columns · Computed in{' '}
                {formatCount(investigationSummary.durationMs)} ms
              </p>
            </div>

            {/* Detection Controls (IQR multiplier + optional Z-score) */}
            <div
              data-testid="anomaly-detection-controls"
              className="flex flex-wrap items-center gap-3 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-3.5 py-2.5"
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
                  className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2 py-1 font-mono text-[0.75rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
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
                  className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2 py-1 font-mono text-[0.75rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
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

          {/* Dataset Findings Overview Strip (unboxed tabular KPIs) */}
          <dl
            data-testid="investigation-overview-strip"
            className="grid grid-cols-2 gap-4 border-t border-[var(--dd-border-subtle)] pt-4 sm:grid-cols-5"
          >
            <div className="space-y-0.5">
              <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-text-muted)]">
                Total Findings
              </dt>
              <dd className="font-mono text-[1.375rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
                {formatCount(overview.totalFindings)}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-status-anomaly)]">
                Data-Quality Issues
              </dt>
              <dd className="font-mono text-[1.375rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
                {formatCount(overview.dataQualityIssueCount)}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-accent-teal)]">
                Statistical Outliers
              </dt>
              <dd className="font-mono text-[1.375rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
                {formatCount(overview.statisticalOutlierCount)}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-status-warning)]">
                Notable Observations
              </dt>
              <dd className="font-mono text-[1.375rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
                {formatCount(overview.notableObservationCount)}
              </dd>
            </div>

            <div className="space-y-0.5">
              <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-text-muted)]">
                Affected Columns
              </dt>
              <dd className="font-mono text-[1.375rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
                {formatCount(overview.affectedColumnCount)} /{' '}
                {formatCount(datasetProfile.columnCount)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Zero-findings clean dataset state */}
        {overview.totalFindings === 0 ? (
          <section
            data-testid="investigation-clean-state"
            className="dd-surface-primary space-y-4 p-8 text-center"
          >
            <CheckCircle2
              className="mx-auto h-7 w-7 text-[var(--dd-status-verified)]"
              aria-hidden="true"
            />
            <div className="space-y-1.5">
              <h3 className="text-[1.0625rem] font-semibold text-[var(--dd-text-primary)]">
                No deterministic anomalies or quality warnings triggered
              </h3>
              <p className="mx-auto max-w-xl text-[0.875rem] text-[var(--dd-text-secondary)]">
                {datasetProfile.rowCount === 0
                  ? 'This dataset contains zero data rows. Import a file with observations to run automated anomaly checks.'
                  : 'All checked columns fall within the current IQR thresholds, completeness targets, and distribution bounds. You can enable Z-score detection or inspect raw records in Data Explorer.'}
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
          </section>
        ) : (
          <>
            {/* Search, Severity, Classification & Sort Toolbar */}
            <section
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

                {/* Sort & Classification Filter */}
                <div className="flex flex-wrap items-center gap-2.5">
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
                      setSearchQuery('');
                    }}
                    className="ml-auto cursor-pointer font-mono text-[0.75rem] text-[var(--dd-accent-teal)] hover:text-[var(--dd-accent-teal-hover)]"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </section>

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
                          <InsightCard key={insight.id} insight={insight} />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
}
