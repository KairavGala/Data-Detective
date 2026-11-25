/**
 * Data Detective — Module 10 Report Templates & Deterministic Narrative Helpers
 *
 * Pure, React-independent definitions for all 5 supported report types,
 * section defaults, deterministic methodology derivation (strictly reflecting
 * only methods actually used), neutral executive summary synthesis, and
 * evidence-bounded limitations & conclusions.
 */

import type {
  CategoricalColumnStatistics,
  InvestigationCase,
  NumericColumnStatistics,
  ReportChartSnapshot,
  ReportDatasetOverviewSnapshot,
  ReportFindingSnapshot,
  ReportMethodologyItem,
  ReportSectionConfig,
  ReportSectionKey,
  ReportType,
} from '@/types';

export const REPORT_TYPE_ORDER: readonly ReportType[] = [
  'dataset_analysis',
  'data_quality',
  'investigation_dossier',
  'statistical_analysis',
  'custom',
];

export interface ReportTypeDescriptor {
  readonly type: ReportType;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly defaultSubtitle: string;
}

export const REPORT_TYPE_META: Readonly<Record<ReportType, ReportTypeDescriptor>> =
  {
    dataset_analysis: {
      type: 'dataset_analysis',
      label: 'Dataset Analysis Report',
      shortLabel: 'Dataset Analysis',
      description:
        'Comprehensive overview of dataset schema, statistical summaries, key findings, and charts.',
      defaultSubtitle: 'Deterministic Schema, Statistical, and Anomaly Summary',
    },
    data_quality: {
      type: 'data_quality',
      label: 'Data Quality Report',
      shortLabel: 'Data Quality',
      description:
        'Focused audit of completeness, missing-value patterns, structural warnings, and data-quality findings.',
      defaultSubtitle: 'Completeness, Schema Integrity, and Data-Quality Assessment',
    },
    investigation_dossier: {
      type: 'investigation_dossier',
      label: 'Investigation Dossier',
      shortLabel: 'Investigation Dossier',
      description:
        'Formal investigative document uniting verified findings, case evidence board, notes, hypotheses, timeline, and conclusions.',
      defaultSubtitle: 'Structured Evidence, Findings, and Case Record',
    },
    statistical_analysis: {
      type: 'statistical_analysis',
      label: 'Statistical Analysis Report',
      shortLabel: 'Statistical Analysis',
      description:
        'Technical report centered on numeric descriptive statistics, quartiles, categorical distributions, and visualizations.',
      defaultSubtitle: 'Descriptive Statistics and Distribution Analysis',
    },
    custom: {
      type: 'custom',
      label: 'Custom Report',
      shortLabel: 'Custom Report',
      description:
        'Flexible document structure with user-selected sections, findings, statistics, and visualizations.',
      defaultSubtitle: 'Curated Analytical Documentation',
    },
  };

export const REPORT_SECTION_LABELS: Readonly<Record<ReportSectionKey, string>> = {
  cover: 'Cover Page',
  executive_summary: 'Executive Summary',
  dataset_overview: 'Dataset Overview',
  methodology: 'Methodology',
  statistical_findings: 'Statistical Findings',
  insights_anomalies: 'Insights & Anomalies',
  visualizations: 'Visualizations',
  investigation_case: 'Investigation Case',
  ai_interpretation: 'AI Interpretation',
  limitations_conclusion: 'Limitations & Conclusion',
};

const ALL_SECTION_ORDER: readonly ReportSectionKey[] = [
  'cover',
  'executive_summary',
  'dataset_overview',
  'methodology',
  'statistical_findings',
  'insights_anomalies',
  'visualizations',
  'investigation_case',
  'ai_interpretation',
  'limitations_conclusion',
];

