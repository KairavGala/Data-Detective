import { describe, expect, it } from 'vitest';
import {
  addCaseNote,
  addEvidenceToCase,
  archiveCase,
  attachFindingToCase,
  buildCaseAiRequest,
  buildColumnEvidenceItem,
  buildStatisticEvidenceItem,
  buildVisualizationEvidenceItem,
  changeCasePriority,
  changeCaseStatus,
  createInvestigationCase,
  DEFAULT_CASE_FILTER_OPTIONS,
  deleteCaseNote,
  editCaseNote,
  filterAndSortCases,
  getRecentlyUpdatedCases,
  isSafeCaseDestinationUrl,
  partitionCasesByDataset,
  recordCaseAiAnalysis,
  removeEvidenceFromCase,
  reopenArchivedCase,
  updateCaseDetails,
} from '@/engine/cases';
import { analyzeDatasetInsights } from '@/engine/investigation';
import { profileDataset } from '@/engine/profiling';
import { analyzeDatasetStatistics } from '@/engine/statistics';
import type {
  CaseAiAnalysisRecord,
  DatasetInsight,
  ImportedDataset,
  InvestigationCase,
} from '@/types';

function buildFixture(id: string, fileName: string, profiledAt = 1_700_000_000_000) {
  const rows: unknown[][] = [];
  for (let i = 1; i <= 25; i += 1) {
    const amount = i === 25 ? 950 : 10 + (i % 6);
    rows.push([
      `ORD-${1000 + i}`,
      i <= 20 ? 'North' : i <= 24 ? 'South' : 'RareZone',
      String(amount),
      String(amount * 2 + 1),
      i <= 12 ? '' : `PRIVATE-CELL-SECRET-${i}`,
    ]);
  }

  const colNames = [
    'OrderId',
    'Region',
    'Amount',
    'CorrelatedAmount',
    'SparseNote',
  ];

  const dataset: ImportedDataset = {
    id,
    fileName,
    fileType: 'csv',
    fileSizeBytes: 2048,
    hasHeaders: true,
    importedAt: profiledAt - 1000,
    rowCount: rows.length,
    columnCount: colNames.length,
    columns: colNames.map((name, index) => ({
      id: `col-${index}`,
      name,
      originalName: name,
      index,
      wasEmptyHeader: false,
      wasDuplicateHeader: false,
    })),
    rows,
    warnings: [],
  };

  const profile = { ...profileDataset(dataset), profiledAt };
  const stats = analyzeDatasetStatistics(dataset, profile);
  const investigation = analyzeDatasetInsights(dataset, profile, stats);

  return { dataset, profile, stats, investigation };
}

