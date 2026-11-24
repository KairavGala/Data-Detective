import { useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Table2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DatasetInsight } from '@/types';
import { cn, formatCount } from '@/utils';
import {
  buildExplorerColumnUrl,
  buildExplorerRowUrl,
  buildVisualizationUrl,
  CLASSIFICATION_META,
  CONFIDENCE_LABELS,
  getChartActionLabel,
  SEVERITY_META,
} from './investigationLabels';

interface InsightCardProps {
  readonly insight: DatasetInsight;
}

/**
 * Single-elevation forensic finding card displaying classification distinction,
 * severity, evidence strength, affected-column Explorer jumps, associated chart
 * navigation, and an expandable evidence & record-anomaly drawer.
 */
export function InsightCard({ insight }: InsightCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const sevMeta = SEVERITY_META[insight.severity];
  const clsMeta = CLASSIFICATION_META[insight.classification];
  const primaryColId = insight.affectedColumnIds[0];

  const hasRecordSamples =
    insight.recordAnomalies !== undefined && insight.recordAnomalies.length > 0;

  return (
    <article
      data-testid={`insight-card-${insight.id}`}
      data-insight-severity={insight.severity}
      data-insight-classification={insight.classification}
      className="dd-surface-primary space-y-3.5 p-5"
    >
      {/* Top unboxed metadata row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--dd-border-subtle)] pb-3">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.08em]">
          <span
            className={cn('font-semibold', clsMeta.textClass)}
            title={clsMeta.fullLabel}
          >
            {clsMeta.shortLabel}
          </span>
          <span className="text-[var(--dd-text-muted)]" aria-hidden="true">
            ·
          </span>
          <span className={cn('font-semibold', sevMeta.textClass)}>
            {sevMeta.label}
          </span>
          <span className="text-[var(--dd-text-muted)]" aria-hidden="true">
            ·
          </span>
          <span className="text-[var(--dd-text-muted)]">
            {CONFIDENCE_LABELS[insight.confidence]}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          aria-label={`Toggle evidence details for ${insight.title}`}
          className="inline-flex cursor-pointer items-center gap-1 font-mono text-[0.75rem] text-[var(--dd-accent-teal)] transition-colors hover:text-[var(--dd-accent-teal-hover)] whitespace-nowrap"
        >
          <span>{isExpanded ? 'Hide Evidence' : 'Inspect Evidence'}</span>
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Title & Explanation */}
      <div className="space-y-1.5">
        <h4 className="text-[0.96875rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]">
          {insight.title}
        </h4>
        <p className="text-[0.84375rem] leading-relaxed text-[var(--dd-text-secondary)]">
          {insight.explanation}
        </p>
      </div>

      {/* Key Inline Numerical Evidence Strip */}
      <dl className="grid grid-cols-2 gap-x-5 gap-y-2 border-t border-[var(--dd-border-subtle)] pt-3 sm:grid-cols-4">
        {insight.evidence.map((metric) => (
          <div key={metric.label} className="min-w-0 space-y-0.5">
            <dt className="font-mono text-[0.625rem] uppercase tracking-[0.07em] text-[var(--dd-text-muted)]">
              {metric.label}
            </dt>
            <dd className="truncate font-mono text-[0.8125rem] text-[var(--dd-text-primary)] dd-tabular">
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Suggested Investigation Action */}
      <div className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-3.5 py-2.5 text-[0.8125rem] text-[var(--dd-text-secondary)]">
        <span className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
          Suggested Action:{' '}
        </span>
        {insight.suggestedAction}
      </div>

      {/* Cross-Module Navigation Actions (Affected Columns & Associated Chart) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          {insight.affectedColumnIds.map((colId, idx) => {
            const colName = insight.affectedColumnNames[idx] ?? colId;
            return (
              <Link
                key={colId}
                to={buildExplorerColumnUrl(colId)}
                className="inline-flex items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1 font-mono text-[0.75rem] text-[var(--dd-text-primary)] transition-colors hover:border-[var(--dd-accent-teal-border)] hover:text-[var(--dd-accent-teal)]"
              >
                <Table2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>Inspect {colName}</span>
                <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              </Link>
            );
          })}
        </div>

        {insight.recommendedChart && (
          <Link
            to={buildVisualizationUrl(insight.recommendedChart)}
            className="inline-flex items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3 py-1 font-mono text-[0.75rem] text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20 whitespace-nowrap"
          >
            <BarChart3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Open {getChartActionLabel(insight.recommendedChart.chartType)}
            </span>
          </Link>
        )}
      </div>

      {/* Expandable Evidence & Record-Level Anomaly Samples */}
      {isExpanded && (
        <div
          data-testid={`insight-evidence-drawer-${insight.id}`}
          className="space-y-3 border-t border-[var(--dd-border-subtle)] pt-3.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-text-muted)]">
            <span>Classification: {clsMeta.fullLabel}</span>
            <span>Finding ID: {insight.id}</span>
          </div>

          {hasRecordSamples && insight.recordAnomalies && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[0.75rem] text-[var(--dd-text-secondary)]">
                <span className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-text-muted)]">
                  Flagged Record Samples (
                  {formatCount(insight.recordAnomalies.length)}
                  {insight.totalAnomalyCount &&
                  insight.totalAnomalyCount > insight.recordAnomalies.length
                    ? ` of ${formatCount(insight.totalAnomalyCount)} total`
                    : ''}
                  )
                </span>
                <span className="font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
                  Original 1-based dataset row numbers
                </span>
              </div>

              <div className="overflow-x-auto rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)]">
                <table className="w-full border-collapse text-left font-mono text-[0.75rem]">
                  <thead>
                    <tr className="border-b border-[var(--dd-border-subtle)] text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                      <th className="px-3 py-2">Row #</th>
                      <th className="px-3 py-2">Observed Value</th>
                      <th className="px-3 py-2">Basis</th>
                      <th className="px-3 py-2 text-right">Explorer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--dd-border-subtle)]">
                    {insight.recordAnomalies.map((sample) => (
                      <tr
                        key={`${insight.id}-row-${sample.rowNumber}`}
                        className="hover:bg-[var(--dd-surface-hover)]/40"
                      >
                        <td className="px-3 py-1.5 text-[var(--dd-text-primary)] dd-tabular whitespace-nowrap">
                          #{formatCount(sample.rowNumber)}
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-1.5 text-[var(--dd-text-primary)] dd-tabular">
                          {sample.value}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--dd-text-secondary)]">
                          {sample.reason}
                        </td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">
                          <Link
                            to={buildExplorerRowUrl(
                              sample.rowNumber,
                              primaryColId,
                            )}
                            className="inline-flex items-center gap-1 text-[var(--dd-accent-teal)] hover:text-[var(--dd-accent-teal-hover)]"
                          >
                            <span>Inspect Row #{formatCount(sample.rowNumber)}</span>
                            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
