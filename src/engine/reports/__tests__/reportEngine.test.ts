import { describe, expect, it } from 'vitest';
import {
  addCaseNote,
  createInvestigationCase,
  recordCaseAiAnalysis,
  updateCaseDetails,
} from '@/engine/cases';
import { analyzeDatasetInsights } from '@/engine/investigation';
import { profileDataset } from '@/engine/profiling';
import {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  compileReportDocument,
  createReportFromSources,
  deleteReportById,
  duplicateReport,
  generateReportPdf,
  partitionReportsByDataset,
  refreshReportSnapshot,
  reorderReportSections,
  toggleReportSection,
  updateReportMetadata,
  updateReportSectionTitle,
  updateReportSelections,
  type ActiveReportSources,
} from '@/engine/reports';
import { analyzeDatasetStatistics } from '@/engine/statistics';
import {
  generateChartRecommendations,
  recommendationToChartConfig,
} from '@/engine/visualization';
import type {
  AiBriefGenerationData,
  CaseAiAnalysisRecord,
  ChartConfig,
  ImportedDataset,
  InvestigationCase,
} from '@/types';

const SECRET_CELL_TOKEN = 'CONFIDENTIAL_RAW_ROW_SECRET_774411';

function buildRichDataset(
  id: string,
  fileName: string,
  extraColumnCount = 0,
): ActiveReportSources {
  const extraHeaders = Array.from(
    { length: extraColumnCount },
    (_, i) => `MetricCol_${String(i + 1).padStart(2, '0')}`,
  );
  const headers = [
    'RecordID',
    'Region',
    'OrderDate',
    'Amount',
    'CorrelatedAmount',
    'SparseNote',
    'ConstantFlag',
    ...extraHeaders,
  ];
  const rows: unknown[][] = [];

  for (let i = 1; i <= 32; i += 1) {
    const region = i <= 24 ? 'North' : i <= 30 ? 'South' : 'RareZone';
    const month = String(((i - 1) % 12) + 1).padStart(2, '0');
    const day = String(((i - 1) % 28) + 1).padStart(2, '0');
    const orderDate = `2025-${month}-${day}`;
    const amount = i === 32 ? 9850 : 40 + (i % 7) * 5;
    const correlated = amount * 2 + 12;
    const sparse =
      i <= 16
        ? ''
        : i === 32
          ? `Free text audit commentary containing ${SECRET_CELL_TOKEN} for manual review on line 32`
          : `Detailed free text review comment recorded for entry number ${i} in ledger`;
    const extras = extraHeaders.map((_, colIdx) => (i * (colIdx + 3)) % 97);
    rows.push([
      `REC-${1000 + i}`,
      region,
      orderDate,
      amount,
      correlated,
      sparse,
      'ACTIVE',
      ...extras,
    ]);
  }

  const dataset: ImportedDataset = {
    id,
    fileName,
    fileType: 'csv',
    fileSizeBytes: 8192,
    importedAt: 1_735_000_000_000,
    hasHeaders: true,
    rowCount: rows.length,
    columnCount: headers.length,
    columns: headers.map((name, idx) => ({
      id: `col-${idx}`,
      name,
      originalName: name,
      index: idx,
      wasEmptyHeader: false,
      wasDuplicateHeader: false,
    })),
    rows,
    warnings: [],
  };

  const profile = profileDataset(dataset);
  const stats = analyzeDatasetStatistics(dataset, profile);
  const investigation = analyzeDatasetInsights(dataset, profile, stats);

  // Build an M09 investigation case bound strictly to this dataset
  const createdCaseRes = createInvestigationCase([], {
    title: 'Q4 High-Value Amount Outlier & Missingness Audit',
    description:
      'Investigating extreme right-tail Amount values alongside 50% missingness in SparseNote.',
    priority: 'high',
    datasetId: dataset.id,
    datasetFileName: dataset.fileName,
    datasetProfiledAt: profile.profiledAt,
    initialFindings: investigation.insights.slice(0, 3),
  });

  let activeCase: InvestigationCase = createdCaseRes.caseItem;
  activeCase = addCaseNote(activeCase, {
    type: 'observation',
    text: 'Deterministic IQR detection flagged an extreme Amount observation at 9850.',
  });
  activeCase = addCaseNote(activeCase, {
    type: 'hypothesis',
    text: 'SparseNote blanks may correspond to automated batch imports lacking manual comments.',
  });
  activeCase = updateCaseDetails(activeCase, {
    conclusion:
      'Verified IQR outlier in Amount and confirmed high missingness in SparseNote; source pipeline requires upstream audit.',
  });

  const caseAiRecord: CaseAiAnalysisRecord = {
    id: 'CAI-001',
    generatedAt: new Date(1_735_000_120_000).toISOString(),
    question: 'Assess the attached Amount outlier and SparseNote missingness evidence.',
    model: 'gemini-2.5-flash',
    durationMs: 380,
    data: {
      evidenceAssessment:
        'Aggregate findings confirm a pronounced right-tail Amount outlier alongside elevated missingness in SparseNote.',
      possibleConnections: [
        'Elevated SparseNote missingness and extreme Amount values may co-occur in batch transactions.',
      ],
      alternativeExplanations: [
        'The extreme Amount observation may represent a legitimate bulk enterprise invoice.',
      ],
      additionalEvidenceToExamine: [
        'Review Amount distribution in Visualization Studio and inspect OrderDate chronology.',
      ],
      supportedConclusions: [
        'Amount contains a verified statistical outlier under standard Tukey 1.5x IQR bounds.',
      ],
      unansweredQuestions: [
        'Upstream ingestion source identifiers are not present in aggregate summaries.',
      ],
      referencedFindingIds: investigation.insights.slice(0, 2).map((f) => f.id),
      referencedColumnIds: stats.numericColumns.slice(0, 2).map((c) => c.columnId),
      supportType: 'reasonable_interpretation',
      caveats: [
        'Based strictly on aggregate summaries without inspecting raw rows.',
      ],
    },
  };
  activeCase = recordCaseAiAnalysis(activeCase, caseAiRecord, dataset.id);

  const aiBriefData: AiBriefGenerationData = {
    brief: {
      executiveSummary:
        'Aggregate summaries highlight a strongly skewed Amount distribution with an extreme right-tail outlier and substantial missingness in SparseNote.',
      majorFindings: [],
      dataQualityAssessment:
        'SparseNote exhibits 50% missingness while ConstantFlag has zero variance.',
      relationshipsAndPatterns:
        'Amount and CorrelatedAmount move together linearly across observations.',
      potentialRisks: ['SparseNote missingness may skew comment-based audits.'],
      recommendedNextSteps: ['Audit batch ingestion rules for SparseNote.'],
      confidenceAndLimitations:
        'Generated strictly from aggregate statistics without raw row inspection.',
    },
    connections: [
      {
        id: 'CONN-001',
        title: 'Right-Tail Amount Outlier & Linear Co-Movement',
        findingIds: investigation.insights.slice(0, 2).map((f) => f.id),
        columnIds: stats.numericColumns.slice(0, 2).map((c) => c.columnId),
        evidenceSummary:
          'Both numeric series exhibit synchronized extreme high values.',
        possibleInterpretation:
          'CorrelatedAmount appears derived directly from Amount, propagating outliers proportionally.',
        alternativeExplanations: [
          'A legitimate bulk transaction may explain the extreme pair.',
        ],
        confidence: 'moderate',
        suggestedInvestigation:
          'Compare Amount and CorrelatedAmount in Visualization Studio.',
      },
    ],
    recommendations: [],
  };

  return {
    dataset,
    profile,
    stats,
    investigation,
    activeCases: [activeCase],
    verifiedAiBrief: {
      datasetId: dataset.id,
      profiledAt: profile.profiledAt,
      data: aiBriefData,
      meta: {
        model: 'gemini-2.5-flash',
        durationMs: 420,
        sdkAttemptsConfigured: 1,
        generatedAt: new Date(1_735_000_100_000).toISOString(),
        contextCharCount: 2400,
        strippedInvalidFindingRefs: 0,
        strippedInvalidColumnRefs: 0,
      },
    },
  };
}

