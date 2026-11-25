import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppWorkspace } from '@/App';

function createCsvFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/csv' });
}

function buildAuditCsv(prefix = 'ORD'): string {
  const lines = [
    'Order ID,Region,Amount,CorrelatedAmount,SparseNote,ConstantFlag',
  ];
  for (let i = 1; i <= 25; i += 1) {
    const region = i <= 20 ? 'North' : i <= 24 ? 'South' : 'RareZone';
    const amount = i === 25 ? 950 : 10 + (i % 6);
    const corr = amount * 2 + 1;
    const sparse = i <= 12 ? '' : `SECRET-NOTE-${i}`;
    lines.push(`${prefix}-${1000 + i},${region},${amount},${corr},${sparse},ACTIVE`);
  }
  return lines.join('\n');
}

function renderWorkspace(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppWorkspace initialSkipBoot />
    </MemoryRouter>,
  );
}

describe('Module 09 — Integrated Investigation Center End-to-End Workflows', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('supports full case lifecycle, evidence board deep links, journal CRUD, AI case analysis (aggregate-only), and dataset replacement/clearing isolation', async () => {
    const user = userEvent.setup();
    const capturedCasePayloads: unknown[] = [];

    // Mock /api/ai/health and /api/ai/investigate (mode: 'brief' and mode: 'case')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/api/ai/health')) {
          return new Response(
            JSON.stringify({
              ok: true,
              configured: true,
              model: 'gemini-4-hydrogen',
              investigationEnabled: true,
              timestamp: new Date().toISOString(),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (url.includes('/api/ai/investigate') && init?.body) {
          const parsed = JSON.parse(String(init.body)) as {
            mode: string;
            context: { findings: Array<{ id: string }>; columns: Array<{ columnId: string }> };
            caseInfo?: { selectedFindingIds: string[] };
          };

          if (parsed.mode === 'case') {
            capturedCasePayloads.push(parsed);
            const firstFindingId = parsed.context.findings[0]?.id ?? '';
            const firstColId = parsed.context.columns[0]?.columnId ?? '';
            return new Response(
              JSON.stringify({
                ok: true,
                mode: 'case',
                data: {
                  evidenceAssessment:
                    'Selected aggregate findings indicate a right-tail numeric outlier in Amount alongside high SparseNote missingness.',
                  possibleConnections: [
                    'Outlier records and missing SparseNote values may share a common ingestion pipeline.',
                  ],
                  alternativeExplanations: [
                    'High Amount values may represent legitimate bulk orders.',
                  ],
                  additionalEvidenceToExamine: [
                    'Inspect Amount column in Data Explorer and compare with CorrelatedAmount.',
                  ],
                  supportedConclusions: [
                    'Deterministic IQR outlier detection confirms at least one extreme Amount observation.',
                  ],
                  unansweredQuestions: [
                    'Order source metadata is absent from aggregate summaries.',
                  ],
                  supportType: 'reasonable_interpretation',
                  referencedFindingIds: firstFindingId ? [firstFindingId] : [],
                  referencedColumnIds: firstColId ? [firstColId] : [],
                  caveats: [
                    'Interpretation derived solely from aggregate dataset summaries.',
                  ],
                },
                meta: {
                  model: 'gemini-4-hydrogen',
                  durationMs: 420,
                  generatedAt: Date.now(),
                  contextCharCount: 3800,
                  strippedInvalidFindingRefs: 0,
                  strippedInvalidColumnRefs: 0,
                  upstreamAttempts: 1,
                },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
          }

          if (parsed.mode === 'brief') {
            return new Response(
              JSON.stringify({
                ok: true,
                mode: 'brief',
                data: {
                  brief: {
                    executiveSummary:
                      'Module 08 synthesis highlights high missingness in SparseNote and a strong outlier in Amount.',
                    majorFindings: [],
                    dataQualityAssessment:
                      'Moderate reliability due to elevated missingness in SparseNote.',
                    relationshipsAndPatterns:
                      'Amount and CorrelatedAmount move together linearly in aggregate summaries.',
                    potentialRisks: ['SparseNote missingness could skew text-filtered audits.'],
                    recommendedNextSteps: ['Inspect Row #25 in Data Explorer.'],
                    confidenceAndLimitations: 'Derived solely from aggregate dataset summaries.',
                  },
                  connections: [],
                  recommendations: [
                    {
                      id: 'rec-1',
                      title: 'Audit Amount Outliers',
                      reason: 'Verify whether extreme Amount values reflect valid transactions.',
                      priority: 'high',
                      actionType: 'explore_column',
                      destinationUrl: '/explorer',
                      supportingFindingIds: parsed.context.findings[0]?.id
                        ? [parsed.context.findings[0].id]
                        : [],
                      relevantColumnIds: [],
                    },
                  ],
                },
                meta: {
                  model: 'gemini-4-hydrogen',
                  durationMs: 510,
                  generatedAt: Date.now(),
                  contextCharCount: 4200,
                  strippedInvalidFindingRefs: 0,
                  strippedInvalidColumnRefs: 0,
                  upstreamAttempts: 1,
                },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
          }
        }

        return new Response(JSON.stringify({ ok: false }), { status: 404 });
      },
    );

    renderWorkspace('/');

    // 1. Import Dataset A
    await user.upload(
      screen.getByTestId('evidence-file-input'),
      createCsvFile('dataset_alpha.csv', buildAuditCsv('ALP')),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );
    await screen.findByTestId('dataset-profiling-section');

    // 2. Generate Module 08 AI Brief first so we verify it surfaces in /investigation
    const sidebar = screen.getByTestId('desktop-sidebar');
    await user.click(within(sidebar).getByRole('link', { name: /AI Assistant/i }));
    const generateBriefBtn = await screen.findByTestId('generate-brief-button');
    await waitFor(() => expect(generateBriefBtn).toBeEnabled());
    await user.click(generateBriefBtn);
    await screen.findByText(
      /Module 08 synthesis highlights high missingness in SparseNote/i,
    );

    // 3. Navigate to /investigation — verify unified overview & Module 08 bridge
    await user.keyboard('gi');
    const workspace = await screen.findByTestId(
      'investigation-center-workspace',
    );
    expect(
      within(workspace).getByTestId('investigation-ai-intelligence-bridge'),
    ).toHaveTextContent(/Module 08 synthesis highlights high missingness/i);
    expect(
      within(workspace).getByTestId('investigation-cases-panel'),
    ).toBeInTheDocument();

    // 4. Create a Case directly from the Amount IQR outlier finding
    const iqrHeading = within(workspace).getByText(
      /IQR statistical outlier in "Amount"/i,
    );
    const iqrCard = iqrHeading.closest('article')!;
    await user.click(
      within(iqrCard).getByRole('button', { name: /Create Case/i }),
    );

    // Opens Case Detail View automatically (CASE-001)
    const caseDetail = await screen.findByTestId('investigation-case-detail');
    expect(caseDetail).toHaveAttribute('data-case-id', 'CASE-001');
    expect(caseDetail).toHaveTextContent(/IQR statistical outlier in "Amount"/i);

    // 5. Rename case & edit description, change status & priority
    await user.click(
      within(caseDetail).getByRole('button', { name: /Edit Details/i }),
    );
    const titleInput = within(caseDetail).getByLabelText('Case Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Amount Spike Audit');
    const descInput = within(caseDetail).getByLabelText('Case Description');
    await user.clear(descInput);
    await user.type(descInput, 'Investigating extreme Amount value and sparse notes.');
    await user.click(
      within(caseDetail).getByRole('button', { name: /Save Changes/i }),
    );
    expect(caseDetail).toHaveTextContent('Amount Spike Audit');

    await user.selectOptions(
      within(caseDetail).getByLabelText('Case status'),
      'in_progress',
    );
    await user.selectOptions(
      within(caseDetail).getByLabelText('Case priority'),
      'critical',
    );

    // 6. Attach additional Column + Statistic evidence in Evidence Board
    const evidenceBoard = within(caseDetail).getByTestId('case-evidence-board');
    await user.click(
      within(evidenceBoard).getByTestId('toggle-add-evidence-button'),
    );
    const picker = within(evidenceBoard).getByTestId('case-evidence-picker');
    await user.click(within(picker).getByRole('tab', { name: /Columns/i }));
    const attachColumnBtns = within(picker).getAllByRole('button', {
      name: 'Attach Column',
    });
    await user.click(attachColumnBtns[0]!);

    await user.click(within(picker).getByRole('tab', { name: /Statistics/i }));
    const attachStatBtns = within(picker).getAllByRole('button', {
      name: 'Attach Summary',
    });
    await user.click(attachStatBtns[0]!);

    // Verify Evidence Board contains Verified items and deep link to Analysis/Explorer
    expect(evidenceBoard).toHaveTextContent(/VERIFIED · Automated Finding/i);
    expect(evidenceBoard).toHaveTextContent(/VERIFIED · Dataset Column/i);
    expect(evidenceBoard).toHaveTextContent(/VERIFIED · Statistical Summary/i);
    expect(
      within(evidenceBoard).getByRole('link', { name: /Open in Explorer/i }),
    ).toHaveAttribute('href', expect.stringContaining('/explorer?column='));
    expect(
      within(evidenceBoard).getByRole('link', { name: /View Statistics/i }),
    ).toHaveAttribute('href', '/analysis');

    // 7. Add, edit, and save notes in Investigation Journal
    const journal = within(caseDetail).getByTestId('case-journal-panel');
    await user.click(within(journal).getByRole('radio', { name: 'Hypothesis' }));
    await user.type(
      within(journal).getByLabelText('Journal entry text'),
      'Row 25 outlier might be a decimal entry error.',
    );
    await user.click(
      within(journal).getByRole('button', { name: /Add Hypothesis/i }),
    );
    expect(journal).toHaveTextContent(/UNVERIFIED HYPOTHESIS/i);
    expect(journal).toHaveTextContent(/decimal entry error/i);

    // Edit note
    await user.click(
      within(journal).getByRole('button', { name: /Edit Hypothesis note/i }),
    );
    const editArea = within(journal).getByLabelText('Edit note text');
    await user.clear(editArea);
    await user.type(editArea, 'Refined hypothesis: bulk order entry error.');
    await user.click(
      within(journal).getByRole('button', { name: /Save Note/i }),
    );
    expect(journal).toHaveTextContent(/Refined hypothesis/i);

    // 8. Run AI Case Investigation ("Analyze this investigation")
    const aiPanel = within(caseDetail).getByTestId('case-ai-analysis-panel');
    const analyzeBtn = within(aiPanel).getByTestId('analyze-case-button');
    await waitFor(() => expect(analyzeBtn).toBeEnabled());
    await user.click(analyzeBtn);

    expect(
      await within(aiPanel).findByText(
        /AI INTERPRETATION \/ HYPOTHESIS \(NOT VERIFIED EVIDENCE\)/i,
      ),
    ).toBeInTheDocument();
    expect(aiPanel).toHaveTextContent(/What Selected Evidence Suggests/i);
    expect(aiPanel).toHaveTextContent(/Possible Connections/i);
    expect(aiPanel).toHaveTextContent(/Alternative Explanations/i);
    expect(aiPanel).toHaveTextContent(/Supported Aggregate Conclusions/i);
    expect(aiPanel).toHaveTextContent(/Additional Evidence to Examine/i);
    expect(aiPanel).toHaveTextContent(/Unanswered Questions/i);

    // Verify zero raw spreadsheet rows or secret cell strings were sent to /api/ai/investigate
    expect(capturedCasePayloads).toHaveLength(1);
    const serializedCasePayload = JSON.stringify(capturedCasePayloads[0]);
    expect(serializedCasePayload).not.toContain('SECRET-NOTE-');
    expect(serializedCasePayload).not.toContain('ALP-1001');
    expect(serializedCasePayload).not.toContain('recordAnomalies');

    // Explicit save as unverified hypothesis note works without touching verified evidence
    const evidenceCountBeforeSave =
      within(evidenceBoard).getAllByRole('article').length;
    await user.click(
      within(aiPanel).getByRole('button', {
        name: /Save as Unverified Hypothesis Note/i,
      }),
    );
    expect(journal).toHaveTextContent(/\[AI-assisted hypothesis — unverified\]/i);
    expect(within(evidenceBoard).getAllByRole('article')).toHaveLength(
      evidenceCountBeforeSave,
    );

    // 9. Verify Chronological Activity Timeline logged lifecycle events
    const timeline = within(caseDetail).getByTestId('case-timeline-panel');
    expect(timeline).toHaveTextContent(/AI case interpretation generated/i);
    expect(timeline).toHaveTextContent(/Priority changed to Critical/i);
    expect(timeline).toHaveTextContent(/Status changed to In Progress/i);
    expect(timeline).toHaveTextContent(/Case created/i);

    // 10. Archive and reopen case
    await user.click(
      within(caseDetail).getByRole('button', { name: /Archive Case/i }),
    );
    expect(
      within(caseDetail).getByRole('button', { name: /Reopen Case/i }),
    ).toBeInTheDocument();
    await user.click(
      within(caseDetail).getByRole('button', { name: /Reopen Case/i }),
    );
    expect(
      within(caseDetail).getByRole('button', { name: /Archive Case/i }),
    ).toBeInTheDocument();

    // 11. Navigate back to Overview and confirm case appears + search works
    await user.click(within(caseDetail).getByTestId('back-to-overview-button'));
    const casesPanel = await screen.findByTestId('investigation-cases-panel');
    expect(
      within(casesPanel).getByTestId('case-card-CASE-001'),
    ).toHaveTextContent('Amount Spike Audit');

    // 12. Replace Dataset A with Dataset B -> CASE-001 moves to Previous Dataset Cases (Read-Only)
    await user.keyboard('go');
    const alphaBanner = await screen.findByRole('region', {
      name: 'Active imported dataset',
    });
    await user.click(
      within(alphaBanner).getByRole('button', { name: 'Load Another File' }),
    );
    await user.upload(
      await screen.findByTestId('evidence-file-input'),
      createCsvFile('dataset_beta.csv', buildAuditCsv('BET')),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );
    const confirmDialog = await screen.findByRole('dialog', {
      name: /Replace active dataset/i,
    });
    await user.click(
      within(confirmDialog).getByRole('button', { name: 'Replace Dataset' }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: 'Active imported dataset' }),
      ).toHaveTextContent('dataset_beta.csv');
    });

    await user.keyboard('gi');
    const betaWorkspace = await screen.findByTestId(
      'investigation-center-workspace',
    );
    const prevSection = within(betaWorkspace).getByTestId(
      'previous-dataset-cases-section',
    );
    expect(prevSection).toHaveTextContent('CASE-001');
    expect(prevSection).toHaveTextContent('dataset_alpha.csv');

    // Opening previous-dataset case shows mismatch warning banner & locks AI/evidence addition
    await user.click(
      within(prevSection).getByRole('button', { name: /Review \(Read-Only\)/i }),
    );
    const mismatchDetail = await screen.findByTestId(
      'investigation-case-detail',
    );
    expect(
      within(mismatchDetail).getByTestId('case-dataset-mismatch-banner'),
    ).toHaveTextContent(/Previous Dataset Case · Identity Mismatch/i);
    expect(
      within(mismatchDetail).getByTestId('toggle-add-evidence-button'),
    ).toBeDisabled();
    expect(
      within(mismatchDetail).getByTestId('analyze-case-button'),
    ).toBeDisabled();

    // 13. Clear dataset -> /investigation shows empty active state without presenting stale active findings
    await user.keyboard('go');
    const activeBanner = await screen.findByRole('region', {
      name: 'Active imported dataset',
    });
    await user.click(
      within(activeBanner).getByRole('button', { name: 'Clear Dataset' }),
    );
    await user.click(
      within(activeBanner).getByRole('button', { name: 'Confirm Clear' }),
    );

    await user.keyboard('gi');
    const emptyState = await screen.findByTestId(
      'investigation-no-dataset-state',
    );
    expect(emptyState).toHaveTextContent(/No Active Dataset/i);
    expect(
      screen.queryByTestId('investigation-center-workspace'),
    ).not.toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalled();
  });
});
