import { useMemo, useState } from 'react';
import { AlertCircle, SlidersHorizontal, Trash2, X } from 'lucide-react';
import {
  getEligibleColumnsForChartType,
  prepareChartData,
} from '@/engine/visualization';
import type {
  CategorySortOrder,
  ChartConfig,
  ChartType,
  DatasetProfileSummary,
  DatasetStatisticalSummary,
  ImportedDataset,
} from '@/types';
import { cn, formatCount } from '@/utils';
import { BarChartSvg } from './charts/BarChartSvg';
import { BoxPlotSvg } from './charts/BoxPlotSvg';
import { HistogramSvg } from './charts/HistogramSvg';
import { LineChartSvg } from './charts/LineChartSvg';
import { ScatterPlotSvg } from './charts/ScatterPlotSvg';
import {
  buildDefaultAxesForType,
  CATEGORY_SORT_OPTIONS,
  CHART_TYPE_OPTIONS,
  getChartTypeMeta,
  isChartTypeSupported,
} from './chartLabels';

interface ChartCardProps {
  readonly dataset: ImportedDataset;
  readonly profile: DatasetProfileSummary;
  readonly stats: DatasetStatisticalSummary;
  readonly config: ChartConfig;
  readonly onUpdate: (updated: ChartConfig) => void;
  readonly onRemove: (chartId: string) => void;
}

const MAX_CATEGORY_CHOICES = [5, 10, 15, 20, 30] as const;
const BIN_COUNT_CHOICES = [6, 8, 10, 12, 16, 20, 24] as const;

