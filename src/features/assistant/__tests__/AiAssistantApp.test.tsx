import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetProvider, useDataset } from '@/context/DatasetContext';
import {
  AiAssistantPage,
  resetAssistantSessionCache,
} from '@/features/assistant';
import { DatasetExplorerPage } from '@/features/explorer';
import { InvestigationCenterPage } from '@/features/investigation';
import { VisualizationStudioPage } from '@/features/visualizations';
import type { ImportedColumn, ImportedDataset } from '@/types';

function makeSyntheticDataset(
  id: string,
  fileName: string,
  outlierValue = 9_500,
): ImportedDataset {
  const headers = ['order_amount', 'shipping_cost', 'region'];
  const columns: ImportedColumn[] = headers.map((name, index) => ({
    id: `col-${index}`,
    name,
    originalName: name,
    index,
    wasEmptyHeader: false,
    wasDuplicateHeader: false,
  }));

  const rows: unknown[][] = [];
  for (let i = 0; i < 30; i += 1) {
    const amount = i === 29 ? outlierValue : 100 + i * 5;
    const shipping = i < 8 ? '' : 20 + i;
    const region = i % 10 === 0 ? 'West' : 'North';
    rows.push([amount, shipping, region]);
  }

  return {
    id,
    fileName,
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

function DatasetTestControls({
  datasetA,
  datasetB,
}: {
  readonly datasetA?: ImportedDataset;
  readonly datasetB?: ImportedDataset;
}) {
  const { registerDataset, clearDataset } = useDataset();
  return (
    <div>
      {datasetA && (
        <button
          type="button"
          data-testid="load-dataset-a"
          onClick={() => registerDataset(datasetA)}
        >
          Load A
        </button>
      )}
      {datasetB && (
        <button
          type="button"
          data-testid="load-dataset-b"
          onClick={() => registerDataset(datasetB)}
        >
          Load B
        </button>
      )}
      <button
        type="button"
        data-testid="clear-dataset-btn"
        onClick={() => clearDataset()}
      >
        Clear Dataset
      </button>
    </div>
  );
}

function createHealthResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      requestId: 'req_health_test',
      configured: true,
      prototypeEnabled: true,
      investigationEnabled: true,
      model: 'gemini-4-hydrogen',
      sdkAttemptsConfigured: 3,
      timeouts: {
        geminiTimeoutMs: 18_000,
        handlerTimeoutMs: 22_000,
        frontendRecommendedTimeoutMs: 27_000,
        vercelMaxDurationSec: 30,
      },
      nodeVersion: 'v22.0.0',
      ...overrides,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function createBriefResponse(findingId: string): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      requestId: 'req_brief_test',
      mode: 'brief',
      data: {
        brief: {
          executiveSummary:
            'Dataset orders_alpha.csv contains 30 rows with missing values in shipping_cost and an upper outlier in order_amount.',
          majorFindings: [
            {
              title: 'Concentrated shipping_cost missingness',
              interpretation: 'Over a quarter of rows are missing shipping_cost.',
              whyItMatters: 'Missing shipping values reduce coverage for cost analyses.',
              supportingFindingIds: [findingId],
              relevantColumnIds: ['col-1'],
            },
          ],
          dataQualityAssessment: 'Missingness is isolated to shipping_cost.',
          relationshipsAndPatterns:
            'order_amount and shipping_cost co-vary strongly across valid rows (association only).',
          potentialRisks: ['Extreme order_amount value inflates the sample mean.'],
          recommendedNextSteps: ['Inspect shipping_cost in Data Explorer.'],
          confidenceAndLimitations:
            'Synthesized strictly from aggregate M03–M07 evidence; verify source rows in Explorer.',
        },
        connections: [
          {
            id: 'conn-1',
            title: 'Missingness alongside upper-tail outlier',
            findingIds: [findingId],
            columnIds: ['col-1', 'col-0'],
            evidenceSummary: 'shipping_cost has missing rows while order_amount has an extreme upper value.',
            possibleInterpretation: 'High-value shipments may follow a different billing workflow.',
            alternativeExplanations: ['Unrelated upstream ingestion gap.'],
            confidence: 'moderate',
            suggestedInvestigation: 'Review flagged rows in Investigation Center.',
          },
        ],
        recommendations: [
          {
            id: 'rec-1',
            title: 'Inspect shipping_cost in Data Explorer',
            reason: 'Audit missing records directly.',
            supportingFindingIds: [findingId],
            relevantColumnIds: ['col-1'],
            priority: 'high',
            destinationType: 'explorer',
            destinationUrl: '/explorer?column=col-1',
            whatToLookFor: 'Check if missing shipping_cost rows align with a single region.',
          },
        ],
      },
      meta: {
        model: 'gemini-4-hydrogen',
        durationMs: 412,
        sdkAttemptsConfigured: 3,
        generatedAt: '2026-11-24T12:00:00.000Z',
        contextCharCount: 2450,
        strippedInvalidFindingRefs: 0,
        strippedInvalidColumnRefs: 0,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function createQuestionResponse(
  answer: string,
  findingIds: string[] = [],
): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      requestId: 'req_qa_test',
      mode: 'question',
      data: {
        answer,
        supportType: 'directly_supported',
        referencedFindingIds: findingIds,
        referencedColumnIds: ['col-1'],
        caveats: ['Aggregate statistics cannot inspect individual source cells.'],
        suggestedFollowUps: ['Which column has outliers?'],
      },
      meta: {
        model: 'gemini-4-hydrogen',
        durationMs: 280,
        sdkAttemptsConfigured: 3,
        generatedAt: '2026-11-24T12:01:00.000Z',
        contextCharCount: 2100,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function renderAssistantApp(
  datasetA?: ImportedDataset,
  datasetB?: ImportedDataset,
) {
  return render(
    <MemoryRouter initialEntries={['/assistant']}>
      <DatasetProvider>
        <DatasetTestControls datasetA={datasetA} datasetB={datasetB} />
        <Routes>
          <Route path="/assistant" element={<AiAssistantPage />} />
          <Route path="/explorer" element={<DatasetExplorerPage />} />
          <Route path="/visualizations" element={<VisualizationStudioPage />} />
          <Route path="/investigation" element={<InvestigationCenterPage />} />
        </Routes>
      </DatasetProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  resetAssistantSessionCache();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetAssistantSessionCache();
});

describe('Module 08 Frontend — AI Investigation & Intelligence Workspace', () => {
  it('renders an informative empty state when no dataset is loaded', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createHealthResponse());
    renderAssistantApp();

    expect(
      await screen.findByTestId('assistant-no-dataset-state'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Import Dataset on Overview/i)).toBeInTheDocument();
  });

  it('generates and renders the brief, connected findings, recommendations, and supports finding & recommendation navigation', async () => {
    const user = userEvent.setup();
    const datasetA = makeSyntheticDataset('ds-alpha', 'orders_alpha.csv');
    let capturedFindingId = '';

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/ai/health') {
          return createHealthResponse();
        }
        if (url === '/api/ai/investigate') {
          const parsedBody = JSON.parse(String(init?.body ?? '{}')) as {
            context?: { findings?: Array<{ id: string }> };
          };
          capturedFindingId = parsedBody.context?.findings?.[0]?.id ?? 'dq-missing-col-1';
          return createBriefResponse(capturedFindingId);
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

    renderAssistantApp(datasetA);

    await user.click(screen.getByTestId('load-dataset-a'));
    await screen.findByTestId('ai-assistant-workspace');

    // Intentional generation: /api/ai/investigate MUST NOT be called automatically on load
    const investigateCallsBeforeClick = fetchSpy.mock.calls.filter(
      (c) => c[0] === '/api/ai/investigate',
    );
    expect(investigateCallsBeforeClick).toHaveLength(0);

    // Wait for health check to mark button enabled
    const generateBtn = screen.getByTestId('generate-brief-button');
    await waitFor(() => expect(generateBtn).not.toBeDisabled());
    await user.click(generateBtn);

    // Renders all 7 brief sections, connected findings, and recommendations
    const briefSection = await screen.findByTestId('ai-investigation-brief');
    expect(briefSection).toHaveTextContent('orders_alpha.csv contains 30 rows');
    expect(briefSection).toHaveTextContent('01 · Executive Summary');
    expect(briefSection).toHaveTextContent('07 · Confidence & Limitations');

    const connectionsSection = screen.getByTestId('ai-connected-findings');
    expect(connectionsSection).toHaveTextContent('Missingness alongside upper-tail outlier');

    const recSection = screen.getByTestId('ai-recommended-investigations');
    expect(recSection).toHaveTextContent('Inspect shipping_cost in Data Explorer');

    // Never persists dataset or AI context in localStorage/sessionStorage
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    // Navigate via Finding link to Investigation Center (?finding=...)
    const findingLink = within(connectionsSection).getByRole('link', {
      name: new RegExp(capturedFindingId),
    });
    await user.click(findingLink);

    expect(
      await screen.findByTestId('investigation-focused-finding-banner'),
    ).toHaveTextContent(capturedFindingId);
    expect(
      screen.getByTestId(`insight-evidence-drawer-${capturedFindingId}`),
    ).toBeInTheDocument();
  });

  it('navigates into Data Explorer when clicking a validated recommendation action', async () => {
    const user = userEvent.setup();
    const datasetA = makeSyntheticDataset('ds-nav', 'orders_nav.csv');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/ai/health') return createHealthResponse();
      return createBriefResponse('dq-missing-col-1');
    });

    renderAssistantApp(datasetA);
    await user.click(screen.getByTestId('load-dataset-a'));
    await screen.findByTestId('ai-assistant-workspace');

    const generateBtn = screen.getByTestId('generate-brief-button');
    await waitFor(() => expect(generateBtn).not.toBeDisabled());
    await user.click(generateBtn);

    const recSection = await screen.findByTestId('ai-recommended-investigations');
    const explorerLink = within(recSection).getByRole('link', {
      name: /Open in Data Explorer/i,
    });
    await user.click(explorerLink);

    const explorerPage = await screen.findByTestId('dataset-explorer-page');
    expect(explorerPage).toHaveAttribute('data-explored-dataset-id', 'ds-nav');
  });

  it('supports Ask Your Dataset multi-turn conversation history, failed generation recovery with retry, and duplicate submission prevention', async () => {
    const user = userEvent.setup();
    const datasetA = makeSyntheticDataset('ds-qa', 'orders_qa.csv');
    let qaAttempt = 0;
    const sentHistories: unknown[] = [];

    const deferredBrief: { resolve: ((res: Response) => void) | null } = {
      resolve: null,
    };
    let briefCallCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/ai/health') return createHealthResponse();

      const parsed = JSON.parse(String(init?.body ?? '{}')) as {
        mode: string;
        history?: unknown[];
      };

      if (parsed.mode === 'brief') {
        briefCallCount += 1;
        return new Promise<Response>((resolve) => {
          deferredBrief.resolve = resolve;
        });
      }

      qaAttempt += 1;
      sentHistories.push(parsed.history ?? []);

      // Fail first question attempt to verify error display + input preservation + retry
      if (qaAttempt === 1) {
        return new Response(
          JSON.stringify({
            ok: false,
            requestId: 'req_fail_1',
            error: {
              code: 'UPSTREAM_ERROR',
              message: 'Temporary upstream Gemini error.',
              retryable: true,
            },
            meta: {
              model: 'gemini-4-hydrogen',
              durationMs: 90,
              sdkAttemptsConfigured: 3,
              generatedAt: new Date().toISOString(),
            },
          }),
          { status: 502, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (qaAttempt === 2) {
        return createQuestionResponse(
          'shipping_cost has the highest missingness in this dataset.',
        );
      }

      return createQuestionResponse(
        'order_amount contains an extreme upper outlier of 9,500.',
      );
    });

    renderAssistantApp(datasetA);
    await user.click(screen.getByTestId('load-dataset-a'));
    await screen.findByTestId('ai-assistant-workspace');

    // Duplicate brief submission prevention while in-flight
    const generateBtn = screen.getByTestId('generate-brief-button');
    await waitFor(() => expect(generateBtn).not.toBeDisabled());
    await user.click(generateBtn);
    await user.click(generateBtn);
    expect(briefCallCount).toBe(1);
    expect(generateBtn).toBeDisabled();

    // Resolve slow brief cleanly
    deferredBrief.resolve?.(createBriefResponse('dq-missing-col-1'));
    await screen.findByTestId('ai-investigation-brief');

    // Submit first Q&A -> fails -> preserves input & shows Retry button
    const inputEl = screen.getByLabelText(/Interrogate Aggregate Findings/i);
    await user.type(inputEl, 'Which column has missing data?');
    await user.click(screen.getByRole('button', { name: /Ask Dataset/i }));

    expect(
      await screen.findByText(/Temporary upstream Gemini error/i),
    ).toBeInTheDocument();
    expect(inputEl).toHaveValue('Which column has missing data?');

    // Retry failed turn -> succeeds
    await user.click(screen.getByRole('button', { name: /Retry Question/i }));
    expect(
      await screen.findByText(/shipping_cost has the highest missingness/i),
    ).toBeInTheDocument();

    // Ask follow-up question -> sends prior conversation history
    await user.clear(inputEl);
    await user.type(inputEl, 'What about outliers?');
    await user.click(screen.getByRole('button', { name: /Ask Dataset/i }));

    expect(
      await screen.findByText(/order_amount contains an extreme upper outlier/i),
    ).toBeInTheDocument();

    expect(sentHistories[2]).toEqual([
      { role: 'user', content: 'Which column has missing data?' },
      {
        role: 'assistant',
        content: 'shipping_cost has the highest missingness in this dataset.',
      },
    ]);
  });

  it('invalidates brief and conversation immediately on dataset replacement and dataset clear', async () => {
    const user = userEvent.setup();
    const datasetA = makeSyntheticDataset('ds-one', 'orders_one.csv');
    const datasetB = makeSyntheticDataset('ds-two', 'orders_two.csv', 12_000);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/ai/health') return createHealthResponse();
      const parsed = JSON.parse(String(init?.body ?? '{}')) as { mode: string };
      if (parsed.mode === 'brief') return createBriefResponse('dq-missing-col-1');
      return createQuestionResponse('Dataset one answer text.');
    });

    renderAssistantApp(datasetA, datasetB);
    await user.click(screen.getByTestId('load-dataset-a'));
    await screen.findByTestId('ai-assistant-workspace');

    const generateBtn = screen.getByTestId('generate-brief-button');
    await waitFor(() => expect(generateBtn).not.toBeDisabled());
    await user.click(generateBtn);
    await screen.findByTestId('ai-investigation-brief');

    const inputEl = screen.getByLabelText(/Interrogate Aggregate Findings/i);
    await user.type(inputEl, 'Summarize dataset one');
    await user.click(screen.getByRole('button', { name: /Ask Dataset/i }));
    await screen.findByText(/Dataset one answer text/i);

    // Replace active dataset -> brief and conversation MUST vanish immediately
    await user.click(screen.getByTestId('load-dataset-b'));
    await waitFor(() => {
      expect(screen.getByText('orders_two.csv')).toBeInTheDocument();
      expect(screen.queryByTestId('ai-investigation-brief')).not.toBeInTheDocument();
      expect(screen.queryByText(/Dataset one answer text/i)).not.toBeInTheDocument();
    });

    // Clear active dataset -> empty state rendered
    await user.click(screen.getByTestId('clear-dataset-btn'));
    expect(
      await screen.findByTestId('assistant-no-dataset-state'),
    ).toBeInTheDocument();
  });
});
