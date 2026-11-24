import { useState } from 'react';
import { X } from 'lucide-react';
import type { ExplorerColumnDescriptor } from '@/engine/explorer';
import { COLUMN_TYPE_META } from '@/features/profiling/TypeDistributionStrip';
import { cn, formatCount } from '@/utils';

interface ExplorerColumnVisibilityPanelProps {
  readonly columns: readonly ExplorerColumnDescriptor[];
  readonly hiddenColumnIds: ReadonlySet<string>;
  readonly onToggleColumn: (columnId: string) => void;
  readonly onShowAll: () => void;
  readonly onHideAllExceptFirst: () => void;
  readonly onClose: () => void;
}

/**
 * Searchable Column Visibility drawer for wide datasets (up to 200 columns).
 */
export function ExplorerColumnVisibilityPanel({
  columns,
  hiddenColumnIds,
  onToggleColumn,
  onShowAll,
  onHideAllExceptFirst,
  onClose,
}: ExplorerColumnVisibilityPanelProps) {
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();

  const matchingColumns = needle
    ? columns.filter(
        (desc) =>
          desc.column.name.toLowerCase().includes(needle) ||
          desc.detectedType.toLowerCase().includes(needle),
      )
    : columns;

  const visibleCount = columns.length - hiddenColumnIds.size;

  return (
    <section
      aria-label="Column visibility controls"
      data-testid="explorer-columns-panel"
      className="dd-surface-elevated space-y-4 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--dd-border-subtle)] pb-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[0.72rem] tracking-[0.06em] text-[var(--dd-text-secondary)] uppercase dd-tabular">
            Column Visibility ({formatCount(visibleCount)} of{' '}
            {formatCount(columns.length)} visible)
          </span>

          <button
            type="button"
            onClick={onShowAll}
            disabled={hiddenColumnIds.size === 0}
            className="cursor-pointer font-mono text-[0.72rem] text-[var(--dd-accent-teal)] transition-colors hover:text-[var(--dd-accent-teal-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Show All
          </button>

          {columns.length > 1 && (
            <button
              type="button"
              onClick={onHideAllExceptFirst}
              className="cursor-pointer font-mono text-[0.72rem] text-[var(--dd-text-muted)] transition-colors hover:text-[var(--dd-text-primary)]"
            >
              Keep First Only
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find column…"
            aria-label="Search columns to toggle visibility"
            className="w-44 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1 font-mono text-[0.75rem] text-[var(--dd-text-primary)] placeholder:text-[var(--dd-text-muted)] focus:border-[var(--dd-accent-teal-border)] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close column visibility controls"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[var(--dd-radius-xs)] text-[var(--dd-text-muted)] transition-colors hover:bg-[var(--dd-surface-hover)] hover:text-[var(--dd-text-primary)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {matchingColumns.length === 0 ? (
        <p className="font-mono text-[0.75rem] text-[var(--dd-text-muted)]">
          No columns match &ldquo;{search}&rdquo;.
        </p>
      ) : (
        <div className="grid max-h-52 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {matchingColumns.map((desc) => {
            const isVisible = !hiddenColumnIds.has(desc.column.id);
            const meta = COLUMN_TYPE_META[desc.detectedType];
            return (
              <label
                key={desc.column.id}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-2 rounded-[var(--dd-radius-xs)] border px-2.5 py-1.5 font-mono text-[0.75rem] transition-colors',
                  isVisible
                    ? 'border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-primary)]'
                    : 'border-[var(--dd-border-subtle)] bg-[var(--dd-bg-backdrop)] text-[var(--dd-text-muted)]',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={() => onToggleColumn(desc.column.id)}
                    className="h-3.5 w-3.5 shrink-0 accent-[var(--dd-accent-teal)]"
                  />
                  <span className="truncate" title={desc.column.name}>
                    {desc.column.name}
                  </span>
                </span>
                <span className="shrink-0 text-[0.65rem] text-[var(--dd-text-muted)]">
                  {meta.shortCode}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
