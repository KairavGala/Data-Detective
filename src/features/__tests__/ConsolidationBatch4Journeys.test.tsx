import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppWorkspace } from '@/App';
import { DatasetProfilingClient, profileDataset } from '@/engine/profiling';
import {
  getChartConfigSignature,
  validateChartConfigsForDataset,
} from '@/engine/reports';
import { analyzeDatasetStatistics } from '@/engine/statistics';
import { resetAssistantSessionCache } from '@/features/assistant';
import type { ChartConfig, ImportedColumn, ImportedDataset } from '@/types';

function createCsvFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/csv' });
}

function buildJourneyCsv(prefix: string, rowCount = 26): string {
  const lines = ['OrderID,Region,Amount,CorrelatedAmount,SparseNote'];
  for (let i = 1; i <= rowCount; i += 1) {
    const region = i % 5 === 0 ? 'West' : i % 3 === 0 ? 'South' : 'North';
    const amount = i === rowCount ? 9800 : 40 + (i % 7) * 6;
    const corr = amount * 2 + 3;
    const sparse = i <= Math.floor(rowCount / 2) ? '' : `SECRET_${prefix}_${i}`;
    lines.push(`${prefix}-${1000 + i},${region},${amount},${corr},${sparse}`);
  }
  return lines.join('\n');
}

function buildSyntheticDataset(id = 'ds-unit-1'): ImportedDataset {
  const headers = ['OrderID', 'Region', 'Amount', 'Units'];
  const columns: ImportedColumn[] = headers.map((name, index) => ({
    id: `col-${index}`,
    name,
    originalName: name,
    index,
    wasEmptyHeader: false,
    wasDuplicateHeader: false,
  }));
  const rows: unknown[][] = [];
  for (let i = 1; i <= 20; i += 1) {
    rows.push([
      `ORD-${i}`,
      i % 2 === 0 ? 'North' : 'South',
      100 + i * 10,
      2 + (i % 5),
    ]);
  }
  return {
    id,
    fileName: 'unit_ledger.csv',
    fileType: 'csv',
    fileSizeBytes: 1024,
    hasHeaders: true,
    importedAt: Date.now(),
    rowCount: rows.length,
    columnCount: columns.length,
    columns,
    rows,
    warnings: [],
  };
}

function renderWorkspace(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppWorkspace initialSkipBoot />
    </MemoryRouter>,
  );
}

/**
 * Helper button rendered inside MemoryRouter to trigger programmatic router
 * navigations (e.g., deep-link query params or location.state handoffs) without
 * remounting DatasetProvider / ReportProvider.
 */
function RouteTrigger({
  testId,
  to,
  state,
}: {
  readonly testId: string;
  readonly to: string;
  readonly state?: unknown;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => navigate(to, state !== undefined ? { state } : undefined)}
    >
      Trigger {testId}
    </button>
  );
}