describe('Module 09 — Pure Investigation Case Engine & AI Context Builder', () => {
  const fixtureA = buildFixture('ds-alpha', 'alpha_audit.csv', 1_700_000_000_000);
  const fixtureB = buildFixture('ds-beta', 'beta_audit.csv', 1_700_000_050_000);

  const primaryFinding: DatasetInsight = fixtureA.investigation.insights[0]!;
  const secondFinding: DatasetInsight = fixtureA.investigation.insights[1]!;

  it('creates cases with duplicate prevention, updates metadata, transitions status/priority, and archives/reopens cleanly', () => {
    const t0 = 1_700_000_100_000;
    const created = createInvestigationCase(
      [],
      {
        title: `Investigate ${primaryFinding.title}`,
        description: 'Initial triage of deterministic finding.',
        datasetId: fixtureA.dataset.id,
        datasetFileName: fixtureA.dataset.fileName,
        datasetProfiledAt: fixtureA.profile.profiledAt,
        initialFindings: [primaryFinding],
      },
      t0,
    );

    expect(created.created).toBe(true);
    expect(created.caseItem.id).toBe('CASE-001');
    expect(created.caseItem.status).toBe('open');
    expect(created.caseItem.archived).toBe(false);
    expect(created.caseItem.findingIds).toEqual([primaryFinding.id]);
    expect(created.caseItem.evidence).toHaveLength(1);
    expect(created.caseItem.timeline.map((e) => e.type)).toEqual([
      'case_created',
      'finding_attached',
    ]);

    // Duplicate guard 1: repeated click on same finding returns existing case without creating duplicate
    const dupFinding = createInvestigationCase(
      [created.caseItem],
      {
        title: 'Different Title Same Finding',
        datasetId: fixtureA.dataset.id,
        datasetFileName: fixtureA.dataset.fileName,
        datasetProfiledAt: fixtureA.profile.profiledAt,
        initialFindings: [primaryFinding],
      },
      t0 + 1000,
    );
    expect(dupFinding.created).toBe(false);
    expect(dupFinding.duplicateReason).toBe('duplicate_finding_case');
    expect(dupFinding.caseItem.id).toBe('CASE-001');

    // Duplicate guard 2: identical normalized title on same dataset prevented
    const dupTitle = createInvestigationCase(
      [created.caseItem],
      {
        title: `  investigate ${primaryFinding.title}  `,
        datasetId: fixtureA.dataset.id,
        datasetFileName: fixtureA.dataset.fileName,
        datasetProfiledAt: fixtureA.profile.profiledAt,
      },
      t0 + 2000,
    );
    expect(dupTitle.created).toBe(false);
    expect(dupTitle.duplicateReason).toBe('duplicate_title');

    // Rename, update description, document conclusion
    let c = updateCaseDetails(
      created.caseItem,
      {
        title: 'Renamed Revenue & Missingness Case',
        description: 'Expanded scope for executive review.',
        conclusion: 'Confirmed missingness concentrates in SparseNote.',
      },
      t0 + 3000,
    );
    expect(c.title).toBe('Renamed Revenue & Missingness Case');
    expect(c.description).toBe('Expanded scope for executive review.');
    expect(c.conclusion).toContain('SparseNote');

    // Status & priority transitions
    c = changeCaseStatus(c, 'in_progress', t0 + 4000);
    c = changeCaseStatus(c, 'under_review', t0 + 5000);
    c = changeCaseStatus(c, 'resolved', t0 + 6000);
    c = changeCasePriority(c, 'critical', t0 + 7000);
    expect(c.status).toBe('resolved');
    expect(c.priority).toBe('critical');

    // Archive and reopen
    c = archiveCase(c, t0 + 8000);
    expect(c.archived).toBe(true);
    expect(c.archivedAt).toBe(t0 + 8000);

    c = reopenArchivedCase(c, t0 + 9000);
    expect(c.archived).toBe(false);
    expect(c.status).toBe('open');
    expect(c.timeline.some((e) => e.type === 'case_archived')).toBe(true);
    expect(c.timeline.some((e) => e.type === 'case_reopened')).toBe(true);
  });

  it('manages verified evidence references without mutating source findings and rejects unsafe destinations or dataset mismatches', () => {
    const t0 = 1_700_000_200_000;
    const validFindingIds = new Set(fixtureA.investigation.insights.map((f) => f.id));
    const originalFindingSnapshot = JSON.stringify(secondFinding);

    let c = createInvestigationCase(
      [],
      {
        title: 'Evidence Board Verification',
        datasetId: fixtureA.dataset.id,
        datasetFileName: fixtureA.dataset.fileName,
        datasetProfiledAt: fixtureA.profile.profiledAt,
        initialFindings: [primaryFinding],
      },
      t0,
    ).caseItem;

    // Attach second finding as related_finding
    c = attachFindingToCase(
      c,
      secondFinding,
      fixtureA.dataset.id,
      validFindingIds,
      t0 + 1000,
      true,
    );
    expect(c.findingIds).toEqual([primaryFinding.id, secondFinding.id]);

    // Attach column, statistic, and visualization evidence
    const amountCol = fixtureA.profile.columns.find((col) => col.name === 'Amount')!;
    c = addEvidenceToCase(
      c,
      buildColumnEvidenceItem(amountCol, t0 + 2000),
      fixtureA.dataset.id,
      t0 + 2000,
    );
    c = addEvidenceToCase(
      c,
      buildStatisticEvidenceItem(amountCol, fixtureA.stats, t0 + 3000),
      fixtureA.dataset.id,
      t0 + 3000,
    );
    c = addEvidenceToCase(
      c,
      buildVisualizationEvidenceItem(
        {
          chartType: 'histogram',
          xColumnId: amountCol.columnId,
          title: 'Distribution of Amount',
        },
        'Deterministic histogram showing right-tail outlier.',
        t0 + 4000,
      ),
      fixtureA.dataset.id,
      t0 + 4000,
    );

    expect(c.evidence).toHaveLength(5);
    expect(c.evidence.map((e) => e.type)).toEqual([
      'finding',
      'related_finding',
      'column',
      'statistic',
      'visualization',
    ]);

    // Safe destination URL validation
    expect(isSafeCaseDestinationUrl('/explorer?column=col-2')).toBe(true);
    expect(isSafeCaseDestinationUrl('/analysis')).toBe(true);
    expect(isSafeCaseDestinationUrl('/visualizations?chartType=histogram')).toBe(true);
    expect(isSafeCaseDestinationUrl('https://evil.example.com/phish')).toBe(false);
    expect(isSafeCaseDestinationUrl('javascript:alert(1)')).toBe(false);

    // Reject unsafe URL in evidence attachment
    expect(() =>
      addEvidenceToCase(
        c,
        {
          id: 'ev-bad',
          type: 'column',
          title: 'Unsafe',
          sourceRef: 'bad',
          description: 'Bad link',
          addedAt: t0,
          destinationUrl: 'https://evil.example.com',
        },
        fixtureA.dataset.id,
      ),
    ).toThrow(/unsupported navigation destination/i);

    // Reject cross-dataset attachment
    expect(() =>
      attachFindingToCase(
        c,
        secondFinding,
        fixtureB.dataset.id,
        validFindingIds,
      ),
    ).toThrow(/different dataset/i);

    // Reject non-existent finding ID
    expect(() =>
      attachFindingToCase(
        c,
        { ...secondFinding, id: 'nonexistent-finding' },
        fixtureA.dataset.id,
        validFindingIds,
      ),
    ).toThrow(/does not exist in the active dataset/i);

    // Remove evidence without mutating original M07 finding
    const relatedEv = c.evidence.find((e) => e.type === 'related_finding')!;
    c = removeEvidenceFromCase(c, relatedEv.id, t0 + 5000);
    expect(c.findingIds).toEqual([primaryFinding.id]);
    expect(JSON.stringify(secondFinding)).toBe(originalFindingSnapshot);
  });

  it('manages structured journal notes and keeps AI interpretations strictly separate from verified evidence', () => {
    const t0 = 1_700_000_300_000;
    let c = createInvestigationCase(
      [],
      {
        title: 'Journal & AI Separation',
        datasetId: fixtureA.dataset.id,
        datasetFileName: fixtureA.dataset.fileName,
        datasetProfiledAt: fixtureA.profile.profiledAt,
        initialFindings: [primaryFinding],
      },
      t0,
    ).caseItem;

    const evId = c.evidence[0]!.id;

    c = addCaseNote(
      c,
      {
        type: 'observation',
        text: 'Confirmed elevated missingness in SparseNote.',
        supportingEvidenceIds: [evId, 'unknown-ev-id'],
      },
      t0 + 1000,
    );
    expect(c.notes).toHaveLength(1);
    expect(c.notes[0]!.supportingEvidenceIds).toEqual([evId]);

    const noteId = c.notes[0]!.id;
    c = editCaseNote(
      c,
      noteId,
      {
        type: 'hypothesis',
        text: 'Upstream connector may drop notes for batch orders.',
      },
      t0 + 2000,
    );
    expect(c.notes[0]!.type).toBe('hypothesis');
    expect(c.notes[0]!.text).toContain('Upstream connector');

    // Recording an AI analysis NEVER modifies verified evidence items or findingIds
    const evidenceBeforeAi = [...c.evidence];
    const aiRecord: CaseAiAnalysisRecord = {
      id: 'ai-rec-1',
      generatedAt: new Date(t0 + 3000).toISOString(),
      question: 'What does evidence suggest?',
      model: 'gemini-4-hydrogen',
      durationMs: 850,
      contextCharCount: 4100,
      data: {
        evidenceAssessment: 'Aggregate stats suggest skewed numeric distribution.',
        possibleConnections: ['Outliers may overlap with sparse notes.'],
        alternativeExplanations: ['Legitimate high-value transaction.'],
        additionalEvidenceToExamine: ['Inspect Amount histogram in Studio.'],
        supportedConclusions: ['Amount has an IQR outlier.'],
        unansweredQuestions: ['Row-level order source is not in aggregate data.'],
        supportType: 'reasonable_interpretation',
        referencedFindingIds: [primaryFinding.id],
        referencedColumnIds: ['col-2'],
        caveats: ['Aggregate-only interpretation.'],
      },
    };
    c = recordCaseAiAnalysis(c, aiRecord, fixtureA.dataset.id, t0 + 3000);
    expect(c.aiAnalyses).toHaveLength(1);
    expect(c.evidence).toEqual(evidenceBeforeAi);
    expect(c.timeline.some((e) => e.type === 'ai_analysis_generated')).toBe(true);

    // Reject AI analysis recording on wrong dataset
    expect(() =>
      recordCaseAiAnalysis(c, aiRecord, fixtureB.dataset.id, t0 + 4000),
    ).toThrow(/different dataset/i);

    c = deleteCaseNote(c, noteId, t0 + 5000);
    expect(c.notes).toHaveLength(0);
    expect(c.timeline.some((e) => e.type === 'note_deleted')).toBe(true);
  });

  it('builds strictly aggregate-only AI case requests with zero raw rows/PII and guards dataset identity & finding IDs', () => {
    const baseCase = createInvestigationCase(
      [],
      {
        title: 'Privacy & Grounding Check',
        description: 'Ensure zero raw rows leak to Gemini.',
        datasetId: fixtureA.dataset.id,
        datasetFileName: fixtureA.dataset.fileName,
        datasetProfiledAt: fixtureA.profile.profiledAt,
        initialFindings: [primaryFinding],
      },
      1_700_000_400_000,
    ).caseItem;

    // Inject a stale/invalid finding ID to verify buildCaseAiRequest filters it out
    const caseWithStaleFinding: InvestigationCase = {
      ...baseCase,
      findingIds: [...baseCase.findingIds, 'stale-invalid-finding-id'],
    };

    const built = buildCaseAiRequest({
      caseItem: caseWithStaleFinding,
      profile: fixtureA.profile,
      stats: fixtureA.stats,
      investigation: fixtureA.investigation,
      userQuestion: 'What connections are supported?',
      existingBrief: {
        datasetId: fixtureB.dataset.id, // Wrong dataset — MUST be ignored!
        profiledAt: fixtureB.profile.profiledAt,
        data: {
          brief: {
            executiveSummary: 'LEAKED-WRONG-DATASET-BRIEF',
            majorFindings: [],
            dataQualityAssessment: 'n/a',
            relationshipsAndPatterns: 'n/a',
            potentialRisks: [],
            recommendedNextSteps: [],
            confidenceAndLimitations: 'n/a',
          },
          connections: [],
          recommendations: [],
        },
      },
    });

    const serialized = JSON.stringify(built);
    // Zero raw cell values or secret row strings
    expect(serialized).not.toContain('PRIVATE-CELL-SECRET');
    expect(serialized).not.toContain('ORD-1001');
    expect(serialized).not.toContain('recordAnomalies');
    expect(serialized).not.toContain('sampleValues');
    // Wrong-dataset M08 brief must NOT be included
    expect(serialized).not.toContain('LEAKED-WRONG-DATASET-BRIEF');
    expect(built.caseInfo.priorBriefSummary).toBeUndefined();
    // Stale finding ID filtered cleanly
    expect(built.validSelectedFindingIds).toEqual([primaryFinding.id]);
    expect(built.skippedInvalidFindingIds).toEqual(['stale-invalid-finding-id']);
    expect(JSON.stringify(built.context).length).toBeLessThanOrEqual(20_000);

    // Dataset mismatch throws explicitly
    expect(() =>
      buildCaseAiRequest({
        caseItem: baseCase,
        profile: fixtureB.profile,
        stats: fixtureB.stats,
        investigation: fixtureB.investigation,
      }),
    ).toThrow(/Dataset identity mismatch/i);
  });

  it('filters, sorts, partitions by dataset identity, and extracts recently updated cases deterministically', () => {
    const t0 = 1_700_000_500_000;
    const c1 = createInvestigationCase(
      [],
      {
        title: 'Alpha High Case',
        description: 'Revenue anomaly',
        priority: 'high',
        datasetId: fixtureA.dataset.id,
        datasetFileName: fixtureA.dataset.fileName,
        datasetProfiledAt: fixtureA.profile.profiledAt,
        initialFindings: [primaryFinding],
      },
      t0,
    ).caseItem;

    let c2 = createInvestigationCase(
      [c1],
      {
        title: 'Alpha Resolved Case',
        description: 'Completed region check',
        priority: 'low',
        datasetId: fixtureA.dataset.id,
        datasetFileName: fixtureA.dataset.fileName,
        datasetProfiledAt: fixtureA.profile.profiledAt,
      },
      t0 + 1000,
    ).caseItem;
    c2 = changeCaseStatus(c2, 'resolved', t0 + 2000);

    let c3 = createInvestigationCase(
      [c1, c2],
      {
        title: 'Alpha Archived Case',
        priority: 'medium',
        datasetId: fixtureA.dataset.id,
        datasetFileName: fixtureA.dataset.fileName,
        datasetProfiledAt: fixtureA.profile.profiledAt,
      },
      t0 + 3000,
    ).caseItem;
    c3 = archiveCase(c3, t0 + 4000);

    const cOther = createInvestigationCase(
      [c1, c2, c3],
      {
        title: 'Beta Dataset Case',
        priority: 'critical',
        datasetId: fixtureB.dataset.id,
        datasetFileName: fixtureB.dataset.fileName,
        datasetProfiledAt: fixtureB.profile.profiledAt,
      },
      t0 + 5000,
    ).caseItem;

    const all = [c1, c2, c3, cOther];
    const partitioned = partitionCasesByDataset(all, fixtureA.dataset.id);
    expect(partitioned.currentDatasetCases.map((c) => c.id)).toEqual([
      c1.id,
      c2.id,
      c3.id,
    ]);
    expect(partitioned.previousDatasetCases.map((c) => c.id)).toEqual([
      cOther.id,
    ]);

    // Active vs archived filtering
    const active = filterAndSortCases(
      partitioned.currentDatasetCases,
      DEFAULT_CASE_FILTER_OPTIONS,
    );
    expect(active.map((c) => c.id)).toEqual([c2.id, c1.id]);

    const archived = filterAndSortCases(partitioned.currentDatasetCases, {
      ...DEFAULT_CASE_FILTER_OPTIONS,
      showArchived: true,
    });
    expect(archived.map((c) => c.id)).toEqual([c3.id]);

    // Unresolved findings filter
    const unresolved = filterAndSortCases(partitioned.currentDatasetCases, {
      ...DEFAULT_CASE_FILTER_OPTIONS,
      onlyWithUnresolvedFindings: true,
    });
    expect(unresolved.map((c) => c.id)).toEqual([c1.id]);

    // Search filter
    const searched = filterAndSortCases(partitioned.currentDatasetCases, {
      ...DEFAULT_CASE_FILTER_OPTIONS,
      searchQuery: 'revenue',
    });
    expect(searched.map((c) => c.id)).toEqual([c1.id]);

    // Recently updated (active only)
    expect(
      getRecentlyUpdatedCases(partitioned.currentDatasetCases, 2).map((c) => c.id),
    ).toEqual([c2.id, c1.id]);
  });
});
