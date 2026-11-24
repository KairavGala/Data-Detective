import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  DEFAULT_MAX_CHART_CATEGORIES,
  getEligibleColumnsForChartType,
} from '@/engine/visualization';
import type {
  CategorySortOrder,
  ChartConfig,
  ChartType,
  DatasetProfileSummary,
} from '@/types';
import {
  buildDefaultAxesForType,
  CATEGORY_SORT_OPTIONS,
  CHART_TYPE_OPTIONS,
  isChartTypeSupported,
} from './chartLabels';

interface NewChartBuilderPanelProps {
  readonly profile: DatasetProfileSummary;
  readonly onAddChart: (config: ChartConfig) => void;
  readonly onCancel: () => void;
}

export function NewChartBuilderPanel({
  profile,
  onAddChart,
  onCancel,
}: NewChartBuilderPanelProps) {
  const firstSupportedType = useMemo<ChartType>(() => {
    const supported = CHART_TYPE_OPTIONS.find((opt) =>
      isChartTypeSupported(opt.value, profile),
    );
    return supported?.value ?? 'bar';
  }, [profile]);

  const initialAxes = useMemo(
    () => buildDefaultAxesForType(firstSupportedType, profile),
    [firstSupportedType, profile],
  );

  const [chartType, setChartType] = useState<ChartType>(firstSupportedType);
  const [xColumnId, setXColumnId] = useState<string>(
    initialAxes?.xColumnId ?? '',
  );
  const [yColumnId, setYColumnId] = useState<string>(
    initialAxes?.yColumnId ?? '',
  );
  const [title, setTitle] = useState<string>(initialAxes?.title ?? '');
  const [xAxisLabel, setXAxisLabel] = useState<string>(
    initialAxes?.xAxisLabel ?? '',
  );
  const [yAxisLabel, setYAxisLabel] = useState<string>(
    initialAxes?.yAxisLabel ?? '',
  );
  const [categorySort, setCategorySort] =
    useState<CategorySortOrder>('freq_desc');
  const [showLegend, setShowLegend] = useState<boolean>(true);

  const eligible = useMemo(
    () => getEligibleColumnsForChartType(chartType, profile),
    [chartType, profile],
  );

  const validYColumns = useMemo(
    () => eligible.yColumns.filter((c) => c.columnId !== xColumnId),
    [eligible.yColumns, xColumnId],
  );

  const handleTypeSelect = (nextType: ChartType) => {
    setChartType(nextType);
    const defaults = buildDefaultAxesForType(nextType, profile);
    if (defaults) {
      setXColumnId(defaults.xColumnId);
      setYColumnId(defaults.yColumnId ?? '');
      setTitle(defaults.title);
      setXAxisLabel(defaults.xAxisLabel);
      setYAxisLabel(defaults.yAxisLabel);
    } else {
      setXColumnId('');
      setYColumnId('');
    }
  };

  const handleXSelect = (nextXId: string) => {
    setXColumnId(nextXId);
    const xCol = eligible.xColumns.find((c) => c.columnId === nextXId);
    if (xCol) {
      setXAxisLabel(xCol.name);
      if (eligible.requiresY) {
        const nextY =
          eligible.yColumns.find(
            (c) => c.columnId === yColumnId && c.columnId !== nextXId,
          ) ?? eligible.yColumns.find((c) => c.columnId !== nextXId);
        const nextYId = nextY?.columnId ?? '';
        setYColumnId(nextYId);
        if (nextY) {
          setYAxisLabel(nextY.name);
          setTitle(
            chartType === 'line'
              ? `${nextY.name} over ${xCol.name}`
              : `${nextY.name} vs ${xCol.name}`,
          );
        }
      } else {
        setTitle(
          chartType === 'bar'
            ? `${xCol.name} Frequency Distribution`
            : chartType === 'histogram'
              ? `${xCol.name} Distribution`
              : `${xCol.name} Quartile Box Plot`,
        );
      }
    }
  };

  const handleYSelect = (nextYId: string) => {
    setYColumnId(nextYId);
    const xCol = eligible.xColumns.find((c) => c.columnId === xColumnId);
    const yCol = validYColumns.find((c) => c.columnId === nextYId);
    if (yCol) {
      setYAxisLabel(yCol.name);
      if (xCol) {
        setTitle(
          chartType === 'line'
            ? `${yCol.name} over ${xCol.name}`
            : `${yCol.name} vs ${xCol.name}`,
        );
      }
    }
  };

  const canSubmit =
    Boolean(xColumnId) &&
    (!eligible.requiresY || (Boolean(yColumnId) && yColumnId !== xColumnId));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    const newConfig: ChartConfig = {
      id: `custom-${chartType}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: chartType,
      title: title.trim() || 'Custom Chart',
      xColumnId,
      ...(eligible.requiresY ? { yColumnId } : {}),
      xAxisLabel: xAxisLabel.trim(),
      yAxisLabel: chartType === 'boxplot' ? '' : yAxisLabel.trim(),
      categorySort,
      maxCategories: DEFAULT_MAX_CHART_CATEGORIES,
      showLegend,
    };

    onAddChart(newConfig);
  };

  return (
    <section
      data-testid="new-chart-builder"
      className="dd-surface-primary space-y-4 p-5"
      aria-label="Create custom chart"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--dd-border-subtle)] pb-3">
        <div>
          <div className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-accent-teal)]">
            CUSTOM CHART BUILDER
          </div>
          <h3 className="text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
            Configure a New Workspace Chart
          </h3>
        </div>

        <button
          type="button"
          onClick={onCancel}
          aria-label="Close chart builder"
          className="inline-flex cursor-pointer items-center justify-center rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-1.5 text-[var(--dd-text-muted)] transition-colors hover:text-[var(--dd-text-primary)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Chart Type */}
          <label className="space-y-1">
            <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
              Chart Type
            </span>
            <select
              aria-label="New Chart Type"
              value={chartType}
              onChange={(e) => handleTypeSelect(e.target.value as ChartType)}
              className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-2 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
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

          {/* X-Axis Column */}
          <label className="space-y-1">
            <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
              {eligible.requiresY ? 'X-Axis Column' : 'Column'}
            </span>
            <select
              aria-label="New Chart X-Axis Column"
              value={xColumnId}
              onChange={(e) => handleXSelect(e.target.value)}
              className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-2 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
            >
              {eligible.xColumns.map((col) => (
                <option key={col.columnId} value={col.columnId}>
                  {col.name} ({col.detectedType})
                </option>
              ))}
            </select>
          </label>

          {/* Y-Axis Column */}
          {eligible.requiresY && (
            <label className="space-y-1">
              <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                Y-Axis Column
              </span>
              <select
                aria-label="New Chart Y-Axis Column"
                value={yColumnId}
                onChange={(e) => handleYSelect(e.target.value)}
                className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-2 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
              >
                {validYColumns.map((col) => (
                  <option key={col.columnId} value={col.columnId}>
                    {col.name} ({col.detectedType})
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Chart Title */}
          <label className="space-y-1">
            <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
              Chart Title
            </span>
            <input
              type="text"
              aria-label="New Chart Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Chart title"
              className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-2 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
            />
          </label>

          {/* X-Axis Label */}
          <label className="space-y-1">
            <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
              X-Axis Label
            </span>
            <input
              type="text"
              aria-label="New Chart X-Axis Label"
              value={xAxisLabel}
              onChange={(e) => setXAxisLabel(e.target.value)}
              placeholder="X-axis label"
              className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-2 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
            />
          </label>

          {/* Y-Axis Label */}
          {chartType !== 'boxplot' && (
            <label className="space-y-1">
              <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                Y-Axis Label
              </span>
              <input
                type="text"
                aria-label="New Chart Y-Axis Label"
                value={yAxisLabel}
                onChange={(e) => setYAxisLabel(e.target.value)}
                placeholder="Y-axis label"
                className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-2 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
              />
            </label>
          )}

          {/* Category Sort for Bar */}
          {chartType === 'bar' && (
            <label className="space-y-1">
              <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                Category Sort
              </span>
              <select
                aria-label="New Chart Category Sort"
                value={categorySort}
                onChange={(e) =>
                  setCategorySort(e.target.value as CategorySortOrder)
                }
                className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-2 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
              >
                {CATEGORY_SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--dd-border-subtle)] pt-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[0.8125rem] text-[var(--dd-text-secondary)]">
            <input
              type="checkbox"
              checked={showLegend}
              onChange={(e) => setShowLegend(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--dd-accent-teal)]"
            />
            <span>Show Legend</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex cursor-pointer items-center rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-3.5 py-1.5 text-[0.8125rem] font-medium text-[var(--dd-text-secondary)] transition-colors hover:text-[var(--dd-text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-4 py-1.5 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add to Studio</span>
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
