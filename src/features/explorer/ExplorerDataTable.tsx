import { useMemo } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import {
  isColumnFilterActive,
  type ExplorerColumnDescriptor,
} from '@/engine/explorer';
import {
  classifyMissingValue,
  compileMissingPolicy,
} from '@/engine/profiling';
import { COLUMN_TYPE_META } from '@/features/profiling/TypeDistributionStrip';
import type {
  ExplorerColumnFilter,
  ExplorerSortConfig,
  ImportedDataset,
  MissingValuePolicy,
} from '@/types';
import { cn, formatCellValue, formatCount } from '@/utils';

interface ExplorerDataTableProps {
  readonly dataset: ImportedDataset;
  readonly visibleColumns: readonly ExplorerColumnDescriptor[];
  readonly pageRowIndices: readonly number[];
  readonly sort: ExplorerSortConfig | null;
  readonly columnFilters: Readonly<Record<string, ExplorerColumnFilter>>;
  readonly missingValuePolicy: MissingValuePolicy;
  readonly hasActiveFilters: boolean;
  readonly focusedColumnId?: string | null;
  readonly highlightedRowIndex?: number | null;
  readonly onToggleSort: (columnId: string) => void;
  readonly onOpenColumnFilter: (columnId: string) => void;
  readonly onClearAllFilters: () => void;
  readonly onShowAllColumns: () => void;
}

/**
 * High-density forensic interactive spreadsheet grid.
 * - Renders ONLY the bounded active page slice (<= 250 rows).
 * - Sticky column headers & sticky original 1-based row-number gutter.
 * - Preserves original cell text strictly as plain text without mutation.
 * - Clearly differentiates structural nulls/empties from M03 policy markers.
 */
