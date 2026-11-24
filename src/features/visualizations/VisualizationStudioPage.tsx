import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { useDataset } from '@/context/DatasetContext';
import {
  DEFAULT_MAX_CHART_CATEGORIES,
  generateChartRecommendations,
  getEligibleColumnsForChartType,
  INITIAL_WORKSPACE_RECOMMENDATION_LIMIT,
  recommendationToChartConfig,
} from '@/engine/visualization';
import type { ChartConfig, ChartRecommendation, ChartType } from '@/types';
import { formatCount } from '@/utils';
import { ChartCard } from './ChartCard';
import {
  CHART_TYPE_OPTIONS,
  getChartTypeMeta,
  isChartTypeSupported,
} from './chartLabels';
import { NewChartBuilderPanel } from './NewChartBuilderPanel';

/**
 * Module 06 — Visualization Studio (`/visualizations`).
 * Converts active datasets into deterministic, schema-validated interactive
 * charts strictly grounded in Module 03 column classifications and Module 04
 * statistical summaries.
 */
export function VisualizationStudioPage() {
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

  const recommendations = useMemo<readonly ChartRecommendation[]>(() => {
    if (!datasetProfile || !statisticalSummary) return [];
    return generateChartRecommendations(datasetProfile, statisticalSummary);
  }, [datasetProfile, statisticalSummary]);

  const [searchParams] = useSearchParams();
  const [charts, setCharts] = useState<readonly ChartConfig[]>([]);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);

  // Synchronize workspace charts cleanly whenever the dataset, profile, or deep-link changes
  const datasetSyncKey =
    activeDataset && datasetProfile && statisticalSummary
      ? `${activeDataset.id}:${datasetProfile.profiledAt}:${statisticalSummary.computedAt}`
      : null;

  const linkedChartType = searchParams.get('chartType') as ChartType | null;
  const linkedX = searchParams.get('x');
  const linkedY = searchParams.get('y');
  const linkedTitle = searchParams.get('title');

  useEffect(() => {
    if (!datasetSyncKey || !datasetProfile) {
      setCharts([]);
      setIsBuilderOpen(false);
      return;
    }

    const initialCharts = recommendations
      .slice(0, INITIAL_WORKSPACE_RECOMMENDATION_LIMIT)
      .map((rec) => recommendationToChartConfig(rec));

    const validTypes: readonly ChartType[] = [
      'bar',
      'histogram',
      'line',
      'scatter',
      'boxplot',
    ];

    if (
      linkedChartType &&
      validTypes.includes(linkedChartType) &&
      linkedX
    ) {
      const eligible = getEligibleColumnsForChartType(
        linkedChartType,
        datasetProfile,
      );
      const xCol = eligible.xColumns.find((c) => c.columnId === linkedX);
      const yCol = eligible.requiresY
        ? eligible.yColumns.find(
            (c) => c.columnId === linkedY && c.columnId !== linkedX,
          )
        : undefined;

      if (xCol && (!eligible.requiresY || yCol)) {
        const targetSig = `${linkedChartType}:${xCol.columnId}:${yCol?.columnId ?? ''}`;
        const existingIdx = initialCharts.findIndex(
          (c) => `${c.type}:${c.xColumnId}:${c.yColumnId ?? ''}` === targetSig,
        );

        if (existingIdx >= 0) {
          const [matched] = initialCharts.splice(existingIdx, 1);
          if (matched) initialCharts.unshift(matched);
        } else {
          const linkedConfig: ChartConfig = {
            id: `linked-${linkedChartType}-${xCol.columnId}-${yCol?.columnId ?? 'single'}`,
            type: linkedChartType,
            title:
              linkedTitle?.trim() ||
              (yCol
                ? `${yCol.name} vs ${xCol.name}`
                : `${xCol.name} Analysis`),
            xColumnId: xCol.columnId,
            ...(yCol ? { yColumnId: yCol.columnId } : {}),
            xAxisLabel: xCol.name,
            yAxisLabel:
              linkedChartType === 'boxplot'
                ? ''
                : yCol
                  ? yCol.name
                  : linkedChartType === 'bar'
                    ? 'Count'
                    : 'Frequency',
            categorySort: 'freq_desc',
            maxCategories: DEFAULT_MAX_CHART_CATEGORIES,
            showLegend: true,
          };
          initialCharts.unshift(linkedConfig);
        }
      }
    }

    setCharts(initialCharts);
    setIsBuilderOpen(false);
  }, [
    datasetSyncKey,
    datasetProfile,
    recommendations,
    linkedChartType,
    linkedX,
    linkedY,
    linkedTitle,
  ]);

  const anyChartSupported = useMemo(() => {
    if (!datasetProfile || datasetProfile.rowCount === 0) return false;
    return CHART_TYPE_OPTIONS.some((opt) =>
      isChartTypeSupported(opt.value, datasetProfile),
    );
  }, [datasetProfile]);

  const unaddedRecommendations = useMemo(() => {
    const activeSignatures = new Set(
      charts.map((c) => `${c.type}:${c.xColumnId}:${c.yColumnId ?? ''}`),
    );
    return recommendations.filter(
      (rec) =>
        !activeSignatures.has(
          `${rec.type}:${rec.xColumnId}:${rec.yColumnId ?? ''}`,
        ),
    );
  }, [charts, recommendations]);

  const handleUpdateChart = (updated: ChartConfig) => {
    setCharts((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item)),
    );
  };

  const handleRemoveChart = (chartId: string) => {
    setCharts((prev) => prev.filter((item) => item.id !== chartId));
  };

  const handleAddRecommendation = (rec: ChartRecommendation) => {
    const uniqueId = `${rec.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setCharts((prev) => [
      ...prev,
      recommendationToChartConfig(rec, uniqueId),
    ]);
  };

  const handleAddCustomChart = (config: ChartConfig) => {
    setCharts((prev) => [...prev, config]);
    setIsBuilderOpen(false);
  };

  const handleResetRecommended = () => {
    setCharts(
      recommendations
        .slice(0, INITIAL_WORKSPACE_RECOMMENDATION_LIMIT)
        .map((rec) => recommendationToChartConfig(rec)),
    );
    setIsBuilderOpen(false);
  };

  // 1. Empty state: no dataset imported yet
  if (!activeDataset) {
    return (
      <PageContainer width="standard">
        <div
          className="dd-anim-file-enter space-y-6"
          data-testid="visualizations-no-dataset-state"
        >
          <section className="dd-surface-primary space-y-5 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DossierLabel
                code="SEC-03"
                label="Module 06 · Awaiting Dataset"
              />
              <StatusIndicator tone="neutral" label="No Active Dataset" />
            </div>

            <div className="space-y-2">
              <h2 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-[var(--dd-text-primary)]">
                Visualization Studio
              </h2>
              <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--dd-text-secondary)]">
                Import a CSV or Excel (.xlsx) dataset on the Overview workspace
                to automatically generate schema-validated bar charts, numeric
                histograms, ordered trend lines, scatter plots, and quartile box
                plots locally in your browser.
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
        'Module 03 schema profiling failed before visualizations could be prepared.')
      : (statisticsError ??
        'Module 04 statistical analysis failed before visualizations could be prepared.');

    return (
      <PageContainer width="standard">
        <div className="dd-anim-file-enter">
          <section
            role="alert"
            data-testid="visualizations-error-state"
            className="dd-surface-primary flex flex-col gap-4 border-[var(--dd-status-anomaly-border)] p-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--dd-status-anomaly)]"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <h2 className="text-[1rem] font-semibold text-[var(--dd-text-primary)]">
                  Visualization preparation failed
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
              <span>Retry Preparation</span>
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
    !statisticalSummary
  ) {
    return (
      <PageContainer width="standard">
        <div className="dd-anim-file-enter">
          <section
            data-testid="visualizations-loading-state"
            className="dd-surface-primary flex items-center gap-4 p-6"
          >
            <Loader2
              className="h-5 w-5 animate-spin text-[var(--dd-accent-teal)]"
              aria-hidden="true"
            />
            <div className="space-y-0.5">
              <h2 className="text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
                Preparing Visualization Studio
              </h2>
              <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
                Generating deterministic chart recommendations from Module 03
                schema classifications and Module 04 statistical baselines…
              </p>
            </div>
          </section>
        </div>
      </PageContainer>
    );
  }

  // 4. Unsupported dataset state (0 rows or no chartable M03 columns)
  if (!anyChartSupported) {
    return (
      <PageContainer width="standard">
        <div
          className="dd-anim-file-enter space-y-6"
          data-testid="visualizations-unsupported-state"
        >
          <section className="dd-surface-primary space-y-4 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DossierLabel
                code="SEC-03"
                label="Module 06 · Unsupported Schema"
              />
              <StatusIndicator tone="warning" label="No Chartable Columns" />
            </div>

            <div className="space-y-2">
              <h2 className="text-[1.25rem] font-semibold tracking-[-0.02em] text-[var(--dd-text-primary)]">
                No valid chart combinations for {activeDataset.fileName}
              </h2>
              <p className="max-w-2xl text-[0.875rem] leading-relaxed text-[var(--dd-text-secondary)]">
                {datasetProfile.rowCount === 0
                  ? 'This dataset contains zero data rows. Import a file with tabular observations to generate visualizations.'
                  : 'None of the columns in this dataset were classified as numeric or categorical by Module 03 (columns containing only identifiers, free text, dates without numeric measures, or empty values cannot be plotted validly).'}
              </p>
            </div>

            <div className="font-mono dd-tabular text-[0.75rem] text-[var(--dd-text-muted)]">
              Active dataset in memory: {activeDataset.fileName} ·{' '}
              {formatCount(datasetProfile.rowCount)} rows ·{' '}
              {formatCount(datasetProfile.columnCount)} columns
            </div>
          </section>
        </div>
      </PageContainer>
    );
  }

  // 5. Populated Visualization Studio workspace
  return (
    <PageContainer width="wide">
      <div
        className="dd-anim-file-enter space-y-6"
        data-testid="visualizations-studio-workspace"
      >
        {/* Studio Header & Controls */}
        <section className="dd-surface-primary flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <DossierLabel
                code="SEC-03"
                label="Module 06 · Visualization Studio"
              />
              <StatusIndicator
                tone="verified"
                label={`${formatCount(charts.length)} Active ${charts.length === 1 ? 'Chart' : 'Charts'}`}
              />
            </div>
            <h2 className="truncate text-[1.25rem] font-semibold tracking-[-0.02em] text-[var(--dd-text-primary)]">
              {activeDataset.fileName}
            </h2>
            <p className="font-mono dd-tabular text-[0.75rem] text-[var(--dd-text-muted)]">
              Active dataset in memory: {activeDataset.fileName} ·{' '}
              {formatCount(datasetProfile.rowCount)} rows ·{' '}
              {formatCount(statisticalSummary.numericColumns.length)} numeric ·{' '}
              {formatCount(statisticalSummary.categoricalColumns.length)}{' '}
              categorical ·{' '}
              {formatCount(recommendations.length)} recommended views
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsBuilderOpen((prev) => !prev)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add Chart</span>
            </button>

            {recommendations.length > 0 && (
              <button
                type="button"
                onClick={handleResetRecommended}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-accent-teal-border)] hover:text-[var(--dd-text-primary)] whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Reset Recommended</span>
              </button>
            )}
          </div>
        </section>

        {/* Optional Custom Chart Builder */}
        {isBuilderOpen && (
          <NewChartBuilderPanel
            profile={datasetProfile}
            onAddChart={handleAddCustomChart}
            onCancel={() => setIsBuilderOpen(false)}
          />
        )}

        {/* Deterministic Recommendations Shelf (additional views not yet on canvas) */}
        {unaddedRecommendations.length > 0 && (
          <section
            aria-label="Additional recommended charts"
            data-testid="recommendations-shelf"
            className="dd-surface-primary space-y-3 p-4 sm:p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
                ADDITIONAL DETERMINISTIC RECOMMENDATIONS (
                {formatCount(unaddedRecommendations.length)})
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {unaddedRecommendations.map((rec) => {
                const meta = getChartTypeMeta(rec.type);
                return (
                  <div
                    key={rec.id}
                    className="flex items-center justify-between gap-3 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[0.625rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
                        {meta.label}
                      </div>
                      <div className="truncate text-[0.8125rem] font-medium text-[var(--dd-text-primary)]">
                        {rec.title}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddRecommendation(rec)}
                      aria-label={`Add recommended chart ${rec.title}`}
                      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2.5 py-1 text-[0.75rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:border-[var(--dd-accent-teal-border)] hover:text-[var(--dd-accent-teal)]"
                    >
                      <Plus className="h-3 w-3" aria-hidden="true" />
                      <span>Add</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Workspace Multi-Chart Grid */}
        {charts.length === 0 ? (
          <section
            data-testid="visualizations-empty-canvas"
            className="dd-surface-primary flex flex-col items-center justify-center gap-3 p-10 text-center"
          >
            <BarChart3
              className="h-6 w-6 text-[var(--dd-text-muted)]"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <h3 className="text-[1rem] font-semibold text-[var(--dd-text-primary)]">
                Workspace canvas is empty
              </h3>
              <p className="max-w-md text-[0.8125rem] text-[var(--dd-text-secondary)]">
                Add a custom chart above or restore the deterministic
                recommendations generated from your dataset schema.
              </p>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setIsBuilderOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3.5 py-1.5 text-[0.8125rem] font-medium text-[var(--dd-text-primary)]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Create Chart</span>
              </button>
              {recommendations.length > 0 && (
                <button
                  type="button"
                  onClick={handleResetRecommended}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3.5 py-1.5 text-[0.8125rem] font-medium text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)]"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Restore Recommended</span>
                </button>
              )}
            </div>
          </section>
        ) : (
          <section
            aria-label="Workspace charts"
            data-testid="visualizations-chart-grid"
            className="grid grid-cols-1 gap-6 xl:grid-cols-2"
          >
            {charts.map((chartConfig) => (
              <ChartCard
                key={chartConfig.id}
                dataset={activeDataset}
                profile={datasetProfile}
                stats={statisticalSummary}
                config={chartConfig}
                onUpdate={handleUpdateChart}
                onRemove={handleRemoveChart}
              />
            ))}
          </section>
        )}
      </div>
    </PageContainer>
  );
}
