import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DossierLabel } from '@/components/ui/DossierLabel';
import type {
  CategoricalColumnStatistics,
  CategoricalExtremumSummary,
} from '@/types';
import { cn, formatCount, formatPercentage } from '@/utils';

interface CategoricalStatisticsSectionProps {
  readonly columns: readonly CategoricalColumnStatistics[];
  readonly totalCategoricalColumns: number;
}

const INITIAL_VISIBLE_CATEGORIES = 25;

function formatExtremumInline(
  extremum: CategoricalExtremumSummary | null,
): string {
  if (!extremum || extremum.values.length === 0) return '—';
  const preview = extremum.values.slice(0, 2).join(', ');
  const extra = extremum.totalTiedCount - Math.min(2, extremum.values.length);
  const label = extra > 0 ? `${preview} +${formatCount(extra)} tied` : preview;
  const tieTag = extremum.isTie ? ` [Tie: ${formatCount(extremum.totalTiedCount)}]` : '';
  return `${label}${tieTag} (${formatCount(extremum.count)} · ${formatPercentage(extremum.percentage, 1)})`;
}

function formatExtremumDetailed(
  extremum: CategoricalExtremumSummary | null,
): string {
  if (!extremum || extremum.values.length === 0) {
    return 'No valid observations';
  }
  const listed = extremum.values.join(', ');
  const trunc = extremum.isTruncated
    ? ` (showing ${formatCount(extremum.values.length)} of ${formatCount(extremum.totalTiedCount)} tied)`
    : '';
  const prefix = extremum.isTie
    ? `Tie across ${formatCount(extremum.totalTiedCount)} categories: `
    : '';
  return `${prefix}${listed}${trunc} — ${formatCount(extremum.count)} (${formatPercentage(extremum.percentage, 2)})`;
}

/**
 * Forensic categorical frequency & percentage distribution ledger.
 * Strictly tabular (no visualization charts — reserved for Module 06).
 * Explicitly surfaces ties in both most-frequent and least-frequent categories.
 */
