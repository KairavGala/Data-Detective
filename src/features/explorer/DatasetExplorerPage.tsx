import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Crosshair,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
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
    profilingError,
    reprofileDataset,
    missingValuePolicy,
    statisticalSummary,
    statisticsStatus,
    statisticsError,
    recomputeStatistics,
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

  // Keep refs to active pageSize and current sortedIndices so deep-link navigation
  // uses the actual active page size and filtered/sorted order without hijacking manual paging.
  const pageSizeRef = useRef<ExplorerPageSize>(pageSize);
  pageSizeRef.current = pageSize;

  const isContextStructurallyValid = Boolean(
    activeDataset &&
      Array.isArray(activeDataset.columns) &&
      Array.isArray(activeDataset.rows),
  );

  const hasStaleProfileMismatch = Boolean(
    activeDataset &&
      datasetProfile &&
      datasetProfile.datasetId !== activeDataset.id,
  );

  const explorerDescriptorsResult = useMemo(() => {
    if (!activeDataset || !isContextStructurallyValid) {
      return { descriptors: [], error: null as string | null };
    }
    if (profilingStatus === 'error' || hasStaleProfileMismatch) {
      return { descriptors: [], error: null as string | null };
    }
    try {
      return {
        descriptors: resolveExplorerColumns(activeDataset, datasetProfile),
        error: null as string | null,
      };
    } catch (err: unknown) {
      return {
        descriptors: [],
        error:
          err instanceof Error
            ? err.message
            : 'Unable to initialize Explorer column descriptors from the active dataset.',
      };
    }
  }, [
    activeDataset,
    datasetProfile,
    isContextStructurallyValid,
    profilingStatus,
    hasStaleProfileMismatch,
  ]);

  const columnDescriptors = explorerDescriptorsResult.descriptors;
  const explorerContextError = explorerDescriptorsResult.error;

  const visibleColumns = useMemo(
    () => columnDescriptors.filter((d) => !hiddenColumnIds.has(d.column.id)),
    [columnDescriptors, hiddenColumnIds],
  );

  // Step 1: Single-pass immutable row filtering -> original 0-based row indices
  const filteredIndices = useMemo(() => {
    if (
      !activeDataset ||
      !isContextStructurallyValid ||
      profilingStatus === 'error' ||
      hasStaleProfileMismatch ||
      explorerContextError
    ) {
      return [];
    }
    return filterDatasetRowIndices(
      activeDataset,
      {
        globalSearch: deferredGlobalSearch,
        columnFilters,
      },
      missingValuePolicy,
    );
  }, [
    activeDataset,
    isContextStructurallyValid,
    profilingStatus,
    hasStaleProfileMismatch,
    explorerContextError,
    deferredGlobalSearch,
    columnFilters,
    missingValuePolicy,
  ]);

  // Step 2: Stable typed sorting over filtered row indices
  const sortedIndices = useMemo(() => {
    if (
      !activeDataset ||
      !isContextStructurallyValid ||
      profilingStatus === 'error' ||
      hasStaleProfileMismatch ||
      explorerContextError
    ) {
      return [];
    }
    return sortDatasetRowIndices(
      activeDataset,
      filteredIndices,
      sort,
      datasetProfile,
      missingValuePolicy,
    );
  }, [
    activeDataset,
    isContextStructurallyValid,
    profilingStatus,
    hasStaleProfileMismatch,
    explorerContextError,
    filteredIndices,
    sort,
    datasetProfile,
    missingValuePolicy,
  ]);

  const sortedIndicesRef = useRef<readonly number[]>(sortedIndices);
  sortedIndicesRef.current = sortedIndices;

  // Automatically reset explorer state whenever activeDataset changes or is cleared
  const activeDatasetId = activeDataset?.id ?? null;
  const prevDatasetIdRef = useRef<string | null>(activeDatasetId);
  useEffect(() => {
    if (prevDatasetIdRef.current === activeDatasetId) {
      return;
    }
    prevDatasetIdRef.current = activeDatasetId;
    setGlobalSearch('');
    setColumnFilters({});
    setSort(null);
    setHiddenColumnIds(new Set());
    setPage(1);
    setPageSize(DEFAULT_EXPLORER_PAGE_SIZE);
    pageSizeRef.current = DEFAULT_EXPLORER_PAGE_SIZE;
    setIsFilterPanelOpen(false);
    setIsColumnsPanelOpen(false);
    setFilterColumnId(activeDataset?.columns?.[0]?.id ?? '');
    setFocusedColumnId(null);
    setHighlightedRowIndex(null);
  }, [activeDatasetId, activeDataset]);

  // Apply investigation deep-link focus (?column=<id>&row=<1-based>) using active pageSize
  // and current filtered/sorted order without mutating dataset or discarding active filters/sorting.
  const columnParam = searchParams.get('column');
  const rowParam = searchParams.get('row');
  useEffect(() => {
    if (!activeDataset || !isContextStructurallyValid) return;
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
        const currentSorted = sortedIndicesRef.current;
        const positionInView = currentSorted.indexOf(targetIndex);
        const activeSize = pageSizeRef.current;
        if (positionInView >= 0) {
          setPage(Math.floor(positionInView / activeSize) + 1);
        } else if (currentSorted.length === 0) {
          setPage(Math.floor(targetIndex / activeSize) + 1);
        }
      }
    }
  }, [activeDataset, isContextStructurallyValid, columnParam, rowParam]);

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

  const handlePageSizeChange = useCallback(
    (nextSize: ExplorerPageSize) => {
      setPageSize(nextSize);
      pageSizeRef.current = nextSize;
      if (highlightedRowIndex !== null) {
        const positionInView = sortedIndices.indexOf(highlightedRowIndex);
        if (positionInView >= 0) {
          setPage(Math.floor(positionInView / nextSize) + 1);
          return;
        }
      }
      setPage(1);
    },
    [highlightedRowIndex, sortedIndices],
  );

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
              <DossierLabel code="SEC-01" label="Data Exploration" />
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

  // Error state: upstream dataset profiling or required explorer context failed
  if (
    profilingStatus === 'error' ||
    !isContextStructurallyValid ||
    hasStaleProfileMismatch ||
    explorerContextError
  ) {
    const errorMessage =
      profilingStatus === 'error'
        ? (profilingError ??
          'Dataset schema profiling failed before Explorer column types and typed filters could be initialized.')
        : explorerContextError
          ? explorerContextError
          : hasStaleProfileMismatch
            ? 'Explorer detected a profile mismatch for the active dataset and paused rendering to prevent stale results.'
            : 'Required dataset rows or column metadata could not be read by Explorer.';

    return (
      <PageContainer width="standard">
        <div className="dd-anim-file-enter space-y-5">
          <section
            role="alert"
            data-testid="explorer-error-state"
            className="dd-surface-primary space-y-4 border-[var(--dd-status-anomaly-border)] p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DossierLabel code="SEC-01" label="Data Exploration" />
              <StatusIndicator tone="anomaly" label="Profiling Required" />
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertCircle
                  className="mt-0.5 h-5 w-5 shrink-0 text-[var(--dd-status-anomaly)]"
                  aria-hidden="true"
                />
                <div className="space-y-1.5">
                  <h2 className="text-[1rem] font-semibold text-[var(--dd-text-primary)]">
                    Dataset Explorer could not initialize
                  </h2>
                  <p className="text-[0.8125rem] leading-relaxed text-[var(--dd-text-secondary)]">
                    {errorMessage}
                  </p>
                  <p className="font-mono text-[0.75rem] text-[var(--dd-text-muted)] dd-tabular">
                    Active dataset preserved in memory: {activeDataset.fileName} ·{' '}
                    {formatCount(activeDataset.rowCount)} rows ×{' '}
                    {formatCount(activeDataset.columnCount)} columns
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={reprofileDataset}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20 whitespace-nowrap"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Retry Profiling</span>
                </button>
                <Link
                  to="/"
                  className="inline-flex items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-accent-teal-border)] hover:text-[var(--dd-text-primary)] whitespace-nowrap"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Overview</span>
                </Link>
              </div>
            </div>
          </section>
        </div>
      </PageContainer>
    );
  }

  // Loading state while initial schema profiling is still running
  if (profilingStatus === 'profiling' && !datasetProfile) {
    return (
      <PageContainer width="standard">
        <div className="dd-anim-file-enter">
          <section
            aria-label="Preparing Dataset Explorer"
            data-testid="explorer-loading-state"
            className="dd-surface-primary flex items-center justify-between gap-4 p-6"
          >
            <div className="flex items-center gap-3.5">
              <Loader2
                className="h-5 w-5 animate-spin text-[var(--dd-accent-teal)]"
                aria-hidden="true"
              />
              <div className="space-y-0.5">
                <h2 className="text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
                  Preparing Dataset Explorer…
                </h2>
                <p className="font-mono text-[0.75rem] text-[var(--dd-text-muted)] dd-tabular">
                  Profiling {formatCount(activeDataset.rowCount)} rows ×{' '}
                  {formatCount(activeDataset.columnCount)} columns locally in
                  browser memory.
                </p>
              </div>
            </div>
            <StatusIndicator tone="analytical" label="Profiling" />
          </section>
        </div>
      </PageContainer>
    );
  }

  const isHighlightedRowFilteredOut =
    highlightedRowIndex !== null && !sortedIndices.includes(highlightedRowIndex);

  return (
    <PageContainer width="wide">
      <div
        className="dd-anim-file-enter space-y-4"
        data-testid="dataset-explorer-page"
        data-explored-dataset-id={activeDataset.id}
      >
        {/* Header dossier bar */}
        <WorkspaceHeader
          code="SEC-01"
          sectionLabel="Data Exploration"
          title="Dataset Explorer"
          context={`Active dataset in memory: ${activeDataset.fileName} · ${formatCount(activeDataset.rowCount)} total rows · ${formatCount(activeDataset.columnCount)} columns · Original values preserved`}
          navigationLinks={[
            {
              label: 'Statistical Analysis',
              to: '/analysis',
              testId: 'explorer-nav-statistics',
            },
            {
              label: 'Visualization Studio',
              to: '/visualizations',
              testId: 'explorer-nav-visualizations',
            },
            {
              label: 'Investigation Center',
              to: '/investigation',
              testId: 'explorer-nav-investigation',
            },
          ]}
          actions={
            profilingStatus === 'profiling' ? (
              <span className="inline-flex items-center gap-1.5 font-mono text-[0.72rem] text-[var(--dd-accent-teal)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Syncing column schema…
              </span>
            ) : undefined
          }
        />

        {statisticsStatus === 'error' && (
          <div
            role="status"
            data-testid="explorer-statistics-warning"
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-warning-border)] bg-[var(--dd-surface-recessed)] px-4 py-2.5 text-[0.8125rem] text-[var(--dd-text-secondary)]"
          >
            <span>
              {statisticsError ??
                'Summary statistics are temporarily unavailable; numeric filter bounds will refresh once analysis succeeds.'}
            </span>
            <button
              type="button"
              onClick={recomputeStatistics}
              className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-[0.75rem] text-[var(--dd-accent-teal)] hover:underline whitespace-nowrap"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              <span>Retry Statistics</span>
            </button>
          </div>
        )}

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
                <span>
                  Row #{formatCount(highlightedRowIndex + 1)}
                  {isHighlightedRowFilteredOut
                    ? ' (hidden by active filters)'
                    : ''}
                </span>
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
