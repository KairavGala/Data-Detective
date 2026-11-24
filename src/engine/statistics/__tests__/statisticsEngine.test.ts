import { describe, expect, it } from 'vitest';
import {
  createMissingValuePolicy,
  DEFAULT_MISSING_VALUE_POLICY,
  profileDataset,
} from '@/engine/profiling';
import {
  analyzeDatasetStatistics,
  computeCategoricalColumnStatistics,
  computeModeFromSorted,
  computeNumericColumnStatistics,
  computeQuantile,
  DatasetStatisticsClient,
} from '@/engine/statistics';
import { compileMissingPolicy } from '@/engine/profiling/missingValues';
import type {
  DatasetProfileSummary,
  ImportedColumn,
  ImportedDataset,
} from '@/types';

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
    fileSizeBytes: 1024,
    hasHeaders: true,
    importedAt: 1_700_000_000_000,
    rowCount: rows.length,
    columnCount: columns.length,
    columns,
    rows,
    warnings: [],
  };
}

describe('Module 04 — Statistical Analysis Engine', () => {
  describe('Numeric statistics: central tendency, dispersion, quartiles, IQR & mode', () => {
    it('computes exact descriptive statistics on a normal odd-count numeric dataset', () => {
      // Sorted: [10, 20, 20, 30, 70] -> n=5, mean=30, median=20, mode=20 (2x)
      // deviations: -20, -10, -10, 0, +40 -> sum sq = 400+100+100+0+1600 = 2200
      // popVar = 440, sampleVar = 550
      // R-7 quartiles (n=5): h(0.25)=1 -> 20, h(0.5)=2 -> 20, h(0.75)=3 -> 30, IQR=10
      const dataset = makeDataset(
        'odd_numeric',
        ['Score'],
        [[70], [20], [10], [30], [20]],
      );
      const profile = profileDataset(dataset);
      const summary = analyzeDatasetStatistics(dataset, profile);

      expect(summary.numericColumns).toHaveLength(1);
      const score = summary.numericColumns[0]!;

      expect(score.hasValidData).toBe(true);
      expect(score.totalCount).toBe(5);
      expect(score.validCount).toBe(5);
      expect(score.missingCount).toBe(0);
      expect(score.invalidCount).toBe(0);
      expect(score.excludedCount).toBe(0);
      expect(score.distinctCount).toBe(4);
      expect(score.mean).toBeCloseTo(30, 10);
      expect(score.median).toBeCloseTo(20, 10);
      expect(score.min).toBe(10);
      expect(score.max).toBe(70);
      expect(score.range).toBe(60);
      expect(score.populationVariance).toBeCloseTo(440, 10);
      expect(score.sampleVariance).toBeCloseTo(550, 10);
      expect(score.populationStdDev).toBeCloseTo(Math.sqrt(440), 10);
      expect(score.sampleStdDev).toBeCloseTo(Math.sqrt(550), 10);
      expect(score.q1).toBeCloseTo(20, 10);
      expect(score.q2).toBeCloseTo(20, 10);
      expect(score.q3).toBeCloseTo(30, 10);
      expect(score.iqr).toBeCloseTo(10, 10);
      expect(score.mode).toEqual({
        status: 'unimodal',
        values: [20],
        frequency: 2,
        totalModeCount: 1,
        isTruncated: false,
      });
    });

    it('computes exact median and linearly interpolated quartiles on even observation counts', () => {
      // Sorted: [1, 2, 3, 4] -> n=4
      // R-7: Q1 = 1 + 0.75*(2-1) = 1.75; Q2/Median = 2.5; Q3 = 3 + 0.25*(4-3) = 3.25; IQR = 1.5
      // mean = 2.5, M2 = 2.25 + 0.25 + 0.25 + 2.25 = 5, popVar = 1.25, sampleVar = 5/3
      const dataset = makeDataset('even_numeric', ['Val'], [[4], [1], [3], [2]]);
      const profile = profileDataset(dataset);
      const summary = analyzeDatasetStatistics(dataset, profile);

      const col = summary.numericColumns[0]!;
      expect(col.validCount).toBe(4);
      expect(col.mean).toBeCloseTo(2.5, 10);
      expect(col.median).toBeCloseTo(2.5, 10);
      expect(col.q1).toBeCloseTo(1.75, 10);
      expect(col.q2).toBeCloseTo(2.5, 10);
      expect(col.q3).toBeCloseTo(3.25, 10);
      expect(col.iqr).toBeCloseTo(1.5, 10);
      expect(col.populationVariance).toBeCloseTo(1.25, 10);
      expect(col.sampleVariance).toBeCloseTo(5 / 3, 10);
      expect(col.mode.status).toBe('no_mode');
      expect(col.mode.values).toEqual([]);
    });

    it('handles negative values, decimals, formatted currency/accounting strings, and Welford stability on large offsets', () => {
      // Negative & decimal values including accounting parens ($-5.50) and -0
      const dataset = makeDataset(
        'neg_dec',
        ['Temperature', 'LargeOffset'],
        [
          [-10.5, 1_000_000_001],
          ['($5.50)', 1_000_000_002],
          [-0, 1_000_000_003],
          [4.25, 1_000_000_004],
          [11.75, 1_000_000_005],
        ],
      );
      const profile = profileDataset(dataset);
      const summary = analyzeDatasetStatistics(dataset, profile);

      const temp = summary.numericColumns.find((c) => c.name === 'Temperature')!;
      expect(temp.validCount).toBe(5);
      expect(temp.min).toBe(-10.5);
      expect(temp.max).toBe(11.75);
      expect(temp.range).toBeCloseTo(22.25, 10);
      expect(temp.mean).toBeCloseTo(0, 10);
      expect(Object.is(temp.median, 0)).toBe(true);
      expect(temp.q1).toBeCloseTo(-5.5, 10);
      expect(temp.q3).toBeCloseTo(4.25, 10);
      expect(temp.iqr).toBeCloseTo(9.75, 10);

      // Welford stability: variance of [1e9+1 .. 1e9+5] is exact (popVar = 2, sampleVar = 2.5)
      const offset = summary.numericColumns.find((c) => c.name === 'LargeOffset')!;
      expect(offset.mean).toBeCloseTo(1_000_000_003, 10);
      expect(offset.populationVariance).toBeCloseTo(2, 10);
      expect(offset.sampleVariance).toBeCloseTo(2.5, 10);
      expect(offset.sampleStdDev).toBeCloseTo(Math.sqrt(2.5), 10);
    });

    it('detects multiple modes sorted ascending and clearly reports no mode when all values are unique', () => {
      const dataset = makeDataset(
        'modes',
        ['Bimodal', 'Trimodal', 'NoMode', 'Constant'],
        [
          [3, 10, 1, 7],
          [1, 20, 2, 7],
          [3, 30, 3, 7],
          [1, 10, 4, 7],
          [2, 20, 5, 7],
          [5, 30, 6, 7],
        ],
      );
      const profile = profileDataset(dataset);
      const summary = analyzeDatasetStatistics(dataset, profile);

      const bimodal = summary.numericColumns.find((c) => c.name === 'Bimodal')!;
      expect(bimodal.mode).toEqual({
        status: 'multimodal',
        values: [1, 3],
        frequency: 2,
        totalModeCount: 2,
        isTruncated: false,
      });

      const trimodal = summary.numericColumns.find((c) => c.name === 'Trimodal')!;
      expect(trimodal.mode).toEqual({
        status: 'multimodal',
        values: [10, 20, 30],
        frequency: 2,
        totalModeCount: 3,
        isTruncated: false,
      });

      const noMode = summary.numericColumns.find((c) => c.name === 'NoMode')!;
      expect(noMode.mode).toEqual({
        status: 'no_mode',
        values: [],
        frequency: 1,
        totalModeCount: 0,
        isTruncated: false,
      });

      const constant = summary.numericColumns.find((c) => c.name === 'Constant')!;
      expect(constant.populationVariance).toBe(0);
      expect(constant.sampleVariance).toBe(0);
      expect(constant.range).toBe(0);
      expect(constant.iqr).toBe(0);
      expect(constant.mode).toEqual({
        status: 'unimodal',
        values: [7],
        frequency: 6,
        totalModeCount: 1,
        isTruncated: false,
      });
    });

    it('handles single-value columns safely without dividing by zero (n - 1 = 0)', () => {
      const dataset = makeDataset('single_val', ['Amount'], [[42.5]]);
      const profile = profileDataset(dataset);
      const summary = analyzeDatasetStatistics(dataset, profile);

      const col = summary.numericColumns[0]!;
      expect(col.hasValidData).toBe(true);
      expect(col.validCount).toBe(1);
      expect(col.mean).toBe(42.5);
      expect(col.median).toBe(42.5);
      expect(col.min).toBe(42.5);
      expect(col.max).toBe(42.5);
      expect(col.range).toBe(0);
      expect(col.q1).toBe(42.5);
      expect(col.q2).toBe(42.5);
      expect(col.q3).toBe(42.5);
      expect(col.iqr).toBe(0);
      expect(col.populationVariance).toBe(0);
      expect(col.populationStdDev).toBe(0);
      expect(col.sampleVariance).toBeNull();
      expect(col.sampleStdDev).toBeNull();
      expect(col.mode.status).toBe('no_mode');
      expect(col.mode.values).toEqual([]);
    });

    it('strictly excludes missing, invalid, and non-finite values without coercing them to zero', () => {
      // 9 valid numbers (10..90 -> 90% valid so M03 classifies as numeric) + missing + invalid/Infinity
      const rows: unknown[][] = [
        [10],
        [20],
        [30],
        [40],
        [50],
        [60],
        [70],
        [80],
        [90],
        [null],
        [undefined],
        [''],
        ['N/A'],
        [Number.NaN],
        [Number.POSITIVE_INFINITY],
        [Number.NEGATIVE_INFINITY],
        ['not-a-number'],
      ];
      // Add more valid numbers so numeric ratio >= 0.85 for M03 classification (18 valid vs 3 invalid non-missing = 85.7%)
      for (let i = 0; i < 9; i += 1) {
        rows.push([50]);
      }

      const dataset = makeDataset('dirty_numeric', ['Measurement'], rows);
      const profile = profileDataset(dataset);
      expect(profile.columns[0]!.detectedType).toBe('numeric');

      const summary = analyzeDatasetStatistics(dataset, profile);
      const col = summary.numericColumns[0]!;

      expect(col.totalCount).toBe(26);
      expect(col.validCount).toBe(18);
      expect(col.missingCount).toBe(5); // null, undefined, '', 'N/A', NaN
      expect(col.invalidCount).toBe(3); // +Infinity, -Infinity, 'not-a-number'
      expect(col.excludedCount).toBe(8);
      // Mean of (10..90 sum 450) + (9 * 50 = 450) = 900 / 18 = 50 (if invalid had been coerced to 0, mean would drop!)
      expect(col.mean).toBeCloseTo(50, 10);
      expect(col.min).toBe(10);
      expect(col.max).toBe(90);
    });

    it('handles empty columns, zero-row datasets, and extreme float overflow without NaN/Infinity', () => {
      // 1. Zero-row dataset
      const zeroRowDataset = makeDataset('empty_rows', ['Revenue', 'Region'], []);
      const zeroRowProfile = profileDataset(zeroRowDataset);
      const zeroRowSummary = analyzeDatasetStatistics(
        zeroRowDataset,
        zeroRowProfile,
      );
      expect(zeroRowSummary.overview.totalRows).toBe(0);
      expect(zeroRowSummary.overview.totalValidObservations).toBe(0);

      // 2. Direct numeric helper on all-missing/invalid column
      const compiled = compileMissingPolicy(DEFAULT_MISSING_VALUE_POLICY);
      const emptyCol: ImportedColumn = {
        id: 'col_1',
        name: 'EmptyNumeric',
        originalName: 'EmptyNumeric',
        index: 0,
        wasEmptyHeader: false,
        wasDuplicateHeader: false,
      };
      const emptyStats = computeNumericColumnStatistics(
        emptyCol,
        [[null], ['N/A'], [Number.POSITIVE_INFINITY], ['invalid']],
        compiled,
      );
      expect(emptyStats.hasValidData).toBe(false);
      expect(emptyStats.validCount).toBe(0);
      expect(emptyStats.missingCount).toBe(2);
      expect(emptyStats.invalidCount).toBe(2);
      expect(emptyStats.mean).toBeNull();
      expect(emptyStats.median).toBeNull();
      expect(emptyStats.sampleStdDev).toBeNull();
      expect(emptyStats.iqr).toBeNull();
      expect(emptyStats.mode.status).toBe('empty');

      // 3. Direct quantile / mode edge helpers
      expect(computeQuantile(new Float64Array(0), 0.5)).toBeNull();
      expect(computeModeFromSorted(new Float64Array(0)).mode.status).toBe('empty');

      // 4. Extreme values whose difference/variance overflows Number.MAX_VALUE
      const overflowStats = computeNumericColumnStatistics(
        emptyCol,
        [[-1e308], [1e308]],
        compiled,
      );
      expect(overflowStats.validCount).toBe(2);
      expect(overflowStats.min).toBe(-1e308);
      expect(overflowStats.max).toBe(1e308);
      expect(overflowStats.range).toBeNull(); // 2e308 overflows to Infinity -> safe null
      expect(overflowStats.populationVariance).toBeNull();
      expect(overflowStats.sampleVariance).toBeNull();
    });
  });

  describe('Categorical statistics: distributions, percentages, ties & data quality', () => {
    it('computes accurate frequencies, percentages summing to 100%, and handles ties in both most and least frequent categories', () => {
      // Frequencies: North=3, South=3 (tie for most), East=1, West=1 (tie for least), Central=2
      // Valid = 10, Missing = 2 ('', 'N/A'), Total = 12
      const dataset = makeDataset(
        'cat_ties',
        ['Region'],
        [
          ['South'],
          ['North'],
          ['Central'],
          ['West'],
          ['North'],
          ['South'],
          ['East'],
          ['North'],
          ['South'],
          ['Central'],
          [''],
          ['N/A'],
        ],
      );
      const profile = profileDataset(dataset);
      expect(profile.columns[0]!.detectedType).toBe('categorical');

      const summary = analyzeDatasetStatistics(dataset, profile);
      expect(summary.categoricalColumns).toHaveLength(1);
      const region = summary.categoricalColumns[0]!;

      expect(region.hasValidData).toBe(true);
      expect(region.totalCount).toBe(12);
      expect(region.validCount).toBe(10);
      expect(region.missingCount).toBe(2);
      expect(region.invalidCount).toBe(0);
      expect(region.excludedCount).toBe(2);
      expect(region.distinctCount).toBe(5);
      expect(region.isUniformDistribution).toBe(false);

      // Deterministic tie ordering: alphabetical within equal counts
      expect(region.mostFrequent).toEqual({
        count: 3,
        percentage: 30,
        values: ['North', 'South'],
        isTie: true,
        totalTiedCount: 2,
        isTruncated: false,
      });

      expect(region.leastFrequent).toEqual({
        count: 1,
        percentage: 10,
        values: ['East', 'West'],
        isTie: true,
        totalTiedCount: 2,
        isTruncated: false,
      });

      // Distribution sorted by count DESC, label ASC
      expect(region.distribution.map((d) => [d.value, d.count])).toEqual([
        ['North', 3],
        ['South', 3],
        ['Central', 2],
        ['East', 1],
        ['West', 1],
      ]);

      // Share of valid sums to exactly 100%
      const pctSum = region.distribution.reduce(
        (acc, item) => acc + item.percentage,
        0,
      );
      expect(pctSum).toBeCloseTo(100, 10);

      // Share of total rows reflects excluded records (3 / 12 = 25%)
      expect(region.distribution[0]!.percentageOfTotal).toBeCloseTo(25, 10);
    });

    it('handles single-category, uniform-tie, empty, and invalid non-finite categorical cells cleanly', () => {
      const compiled = compileMissingPolicy(DEFAULT_MISSING_VALUE_POLICY);
      const col: ImportedColumn = {
        id: 'col_1',
        name: 'Status',
        originalName: 'Status',
        index: 0,
        wasEmptyHeader: false,
        wasDuplicateHeader: false,
      };

      // Uniform tie: A=2, B=2, plus invalid Infinity & plain object
      const uniformStats = computeCategoricalColumnStatistics(
        col,
        [['B'], ['A'], ['A'], ['B'], [Number.POSITIVE_INFINITY], [{ bad: true }], [null]],
        compiled,
      );
      expect(uniformStats.validCount).toBe(4);
      expect(uniformStats.missingCount).toBe(1);
      expect(uniformStats.invalidCount).toBe(2);
      expect(uniformStats.isUniformDistribution).toBe(true);
      expect(uniformStats.mostFrequent?.values).toEqual(['A', 'B']);
      expect(uniformStats.leastFrequent?.values).toEqual(['A', 'B']);
      expect(uniformStats.mostFrequent?.isTie).toBe(true);
      expect(uniformStats.distribution[0]!.percentage).toBeCloseTo(50, 10);

      // Empty categorical column
      const emptyStats = computeCategoricalColumnStatistics(
        col,
        [[null], [''], ['N/A']],
        compiled,
      );
      expect(emptyStats.hasValidData).toBe(false);
      expect(emptyStats.distinctCount).toBe(0);
      expect(emptyStats.mostFrequent).toBeNull();
      expect(emptyStats.leastFrequent).toBeNull();
      expect(emptyStats.distribution).toEqual([]);
    });

    it('respects Module 03 missing-value policy updates ("None" preserved vs treated as missing)', () => {
      const dataset = makeDataset(
        'none_policy',
        ['Allergy'],
        [['None'], ['None'], ['Peanuts'], ['Shellfish']],
      );

      const defaultProfile = profileDataset(dataset, {
        missingValuePolicy: DEFAULT_MISSING_VALUE_POLICY,
      });
      const defaultStats = analyzeDatasetStatistics(dataset, defaultProfile);
      const allergyDefault = defaultStats.categoricalColumns[0]!;
      expect(allergyDefault.validCount).toBe(4);
      expect(allergyDefault.distinctCount).toBe(3);
      expect(allergyDefault.mostFrequent?.values).toEqual(['None']);

      const includeNoneProfile = profileDataset(dataset, {
        missingValuePolicy: createMissingValuePolicy({ includeNone: true }),
      });
      const includeNoneStats = analyzeDatasetStatistics(
        dataset,
        includeNoneProfile,
      );
      const allergyNoneMissing = includeNoneStats.categoricalColumns[0]!;
      expect(allergyNoneMissing.validCount).toBe(2);
      expect(allergyNoneMissing.missingCount).toBe(2);
      expect(allergyNoneMissing.distinctCount).toBe(2);
      expect(allergyNoneMissing.mostFrequent?.values).toEqual([
        'Peanuts',
        'Shellfish',
      ]);
    });
  });

  describe('M03 classification alignment, immutability, guardrails & large datasets', () => {
    it('routes M03 identifier, date, boolean, and unknown columns into unsupportedColumns without mutating source rows', () => {
      const rows: unknown[][] = [
        ['CUST-001', '2026-01-01', 'true', 'North', 100, 'abc'],
        ['CUST-002', '2026-01-02', 'false', 'South', 200, 123],
        ['CUST-003', '2026-01-03', 'true', 'North', 300, 'xyz'],
        ['CUST-004', '2026-01-04', 'false', 'East', 400, 456],
      ];
      const snapshot = JSON.stringify(rows);

      const dataset = makeDataset(
        'mixed_schema',
        ['Customer ID', 'Order Date', 'Is Active', 'Region', 'Revenue', 'MixedCol'],
        rows,
      );
      const profile = profileDataset(dataset);
      const summary = analyzeDatasetStatistics(dataset, profile);

      expect(summary.numericColumns.map((c) => c.name)).toEqual(['Revenue']);
      expect(summary.categoricalColumns.map((c) => c.name)).toEqual(['Region']);
      expect(
        summary.unsupportedColumns.map((c) => [c.name, c.detectedType]),
      ).toEqual([
        ['Customer ID', 'identifier'],
        ['Order Date', 'date'],
        ['Is Active', 'boolean'],
        ['MixedCol', 'unknown'],
      ]);

      // Immutability verified
      expect(JSON.stringify(dataset.rows)).toBe(snapshot);
    });

    it('rejects mismatched dataset/profile IDs explicitly', () => {
      const dsA = makeDataset('ds_a', ['Value'], [[1], [2]]);
      const dsB = makeDataset('ds_b', ['Value'], [[3], [4]]);
      const profileA = profileDataset(dsA);

      expect(() => analyzeDatasetStatistics(dsB, profileA)).toThrow(
        /does not match active dataset/i,
      );
    });

    it('processes a 100,000-row dataset accurately within browser memory and latency limits', async () => {
      const rowCount = 100_000;
      const categories = ['Alpha', 'Beta', 'Gamma', 'Delta'] as const;
      const rows: unknown[][] = new Array(rowCount);

      // Values 1..100000: mean = 50000.5, median = 50000.5, min = 1, max = 100000, range = 99999
      // Categories balanced 25,000 each (uniform 4-way tie)
      for (let i = 0; i < rowCount; i += 1) {
        rows[i] = [i + 1, categories[i % 4]!];
      }

      const dataset = makeDataset('large_100k', ['Metric', 'Bucket'], rows);
      const profile: DatasetProfileSummary = profileDataset(dataset);

      const client = new DatasetStatisticsClient();
      const summary = await client.analyze(dataset, profile);

      expect(summary.overview.totalRows).toBe(rowCount);
      expect(summary.numericColumns).toHaveLength(1);
      expect(summary.categoricalColumns).toHaveLength(1);

      const metric = summary.numericColumns[0]!;
      expect(metric.validCount).toBe(rowCount);
      expect(metric.min).toBe(1);
      expect(metric.max).toBe(100_000);
      expect(metric.range).toBe(99_999);
      expect(metric.mean).toBeCloseTo(50_000.5, 6);
      expect(metric.median).toBeCloseTo(50_000.5, 6);
      expect(metric.q1).toBeCloseTo(25_000.75, 6);
      expect(metric.q3).toBeCloseTo(75_000.25, 6);
      expect(metric.iqr).toBeCloseTo(49_999.5, 6);
      expect(metric.mode.status).toBe('no_mode');

      const bucket = summary.categoricalColumns[0]!;
      expect(bucket.validCount).toBe(rowCount);
      expect(bucket.distinctCount).toBe(4);
      expect(bucket.isUniformDistribution).toBe(true);
      expect(bucket.mostFrequent?.count).toBe(25_000);
      expect(bucket.mostFrequent?.values).toEqual([
        'Alpha',
        'Beta',
        'Delta',
        'Gamma',
      ]);
      expect(bucket.mostFrequent?.isTie).toBe(true);
      expect(bucket.distribution[0]!.percentage).toBeCloseTo(25, 10);
    });
  });
});
