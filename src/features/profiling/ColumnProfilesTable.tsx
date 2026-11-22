import { Fragment, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { DossierLabel } from '@/components/ui/DossierLabel';
import type { DatasetColumnProfile } from '@/types';
import { cn, formatCount } from '@/utils';
import { COLUMN_TYPE_META } from './TypeDistributionStrip';

interface ColumnProfilesTableProps {
  readonly columns: readonly DatasetColumnProfile[];
}

function summarizeValidity(col: DatasetColumnProfile): string {
  if (col.nonMissingCount === 0) return 'No populated values';

  if (col.detectedType === 'date' && col.dateStats) {
    const parts: string[] = [
      `${formatCount(col.dateStats.validCount)} valid`,
    ];
    if (col.dateStats.ambiguousCount > 0) {
      parts.push(`${formatCount(col.dateStats.ambiguousCount)} ambiguous`);
    }
    if (col.dateStats.invalidCount > 0) {
      parts.push(`${formatCount(col.dateStats.invalidCount)} invalid`);
    }
    return parts.join(' · ');
  }

  if (col.detectedType === 'numeric' && col.numericStats) {
    const parts: string[] = [
      `${formatCount(col.numericStats.validCount)} valid`,
    ];
    if (col.numericStats.invalidCount > 0) {
      parts.push(`${formatCount(col.numericStats.invalidCount)} invalid`);
    } else if (col.numericStats.decimalCount > 0) {
      parts.push(
        `${formatCount(col.numericStats.integerCount)} int / ${formatCount(col.numericStats.decimalCount)} dec`,
      );
    } else {
      parts.push('all integer');
    }
    return parts.join(' · ');
  }

  if (col.detectedType === 'unknown') {
    return `Mixed / unclassifiable (${formatCount(col.nonMissingCount)} populated)`;
  }

  if (col.invalidCount > 0) {
    return `${formatCount(col.validCount)} valid · ${formatCount(col.invalidCount)} invalid`;
  }

  return `${formatCount(col.validCount)} valid`;
}

/**
 * Forensic column schema & profile ledger.
 * Displays every column with detected type, missing %, unique count, validity summary,
 * and warnings; clicking any row expands its full evidence breakdown.
 * All sample and category values are rendered strictly as plain text.
 */
export function ColumnProfilesTable({ columns }: ColumnProfilesTableProps) {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
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

  return (
    <section
      aria-labelledby="column-profiles-heading"
      data-testid="column-profiles-section"
      className="dd-surface-primary overflow-hidden"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--dd-border-subtle)] px-6 py-5">
        <div className="space-y-1.5">
          <DossierLabel code="SCHEMA LEDGER" label="Column-Level Profiles" />
          <h3
            id="column-profiles-heading"
            className="text-[1.0625rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]"
          >
            Column Profiles
          </h3>
        </div>

        <span className="font-mono text-[0.75rem] text-[var(--dd-text-muted)] dd-tabular">
          Select any column to inspect samples, rationale &amp; validity details
        </span>
      </div>

      {columns.length === 0 ? (
        <div className="px-6 py-8 text-[0.875rem] text-[var(--dd-text-secondary)]">
          No columns were detected in the active dataset.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                <th className="w-10 py-3 pl-4 pr-2 font-medium" aria-label="Expand" />
                <th className="px-3 py-3 font-medium">Column</th>
                <th className="px-3 py-3 font-medium">Detected Type</th>
                <th className="px-3 py-3 text-right font-medium">Missing</th>
                <th className="px-3 py-3 text-right font-medium">Unique</th>
                <th className="px-3 py-3 font-medium">Validity</th>
                <th className="py-3 pl-3 pr-6 text-right font-medium">Warnings</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--dd-border-subtle)] text-[0.8125rem]">
              {columns.map((col) => {
                const isExpanded = expandedIds.has(col.columnId);
                const typeMeta = COLUMN_TYPE_META[col.detectedType];
                const highSeverityWarning = col.warnings.some(
                  (w) => w.severity === 'high' || w.severity === 'critical',
                );
                const mediumSeverityWarning = col.warnings.some(
                  (w) => w.severity === 'medium',
                );

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
                          aria-label={`Inspect column ${col.name}`}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[var(--dd-radius-xs)] text-[var(--dd-text-muted)] transition-colors hover:bg-[var(--dd-surface-recessed)] hover:text-[var(--dd-text-primary)]"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      </td>

                      {/* Column name & ID */}
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
                            {col.columnId}
                            {col.originalName && col.originalName !== col.name
                              ? ` · orig: ${col.originalName}`
                              : ''}
                          </div>
                        </button>
                      </td>

                      {/* Detected type & confidence */}
                      <td className="px-3 py-3 align-middle whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <span
                            className="inline-block h-2 w-2 rounded-[1px] shrink-0"
                            style={{ backgroundColor: typeMeta.accentVar }}
                            aria-hidden="true"
                          />
                          <span className="font-medium text-[var(--dd-text-primary)]">
                            {typeMeta.label}
                          </span>
                          <span className="font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
                            · {col.confidence}
                          </span>
                        </div>
                      </td>

                      {/* Missing count & percentage */}
                      <td className="px-3 py-3 text-right align-middle font-mono dd-tabular whitespace-nowrap">
                        <div
                          className={cn(
                            col.missingPercentage >= 50
                              ? 'text-[var(--dd-status-anomaly)]'
                              : col.missingPercentage >= 20
                                ? 'text-[var(--dd-status-warning)]'
                                : 'text-[var(--dd-text-primary)]',
                          )}
                        >
                          {col.missingPercentage.toFixed(1)}%
                        </div>
                        <div className="text-[0.6875rem] text-[var(--dd-text-muted)]">
                          {formatCount(col.missingCount)} / {formatCount(col.totalCount)}
                        </div>
                      </td>

                      {/* Unique count & distinct ratio */}
                      <td className="px-3 py-3 text-right align-middle font-mono dd-tabular whitespace-nowrap">
                        <div className="text-[var(--dd-text-primary)]">
                          {formatCount(col.uniqueCount)}
                        </div>
                        <div className="text-[0.6875rem] text-[var(--dd-text-muted)]">
                          {(col.distinctRatio * 100).toFixed(1)}% distinct
                        </div>
                      </td>

                      {/* Validity readout */}
                      <td className="px-3 py-3 align-middle font-mono text-[0.75rem] text-[var(--dd-text-secondary)] dd-tabular">
                        {summarizeValidity(col)}
                      </td>

                      {/* Column warning count */}
                      <td className="py-3 pl-3 pr-6 text-right align-middle font-mono text-[0.75rem] dd-tabular whitespace-nowrap">
                        {col.warnings.length === 0 ? (
                          <span className="text-[var(--dd-text-muted)]">None</span>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex items-center justify-end gap-1.5',
                              highSeverityWarning
                                ? 'text-[var(--dd-status-anomaly)]'
                                : mediumSeverityWarning
                                  ? 'text-[var(--dd-status-warning)]'
                                  : 'text-[var(--dd-text-secondary)]',
                            )}
                          >
                            {(highSeverityWarning || mediumSeverityWarning) && (
                              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            <span>{col.warnings.length}</span>
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* Expanded forensic column detail panel */}
                    {isExpanded && (
                      <tr className="bg-[var(--dd-surface-recessed)]">
                        <td colSpan={7} className="px-6 py-5">
                          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                            {/* Left: Detection explanation + metrics */}
                            <div className="space-y-4 lg:col-span-7">
                              <div className="space-y-1">
                                <div className="font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                                  Classification Rationale
                                </div>
                                <p className="text-[0.8125rem] leading-relaxed text-[var(--dd-text-primary)]">
                                  {col.detectionReason}
                                </p>
                              </div>

                              {/* Detailed counts */}
                              <dl className="grid grid-cols-2 gap-4 border-t border-[var(--dd-border-subtle)] pt-3.5 sm:grid-cols-4 font-mono text-[0.75rem] dd-tabular">
                                <div>
                                  <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                    Populated
                                  </dt>
                                  <dd className="mt-0.5 text-[var(--dd-text-primary)]">
                                    {formatCount(col.nonMissingCount)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                    Duplicates
                                  </dt>
                                  <dd className="mt-0.5 text-[var(--dd-text-primary)]">
                                    {formatCount(col.duplicateCount)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                    Structural Nulls
                                  </dt>
                                  <dd className="mt-0.5 text-[var(--dd-text-primary)]">
                                    {formatCount(col.structuralMissingCount)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-[0.65rem] text-[var(--dd-text-muted)] uppercase">
                                    Marker Nulls
                                  </dt>
                                  <dd className="mt-0.5 text-[var(--dd-text-primary)]">
                                    {formatCount(col.markerMissingCount)}
                                  </dd>
                                </div>
                              </dl>

                              {/* Date format breakdown if present */}
                              {col.dateStats && (
                                <div className="space-y-1.5 border-t border-[var(--dd-border-subtle)] pt-3.5 text-[0.78rem]">
                                  <div className="font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                                    Date Format Diagnostics
                                  </div>
                                  <div className="font-mono text-[var(--dd-text-secondary)] dd-tabular">
                                    Valid: {formatCount(col.dateStats.validCount)} · Ambiguous:{' '}
                                    {formatCount(col.dateStats.ambiguousCount)} · Invalid:{' '}
                                    {formatCount(col.dateStats.invalidCount)}
                                  </div>
                                  {col.dateStats.detectedFormats.length > 0 && (
                                    <div className="text-[var(--dd-text-muted)]">
                                      Observed formats:{' '}
                                      <span className="font-mono text-[var(--dd-text-secondary)]">
                                        {col.dateStats.detectedFormats.join(', ')}
                                      </span>
                                    </div>
                                  )}
                                  {col.dateStats.conventionNote && (
                                    <p className="text-[var(--dd-status-warning)]">
                                      {col.dateStats.conventionNote}
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* Numeric validity details (Module 03 validity only — no mean/median/std) */}
                              {col.numericStats && (
                                <div className="space-y-1 border-t border-[var(--dd-border-subtle)] pt-3.5 text-[0.78rem]">
                                  <div className="font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                                    Numeric Validity Breakdown
                                  </div>
                                  <div className="font-mono text-[var(--dd-text-secondary)] dd-tabular">
                                    Integers: {formatCount(col.numericStats.integerCount)} · Decimals:{' '}
                                    {formatCount(col.numericStats.decimalCount)} · Formatted strings:{' '}
                                    {formatCount(col.numericStats.formattedStringCount)} · Invalid:{' '}
                                    {formatCount(col.numericStats.invalidCount)}
                                  </div>
                                </div>
                              )}

                              {/* Matched missing markers */}
                              {col.matchedMissingMarkers.length > 0 && (
                                <div className="border-t border-[var(--dd-border-subtle)] pt-3 text-[0.75rem] text-[var(--dd-text-muted)]">
                                  Matched missing-value markers:{' '}
                                  <span className="font-mono text-[var(--dd-text-secondary)]">
                                    {col.matchedMissingMarkers.join(', ')}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Right: Representative samples & common values + column warnings */}
                            <div className="space-y-4 border-t border-[var(--dd-border-subtle)] pt-4 lg:col-span-5 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
                              <div className="space-y-1.5">
                                <div className="font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                                  Representative Sample Values
                                </div>
                                {col.sampleValues.length === 0 ? (
                                  <p className="font-mono text-[0.75rem] text-[var(--dd-text-muted)]">
                                    No populated samples available.
                                  </p>
                                ) : (
                                  <ul className="space-y-1 font-mono text-[0.75rem] text-[var(--dd-text-secondary)]">
                                    {col.sampleValues.map((sample, idx) => (
                                      <li
                                        key={`${col.columnId}-sample-${idx}`}
                                        className="truncate"
                                        title={sample}
                                      >
                                        <span className="mr-2 text-[var(--dd-text-muted)]">
                                          {idx + 1}.
                                        </span>
                                        <span>{sample}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              {/* Common categorical / boolean values */}
                              {col.topCategories && col.topCategories.length > 0 && (
                                <div className="space-y-1.5 border-t border-[var(--dd-border-subtle)] pt-3.5">
                                  <div className="font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                                    Most Frequent Values
                                  </div>
                                  <ul className="space-y-1 font-mono text-[0.75rem] dd-tabular">
                                    {col.topCategories.map((cat) => (
                                      <li
                                        key={`${col.columnId}-cat-${cat.value}`}
                                        className="flex items-center justify-between gap-3"
                                      >
                                        <span
                                          className="truncate text-[var(--dd-text-primary)]"
                                          title={cat.value}
                                        >
                                          {cat.value}
                                        </span>
                                        <span className="shrink-0 text-[var(--dd-text-muted)]">
                                          {formatCount(cat.count)} ({cat.percentage.toFixed(1)}%)
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Column-specific warnings */}
                              {col.warnings.length > 0 && (
                                <div className="space-y-1.5 border-t border-[var(--dd-border-subtle)] pt-3.5">
                                  <div className="font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                                    Column Notices
                                  </div>
                                  <ul className="space-y-1.5 text-[0.75rem] text-[var(--dd-text-secondary)]">
                                    {col.warnings.map((w, idx) => (
                                      <li key={`${w.code}-${idx}`}>
                                        <span className="font-medium text-[var(--dd-text-primary)]">
                                          {w.title}:
                                        </span>{' '}
                                        {w.message}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
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
