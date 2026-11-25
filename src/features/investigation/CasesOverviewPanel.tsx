import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowUpRight,
  FolderOpen,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DatasetScopedAiBrief } from '@/context/InvestigationContext';
import {
  DEFAULT_CASE_FILTER_OPTIONS,
  filterAndSortCases,
  getRecentlyUpdatedCases,
  type CaseFilterOptions,
  type CaseSortMode,
} from '@/engine/cases';
import { isSafeInternalDestination } from '@/features/assistant/aiInvestigationClient';
import type {
  DatasetInsight,
  InvestigationCase,
  InvestigationCasePriority,
  InvestigationCaseStatus,
} from '@/types';
import { cn, formatCount } from '@/utils';
import {
  CASE_PRIORITY_META,
  CASE_PRIORITY_ORDER,
  CASE_STATUS_META,
  CASE_STATUS_ORDER,
  formatCaseTimestamp,
} from './caseLabels';

interface CasesOverviewPanelProps {
  readonly currentDatasetCases: readonly InvestigationCase[];
  readonly previousDatasetCases: readonly InvestigationCase[];
  readonly insights: readonly DatasetInsight[];
  readonly verifiedAiBrief: DatasetScopedAiBrief | null;
  readonly onCreateManualCase: (input: {
    readonly title: string;
    readonly description: string;
    readonly priority: InvestigationCasePriority;
    readonly initialFindingIds: readonly string[];
  }) => { readonly created: boolean; readonly caseId: string; readonly duplicateReason?: string } | null;
  readonly onOpenCase: (caseId: string) => void;
  readonly onReopenCase: (caseId: string) => void;
  readonly onCreateCaseFromRecommendation: (title: string, reason: string, findingIds: readonly string[]) => void;
}

/**
 * Module 09 — Unified Investigation Cases & Module 08 Intelligence Overview.
 * Manages active/archived cases, search/filtering/sorting, recently updated
 * cases, previous-dataset isolation notices, and M08 AI brief integration.
 */
