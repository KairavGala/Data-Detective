import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  extractColumnCategoryOptions,
  isColumnFilterActive,
  type ExplorerColumnDescriptor,
} from '@/engine/explorer';
import { COLUMN_TYPE_META } from '@/features/profiling/TypeDistributionStrip';
import type {
  DatasetStatisticalSummary,
  ExplorerColumnFilter,
  ExplorerMissingFilterMode,
  ImportedDataset,
  MissingValuePolicy,
} from '@/types';
import { cn, formatCount } from '@/utils';

interface ExplorerFilterPanelProps {
  readonly dataset: ImportedDataset;
  readonly columns: readonly ExplorerColumnDescriptor[];
  readonly selectedColumnId: string;
  readonly onSelectColumnId: (columnId: string) => void;
  readonly columnFilters: Readonly<Record<string, ExplorerColumnFilter>>;
  readonly onUpdateColumnFilter: (
    columnId: string,
    next: ExplorerColumnFilter,
  ) => void;
  readonly onClearColumnFilter: (columnId: string) => void;
  readonly onClose: () => void;
  readonly statisticalSummary: DatasetStatisticalSummary | null;
  readonly missingValuePolicy: MissingValuePolicy;
}

const MISSING_MODE_OPTIONS: readonly {
  readonly id: ExplorerMissingFilterMode;
  readonly label: string;
}[] = [
  { id: 'all', label: 'All values' },
  { id: 'exclude_missing', label: 'Exclude missing' },
  { id: 'only_missing', label: 'Only missing' },
];

function parseNumericInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Interactive Column Filter Workbench.
 * Adapts controls cleanly to each column's Module 03 classification:
 * - Numeric range (min/max) for numeric columns
 * - Multi-select category checklist for categorical and boolean columns
 * - Case-insensitive column text search and missing-value policy filter for all columns
 */
