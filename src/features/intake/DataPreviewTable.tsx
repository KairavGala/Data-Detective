import { APP_CONFIG } from '@/config/app.config';
import type { ImportedColumn } from '@/types';
import { cn, formatCellValue, formatCount } from '@/utils';

interface DataPreviewTableProps {
  readonly columns: readonly ImportedColumn[];
  readonly rows: readonly (readonly unknown[])[];
  readonly totalRowCount: number;
  readonly maxPreviewRows?: number;
}

/**
 * Bounded, scrollable forensic preview table.
 * Renders only the first N records (default 100) into the DOM,
 * handles wide tables and long strings gracefully, and renders all cell
 * contents strictly as untrusted plain text.
 */
export function DataPreviewTable({
  columns,
  rows,
  totalRowCount,
  maxPreviewRows = APP_CONFIG.intake.previewRowLimit,
}: DataPreviewTableProps) {
  const previewRows = rows.slice(0, maxPreviewRows);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[0.72rem] text-[var(--dd-text-muted)]">
        <span className="dd-tabular">
          Showing {formatCount(previewRows.length)} of{' '}
          {formatCount(totalRowCount)} parsed record
          {totalRowCount === 1 ? '' : 's'}
        </span>
        <span className="dd-tabular">
          {formatCount(columns.length)} column
          {columns.length === 1 ? '' : 's'} · Scroll horizontally for wide files
        </span>
      </div>

      <div
        className="dd-surface-recessed relative max-h-[400px] overflow-auto"
        tabIndex={0}
        aria-label="Parsed dataset preview table"
      >
        <table className="w-full border-collapse text-left text-[0.8125rem]">
          <thead className="sticky top-0 z-10 bg-[var(--dd-surface-elevated)] shadow-[0_1px_0_var(--dd-border-default)]">
            <tr>
              <th
                scope="col"
                className="w-14 border-r border-[var(--dd-border-subtle)] px-3 py-2.5 text-right font-mono text-[0.7rem] font-medium text-[var(--dd-text-muted)] dd-tabular whitespace-nowrap"
              >
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  title={
                    col.wasDuplicateHeader
                      ? `Duplicate header (original: "${col.originalName}")`
                      : col.wasEmptyHeader
                        ? 'Empty header assigned default label'
                        : col.originalName || col.name
                  }
                  className="max-w-[240px] border-r border-[var(--dd-border-subtle)] px-3 py-2.5 font-medium text-[var(--dd-text-primary)] last:border-r-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate whitespace-nowrap">
                      {col.name}
                    </span>
                    <span className="font-mono text-[0.65rem] font-normal text-[var(--dd-text-muted)] dd-tabular shrink-0">
                      {col.wasEmptyHeader
                        ? 'auto'
                        : col.wasDuplicateHeader
                          ? 'dup'
                          : `C${col.index + 1}`}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--dd-border-subtle)]">
            {previewRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-4 py-8 text-center font-mono text-[0.8rem] text-[var(--dd-text-muted)]"
                >
                  No data records below header row. Toggle header setting if the
                  first row contains data.
                </td>
              </tr>
            ) : (
              previewRows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="transition-colors hover:bg-[var(--dd-surface-hover)]/50"
                >
                  <td className="border-r border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)]/40 px-3 py-2 text-right font-mono text-[0.72rem] text-[var(--dd-text-muted)] dd-tabular whitespace-nowrap">
                    {rowIdx + 1}
                  </td>
                  {columns.map((col) => {
                    const rawVal = row[col.index];
                    const formatted = formatCellValue(rawVal);
                    const isEmpty = formatted === '';

                    return (
                      <td
                        key={col.id}
                        title={isEmpty ? undefined : formatted}
                        className={cn(
                          'max-w-[260px] truncate border-r border-[var(--dd-border-subtle)] px-3 py-2 font-mono text-[0.78rem] last:border-r-0',
                          isEmpty
                            ? 'text-[var(--dd-text-muted)]/55'
                            : 'text-[var(--dd-text-secondary)]',
                        )}
                      >
                        {isEmpty ? '—' : formatted}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
