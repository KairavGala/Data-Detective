import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { EXPLORER_PAGE_SIZES } from '@/engine/explorer';
import type { ExplorerPageSize, ExplorerPageSlice } from '@/types';
import { formatCount } from '@/utils';

interface ExplorerPaginationProps {
  readonly slice: ExplorerPageSlice;
  readonly visibleColumnCount: number;
  readonly totalColumnCount: number;
  readonly onPageChange: (nextPage: number) => void;
  readonly onPageSizeChange: (nextSize: ExplorerPageSize) => void;
}

/**
 * Bounded pagination controls with configurable page sizes (25, 50, 100, 250)
 * and accurate row/column telemetry.
 */
export function ExplorerPagination({
  slice,
  visibleColumnCount,
  totalColumnCount,
  onPageChange,
  onPageSizeChange,
}: ExplorerPaginationProps) {
  const isFirstPage = slice.page <= 1;
  const isLastPage = slice.page >= slice.totalPages;
  const isFiltered = slice.filteredRows !== slice.totalRows;

  return (
    <div
      data-testid="explorer-pagination"
      className="dd-surface-primary flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      {/* Row & column slice readout */}
      <div className="font-mono text-[0.75rem] text-[var(--dd-text-muted)] dd-tabular">
        {slice.filteredRows === 0 ? (
          <span>
            Showing 0 of {formatCount(slice.totalRows)} row
            {slice.totalRows === 1 ? '' : 's'}
          </span>
        ) : (
          <span>
            Showing{' '}
            <span className="text-[var(--dd-text-primary)]">
              {formatCount(slice.startRowNumber)}–{formatCount(slice.endRowNumber)}
            </span>{' '}
            of{' '}
            <span className="text-[var(--dd-text-primary)]">
              {formatCount(slice.filteredRows)}
            </span>
            {isFiltered
              ? ` matching (${formatCount(slice.totalRows)} total)`
              : ` row${slice.totalRows === 1 ? '' : 's'}`}
          </span>
        )}
        <span className="mx-2" aria-hidden="true">
          ·
        </span>
        <span>
          {formatCount(visibleColumnCount)}/{formatCount(totalColumnCount)} cols
        </span>
      </div>

      {/* Page size + page navigation */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label
            htmlFor="explorer-page-size-select"
            className="font-mono text-[0.72rem] text-[var(--dd-text-muted)] whitespace-nowrap"
          >
            Rows per page
          </label>
          <select
            id="explorer-page-size-select"
            value={slice.pageSize}
            onChange={(e) =>
              onPageSizeChange(Number(e.target.value) as ExplorerPageSize)
            }
            className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2 py-1 font-mono text-[0.75rem] text-[var(--dd-text-primary)] dd-tabular focus:border-[var(--dd-accent-teal-border)] focus:outline-none"
          >
            {EXPLORER_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={isFirstPage}
            aria-label="First page"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronsLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => onPageChange(slice.page - 1)}
            disabled={isFirstPage}
            aria-label="Previous page"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <span
            data-testid="explorer-page-indicator"
            className="px-2.5 font-mono text-[0.75rem] text-[var(--dd-text-secondary)] dd-tabular whitespace-nowrap"
          >
            Page{' '}
            <strong className="font-semibold text-[var(--dd-text-primary)]">
              {formatCount(slice.page)}
            </strong>{' '}
            of {formatCount(slice.totalPages)}
          </span>

          <button
            type="button"
            onClick={() => onPageChange(slice.page + 1)}
            disabled={isLastPage}
            aria-label="Next page"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => onPageChange(slice.totalPages)}
            disabled={isLastPage}
            aria-label="Last page"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronsRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
