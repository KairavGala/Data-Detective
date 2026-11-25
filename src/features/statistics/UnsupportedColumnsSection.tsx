import { DossierLabel } from '@/components/ui/DossierLabel';
import { COLUMN_TYPE_META } from '@/features/profiling/TypeDistributionStrip';
import type { UnsupportedColumnStatistics } from '@/types';
import { formatCount } from '@/utils';

interface UnsupportedColumnsSectionProps {
  readonly columns: readonly UnsupportedColumnStatistics[];
  readonly totalUnsupportedColumns: number;
}

/**
 * Explicit transparency ledger for columns classified by Module 03 as
 * date, boolean, identifier, or unknown — clearly explaining why they
 * are excluded from Module 04 numeric and categorical statistical routines.
 */
export function UnsupportedColumnsSection({
  columns,
  totalUnsupportedColumns,
}: UnsupportedColumnsSectionProps) {
  if (totalUnsupportedColumns === 0) return null;

  return (
    <section
      aria-labelledby="unsupported-columns-heading"
      data-testid="unsupported-columns-section"
      className="dd-surface-primary overflow-hidden"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--dd-border-subtle)] px-6 py-5">
        <div className="space-y-1.5">
          <DossierLabel
            code="EXCLUDED BY SCHEMA"
            label={`${formatCount(columns.length)} of ${formatCount(totalUnsupportedColumns)} Non-Analyzed Column${totalUnsupportedColumns === 1 ? '' : 's'}`}
          />
          <h3
            id="unsupported-columns-heading"
            className="text-[1.0625rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]"
          >
            Unsupported &amp; Non-Statistical Columns
          </h3>
        </div>

        <span className="font-mono text-[0.75rem] text-[var(--dd-text-muted)]">
          Honoring profiled column classifications without coercing incompatible types
        </span>
      </div>

      {columns.length === 0 ? (
        <div className="px-6 py-8 text-[0.875rem] text-[var(--dd-text-secondary)]">
          No unsupported columns match the current search filter.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                <th className="py-3 pl-6 pr-3 font-medium">Column</th>
                <th className="px-3 py-3 font-medium">Detected Type</th>
                <th className="px-3 py-3 text-right font-medium">Populated / Missing</th>
                <th className="py-3 pl-3 pr-6 font-medium">Exclusion Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--dd-border-subtle)] text-[0.8125rem]">
              {columns.map((col) => {
                const meta = COLUMN_TYPE_META[col.detectedType];
                return (
                  <tr key={col.columnId}>
                    <td className="py-3 pl-6 pr-3 align-middle font-medium text-[var(--dd-text-primary)]">
                      {col.name}
                    </td>
                    <td className="px-3 py-3 align-middle whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-[1px]"
                          style={{ backgroundColor: meta.accentVar }}
                          aria-hidden="true"
                        />
                        <span className="font-mono text-[0.75rem] text-[var(--dd-text-secondary)]">
                          {meta.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right align-middle font-mono text-[0.75rem] text-[var(--dd-text-secondary)] dd-tabular whitespace-nowrap">
                      {formatCount(col.nonMissingCount)} / {formatCount(col.missingCount)}
                    </td>
                    <td className="py-3 pl-3 pr-6 align-middle text-[0.8125rem] text-[var(--dd-text-secondary)]">
                      {col.reason}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