export function ExplorerDataTable({
  dataset,
  visibleColumns,
  pageRowIndices,
  sort,
  columnFilters,
  missingValuePolicy,
  hasActiveFilters,
  focusedColumnId = null,
  highlightedRowIndex = null,
  onToggleSort,
  onOpenColumnFilter,
  onClearAllFilters,
  onShowAllColumns,
}: ExplorerDataTableProps) {
  const compiledMissing = useMemo(
    () => compileMissingPolicy(missingValuePolicy),
    [missingValuePolicy],
  );

  // All columns hidden guardrail state
  if (dataset.columns.length > 0 && visibleColumns.length === 0) {
    return (
      <div
        data-testid="explorer-all-columns-hidden-state"
        className="dd-surface-recessed flex flex-col items-center justify-center gap-3 px-6 py-12 text-center"
      >
        <p className="text-[0.875rem] font-medium text-[var(--dd-text-primary)]">
          All columns are currently hidden.
        </p>
        <p className="font-mono text-[0.75rem] text-[var(--dd-text-muted)]">
          Restore column visibility to inspect dataset records.
        </p>
        <button
          type="button"
          onClick={onShowAllColumns}
          className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3.5 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20"
        >
          Show All Columns
        </button>
      </div>
    );
  }

  return (
    <div
      className="dd-surface-recessed relative max-h-[560px] overflow-auto"
      tabIndex={0}
      aria-label="Interactive dataset explorer table"
      data-testid="explorer-table-scroll-container"
    >
      <table className="w-full border-collapse text-left text-[0.8125rem]">
        <thead className="sticky top-0 z-20 bg-[var(--dd-surface-elevated)] shadow-[0_1px_0_var(--dd-border-default)]">
          <tr>
            {/* Sticky top-left row number header */}
            <th
              scope="col"
              className="sticky left-0 z-30 w-16 border-r border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-3 py-2.5 text-right font-mono text-[0.6875rem] font-medium tracking-[0.04em] text-[var(--dd-text-muted)] dd-tabular whitespace-nowrap"
              title="Original 1-based dataset row number"
            >
              Row
            </th>

            {visibleColumns.map((desc) => {
              const col = desc.column;
              const isSorted = sort?.columnId === col.id;
              const sortDir = isSorted ? sort.direction : null;
              const ariaSort =
                sortDir === 'asc'
                  ? 'ascending'
                  : sortDir === 'desc'
                    ? 'descending'
                    : 'none';
              const isFiltered = isColumnFilterActive(columnFilters[col.id]);
              const typeMeta = COLUMN_TYPE_META[desc.detectedType];
              const isNumeric = desc.detectedType === 'numeric';

              const isFocusedColumn = focusedColumnId === col.id;

              return (
                <th
                  key={col.id}
                  scope="col"
                  aria-sort={ariaSort}
                  data-focused-column={isFocusedColumn ? 'true' : undefined}
                  className={cn(
                    'min-w-[140px] max-w-[280px] border-r border-[var(--dd-border-subtle)] bg-[var(--dd-surface-elevated)] px-3 py-2 align-middle last:border-r-0',
                    isFocusedColumn &&
                      'bg-[var(--dd-accent-teal-dim)] shadow-[inset_0_-2px_0_var(--dd-accent-teal)]',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleSort(col.id)}
                      aria-label={`Sort by ${col.name}`}
                      className={cn(
                        'group flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left transition-colors',
                        isNumeric && 'justify-end text-right',
                      )}
                    >
                      <span
                        className="truncate font-medium text-[var(--dd-text-primary)] group-hover:text-[var(--dd-accent-teal-hover)] whitespace-nowrap"
                        title={col.name}
                      >
                        {col.name}
                      </span>
                      <span className="shrink-0 font-mono text-[0.625rem] font-normal text-[var(--dd-text-muted)]">
                        {typeMeta.shortCode}
                      </span>
                      <span
                        className={cn(
                          'shrink-0',
                          isSorted
                            ? 'text-[var(--dd-accent-teal)]'
                            : 'text-[var(--dd-text-muted)] opacity-60 group-hover:opacity-100',
                        )}
                        aria-hidden="true"
                      >
                        {sortDir === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : sortDir === 'desc' ? (
                          <ArrowDown className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5" />
                        )}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenColumnFilter(col.id)}
                      aria-label={`Filter column ${col.name}`}
                      title={`Filter ${col.name}`}
                      className={cn(
                        'flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-[var(--dd-radius-xs)] transition-colors',
                        isFiltered
                          ? 'bg-[var(--dd-accent-teal-dim)] text-[var(--dd-accent-teal)]'
                          : 'text-[var(--dd-text-muted)] hover:bg-[var(--dd-surface-hover)] hover:text-[var(--dd-text-primary)]',
                      )}
                    >
                      <Filter className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody className="divide-y divide-[var(--dd-border-subtle)]">
          {dataset.rowCount === 0 ? (
            <tr>
              <td
                colSpan={visibleColumns.length + 1}
                data-testid="explorer-zero-rows-state"
                className="px-6 py-12 text-center font-mono text-[0.8rem] text-[var(--dd-text-muted)]"
              >
                This dataset contains column headers but zero data records.
              </td>
            </tr>
          ) : pageRowIndices.length === 0 ? (
            <tr>
              <td
                colSpan={visibleColumns.length + 1}
                data-testid="explorer-no-matches-state"
                className="px-6 py-12 text-center"
              >
                <div className="flex flex-col items-center justify-center gap-3">
                  <p className="text-[0.875rem] font-medium text-[var(--dd-text-primary)]">
                    No matching records found.
                  </p>
                  <p className="font-mono text-[0.75rem] text-[var(--dd-text-muted)]">
                    Adjust or clear your active search query and column filters to restore records.
                  </p>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={onClearAllFilters}
                      className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3.5 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20"
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ) : (
            pageRowIndices.map((origRowIdx) => {
              const row = dataset.rows[origRowIdx];
              const isHighlightedRow = highlightedRowIndex === origRowIdx;

              return (
                <tr
                  key={origRowIdx}
                  data-row-index={origRowIdx}
                  data-highlighted-row={isHighlightedRow ? 'true' : undefined}
                  className={cn(
                    'transition-colors hover:bg-[var(--dd-surface-hover)]/55',
                    isHighlightedRow &&
                      'bg-[var(--dd-accent-teal-dim)]/75 ring-1 ring-inset ring-[var(--dd-accent-teal-border)]',
                  )}
                >
                  {/* Sticky 1-based original row number */}
                  <td
                    className={cn(
                      'sticky left-0 z-10 border-r border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3 py-2 text-right font-mono text-[0.72rem] text-[var(--dd-text-muted)] dd-tabular whitespace-nowrap',
                      isHighlightedRow &&
                        'bg-[var(--dd-accent-teal-dim)] font-semibold text-[var(--dd-accent-teal)]',
                    )}
                  >
                    {formatCount(origRowIdx + 1)}
                  </td>

                  {visibleColumns.map((desc) => {
                    const col = desc.column;
                    const rawVal =
                      row !== undefined && col.index < row.length
                        ? row[col.index]
                        : undefined;
                    const missingClass = classifyMissingValue(
                      rawVal,
                      compiledMissing,
                    );
                    const formatted = formatCellValue(rawVal);
                    const isNumeric = desc.detectedType === 'numeric';

                    if (missingClass.kind === 'structural') {
                      return (
                        <td
                          key={col.id}
                          title="Missing value (structural null / empty)"
                          className={cn(
                            'max-w-[280px] truncate border-r border-[var(--dd-border-subtle)] px-3 py-2 font-mono text-[0.75rem] italic text-[var(--dd-text-muted)]/60 last:border-r-0',
                            isNumeric && 'text-right',
                          )}
                        >
                          null
                        </td>
                      );
                    }

                    if (missingClass.kind === 'marker') {
                      // Preserve original text while signaling M03 missing-marker policy
                      return (
                        <td
                          key={col.id}
                          title={`Original value "${formatted}" (treated as missing under Module 03 policy)`}
                          className={cn(
                            'max-w-[280px] truncate border-r border-[var(--dd-border-subtle)] px-3 py-2 font-mono text-[0.78rem] text-[var(--dd-status-warning)]/80 last:border-r-0',
                            isNumeric && 'text-right dd-tabular',
                          )}
                        >
                          {formatted}
                        </td>
                      );
                    }

                    return (
                      <td
                        key={col.id}
                        title={formatted}
                        className={cn(
                          'max-w-[280px] truncate border-r border-[var(--dd-border-subtle)] px-3 py-2 font-mono text-[0.78rem] text-[var(--dd-text-secondary)] last:border-r-0',
                          isNumeric &&
                            'text-right text-[var(--dd-text-primary)] dd-tabular',
                        )}
                      >
                        {formatted}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