export function buildDefaultSections(
  reportType: ReportType,
  options: {
    readonly hasCase: boolean;
    readonly includeAi: boolean;
    readonly hasCharts: boolean;
    readonly hasStats: boolean;
    readonly hasFindings: boolean;
  },
): readonly ReportSectionConfig[] {
  const enabledByDefault = new Set<ReportSectionKey>([
    'cover',
    'executive_summary',
    'dataset_overview',
    'methodology',
    'limitations_conclusion',
  ]);

  if (reportType === 'dataset_analysis') {
    if (options.hasStats) enabledByDefault.add('statistical_findings');
    if (options.hasFindings) enabledByDefault.add('insights_anomalies');
    if (options.hasCharts) enabledByDefault.add('visualizations');
    if (options.hasCase) enabledByDefault.add('investigation_case');
  } else if (reportType === 'data_quality') {
    if (options.hasFindings) enabledByDefault.add('insights_anomalies');
    if (options.hasStats) enabledByDefault.add('statistical_findings');
    if (options.hasCharts) enabledByDefault.add('visualizations');
  } else if (reportType === 'investigation_dossier') {
    if (options.hasCase) enabledByDefault.add('investigation_case');
    if (options.hasFindings) enabledByDefault.add('insights_anomalies');
    if (options.hasCharts) enabledByDefault.add('visualizations');
    if (options.hasStats) enabledByDefault.add('statistical_findings');
  } else if (reportType === 'statistical_analysis') {
    if (options.hasStats) enabledByDefault.add('statistical_findings');
    if (options.hasCharts) enabledByDefault.add('visualizations');
    if (options.hasFindings) enabledByDefault.add('insights_anomalies');
  } else {
    // custom: start with all populated core analytical sections enabled
    if (options.hasStats) enabledByDefault.add('statistical_findings');
    if (options.hasFindings) enabledByDefault.add('insights_anomalies');
    if (options.hasCharts) enabledByDefault.add('visualizations');
    if (options.hasCase) enabledByDefault.add('investigation_case');
  }

  if (options.includeAi) {
    enabledByDefault.add('ai_interpretation');
  }

  return ALL_SECTION_ORDER.map((key) => ({
    key,
    title: REPORT_SECTION_LABELS[key],
    enabled: enabledByDefault.has(key),
  }));
}

/**
 * Derives deterministic methodology entries STRICTLY for procedures that were
 * actually executed for the included sections, statistics, and findings.
 * Never invents unused analytical methods.
 */
