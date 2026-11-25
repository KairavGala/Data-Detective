import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppWorkspace } from '@/App';

function createCsvFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/csv' });
}

function renderWorkspace(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppWorkspace initialSkipBoot />
    </MemoryRouter>,
  );
}

const SAMPLE_ANOMALY_CSV = [
  'record_id,region,amount,notes',
  'R-01,North,100,ok',
  'R-02,North,105,ok',
  'R-03,South,98,ok',
  'R-04,South,102,ok',
  'R-05,North,101,ok',
  'R-06,South,99,ok',
  'R-07,North,104,ok',
  'R-08,South,100,ok',
  'R-09,North,97,ok',
  'R-10,South,103,ok',
  'R-11,North,102,ok',
  'R-12,South,99999,',
].join('\n');

const INTERNAL_TERM_REGEX =
  /\b(Module 0[0-9]|Module 10|Modules 0|M0[1-9]|M10|Planned AI Proxy)\b/i;

describe('Consolidation Batch 3 — Unified Interface & Navigation Shell', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              ok: true,
              configured: false,
              investigationEnabled: false,
              model: 'gemini-2.5-flash',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders interactive desktop/mobile Topbar dataset context without Replay Intro or Overview links, and keeps Intro Replay working in Settings', async () => {
    const user = userEvent.setup();
    renderWorkspace('/settings');

    // Topbar has sole H1 and interactive dataset context link (visible on desktop & mobile)
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Settings');

    const topbarDatasetLink = screen.getByTestId('topbar-dataset-context');
    expect(topbarDatasetLink.tagName).toBe('A');
    expect(topbarDatasetLink).toHaveAttribute('href', '/');
    expect(topbarDatasetLink).toHaveTextContent('No file loaded');
    expect(topbarDatasetLink.className).not.toMatch(/\bhidden\b/);

    // Topbar no longer contains Replay Intro or redundant Overview back-link
    const topbarHeader = topbarDatasetLink.closest('header');
    expect(topbarHeader).not.toBeNull();
    expect(
      within(topbarHeader!).queryByRole('button', { name: /Replay Intro/i }),
    ).toBeNull();
    expect(within(topbarHeader!).getAllByRole('link')).toHaveLength(1);
    expect(
      within(topbarHeader!).queryByText(/← Overview/i),
    ).toBeNull();

    // Settings uses shared WorkspaceHeader and clean AI service terminology
    const settingsHeader = screen.getByTestId('workspace-page-header');
    expect(
      within(settingsHeader).getByRole('heading', { level: 2, name: 'Settings' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Shell Active')).toBeNull();
    expect(screen.queryByText(/Planned AI Proxy/i)).toBeNull();
    expect(screen.queryByText('/api/ai/investigate')).toBeNull();
    expect(screen.getByText('AI Investigation Service')).toBeInTheDocument();
    expect(
      screen.getByText('Server-side (aggregate summaries only)'),
    ).toBeInTheDocument();

    // Replay Initialization button in Settings launches the BootSequence cleanly
    await user.click(
      screen.getByRole('button', { name: /Replay Initialization/i }),
    );
    const skipIntroButton = await screen.findByRole('button', {
      name: /Skip Intro/i,
    });
    expect(skipIntroButton).toBeInTheDocument();
    expect(
      screen.getByText('Forensic Analytical Workstation'),
    ).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(INTERNAL_TERM_REGEX);

    // Dismiss boot sequence and click Topbar dataset link to navigate to Overview
    await user.click(skipIntroButton);
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /Skip Intro/i }),
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByTestId('topbar-dataset-context'));
    expect(
      await screen.findByTestId('overview-onboarding-hero'),
    ).toBeInTheDocument();
  });

  it('shows dataset-awareness state in Sidebar and MobileDrawer before and after dataset load, and updates factual findings/cases/reports indicators', async () => {
    const user = userEvent.setup();
    renderWorkspace('/');

    // 1. Before dataset load: Sidebar & MobileDrawer show unloaded state, awaiting-dataset markers, and zero fabricated counts
    const sidebar = screen.getByTestId('desktop-sidebar');
    const drawer = screen.getByTestId('mobile-drawer');

    expect(
      within(sidebar).getByTestId('sidebar-dataset-status'),
    ).toHaveTextContent('No dataset loaded');
    expect(
      within(drawer).getByTestId('drawer-dataset-status'),
    ).toHaveTextContent('No dataset loaded');

    const sidebarExplorerLink = within(sidebar).getByRole('link', {
      name: /Dataset Explorer/i,
    });
    expect(sidebarExplorerLink).toHaveAttribute(
      'data-dataset-state',
      'awaiting-dataset',
    );
    expect(
      within(sidebar).queryByTestId('sidebar-indicator-overview'),
    ).toBeNull();
    expect(
      within(sidebar).queryByTestId('sidebar-indicator-investigation'),
    ).toBeNull();
    expect(
      within(sidebar).queryByTestId('sidebar-indicator-reports'),
    ).toBeNull();

    // Dataset-dependent destinations remain clickable even when no dataset is loaded
    await user.click(sidebarExplorerLink);
    expect(
      await screen.findByTestId('explorer-no-dataset-state'),
    ).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(INTERNAL_TERM_REGEX);

    // Return via Topbar dataset indicator and import dataset with outliers
    await user.click(screen.getByTestId('topbar-dataset-context'));
    await user.upload(
      await screen.findByTestId('evidence-file-input'),
      createCsvFile('ledger_audit.csv', SAMPLE_ANOMALY_CSV),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );
    await screen.findByTestId('overview-loaded-workspace');

    // 2. Topbar, Sidebar, and MobileDrawer reflect loaded dataset and factual finding counts
    expect(screen.getByTestId('topbar-dataset-context')).toHaveTextContent(
      'ledger_audit.csv',
    );
    expect(screen.getByTestId('topbar-dataset-context')).toHaveTextContent(
      '12×4',
    );

    expect(
      within(sidebar).getByTestId('sidebar-dataset-status'),
    ).toHaveTextContent('ledger_audit.csv');
    expect(
      within(sidebar).getByTestId('sidebar-dataset-status'),
    ).toHaveTextContent('12×4 · Loaded');

    expect(
      within(drawer).getByTestId('drawer-dataset-status'),
    ).toHaveTextContent('ledger_audit.csv');
    expect(
      within(drawer).getByTestId('drawer-dataset-status'),
    ).toHaveTextContent('12×4 · Loaded');

    expect(
      within(sidebar).getByRole('link', { name: /Dataset Explorer/i }),
    ).toHaveAttribute('data-dataset-state', 'ready');

    expect(
      within(sidebar).getByTestId('sidebar-indicator-overview'),
    ).toHaveTextContent('Active');
    expect(
      within(drawer).getByTestId('drawer-indicator-overview'),
    ).toHaveTextContent('Active');

    const sidebarInvestigationIndicator = await within(sidebar).findByTestId(
      'sidebar-indicator-investigation',
    );
    expect(sidebarInvestigationIndicator.textContent).toMatch(/^\d+/);
    expect(
      within(drawer).getByTestId('drawer-indicator-investigation'),
    ).toHaveTextContent(sidebarInvestigationIndicator.textContent ?? '');

    // 3. Create a case in Investigation Center -> Sidebar & Drawer indicators include active case count
    await user.click(
      within(sidebar).getByRole('link', { name: /Investigation Center/i }),
    );
    await screen.findByTestId('investigation-center-workspace');

    const createCaseButtons = screen.getAllByRole('button', {
      name: /^Create Case$/i,
    });
    await user.click(createCaseButtons[createCaseButtons.length - 1]!);
    await screen.findByTestId('investigation-case-detail');

    await waitFor(() => {
      const sidebarInv = within(sidebar).getByTestId(
        'sidebar-indicator-investigation',
      );
      const drawerInv = within(drawer).getByTestId(
        'drawer-indicator-investigation',
      );
      expect(sidebarInv).toHaveTextContent(/· 1 \(.*1 active case\)/);
      expect(drawerInv).toHaveTextContent(/· 1 \(.*1 active case\)/);
    });

    // 4. Create a report -> Sidebar & Drawer Reports indicator shows factual report count (1)
    await user.click(within(sidebar).getByRole('link', { name: /Reports/i }));
    await user.click(
      await screen.findByRole('button', { name: /^Create Report$/i }),
    );
    await user.click(
      await screen.findByRole('button', { name: /Generate Report & Preview/i }),
    );

    await waitFor(() => {
      expect(
        within(sidebar).getByTestId('sidebar-indicator-reports'),
      ).toHaveTextContent('1');
      expect(
        within(drawer).getByTestId('drawer-indicator-reports'),
      ).toHaveTextContent('1');
    });
  });

  it('standardizes WorkspaceHeader across all analytical routes, relocates Create Report out of detector controls, and removes internal module terminology', async () => {
    const user = userEvent.setup();
    renderWorkspace('/');

    await user.upload(
      screen.getByTestId('evidence-file-input'),
      createCsvFile('audit_headers.csv', SAMPLE_ANOMALY_CSV),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );
    await screen.findByTestId('overview-loaded-workspace');

    const sidebar = screen.getByTestId('desktop-sidebar');

    const routeExpectations = [
      {
        navName: /Dataset Explorer/i,
        h2: 'Dataset Explorer',
        readyTestId: 'dataset-explorer-page',
      },
      {
        navName: /Statistical Analysis/i,
        h2: 'Statistical Analysis',
        readyTestId: 'statistical-analysis-page',
      },
      {
        navName: /Visualizations/i,
        h2: 'Visualization Studio',
        readyTestId: 'visualizations-studio-workspace',
      },
      {
        navName: /Investigation Center/i,
        h2: 'Investigation Center',
        readyTestId: 'investigation-center-workspace',
      },
      {
        navName: /AI Assistant/i,
        h2: 'AI Assistant',
        readyTestId: 'ai-assistant-workspace',
      },
      {
        navName: /Reports/i,
        h2: 'Investigation Reports & Dossiers',
        readyTestId: 'workspace-page-header',
      },
      {
        navName: /Settings/i,
        h2: 'Settings',
        readyTestId: 'workspace-page-header',
      },
    ];

    for (const route of routeExpectations) {
      await user.click(within(sidebar).getByRole('link', { name: route.navName }));
      await screen.findByTestId(route.readyTestId);

      // Single H1 across the entire document (Topbar owns H1)
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

      // Standardized shared WorkspaceHeader with H2 page title
      const header = screen.getByTestId('workspace-page-header');
      expect(
        within(header).getByRole('heading', { level: 2, name: route.h2 }),
      ).toBeInTheDocument();

      // Specific Investigation Center check: Create Report lives in WorkspaceHeader, NOT inside anomaly-detection-controls
      if (route.readyTestId === 'investigation-center-workspace') {
        expect(
          within(header).getByTestId('investigation-create-report-link'),
        ).toBeInTheDocument();
        const detectorControls = screen.getByTestId('anomaly-detection-controls');
        expect(
          within(detectorControls).queryByTestId(
            'investigation-create-report-link',
          ),
        ).toBeNull();
      }

      // No internal Module 0X / M0X / Planned AI Proxy terminology visible anywhere on page
      const mainContent = screen.getByRole('main');
      expect(mainContent.textContent ?? '').not.toMatch(INTERNAL_TERM_REGEX);
    }
  });
});
