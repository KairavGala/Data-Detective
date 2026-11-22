import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { DossierLabel } from '@/components/ui/DossierLabel';
import type { ProfileWarning, SeverityLevel } from '@/types';
import { cn } from '@/utils';

interface QualityWarningsPanelProps {
  readonly warnings: readonly ProfileWarning[];
}

const SEVERITY_ORDER: Readonly<Record<SeverityLevel, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const SEVERITY_LABELS: Readonly<Record<SeverityLevel, string>> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Notice',
  info: 'Info',
};

/**
 * Surfaces real dataset and column-level profiling warnings ordered by severity.
 */
export function QualityWarningsPanel({ warnings }: QualityWarningsPanelProps) {
  const sortedWarnings = [...warnings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  const actionableCount = sortedWarnings.filter(
    (w) => w.severity === 'critical' || w.severity === 'high' || w.severity === 'medium',
  ).length;

  return (
    <section
      aria-labelledby="quality-warnings-heading"
      data-testid="quality-warnings-panel"
      className="dd-surface-primary space-y-4 p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--dd-border-subtle)] pb-4">
        <div className="space-y-1.5">
          <DossierLabel code="DIAGNOSTICS" label="Quality & Schema Warnings" />
          <h3
            id="quality-warnings-heading"
            className="text-[1.0625rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]"
          >
            Detected Quality Warnings
          </h3>
        </div>

        <span className="font-mono text-[0.75rem] text-[var(--dd-text-muted)] dd-tabular">
          {sortedWarnings.length === 0
            ? '0 warnings'
            : `${sortedWarnings.length} total · ${actionableCount} priority`}
        </span>
      </div>

      {sortedWarnings.length === 0 ? (
        <div className="flex items-center gap-3 py-2 text-[0.875rem] text-[var(--dd-text-secondary)]">
          <CheckCircle2
            className="h-4 w-4 shrink-0 text-[var(--dd-status-verified)]"
            aria-hidden="true"
          />
          <span>
            No structural anomalies, mixed-type columns, ambiguous dates, or
            high missing-value columns were flagged in this dataset.
          </span>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--dd-border-subtle)]">
          {sortedWarnings.map((warning, idx) => {
            const isHigh =
              warning.severity === 'critical' || warning.severity === 'high';
            const isMedium = warning.severity === 'medium';

            return (
              <li
                key={`${warning.code}-${warning.columnId ?? 'dataset'}-${idx}`}
                className="flex items-start gap-3 py-3.5 first:pt-1 last:pb-1"
              >
                {isHigh || isMedium ? (
                  <AlertTriangle
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0',
                      isHigh
                        ? 'text-[var(--dd-status-anomaly)]'
                        : 'text-[var(--dd-status-warning)]',
                    )}
                    aria-hidden="true"
                  />
                ) : (
                  <Info
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--dd-accent-teal)]"
                    aria-hidden="true"
                  />
                )}

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="text-[0.8125rem] font-medium text-[var(--dd-text-primary)]">
                      {warning.title}
                    </span>
                    <span
                      className="text-[var(--dd-border-strong)]"
                      aria-hidden="true"
                    >
                      ·
                    </span>
                    <span
                      className={cn(
                        'font-mono text-[0.6875rem] uppercase',
                        isHigh
                          ? 'text-[var(--dd-status-anomaly)]'
                          : isMedium
                            ? 'text-[var(--dd-status-warning)]'
                            : 'text-[var(--dd-text-muted)]',
                      )}
                    >
                      {SEVERITY_LABELS[warning.severity]}
                    </span>
                    {warning.columnName && (
                      <>
                        <span
                          className="text-[var(--dd-border-strong)]"
                          aria-hidden="true"
                        >
                          ·
                        </span>
                        <span className="font-mono text-[0.72rem] text-[var(--dd-accent-teal)]">
                          {warning.columnName}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-[0.8125rem] leading-relaxed text-[var(--dd-text-secondary)]">
                    {warning.message}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
