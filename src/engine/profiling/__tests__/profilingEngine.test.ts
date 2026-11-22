import { describe, expect, it, vi } from 'vitest';
import {
  createMissingValuePolicy,
  DatasetProfilingClient,
  profileDataset,
} from '@/engine/profiling';
import type { ImportedColumn, ImportedDataset, IntakeWarning } from '@/types';

function makeDataset(
  columnNames: readonly string[],
  rows: readonly (readonly unknown[])[],
  overrides: {
    readonly id?: string;
    readonly fileName?: string;
    readonly warnings?: readonly IntakeWarning[];
    readonly columns?: readonly ImportedColumn[];
  } = {},
): ImportedDataset {
  const columns: ImportedColumn[] = overrides.columns
    ? [...overrides.columns]
    : columnNames.map((name, index) => ({
        id: `col_${index + 1}`,
        name,
        originalName: name,
        index,
        wasEmptyHeader: false,
        wasDuplicateHeader: false,
      }));

  return {
    id: overrides.id ?? 'ds_test_001',
    fileName: overrides.fileName ?? 'test.csv',
    fileType: 'csv',
    fileSizeBytes: 1024,
    hasHeaders: true,
    importedAt: Date.now(),
    rowCount: rows.length,
    columnCount: columns.length,
    columns,
    rows,
    warnings: overrides.warnings ?? [],
  };
}

