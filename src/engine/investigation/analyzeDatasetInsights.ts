import type {
  AnomalyDetectionConfig,
  DatasetInsight,
  DatasetInvestigationOverview,
  DatasetInvestigationSummary,
  DatasetProfileSummary,
  DatasetStatisticalSummary,
  ImportedDataset,
  InsightCategory,
  InsightSeverity,
} from '@/types';
import { runSinglePassNumericInvestigation } from './numericAnomalies';
import { generateProfileAndStatInsights } from './profileInsights';

export const DEFAULT_ANOMALY_CONFIG: AnomalyDetectionConfig = {
  iqrMultiplier: 1.5,
  enableZScore: false,
  zScoreThreshold: 3.0,
};

export const MAX_INVESTIGATION_INSIGHTS = 100;

const SEVERITY_RANK: Readonly<Record<InsightSeverity, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const CATEGORY_RANK: Readonly<Record<InsightCategory, number>> = {
  data_quality: 0,
  numeric_outliers: 1,
  distribution: 2,
  categorical: 3,
  relationship: 4,
  structural: 5,
};

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function buildOverview(
  insights: readonly DatasetInsight[],
): DatasetInvestigationOverview {
  const bySeverity: Record<InsightSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  const byCategory: Record<InsightCategory, number> = {
    data_quality: 0,
    numeric_outliers: 0,
    distribution: 0,
    categorical: 0,
    relationship: 0,
    structural: 0,
  };

  let dataQualityIssueCount = 0;
  let statisticalOutlierCount = 0;
  let notableObservationCount = 0;
  let totalRecordAnomalies = 0;
  const affectedCols = new Set<string>();

  for (const insight of insights) {
    bySeverity[insight.severity] += 1;
    byCategory[insight.category] += 1;

    if (insight.classification === 'data_quality_issue') {
      dataQualityIssueCount += 1;
    } else if (insight.classification === 'statistical_outlier') {
      statisticalOutlierCount += 1;
    } else {
      notableObservationCount += 1;
    }

    if (insight.totalAnomalyCount) {
      totalRecordAnomalies += insight.totalAnomalyCount;
    }

    for (const colId of insight.affectedColumnIds) {
      affectedCols.add(colId);
    }
  }

  return {
    totalFindings: insights.length,
    dataQualityIssueCount,
    statisticalOutlierCount,
    notableObservationCount,
    affectedColumnCount: affectedCols.size,
    totalRecordAnomalies,
    bySeverity,
    byCategory,
  };
}

/**
 * Pure, React-independent Module 07 deterministic insights & anomaly detection
 * entry point. Reuses Module 03 classifications & missing policy and Module 04
 * statistical summaries with at most one O(N) pass over source rows.
 */
export function analyzeDatasetInsights(
  dataset: ImportedDataset,
  profile: DatasetProfileSummary,
  stats: DatasetStatisticalSummary,
  config: AnomalyDetectionConfig = DEFAULT_ANOMALY_CONFIG,
): DatasetInvestigationSummary {
  const startedAt = nowMs();

  const normalizedConfig: AnomalyDetectionConfig = {
    iqrMultiplier:
      Number.isFinite(config.iqrMultiplier) && config.iqrMultiplier > 0
        ? config.iqrMultiplier
        : DEFAULT_ANOMALY_CONFIG.iqrMultiplier,
    enableZScore: Boolean(config.enableZScore),
    zScoreThreshold:
      Number.isFinite(config.zScoreThreshold) && config.zScoreThreshold > 0
        ? config.zScoreThreshold
        : DEFAULT_ANOMALY_CONFIG.zScoreThreshold,
  };

  const profileInsights = generateProfileAndStatInsights(profile, stats);
  const numericScan = runSinglePassNumericInvestigation(
    dataset,
    profile,
    stats,
    normalizedConfig,
  );

  // Attach captured invalid-value row samples onto the matching M04 invalid-numeric insights
  const enrichedProfileInsights = profileInsights.map((insight) => {
    if (
      insight.id.startsWith('dq-invalid-numeric-') &&
      insight.affectedColumnIds.length === 1
    ) {
      const colId = insight.affectedColumnIds[0]!;
      const samples = numericScan.invalidRowSamplesByColumn.get(colId);
      if (samples && samples.length > 0) {
        return {
          ...insight,
          recordAnomalies: samples,
        };
      }
    }
    return insight;
  });

  const combined = [...enrichedProfileInsights, ...numericScan.insights];

  // Deterministic ordering: severity -> category -> id
  combined.sort((a, b) => {
    const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const catDiff = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
    if (catDiff !== 0) return catDiff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const boundedInsights = combined.slice(0, MAX_INVESTIGATION_INSIGHTS);
  const durationMs = Math.max(0, Math.round(nowMs() - startedAt));

  return {
    datasetId: dataset.id,
    fileName: dataset.fileName,
    profiledAt: profile.profiledAt,
    computedAt: Date.now(),
    durationMs,
    config: normalizedConfig,
    insights: boundedInsights,
    overview: buildOverview(boundedInsights),
  };
}