export function deriveMethodologyItems(params: {
  readonly datasetOverview: ReportDatasetOverviewSnapshot;
  readonly numericStats: readonly NumericColumnStatistics[];
  readonly categoricalStats: readonly CategoricalColumnStatistics[];
  readonly findings: readonly ReportFindingSnapshot[];
  readonly charts: readonly ReportChartSnapshot[];
  readonly includeStatsSection: boolean;
  readonly includeFindingsSection: boolean;
  readonly includeChartsSection: boolean;
  readonly includeAiSection: boolean;
}): readonly ReportMethodologyItem[] {
  const {
    datasetOverview,
    numericStats,
    categoricalStats,
    findings,
    charts,
    includeStatsSection,
    includeFindingsSection,
    includeChartsSection,
    includeAiSection,
  } = params;

  const items: ReportMethodologyItem[] = [];

  // 1. Schema & Missing-Value Analysis (Module 03 — always run to profile dataset)
  items.push({
    id: 'method-profiling',
    name: 'Schema Profiling & Missing-Value Analysis',
    scope: `${datasetOverview.columnCount} columns across ${datasetOverview.rowCount} records`,
    description: `Deterministic column type inference, distinct-value accounting, and missing-value detection (${datasetOverview.missingValuePolicyNote}).`,
  });

  // 2. Numeric Descriptive Statistics (only if numeric stats included)
  if (includeStatsSection && numericStats.length > 0) {
    items.push({
      id: 'method-numeric-stats',
      name: 'Numeric Descriptive Statistics',
      scope: `${numericStats.length} numeric ${numericStats.length === 1 ? 'column' : 'columns'}`,
      description:
        'Exact local computation of valid counts, arithmetic mean, median (Q2), mode, minimum, maximum, range, population and sample variance/standard deviation, Q1/Q3 quartiles, and interquartile range (IQR), excluding missing and non-numeric entries.',
    });
  }

  // 3. Categorical Frequency Analysis (only if categorical stats included)
  if (includeStatsSection && categoricalStats.length > 0) {
    items.push({
      id: 'method-categorical-stats',
      name: 'Categorical Frequency Analysis',
      scope: `${categoricalStats.length} categorical ${categoricalStats.length === 1 ? 'column' : 'columns'}`,
      description:
        'Frequency counts and valid-observation percentage distributions with tie-aware identification of most and least frequent categories.',
    });
  }

  if (includeFindingsSection && findings.length > 0) {
    const hasIqr = findings.some(
      (f) => f.id.includes('iqr') || f.title.toLowerCase().includes('iqr'),
    );
    const hasZScore = findings.some(
      (f) =>
        f.id.includes('zscore') || f.title.toLowerCase().includes('z-score'),
    );
    const hasSkew = findings.some(
      (f) =>
        f.category === 'distribution' ||
        f.id.includes('skew') ||
        f.title.toLowerCase().includes('skew'),
    );
    const hasCorrelation = findings.some(
      (f) =>
        f.category === 'relationship' ||
        f.id.includes('corr') ||
        f.title.toLowerCase().includes('correlation'),
    );
    const hasDataQuality = findings.some((f) => f.category === 'data_quality');
    const hasCategoricalFinding = findings.some(
      (f) => f.category === 'categorical',
    );
    const hasStructural = findings.some((f) => f.category === 'structural');

    if (hasDataQuality) {
      items.push({
        id: 'method-dq-audit',
        name: 'Data-Quality & Completeness Diagnostics',
        scope: `${findings.filter((f) => f.category === 'data_quality').length} finding(s)`,
        description:
          'Deterministic threshold checks for elevated missing-value concentrations, column completeness disparities, and invalid numeric values.',
      });
    }

    if (hasIqr) {
      items.push({
        id: 'method-iqr',
        name: 'Tukey Interquartile Range (IQR) Outlier Detection',
        scope: `${findings.filter((f) => f.id.includes('iqr') || f.title.toLowerCase().includes('iqr')).length} finding(s)`,
        description:
          'Non-parametric fence screening using Q1 − k×IQR and Q3 + k×IQR computed from verified column quartiles. Outliers are classified separately from confirmed data-quality issues.',
      });
    }

    if (hasZScore) {
      items.push({
        id: 'method-zscore',
        name: 'Z-Score Standardized Deviation Detection',
        scope: `${findings.filter((f) => f.id.includes('zscore') || f.title.toLowerCase().includes('z-score')).length} finding(s)`,
        description:
          'Optional standardized distance screening (|z| exceeding configured σ threshold) relative to column mean and sample standard deviation.',
      });
    }

    if (hasSkew) {
      items.push({
        id: 'method-skewness',
        name: 'Distribution Shape & Skewness Analysis',
        scope: `${findings.filter((f) => f.category === 'distribution').length} finding(s)`,
        description:
          'Deterministic asymmetry and range diagnostics measuring skewness and mean–median divergence on valid numeric observations.',
      });
    }

    if (hasCorrelation) {
      items.push({
        id: 'method-pearson',
        name: 'Pearson Linear Correlation Analysis',
        scope: `${findings.filter((f) => f.category === 'relationship').length} finding(s)`,
        description:
          'Pairwise Pearson product-moment correlation (r) over complete numeric observation pairs to flag strong linear associations (without inferring causation).',
      });
    }

    if (hasCategoricalFinding || hasStructural) {
      items.push({
        id: 'method-structure-categorical',
        name: 'Category Dominance, Cardinality & Structural Checks',
        scope: `${findings.filter((f) => f.category === 'categorical' || f.category === 'structural').length} finding(s)`,
        description:
          'Rule-based detection of highly dominant categories, rare long-tail values, constant/near-constant fields, and high-cardinality columns.',
      });
    }
  }

  if (includeChartsSection && charts.length > 0) {
    const chartTypes = Array.from(new Set(charts.map((c) => c.config.type)));
    items.push({
      id: 'method-visualizations',
      name: 'Schema-Validated Visualization Preparation',
      scope: `${charts.length} embedded chart(s): ${chartTypes.join(', ')}`,
      description:
        'Charts are prepared directly from deterministic binning, frequency aggregation, ordered series preparation, and quartile definitions.',
    });
  }

  if (includeAiSection) {
    items.push({
      id: 'method-ai-synthesis',
      name: 'Aggregate-Only AI Interpretation (Optional Supplement)',
      scope: 'Explicitly selected dataset brief and case interpretations',
      description:
        'Generated strictly from bounded aggregate schema, statistical, and finding summaries (zero raw spreadsheet rows transmitted). Labeled separately as interpretation/hypothesis rather than verified evidence.',
    });
  }

  return items;
}