function buildMockAiFetch() {
  const capturedCasePayloads: unknown[] = [];

  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/ai/health')) {
        return new Response(
          JSON.stringify({
            ok: true,
            configured: true,
            prototypeEnabled: true,
            investigationEnabled: true,
            model: 'gemini-4-hydrogen',
            sdkAttemptsConfigured: 3,
            timestamp: new Date().toISOString(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/api/ai/investigate') && init?.body) {
        const parsed = JSON.parse(String(init.body)) as {
          mode: string;
          context?: {
            findings?: Array<{ id: string }>;
            columns?: Array<{ columnId: string }>;
          };
        };
        const firstFindingId = parsed.context?.findings?.[0]?.id ?? 'finding-1';
        const firstColId = parsed.context?.columns?.[0]?.columnId ?? 'col-2';

        if (parsed.mode === 'case') {
          capturedCasePayloads.push(parsed);
          return new Response(
            JSON.stringify({
              ok: true,
              mode: 'case',
              data: {
                evidenceAssessment:
                  'Selected aggregate evidence confirms a right-tail outlier in Amount paired with SparseNote missingness.',
                possibleConnections: [
                  'Extreme Amount entries may originate from a distinct batch feed.',
                ],
                alternativeExplanations: [
                  'Legitimate enterprise bulk invoices.',
                ],
                additionalEvidenceToExamine: [
                  'Review Amount vs CorrelatedAmount in Visualization Studio.',
                ],
                supportedConclusions: [
                  'IQR analysis flags at least one extreme Amount observation.',
                ],
                unansweredQuestions: [
                  'Invoice counterparty IDs are not present in aggregate summaries.',
                ],
                supportType: 'reasonable_interpretation',
                referencedFindingIds: [firstFindingId],
                referencedColumnIds: [firstColId],
                caveats: [
                  'Derived strictly from aggregate summaries; verify source rows in Explorer.',
                ],
              },
              meta: {
                model: 'gemini-4-hydrogen',
                durationMs: 320,
                generatedAt: Date.now(),
                contextCharCount: 2800,
                strippedInvalidFindingRefs: 0,
                strippedInvalidColumnRefs: 0,
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
                    'Executive AI synthesis identifies missingness in SparseNote and a sharp Amount outlier.',
                  majorFindings: [
                    {
                      title: 'Amount tail spike',
                      interpretation:
                        'Upper-tail Amount anomaly warrants verification.',
                      whyItMatters: 'Skews arithmetic averages.',
                      supportingFindingIds: [firstFindingId],
                      relevantColumnIds: [firstColId],
                    },
                  ],
                  dataQualityAssessment:
                    'SparseNote is roughly half empty across records.',
                  relationshipsAndPatterns:
                    'Amount and CorrelatedAmount show strong linear association.',
                  potentialRisks: ['Outlier distorts unclipped mean revenue.'],
                  recommendedNextSteps: [
                    'Open Investigation Center to formalize case tracking.',
                  ],
                  confidenceAndLimitations:
                    'Aggregate-only synthesis from deterministic profiles.',
                },
                connections: [],
                recommendations: [
                  {
                    id: 'rec-b4-1',
                    title: 'Verify Amount Outlier in Explorer',
                    reason: 'Confirm extreme value source row.',
                    priority: 'high',
                    destinationType: 'explorer',
                    destinationUrl: `/explorer?column=${firstColId}`,
                    supportingFindingIds: [firstFindingId],
                    relevantColumnIds: [firstColId],
                    whatToLookFor: 'Check row values for Amount.',
                  },
                ],
              },
              meta: {
                model: 'gemini-4-hydrogen',
                durationMs: 390,
                generatedAt: new Date().toISOString(),
                contextCharCount: 2600,
                strippedInvalidFindingRefs: 0,
                strippedInvalidColumnRefs: 0,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
      }

      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });

  return { fetchSpy, capturedCasePayloads };
}

describe('Consolidation Batch 4 — Cross-Module Journeys & Final UX Polish', () => {
  beforeEach(() => {
    resetAssistantSessionCache();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetAssistantSessionCache();
  });

  describe('1. Engine Validation — Custom Chart Handoff Integrity', () => {
    it('preserves valid custom chart configurations and flags invalid references without substituting unrelated charts', () => {
      const dataset = buildSyntheticDataset('ds-validate');
      const profile = profileDataset(dataset);
      const stats = analyzeDatasetStatistics(dataset, profile);

      const customBoxPlot: ChartConfig = {
        id: 'custom-box-1',
        type: 'boxplot',
        title: 'Custom Amount Quartiles',
        xColumnId: 'col-2', // Amount (numeric)
        xAxisLabel: 'Order Amount ($)',
        yAxisLabel: 'Distribution',
        categorySort: 'freq_desc',
        maxCategories: 10,
        showLegend: false,
        binCount: 12,
      };

      const customBar: ChartConfig = {
        id: 'custom-bar-1',
        type: 'bar',
        title: 'Regional Mix (Alphabetical)',
        xColumnId: 'col-1', // Region (categorical)
        xAxisLabel: 'Region',
        yAxisLabel: 'Count',
        categorySort: 'label_asc',
        maxCategories: 6,
        showLegend: true,
      };

      const invalidMissingCol: ChartConfig = {
        id: 'bad-col-1',
        type: 'histogram',
        title: 'Deleted Column Chart',
        xColumnId: 'col-nonexistent',
        xAxisLabel: 'Missing',
        yAxisLabel: 'Count',
        categorySort: 'freq_desc',
        maxCategories: 10,
        showLegend: true,
      };

      const invalidTypeMismatch: ChartConfig = {
        id: 'bad-type-1',
        type: 'scatter',
        title: 'Invalid Scatter on Text',
        xColumnId: 'col-1', // Region (categorical, not numeric)
        yColumnId: 'col-2',
        xAxisLabel: 'Region',
        yAxisLabel: 'Amount',
        categorySort: 'freq_desc',
        maxCategories: 10,
        showLegend: true,
      };

      const result = validateChartConfigsForDataset(
        [customBoxPlot, customBar, invalidMissingCol, invalidTypeMismatch],
        dataset,
        profile,
        stats,
      );

      expect(result.validCharts).toHaveLength(2);
      expect(result.validCharts[0]).toMatchObject({
        type: 'boxplot',
        title: 'Custom Amount Quartiles',
        xColumnId: 'col-2',
        xAxisLabel: 'Order Amount ($)',
        showLegend: false,
      });
      expect(result.validCharts[1]).toMatchObject({
        type: 'bar',
        title: 'Regional Mix (Alphabetical)',
        xColumnId: 'col-1',
        categorySort: 'label_asc',
        maxCategories: 6,
      });

      expect(result.invalidCharts).toHaveLength(2);
      expect(result.invalidCharts[0]!.reason).toMatch(/missing|not available/i);
      expect(result.invalidCharts[1]!.reason).toMatch(/incompatible with scatter/i);

      // Distinct custom settings produce distinct signatures
      const altBar: ChartConfig = {
        ...customBar,
        categorySort: 'freq_desc',
      };
      expect(getChartConfigSignature(customBar)).not.toBe(
        getChartConfigSignature(altBar),
      );
    });
  });

  describe('2. Explorer Upstream Error State & Deep-Link Pagination Fix', () => {
    it('shows a clear recoverable error state in Explorer when profiling fails, preserves active dataset, and recovers on Retry Profiling', async () => {
      const user = userEvent.setup();
      let attempts = 0;
      const originalProfile = DatasetProfilingClient.prototype.profile;

      vi.spyOn(DatasetProfilingClient.prototype, 'profile').mockImplementation(
        function (this: DatasetProfilingClient, dataset, policy) {
          attempts += 1;
          if (attempts === 1) {
            return Promise.reject(
              new Error('Simulated worker schema profiling failure'),
            );
          }
          return originalProfile.call(this, dataset, policy);
        },
      );

      renderWorkspace('/');

      await user.upload(
        screen.getByTestId('evidence-file-input'),
        createCsvFile('broken_profile.csv', buildJourneyCsv('ERR', 18)),
      );
      await user.click(
        await screen.findByRole('button', { name: 'Import Dataset' }),
      );

      // Navigate to Explorer while profiling is in error state
      const sidebar = screen.getByTestId('desktop-sidebar');
      await user.click(
        within(sidebar).getByRole('link', { name: /Dataset Explorer/i }),
      );

      const errorState = await screen.findByTestId('explorer-error-state');
      expect(errorState).toHaveTextContent(
        /Simulated worker schema profiling failure/i,
      );
      // Preserves active dataset metadata in memory and hides stale table
      expect(errorState).toHaveTextContent('broken_profile.csv');
      expect(errorState).toHaveTextContent('18');
      expect(
        screen.queryByTestId('dataset-explorer-page'),
      ).not.toBeInTheDocument();

      // Recover via Retry Profiling
      await user.click(
        within(errorState).getByRole('button', { name: /Retry Profiling/i }),
      );

      const explorer = await screen.findByTestId('dataset-explorer-page');
      expect(explorer).toHaveTextContent('broken_profile.csv');
      expect(
        screen.queryByTestId('explorer-error-state'),
      ).not.toBeInTheDocument();
    });

    it('uses active pageSize for row deep-links, recalculates page on page-size changes, and preserves filters', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={['/']}>
          <AppWorkspace initialSkipBoot />
          <RouteTrigger
            testId="deeplink-row-60"
            to="/explorer?column=col-2&row=60"
          />
          <RouteTrigger testId="deeplink-row-35" to="/explorer?row=35" />
        </MemoryRouter>,
      );

      // Import an 85-row CSV so multi-page pagination is active at pageSize 25 & 50
      await user.upload(
        screen.getByTestId('evidence-file-input'),
        createCsvFile('large_orders.csv', buildJourneyCsv('BIG', 85)),
      );
      await user.click(
        await screen.findByRole('button', { name: 'Import Dataset' }),
      );
      await screen.findByTestId('dataset-profiling-section');

      // Deep-link directly to row 60 (default pageSize = 50 -> Page 2)
      await user.click(screen.getByTestId('deeplink-row-60'));
      await screen.findByTestId('dataset-explorer-page');

      expect(screen.getByTestId('explorer-focus-banner')).toHaveTextContent(
        /Row #60/i,
      );
      expect(screen.getByTestId('explorer-pagination')).toHaveTextContent(
        /Page 2 of 2/i,
      );
      const highlightedRow60 = document.querySelector('tr[data-row-index="59"]');
      expect(highlightedRow60).not.toBeNull();
      expect(highlightedRow60).toHaveAttribute('data-highlighted-row', 'true');

      // Change page size from 50 -> 25: Row #60 (0-based index 59) moves to Page 3 of 4, staying visible & highlighted
      await user.selectOptions(
        screen.getByLabelText(/Rows per page/i),
        '25',
      );
      await waitFor(() => {
        expect(screen.getByTestId('explorer-pagination')).toHaveTextContent(
          /Page 3 of 4/i,
        );
      });
      expect(
        document.querySelector('tr[data-row-index="59"]'),
      ).toHaveAttribute('data-highlighted-row', 'true');

      // Now trigger deep-link to Row #35 while active pageSize is 25 -> must land on Page 2 (NOT Page 1 from hardcoded 50!)
      await user.click(screen.getByTestId('deeplink-row-35'));
      await waitFor(() => {
        expect(screen.getByTestId('explorer-pagination')).toHaveTextContent(
          /Page 2 of 4/i,
        );
      });
      expect(
        document.querySelector('tr[data-row-index="34"]'),
      ).toHaveAttribute('data-highlighted-row', 'true');

      // Apply a global search filter that excludes Row #35 -> focus banner notes hidden by active filters while filter stays intact
      const searchInput = screen.getByLabelText(/Global search across records/i);
      await user.type(searchInput, 'BIG-1001');
      await waitFor(() => {
        expect(screen.getByTestId('explorer-focus-banner')).toHaveTextContent(
          /hidden by active filters/i,
        );
      });
      expect(searchInput).toHaveValue('BIG-1001');
    });
  });

  describe('3. Journey 1 & Journey 2 — Overview -> Explorer -> Statistics & Visualization Studio Custom Chart Handoff', () => {
    it('completes Journey 1 (Overview -> Explorer -> Statistics) and Journey 2 (Explorer -> Visualizations -> Reports custom chart handoff + invalid/ordinary safeguards)', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={['/']}>
          <AppWorkspace initialSkipBoot />
          <RouteTrigger
            testId="trigger-stale-handoff"
            to="/reports?source=dataset&type=dataset_analysis&charts=studio"
            state={{
              studioChartHandoff: {
                datasetId: 'ds-wrong-stale-id',
                profiledAt: 0,
                stagedAt: Date.now(),
                charts: [
                  {
                    id: 'stale-chart',
                    type: 'histogram',
                    title: 'Stale Chart',
                    xColumnId: 'col-999',
                  },
                ],
              },
            }}
          />
        </MemoryRouter>,
      );

      // Journey 1: Upload dataset -> Overview command centre -> Explorer -> Statistics
      await user.upload(
        screen.getByTestId('evidence-file-input'),
        createCsvFile('studio_handoff.csv', buildJourneyCsv('VIS', 26)),
      );
      await user.click(
        await screen.findByRole('button', { name: 'Import Dataset' }),
      );
      await screen.findByTestId('dataset-profiling-section');

      // Move from Overview workspace card into Explorer
      const analyticalWorkspace = screen.getByRole('region', {
        name: /Analytical Workspace/i,
      });
      await user.click(
        within(analyticalWorkspace).getByRole('link', { name: /Explorer/i }),
      );
      await screen.findByTestId('dataset-explorer-page');

      // Contextual nav: Explorer -> Statistical Analysis
      await user.click(screen.getByTestId('explorer-nav-statistics'));
      await screen.findByTestId('statistical-analysis-page');

      // Contextual nav: Statistics -> Visualization Studio
      await user.click(screen.getByTestId('statistics-nav-visualizations'));
      const studio = await screen.findByTestId(
        'visualizations-studio-workspace',
      );

      // Journey 2: Remove initial charts down to a clean custom selection, then add a custom Box Plot
      const grid = within(studio).getByTestId('visualizations-chart-grid');
      const removeButtons = within(grid).getAllByRole('button', {
        name: /^Remove /i,
      });
      for (const btn of removeButtons) {
        await user.click(btn);
      }

      // Create one bespoke Box Plot chart with custom title
      await user.click(screen.getByRole('button', { name: 'Add Chart' }));
      const newBuilder = screen.getByTestId('new-chart-builder');
      await user.selectOptions(
        within(newBuilder).getByLabelText('New Chart Type'),
        'boxplot',
      );
      const customTitleInput = within(newBuilder).getByLabelText(
        'New Chart Title',
      );
      await user.clear(customTitleInput);
      await user.type(customTitleInput, 'Bespoke Amount Boxplot');
      await user.click(
        within(newBuilder).getByRole('button', { name: 'Add to Studio' }),
      );

      expect(grid).toHaveTextContent('Bespoke Amount Boxplot');

      // Handoff custom selection to Reports
      await user.click(screen.getByTestId('visualizations-create-report-link'));

      // Verify Report Builder preserves ONLY the custom Studio chart (no silent recommended substitution)
      const builderForm = await screen.findByTestId('report-builder-form');
      const studioNotice = within(builderForm).getByTestId(
        'report-builder-studio-charts-notice',
      );
      expect(studioNotice).toHaveTextContent(
        /Preserved 1 validated chart from Visualization Studio/i,
      );
      expect(builderForm).toHaveTextContent('Bespoke Amount Boxplot');
      expect(builderForm).toHaveTextContent('Studio Selection');

      const chartsPicker = within(builderForm).getByTestId(
        'report-builder-charts-picker',
      );
      const selectedChartButtons = within(chartsPicker)
        .getAllByRole('button')
        .filter((btn) => btn.getAttribute('aria-pressed') === 'true');
      expect(selectedChartButtons).toHaveLength(1);
      expect(selectedChartButtons[0]).toHaveTextContent('Bespoke Amount Boxplot');
      expect(selectedChartButtons[0]).toHaveTextContent('Studio Selection');

      // Generate report and verify custom chart renders in A4 Preview and remains visible in ReportEditorSidebar Content tab
      await user.type(
        within(builderForm).getByLabelText(/Report Title/i),
        'Studio Custom Chart Dossier',
      );
      await user.click(
        within(builderForm).getByRole('button', {
          name: /Generate Report & Preview/i,
        }),
      );

      const preview = await screen.findByTestId('report-a4-preview');
      expect(preview).toHaveTextContent('Bespoke Amount Boxplot');

      const editorSidebar = screen.getByTestId('report-editor-sidebar');
      await user.click(
        within(editorSidebar).getByRole('tab', { name: /Evidence/i }),
      );
      expect(editorSidebar).toHaveTextContent('Bespoke Amount Boxplot');

      // Verify stale / invalid handoff shows explicit notice and selects 0 charts (no silent recommended substitution)
      await user.click(screen.getByTestId('trigger-stale-handoff'));
      const staleNotice = await screen.findByTestId(
        'report-builder-invalid-charts-notice',
      );
      expect(staleNotice).toHaveTextContent(/previous dataset or schema version/i);
      expect(staleNotice).toHaveTextContent(/were not applied/i);
      const stalePicker = screen.getByTestId('report-builder-charts-picker');
      expect(stalePicker).toHaveTextContent(/Charts \(0\//i);

      // Verify ordinary dataset report creation still selects default recommended charts
      await user.click(screen.getByRole('button', { name: /Report Library/i }));
      await user.click(screen.getByRole('button', { name: /New Report/i }));
      const ordinaryForm = await screen.findByTestId('report-builder-form');
      expect(
        within(ordinaryForm).queryByTestId(
          'report-builder-studio-charts-notice',
        ),
      ).not.toBeInTheDocument();
      expect(
        within(ordinaryForm).queryByTestId(
          'report-builder-invalid-charts-notice',
        ),
      ).not.toBeInTheDocument();
      const ordinaryPicker = within(ordinaryForm).getByTestId(
        'report-builder-charts-picker',
      );
      expect(ordinaryPicker).toHaveTextContent(/Charts \([1-9]\d*\//i);
    }, 25_000);
  });

  describe('4. Journeys 3, 4, 5, 6 — Investigation Density, AI Case Analysis, Case Report PDF Export, Assistant Flow & Dataset Replacement Isolation', () => {
    it('completes Journeys 3–6 end-to-end and verifies 4-column Investigation KPI summary & section separation', async () => {
      const user = userEvent.setup();
      const { capturedCasePayloads } = buildMockAiFetch();

      const capturedPdfBlobs: Blob[] = [];
      vi.spyOn(URL, 'createObjectURL').mockImplementation((obj) => {
        if (obj instanceof Blob) capturedPdfBlobs.push(obj);
        return 'blob:batch4-pdf';
      });
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
        () => {},
      );

      renderWorkspace('/');

      // Import Dataset A
      await user.upload(
        screen.getByTestId('evidence-file-input'),
        createCsvFile('audit_alpha.csv', buildJourneyCsv('ALP', 26)),
      );
      await user.click(
        await screen.findByRole('button', { name: 'Import Dataset' }),
      );
      await screen.findByTestId('dataset-profiling-section');

      // Journey 5: AI Assistant -> generate brief -> contextual nav to Investigation Center
      const sidebar = screen.getByTestId('desktop-sidebar');
      await user.click(
        within(sidebar).getByRole('link', { name: /AI Assistant/i }),
      );
      const genBriefBtn = await screen.findByTestId('generate-brief-button');
      await waitFor(() => expect(genBriefBtn).toBeEnabled());
      await user.click(genBriefBtn);
      await screen.findByTestId('ai-investigation-brief');

      // Use contextual navigation link from Assistant -> Investigation Center
      await user.click(screen.getByTestId('assistant-nav-investigation'));
      const invWorkspace = await screen.findByTestId(
        'investigation-center-workspace',
      );

      // Verify AI brief surfaced in Investigation Center
      expect(
        within(invWorkspace).getByTestId('investigation-ai-intelligence-bridge'),
      ).toHaveTextContent(/Executive AI synthesis identifies missingness/i);

      // Verify Investigation Center 4-column KPI summary & clear separation of Cases vs Automated Findings
      const kpiStrip = within(invWorkspace).getByTestId(
        'investigation-overview-strip',
      );
      expect(kpiStrip.className).toContain('lg:grid-cols-4');
      expect(kpiStrip.className).not.toContain('lg:grid-cols-8');
      expect(kpiStrip).toHaveTextContent(/Active Cases/i);
      expect(kpiStrip).toHaveTextContent(/Total Findings/i);
      expect(kpiStrip).toHaveTextContent(/Data-Quality Issues/i);
      expect(kpiStrip).toHaveTextContent(/Statistical Outliers/i);
      expect(kpiStrip).toHaveTextContent(/Notable Observations/i);

      const casesSection = within(invWorkspace).getByTestId(
        'investigation-cases-section',
      );
      const findingsSection = within(invWorkspace).getByTestId(
        'investigation-findings-section',
      );
      expect(casesSection).toBeInTheDocument();
      expect(
        within(findingsSection).getByTestId('anomaly-detection-controls'),
      ).toBeInTheDocument();

      // Journey 3: Automated finding -> Create Case -> Evidence Board -> AI Case Analysis
      const iqrHeading = within(findingsSection).getByText(
        /IQR statistical outlier in "Amount"/i,
      );
      const iqrCard = iqrHeading.closest('article')!;
      await user.click(
        within(iqrCard).getByRole('button', { name: /Create Case/i }),
      );

      const caseDetail = await screen.findByTestId('investigation-case-detail');
      expect(caseDetail).toHaveAttribute('data-case-id', 'CASE-001');

      const evidenceBoard = within(caseDetail).getByTestId(
        'case-evidence-board',
      );
      expect(evidenceBoard).toHaveTextContent(/VERIFIED · Automated Finding/i);

      const aiPanel = within(caseDetail).getByTestId('case-ai-analysis-panel');
      const analyzeBtn = within(aiPanel).getByTestId('analyze-case-button');
      await waitFor(() => expect(analyzeBtn).toBeEnabled());
      await user.click(analyzeBtn);

      expect(
        await within(aiPanel).findByText(
          /Selected aggregate evidence confirms a right-tail outlier/i,
        ),
      ).toBeInTheDocument();
      expect(capturedCasePayloads).toHaveLength(1);
      expect(JSON.stringify(capturedCasePayloads[0])).not.toContain(
        'SECRET_ALP_',
      );

      // Journey 4: Investigation Case -> Create Report -> Source Case contextual link -> PDF Export
      await user.click(
        within(caseDetail).getByTestId('case-create-report-link'),
      );
      const caseReportForm = await screen.findByTestId('report-builder-form');
      expect(
        screen.getByTestId('reports-nav-source-case'),
      ).toHaveTextContent(/CASE-001/i);

      await user.type(
        within(caseReportForm).getByLabelText(/Report Title/i),
        'CASE-001 Forensic Dossier',
      );
      await user.click(
        within(caseReportForm).getByRole('button', {
          name: /Generate Report & Preview/i,
        }),
      );

      await screen.findByTestId('report-a4-preview');
      await user.click(screen.getByTestId('export-pdf-button'));
      await screen.findByTestId('export-pdf-success');

      expect(capturedPdfBlobs).toHaveLength(1);
      expect(capturedPdfBlobs[0]!.type).toBe('application/pdf');
      expect(capturedPdfBlobs[0]!.size).toBeGreaterThan(5_000);

      // Journey 6: Replace Dataset A with Dataset B -> old Cases & old Reports stay strictly isolated
      await user.click(
        within(sidebar).getByRole('link', { name: /Data Detective Overview/i }),
      );
      const activeBanner = await screen.findByRole('region', {
        name: 'Active imported dataset',
      });
      await user.click(
        within(activeBanner).getByRole('button', { name: /Load Another File/i }),
      );
      await user.upload(
        screen.getByTestId('evidence-file-input'),
        createCsvFile('audit_beta.csv', buildJourneyCsv('BET', 22)),
      );
      await user.click(
        await screen.findByRole('button', { name: 'Import Dataset' }),
      );
      const confirmDialog = await screen.findByRole('dialog');
      await user.click(
        within(confirmDialog).getByRole('button', { name: 'Replace Dataset' }),
      );
      await waitFor(() => {
        expect(
          screen.getByRole('region', { name: 'Active imported dataset' }),
        ).toHaveTextContent('audit_beta.csv');
      });

      // Verify old case is isolated in Previous Dataset Cases
      await user.click(
        within(sidebar).getByRole('link', { name: /Investigation Center/i }),
      );
      const betaInv = await screen.findByTestId(
        'investigation-center-workspace',
      );
      const prevCases = within(betaInv).getByTestId(
        'previous-dataset-cases-section',
      );
      expect(prevCases).toHaveTextContent('CASE-001');
      expect(prevCases).toHaveTextContent('audit_alpha.csv');

      // Verify old report is isolated in Previous Dataset Reports
      await user.click(
        within(sidebar).getByRole('link', { name: /Reports & Export/i }),
      );
      const prevReports = await screen.findByTestId(
        'previous-dataset-reports-section',
      );
      expect(prevReports).toHaveTextContent('CASE-001 Forensic Dossier');
      expect(prevReports).toHaveTextContent(/Previous Dataset Snapshot/i);
    }, 30_000);
  });
});