export function ExplorerFilterPanel({
  dataset,
  columns,
  selectedColumnId,
  onSelectColumnId,
  columnFilters,
  onUpdateColumnFilter,
  onClearColumnFilter,
  onClose,
  statisticalSummary,
  missingValuePolicy,
}: ExplorerFilterPanelProps) {
  const [categorySearch, setCategorySearch] = useState('');

  const activeDescriptor =
    columns.find((c) => c.column.id === selectedColumnId) ?? columns[0];

  const categoryData = useMemo(() => {
    if (!activeDescriptor) {
      return { options: [], totalDistinctCount: 0, isTruncated: false };
    }
    if (
      activeDescriptor.detectedType !== 'categorical' &&
      activeDescriptor.detectedType !== 'boolean'
    ) {
      return { options: [], totalDistinctCount: 0, isTruncated: false };
    }
    return extractColumnCategoryOptions(
      dataset,
      activeDescriptor.column.id,
      statisticalSummary,
      missingValuePolicy,
    );
  }, [dataset, activeDescriptor, statisticalSummary, missingValuePolicy]);

  if (!activeDescriptor) return null;

  const colId = activeDescriptor.column.id;
  const currentFilter: ExplorerColumnFilter = columnFilters[colId] ?? {};
  const typeMeta = COLUMN_TYPE_META[activeDescriptor.detectedType];
  const isNumeric = activeDescriptor.detectedType === 'numeric';
  const isCategorical =
    activeDescriptor.detectedType === 'categorical' ||
    activeDescriptor.detectedType === 'boolean';
  const selectedSet = new Set(currentFilter.selectedCategories ?? []);

  const normalizedCatSearch = categorySearch.trim().toLowerCase();
  const visibleCategoryOptions = normalizedCatSearch
    ? categoryData.options.filter((opt) =>
        opt.value.toLowerCase().includes(normalizedCatSearch),
      )
    : categoryData.options;

  const hasRangeConflict =
    currentFilter.numericMin !== undefined &&
    currentFilter.numericMin !== null &&
    currentFilter.numericMax !== undefined &&
    currentFilter.numericMax !== null &&
    currentFilter.numericMin > currentFilter.numericMax;

  const handleToggleCategory = (value: string) => {
    const next = new Set(selectedSet);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onUpdateColumnFilter(colId, {
      ...currentFilter,
      selectedCategories: Array.from(next),
    });
  };

  return (
    <section
      aria-label="Column filter workbench"
      data-testid="explorer-filter-panel"
      className="dd-surface-elevated space-y-4 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--dd-border-subtle)] pb-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="explorer-filter-column-select"
            className="font-mono text-[0.7rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase"
          >
            Target Column
          </label>
          <select
            id="explorer-filter-column-select"
            value={colId}
            onChange={(e) => {
              onSelectColumnId(e.target.value);
              setCategorySearch('');
            }}
            className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-1.5 font-mono text-[0.78rem] text-[var(--dd-text-primary)] focus:border-[var(--dd-accent-teal-border)] focus:outline-none"
          >
            {columns.map((desc) => {
              const hasFilter = isColumnFilterActive(
                columnFilters[desc.column.id],
              );
              return (
                <option key={desc.column.id} value={desc.column.id}>
                  {desc.column.name} ({COLUMN_TYPE_META[desc.detectedType].shortCode})
                  {hasFilter ? ' • active' : ''}
                </option>
              );
            })}
          </select>

          <span className="font-mono text-[0.72rem] text-[var(--dd-text-secondary)]">
            Detected Type:{' '}
            <strong className="font-medium text-[var(--dd-text-primary)]">
              {typeMeta.label}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isColumnFilterActive(currentFilter) && (
            <button
              type="button"
              onClick={() => onClearColumnFilter(colId)}
              className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] px-2.5 py-1 font-mono text-[0.72rem] text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)] whitespace-nowrap"
            >
              Clear Column Filter
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filter workbench"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[var(--dd-radius-xs)] text-[var(--dd-text-muted)] transition-colors hover:bg-[var(--dd-surface-hover)] hover:text-[var(--dd-text-primary)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: Column text search + Missing-value policy mode */}
        <div className="space-y-4 lg:col-span-5">
          <div className="space-y-1.5">
            <label
              htmlFor="explorer-column-text-filter"
              className="block font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase"
            >
              Column Text Search (Case-Insensitive)
            </label>
            <div className="relative">
              <input
                id="explorer-column-text-filter"
                type="text"
                value={currentFilter.textQuery ?? ''}
                onChange={(e) =>
                  onUpdateColumnFilter(colId, {
                    ...currentFilter,
                    textQuery: e.target.value,
                  })
                }
                placeholder={`Filter "${activeDescriptor.column.name}" containing…`}
                className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] py-1.5 pl-3 pr-8 font-mono text-[0.78rem] text-[var(--dd-text-primary)] placeholder:text-[var(--dd-text-muted)] focus:border-[var(--dd-accent-teal-border)] focus:outline-none"
              />
              {currentFilter.textQuery && currentFilter.textQuery.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateColumnFilter(colId, {
                      ...currentFilter,
                      textQuery: '',
                    })
                  }
                  aria-label="Clear column text search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-[var(--dd-text-muted)] hover:text-[var(--dd-text-primary)]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
              Missing Values (Active Policy)
            </div>
            <div
              role="group"
              aria-label="Missing value filter mode"
              className="flex flex-wrap gap-1 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-1"
            >
              {MISSING_MODE_OPTIONS.map((opt) => {
                const isSelected = (currentFilter.missingMode ?? 'all') === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() =>
                      onUpdateColumnFilter(colId, {
                        ...currentFilter,
                        missingMode: opt.id,
                      })
                    }
                    className={cn(
                      'cursor-pointer rounded-[var(--dd-radius-xs)] px-2.5 py-1 font-mono text-[0.72rem] transition-colors whitespace-nowrap',
                      isSelected
                        ? 'bg-[var(--dd-surface-elevated)] font-medium text-[var(--dd-text-primary)]'
                        : 'text-[var(--dd-text-muted)] hover:text-[var(--dd-text-secondary)]',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Type-appropriate filter (Numeric range OR Category selection) */}
        <div className="border-t border-[var(--dd-border-subtle)] pt-4 lg:col-span-7 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
          {isNumeric ? (
            <div className="space-y-3">
              <div className="font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                Numeric Range Filter (Inclusive)
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label
                    htmlFor="explorer-numeric-min"
                    className="block font-mono text-[0.7rem] text-[var(--dd-text-secondary)]"
                  >
                    Minimum Value
                  </label>
                  <input
                    id="explorer-numeric-min"
                    type="number"
                    step="any"
                    value={
                      currentFilter.numericMin !== undefined &&
                      currentFilter.numericMin !== null
                        ? String(currentFilter.numericMin)
                        : ''
                    }
                    onChange={(e) =>
                      onUpdateColumnFilter(colId, {
                        ...currentFilter,
                        numericMin: parseNumericInput(e.target.value),
                      })
                    }
                    placeholder="No lower bound"
                    className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-1.5 font-mono text-[0.78rem] text-[var(--dd-text-primary)] placeholder:text-[var(--dd-text-muted)] dd-tabular focus:border-[var(--dd-accent-teal-border)] focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="explorer-numeric-max"
                    className="block font-mono text-[0.7rem] text-[var(--dd-text-secondary)]"
                  >
                    Maximum Value
                  </label>
                  <input
                    id="explorer-numeric-max"
                    type="number"
                    step="any"
                    value={
                      currentFilter.numericMax !== undefined &&
                      currentFilter.numericMax !== null
                        ? String(currentFilter.numericMax)
                        : ''
                    }
                    onChange={(e) =>
                      onUpdateColumnFilter(colId, {
                        ...currentFilter,
                        numericMax: parseNumericInput(e.target.value),
                      })
                    }
                    placeholder="No upper bound"
                    className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-1.5 font-mono text-[0.78rem] text-[var(--dd-text-primary)] placeholder:text-[var(--dd-text-muted)] dd-tabular focus:border-[var(--dd-accent-teal-border)] focus:outline-none"
                  />
                </div>
              </div>

              {hasRangeConflict && (
                <p
                  role="status"
                  className="font-mono text-[0.72rem] text-[var(--dd-status-warning)]"
                >
                  Minimum bound exceeds maximum bound — 0 records will match until adjusted.
                </p>
              )}
              <p className="font-mono text-[0.7rem] text-[var(--dd-text-muted)]">
                Missing and invalid non-numeric values are excluded automatically whenever a numeric range is active.
              </p>
            </div>
          ) : isCategorical ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase dd-tabular">
                  Category Selection ({formatCount(selectedSet.size)} selected ·{' '}
                  {formatCount(categoryData.totalDistinctCount)} distinct)
                </span>
                {selectedSet.size > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateColumnFilter(colId, {
                        ...currentFilter,
                        selectedCategories: [],
                      })
                    }
                    className="cursor-pointer font-mono text-[0.7rem] text-[var(--dd-accent-teal)] hover:text-[var(--dd-accent-teal-hover)]"
                  >
                    Clear Selection
                  </button>
                )}
              </div>

              {categoryData.options.length > 8 && (
                <input
                  type="search"
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder="Find category…"
                  aria-label="Filter category options"
                  className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1 font-mono text-[0.75rem] text-[var(--dd-text-primary)] placeholder:text-[var(--dd-text-muted)] focus:border-[var(--dd-accent-teal-border)] focus:outline-none"
                />
              )}

              {visibleCategoryOptions.length === 0 ? (
                <p className="font-mono text-[0.75rem] text-[var(--dd-text-muted)]">
                  No category values available for selection.
                </p>
              ) : (
                <div className="grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                  {visibleCategoryOptions.map((opt) => {
                    const checked = selectedSet.has(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className={cn(
                          'flex cursor-pointer items-center justify-between gap-2 rounded-[var(--dd-radius-xs)] border px-2.5 py-1.5 font-mono text-[0.75rem] transition-colors dd-tabular',
                          checked
                            ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-text-primary)]'
                            : 'border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-secondary)] hover:border-[var(--dd-border-default)]',
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleCategory(opt.value)}
                            className="h-3.5 w-3.5 shrink-0 accent-[var(--dd-accent-teal)]"
                          />
                          <span className="truncate" title={opt.value}>
                            {opt.value}
                          </span>
                        </span>
                        <span className="shrink-0 text-[0.68rem] text-[var(--dd-text-muted)]">
                          {formatCount(opt.count)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {categoryData.isTruncated && (
                <p className="font-mono text-[0.68rem] text-[var(--dd-text-muted)]">
                  Showing top {formatCount(categoryData.options.length)} categories by frequency; use Column Text Search to match long-tail values.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                Text &amp; Presence Filtering
              </div>
              <p className="text-[0.8125rem] leading-relaxed text-[var(--dd-text-secondary)]">
                &ldquo;{activeDescriptor.column.name}&rdquo; is classified as{' '}
                <strong className="font-medium text-[var(--dd-text-primary)]">
                  {typeMeta.label}
                </strong>{' '}
                during schema profiling. Use the case-insensitive Column Text Search or Missing Values controls on the left to filter records without coercing values.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