/**
 * Composes a neutral, strictly evidence-grounded deterministic executive summary.
 */
export function buildDeterministicExecutiveSummary(params: {
  readonly datasetOverview: ReportDatasetOverviewSnapshot;
  readonly numericStats: readonly NumericColumnStatistics[];
  readonly categoricalStats: readonly CategoricalColumnStatistics[];
  readonly findings: readonly ReportFindingSnapshot[];
  readonly investigationCase?: InvestigationCase;
}): {
  readonly deterministicSummary: string;
  readonly keyHighlights: readonly string[];
} {
  const {
    datasetOverview,
    numericStats,
    categoricalStats,
    findings,
    investigationCase,
  } = params;

  const dqCount = findings.filter(
    (f) => f.classification === 'data_quality_issue',
  ).length;
  const outlierCount = findings.filter(
    (f) => f.classification === 'statistical_outlier',
  ).length;
  const obsCount = findings.filter(
    (f) => f.classification === 'notable_observation',
  ).length;
  const highOrCritCount = findings.filter(
    (f) => f.severity === 'critical' || f.severity === 'high',
  ).length;

  const sentences: string[] = [];
  sentences.push(
    `This report documents deterministic analysis of "${datasetOverview.fileName}", containing ${datasetOverview.rowCount.toLocaleString()} records across ${datasetOverview.columnCount.toLocaleString()} columns with an overall profiling quality score of ${datasetOverview.qualityScore}/100 (Grade ${datasetOverview.qualityGrade}) and ${datasetOverview.overallMissingPercentage.toFixed(1)}% missing cells.`,
  );

  if (findings.length > 0) {
    sentences.push(
      `${findings.length} verified deterministic finding${findings.length === 1 ? '' : 's'} ${findings.length === 1 ? 'is' : 'are'} included: ${dqCount} data-quality issue${dqCount === 1 ? '' : 's'}, ${outlierCount} statistical outlier${outlierCount === 1 ? '' : 's'}, and ${obsCount} notable observation${obsCount === 1 ? '' : 's'}${highOrCritCount > 0 ? ` (${highOrCritCount} rated High or Critical severity)` : ''}.`,
    );
  } else {
    sentences.push(
      'No automated anomaly findings were included in this report scope; analytical coverage centers on dataset profiling and descriptive statistics.',
    );
  }

  if (numericStats.length > 0 || categoricalStats.length > 0) {
    sentences.push(
      `Statistical summaries cover ${numericStats.length} numeric and ${categoricalStats.length} categorical column${numericStats.length + categoricalStats.length === 1 ? '' : 's'} computed from valid non-missing observations.`,
    );
  }

  if (investigationCase) {
    sentences.push(
      `Associated investigation case ${investigationCase.id} ("${investigationCase.title}") is currently marked ${investigationCase.status.replace(/_/g, ' ')} at ${investigationCase.priority} priority with ${investigationCase.evidence.length} verified evidence reference(s) and ${investigationCase.notes.length} journal entry/entries.`,
    );
  }

  const keyHighlights: string[] = [];
  keyHighlights.push(
    `Dataset dimensions: ${datasetOverview.rowCount.toLocaleString()} rows × ${datasetOverview.columnCount.toLocaleString()} columns (${datasetOverview.fileType.toUpperCase()}).`,
  );
  keyHighlights.push(
    `Completeness & quality: ${datasetOverview.qualityScore}/100 (${datasetOverview.qualityGrade}), ${datasetOverview.totalMissingCount.toLocaleString()} missing cells (${datasetOverview.overallMissingPercentage.toFixed(1)}%).`,
  );
  if (findings.length > 0) {
    const topFindings = findings.slice(0, 3);
    for (const f of topFindings) {
      keyHighlights.push(
        `[${f.severity.toUpperCase()}] ${f.title} (${f.classification.replace(/_/g, ' ')}).`,
      );
    }
  }
  if (investigationCase?.conclusion.trim()) {
    keyHighlights.push(
      `Documented case conclusion (${investigationCase.id}): ${investigationCase.conclusion.trim()}`,
    );
  }

  return {
    deterministicSummary: sentences.join(' '),
    keyHighlights,
  };
}