function buildAllFiveChartConfigs(sources: ActiveReportSources): ChartConfig[] {
  const recs = generateChartRecommendations(sources.profile, sources.stats).slice(0, 8);
  const configs: ChartConfig[] = recs.map((r) => recommendationToChartConfig(r));

  const regionCol = sources.profile.columns.find((c) => c.name === 'Region');
  const dateCol = sources.profile.columns.find((c) => c.name === 'OrderDate');
  const amountCol = sources.profile.columns.find((c) => c.name === 'Amount');
  const corrCol = sources.profile.columns.find(
    (c) => c.name === 'CorrelatedAmount',
  );

  const explicit: ChartConfig[] = [];
  if (regionCol) {
    explicit.push({
      id: 'cfg-bar',
      type: 'bar',
      xColumnId: regionCol.columnId,
      title: 'Region Frequency Distribution',
      xAxisLabel: 'Region',
      yAxisLabel: 'Count',
      categorySort: 'freq_desc',
      maxCategories: 10,
      showLegend: false,
    });
  }
  if (amountCol) {
    explicit.push({
      id: 'cfg-hist',
      type: 'histogram',
      xColumnId: amountCol.columnId,
      title: 'Amount Histogram Distribution',
      xAxisLabel: 'Amount',
      yAxisLabel: 'Frequency',
      categorySort: 'freq_desc',
      maxCategories: 10,
      binCount: 8,
      showLegend: false,
    });
    explicit.push({
      id: 'cfg-box',
      type: 'boxplot',
      xColumnId: amountCol.columnId,
      title: 'Amount Quartile Box Plot',
      xAxisLabel: 'Amount',
      yAxisLabel: '',
      categorySort: 'freq_desc',
      maxCategories: 10,
      showLegend: false,
    });
  }
  if (dateCol && amountCol) {
    explicit.push({
      id: 'cfg-line',
      type: 'line',
      xColumnId: dateCol.columnId,
      yColumnId: amountCol.columnId,
      title: 'Amount Trend Over OrderDate',
      xAxisLabel: 'OrderDate',
      yAxisLabel: 'Amount',
      categorySort: 'freq_desc',
      maxCategories: 10,
      showLegend: false,
    });
  }
  if (amountCol && corrCol) {
    explicit.push({
      id: 'cfg-scatter',
      type: 'scatter',
      xColumnId: amountCol.columnId,
      yColumnId: corrCol.columnId,
      title: 'Amount vs CorrelatedAmount Scatter',
      xAxisLabel: 'Amount',
      yAxisLabel: 'CorrelatedAmount',
      categorySort: 'freq_desc',
      maxCategories: 10,
      showLegend: false,
    });
  }

  return explicit.length >= 5 ? explicit : [...explicit, ...configs];
}

