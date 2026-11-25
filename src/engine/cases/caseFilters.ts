/**
 * Data Detective — Module 09 Investigation Case Search, Filter & Sort Engine
 */

import type {
  InvestigationCase,
  InvestigationCasePriority,
  InvestigationCaseStatus,
} from '@/types';

export type CaseSortMode = 'updated_desc' | 'created_desc' | 'created_asc';

export interface CaseFilterOptions {
  readonly searchQuery: string;
  readonly statusFilter: 'all' | InvestigationCaseStatus;
  readonly priorityFilter: 'all' | InvestigationCasePriority;
  readonly onlyWithUnresolvedFindings: boolean;
  readonly showArchived: boolean;
  readonly sortMode: CaseSortMode;
}

export const DEFAULT_CASE_FILTER_OPTIONS: CaseFilterOptions = {
  searchQuery: '',
  statusFilter: 'all',
  priorityFilter: 'all',
  onlyWithUnresolvedFindings: false,
  showArchived: false,
  sortMode: 'updated_desc',
};

export function hasUnresolvedFindings(caseItem: InvestigationCase): boolean {
  return caseItem.status !== 'resolved' && caseItem.findingIds.length > 0;
}

export function partitionCasesByDataset(
  cases: readonly InvestigationCase[],
  activeDatasetId: string | null,
): {
  readonly currentDatasetCases: readonly InvestigationCase[];
  readonly previousDatasetCases: readonly InvestigationCase[];
} {
  if (!activeDatasetId) {
    return {
      currentDatasetCases: [],
      previousDatasetCases: cases,
    };
  }
  const currentDatasetCases: InvestigationCase[] = [];
  const previousDatasetCases: InvestigationCase[] = [];
  for (const c of cases) {
    if (c.datasetId === activeDatasetId) {
      currentDatasetCases.push(c);
    } else {
      previousDatasetCases.push(c);
    }
  }
  return { currentDatasetCases, previousDatasetCases };
}

export function filterAndSortCases(
  cases: readonly InvestigationCase[],
  options: CaseFilterOptions,
): readonly InvestigationCase[] {
  const query = options.searchQuery.trim().toLowerCase();

  const matched = cases.filter((c) => {
    if (options.showArchived ? !c.archived : c.archived) {
      return false;
    }
    if (options.statusFilter !== 'all' && c.status !== options.statusFilter) {
      return false;
    }
    if (
      options.priorityFilter !== 'all' &&
      c.priority !== options.priorityFilter
    ) {
      return false;
    }
    if (options.onlyWithUnresolvedFindings && !hasUnresolvedFindings(c)) {
      return false;
    }
    if (query.length > 0) {
      const haystack = `${c.id} ${c.title} ${c.description}`.toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    return true;
  });

  const sorted = [...matched];
  if (options.sortMode === 'created_desc') {
    sorted.sort((a, b) => b.createdAt - a.createdAt);
  } else if (options.sortMode === 'created_asc') {
    sorted.sort((a, b) => a.createdAt - b.createdAt);
  } else {
    sorted.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  return sorted;
}

export function getRecentlyUpdatedCases(
  cases: readonly InvestigationCase[],
  limit = 4,
): readonly InvestigationCase[] {
  return [...cases]
    .filter((c) => !c.archived)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}