/**
 * Derives authentic data limitations, analytical caveats, open questions, and
 * strictly evidence-backed conclusions. Never invents unsupported conclusions.
 */
export function deriveLimitationsAndConclusions(params: {
  readonly datasetOverview: ReportDatasetOverviewSnapshot;
  readonly numericStats: readonly NumericColumnStatistics[];
  readonly categoricalStats: readonly CategoricalColumnStatistics[];
  readonly findings: readonly ReportFindingSnapshot[];
  readonly charts: readonly ReportChartSnapshot[];
  readonly investigationCase?: InvestigationCase;
  readonly includeAi: boolean;
  readonly customLimitations?: string;
  readonly customConclusion?: string;
}): {
  readonly dataLimitations: readonly string[];
  readonly analyticalLimitations: readonly string[];
  readonly unansweredQuestions: readonly string[];
  readonly supportedConclusions: readonly string[];
} {
  const {
    datasetOverview,
    numericStats,
    categoricalStats,
    findings,
    charts,
    investigationCase,
    includeAi,
    customLimitations,
    customConclusion,
  } = params;

  const dataLimitations: string[] = [];
  if (datasetOverview.totalMissingCount > 0) {
    dataLimitations.push(
      `${datasetOverview.totalMissingCount.toLocaleString()} cells (${datasetOverview.overallMissingPercentage.toFixed(1)}%) are missing and excluded from numeric and categorical calculations.`,
    );
  }
  const totalInvalid = numericStats.reduce((sum, c) => sum + c.invalidCount, 0);
  if (totalInvalid > 0) {
    dataLimitations.push(
      `${totalInvalid.toLocaleString()} non-numeric or unparseable entries across selected numeric columns were excluded from descriptive statistics.`,
    );
  }
  const truncatedCats = categoricalStats.filter((c) => c.isDistributionTruncated);
  if (truncatedCats.length > 0) {
    dataLimitations.push(
      `${truncatedCats.length} high-cardinality categorical column(s) display top categories only; long-tail values are aggregated into omitted counts.`,
    );
  }
  const sampledCharts = charts.filter(
    (c) =>
      (c.prepared.type === 'scatter' && c.prepared.isSampled) ||
      (c.prepared.type === 'line' && c.prepared.isDownsampled),
  );
  if (sampledCharts.length > 0) {
    dataLimitations.push(
      `${sampledCharts.length} embedded visualization(s) use deterministic sampling or downsampling for readability; underlying statistics reflect all valid observations.`,
    );
  }
  if (datasetOverview.warningCount > 0) {
    dataLimitations.push(
      `Schema profiling recorded ${datasetOverview.warningCount} structural or typing warning(s) on this dataset.`,
    );
  }
  if (customLimitations && customLimitations.trim().length > 0) {
    dataLimitations.push(customLimitations.trim());
  }
  if (dataLimitations.length === 0) {
    dataLimitations.push(
      'No missing values, invalid numeric entries, or profiling warnings were observed in the included scope; external domain validation remains recommended.',
    );
  }

  const analyticalLimitations: string[] = [
    'Statistical outliers (IQR or Z-score) identify numerical extremity relative to the observed distribution and are not automatically data-entry errors.',
    'Observed associations or linear correlations (Pearson r) measure statistical co-variation and do not establish causal relationships.',
    'All report findings reflect the uploaded dataset snapshot at profiling time and do not incorporate external source-system records.',
  ];
  if (includeAi) {
    analyticalLimitations.push(
      'Included AI interpretations were synthesized solely from aggregate metadata and finding summaries (0 raw rows) and remain unverified hypotheses unless independently confirmed.',
    );
  }

  const unansweredQuestions: string[] = [];
  if (investigationCase) {
    for (const note of investigationCase.notes) {
      if (note.type === 'question') {
        unansweredQuestions.push(`[Case ${investigationCase.id}] ${note.text}`);
      }
    }
    if (includeAi) {
      for (const aiRec of investigationCase.aiAnalyses.slice(0, 2)) {
        for (const q of aiRec.data.unansweredQuestions.slice(0, 3)) {
          if (!unansweredQuestions.includes(q)) {
            unansweredQuestions.push(`[AI-identified gap] ${q}`);
          }
        }
      }
    }
  }
  if (unansweredQuestions.length === 0) {
    if (findings.some((f) => f.classification === 'statistical_outlier')) {
      unansweredQuestions.push(
        'Do flagged statistical outliers reflect legitimate extreme domain observations or upstream recording anomalies?',
      );
    }
    if (datasetOverview.totalMissingCount > 0) {
      unansweredQuestions.push(
        'Are missing values randomly distributed or systematically linked to specific collection workflows?',
      );
    }
    if (unansweredQuestions.length === 0) {
      unansweredQuestions.push(
        'No open investigative questions were logged for this report scope.',
      );
    }
  }

  const supportedConclusions: string[] = [];
  if (customConclusion && customConclusion.trim().length > 0) {
    supportedConclusions.push(customConclusion.trim());
  }
  if (investigationCase?.conclusion.trim()) {
    const cText = investigationCase.conclusion.trim();
    if (!supportedConclusions.includes(cText)) {
      supportedConclusions.push(
        `Case ${investigationCase.id} conclusion: ${cText}`,
      );
    }
  }
  if (investigationCase) {
    for (const note of investigationCase.notes) {
      if (note.type === 'conclusion') {
        const text = note.text.trim();
        if (text && !supportedConclusions.some((s) => s.includes(text))) {
          supportedConclusions.push(text);
        }
      }
    }
  }

  // Always add strictly factual deterministic summary statements grounded in observed data
  if (supportedConclusions.length === 0) {
    supportedConclusions.push(
      `Deterministic profiling confirms "${datasetOverview.fileName}" has ${datasetOverview.rowCount.toLocaleString()} records, ${datasetOverview.columnCount.toLocaleString()} columns, and an overall quality rating of ${datasetOverview.qualityScore}/100 (${datasetOverview.qualityGrade}).`,
    );
    const dqFindings = findings.filter(
      (f) => f.classification === 'data_quality_issue',
    );
    if (dqFindings.length > 0) {
      supportedConclusions.push(
        `${dqFindings.length} verified data-quality issue${dqFindings.length === 1 ? '' : 's'} require targeted remediation or documentation prior to downstream modeling.`,
      );
    }
    const outlierFindings = findings.filter(
      (f) => f.classification === 'statistical_outlier',
    );
    if (outlierFindings.length > 0) {
      supportedConclusions.push(
        `${outlierFindings.length} statistical outlier pattern${outlierFindings.length === 1 ? '' : 's'} warrant row-level review in Data Explorer to confirm domain validity.`,
      );
    }
  }

  return {
    dataLimitations,
    analyticalLimitations,
    unansweredQuestions,
    supportedConclusions,
  };
}
