import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Crosshair, Loader2, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { useDataset } from '@/context/DatasetContext';
import {
  countActiveFilters,
  DEFAULT_EXPLORER_PAGE_SIZE,
  filterDatasetRowIndices,
  isColumnFilterActive,
  paginateRowIndices,
  resolveExplorerColumns,
  sortDatasetRowIndices,
} from '@/engine/explorer';
import type {
  ExplorerColumnFilter,
  ExplorerPageSize,
  ExplorerSortConfig,
} from '@/types';
import { formatCount } from '@/utils';
import { ExplorerColumnVisibilityPanel } from './ExplorerColumnVisibilityPanel';
import { ExplorerDataTable } from './ExplorerDataTable';
import { ExplorerFilterPanel } from './ExplorerFilterPanel';
import { ExplorerPagination } from './ExplorerPagination';
import { ExplorerToolbar } from './ExplorerToolbar';

/**
 * Module 05 — Interactive Data Explorer workspace page (`/explorer`).
 * Reads M02 activeDataset, M03 datasetProfile + missingValuePolicy, and M04
 * statisticalSummary directly from DatasetContext without mutating dataset rows.
 */
export function DatasetExplorerPage() {
  const {
    activeDataset,
    datasetProfile,
    profilingStatus,
    missingValuePolicy,
    statisticalSummary,
  } = useDataset();

  const [globalSearch, setGlobalSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState<
    Record<string, ExplorerColumnFilter>
  >({});
  const [sort, setSort] = useState<ExplorerSortConfig | null>(null);
  const [hiddenColumnIds, setHiddenColumnIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<ExplorerPageSize>(
    DEFAULT_EXPLORER_PAGE_SIZE,
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isColumnsPanelOpen, setIsColumnsPanelOpen] = useState(false);
  const [filterColumnId, setFilterColumnId] = useState<string>('');
  const [focusedColumnId, setFocusedColumnId] = useState<string | null>(null);
  const [highlightedRowIndex, setHighlightedRowIndex] = useState<number | null>(
    null,
  );

  const deferredGlobalSearch = useDeferredValue(globalSearch);

  // Automatically reset explorer state whenever activeDataset changes or is cleared
  const activeDatasetId = activeDataset?.id ?? null;
  useEffect(() => {
    setGlobalSearch('');
    setColumnFilters({});
    setSort(null);
    setHiddenColumnIds(new Set());
    setPage(1);
    setPageSize(DEFAULT_EXPLORER_PAGE_SIZE);
    setIsFilterPanelOpen(false);
    setIsColumnsPanelOpen(false);
    setFilterColumnId(activeDataset?.columns[0]?.id ?? '');
    setFocusedColumnId(null);
    setHighlightedRowIndex(null);
  }, [activeDatasetId, activeDataset?.columns]);

  // Apply investigation deep-link focus (?column=<id>&row=<1-based>) without mutating dataset
  const columnParam = searchParams.get('column');
  const rowParam = searchParams.get('row');
  useEffect(() => {
    if (!activeDataset) return;
    if (!columnParam && !rowParam) return;

    if (columnParam) {
      const targetCol = activeDataset.columns.find((c) => c.id === columnParam);
      if (targetCol) {
        setFilterColumnId(targetCol.id);
        setFocusedColumnId(targetCol.id);
        setIsFilterPanelOpen(true);
        setIsColumnsPanelOpen(false);
        setHiddenColumnIds((prev) => {
          if (!prev.has(targetCol.id)) return prev;
          const next = new Set(prev);
          next.delete(targetCol.id);
          return next;
        });
      }
    }

    if (rowParam) {
      const parsedRowNum = Number.parseInt(rowParam, 10);
      if (
        Number.isFinite(parsedRowNum) &&
        parsedRowNum >= 1 &&
        parsedRowNum <= activeDataset.rowCount
      ) {
        const targetIndex = parsedRowNum - 1;
        setHighlightedRowIndex(targetIndex);
        setPage(Math.floor(targetIndex / DEFAULT_EXPLORER_PAGE_SIZE) + 1);
      }
    }
  }, [activeDataset, columnParam, rowParam]);

  const columnDescriptors = useMemo(() => {
    if (!activeDataset) return [];
    return resolveExplorerColumns(activeDataset, datasetProfile);
  }, [activeDataset, datasetProfile]);

  const visibleColumns = useMemo(
    () => columnDescriptors.filter((d) => !hiddenColumnIds.has(d.column.id)),
    [columnDescriptors, hiddenColumnIds],
  );

  // Step 1: Single-pass immutable row filtering -> original 0-based row indices
  const filteredIndices = useMemo(() => {
    if (!activeDataset) return [];
    return filterDatasetRowIndices(
      activeDataset,
      {
        globalSearch: deferredGlobalSearch,
        columnFilters,
      },
      missingValuePolicy,
    );
  }, [activeDataset, deferredGlobalSearch, columnFilters, missingValuePolicy]);

  // Step 2: Stable typed sorting over filtered row indices
  const sortedIndices = useMemo(() => {
    if (!activeDataset) return [];
    return sortDatasetRowIndices(
      activeDataset,
      filteredIndices,
      sort,
      datasetProfile,
      missingValuePolicy,
    );
  }, [activeDataset, filteredIndices, sort, datasetProfile, missingValuePolicy]);

  // Step 3: Bounded pagination slice (<= 250 rows in DOM)
  const pageSlice = useMemo(() => {
    if (!activeDataset) {
      return paginateRowIndices([], 0, 1, pageSize);
    }
    return paginateRowIndices(
      sortedIndices,
      activeDataset.rowCount,
      page,
      pageSize,
    );
  }, [activeDataset, sortedIndices, page, pageSize]);

  const activeFilterCount = useMemo(
    () => countActiveFilters(globalSearch, columnFilters),
    [globalSearch, columnFilters],
  );

  const hasNonDefaultConfig =
    activeFilterCount > 0 ||
    sort !== null ||
    hiddenColumnIds.size > 0 ||
    pageSize !== DEFAULT_EXPLORER_PAGE_SIZE ||
    pageSlice.page !== 1;

  const handleGlobalSearchChange = useCallback((value: string) => {
    setGlobalSearch(value);
    setPage(1);
  }, []);

  const handleUpdateColumnFilter = useCallback(
    (columnId: string, next: ExplorerColumnFilter) => {
      setColumnFilters((prev) => {
        if (!isColumnFilterActive(next)) {
          if (!(columnId in prev)) return prev;
          const copy = { ...prev };
          delete copy[columnId];
          return copy;
        }
        return { ...prev, [columnId]: next };
      });
      setPage(1);
    },
    [],
  );

  const handleClearColumnFilter = useCallback((columnId: string) => {
    setColumnFilters((prev) => {
      if (!(columnId in prev)) return prev;
      const copy = { ...prev };
      delete copy[columnId];
      return copy;
    });
    setPage(1);
  }, []);

  const handleClearAllFilters = useCallback(() => {
    setGlobalSearch('');
    setColumnFilters({});
    setPage(1);
  }, []);

  const handleToggleSort = useCallback((columnId: string) => {
    setSort((prev) => {
      if (!prev || prev.columnId !== columnId) {
        return { columnId, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { columnId, direction: 'desc' };
      }
      return null;
    });
    setPage(1);
  }, []);

  const handleOpenColumnFilter = useCallback((columnId: string) => {
    setFilterColumnId(columnId);
    setIsFilterPanelOpen(true);
    setIsColumnsPanelOpen(false);
  }, []);

  const handleToggleColumnVisibility = useCallback((columnId: string) => {
    setHiddenColumnIds((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  }, []);

  const handleShowAllColumns = useCallback(() => {
    setHiddenColumnIds(new Set());
  }, []);

  const handleHideAllExceptFirst = useCallback(() => {
    if (!activeDataset || activeDataset.columns.length <= 1) return;
    const firstId = activeDataset.columns[0]!.id;
    const hidden = new Set<string>();
    for (let i = 1; i < activeDataset.columns.length; i += 1) {
      hidden.add(activeDataset.columns[i]!.id);
    }
    if (hidden.has(firstId)) hidden.delete(firstId);
    setHiddenColumnIds(hidden);
  }, [activeDataset]);

  const handlePageSizeChange = useCallback((nextSize: ExplorerPageSize) => {
    setPageSize(nextSize);
    setPage(1);
  }, []);

  const handleClearFocus = useCallback(() => {
    setFocusedColumnId(null);
    setHighlightedRowIndex(null);
    if (searchParams.has('column') || searchParams.has('row')) {
      const next = new URLSearchParams(searchParams);
      next.delete('column');
      next.delete('row');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleResetTable = useCallback(() => {
    setGlobalSearch('');
    setColumnFilters({});
    setSort(null);
    setHiddenColumnIds(new Set());
    setPage(1);
    setPageSize(DEFAULT_EXPLORER_PAGE_SIZE);
    handleClearFocus();
  }, [handleClearFocus]);

  // Empty state: no dataset loaded yet
  if (!activeDataset) {
    return (
      <PageContainer width="standard">
        <div
          className="dd-anim-file-enter space-y-6"
          data-testid="explorer-no-dataset-state"
        >
          <section className="dd-surface-primary space-y-5 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DossierLabel code="SEC-01" label="Module 05 · Awaiting Dataset" />
              <StatusIndicator tone="neutral" label="No Active Dataset" />
            </div>

            <div className="space-y-2">
              <h2 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-[var(--dd-text-primary)]">
                Interactive Data Explorer
              </h2>
              <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--dd-text-secondary)]">
                Import a CSV or Excel (.xlsx) dataset on the Overview workspace to
                browse records, run case-insensitive global and column searches,
                apply typed numeric and categorical filters, sort stably with
                consistent missing-value ordering, and control visible columns.
              </p>
            </div>

            <div className="border-t border-[var(--dd-border-subtle)] pt-5">
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20 whitespace-nowrap"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Import Dataset on Overview</span>
              </Link>
            </div>
          </section>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="wide">
      <div
        className="dd-anim-file-enter space-y-4"
        data-testid="dataset-explorer-page"
        data-explored-dataset-id={activeDataset.id}
      >
        {/* Header dossier bar */}
        <header className="flex flex-col gap-3 border-b border-[var(--dd-border-subtle)] pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <DossierLabel
              code="SEC-01"
              label={`Module 05 · ${activeDataset.fileName}`}
            />
            <h2 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-[var(--dd-text-primary)]">
              Dataset Explorer
            </h2>
            <p className="font-mono text-[0.75rem] text-[var(--dd-text-muted)] dd-tabular">
              Active dataset in memory: {activeDataset.fileName} ·{' '}
              {formatCount(activeDataset.rowCount)} total rows ·{' '}
              {formatCount(activeDataset.columnCount)} columns · Original values
              preserved
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {profilingStatus === 'profiling' && (
              <span className="inline-flex items-center gap-1.5 font-mono text-[0.72rem] text-[var(--dd-accent-teal)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Syncing M03 schema…
              </span>
            )}
            <Link
              to="/analysis"
              className="font-mono text-[0.75rem] text-[var(--dd-accent-teal)] transition-colors hover:text-[var(--dd-accent-teal-hover)] whitespace-nowrap"
            >
              Statistical Analysis →
            </Link>
          </div>
        </header>

        {/* Unified Explorer Toolbar */}
        <ExplorerToolbar
          globalSearch={globalSearch}
          onGlobalSearchChange={handleGlobalSearchChange}
          columns={columnDescriptors}
          columnFilters={columnFilters}
          sort={sort}
          activeFilterCount={activeFilterCount}
          isFilterPanelOpen={isFilterPanelOpen}
          onToggleFilterPanel={() => {
            setIsFilterPanelOpen((prev) => !prev);
            setIsColumnsPanelOpen(false);
          }}
          isColumnsPanelOpen={isColumnsPanelOpen}
          onToggleColumnsPanel={() => {
            setIsColumnsPanelOpen((prev) => !prev);
            setIsFilterPanelOpen(false);
          }}
          visibleColumnCount={visibleColumns.length}
          totalColumnCount={columnDescriptors.length}
          filteredRowCount={pageSlice.filteredRows}
          totalRowCount={activeDataset.rowCount}
          hasNonDefaultConfig={hasNonDefaultConfig}
          onClearColumnFilter={handleClearColumnFilter}
          onClearAllFilters={handleClearAllFilters}
          onClearSort={() => {
            setSort(null);
            setPage(1);
          }}
          onResetTable={handleResetTable}
        />

        {/* Collapsible Column Filter Workbench */}
        {isFilterPanelOpen && columnDescriptors.length > 0 && (
          <ExplorerFilterPanel
            dataset={activeDataset}
            columns={columnDescriptors}
            selectedColumnId={
              filterColumnId || columnDescriptors[0]!.column.id
            }
            onSelectColumnId={setFilterColumnId}
            columnFilters={columnFilters}
            onUpdateColumnFilter={handleUpdateColumnFilter}
            onClearColumnFilter={handleClearColumnFilter}
            onClose={() => setIsFilterPanelOpen(false)}
            statisticalSummary={statisticalSummary}
            missingValuePolicy={missingValuePolicy}
          />
        )}

        {/* Collapsible Column Visibility Panel */}
        {isColumnsPanelOpen && columnDescriptors.length > 0 && (
          <ExplorerColumnVisibilityPanel
            columns={columnDescriptors}
            hiddenColumnIds={hiddenColumnIds}
            onToggleColumn={handleToggleColumnVisibility}
            onShowAll={handleShowAllColumns}
            onHideAllExceptFirst={handleHideAllExceptFirst}
            onClose={() => setIsColumnsPanelOpen(false)}
          />
        )}

        {/* Investigation Focus Banner (when navigated from Module 07 finding) */}
        {(focusedColumnId !== null || highlightedRowIndex !== null) && (
          <div
            data-testid="explorer-focus-banner"
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-4 py-2.5 text-[0.8125rem]"
          >
            <div className="flex flex-wrap items-center gap-2 font-mono text-[0.75rem] text-[var(--dd-text-primary)] dd-tabular">
              <Crosshair
                className="h-3.5 w-3.5 text-[var(--dd-accent-teal)]"
                aria-hidden="true"
              />
              <span>Investigation focus:</span>
              {focusedColumnId && (
                <span>
                  Column “
                  {activeDataset.columns.find((c) => c.id === focusedColumnId)
                    ?.name ?? focusedColumnId}
                  ”
                </span>
              )}
              {focusedColumnId && highlightedRowIndex !== null && <span>·</span>}
              {highlightedRowIndex !== null && (
                <span>Row #{formatCount(highlightedRowIndex + 1)}</span>
              )}
            </div>

            <button
              type="button"
              onClick={handleClearFocus}
              className="inline-flex cursor-pointer items-center gap-1 font-mono text-[0.75rem] text-[var(--dd-text-secondary)] transition-colors hover:text-[var(--dd-text-primary)]"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Clear Focus</span>
            </button>
          </div>
        )}

        {/* Scrollable Interactive Forensic Data Table */}
        <ExplorerDataTable
          dataset={activeDataset}
          visibleColumns={visibleColumns}
          pageRowIndices={pageSlice.pageRowIndices}
          sort={sort}
          columnFilters={columnFilters}
          missingValuePolicy={missingValuePolicy}
          hasActiveFilters={activeFilterCount > 0}
          focusedColumnId={focusedColumnId}
          highlightedRowIndex={highlightedRowIndex}
          onToggleSort={handleToggleSort}
          onOpenColumnFilter={handleOpenColumnFilter}
          onClearAllFilters={handleClearAllFilters}
          onShowAllColumns={handleShowAllColumns}
        />

        {/* Pagination Controls */}
        <ExplorerPagination
          slice={pageSlice}
          visibleColumnCount={visibleColumns.length}
          totalColumnCount={columnDescriptors.length}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>
    </PageContainer>
  );
}
