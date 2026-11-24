import { describe, expect, it } from 'vitest';
import {
  analyzeDatasetInsights,
  DEFAULT_ANOMALY_CONFIG,
  MAX_RECORD_ANOMALY_SAMPLES,
} from '@/engine/investigation';
import { profileDataset } from '@/engine/profiling';
import { analyzeDatasetStatistics } from '@/engine/statistics';
import type { ImportedDataset } from '@/types';

function makeDataset(
  headers: string[],
  rows: unknown[][],
  id = 'ds-m07-test',
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
    fileName: 'investigation_sample.csv',
    fileType: 'csv',
    fileSizeBytes: 4096,
    hasHeaders: true,
    importedAt: Date.now(),
    rowCount: rows.length,
    columnCount: columns.length,
    columns,
    rows,
    warnings: [],
  };
}

describe('Module 07 — Deterministic Insights & Anomaly Detection Engine', () => {
  it('detects Tukey IQR outliers with configurable multiplier and classifies them strictly as statistical_outlier', () => {
    // 11 normal values around 10..20 plus one moderate extreme (40) and one massive extreme (250)
    const rows: unknown[][] = [
      [10],
      [11],
      [12],
      [13],
      [14],
      [15],
      [16],
      [17],
      [18],
      [19],
      [20],
      [32],
      [250],
    ];
    const dataset = makeDataset(['LatencyMs'], rows);
    const profile = profileDataset(dataset);
    const stats = analyzeDatasetStatistics(dataset, profile);

    const standard = analyzeDatasetInsights(dataset, profile, stats, {
      ...DEFAULT_ANOMALY_CONFIG,
      iqrMultiplier: 1.5,
    });
    const iqrFinding = standard.insights.find(
      (i) => i.id === 'anom-iqr-col-0',
    );
    expect(iqrFinding).toBeDefined();
    expect(iqrFinding?.category).toBe('numeric_outliers');
    expect(iqrFinding?.classification).toBe('statistical_outlier');
    expect(iqrFinding?.totalAnomalyCount).toBe(2);
    expect(iqrFinding?.recordAnomalies?.[0]?.rowNumber).toBe(13);
    expect(iqrFinding?.recordAnomalies?.[0]?.numericValue).toBe(250);
    expect(iqrFinding?.recommendedChart?.chartType).toBe('boxplot');

    // Raising multiplier to 3.0 flags only the massive 250 extreme, excluding 40
    const strict = analyzeDatasetInsights(dataset, profile, stats, {
      ...DEFAULT_ANOMALY_CONFIG,
      iqrMultiplier: 3.0,
    });
    const strictIqr = strict.insights.find((i) => i.id === 'anom-iqr-col-0');
    expect(strictIqr?.totalAnomalyCount).toBe(1);
    expect(strictIqr?.recordAnomalies?.[0]?.rowNumber).toBe(13);
  });

  it('supports optional Z-score outlier detection and skips it when disabled', () => {
    const rows: unknown[][] = [];
    for (let i = 0; i < 29; i += 1) {
      rows.push([100 + (i % 5)]);
    }
    rows.push([950]); // row 30 extreme spike

    const dataset = makeDataset(['Amount'], rows);
    const profile = profileDataset(dataset);
    const stats = analyzeDatasetStatistics(dataset, profile);

    const disabled = analyzeDatasetInsights(dataset, profile, stats, {
      iqrMultiplier: 1.5,
      enableZScore: false,
      zScoreThreshold: 3.0,
    });
    expect(
      disabled.insights.find((i) => i.id === 'anom-zscore-col-0'),
    ).toBeUndefined();

    const enabled = analyzeDatasetInsights(dataset, profile, stats, {
      iqrMultiplier: 1.5,
      enableZScore: true,
      zScoreThreshold: 3.0,
    });
    const zFinding = enabled.insights.find(
      (i) => i.id === 'anom-zscore-col-0',
    );
    expect(zFinding).toBeDefined();
    expect(zFinding?.classification).toBe('statistical_outlier');
    expect(zFinding?.totalAnomalyCount).toBe(1);
    expect(zFinding?.recordAnomalies?.[0]?.rowNumber).toBe(30);
    expect(Math.abs(zFinding?.recordAnomalies?.[0]?.zScore ?? 0)).toBeGreaterThan(
      3.0,
    );
  });

  it('guards against zero-variance (constant) columns and detects both constant and near-constant columns safely', () => {
    const rows: unknown[][] = [];
    for (let i = 0; i < 20; i += 1) {
      rows.push([
        42, // constant numeric (stdDev = 0, IQR = 0)
        i === 19 ? 99 : 10, // near-constant numeric (95% = 10)
        i === 19 ? 'Special' : 'Standard', // near-constant categorical (95% = Standard)
      ]);
    }

    const dataset = makeDataset(
      ['FixedCode', 'UnitPrice', 'Tier'],
      rows,
    );
    const profile = profileDataset(dataset);
    const stats = analyzeDatasetStatistics(dataset, profile);

    const summary = analyzeDatasetInsights(dataset, profile, stats, {
      iqrMultiplier: 1.5,
      enableZScore: true,
      zScoreThreshold: 3.0,
    });

    // Constant column detected as data_quality_issue and NEVER throws or emits IQR/Z outliers
    const constantFinding = summary.insights.find(
      (i) => i.id === 'struct-constant-col-0',
    );
    expect(constantFinding).toBeDefined();
    expect(constantFinding?.classification).toBe('data_quality_issue');
    expect(
      summary.insights.find((i) => i.id === 'anom-iqr-col-0'),
    ).toBeUndefined();
    expect(
      summary.insights.find((i) => i.id === 'anom-zscore-col-0'),
    ).toBeUndefined();

    // Near-constant numeric & categorical detected cleanly
    expect(
      summary.insights.find((i) => i.id === 'struct-near-constant-num-col-1'),
    ).toBeDefined();
    expect(
      summary.insights.find((i) => i.id === 'struct-near-constant-cat-col-2'),
    ).toBeDefined();
  });

  it('respects insufficient-observation guardrails without throwing or emitting false findings', () => {
    const dataset = makeDataset(
      ['SmallNumA', 'SmallNumB'],
      [
        [1, 2],
        [2, 4],
        [1000, 2000],
      ],
    );
    const profile = profileDataset(dataset);
    const stats = analyzeDatasetStatistics(dataset, profile);

    const summary = analyzeDatasetInsights(dataset, profile, stats, {
      iqrMultiplier: 1.5,
      enableZScore: true,
      zScoreThreshold: 2.5,
    });

    // Only 3 rows: below IQR (4), Z-score (5), Skewness (8), and Correlation (5) minimums
    expect(
      summary.insights.find((i) => i.category === 'numeric_outliers'),
    ).toBeUndefined();
    expect(
      summary.insights.find((i) => i.category === 'relationship'),
    ).toBeUndefined();
    expect(
      summary.insights.find((i) => i.id.startsWith('dist-skew-')),
    ).toBeUndefined();
  });

  it('detects dominant categories and rare categories cleanly', () => {
    const rows: unknown[][] = [];
    // 25 rows: 20 "North" (80% dominant), 4 "South", 1 "Antarctica" (4% but singleton -> rare)
    for (let i = 0; i < 20; i += 1) rows.push(['North']);
    for (let i = 0; i < 4; i += 1) rows.push(['South']);
    rows.push(['Antarctica']);

    const dataset = makeDataset(['Region'], rows);
    const profile = profileDataset(dataset);
    const stats = analyzeDatasetStatistics(dataset, profile);

    const summary = analyzeDatasetInsights(dataset, profile, stats);

    const dominant = summary.insights.find((i) => i.id === 'cat-dominant-col-0');
    expect(dominant).toBeDefined();
    expect(dominant?.classification).toBe('notable_observation');
    expect(dominant?.recommendedChart?.chartType).toBe('bar');

    const rare = summary.insights.find((i) => i.id === 'cat-rare-col-0');
    expect(rare).toBeDefined();
    expect(rare?.explanation).toMatch(/rare/i);
  });

  it('detects high missing-value concentration, cross-column missingness spread, and invalid numeric values with row samples', () => {
    const rows: unknown[][] = [];
    for (let i = 0; i < 12; i += 1) {
      rows.push([
        `Item-${i}`,
        i < 6 ? '' : 100 + i, // 50% missing -> critical + 50pp spread vs CompleteCol
        i === 11 ? 'bad-number' : 50 + i, // 11/12 = 91.7% numeric -> M03 numeric with 1 invalid cell at row 12
      ]);
    }

    const dataset = makeDataset(
      ['CompleteCol', 'SparseMetric', 'DirtyMetric'],
      rows,
    );
    const profile = profileDataset(dataset);
    const stats = analyzeDatasetStatistics(dataset, profile);

    const summary = analyzeDatasetInsights(dataset, profile, stats);

    const highMissing = summary.insights.find(
      (i) => i.id === 'dq-missing-high-col-1',
    );
    expect(highMissing).toBeDefined();
    expect(highMissing?.severity).toBe('critical');
    expect(highMissing?.classification).toBe('data_quality_issue');

    const spread = summary.insights.find((i) =>
      i.id.startsWith('dq-missing-spread-'),
    );
    expect(spread).toBeDefined();
    expect(spread?.classification).toBe('data_quality_issue');

    const invalidNum = summary.insights.find(
      (i) => i.id === 'dq-invalid-numeric-col-2',
    );
    expect(invalidNum).toBeDefined();
    expect(invalidNum?.classification).toBe('data_quality_issue');
    expect(invalidNum?.recordAnomalies).toHaveLength(1);
    expect(invalidNum?.recordAnomalies?.[0]?.rowNumber).toBe(12);
    expect(invalidNum?.recordAnomalies?.[0]?.value).toBe('bad-number');
  });

  it('computes strong positive and negative Pearson correlations without claiming causation, and detects high skewness', () => {
    const rows: unknown[][] = [];
    // 15 rows: X strongly correlated with Y (+1.0) and inversely with Z (-1.0); SkewedCol strongly right-skewed
    for (let i = 1; i <= 15; i += 1) {
      const skewed = i === 15 ? 500 : i <= 12 ? 10 + (i % 3) : 20;
      rows.push([i * 10, i * 25 + 5, 1000 - i * 30, skewed]);
    }

    const dataset = makeDataset(['X', 'Y', 'Z', 'SkewedCol'], rows);
    const profile = profileDataset(dataset);
    const stats = analyzeDatasetStatistics(dataset, profile);

    const summary = analyzeDatasetInsights(dataset, profile, stats);

    const corrXY = summary.insights.find(
      (i) => i.id === 'rel-corr-col-0-col-1',
    );
    expect(corrXY).toBeDefined();
    expect(corrXY?.title).toMatch(/positive/i);
    expect(corrXY?.explanation).toMatch(/does not imply causation/i);
    expect(corrXY?.recommendedChart?.chartType).toBe('scatter');

    const corrXZ = summary.insights.find(
      (i) => i.id === 'rel-corr-col-0-col-2',
    );
    expect(corrXZ).toBeDefined();
    expect(corrXZ?.title).toMatch(/negative/i);

    const skewFinding = summary.insights.find(
      (i) => i.id === 'dist-skew-col-3',
    );
    expect(skewFinding).toBeDefined();
    expect(skewFinding?.title).toMatch(/right-skewed/i);
  });

  it('produces multiple simultaneous findings deterministically and handles empty and unsupported datasets', () => {
    const emptyDataset = makeDataset(['A', 'B'], [], 'ds-empty');
    const emptyProfile = profileDataset(emptyDataset);
    const emptyStats = analyzeDatasetStatistics(emptyDataset, emptyProfile);
    const emptySummary = analyzeDatasetInsights(
      emptyDataset,
      emptyProfile,
      emptyStats,
    );
    expect(emptySummary.insights).toEqual([]);
    expect(emptySummary.overview.totalFindings).toBe(0);

    // Unsupported-only columns (identifiers + clean dates) produce zero crash and zero numeric outliers
    const idDataset = makeDataset(
      ['Order ID', 'Event Date'],
      [
        ['ORD-001', '2026-01-01'],
        ['ORD-002', '2026-01-02'],
        ['ORD-003', '2026-01-03'],
        ['ORD-004', '2026-01-04'],
      ],
      'ds-ids',
    );
    const idProfile = profileDataset(idDataset);
    const idStats = analyzeDatasetStatistics(idDataset, idProfile);
    const idSummary = analyzeDatasetInsights(idDataset, idProfile, idStats);
    expect(idSummary.overview.statisticalOutlierCount).toBe(0);

    // Deterministic repeatability across runs
    const idSummary2 = analyzeDatasetInsights(idDataset, idProfile, idStats);
    expect(idSummary.insights).toEqual(idSummary2.insights);
  });

  it('processes a 100,000-row dataset within performance bounds, caps record samples, and keeps source rows immutable', () => {
    const totalRows = 100_000;
    const rows: unknown[][] = new Array(totalRows);
    for (let i = 0; i < totalRows; i += 1) {
      const base = (i % 50) + 10;
      const metricA = i < 40 ? 10_000 + i : base; // 40 extreme outliers
      const metricB = metricA * 2 + 5; // strong correlation with metricA
      rows[i] = [i % 10 === 0 ? 'North' : 'South', metricA, metricB];
    }

    const snapFirst = [...rows[0]!];
    const snapLast = [...rows[totalRows - 1]!];

    const dataset = makeDataset(
      ['Region', 'MetricA', 'MetricB'],
      rows,
      'ds-100k-m07',
    );
    const profile = profileDataset(dataset);
    const stats = analyzeDatasetStatistics(dataset, profile);

    const started = performance.now();
    const summary = analyzeDatasetInsights(dataset, profile, stats, {
      iqrMultiplier: 1.5,
      enableZScore: true,
      zScoreThreshold: 3.0,
    });
    const elapsedMs = performance.now() - started;

    expect(summary.overview.totalFindings).toBeGreaterThanOrEqual(3);

    const iqr = summary.insights.find((i) => i.id === 'anom-iqr-col-1');
    expect(iqr).toBeDefined();
    expect(iqr?.totalAnomalyCount).toBe(40);
    expect(iqr?.recordAnomalies?.length).toBeLessThanOrEqual(
      MAX_RECORD_ANOMALY_SAMPLES,
    );

    // Source rows strictly untouched
    expect(dataset.rows[0]).toEqual(snapFirst);
    expect(dataset.rows[totalRows - 1]).toEqual(snapLast);
    expect(elapsedMs).toBeLessThan(3500);
  });
});
