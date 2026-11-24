import { describe, expect, it } from 'vitest';
import {
  countActiveFilters,
  extractColumnCategoryOptions,
  filterDatasetRowIndices,
  paginateRowIndices,
  sortDatasetRowIndices,
} from '@/engine/explorer';
import {
  createMissingValuePolicy,
  DEFAULT_MISSING_VALUE_POLICY,
  profileDataset,
} from '@/engine/profiling';
import { analyzeDatasetStatistics } from '@/engine/statistics';
import type { ImportedColumn, ImportedDataset } from '@/types';

function makeDataset(
  id: string,
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): ImportedDataset {
  const columns: ImportedColumn[] = headers.map((name, index) => ({
    id: `col_${index + 1}`,
    name,
    originalName: name,
    index,
    wasEmptyHeader: false,
    wasDuplicateHeader: false,
  }));

  return {
    id,
    fileName: `${id}.csv`,
    fileType: 'csv',
    fileSizeBytes: 2048,
    hasHeaders: true,
    importedAt: 1_700_000_000_000,
    rowCount: rows.length,
    columnCount: columns.length,
    columns,
    rows,
    warnings: [],
  };
}

describe('Module 05 — Interactive Data Explorer Query Engine', () => {
  describe('Global & column-specific case-insensitive search', () => {
    it('matches records case-insensitively across all columns and preserves original dataset immutably', () => {
      const rows: unknown[][] = [
        ['ORD-01', 'North', 120.5, 'Alpha'],
        ['ORD-02', 'South', 45, 'Beta'],
        ['ORD-03', 'NORTH', 990, 'Gamma'],
        ['ORD-04', 'West', null, 'alpha-prime'],
      ];
      const snapshot = JSON.stringify(rows);
      const dataset = makeDataset(
        'search_ds',
        ['Order ID', 'Region', 'Amount', 'Tag'],
        rows,
      );

      // Global search matches "alpha" in Tag across rows 0 and 3
      const alphaMatches = filterDatasetRowIndices(dataset, {
        globalSearch: '  ALPHA ',
        columnFilters: {},
      });
      expect(alphaMatches).toEqual([0, 3]);

      // Column-specific text search on Region matches "north" case-insensitively
      const northMatches = filterDatasetRowIndices(dataset, {
        globalSearch: '',
        columnFilters: {
          col_2: { textQuery: 'north' },
        },
      });
      expect(northMatches).toEqual([0, 2]);

      expect(JSON.stringify(dataset.rows)).toBe(snapshot);
    });
  });

  describe('Numeric, categorical, missing-value, and multi-column simultaneous filtering', () => {
    it('filters numeric ranges inclusively (supporting negative/decimal/currency) and excludes missing/invalid cells', () => {
      const dataset = makeDataset(
        'num_filter',
        ['Amount', 'Region'],
        [
          [-15.5, 'North'],
          ['$25.00', 'North'],
          [100, 'South'],
          ['($50.00)', 'East'],
          ['N/A', 'North'],
          [null, 'North'],
          ['invalid', 'North'],
        ],
      );

      // Range [-20, 100] matches -15.5 (0), $25.00 (1), 100 (2) — excludes -50, N/A, null, invalid
      const inRange = filterDatasetRowIndices(dataset, {
        globalSearch: '',
        columnFilters: {
          col_1: { numericMin: -20, numericMax: 100 },
        },
      });
      expect(inRange).toEqual([0, 1, 2]);

      // Impossible range (min > max) returns empty immediately
      const impossible = filterDatasetRowIndices(dataset, {
        globalSearch: '',
        columnFilters: {
          col_1: { numericMin: 200, numericMax: 50 },
        },
      });
      expect(impossible).toEqual([]);
    });

    it('applies multiple simultaneous filters (global search + numeric range + category multi-select + missing mode)', () => {
      const dataset = makeDataset(
        'multi_filter',
        ['Order ID', 'Region', 'Amount', 'Notes'],
        [
          ['ORD-101', 'North', 150, 'Priority'],
          ['ORD-102', 'South', 250, 'Priority'],
          ['ORD-103', 'East', 250, 'Standard'],
          ['ORD-104', 'North', 50, 'Priority'],
          ['ORD-105', 'South', 400, 'N/A'],
          ['ORD-106', 'North', 'N/A', 'Priority'],
        ],
      );

      const matched = filterDatasetRowIndices(dataset, {
        globalSearch: 'priority',
        columnFilters: {
          col_2: { selectedCategories: ['North', 'South'] },
          col_3: { numericMin: 100, numericMax: 300 },
        },
      });
      expect(matched).toEqual([0, 1]);
      expect(
        countActiveFilters('priority', {
          col_2: { selectedCategories: ['North', 'South'] },
          col_3: { numericMin: 100, numericMax: 300 },
        }),
      ).toBe(3);

      // Missing-value filter respects M03 policy (e.g. "None" treated as missing when enabled)
      const policyDataset = makeDataset(
        'policy_ds',
        ['Allergy'],
        [['None'], ['Peanuts'], ['N/A'], [null]],
      );
      const onlyMissingDefault = filterDatasetRowIndices(
        policyDataset,
        {
          globalSearch: '',
          columnFilters: { col_1: { missingMode: 'only_missing' } },
        },
        DEFAULT_MISSING_VALUE_POLICY,
      );
      expect(onlyMissingDefault).toEqual([2, 3]);

      const onlyMissingWithNone = filterDatasetRowIndices(
        policyDataset,
        {
          globalSearch: '',
          columnFilters: { col_1: { missingMode: 'only_missing' } },
        },
        createMissingValuePolicy({ includeNone: true }),
      );
      expect(onlyMissingWithNone).toEqual([0, 2, 3]);
    });
  });

  describe('Sorting: numeric, categorical, stability & consistent missing-value ordering', () => {
    it('sorts numeric columns numerically (not lexicographically), preserves stability, and puts missing/invalid last in both directions', () => {
      const dataset = makeDataset(
        'sort_numeric',
        ['Label', 'Amount'],
        [
          ['row-a', '100'],
          ['row-b', '20'],
          ['row-c', null],
          ['row-d', '20'],
          ['row-e', '-5.5'],
          ['row-f', 'N/A'],
          ['row-g', '3'],
        ],
      );
      const profile = profileDataset(dataset);
      expect(profile.columns[1]!.detectedType).toBe('numeric');
      const all = [0, 1, 2, 3, 4, 5, 6];

      // Ascending: -5.5 (4), 3 (6), 20 (1), 20 (3) [stable!], 100 (0), then missing: null (2), N/A (5) [stable!]
      const asc = sortDatasetRowIndices(
        dataset,
        all,
        { columnId: 'col_2', direction: 'asc' },
        profile,
      );
      expect(asc).toEqual([4, 6, 1, 3, 0, 2, 5]);

      // Descending: 100 (0), 20 (1), 20 (3) [stable!], 3 (6), -5.5 (4), then missing: null (2), N/A (5) [still last & stable!]
      const desc = sortDatasetRowIndices(
        dataset,
        all,
        { columnId: 'col_2', direction: 'desc' },
        profile,
      );
      expect(desc).toEqual([0, 1, 3, 6, 4, 2, 5]);
    });

    it('sorts categorical columns case-insensitively with stable ties and missing values last', () => {
      const dataset = makeDataset(
        'sort_cat',
        ['Id', 'City'],
        [
          [1, 'zurich'],
          [2, 'Boston'],
          [3, null],
          [4, 'boston'],
          [5, 'Austin'],
          [6, 'N/A'],
        ],
      );
      const profile = profileDataset(dataset);
      const all = [0, 1, 2, 3, 4, 5];

      const asc = sortDatasetRowIndices(
        dataset,
        all,
        { columnId: 'col_2', direction: 'asc' },
        profile,
      );
      // Austin (4), Boston (1), boston (3), zurich (0), then missing: null (2), N/A (5)
      expect(asc).toEqual([4, 1, 3, 0, 2, 5]);

      const desc = sortDatasetRowIndices(
        dataset,
        all,
        { columnId: 'col_2', direction: 'desc' },
        profile,
      );
      // zurich (0), boston (3), Boston (1), Austin (4), then missing: null (2), N/A (5)
      expect(desc).toEqual([0, 3, 1, 4, 2, 5]);
    });
  });

  describe('Pagination boundaries, empty datasets, category option reuse & 100,000-row performance', () => {
    it('clamps pagination boundaries accurately across page sizes 25, 50, 100, 250 and empty datasets', () => {
      const indices = Array.from({ length: 60 }, (_, i) => i);

      // Page size 25 -> 3 pages (25, 25, 10)
      const p1 = paginateRowIndices(indices, 60, 1, 25);
      expect(p1.totalPages).toBe(3);
      expect(p1.startRowNumber).toBe(1);
      expect(p1.endRowNumber).toBe(25);
      expect(p1.pageRowIndices).toHaveLength(25);

      const p3 = paginateRowIndices(indices, 60, 3, 25);
      expect(p3.startRowNumber).toBe(51);
      expect(p3.endRowNumber).toBe(60);
      expect(p3.pageRowIndices).toHaveLength(10);

      // Out-of-bounds page numbers clamp safely
      expect(paginateRowIndices(indices, 60, 0, 25).page).toBe(1);
      expect(paginateRowIndices(indices, 60, 999, 25).page).toBe(3);

      // Empty dataset
      const emptySlice = paginateRowIndices([], 0, 5, 50);
      expect(emptySlice).toEqual({
        page: 1,
        pageSize: 50,
        totalRows: 0,
        filteredRows: 0,
        totalPages: 1,
        startRowNumber: 0,
        endRowNumber: 0,
        pageRowIndices: [],
      });
    });

    it('reuses Module 04 statisticalSummary for category filter options without rescanning', () => {
      const dataset = makeDataset(
        'cat_opts',
        ['Region'],
        [['North'], ['South'], ['North'], ['East']],
      );
      const profile = profileDataset(dataset);
      const stats = analyzeDatasetStatistics(dataset, profile);

      const extracted = extractColumnCategoryOptions(dataset, 'col_1', stats);
      expect(extracted.totalDistinctCount).toBe(3);
      expect(extracted.options).toEqual([
        { value: 'North', count: 2 },
        { value: 'East', count: 1 },
        { value: 'South', count: 1 },
      ]);
    });

    it('handles a 100,000-row dataset filter + sort + pagination smoothly and keeps source rows immutable', () => {
      const rowCount = 100_000;
      const regions = ['North', 'South', 'East', 'West'] as const;
      const rows: unknown[][] = new Array(rowCount);
      for (let i = 0; i < rowCount; i += 1) {
        rows[i] = [i + 1, regions[i % 4]!, (i * 17) % 10_000];
      }

      const dataset = makeDataset('perf_100k', ['Record', 'Region', 'Score'], rows);
      const profile = profileDataset(dataset);

      const firstRowRef = dataset.rows[0];
      const lastRowRef = dataset.rows[rowCount - 1];

      const t0 = performance.now();
      const filtered = filterDatasetRowIndices(dataset, {
        globalSearch: '',
        columnFilters: {
          col_2: { selectedCategories: ['North', 'East'] },
          col_3: { numericMin: 5000, numericMax: 9999 },
        },
      });
      const sorted = sortDatasetRowIndices(
        dataset,
        filtered,
        { columnId: 'col_3', direction: 'desc' },
        profile,
      );
      const page = paginateRowIndices(sorted, rowCount, 1, 100);
      const elapsedMs = performance.now() - t0;

      // Exactness checks
      expect(filtered.length).toBeGreaterThan(20_000);
      expect(page.pageRowIndices).toHaveLength(100);
      const topScore = dataset.rows[page.pageRowIndices[0]!]![2] as number;
      const hundredthScore = dataset.rows[page.pageRowIndices[99]!]![2] as number;
      expect(topScore).toBeGreaterThanOrEqual(hundredthScore);
      expect(topScore).toBeLessThanOrEqual(9999);
      expect(hundredthScore).toBeGreaterThanOrEqual(5000);

      // Immutability verified (original row array references untouched)
      expect(dataset.rows[0]).toBe(firstRowRef);
      expect(dataset.rows[rowCount - 1]).toBe(lastRowRef);

      // Generous upper bound to avoid flaky CI while confirming responsiveness
      expect(elapsedMs).toBeLessThan(3_000);
    });
  });
});