describe('Module 10 — Report Engine, Data Integrity & Real Multi-Page A4 PDF Export', () => {
  it('creates deterministic dataset & case reports, supports editing, reordering, duplication, deletion, and enforces strict dataset identity isolation', () => {
    const sourcesA = buildRichDataset('ds-alpha', 'alpha_ledger.csv');
    const sourcesB = buildRichDataset('ds-beta', 'beta_audit.csv');
    const caseA = sourcesA.activeCases[0]!;
    const chartsA = buildAllFiveChartConfigs(sourcesA);

    // 1. Create Dataset Analysis Report (without AI)
    const dsReport = createReportFromSources(
      [],
      {
        reportType: 'dataset_analysis',
        sourceKind: 'dataset',
        author: 'Lead Forensic Analyst',
        selectedCharts: chartsA.slice(0, 2),
      },
      sourcesA,
      1_735_000_200_000,
    );

    expect(dsReport.id).toBe('RPT-001');
    expect(dsReport.datasetId).toBe('ds-alpha');
    expect(dsReport.aiInclusion.includeModule08Brief).toBe(false);
    expect(dsReport.snapshot.charts.length).toBe(2);

    // 2. Create Investigation Dossier from M09 Case
    const caseReport = createReportFromSources(
      [dsReport],
      {
        reportType: 'investigation_dossier',
        sourceKind: 'case',
        caseId: caseA.id,
        selectedCharts: chartsA,
        aiInclusion: {
          includeModule08Brief: true,
          includeModule09CaseAnalyses: true,
        },
      },
      sourcesA,
      1_735_000_300_000,
    );

    expect(caseReport.id).toBe('RPT-002');
    expect(caseReport.caseId).toBe(caseA.id);
    expect(caseReport.snapshot.caseSnapshot?.id).toBe(caseA.id);
    expect(caseReport.snapshot.module08Brief?.datasetId).toBe('ds-alpha');

    // 3. Reject cross-dataset case binding & cross-dataset snapshot refresh
    const sourcesBWithForeignCase: ActiveReportSources = {
      ...sourcesB,
      activeCases: [caseA],
    };
    expect(() =>
      createReportFromSources(
        [dsReport, caseReport],
        {
          reportType: 'investigation_dossier',
          sourceKind: 'case',
          caseId: caseA.id,
        },
        sourcesBWithForeignCase,
      ),
    ).toThrow(/previous dataset/i);

    expect(() => refreshReportSnapshot(caseReport, sourcesB)).toThrow(
      /different dataset identity/i,
    );

    // 4. Section reordering, visibility toggling, heading edits, metadata & selection updates
    let edited = updateReportMetadata(dsReport, {
      title: 'Custom Q4 Audit Brief',
      subtitle: 'Executive Verification Dossier',
      customLimitations: 'Excludes off-ledger adjustments.',
      customConclusion: 'Proceed with vendor billing reconciliation.',
    });
    expect(edited.title).toBe('Custom Q4 Audit Brief');

    edited = updateReportSectionTitle(
      edited,
      'executive_summary',
      'Management Summary',
    );
    expect(
      edited.sections.find((s) => s.key === 'executive_summary')?.title,
    ).toBe('Management Summary');

    const origSecondKey = edited.sections[1]!.key;
    const origThirdKey = edited.sections[2]!.key;
    edited = reorderReportSections(edited, 1, 2);
    expect(edited.sections[1]!.key).toBe(origThirdKey);
    expect(edited.sections[2]!.key).toBe(origSecondKey);

    edited = toggleReportSection(edited, 'statistical_findings', false);
    const compiledNoStats = compileReportDocument(edited, sourcesA);
    // Methodology honesty: statistical procedure must NOT be claimed when disabled
    expect(
      compiledNoStats.methodology.some((m) => m.id === 'descriptive_stats'),
    ).toBe(false);
    expect(
      compiledNoStats.methodology.some((m) => m.id === 'ai_interpretation'),
    ).toBe(false);

    // Update selections
    edited = updateReportSelections(
      edited,
      { selectedFindingIds: sourcesA.investigation.insights.slice(0, 1).map((f) => f.id) },
      sourcesA,
    );
    expect(edited.selectedFindingIds).toHaveLength(1);

    // 5. Duplication, partitioning across dataset switch, and deletion
    const duplicated = duplicateReport([edited, caseReport], caseReport);
    expect(duplicated.id).toBe('RPT-003');
    expect(duplicated.title).toContain('(Copy)');

    const partitioned = partitionReportsByDataset(
      [edited, caseReport, duplicated],
      'ds-beta',
    );
    expect(partitioned.currentDatasetReports).toHaveLength(0);
    expect(partitioned.previousDatasetReports).toHaveLength(3);

    // Compiling a previous-dataset report against a new active dataset isolates its frozen snapshot
    const isolatedCompiled = compileReportDocument(caseReport, sourcesB);
    expect(isolatedCompiled.isActiveDatasetMatch).toBe(false);
    expect(isolatedCompiled.datasetOverview.fileName).toBe('alpha_ledger.csv');

    const remaining = deleteReportById([edited, caseReport, duplicated], 'RPT-003');
    expect(remaining).toHaveLength(2);
    expect(remaining.some((r) => r.id === 'RPT-003')).toBe(false);
  });

  it('preserves exact M03/M04/M07 metrics, classifies findings accurately, and NEVER leaks raw spreadsheet row values', () => {
    const sources = buildRichDataset('ds-integrity', 'integrity_check.csv');
    const charts = buildAllFiveChartConfigs(sources);

    const report = createReportFromSources(
      [],
      {
        reportType: 'investigation_dossier',
        sourceKind: 'case',
        caseId: sources.activeCases[0]!.id,
        selectedCharts: charts,
        aiInclusion: {
          includeModule08Brief: true,
          includeModule09CaseAnalyses: true,
        },
      },
      sources,
    );

    const compiled = compileReportDocument(report, sources);

    // Exact M03 & M04 parity
    expect(compiled.datasetOverview.rowCount).toBe(sources.profile.rowCount);
    expect(compiled.datasetOverview.columnCount).toBe(
      sources.profile.columnCount,
    );
    expect(compiled.datasetOverview.qualityScore).toBe(
      sources.profile.quality.overallScore,
    );

    const amountStat = compiled.numericStats.find((c) => c.name === 'Amount');
    const sourceAmountStat = sources.stats.numericColumns.find(
      (c) => c.name === 'Amount',
    );
    expect(amountStat).toBeDefined();
    expect(amountStat?.mean).toBe(sourceAmountStat?.mean);
    expect(amountStat?.median).toBe(sourceAmountStat?.median);
    expect(amountStat?.iqr).toBe(sourceAmountStat?.iqr);

    // Raw row secret value and row-level identifier must NEVER appear anywhere in report state or compiled document
    const serializedReport = JSON.stringify(report);
    const serializedCompiled = JSON.stringify(compiled);
    expect(serializedReport).not.toContain(SECRET_CELL_TOKEN);
    expect(serializedCompiled).not.toContain(SECRET_CELL_TOKEN);
    expect(serializedReport).not.toContain('REC-1032');
    expect(serializedCompiled).not.toContain('REC-1032');
  });

  it('generates a REAL multi-page A4 PDF (unmocked) with exact A4 MediaBox, cover page, running page numbers, all 5 vector charts, wrapped long tables, long headings, and zero raw row leakage', () => {
    // 28 extra numeric columns stress-tests multi-page table wrapping & repeated table headers
    const sources = buildRichDataset('ds-pdf-real', 'enterprise_forensic_ledger.csv', 28);
    const charts = buildAllFiveChartConfigs(sources);
    expect(charts.length).toBeGreaterThanOrEqual(5);

    const longTitle =
      'Comprehensive Multi-Department Forensic Ledger Investigation & Statistical Anomaly Dossier (Fiscal Year 2025 Audit)';

    let report = createReportFromSources(
      [],
      {
        title: longTitle,
        subtitle:
          'Deterministic profiling, statistical diagnostics, schema-validated charts, investigation journal, and labeled interpretive notes',
        author: 'Data Detective Audit Unit',
        introDescription:
          'Compiled directly from verified browser-side analytical engines without external database or server dependencies.',
        reportType: 'investigation_dossier',
        sourceKind: 'case',
        caseId: sources.activeCases[0]!.id,
        selectedCharts: charts,
        aiInclusion: {
          includeModule08Brief: true,
          includeModule09CaseAnalyses: true,
        },
      },
      sources,
      1_735_100_000_000,
    );

    // Stress test long custom section heading
    report = updateReportSectionTitle(
      report,
      'insights_anomalies',
      'Automated Deterministic Insights, Data-Quality Defects & Statistical Outlier Classifications',
    );

    const compiled = compileReportDocument(report, sources);

    // REAL PDF GENERATION — NOT MOCKED
    const pdfResult = generateReportPdf(compiled);

    expect(pdfResult.bytes).toBeInstanceOf(Uint8Array);
    expect(pdfResult.bytes.byteLength).toBeGreaterThan(15_000);
    expect(pdfResult.blob.type).toBe('application/pdf');
    expect(pdfResult.fileName).toMatch(/^rpt-001-.*\.pdf$/);
    expect(pdfResult.pageCount).toBeGreaterThanOrEqual(5);

    // Inspect actual PDF binary stream structure (jsPDF runs with compress: false)
    const pdfRawText = new TextDecoder('latin1').decode(pdfResult.bytes);

    // 1. Valid PDF header and EOF trailer
    expect(pdfRawText.startsWith('%PDF-')).toBe(true);
    expect(pdfRawText.trimEnd().endsWith('%%EOF')).toBe(true);

    // 2. Exact A4 portrait dimensions (595.28 x 841.89 pt)
    const mediaBoxMatch = /\/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*\]/.exec(
      pdfRawText,
    );
    expect(mediaBoxMatch).not.toBeNull();
    expect(Number(mediaBoxMatch![1])).toBeCloseTo(A4_WIDTH_PT, 2);
    expect(Number(mediaBoxMatch![2])).toBeCloseTo(A4_HEIGHT_PT, 2);

    // 3. Running pagination markers across pages (cover page 1 omitted, content pages 2..N numbered)
    expect(pdfRawText).toContain(`Page 2 of ${pdfResult.pageCount}`);
    expect(pdfRawText).toContain(
      `Page ${pdfResult.pageCount} of ${pdfResult.pageCount}`,
    );

    // 4. Required document structure & real analytical content
    expect(pdfRawText).toContain('DATA DETECTIVE');
    expect(pdfRawText).toContain('enterprise_forensic_ledger.csv');
    expect(pdfRawText).toContain(sources.activeCases[0]!.id);
    expect(pdfRawText).toContain('Data Detective Audit Unit');
    expect(pdfRawText).toContain('Executive Summary');
    expect(pdfRawText).toContain('Dataset Overview');
    expect(pdfRawText).toContain('Methodology');
    expect(pdfRawText).toContain('Statistical Findings');
    expect(pdfRawText).toContain('Visualizations');
    expect(pdfRawText).toContain('Investigation Case');
    expect(pdfRawText).toContain('AI Interpretation');
    expect(pdfRawText).toContain('Limitations & Conclusion');

    // 5. All 5 embedded vector charts present with figure labels & vector geometry
    expect(pdfRawText).toContain('Figure 1.');
    expect(pdfRawText).toContain('Figure 2.');
    expect(pdfRawText).toContain('Figure 3.');
    expect(pdfRawText).toContain('Figure 4.');
    expect(pdfRawText).toContain('Figure 5.');
    expect(pdfRawText).toContain('re\nf'); // vector filled rectangles (bars / histogram / boxplot)

    // 6. Epistemic separation notices present in PDF (drawCalloutBox renders callout headers uppercase)
    expect(pdfRawText).toContain('EPISTEMIC NOTICE');
    expect(pdfRawText).toContain('NOT VERIFIED EVIDENCE');
    expect(pdfRawText).toContain('UNVERIFIED HYPOTHESIS');

    // 7. Strict privacy: raw row secret and row-level identifiers must NEVER leak into exported PDF
    expect(pdfRawText).not.toContain(SECRET_CELL_TOKEN);
    expect(pdfRawText).not.toContain('REC-1032');
  });

  it('exports a complete A4 PDF offline WITHOUT any AI brief or Gemini availability', () => {
    const sources = buildRichDataset('ds-offline', 'offline_only.csv');
    const sourcesWithoutAi: ActiveReportSources = {
      ...sources,
      verifiedAiBrief: null,
    };

    const report = createReportFromSources(
      [],
      {
        reportType: 'data_quality',
        sourceKind: 'dataset',
        selectedCharts: buildAllFiveChartConfigs(sourcesWithoutAi).slice(0, 1),
      },
      sourcesWithoutAi,
    );

    const compiled = compileReportDocument(report, sourcesWithoutAi);
    expect(compiled.aiInterpretations.module08Brief).toBeUndefined();
    expect(compiled.aiInterpretations.module09CaseAnalyses).toHaveLength(0);

    const pdfResult = generateReportPdf(compiled);
    const pdfRawText = new TextDecoder('latin1').decode(pdfResult.bytes);

    expect(pdfRawText.startsWith('%PDF-')).toBe(true);
    const offlineMediaBox =
      /\/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*\]/.exec(pdfRawText);
    expect(offlineMediaBox).not.toBeNull();
    expect(Number(offlineMediaBox![1])).toBeCloseTo(A4_WIDTH_PT, 2);
    expect(Number(offlineMediaBox![2])).toBeCloseTo(A4_HEIGHT_PT, 2);
    expect(pdfResult.pageCount).toBeGreaterThanOrEqual(2);
    expect(pdfRawText).toContain('offline_only.csv');
    expect(pdfRawText).not.toContain('EPISTEMIC NOTICE');
  });
});
