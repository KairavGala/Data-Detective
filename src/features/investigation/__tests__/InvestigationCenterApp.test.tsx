import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
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

describe('Module 07 — Investigation Center UI & Cross-Module Navigation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('shows an explicit empty state on /investigation before any dataset is loaded', () => {
    renderWorkspace('/investigation');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Investigation Center',
    );
    const emptyState = screen.getByTestId('investigation-no-dataset-state');
    expect(emptyState).toHaveTextContent(/No Active Dataset/i);
    expect(
      within(emptyState).getByRole('link', {
        name: /Import Dataset on Overview/i,
      }),
    ).toHaveAttribute('href', '/');
  });

  it('surfaces grouped findings, supports filters/search/Z-score toggle, and navigates to Explorer rows, Explorer columns, and Visualization Studio charts', async () => {
    const user = userEvent.setup();
    renderWorkspace('/');

    // Build a 25-row dataset with simultaneous findings:
    // - SparseNote: >40% missing (data_quality_issue)
    // - Amount: normal 10..20 + extreme outlier 950 on row 25 (statistical_outlier)
    // - CorrelatedAmount: 2 * Amount (relationship correlation)
    // - Region: 20 North (80% dominant), 4 South, 1 RareZone (categorical)
    // - ConstantFlag: all "ACTIVE" (structural constant)
    const lines = [
      'Order ID,Region,Amount,CorrelatedAmount,SparseNote,ConstantFlag',
    ];
    for (let i = 1; i <= 25; i += 1) {
      const region = i <= 20 ? 'North' : i <= 24 ? 'South' : 'RareZone';
      const amount = i === 25 ? 950 : 10 + (i % 6);
      const corr = amount * 2 + 1;
      const sparse = i <= 12 ? '' : `Note-${i}`;
      lines.push(`ORD-${1000 + i},${region},${amount},${corr},${sparse},ACTIVE`);
    }

    await user.upload(
      screen.getByTestId('evidence-file-input'),
      createCsvFile('audit_findings.csv', lines.join('\n')),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );
    await screen.findByTestId('dataset-profiling-section');

    // Navigate to Investigation Center (/investigation) via keyboard chord G then I
    await user.keyboard('gi');

    const workspace = await screen.findByTestId(
      'investigation-center-workspace',
    );
    expect(workspace).toHaveTextContent('audit_findings.csv');

    // Findings overview strip displays nonzero counts across categories
    const overviewStrip = within(workspace).getByTestId(
      'investigation-overview-strip',
    );
    expect(overviewStrip).toHaveTextContent(/Data-Quality Issues/i);
    expect(overviewStrip).toHaveTextContent(/Statistical Outliers/i);
    expect(overviewStrip).toHaveTextContent(/Notable Observations/i);

    // Grouped category sections render cleanly
    expect(
      within(workspace).getByTestId('investigation-category-group-data_quality'),
    ).toBeInTheDocument();
    expect(
      within(workspace).getByTestId(
        'investigation-category-group-numeric_outliers',
      ),
    ).toBeInTheDocument();
    expect(
      within(workspace).getByTestId('investigation-category-group-categorical'),
    ).toBeInTheDocument();
    expect(
      within(workspace).getByTestId('investigation-category-group-relationship'),
    ).toBeInTheDocument();

    // Enable optional Z-score detector -> Z-score insight card appears for Amount
    await user.click(within(workspace).getByLabelText('Z-Score'));
    expect(
      await within(workspace).findByText(
        /Z-score extreme observation in "Amount"/i,
      ),
    ).toBeInTheDocument();

    // Filter by classification: Confirmed Data-Quality Issues only
    await user.selectOptions(
      within(workspace).getByLabelText('Filter by finding classification'),
      'data_quality_issue',
    );
    expect(
      within(workspace).queryByTestId(
        'investigation-category-group-numeric_outliers',
      ),
    ).not.toBeInTheDocument();
    expect(
      within(workspace).getByTestId('investigation-category-group-data_quality'),
    ).toBeInTheDocument();

    // Reset classification filter back to all
    await user.selectOptions(
      within(workspace).getByLabelText('Filter by finding classification'),
      'all',
    );

    // Search narrows findings to SparseNote
    const searchInput = within(workspace).getByLabelText(
      'Search investigation findings',
    );
    await user.type(searchInput, 'SparseNote');
    expect(
      within(workspace).getByText(
        /High missing-value concentration in "SparseNote"/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(workspace).queryByText(/Highly dominant category in "Region"/i),
    ).not.toBeInTheDocument();

    await user.click(
      within(workspace).getByRole('button', { name: 'Clear findings search' }),
    );

    // Expand evidence drawer on Amount IQR outlier and jump directly to Row #25 in Data Explorer
    const iqrHeading = within(workspace).getByText(
      /IQR statistical outlier in "Amount"/i,
    );
    const iqrCard = iqrHeading.closest('article')!;
    expect(iqrCard).not.toBeNull();
    await user.click(
      within(iqrCard).getByRole('button', {
        name: /Toggle evidence details/i,
      }),
    );
    expect(iqrCard).toHaveTextContent('#25');

    await user.click(
      within(iqrCard).getByRole('link', { name: /Inspect Row #25/i }),
    );

    // Arrives on Data Explorer with Row #25 highlighted and Amount column focused
    const explorerPage = await screen.findByTestId('dataset-explorer-page');
    const focusBanner = within(explorerPage).getByTestId(
      'explorer-focus-banner',
    );
    expect(focusBanner).toHaveTextContent(/Column “Amount”/i);
    expect(focusBanner).toHaveTextContent(/Row #25/i);
    const highlightedRow = explorerPage.querySelector(
      'tr[data-highlighted-row="true"]',
    );
    expect(highlightedRow).not.toBeNull();
    expect(highlightedRow).toHaveAttribute('data-row-index', '24');

    // Return to /investigation and click "Open Scatter Plot" on the correlation finding -> opens Visualization Studio
    await user.keyboard('gi');
    const backWorkspace = await screen.findByTestId(
      'investigation-center-workspace',
    );
    const corrHeading = within(backWorkspace).getByText(
      /Strong positive linear correlation: "Amount" & "CorrelatedAmount"/i,
    );
    const corrCard = corrHeading.closest('article')!;
    await user.click(
      within(corrCard).getByRole('link', { name: /Open Scatter Plot/i }),
    );

    const studio = await screen.findByTestId('visualizations-studio-workspace');
    const firstCard = within(
      within(studio).getByTestId('visualizations-chart-grid'),
    ).getAllByRole('article')[0];
    expect(firstCard).toHaveAttribute('data-chart-type', 'scatter');

    // Clear dataset from Overview -> returning to /investigation resets cleanly to empty state
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
    await waitFor(() => {
      expect(
        screen.getByTestId('investigation-no-dataset-state'),
      ).toBeInTheDocument();
    });
  });
});
