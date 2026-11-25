import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DossierLabel } from '@/components/ui/DossierLabel';
import type { NumericColumnStatistics, NumericModeSummary } from '@/types';
import { cn, formatCount, formatPercentage, formatStatNumber } from '@/utils';

interface NumericStatisticsSectionProps {
  readonly columns: readonly NumericColumnStatistics[];
  readonly totalNumericColumns: number;
}

function formatModeInline(mode: NumericModeSummary): string {
  if (mode.status === 'empty') return '—';
  if (mode.status === 'no_mode') return 'No mode';
  if (mode.values.length === 1) {
    return `${formatStatNumber(mode.values[0])} (${formatCount(mode.frequency)}×)`;
  }
  const preview = mode.values
    .slice(0, 2)
    .map((v) => formatStatNumber(v))
    .join(', ');
  const remaining = mode.totalModeCount - Math.min(2, mode.values.length);
  return remaining > 0
    ? `${preview} +${formatCount(remaining)} more (${formatCount(mode.frequency)}×)`
    : `${preview} (${formatCount(mode.frequency)}×)`;
}

function formatModeDetailed(mode: NumericModeSummary): string {
  if (mode.status === 'empty') {
    return 'No valid observations available.';
  }
  if (mode.status === 'no_mode') {
    return 'No mode — every valid observation occurs once.';
  }
  const listed = mode.values.map((v) => formatStatNumber(v)).join(', ');
  const suffix = mode.isTruncated
    ? ` (showing ${formatCount(mode.values.length)} of ${formatCount(mode.totalModeCount)} tied modes)`
    : '';
  const kind =
    mode.status === 'unimodal'
      ? 'Unimodal'
      : `Multimodal (${formatCount(mode.totalModeCount)} tied)`;
  return `${kind}: ${listed} — ${formatCount(mode.frequency)} occurrence${mode.frequency === 1 ? '' : 's'} each${suffix}`;
}

/**
 * Forensic numeric descriptive statistics ledger.
 * Renders key summary metrics in a high-density tabular grid and expands
 * each numeric column to expose full central tendency, dispersion, quartile,
 * and valid vs excluded observation details.
 */
