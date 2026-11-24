import { describe, expect, it } from 'vitest';
import { profileDataset } from '@/engine/profiling';
import { analyzeDatasetStatistics } from '@/engine/statistics';
import {
  generateChartRecommendations,
  getEligibleColumnsForChartType,
  MAX_LINE_POINTS,
  MAX_SCATTER_POINTS,
  prepareChartData,
  recommendationToChartConfig,
} from '@/engine/visualization';
import type { ChartConfig, ImportedDataset } from '@/types';

function makeDataset(
  headers: string[],
  rows: unknown[][],
  id = 'ds-vis-test',
): ImportedDataset {
  const columns = headers.map((name, index) => ({
    id: `col-${index}`,
    index,
    name,
    originalName: name,
    wasEmptyHeader: false,
    wasDuplicateHeader: false,
  }));

  return {
    id,
    fileName: 'telemetry.csv',
    fileType: 'csv',
    fileSizeBytes: 2048,
    hasHeaders: true,
    importedAt: Date.now(),
    rowCount: rows.length,
    columnCount: columns.length,
    columns,
    rows,
    warnings: [],
  };
}

describe('Module 06 — Visualization Engine (Recommendations & Preparation)', () => {
  it('generates deterministic, valid chart recommendations and never recommends identifiers or invalid combinations', () => {
    const dataset = makeDataset(
      ['Order ID', 'Order Date', 'Region', 'Revenue', 'Units'],
      [
        ['ORD-1001', '2026-01-01', 'North', 120, 4],
        ['ORD-1002', '2026-01-02', 'South', 240, 8],
        ['ORD-1003', '2026-01-03', 'North', 180, 6],
        ['ORD-1004', '2026-01-04', 'East', 300, 10],
        ['ORD-1005', '2026-01-05', 'West', 150, 5],
        ['ORD-1006', '2026-01-06', 'North', 210, 7],
      ],
    );

    const profile = profileDataset(dataset);
    const stats = analyzeDatasetStatistics(dataset, profile);

    const recs1 = generateChartRecommendations(profile, stats);
    const recs2 = generateChartRecommendations(profile, stats);

    // Strictly deterministic across invocations
    expect(recs1).toEqual(recs2);

    // Expects line (Date x Numeric), bar (Categorical), histogram (Numeric), scatter (Numeric x Numeric), boxplot (Numeric)
    const types = recs1.map((r) => r.type);
    expect(types).toContain('line');
    expect(types).toContain('bar');
    expect(types).toContain('histogram');
    expect(types).toContain('scatter');
    expect(types).toContain('boxplot');

    // Never recommends the identifier column (col-0: Order ID)
    for (const rec of recs1) {
      expect(rec.xColumnId).not.toBe('col-0');
      expect(rec.yColumnId).not.toBe('col-0');
      if (rec.type === 'scatter' || rec.type === 'line') {
        expect(rec.yColumnId).toBeDefined();
        expect(rec.xColumnId).not.toBe(rec.yColumnId);
      }
    }

    // Every recommendation prepares cleanly with status 'ready'
    for (const rec of recs1) {
      const cfg = recommendationToChartConfig(rec);
      const prepared = prepareChartData(dataset, profile, stats, cfg);
      expect(prepared.status).toBe('ready');
    }
  });

  it('prepares categorical bar charts reusing M04 counts, sorting modes, and top-N capping', () => {
    const dataset = makeDataset(
      ['Category'],
      [
        ['Gamma'],
        ['Alpha'],
        ['Alpha'],
        ['Alpha'],
        ['Beta'],
        ['Beta'],
        ['Delta'],
        ['N/A'],
        [''],
      ],
    );

    const profile = profileDataset(dataset);
    const stats = analyzeDatasetStatistics(dataset, profile);

    const baseConfig: ChartConfig = {
      id: 'bar-1',
      type: 'bar',
      title: 'Category Distribution',
      xColumnId: 'col-0',
      xAxisLabel: 'Category',
      yAxisLabel: 'Count',
      categorySort: 'freq_desc',
      maxCategories: 15,
      showLegend: true,
    };

    const desc = prepareChartData(dataset, profile, stats, baseConfig);
    expect(desc.type).toBe('bar');
    if (desc.type !== 'bar') return;
    expect(desc.status).toBe('ready');
    expect(desc.validCount).toBe(7);
    expect(desc.missingExcluded).toBe(2);
    expect(desc.bars.map((b) => [b.label, b.count])).toEqual([
      ['Alpha', 3],
      ['Beta', 2],
      ['Delta', 1],
      ['Gamma', 1],
    ]);

    const asc = prepareChartData(dataset, profile, stats, {
      ...baseConfig,
      categorySort: 'freq_asc',
    });
    if (asc.type === 'bar') {
      expect(asc.bars.map((b) => b.label)).toEqual([
        'Delta',
        'Gamma',
        'Beta',
        'Alpha',
      ]);
    }

    const labelAsc = prepareChartData(dataset, profile, stats, {
      ...baseConfig,
      categorySort: 'label_asc',
    });
    if (labelAsc.type === 'bar') {
      expect(labelAsc.bars.map((b) => b.label)).toEqual([
        'Alpha',
        'Beta',
        'Delta',
        'Gamma',
      ]);
    }

    const labelDesc = prepareChartData(dataset, profile, stats, {
      ...baseConfig,
      categorySort: 'label_desc',
    });
    if (labelDesc.type === 'bar') {
      expect(labelDesc.bars.map((b) => b.label)).toEqual([
        'Gamma',
        'Delta',
        'Beta',
        'Alpha',
      ]);
    }

    // Top-N bounding (min cap is 3) tracks omitted categories & observations
    const capped = prepareChartData(dataset, profile, stats, {
      ...baseConfig,
      maxCategories: 3,
    });
    if (capped.type === 'bar') {
      expect(capped.bars).toHaveLength(3);
      expect(capped.omittedCategoryCount).toBe(1);
      expect(capped.omittedObservationCount).toBe(1);
    }
  });

  it('prepares numeric histograms matching M04 stats, handles constant columns, and excludes missing/invalid values', () => {
    const dataset = makeDataset(
      ['Score', 'Constant'],
      [
        [10, 42],
        [15, 42],
        [20, 42],
        [25, 42],
        [30, 42],
        [35, 42],
        [40, 42],
        [45, 42],
        [50, 42],
        [55, 42],
        ['N/A', ''],
        ['not-a-num', 42],
      ],
    );

    const profile = profileDataset(dataset);
    const stats = analyzeDatasetStatistics(dataset, profile);
    const scoreStats = stats.numericColumns.find((c) => c.columnId === 'col-0')!;

    const hist = prepareChartData(dataset, profile, stats, {
      id: 'hist-1',
      type: 'histogram',
      title: 'Score Histogram',
      xColumnId: 'col-0',
      xAxisLabel: 'Score',
      yAxisLabel: 'Frequency',
      categorySort: 'freq_desc',
      maxCategories: 15,
      binCount: 5,
      showLegend: true,
    });

    expect(hist.type).toBe('histogram');
    if (hist.type !== 'histogram') return;
    expect(hist.status).toBe('ready');
    expect(hist.isConstant).toBe(false);
    expect(hist.bins).toHaveLength(5);
    expect(hist.validCount).toBe(10);
    expect(hist.missingExcluded).toBe(1);
    expect(hist.invalidExcluded).toBe(1);
    expect(hist.min).toBe(scoreStats.min);
    expect(hist.max).toBe(scoreStats.max);
    expect(hist.mean).toBe(scoreStats.mean);
    expect(hist.median).toBe(scoreStats.median);
    const totalBinned = hist.bins.reduce((acc, b) => acc + b.count, 0);
    expect(totalBinned).toBe(10);

    // Constant numeric column produces 1 exact bin safely without division by zero
    const constHist = prepareChartData(dataset, profile, stats, {
      id: 'hist-const',
      type: 'histogram',
      title: 'Constant Histogram',
      xColumnId: 'col-1',
      xAxisLabel: 'Constant',
      yAxisLabel: 'Frequency',
      categorySort: 'freq_desc',
      maxCategories: 15,
      showLegend: true,
    });

    expect(constHist.type).toBe('histogram');
    if (constHist.type === 'histogram') {
      expect(constHist.status).toBe('ready');
      expect(constHist.isConstant).toBe(true);
      expect(constHist.bins).toHaveLength(1);
      expect(constHist.bins[0]?.start).toBe(42);
      expect(constHist.bins[0]?.count).toBe(11);
    }
  });

  it('prepares line charts sorted chronologically with duplicate-X mean aggregation and safe downsampling', () => {
    const dataset = makeDataset(
      ['Date', 'Value'],
      [
        ['2026-01-03', 30],
        ['2026-01-01', 10],
        ['2026-01-02', 20],
        ['2026-01-02', 40], // duplicate date -> mean 30
        ['2026-01-04', 'N/A'], // missing Y excluded
        ['invalid-date', 50], // invalid X excluded
      ],
    );

    const profile = profileDataset(dataset);
    const stats = analyzeDatasetStatistics(dataset, profile);

    const line = prepareChartData(dataset, profile, stats, {
      id: 'line-1',
      type: 'line',
      title: 'Value over Date',
      xColumnId: 'col-0',
      yColumnId: 'col-1',
      xAxisLabel: 'Date',
      yAxisLabel: 'Value',
      categorySort: 'freq_desc',
      maxCategories: 15,
      showLegend: true,
    });

    expect(line.type).toBe('line');
    if (line.type !== 'line') return;
    expect(line.status).toBe('ready');
    expect(line.xKind).toBe('date');
    expect(line.validCount).toBe(4);
    expect(line.missingExcluded).toBe(1);
    expect(line.invalidExcluded).toBe(1);
    expect(line.isAggregated).toBe(true);
    expect(line.isDownsampled).toBe(false);
    expect(line.points.map((p) => [p.xLabel, p.yValue, p.sampleCount])).toEqual([
      ['2026-01-01', 10, 1],
      ['2026-01-02', 30, 2],
      ['2026-01-03', 30, 1],
    ]);

    // Downsampling check when unique X points exceed MAX_LINE_POINTS (250)
    const denseRows: unknown[][] = [];
    for (let i = 0; i < 600; i += 1) {
      denseRows.push([i, i * 2]);
    }
    const denseDataset = makeDataset(['Step', 'Signal'], denseRows, 'ds-dense-line');
    const denseProfile = profileDataset(denseDataset);
    const denseStats = analyzeDatasetStatistics(denseDataset, denseProfile);
    const denseLine = prepareChartData(denseDataset, denseProfile, denseStats, {
      id: 'line-dense',
      type: 'line',
      title: 'Signal over Step',
      xColumnId: 'col-0',
      yColumnId: 'col-1',
      xAxisLabel: 'Step',
      yAxisLabel: 'Signal',
      categorySort: 'freq_desc',
      maxCategories: 15,
      showLegend: true,
    });

    if (denseLine.type === 'line') {
      expect(denseLine.status).toBe('ready');
      expect(denseLine.isDownsampled).toBe(true);
      expect(denseLine.originalPointCount).toBe(600);
      expect(denseLine.points.length).toBeLessThanOrEqual(MAX_LINE_POINTS);
    }
  });

  it('prepares scatter plots with exact valid pairs, rejects invalid pairings, and reproduces M04 quartiles for box plots', () => {
    const dataset = makeDataset(
      ['X', 'Y', 'Label'],
      [
        [1, 10, 'A'],
        [2, 20, 'B'],
        [3, 30, 'A'],
        [4, 40, 'B'],
        [5, 50, 'A'],
        ['N/A', 60, 'A'],
        [7, 'bad', 'B'],
      ],
    );

    const profile = profileDataset(dataset);
    const stats = analyzeDatasetStatistics(dataset, profile);

    const scatter = prepareChartData(dataset, profile, stats, {
      id: 'sc-1',
      type: 'scatter',
      title: 'Y vs X',
      xColumnId: 'col-0',
      yColumnId: 'col-1',
      xAxisLabel: 'X',
      yAxisLabel: 'Y',
      categorySort: 'freq_desc',
      maxCategories: 15,
      showLegend: true,
    });

    expect(scatter.type).toBe('scatter');
    if (scatter.type === 'scatter') {
      expect(scatter.status).toBe('ready');
      expect(scatter.validCount).toBe(5);
      expect(scatter.missingExcluded).toBe(1);
      expect(scatter.invalidExcluded).toBe(1);
      expect(scatter.isSampled).toBe(false);
      expect(scatter.points).toHaveLength(5);
      expect(scatter.points[0]).toEqual({ x: 1, y: 10, rowNumber: 1 });
    }

    // Invalid pairing: same column for X and Y
    const sameColScatter = prepareChartData(dataset, profile, stats, {
      id: 'sc-invalid',
      type: 'scatter',
      title: 'X vs X',
      xColumnId: 'col-0',
      yColumnId: 'col-0',
      xAxisLabel: 'X',
      yAxisLabel: 'X',
      categorySort: 'freq_desc',
      maxCategories: 15,
      showLegend: true,
    });
    expect(sameColScatter.status).toBe('invalid_config');

    // Invalid pairing: categorical column passed to histogram
    const catAsHist = prepareChartData(dataset, profile, stats, {
      id: 'hist-invalid',
      type: 'histogram',
      title: 'Invalid Hist',
      xColumnId: 'col-2',
      xAxisLabel: 'Label',
      yAxisLabel: 'Freq',
      categorySort: 'freq_desc',
      maxCategories: 15,
      showLegend: true,
    });
    expect(catAsHist.status).toBe('invalid_config');

    // Box plot reproduces M04 exact five-number summary
    const box = prepareChartData(dataset, profile, stats, {
      id: 'box-1',
      type: 'boxplot',
      title: 'X Box Plot',
      xColumnId: 'col-0',
      xAxisLabel: 'X',
      yAxisLabel: '',
      categorySort: 'freq_desc',
      maxCategories: 15,
      showLegend: true,
    });
    const xStats = stats.numericColumns.find((c) => c.columnId === 'col-0')!;
    expect(box.type).toBe('boxplot');
    if (box.type === 'boxplot') {
      expect(box.status).toBe('ready');
      expect(box.min).toBe(xStats.min);
      expect(box.q1).toBe(xStats.q1);
      expect(box.median).toBe(xStats.median);
      expect(box.q3).toBe(xStats.q3);
      expect(box.max).toBe(xStats.max);
      expect(box.iqr).toBe(xStats.iqr);
      expect(box.mean).toBe(xStats.mean);
    }
  });

  it('handles empty datasets and unsupported schemas gracefully without throwing', () => {
    const emptyDataset = makeDataset(['A', 'B'], [], 'ds-empty');
    const emptyProfile = profileDataset(emptyDataset);
    const emptyStats = analyzeDatasetStatistics(emptyDataset, emptyProfile);

    expect(generateChartRecommendations(emptyProfile, emptyStats)).toEqual([]);
    expect(
      getEligibleColumnsForChartType('bar', emptyProfile).xColumns,
    ).toHaveLength(0);

    const idsOnly = makeDataset(
      ['Customer ID', 'Order Date'],
      [
        ['CUST-001', '2026-01-01'],
        ['CUST-002', '2026-01-02'],
        ['CUST-003', '2026-01-03'],
      ],
      'ds-ids-only',
    );
    const idProfile = profileDataset(idsOnly);
    const idStats = analyzeDatasetStatistics(idsOnly, idProfile);
    expect(generateChartRecommendations(idProfile, idStats)).toEqual([]);
  });

  it('prepares 100,000-row datasets efficiently with bounded sampling and zero source mutation', () => {
    const totalRows = 100_000;
    const rows: unknown[][] = new Array(totalRows);
    const categories = ['North', 'South', 'East', 'West'];
    for (let i = 0; i < totalRows; i += 1) {
      rows[i] = [categories[i % 4], i % 1000, (i * 3) % 500];
    }

    const firstRowSnapshot = [...rows[0]!];
    const lastRowSnapshot = [...rows[totalRows - 1]!];

    const dataset = makeDataset(['Region', 'MetricA', 'MetricB'], rows, 'ds-100k');
    const profile = profileDataset(dataset);
    const stats = analyzeDatasetStatistics(dataset, profile);

    const startMs = performance.now();

    const bar = prepareChartData(dataset, profile, stats, {
      id: 'big-bar',
      type: 'bar',
      title: 'Region',
      xColumnId: 'col-0',
      xAxisLabel: 'Region',
      yAxisLabel: 'Count',
      categorySort: 'freq_desc',
      maxCategories: 15,
      showLegend: true,
    });
    const hist = prepareChartData(dataset, profile, stats, {
      id: 'big-hist',
      type: 'histogram',
      title: 'MetricA',
      xColumnId: 'col-1',
      xAxisLabel: 'MetricA',
      yAxisLabel: 'Frequency',
      categorySort: 'freq_desc',
      maxCategories: 15,
      showLegend: true,
    });
    const scatter = prepareChartData(dataset, profile, stats, {
      id: 'big-scatter',
      type: 'scatter',
      title: 'MetricB vs MetricA',
      xColumnId: 'col-1',
      yColumnId: 'col-2',
      xAxisLabel: 'MetricA',
      yAxisLabel: 'MetricB',
      categorySort: 'freq_desc',
      maxCategories: 15,
      showLegend: true,
    });

    const elapsedMs = performance.now() - startMs;

    expect(bar.status).toBe('ready');
    expect(hist.status).toBe('ready');
    expect(scatter.status).toBe('ready');

    if (scatter.type === 'scatter') {
      expect(scatter.isSampled).toBe(true);
      expect(scatter.totalValidPairs).toBe(totalRows);
      expect(scatter.points).toHaveLength(MAX_SCATTER_POINTS);
    }

    // Source rows strictly unmutated
    expect(dataset.rows[0]).toEqual(firstRowSnapshot);
    expect(dataset.rows[totalRows - 1]).toEqual(lastRowSnapshot);
    expect(elapsedMs).toBeLessThan(3000);
  });
});