export function CategoricalStatisticsSection({
  columns,
  totalCategoricalColumns,
}: CategoricalStatisticsSectionProps) {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() =>
    columns.length > 0 ? new Set([columns[0]!.columnId]) : new Set(),
  );
  const [showAllIds, setShowAllIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggleColumn = (columnId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  };

  const toggleShowAll = (columnId: string) => {
    setShowAllIds((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  };

  return (
    <section
      aria-labelledby="categorical-statistics-heading"
      data-testid="categorical-statistics-section"
      className="dd-surface-primary overflow-hidden"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--dd-border-subtle)] px-6 py-5">
        <div className="space-y-1.5">
          <DossierLabel
            code="CATEGORICAL ENGINE"
            label={`${formatCount(columns.length)} of ${formatCount(totalCategoricalColumns)} Categorical Column${totalCategoricalColumns === 1 ? '' : 's'}`}
          />
          <h3
            id="categorical-statistics-heading"
            className="text-[1.0625rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]"
          >
            Categorical Column Distributions
          </h3>
        </div>

        <span className="font-mono text-[0.75rem] text-[var(--dd-text-muted)]">
          Select any column to inspect full frequency &amp; percentage tables and tie details
        </span>
      </div>

      {totalCategoricalColumns === 0 ? (
        <div
          data-testid="categorical-empty-state"
          className="px-6 py-8 text-[0.875rem] text-[var(--dd-text-secondary)]"
        >
          No columns were classified as categorical by Module 03 in the active dataset.
        </div>
      ) : columns.length === 0 ? (
        <div className="px-6 py-8 text-[0.875rem] text-[var(--dd-text-secondary)]">
          No categorical columns match the current search filter.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                <th className="w-10 py-3 pl-4 pr-2 font-medium" aria-label="Expand" />
                <th className="px-3 py-3 font-medium">Column</th>
                <th className="px-3 py-3 text-right font-medium">Distinct</th>
                <th className="px-3 py-3 text-right font-medium">Valid / Excl.</th>
                <th className="px-3 py-3 font-medium">Most Frequent</th>
                <th className="py-3 pl-3 pr-6 font-medium">Least Frequent</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--dd-border-subtle)] text-[0.8125rem]">
              {columns.map((col) => {
                const isExpanded = expandedIds.has(col.columnId);
                const showingAll = showAllIds.has(col.columnId);
                const visibleEntries = showingAll
                  ? col.distribution
                  : col.distribution.slice(0, INITIAL_VISIBLE_CATEGORIES);
                const hiddenByUiCount =
                  col.distribution.length - visibleEntries.length;

                return (
                  <Fragment key={col.columnId}>
                    <tr
                      className={cn(
                        'transition-colors hover:bg-[var(--dd-surface-hover)]',
                        isExpanded && 'bg-[var(--dd-surface-elevated)]/60',
                      )}
                    >
                      <td className="py-3 pl-4 pr-2 align-middle">
                        <button
                          type="button"
                          onClick={() => toggleColumn(col.columnId)}
                          aria-expanded={isExpanded}
                          aria-label={`Inspect categorical distribution for ${col.name}`}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[var(--dd-radius-xs)] text-[var(--dd-text-muted)] transition-colors hover:bg-[var(--dd-surface-recessed)] hover:text-[var(--dd-text-primary)]"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      </td>

                      <td className="px-3 py-3 align-middle">
                        <button
                          type="button"
                          onClick={() => toggleColumn(col.columnId)}
                          className="cursor-pointer text-left"
                        >
                          <div className="font-medium text-[var(--dd-text-primary)]">
                            {col.name}
                          </div>
                          <div className="font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
                            {col.hasValidData
                              ? col.isUniformDistribution
                                ? 'Uniform frequency across categories'
                                : `${formatPercentage(col.validPercentage, 1)} populated`
                              : 'No valid observations'}
                          </div>
                        </button>
                      </td>

                      <td className="px-3 py-3 text-right align-middle font-mono text-[var(--dd-text-primary)] dd-tabular whitespace-nowrap">
                        {formatCount(col.distinctCount)}
                      </td>

                      <td className="px-3 py-3 text-right align-middle font-mono dd-tabular whitespace-nowrap">
                        <div className="text-[var(--dd-text-primary)]">
                          {formatCount(col.validCount)}
                        </div>
                        <div className="text-[0.6875rem] text-[var(--dd-text-muted)]">
                          {formatCount(col.excludedCount)} excl.
                        </div>
                      </td>

                      <td
                        className="max-w-[260px] truncate px-3 py-3 align-middle font-mono text-[0.75rem] text-[var(--dd-text-primary)] dd-tabular"
                        title={formatExtremumDetailed(col.mostFrequent)}
                      >
                        {formatExtremumInline(col.mostFrequent)}
                      </td>

                      <td
                        className="max-w-[260px] truncate py-3 pl-3 pr-6 align-middle font-mono text-[0.75rem] text-[var(--dd-text-secondary)] dd-tabular"
                        title={formatExtremumDetailed(col.leastFrequent)}
                      >
                        {formatExtremumInline(col.leastFrequent)}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-[var(--dd-surface-recessed)]">
                        <td colSpan={6} className="px-6 py-5">
                          {!col.hasValidData ? (
                            <div className="space-y-1 text-[0.8125rem] text-[var(--dd-text-secondary)]">
                              <p className="font-medium text-[var(--dd-text-primary)]">
                                No valid categorical observations available for &ldquo;{col.name}&rdquo;.
                              </p>
                              <p className="font-mono text-[0.75rem] text-[var(--dd-text-muted)] dd-tabular">
                                Total rows: {formatCount(col.totalCount)} · Missing:{' '}
                                {formatCount(col.missingCount)} · Invalid:{' '}
                                {formatCount(col.invalidCount)}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-5">
                              {/* Extremum & observation summary */}
                              <dl className="grid grid-cols-1 gap-4 border-b border-[var(--dd-border-subtle)] pb-4 md:grid-cols-3 font-mono text-[0.75rem] dd-tabular">
                                <div className="space-y-1">
                                  <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                    Most Frequent Category
                                  </dt>
                                  <dd className="text-[var(--dd-text-primary)]">
                                    {formatExtremumDetailed(col.mostFrequent)}
                                  </dd>
                                </div>
                                <div className="space-y-1">
                                  <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                    Least Frequent Category
                                  </dt>
                                  <dd className="text-[var(--dd-text-secondary)]">
                                    {formatExtremumDetailed(col.leastFrequent)}
                                  </dd>
                                </div>
                                <div className="space-y-1">
                                  <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                    Observation Coverage
                                  </dt>
                                  <dd className="text-[var(--dd-text-secondary)]">
                                    {formatCount(col.validCount)} valid ·{' '}
                                    {formatCount(col.missingCount)} missing ·{' '}
                                    {formatCount(col.invalidCount)} invalid
                                  </dd>
                                </div>
                              </dl>

                              {/* Pure tabular frequency & percentage distribution */}
                              <div className="overflow-x-auto">
                                <table className="w-full border-collapse text-left">
                                  <thead>
                                    <tr className="border-b border-[var(--dd-border-subtle)] font-mono text-[0.65rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                                      <th className="w-12 py-2 pr-3 font-medium">Rank</th>
                                      <th className="px-3 py-2 font-medium">Category Value</th>
                                      <th className="px-3 py-2 text-right font-medium">Frequency</th>
                                      <th className="px-3 py-2 text-right font-medium">Share of Valid</th>
                                      <th className="py-2 pl-3 text-right font-medium">Share of Total Rows</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[var(--dd-border-subtle)]/70 font-mono text-[0.75rem] dd-tabular">
                                    {visibleEntries.map((entry, idx) => (
                                      <tr key={`${col.columnId}-cat-${entry.value}`}>
                                        <td className="py-2 pr-3 text-[var(--dd-text-muted)]">
                                          {idx + 1}
                                        </td>
                                        <td
                                          className="max-w-md truncate px-3 py-2 text-[var(--dd-text-primary)]"
                                          title={entry.value}
                                        >
                                          {entry.value}
                                        </td>
                                        <td className="px-3 py-2 text-right text-[var(--dd-text-primary)] whitespace-nowrap">
                                          {formatCount(entry.count)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-[var(--dd-accent-teal)] whitespace-nowrap">
                                          {formatPercentage(entry.percentage, 2)}
                                        </td>
                                        <td className="py-2 pl-3 text-right text-[var(--dd-text-muted)] whitespace-nowrap">
                                          {formatPercentage(entry.percentageOfTotal, 2)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              {/* High-cardinality toggle / truncation notice */}
                              {(col.distribution.length > INITIAL_VISIBLE_CATEGORIES ||
                                col.isDistributionTruncated) && (
                                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--dd-border-subtle)] pt-3 font-mono text-[0.72rem] text-[var(--dd-text-muted)] dd-tabular">
                                  <span>
                                    Showing {formatCount(visibleEntries.length)} of{' '}
                                    {formatCount(col.distinctCount)} distinct categories
                                    {col.isDistributionTruncated
                                      ? ` (${formatCount(col.omittedCategoryCount)} long-tail categories spanning ${formatCount(col.omittedObservationCount)} observations omitted from display cap)`
                                      : ''}
                                  </span>

                                  {col.distribution.length > INITIAL_VISIBLE_CATEGORIES && (
                                    <button
                                      type="button"
                                      onClick={() => toggleShowAll(col.columnId)}
                                      className="cursor-pointer text-[var(--dd-accent-teal)] transition-colors hover:text-[var(--dd-accent-teal-hover)] whitespace-nowrap"
                                    >
                                      {showingAll
                                        ? `Show Top ${INITIAL_VISIBLE_CATEGORIES}`
                                        : `Show ${formatCount(hiddenByUiCount)} More Categories`}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