export function NumericStatisticsSection({
  columns,
  totalNumericColumns,
}: NumericStatisticsSectionProps) {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() =>
    columns.length > 0 ? new Set([columns[0]!.columnId]) : new Set(),
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

  return (
    <section
      aria-labelledby="numeric-statistics-heading"
      data-testid="numeric-statistics-section"
      className="dd-surface-primary overflow-hidden"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--dd-border-subtle)] px-6 py-5">
        <div className="space-y-1.5">
          <DossierLabel
            code="NUMERIC ENGINE"
            label={`${formatCount(columns.length)} of ${formatCount(totalNumericColumns)} Numeric Column${totalNumericColumns === 1 ? '' : 's'}`}
          />
          <h3
            id="numeric-statistics-heading"
            className="text-[1.0625rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]"
          >
            Numeric Column Statistics
          </h3>
        </div>

        <span className="font-mono text-[0.75rem] text-[var(--dd-text-muted)]">
          Select any column to inspect variance, population &amp; sample std dev, quartiles, and mode
        </span>
      </div>

      {totalNumericColumns === 0 ? (
        <div
          data-testid="numeric-empty-state"
          className="px-6 py-8 text-[0.875rem] text-[var(--dd-text-secondary)]"
        >
          No columns were classified as numeric in the active dataset.
        </div>
      ) : columns.length === 0 ? (
        <div className="px-6 py-8 text-[0.875rem] text-[var(--dd-text-secondary)]">
          No numeric columns match the current search filter.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                <th className="w-10 py-3 pl-4 pr-2 font-medium" aria-label="Expand" />
                <th className="px-3 py-3 font-medium">Column</th>
                <th className="px-3 py-3 text-right font-medium">Valid / Excl.</th>
                <th className="px-3 py-3 text-right font-medium">Mean</th>
                <th className="px-3 py-3 text-right font-medium">Median</th>
                <th className="px-3 py-3 text-right font-medium">Mode</th>
                <th className="px-3 py-3 text-right font-medium">Min</th>
                <th className="px-3 py-3 text-right font-medium">Max</th>
                <th className="px-3 py-3 text-right font-medium">Std Dev (s)</th>
                <th className="py-3 pl-3 pr-6 text-right font-medium">IQR</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--dd-border-subtle)] text-[0.8125rem]">
              {columns.map((col) => {
                const isExpanded = expandedIds.has(col.columnId);

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
                          aria-label={`Inspect numeric statistics for ${col.name}`}
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
                          <div className="font-mono text-[0.6875rem] text-[var(--dd-text-muted)] dd-tabular">
                            {col.hasValidData
                              ? `${formatCount(col.distinctCount)} distinct`
                              : 'No valid observations'}
                          </div>
                        </button>
                      </td>

                      <td className="px-3 py-3 text-right align-middle font-mono dd-tabular whitespace-nowrap">
                        <div className="text-[var(--dd-text-primary)]">
                          {formatCount(col.validCount)}
                        </div>
                        <div
                          className={cn(
                            'text-[0.6875rem]',
                            col.invalidCount > 0
                              ? 'text-[var(--dd-status-warning)]'
                              : 'text-[var(--dd-text-muted)]',
                          )}
                        >
                          {formatCount(col.excludedCount)} excl.
                        </div>
                      </td>

                      <td className="px-3 py-3 text-right align-middle font-mono text-[var(--dd-text-primary)] dd-tabular whitespace-nowrap">
                        {formatStatNumber(col.mean)}
                      </td>

                      <td className="px-3 py-3 text-right align-middle font-mono text-[var(--dd-text-primary)] dd-tabular whitespace-nowrap">
                        {formatStatNumber(col.median)}
                      </td>

                      <td className="px-3 py-3 text-right align-middle font-mono text-[0.75rem] text-[var(--dd-text-secondary)] dd-tabular whitespace-nowrap">
                        {formatModeInline(col.mode)}
                      </td>

                      <td className="px-3 py-3 text-right align-middle font-mono text-[var(--dd-text-secondary)] dd-tabular whitespace-nowrap">
                        {formatStatNumber(col.min)}
                      </td>

                      <td className="px-3 py-3 text-right align-middle font-mono text-[var(--dd-text-secondary)] dd-tabular whitespace-nowrap">
                        {formatStatNumber(col.max)}
                      </td>

                      <td className="px-3 py-3 text-right align-middle font-mono text-[var(--dd-text-primary)] dd-tabular whitespace-nowrap">
                        {col.hasValidData && col.validCount < 2
                          ? 'N/A (n<2)'
                          : formatStatNumber(col.sampleStdDev)}
                      </td>

                      <td className="py-3 pl-3 pr-6 text-right align-middle font-mono text-[var(--dd-accent-teal)] dd-tabular whitespace-nowrap">
                        {formatStatNumber(col.iqr)}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-[var(--dd-surface-recessed)]">
                        <td colSpan={10} className="px-6 py-5">
                          {!col.hasValidData ? (
                            <div className="space-y-1 text-[0.8125rem] text-[var(--dd-text-secondary)]">
                              <p className="font-medium text-[var(--dd-text-primary)]">
                                No valid numeric observations available for &ldquo;{col.name}&rdquo;.
                              </p>
                              <p className="font-mono text-[0.75rem] text-[var(--dd-text-muted)] dd-tabular">
                                Total rows: {formatCount(col.totalCount)} · Missing:{' '}
                                {formatCount(col.missingCount)} · Invalid / Non-finite:{' '}
                                {formatCount(col.invalidCount)}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-5">
                              {/* Structured 3-group statistical dossier */}
                              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                                {/* Group 1: Central Tendency & Observation Audit */}
                                <div className="space-y-3">
                                  <div className="font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                                    Central Tendency &amp; Coverage
                                  </div>
                                  <dl className="grid grid-cols-2 gap-3 font-mono text-[0.78rem] dd-tabular">
                                    <div>
                                      <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                        Mean
                                      </dt>
                                      <dd className="mt-0.5 text-[var(--dd-text-primary)]">
                                        {formatStatNumber(col.mean)}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                        Median (Q2)
                                      </dt>
                                      <dd className="mt-0.5 text-[var(--dd-text-primary)]">
                                        {formatStatNumber(col.median)}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                        Valid Observations
                                      </dt>
                                      <dd className="mt-0.5 text-[var(--dd-status-verified)]">
                                        {formatCount(col.validCount)} ({formatPercentage(col.validPercentage, 1)})
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                        Excluded (Miss / Inv)
                                      </dt>
                                      <dd className="mt-0.5 text-[var(--dd-text-secondary)]">
                                        {formatCount(col.missingCount)} / {formatCount(col.invalidCount)}
                                      </dd>
                                    </div>
                                  </dl>
                                </div>

                                {/* Group 2: Dispersion & Variance */}
                                <div className="space-y-3 border-t border-[var(--dd-border-subtle)] pt-4 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
                                  <div className="font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                                    Dispersion &amp; Variance
                                  </div>
                                  <dl className="grid grid-cols-2 gap-3 font-mono text-[0.78rem] dd-tabular">
                                    <div>
                                      <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                        Sample Std Dev (s)
                                      </dt>
                                      <dd className="mt-0.5 text-[var(--dd-text-primary)]">
                                        {col.validCount < 2
                                          ? 'N/A (n < 2)'
                                          : formatStatNumber(col.sampleStdDev)}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                        Population Std Dev (σ)
                                      </dt>
                                      <dd className="mt-0.5 text-[var(--dd-text-primary)]">
                                        {formatStatNumber(col.populationStdDev)}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                        Sample Variance (s²)
                                      </dt>
                                      <dd className="mt-0.5 text-[var(--dd-text-secondary)]">
                                        {col.validCount < 2
                                          ? 'N/A (n < 2)'
                                          : formatStatNumber(col.sampleVariance)}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                        Population Variance (σ²)
                                      </dt>
                                      <dd className="mt-0.5 text-[var(--dd-text-secondary)]">
                                        {formatStatNumber(col.populationVariance)}
                                      </dd>
                                    </div>
                                  </dl>
                                </div>

                                {/* Group 3: Range & Quartiles */}
                                <div className="space-y-3 border-t border-[var(--dd-border-subtle)] pt-4 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
                                  <div className="font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                                    Range &amp; Quartiles
                                  </div>
                                  <dl className="grid grid-cols-2 gap-3 font-mono text-[0.78rem] dd-tabular">
                                    <div>
                                      <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                        Min / Max
                                      </dt>
                                      <dd className="mt-0.5 text-[var(--dd-text-primary)]">
                                        {formatStatNumber(col.min)} / {formatStatNumber(col.max)}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                        Range (Max − Min)
                                      </dt>
                                      <dd className="mt-0.5 text-[var(--dd-text-primary)]">
                                        {formatStatNumber(col.range)}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                        Q1 / Q2 / Q3
                                      </dt>
                                      <dd className="mt-0.5 text-[var(--dd-text-secondary)]">
                                        {formatStatNumber(col.q1)} · {formatStatNumber(col.q2)} ·{' '}
                                        {formatStatNumber(col.q3)}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                        IQR (Q3 − Q1)
                                      </dt>
                                      <dd className="mt-0.5 text-[var(--dd-accent-teal)]">
                                        {formatStatNumber(col.iqr)}
                                      </dd>
                                    </div>
                                  </dl>
                                </div>
                              </div>

                              {/* Mode breakdown */}
                              <div className="border-t border-[var(--dd-border-subtle)] pt-3.5 font-mono text-[0.75rem] text-[var(--dd-text-secondary)] dd-tabular">
                                <span className="text-[var(--dd-text-muted)] uppercase">
                                  Mode:{' '}
                                </span>
                                <span className="text-[var(--dd-text-primary)]">
                                  {formatModeDetailed(col.mode)}
                                </span>
                              </div>
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