export function ChartCard({
  dataset,
  profile,
  stats,
  config,
  onUpdate,
  onRemove,
}: ChartCardProps) {
  const [isConfiguring, setIsConfiguring] = useState(false);

  const prepared = useMemo(
    () => prepareChartData(dataset, profile, stats, config),
    [dataset, profile, stats, config],
  );

  const eligible = useMemo(
    () => getEligibleColumnsForChartType(config.type, profile),
    [config.type, profile],
  );

  const validYColumns = useMemo(
    () => eligible.yColumns.filter((c) => c.columnId !== config.xColumnId),
    [eligible.yColumns, config.xColumnId],
  );

  const meta = getChartTypeMeta(config.type);

  const handleTypeChange = (nextType: ChartType) => {
    if (nextType === config.type) return;
    const defaults = buildDefaultAxesForType(nextType, profile);
    if (!defaults) return;
    onUpdate({
      ...config,
      type: nextType,
      xColumnId: defaults.xColumnId,
      yColumnId: defaults.yColumnId,
      title: defaults.title,
      xAxisLabel: defaults.xAxisLabel,
      yAxisLabel: defaults.yAxisLabel,
      recommendationReason: undefined,
    });
  };

  const handleXColumnChange = (nextXId: string) => {
    const nextXCol = eligible.xColumns.find((c) => c.columnId === nextXId);
    if (!nextXCol) return;

    let nextYId = config.yColumnId;
    let nextYName =
      eligible.yColumns.find((c) => c.columnId === config.yColumnId)?.name ?? '';

    if (eligible.requiresY && (!nextYId || nextYId === nextXId)) {
      const fallbackY = eligible.yColumns.find((c) => c.columnId !== nextXId);
      nextYId = fallbackY?.columnId;
      nextYName = fallbackY?.name ?? '';
    }

    const prevXCol = profile.columns.find((c) => c.columnId === config.xColumnId);
    const shouldSyncXLabel =
      !config.xAxisLabel || config.xAxisLabel === prevXCol?.name;

    const prevYCol = config.yColumnId
      ? profile.columns.find((c) => c.columnId === config.yColumnId)
      : undefined;
    const shouldSyncYLabel =
      eligible.requiresY &&
      nextYId !== config.yColumnId &&
      (!config.yAxisLabel || config.yAxisLabel === prevYCol?.name);

    onUpdate({
      ...config,
      xColumnId: nextXId,
      ...(eligible.requiresY ? { yColumnId: nextYId } : { yColumnId: undefined }),
      xAxisLabel: shouldSyncXLabel ? nextXCol.name : config.xAxisLabel,
      yAxisLabel: shouldSyncYLabel ? nextYName : config.yAxisLabel,
    });
  };

  const handleYColumnChange = (nextYId: string) => {
    const nextYCol = validYColumns.find((c) => c.columnId === nextYId);
    if (!nextYCol) return;
    const prevYCol = config.yColumnId
      ? profile.columns.find((c) => c.columnId === config.yColumnId)
      : undefined;
    const shouldSyncYLabel =
      !config.yAxisLabel || config.yAxisLabel === prevYCol?.name;

    onUpdate({
      ...config,
      yColumnId: nextYId,
      yAxisLabel: shouldSyncYLabel ? nextYCol.name : config.yAxisLabel,
    });
  };

  const coverageParts: string[] = [
    `${formatCount(prepared.validCount)} valid`,
  ];
  if (prepared.missingExcluded > 0) {
    coverageParts.push(`${formatCount(prepared.missingExcluded)} missing excluded`);
  }
  if (prepared.invalidExcluded > 0) {
    coverageParts.push(`${formatCount(prepared.invalidExcluded)} invalid excluded`);
  }
  if (prepared.type === 'bar' && prepared.omittedCategoryCount > 0) {
    coverageParts.push(
      `+${formatCount(prepared.omittedCategoryCount)} categories omitted`,
    );
  }
  if (prepared.type === 'scatter' && prepared.isSampled) {
    coverageParts.push(
      `sampled ${formatCount(prepared.points.length)}/${formatCount(prepared.totalValidPairs)}`,
    );
  }
  if (prepared.type === 'line' && prepared.isDownsampled) {
    coverageParts.push(
      `downsampled ${formatCount(prepared.points.length)}/${formatCount(prepared.originalPointCount)}`,
    );
  } else if (prepared.type === 'line' && prepared.isAggregated) {
    coverageParts.push('mean per X');
  }

  return (
    <article
      data-testid={`chart-card-${config.id}`}
      data-chart-type={config.type}
      className="dd-surface-primary flex flex-col justify-between p-5"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[var(--dd-border-subtle)] pb-3.5">
        <div className="min-w-0 space-y-1">
          <div className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
            {meta.shortTag}
            {config.recommendationReason ? ' · RECOMMENDED' : ''}
          </div>
          <h3 className="truncate text-[1rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]">
            {config.title || 'Untitled Chart'}
          </h3>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsConfiguring((prev) => !prev)}
            aria-expanded={isConfiguring}
            aria-label={`Configure ${config.title || 'chart'}`}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border px-2.5 py-1.5 text-[0.75rem] font-medium transition-colors whitespace-nowrap',
              isConfiguring
                ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-text-primary)]'
                : 'border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-secondary)] hover:border-[var(--dd-border-default)] hover:text-[var(--dd-text-primary)]',
            )}
          >
            {isConfiguring ? (
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{isConfiguring ? 'Done' : 'Configure'}</span>
          </button>

          <button
            type="button"
            onClick={() => onRemove(config.id)}
            aria-label={`Remove ${config.title || 'chart'}`}
            className="inline-flex cursor-pointer items-center justify-center rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-1.5 text-[var(--dd-text-muted)] transition-colors hover:border-[var(--dd-status-anomaly-border)] hover:text-[var(--dd-status-anomaly)]"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Inline Configuration Drawer */}
      {isConfiguring && (
        <div
          data-testid={`chart-config-panel-${config.id}`}
          className="mt-4 space-y-3 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Chart Type */}
            <label className="space-y-1">
              <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                Chart Type
              </span>
              <select
                aria-label="Chart Type"
                value={config.type}
                onChange={(e) => handleTypeChange(e.target.value as ChartType)}
                className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
              >
                {CHART_TYPE_OPTIONS.map((opt) => {
                  const supported = isChartTypeSupported(opt.value, profile);
                  return (
                    <option
                      key={opt.value}
                      value={opt.value}
                      disabled={!supported}
                    >
                      {opt.label}
                      {!supported ? ' (unavailable)' : ''}
                    </option>
                  );
                })}
              </select>
            </label>

            {/* Chart Title */}
            <label className="space-y-1">
              <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                Chart Title
              </span>
              <input
                type="text"
                aria-label="Chart Title"
                value={config.title}
                onChange={(e) => onUpdate({ ...config, title: e.target.value })}
                placeholder="Enter chart title"
                className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
              />
            </label>

            {/* X-Axis Column */}
            <label className="space-y-1">
              <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                {eligible.requiresY ? 'X-Axis Column' : 'Column'}
              </span>
              <select
                aria-label="X-Axis Column"
                value={config.xColumnId}
                onChange={(e) => handleXColumnChange(e.target.value)}
                className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
              >
                {eligible.xColumns.map((col) => (
                  <option key={col.columnId} value={col.columnId}>
                    {col.name} ({col.detectedType})
                  </option>
                ))}
              </select>
            </label>

            {/* Y-Axis Column (Line & Scatter) */}
            {eligible.requiresY && (
              <label className="space-y-1">
                <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                  Y-Axis Column
                </span>
                <select
                  aria-label="Y-Axis Column"
                  value={config.yColumnId ?? ''}
                  onChange={(e) => handleYColumnChange(e.target.value)}
                  className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                >
                  {validYColumns.map((col) => (
                    <option key={col.columnId} value={col.columnId}>
                      {col.name} ({col.detectedType})
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* X-Axis Label */}
            <label className="space-y-1">
              <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                X-Axis Label
              </span>
              <input
                type="text"
                aria-label="X-Axis Label"
                value={config.xAxisLabel}
                onChange={(e) =>
                  onUpdate({ ...config, xAxisLabel: e.target.value })
                }
                placeholder="X-axis label"
                className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
              />
            </label>

            {/* Y-Axis Label (all except box plot) */}
            {config.type !== 'boxplot' && (
              <label className="space-y-1">
                <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                  Y-Axis Label
                </span>
                <input
                  type="text"
                  aria-label="Y-Axis Label"
                  value={config.yAxisLabel}
                  onChange={(e) =>
                    onUpdate({ ...config, yAxisLabel: e.target.value })
                  }
                  placeholder="Y-axis label"
                  className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                />
              </label>
            )}

            {/* Bar-specific controls */}
            {config.type === 'bar' && (
              <>
                <label className="space-y-1">
                  <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                    Category Sort
                  </span>
                  <select
                    aria-label="Category Sort"
                    value={config.categorySort}
                    onChange={(e) =>
                      onUpdate({
                        ...config,
                        categorySort: e.target.value as CategorySortOrder,
                      })
                    }
                    className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                  >
                    {CATEGORY_SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                    Max Categories
                  </span>
                  <select
                    aria-label="Max Categories"
                    value={config.maxCategories}
                    onChange={(e) =>
                      onUpdate({
                        ...config,
                        maxCategories: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                  >
                    {MAX_CATEGORY_CHOICES.map((n) => (
                      <option key={n} value={n}>
                        Top {n}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            {/* Histogram-specific bin count */}
            {config.type === 'histogram' && (
              <label className="space-y-1">
                <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                  Histogram Bins
                </span>
                <select
                  aria-label="Histogram Bins"
                  value={config.binCount ?? ''}
                  onChange={(e) =>
                    onUpdate({
                      ...config,
                      binCount:
                        e.target.value === ''
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                  className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                >
                  <option value="">Auto (Sturges)</option>
                  {BIN_COUNT_CHOICES.map((n) => (
                    <option key={n} value={n}>
                      {n} bins
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* Show Legend toggle */}
          <div className="flex items-center justify-between border-t border-[var(--dd-border-subtle)] pt-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-[0.8125rem] text-[var(--dd-text-secondary)]">
              <input
                type="checkbox"
                checked={config.showLegend}
                onChange={(e) =>
                  onUpdate({ ...config, showLegend: e.target.checked })
                }
                className="h-3.5 w-3.5 accent-[var(--dd-accent-teal)]"
              />
              <span>Show Legend</span>
            </label>
          </div>
        </div>
      )}

      {/* Chart Plot Surface */}
      <div className="mt-4 flex-1">
        {prepared.status !== 'ready' ? (
          <div
            data-testid={`chart-empty-${config.id}`}
            className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-[var(--dd-radius-sm)] border border-dashed border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] p-6 text-center"
          >
            <AlertCircle
              className="h-5 w-5 text-[var(--dd-text-muted)]"
              aria-hidden="true"
            />
            <p className="max-w-md text-[0.8125rem] text-[var(--dd-text-secondary)]">
              {prepared.emptyReason ??
                'No valid observations available to render this chart.'}
            </p>
          </div>
        ) : prepared.type === 'bar' ? (
          <BarChartSvg
            data={prepared}
            xAxisLabel={config.xAxisLabel}
            yAxisLabel={config.yAxisLabel}
            showLegend={config.showLegend}
            chartTitle={config.title}
          />
        ) : prepared.type === 'histogram' ? (
          <HistogramSvg
            data={prepared}
            xAxisLabel={config.xAxisLabel}
            yAxisLabel={config.yAxisLabel}
            showLegend={config.showLegend}
            chartTitle={config.title}
          />
        ) : prepared.type === 'line' ? (
          <LineChartSvg
            data={prepared}
            xAxisLabel={config.xAxisLabel}
            yAxisLabel={config.yAxisLabel}
            showLegend={config.showLegend}
            chartTitle={config.title}
          />
        ) : prepared.type === 'scatter' ? (
          <ScatterPlotSvg
            data={prepared}
            xAxisLabel={config.xAxisLabel}
            yAxisLabel={config.yAxisLabel}
            showLegend={config.showLegend}
            chartTitle={config.title}
          />
        ) : (
          <BoxPlotSvg
            data={prepared}
            xAxisLabel={config.xAxisLabel}
            showLegend={config.showLegend}
            chartTitle={config.title}
          />
        )}
      </div>

      {/* Forensic coverage & data-quality footer */}
      <div className="mt-4 space-y-1 border-t border-[var(--dd-border-subtle)] pt-3">
        <div
          className="font-mono dd-tabular text-[0.6875rem] text-[var(--dd-text-muted)]"
          data-testid={`chart-coverage-${config.id}`}
        >
          {coverageParts.join(' · ')}
        </div>
        {config.recommendationReason && (
          <p className="text-[0.75rem] leading-relaxed text-[var(--dd-text-secondary)]">
            {config.recommendationReason}
          </p>
        )}
      </div>
    </article>
  );
}
