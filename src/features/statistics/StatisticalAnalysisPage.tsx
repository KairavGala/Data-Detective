import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { useDataset } from '@/context/DatasetContext';
import { cn, formatCount } from '@/utils';
import { CategoricalStatisticsSection } from './CategoricalStatisticsSection';
import { DatasetStatisticsOverview } from './DatasetStatisticsOverview';
import { NumericStatisticsSection } from './NumericStatisticsSection';
import { UnsupportedColumnsSection } from './UnsupportedColumnsSection';

type AnalysisFilterTab = 'all' | 'numeric' | 'categorical' | 'unsupported';

/**
 * Module 04 — Statistical Analysis Engine workspace page (`/analysis`).
 * Consumes activeDataset, Module 03 datasetProfile, and Module 04 statisticalSummary
 * from DatasetContext with complete empty, loading, error, unsupported, and populated states.
 */
export function StatisticalAnalysisPage() {
  const {
    activeDataset,
    profilingStatus,
    profilingError,
    reprofileDataset,
    statisticalSummary,
    statisticsStatus,
    statisticsError,
    recomputeStatistics,
  } = useDataset();

  const [activeTab, setActiveTab] = useState<AnalysisFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredNumeric = useMemo(() => {
    if (!statisticalSummary) return [];
    if (!normalizedQuery) return statisticalSummary.numericColumns;
    return statisticalSummary.numericColumns.filter(
      (col) =>
        col.name.toLowerCase().includes(normalizedQuery) ||
        col.originalName.toLowerCase().includes(normalizedQuery),
    );
  }, [statisticalSummary, normalizedQuery]);

  const filteredCategorical = useMemo(() => {
    if (!statisticalSummary) return [];
    if (!normalizedQuery) return statisticalSummary.categoricalColumns;
    return statisticalSummary.categoricalColumns.filter(
      (col) =>
        col.name.toLowerCase().includes(normalizedQuery) ||
        col.originalName.toLowerCase().includes(normalizedQuery),
    );
  }, [statisticalSummary, normalizedQuery]);

  const filteredUnsupported = useMemo(() => {
    if (!statisticalSummary) return [];
    if (!normalizedQuery) return statisticalSummary.unsupportedColumns;
    return statisticalSummary.unsupportedColumns.filter(
      (col) =>
        col.name.toLowerCase().includes(normalizedQuery) ||
        col.originalName.toLowerCase().includes(normalizedQuery) ||
        col.detectedType.toLowerCase().includes(normalizedQuery),
    );
  }, [statisticalSummary, normalizedQuery]);

  // 1. Empty state: no dataset imported yet
  if (!activeDataset) {
    return (
      <PageContainer width="standard">
        <div
          className="dd-anim-file-enter space-y-6"
          data-testid="statistics-no-dataset-state"
        >
          <section className="dd-surface-primary space-y-5 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DossierLabel code="SEC-02" label="Statistical Analysis" />
              <StatusIndicator tone="neutral" label="No Active Dataset" />
            </div>

            <div className="space-y-2">
              <h2 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-[var(--dd-text-primary)]">
                Statistical Analysis Engine
              </h2>
              <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--dd-text-secondary)]">
                Import a CSV or Excel (.xlsx) dataset on the Overview workspace to
                compute deterministic numeric descriptive statistics (mean, median,
                mode, variance, standard deviation, quartiles, IQR) and categorical
                frequency distributions locally in your browser.
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

  // 2. Error state (either M03 profiling or M04 computation failed)
  if (profilingStatus === 'error' || statisticsStatus === 'error') {
    const isProfileFailure = profilingStatus === 'error';
    const message = isProfileFailure
      ? (profilingError ??
        'Dataset schema profiling failed before statistics could be computed.')
      : (statisticsError ??
        'An unexpected error occurred while computing dataset statistics.');

    return (
      <PageContainer width="standard">
        <div className="dd-anim-file-enter">
          <section
            role="alert"
            data-testid="statistics-error-state"
            className="dd-surface-primary flex flex-col gap-4 border-[var(--dd-status-anomaly-border)] p-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--dd-status-anomaly)]"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <h2 className="text-[1rem] font-semibold text-[var(--dd-text-primary)]">
                  Statistical analysis failed
                </h2>
                <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
                  {message}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={isProfileFailure ? reprofileDataset : recomputeStatistics}
              className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:border-[var(--dd-accent-teal-border)] whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Retry Analysis</span>
            </button>
          </section>
        </div>
      </PageContainer>
    );
  }

  // 3. Loading state while profiling or computing statistics
  const isComputing =
    profilingStatus === 'profiling' ||
    statisticsStatus === 'analyzing' ||
    !statisticalSummary;

  if (isComputing && !statisticalSummary) {
    return (
      <PageContainer width="standard">
        <div className="dd-anim-file-enter">
          <section
            aria-label="Statistical analysis in progress"
            data-testid="statistics-loading-state"
            className="dd-surface-primary flex items-center justify-between gap-4 p-6"
          >
            <div className="flex items-center gap-3.5">
              <Loader2
                className="h-5 w-5 animate-spin text-[var(--dd-accent-teal)]"
                aria-hidden="true"
              />
              <div className="space-y-0.5">
                <h2 className="text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
                  Computing deterministic statistical analysis…
                </h2>
                <p className="font-mono text-[0.75rem] text-[var(--dd-text-muted)] dd-tabular">
                  Analyzing {formatCount(activeDataset.rowCount)} rows ×{' '}
                  {formatCount(activeDataset.columnCount)} columns locally in
                  browser memory.
                </p>
              </div>
            </div>
            <StatusIndicator tone="analytical" label="Analyzing" />
          </section>
        </div>
      </PageContainer>
    );
  }

  const { overview } = statisticalSummary;
  const hasAnyAnalyzedColumns = overview.analyzedColumnCount > 0;
  const hasZeroRows = overview.totalRows === 0;

  const tabs: readonly {
    readonly id: AnalysisFilterTab;
    readonly label: string;
    readonly count: number;
  }[] = [
    {
      id: 'all',
      label: 'All Sections',
      count: overview.totalColumns,
    },
    {
      id: 'numeric',
      label: 'Numeric',
      count: overview.numericColumnCount,
    },
    {
      id: 'categorical',
      label: 'Categorical',
      count: overview.categoricalColumnCount,
    },
    {
      id: 'unsupported',
      label: 'Unsupported',
      count: overview.unsupportedColumnCount,
    },
  ];

  return (
    <PageContainer width="standard">
      <div
        className="dd-anim-file-enter space-y-6"
        data-testid="statistical-analysis-page"
        data-analyzed-dataset-id={statisticalSummary.datasetId}
      >
        {/* Header bar */}
        <WorkspaceHeader
          code="SEC-02"
          sectionLabel="Statistical Analysis"
          title="Statistical Analysis"
          context={`${statisticalSummary.fileName} · ${formatCount(overview.totalRows)} rows · ${formatCount(overview.numericColumnCount)} numeric · ${formatCount(overview.categoricalColumnCount)} categorical`}
          description="Deterministic descriptive statistics and categorical distributions derived from profiled column classifications."
          navigationLinks={[
            {
              label: 'Data Explorer',
              to: '/explorer',
              testId: 'statistics-nav-explorer',
            },
            {
              label: 'Visualization Studio',
              to: '/visualizations',
              testId: 'statistics-nav-visualizations',
            },
          ]}
          actions={
            <>
              {statisticsStatus === 'analyzing' && (
                <span className="inline-flex items-center gap-1.5 font-mono text-[0.72rem] text-[var(--dd-accent-teal)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Updating…
                </span>
              )}
              <button
                type="button"
                onClick={recomputeStatistics}
                className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-accent-teal-border)] hover:text-[var(--dd-text-primary)] whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Recompute</span>
              </button>
              <Link
                to="/reports?source=dataset&type=statistical_analysis"
                data-testid="statistics-create-report-link"
                className="inline-flex items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20 whitespace-nowrap shrink-0"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Create Report</span>
              </Link>
            </>
          }
        />

        {/* Dataset Summary */}
        <DatasetStatisticsOverview summary={statisticalSummary} />

        {/* Empty rows or no supported columns notice */}
        {(hasZeroRows || !hasAnyAnalyzedColumns) && (
          <section
            data-testid="statistics-unsupported-dataset-notice"
            className="dd-surface-recessed space-y-1.5 p-5 text-[0.875rem] text-[var(--dd-text-secondary)]"
          >
            <h3 className="font-semibold text-[var(--dd-text-primary)]">
              {hasZeroRows
                ? 'Dataset contains zero data rows'
                : 'No numeric or categorical columns detected'}
            </h3>
            <p>
              {hasZeroRows
                ? 'Headers were imported, but there are no row observations available to compute numeric or categorical statistics.'
                : 'Every column in this dataset was classified as date, boolean, identifier, or unknown. Review the excluded columns ledger below for column-level reasons.'}
            </p>
          </section>
        )}

        {/* Filter toolbar (segmented view tabs + live column search) */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="tablist"
            aria-label="Filter statistical sections"
            className="flex flex-wrap items-center gap-1 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-1"
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'cursor-pointer rounded-[var(--dd-radius-xs)] px-3 py-1.5 font-mono text-[0.75rem] transition-colors whitespace-nowrap shrink-0 dd-tabular',
                    isActive
                      ? 'bg-[var(--dd-surface-elevated)] font-medium text-[var(--dd-text-primary)]'
                      : 'text-[var(--dd-text-muted)] hover:text-[var(--dd-text-secondary)]',
                  )}
                >
                  {tab.label} ({formatCount(tab.count)})
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--dd-text-muted)]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter columns…"
              aria-label="Filter statistical columns"
              className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] py-1.5 pl-8 pr-8 font-mono text-[0.78rem] text-[var(--dd-text-primary)] placeholder:text-[var(--dd-text-muted)] focus:border-[var(--dd-accent-teal-border)] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear column filter"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer text-[var(--dd-text-muted)] hover:text-[var(--dd-text-primary)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Numeric Column Statistics */}
        {(activeTab === 'all' || activeTab === 'numeric') && (
          <NumericStatisticsSection
            columns={filteredNumeric}
            totalNumericColumns={overview.numericColumnCount}
          />
        )}

        {/* Categorical Column Distributions */}
        {(activeTab === 'all' || activeTab === 'categorical') && (
          <CategoricalStatisticsSection
            columns={filteredCategorical}
            totalCategoricalColumns={overview.categoricalColumnCount}
          />
        )}

        {/* Unsupported / Excluded Columns */}
        {(activeTab === 'all' || activeTab === 'unsupported') && (
          <UnsupportedColumnsSection
            columns={filteredUnsupported}
            totalUnsupportedColumns={overview.unsupportedColumnCount}
          />
        )}
      </div>
    </PageContainer>
  );
}