export function CasesOverviewPanel({
  currentDatasetCases,
  previousDatasetCases,
  insights,
  verifiedAiBrief,
  onCreateManualCase,
  onOpenCase,
  onReopenCase,
  onCreateCaseFromRecommendation,
}: CasesOverviewPanelProps) {
  const [filters, setFilters] = useState<CaseFilterOptions>(
    DEFAULT_CASE_FILTER_OPTIONS,
  );
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] =
    useState<InvestigationCasePriority>('medium');
  const [selectedFindingId, setSelectedFindingId] = useState<string>('');
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);

  const activeCount = useMemo(
    () => currentDatasetCases.filter((c) => !c.archived).length,
    [currentDatasetCases],
  );
  const archivedCount = useMemo(
    () => currentDatasetCases.filter((c) => c.archived).length,
    [currentDatasetCases],
  );

  const visibleCases = useMemo(
    () => filterAndSortCases(currentDatasetCases, filters),
    [currentDatasetCases, filters],
  );

  const recentlyUpdated = useMemo(
    () => getRecentlyUpdatedCases(currentDatasetCases, 3),
    [currentDatasetCases],
  );

  const handleSubmitNewCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setDuplicateNotice(null);

    const res = onCreateManualCase({
      title: newTitle.trim(),
      description: newDescription.trim(),
      priority: newPriority,
      initialFindingIds: selectedFindingId ? [selectedFindingId] : [],
    });

    if (!res) return;
    if (!res.created) {
      setDuplicateNotice(
        `An active case (${res.caseId}) already tracks this scope. Opened the existing case instead of creating a duplicate.`,
      );
    }
    setNewTitle('');
    setNewDescription('');
    setNewPriority('medium');
    setSelectedFindingId('');
    setShowCreateForm(false);
    onOpenCase(res.caseId);
  };

  return (
    <div className="space-y-6">
      {/* Investigation Cases Command Section */}
      <section
        data-testid="investigation-cases-panel"
        aria-label="Investigation cases"
        className="dd-surface-primary space-y-4 p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--dd-border-subtle)] pb-3.5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
              <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                Investigation Cases · {formatCount(activeCount)} Active ·{' '}
                {formatCount(archivedCount)} Archived
              </span>
            </div>
            <h3 className="text-[1.0625rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]">
              Active Case Workspace
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="new-case-button"
              onClick={() => {
                setShowCreateForm((prev) => !prev);
                setDuplicateNotice(null);
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3.5 py-1.5 font-mono text-[0.75rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20 whitespace-nowrap"
            >
              {showCreateForm ? (
                <>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Close Form</span>
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>New Investigation Case</span>
                </>
              )}
            </button>
          </div>
        </div>

        {duplicateNotice && (
          <div
            role="status"
            className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-warning-border)] bg-[var(--dd-surface-recessed)] px-3.5 py-2 text-[0.8125rem] text-[var(--dd-text-secondary)]"
          >
            {duplicateNotice}
          </div>
        )}

        {/* Manual Case Creation Form */}
        {showCreateForm && (
          <form
            data-testid="create-case-form"
            onSubmit={handleSubmitNewCase}
            className="space-y-3 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] p-4"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1 md:col-span-2">
                <label
                  htmlFor="new-case-title"
                  className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]"
                >
                  Case Title
                </label>
                <input
                  id="new-case-title"
                  type="text"
                  required
                  maxLength={140}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Revenue Outlier Spike Investigation"
                  className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3 py-1.5 text-[0.84375rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="new-case-priority"
                  className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]"
                >
                  Priority
                </label>
                <select
                  id="new-case-priority"
                  value={newPriority}
                  onChange={(e) =>
                    setNewPriority(e.target.value as InvestigationCasePriority)
                  }
                  className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2.5 py-1.5 text-[0.84375rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                >
                  {CASE_PRIORITY_ORDER.map((p) => (
                    <option key={p} value={p}>
                      {CASE_PRIORITY_META[p].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1 md:col-span-2">
                <label
                  htmlFor="new-case-description"
                  className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]"
                >
                  Short Description
                </label>
                <input
                  id="new-case-description"
                  type="text"
                  maxLength={500}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Scope of the anomaly or hypothesis to investigate…"
                  className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3 py-1.5 text-[0.84375rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="new-case-initial-finding"
                  className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]"
                >
                  Initial Finding (Optional)
                </label>
                <select
                  id="new-case-initial-finding"
                  value={selectedFindingId}
                  onChange={(e) => setSelectedFindingId(e.target.value)}
                  className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                >
                  <option value="">None (manual case)</option>
                  {insights.map((ins) => (
                    <option key={ins.id} value={ins.id}>
                      {ins.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] px-3 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={newTitle.trim().length === 0}
                className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3.5 py-1.5 font-mono text-[0.75rem] font-medium text-[var(--dd-text-primary)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Create Case
              </button>
            </div>
          </form>
        )}

        {/* Case Search, Filters & Active/Archived View Switch */}
        {currentDatasetCases.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1 lg:max-w-sm">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[var(--dd-text-muted)]"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  aria-label="Search investigation cases"
                  value={filters.searchQuery}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      searchQuery: e.target.value,
                    }))
                  }
                  placeholder="Search cases by title or description…"
                  className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] py-1.5 pr-8 pl-9 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none placeholder:text-[var(--dd-text-muted)] focus:border-[var(--dd-accent-teal-border)]"
                />
                {filters.searchQuery && (
                  <button
                    type="button"
                    aria-label="Clear case search"
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, searchQuery: '' }))
                    }
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-[var(--dd-text-muted)] hover:text-[var(--dd-text-primary)]"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter cases by status"
                  value={filters.statusFilter}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      statusFilter: e.target.value as
                        | 'all'
                        | InvestigationCaseStatus,
                    }))
                  }
                  className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                >
                  <option value="all">All Statuses</option>
                  {CASE_STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {CASE_STATUS_META[s].label}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filter cases by priority"
                  value={filters.priorityFilter}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      priorityFilter: e.target.value as
                        | 'all'
                        | InvestigationCasePriority,
                    }))
                  }
                  className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                >
                  <option value="all">All Priorities</option>
                  {CASE_PRIORITY_ORDER.map((p) => (
                    <option key={p} value={p}>
                      {CASE_PRIORITY_META[p].label}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Sort investigation cases"
                  value={filters.sortMode}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      sortMode: e.target.value as CaseSortMode,
                    }))
                  }
                  className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                >
                  <option value="updated_desc">Sort: Last Updated</option>
                  <option value="created_desc">Sort: Newest Created</option>
                  <option value="created_asc">Sort: Oldest Created</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--dd-border-subtle)] pt-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <div
                  role="tablist"
                  aria-label="Active or archived cases"
                  className="inline-flex items-center gap-1"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!filters.showArchived}
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, showArchived: false }))
                    }
                    className={cn(
                      'cursor-pointer rounded-[var(--dd-radius-sm)] border px-2.5 py-1 font-mono text-[0.75rem] whitespace-nowrap',
                      !filters.showArchived
                        ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-text-primary)]'
                        : 'border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-secondary)]',
                    )}
                  >
                    Active ({formatCount(activeCount)})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={filters.showArchived}
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, showArchived: true }))
                    }
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-1 rounded-[var(--dd-radius-sm)] border px-2.5 py-1 font-mono text-[0.75rem] whitespace-nowrap',
                      filters.showArchived
                        ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-text-primary)]'
                        : 'border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-secondary)]',
                    )}
                  >
                    <Archive className="h-3 w-3" aria-hidden="true" />
                    <span>Archived ({formatCount(archivedCount)})</span>
                  </button>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-[0.75rem] text-[var(--dd-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={filters.onlyWithUnresolvedFindings}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        onlyWithUnresolvedFindings: e.target.checked,
                      }))
                    }
                    className="h-3.5 w-3.5 accent-[var(--dd-accent-teal)]"
                  />
                  <span>With unresolved findings</span>
                </label>
              </div>

              {recentlyUpdated.length > 0 && !filters.showArchived && (
                <div className="flex flex-wrap items-center gap-2 font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
                  <span>Recent:</span>
                  {recentlyUpdated.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onOpenCase(c.id)}
                      className="cursor-pointer text-[var(--dd-accent-teal)] hover:underline"
                    >
                      {c.id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Case Cards List */}
        {currentDatasetCases.length === 0 ? (
          <div
            data-testid="cases-empty-state"
            className="rounded-[var(--dd-radius-sm)] border border-dashed border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-5 text-[0.84375rem] text-[var(--dd-text-secondary)]"
          >
            No investigation cases created for this dataset yet. Click{' '}
            <span className="font-medium text-[var(--dd-text-primary)]">
              Create Case
            </span>{' '}
            on any finding below or select{' '}
            <span className="font-medium text-[var(--dd-text-primary)]">
              New Investigation Case
            </span>{' '}
            above to organize evidence, hypotheses, and conclusions.
          </div>
        ) : visibleCases.length === 0 ? (
          <p className="rounded-[var(--dd-radius-sm)] border border-dashed border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-4 text-center text-[0.8125rem] text-[var(--dd-text-muted)]">
            No {filters.showArchived ? 'archived' : 'active'} cases match your
            current filters.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {visibleCases.map((c) => {
              const sMeta = CASE_STATUS_META[c.status];
              const pMeta = CASE_PRIORITY_META[c.priority];
              return (
                <article
                  key={c.id}
                  data-testid={`case-card-${c.id}`}
                  className="flex flex-col justify-between gap-3 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] p-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.07em] dd-tabular">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--dd-text-primary)]">
                          {c.id}
                        </span>
                        <span className="text-[var(--dd-text-muted)]" aria-hidden="true">
                          ·
                        </span>
                        <span className={cn('font-semibold', sMeta.textClass)}>
                          {sMeta.label}
                        </span>
                        <span className="text-[var(--dd-text-muted)]" aria-hidden="true">
                          ·
                        </span>
                        <span className={cn('font-semibold', pMeta.textClass)}>
                          {pMeta.label}
                        </span>
                      </div>
                      <span className="text-[var(--dd-text-muted)]">
                        {formatCaseTimestamp(c.updatedAt)}
                      </span>
                    </div>

                    <h4 className="text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
                      {c.title}
                    </h4>

                    {c.description && (
                      <p className="line-clamp-2 text-[0.8125rem] text-[var(--dd-text-secondary)]">
                        {c.description}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--dd-border-subtle)] pt-2.5 font-mono text-[0.6875rem] text-[var(--dd-text-muted)] dd-tabular">
                    <span>
                      {formatCount(c.findingIds.length)} findings ·{' '}
                      {formatCount(c.evidence.length)} evidence ·{' '}
                      {formatCount(c.notes.length)} notes
                    </span>
                    <div className="flex items-center gap-2">
                      {c.archived && (
                        <button
                          type="button"
                          onClick={() => onReopenCase(c.id)}
                          className="inline-flex cursor-pointer items-center gap-1 text-[var(--dd-status-warning)] hover:underline"
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden="true" />
                          <span>Reopen</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenCase(c.id)}
                        className="inline-flex cursor-pointer items-center gap-1 font-medium text-[var(--dd-accent-teal)] hover:text-[var(--dd-accent-teal-hover)]"
                      >
                        <span>Open Case</span>
                        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Previous Dataset Cases (Explicitly Separated) */}
        {previousDatasetCases.length > 0 && (
          <div
            data-testid="previous-dataset-cases-section"
            className="space-y-2.5 border-t border-[var(--dd-border-subtle)] pt-4"
          >
            <div className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-status-warning)]">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                Cases from Previous Datasets ({formatCount(previousDatasetCases.length)})
                · Not Linked to Active Dataset
              </span>
            </div>
            <div className="divide-y divide-[var(--dd-border-subtle)] rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-warning-border)] bg-[var(--dd-surface-recessed)]">
              {previousDatasetCases.map((c) => (
                <div
                  key={c.id}
                  data-testid={`previous-case-${c.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-[0.8125rem]"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-[0.75rem] text-[var(--dd-text-muted)]">
                      {c.id} · Previous dataset: {c.datasetFileName} ·{' '}
                    </span>
                    <span className="font-medium text-[var(--dd-text-primary)]">
                      {c.title}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenCase(c.id)}
                    className="cursor-pointer font-mono text-[0.75rem] text-[var(--dd-accent-teal)] hover:underline whitespace-nowrap"
                  >
                    Review (Read-Only)
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Module 08 AI Intelligence Integration Panel (when available) */}
      <section
        data-testid="investigation-ai-intelligence-bridge"
        aria-label="AI investigation summary"
        className="dd-surface-primary space-y-3.5 p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-status-warning)]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              AI Investigation ·{' '}
              {verifiedAiBrief
                ? 'Active Interpretation Available'
                : 'On-Demand Synthesis'}
            </span>
          </div>

          <Link
            to="/assistant"
            className="inline-flex items-center gap-1 font-mono text-[0.75rem] text-[var(--dd-accent-teal)] hover:text-[var(--dd-accent-teal-hover)] whitespace-nowrap"
          >
            <span>
              {verifiedAiBrief
                ? 'Open Full AI Brief & Q&A'
                : 'Generate AI Brief in Assistant'}
            </span>
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>

        {verifiedAiBrief ? (
          <div className="space-y-4">
            <p className="text-[0.84375rem] leading-relaxed text-[var(--dd-text-secondary)]">
              <strong className="font-mono text-[0.6875rem] uppercase text-[var(--dd-status-warning)]">
                AI Interpretation:{' '}
              </strong>
              {verifiedAiBrief.data.brief.executiveSummary}
            </p>

            {verifiedAiBrief.data.recommendations.length > 0 && (
              <div className="space-y-2 border-t border-[var(--dd-border-subtle)] pt-3">
                <div className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-text-muted)]">
                  Recommended Investigative Actions
                </div>
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {verifiedAiBrief.data.recommendations
                    .slice(0, 4)
                    .map((rec) => (
                      <div
                        key={rec.id}
                        className="flex flex-col justify-between gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-3"
                      >
                        <div className="space-y-1">
                          <div className="text-[0.8125rem] font-semibold text-[var(--dd-text-primary)]">
                            {rec.title}
                          </div>
                          <p className="text-[0.75rem] text-[var(--dd-text-secondary)]">
                            {rec.reason}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-[0.6875rem]">
                          {isSafeInternalDestination(rec.destinationUrl) && (
                            <Link
                              to={rec.destinationUrl}
                              className="inline-flex items-center gap-1 text-[var(--dd-accent-teal)] hover:underline"
                            >
                              <span>Inspect</span>
                              <ArrowUpRight
                                className="h-3 w-3"
                                aria-hidden="true"
                              />
                            </Link>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              onCreateCaseFromRecommendation(
                                rec.title,
                                rec.reason,
                                rec.supportingFindingIds,
                              )
                            }
                            className="cursor-pointer text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)]"
                          >
                            + Start Case
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
            No AI investigation brief has been generated for this dataset yet.
            You can generate a dataset-wide brief in{' '}
            <Link
              to="/assistant"
              className="text-[var(--dd-accent-teal)] hover:underline"
            >
              AI Assistant
            </Link>{' '}
            or open any case to run focused AI case interpretation.
          </p>
        )}
      </section>
    </div>
  );
}
