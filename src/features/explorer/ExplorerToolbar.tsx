import {
  Columns3,
  Filter,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import type { ExplorerColumnDescriptor } from '@/engine/explorer';
import type { ExplorerColumnFilter, ExplorerSortConfig } from '@/types';
import { cn, formatCount } from '@/utils';

interface ActiveFilterTag {
  readonly id: string;
  readonly label: string;
  readonly onRemove: () => void;
}

interface ExplorerToolbarProps {
  readonly globalSearch: string;
  readonly onGlobalSearchChange: (value: string) => void;
  readonly columns: readonly ExplorerColumnDescriptor[];
  readonly columnFilters: Readonly<Record<string, ExplorerColumnFilter>>;
  readonly sort: ExplorerSortConfig | null;
  readonly activeFilterCount: number;
  readonly isFilterPanelOpen: boolean;
  readonly onToggleFilterPanel: () => void;
  readonly isColumnsPanelOpen: boolean;
  readonly onToggleColumnsPanel: () => void;
  readonly visibleColumnCount: number;
  readonly totalColumnCount: number;
  readonly filteredRowCount: number;
  readonly totalRowCount: number;
  readonly hasNonDefaultConfig: boolean;
  readonly onClearColumnFilter: (columnId: string) => void;
  readonly onClearAllFilters: () => void;
  readonly onClearSort: () => void;
  readonly onResetTable: () => void;
}

function describeColumnFilter(
  colName: string,
  filter: ExplorerColumnFilter,
): string {
  const parts: string[] = [];
  if (filter.textQuery && filter.textQuery.trim().length > 0) {
    parts.push(`contains "${filter.textQuery.trim()}"`);
  }
  if (
    filter.numericMin !== undefined &&
    filter.numericMin !== null &&
    filter.numericMax !== undefined &&
    filter.numericMax !== null
  ) {
    parts.push(`${filter.numericMin} to ${filter.numericMax}`);
  } else if (filter.numericMin !== undefined && filter.numericMin !== null) {
    parts.push(`>= ${filter.numericMin}`);
  } else if (filter.numericMax !== undefined && filter.numericMax !== null) {
    parts.push(`<= ${filter.numericMax}`);
  }
  if (filter.selectedCategories && filter.selectedCategories.length > 0) {
    const preview = filter.selectedCategories.slice(0, 2).join(', ');
    const extra = filter.selectedCategories.length - 2;
    parts.push(
      extra > 0 ? `in [${preview} +${extra}]` : `in [${preview}]`,
    );
  }
  if (filter.missingMode === 'only_missing') {
    parts.push('only missing');
  } else if (filter.missingMode === 'exclude_missing') {
    parts.push('exclude missing');
  }
  return `${colName}: ${parts.join(' · ')}`;
}

/**
 * Unified Module 05 Explorer control bar with global search, filter workbench toggle,
 * column visibility toggle, clear-all-filters, reset configuration, and active filter strip.
 */
export function ExplorerToolbar({
  globalSearch,
  onGlobalSearchChange,
  columns,
  columnFilters,
  sort,
  activeFilterCount,
  isFilterPanelOpen,
  onToggleFilterPanel,
  isColumnsPanelOpen,
  onToggleColumnsPanel,
  visibleColumnCount,
  totalColumnCount,
  filteredRowCount,
  totalRowCount,
  hasNonDefaultConfig,
  onClearColumnFilter,
  onClearAllFilters,
  onClearSort,
  onResetTable,
}: ExplorerToolbarProps) {
  const colNameById = new Map<string, string>();
  for (const desc of columns) {
    colNameById.set(desc.column.id, desc.column.name);
  }

  const activeTags: ActiveFilterTag[] = [];
  if (globalSearch.trim().length > 0) {
    activeTags.push({
      id: '__global__',
      label: `Search: "${globalSearch.trim()}"`,
      onRemove: () => onGlobalSearchChange(''),
    });
  }

  for (const [colId, filter] of Object.entries(columnFilters)) {
    const colName = colNameById.get(colId);
    if (!colName) continue;
    const desc = describeColumnFilter(colName, filter);
    if (desc.endsWith(': ')) continue;
    activeTags.push({
      id: colId,
      label: desc,
      onRemove: () => onClearColumnFilter(colId),
    });
  }

  const sortColName = sort ? colNameById.get(sort.columnId) : undefined;

  return (
    <div
      className="dd-surface-primary space-y-3 p-4"
      data-testid="explorer-toolbar"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Global search input */}
        <div className="relative flex-1 lg:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--dd-text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={globalSearch}
            onChange={(e) => onGlobalSearchChange(e.target.value)}
            placeholder="Search across all columns…"
            aria-label="Global search across records"
            className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] py-2 pl-9 pr-9 font-mono text-[0.8125rem] text-[var(--dd-text-primary)] placeholder:text-[var(--dd-text-muted)] focus:border-[var(--dd-accent-teal-border)] focus:outline-none"
          />
          {globalSearch.length > 0 && (
            <button
              type="button"
              onClick={() => onGlobalSearchChange('')}
              aria-label="Clear global search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-[var(--dd-radius-xs)] p-0.5 text-[var(--dd-text-muted)] transition-colors hover:text-[var(--dd-text-primary)]"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Action controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleFilterPanel}
            aria-expanded={isFilterPanelOpen}
            className={cn(
              'inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border px-3 py-2 font-mono text-[0.75rem] transition-colors whitespace-nowrap shrink-0 dd-tabular',
              isFilterPanelOpen || activeFilterCount > 0
                ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-text-primary)]'
                : 'border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-secondary)] hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)]',
            )}
          >
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              Filters
              {activeFilterCount > 0 ? ` (${formatCount(activeFilterCount)})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleColumnsPanel}
            aria-expanded={isColumnsPanelOpen}
            className={cn(
              'inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border px-3 py-2 font-mono text-[0.75rem] transition-colors whitespace-nowrap shrink-0 dd-tabular',
              isColumnsPanelOpen || visibleColumnCount < totalColumnCount
                ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-text-primary)]'
                : 'border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-secondary)] hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)]',
            )}
          >
            <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              Columns ({formatCount(visibleColumnCount)}/{formatCount(totalColumnCount)})
            </span>
          </button>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onClearAllFilters}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-warning-border)] bg-[var(--dd-status-warning-dim)] px-3 py-2 font-mono text-[0.75rem] text-[var(--dd-text-primary)] transition-colors hover:border-[var(--dd-status-warning)] whitespace-nowrap shrink-0"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Clear Filters</span>
            </button>
          )}

          <button
            type="button"
            onClick={onResetTable}
            disabled={!hasNonDefaultConfig}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-2 font-mono text-[0.75rem] text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)] disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset Table</span>
          </button>
        </div>
      </div>

      {/* Status readout & active filter indicators */}
      <div
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--dd-border-subtle)] pt-3 font-mono text-[0.72rem] text-[var(--dd-text-muted)] dd-tabular"
        data-testid="explorer-match-summary"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            Matching records:{' '}
            <strong className="font-semibold text-[var(--dd-text-primary)]">
              {formatCount(filteredRowCount)}
            </strong>{' '}
            of {formatCount(totalRowCount)}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Visible columns:{' '}
            <strong className="font-semibold text-[var(--dd-text-primary)]">
              {formatCount(visibleColumnCount)}
            </strong>{' '}
            of {formatCount(totalColumnCount)}
          </span>
          {sort && sortColName && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5 text-[var(--dd-accent-teal)]">
                <span>
                  Sorted by {sortColName} ({sort.direction})
                </span>
                <button
                  type="button"
                  onClick={onClearSort}
                  aria-label="Clear sort order"
                  className="cursor-pointer text-[var(--dd-text-muted)] hover:text-[var(--dd-text-primary)]"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            </>
          )}
        </div>

        {activeTags.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="active-filters-strip"
          >
            {activeTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1.5 rounded-[var(--dd-radius-xs)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2 py-0.5 text-[0.7rem] text-[var(--dd-text-secondary)]"
              >
                <span className="max-w-[220px] truncate" title={tag.label}>
                  {tag.label}
                </span>
                <button
                  type="button"
                  onClick={tag.onRemove}
                  aria-label={`Remove filter ${tag.label}`}
                  className="cursor-pointer text-[var(--dd-text-muted)] hover:text-[var(--dd-text-primary)]"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