describe('Module 03 — Dataset Schema Detection & Intelligent Profiling Engine', () => {
  describe('Type detection & conservative identifier heuristics', () => {
    it('classifies numeric, numeric strings, identifiers, postal codes, categorical, boolean, and date columns accurately', () => {
      const dataset = makeDataset(
        [
          'Customer ID',
          'Order Number',
          'Postal Code',
          'Revenue',
          'Formatted Cost',
          'Quantity',
          'Region',
          'Payment Method',
          'Is Active',
          'Order Date',
        ],
        [
          ['CUST-001', 10001, '02139', 1245.5, '$1,100.25', 4, 'North', 'Card', true, '2026-01-15'],
          ['CUST-002', 10002, '02140', 890.0, '$450.00', 2, 'South', 'Wire', false, '2026-01-16'],
          ['CUST-001', 10003, '10001', 2150.75, '$1,890.50', 7, 'North', 'Card', true, '2026-01-17'],
          ['CUST-003', 10004, '94107', 640.25, '$320.00', 1, 'West', 'ACH', false, '2026-01-18'],
          ['CUST-004', 10005, '02139', 3100.0, '$2,400.00', 9, 'East', 'Card', true, '2026-01-19'],
        ],
      );

      const profile = profileDataset(dataset);
      const byName = new Map(profile.columns.map((c) => [c.name, c]));

      expect(byName.get('Customer ID')?.detectedType).toBe('identifier');
      expect(byName.get('Order Number')?.detectedType).toBe('identifier');
      expect(byName.get('Postal Code')?.detectedType).toBe('identifier');

      expect(byName.get('Revenue')?.detectedType).toBe('numeric');
      expect(byName.get('Formatted Cost')?.detectedType).toBe('numeric');
      expect(byName.get('Formatted Cost')?.numericStats?.formattedStringCount).toBe(5);
      expect(byName.get('Quantity')?.detectedType).toBe('numeric');

      expect(byName.get('Region')?.detectedType).toBe('categorical');
      expect(byName.get('Payment Method')?.detectedType).toBe('categorical');
      expect(byName.get('Is Active')?.detectedType).toBe('boolean');
      expect(byName.get('Order Date')?.detectedType).toBe('date');

      expect(profile.typeDistribution).toEqual({
        numeric: 3,
        categorical: 2,
        date: 1,
        boolean: 1,
        identifier: 3,
        unknown: 0,
      });
    });

    it('does not classify unique numeric measurements as identifiers solely due to uniqueness', () => {
      const dataset = makeDataset(
        ['Revenue', 'Score', 'Measurement'],
        [
          [101.25, 84, 12],
          [204.5, 91, 18],
          [309.75, 77, 25],
          [412.0, 68, 31],
          [518.4, 95, 44],
        ],
      );

      const profile = profileDataset(dataset);
      for (const col of profile.columns) {
        expect(col.distinctRatio).toBe(1);
        expect(col.detectedType).toBe('numeric');
      }
    });

    it('detects UUIDs and prefixed alphanumeric IDs without relying only on column names', () => {
      const dataset = makeDataset(
        ['ExternalRef', 'EntityTag'],
        [
          ['550e8400-e29b-41d4-a716-446655440000', 'ORD-1001'],
          ['550e8400-e29b-41d4-a716-446655440001', 'ORD-1002'],
          ['550e8400-e29b-41d4-a716-446655440002', 'ORD-1003'],
          ['550e8400-e29b-41d4-a716-446655440003', 'ORD-1004'],
        ],
      );

      const profile = profileDataset(dataset);
      expect(profile.columns[0]?.detectedType).toBe('identifier');
      expect(profile.columns[1]?.detectedType).toBe('identifier');
    });

    it('classifies boolean text tokens and distinguishes binary 0/1 flags by column semantics', () => {
      const dataset = makeDataset(
        ['Verified', 'IsSubscribed', 'RetryCount'],
        [
          ['Yes', '1', 0],
          ['No', '0', 1],
          ['yes', '1', 1],
          ['no', '0', 0],
        ],
      );

      const profile = profileDataset(dataset);
      expect(profile.columns[0]?.detectedType).toBe('boolean');
      expect(profile.columns[1]?.detectedType).toBe('boolean');
      // RetryCount has 0/1 values but is a count measurement, not a boolean flag
      expect(profile.columns[2]?.detectedType).toBe('numeric');
    });

    it('classifies mixed incompatible columns and all-missing columns as unknown with explicit warnings', () => {
      const dataset = makeDataset(
        ['MixedValues', 'EmptyColumn'],
        [
          ['100', null],
          ['alpha', ''],
          ['250', '   '],
          ['beta', 'N/A'],
          ['300', undefined],
          ['gamma', null],
        ],
      );

      const profile = profileDataset(dataset);
      const mixed = profile.columns[0]!;
      const empty = profile.columns[1]!;

      expect(mixed.detectedType).toBe('unknown');
      expect(mixed.warnings.some((w) => w.code === 'MIXED_TYPES')).toBe(true);

      expect(empty.detectedType).toBe('unknown');
      expect(empty.missingCount).toBe(6);
      expect(empty.missingPercentage).toBe(100);
      expect(empty.warnings.some((w) => w.code === 'ALL_MISSING')).toBe(true);
    });
  });

  describe('Missing-value normalization policy', () => {
    it('detects null, undefined, empty strings, whitespace, and configured markers while preserving legitimate "None" by default', () => {
      const dataset = makeDataset(
        ['Allergy', 'Notes'],
        [
          ['Peanuts', null],
          ['None', undefined],
          ['Dairy', ''],
          ['None', '   '],
          ['N/A', 'NULL'],
          ['na', 'missing'],
        ],
      );

      // Default policy preserves "None" as a valid categorical label
      const defaultProfile = profileDataset(dataset);
      const allergyDefault = defaultProfile.columns[0]!;
      const notesDefault = defaultProfile.columns[1]!;

      expect(allergyDefault.totalCount).toBe(6);
      expect(allergyDefault.missingCount).toBe(2); // N/A and na
      expect(allergyDefault.markerMissingCount).toBe(2);
      expect(allergyDefault.nonMissingCount).toBe(4); // Peanuts, None, Dairy, None
      expect(allergyDefault.missingPercentage).toBe(33.33);
      expect(allergyDefault.detectedType).toBe('categorical');
      expect(
        allergyDefault.topCategories?.some((c) => c.value === 'None' && c.count === 2),
      ).toBe(true);

      expect(notesDefault.missingCount).toBe(6);
      expect(notesDefault.structuralMissingCount).toBe(4);
      expect(notesDefault.markerMissingCount).toBe(2);

      // Opt-in policy treating "None" as a missing marker
      const strictPolicy = createMissingValuePolicy({ includeNone: true });
      const strictProfile = profileDataset(dataset, {
        missingValuePolicy: strictPolicy,
      });
      const allergyStrict = strictProfile.columns[0]!;
      expect(allergyStrict.missingCount).toBe(4); // N/A, na, None, None
      expect(allergyStrict.nonMissingCount).toBe(2);
    });
  });

  describe('Date detection & ambiguity handling', () => {
    it('distinguishes ISO dates, ambiguous numeric dates, invalid calendar dates, and mixed date formats without mutating originals', () => {
      const rawRows = [
        ['2026-01-15', '01/02/2026', '2026-01-10', '25/01/2026'],
        ['2026-02-28', '03/04/2026', '2026-02-30', '01/25/2026'],
        ['2026-03-05T14:30:00Z', '05/06/2026', '2026-13-01', '04/05/2026'],
        ['Jan 20, 2026', '07/08/2026', 'not-a-date', '10/11/2026'],
      ] as const;

      const snapshot = JSON.stringify(rawRows);
      const dataset = makeDataset(
        ['IsoDates', 'AmbiguousDates', 'OrderDateWithErrors', 'ConflictingDates'],
        rawRows,
      );

      const profile = profileDataset(dataset);
      const [iso, ambig, withErrors, conflicting] = profile.columns;

      // 1. ISO + named month dates: all valid, 0 ambiguous, 0 invalid
      expect(iso?.detectedType).toBe('date');
      expect(iso?.dateStats?.validCount).toBe(4);
      expect(iso?.dateStats?.ambiguousCount).toBe(0);
      expect(iso?.dateStats?.invalidCount).toBe(0);

      // 2. Ambiguous dates (01/02/2026 etc.) with no convention proof
      expect(ambig?.detectedType).toBe('date');
      expect(ambig?.dateStats?.validCount).toBe(0);
      expect(ambig?.dateStats?.ambiguousCount).toBe(4);
      expect(ambig?.dateStats?.invalidCount).toBe(0);
      expect(ambig?.warnings.some((w) => w.code === 'AMBIGUOUS_DATES')).toBe(true);

      // 3. Date column containing invalid calendar dates (2026-02-30, 2026-13-01) and bad text
      expect(withErrors?.detectedType).toBe('date');
      expect(withErrors?.dateStats?.validCount).toBe(1);
      expect(withErrors?.dateStats?.invalidCount).toBe(3);
      expect(withErrors?.warnings.some((w) => w.code === 'INVALID_DATES')).toBe(true);

      // 4. Conflicting DMY (25/01/2026) and MDY (01/25/2026) conventions in same column
      expect(conflicting?.detectedType).toBe('date');
      expect(conflicting?.dateStats?.ambiguousCount).toBe(2);
      expect(conflicting?.warnings.some((w) => w.code === 'AMBIGUOUS_DATES')).toBe(true);

      // Original cell values must remain completely untouched
      expect(JSON.stringify(dataset.rows)).toBe(snapshot);
    });
  });

  describe('Unique value analysis, duplicates, large datasets, and immutability', () => {
    it('computes exact unique counts, duplicates, distinct ratios, and preserves frozen input data', () => {
      const frozenRows = Object.freeze([
        Object.freeze(['North', 100]),
        Object.freeze(['South', 200]),
        Object.freeze(['North', 100]),
        Object.freeze(['North', null]),
      ]);

      const dataset = makeDataset(['Region', 'Amount'], frozenRows);
      const profile = profileDataset(dataset);

      const region = profile.columns[0]!;
      expect(region.uniqueCount).toBe(2);
      expect(region.duplicateCount).toBe(2);
      expect(region.distinctRatio).toBe(0.5);

      const amount = profile.columns[1]!;
      expect(amount.nonMissingCount).toBe(3);
      expect(amount.uniqueCount).toBe(2);
      expect(amount.duplicateCount).toBe(1);
      expect(amount.distinctRatio).toBeCloseTo(0.6667, 3);
    });

    it('flags duplicate and synthesized column headers accurately', () => {
      const columns: ImportedColumn[] = [
        {
          id: 'col_1',
          name: 'Score',
          originalName: 'Score',
          index: 0,
          wasEmptyHeader: false,
          wasDuplicateHeader: false,
        },
        {
          id: 'col_2',
          name: 'Score (2)',
          originalName: 'Score',
          index: 1,
          wasEmptyHeader: false,
          wasDuplicateHeader: true,
        },
        {
          id: 'col_3',
          name: 'Column 3',
          originalName: '',
          index: 2,
          wasEmptyHeader: true,
          wasDuplicateHeader: false,
        },
      ];

      const dataset = makeDataset(
        ['Score', 'Score (2)', 'Column 3'],
        [
          [85, 90, 'A'],
          [92, 88, 'B'],
        ],
        { columns },
      );

      const profile = profileDataset(dataset);
      expect(
        profile.columns[1]?.warnings.some((w) => w.code === 'DUPLICATE_COLUMN_NAME'),
      ).toBe(true);
      expect(
        profile.columns[2]?.warnings.some((w) => w.code === 'EMPTY_HEADER'),
      ).toBe(true);
    });

    it('profiles a large 20,000-row dataset accurately and efficiently', () => {
      const rowCount = 20_000;
      const regions = ['North', 'South', 'East', 'West'];
      const rows: unknown[][] = new Array(rowCount);
      for (let i = 0; i < rowCount; i += 1) {
        rows[i] = [
          `ORD-${100000 + i}`,
          regions[i % 4],
          (i % 500) + 10.5,
          i % 10 === 0 ? null : '2026-03-01',
        ];
      }

      const dataset = makeDataset(
        ['Order ID', 'Region', 'Revenue', 'Order Date'],
        rows,
        { id: 'ds_large' },
      );

      const profile = profileDataset(dataset);
      expect(profile.datasetId).toBe('ds_large');
      expect(profile.rowCount).toBe(rowCount);
      expect(profile.columns[0]?.detectedType).toBe('identifier');
      expect(profile.columns[0]?.uniqueCount).toBe(rowCount);
      expect(profile.columns[1]?.detectedType).toBe('categorical');
      expect(profile.columns[1]?.uniqueCount).toBe(4);
      expect(profile.columns[2]?.detectedType).toBe('numeric');
      expect(profile.columns[3]?.detectedType).toBe('date');
      expect(profile.columns[3]?.missingCount).toBe(2000);
      expect(profile.columns[3]?.missingPercentage).toBe(10);
    });
  });

  describe('Deterministic quality scoring', () => {
    it('awards 100 to a clean complete dataset and penalizes incomplete or structurally inconsistent datasets', () => {
      const clean = makeDataset(
        ['Order ID', 'Region', 'Revenue', 'Order Date'],
        [
          ['ORD-001', 'North', 120.5, '2026-01-01'],
          ['ORD-002', 'South', 340.0, '2026-01-02'],
          ['ORD-003', 'East', 210.75, '2026-01-03'],
        ],
      );
      const cleanProfile = profileDataset(clean);
      expect(cleanProfile.quality.overallScore).toBe(100);
      expect(cleanProfile.quality.grade).toBe('High');

      // Incomplete dataset (50% missing cells)
      const incomplete = makeDataset(
        ['Region', 'Revenue'],
        [
          ['North', 100],
          [null, null],
          ['South', 200],
          [null, null],
        ],
      );
      const incompleteProfile = profileDataset(incomplete);
      const completenessDim = incompleteProfile.quality.dimensions.find(
        (d) => d.id === 'completeness',
      );
      expect(completenessDim?.score).toBe(50);
      expect(incompleteProfile.quality.overallScore).toBeLessThan(85);

      // Structurally inconsistent dataset (mixed types + ambiguous dates + inconsistent row lengths)
      const inconsistent = makeDataset(
        ['MixedCol', 'AmbigDate'],
        [
          ['100', '01/02/2026'],
          ['hello', '03/04/2026'],
          ['200', '05/06/2026'],
          ['world', '07/08/2026'],
        ],
        {
          warnings: [
            {
              code: 'INCONSISTENT_ROW_LENGTH',
              message: 'Rows have mismatched column counts.',
            },
          ],
        },
      );
      const inconsistentProfile = profileDataset(inconsistent);
      expect(inconsistentProfile.quality.overallScore).toBeLessThan(70);
    });

    it('never assigns a misleading perfect score to an empty dataset (0 rows or 0 columns)', () => {
      const zeroRows = makeDataset(['A', 'B'], []);
      const zeroRowsProfile = profileDataset(zeroRows);
      expect(zeroRowsProfile.quality.overallScore).toBe(0);
      expect(zeroRowsProfile.quality.grade).toBe('Empty');
      expect(
        zeroRowsProfile.warnings.some((w) => w.code === 'EMPTY_DATASET'),
      ).toBe(true);

      const zeroCols = makeDataset([], []);
      const zeroColsProfile = profileDataset(zeroCols);
      expect(zeroColsProfile.quality.overallScore).toBe(0);
      expect(zeroColsProfile.quality.grade).toBe('Empty');
    });
  });

  describe('Profiling Web Worker lifecycle & cancellation', () => {
    it('terminates active profiling workers cleanly when aborted', async () => {
      const terminateSpy = vi.fn();
      const postMessageSpy = vi.fn();

      class MockWorker {
        addEventListener() {}
        removeEventListener() {}
        postMessage(data: unknown) {
          postMessageSpy(data);
        }
        terminate() {
          terminateSpy();
        }
      }

      vi.stubGlobal('Worker', MockWorker);
      try {
        const client = new DatasetProfilingClient();
        const controller = new AbortController();
        const dataset = makeDataset(['A'], [[1], [2]]);

        const pending = client.profile(dataset, { signal: controller.signal });
        expect(postMessageSpy).toHaveBeenCalledTimes(1);

        controller.abort();
        await expect(pending).rejects.toThrow(/cancelled/i);
        expect(terminateSpy).toHaveBeenCalledTimes(1);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
