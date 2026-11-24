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

describe('Module 04 — Statistical Analysis UI Integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('shows an explicit empty state on /analysis before any dataset is loaded', () => {
    renderWorkspace('/analysis');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Statistical Analysis',
    );
    const emptyState = screen.getByTestId('statistics-no-dataset-state');
    expect(emptyState).toHaveTextContent(/No Active Dataset/i);
    expect(
      within(emptyState).getByRole('link', {
        name: /Import Dataset on Overview/i,
      }),
    ).toHaveAttribute('href', '/');
  });

  it('computes and displays numeric, categorical (with ties), and unsupported columns, filters sections, updates with M03 policy, and clears cleanly', async () => {
    const user = userEvent.setup();
    renderWorkspace('/');

    // CSV with identifier, date, numeric (with bimodal values + missing), and categorical (with ties + "None")
    const csvContent = [
      'Order ID,Order Date,Region,Amount,Allergy',
      'ORD-1001,2026-01-01,North,10,None',
      'ORD-1002,2026-01-02,South,20,None',
      'ORD-1003,2026-01-03,North,20,Peanuts',
      'ORD-1004,2026-01-04,South,30,Shellfish',
      'ORD-1005,2026-01-05,East,30,Peanuts',
      'ORD-1006,2026-01-06,West,N/A,N/A',
    ].join('\n');

    await user.upload(
      screen.getByTestId('evidence-file-input'),
      createCsvFile('sales_stats.csv', csvContent),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );

    // Wait for M03 profiling to settle on Overview
    await screen.findByTestId('dataset-profiling-section');

    // Navigate to Statistical Analysis (/analysis) via keyboard chord G then A
    await user.keyboard('ga');

    const analysisPage = await screen.findByTestId('statistical-analysis-page');
    expect(analysisPage).toHaveTextContent('sales_stats.csv');

    // Dataset statistical overview reflects M03 counts: 1 numeric, 2 categorical, 2 unsupported (ID + Date)
    const overviewSection = within(analysisPage).getByTestId(
      'statistics-overview-section',
    );
    expect(overviewSection).toHaveTextContent('Dataset Statistical Overview');
    expect(overviewSection).toHaveTextContent(/Linear interpolation/i);

    // Numeric section shows Amount (values [10, 20, 20, 30, 30] -> mean 22, median 20, multimodal 20 & 30)
    const numericSection = within(analysisPage).getByTestId(
      'numeric-statistics-section',
    );
    expect(numericSection).toHaveTextContent('Amount');
    expect(numericSection).toHaveTextContent(/Multimodal \(2 tied\): 20, 30/i);
    expect(numericSection).toHaveTextContent(/Sample Std Dev/i);
    expect(numericSection).toHaveTextContent(/Population Std Dev/i);
    expect(numericSection).toHaveTextContent(/IQR \(Q3 − Q1\)/i);

    // Categorical section shows Region with North & South tied as most frequent, East & West tied as least frequent
    const categoricalSection = within(analysisPage).getByTestId(
      'categorical-statistics-section',
    );
    expect(categoricalSection).toHaveTextContent('Region');
    expect(categoricalSection).toHaveTextContent(/Tie across 2 categories: North, South/i);
    expect(categoricalSection).toHaveTextContent(/Tie across 2 categories: East, West/i);

    // Unsupported section explicitly lists Order ID (identifier) and Order Date (date)
    const unsupportedSection = within(analysisPage).getByTestId(
      'unsupported-columns-section',
    );
    expect(unsupportedSection).toHaveTextContent('Order ID');
    expect(unsupportedSection).toHaveTextContent('Order Date');
    expect(unsupportedSection).toHaveTextContent(/Identifier/i);
    expect(unsupportedSection).toHaveTextContent(/Date/i);

    // Filter tabs switch cleanly
    await user.click(screen.getByRole('tab', { name: /Numeric \(1\)/i }));
    expect(
      screen.getByTestId('numeric-statistics-section'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('categorical-statistics-section'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /All Sections/i }));

    // Search input narrows columns live
    const searchInput = screen.getByLabelText('Filter statistical columns');
    await user.type(searchInput, 'Allergy');
    expect(screen.getByTestId('categorical-statistics-section')).toHaveTextContent(
      'Allergy',
    );
    expect(
      screen.getByTestId('categorical-statistics-section'),
    ).not.toHaveTextContent('Region');

    await user.click(screen.getByRole('button', { name: 'Clear column filter' }));

    // Go back to Overview, toggle "Treat 'None' as Missing", then return to /analysis -> Allergy valid count drops from 5 to 3
    await user.keyboard('go');
    const noneSwitch = await screen.findByRole('switch', {
      name: /Treat “None” as Missing|Treat "None" as Missing/i,
    });
    await user.click(noneSwitch);
    await waitFor(() => {
      expect(noneSwitch).toHaveAttribute('aria-checked', 'true');
    });

    await user.keyboard('ga');
    const updatedAnalysis = await screen.findByTestId('statistical-analysis-page');
    const expandAllergy = within(updatedAnalysis).getByRole('button', {
      name: 'Inspect categorical distribution for Allergy',
    });
    await user.click(expandAllergy);

    await waitFor(() => {
      expect(
        within(updatedAnalysis).getByTestId('categorical-statistics-section'),
      ).toHaveTextContent('3 valid · 3 missing · 0 invalid');
    });

    // Clear dataset from Overview -> returning to /analysis shows empty state again
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

    await user.keyboard('ga');
    expect(
      await screen.findByTestId('statistics-no-dataset-state'),
    ).toBeInTheDocument();
  });

  it('shows clear unsupported-dataset notice when no numeric or categorical columns exist', async () => {
    const user = userEvent.setup();
    renderWorkspace('/');

    const csvContent = [
      'Customer ID,Order Date',
      'CUST-001,2026-01-01',
      'CUST-002,2026-01-02',
      'CUST-003,2026-01-03',
    ].join('\n');

    await user.upload(
      screen.getByTestId('evidence-file-input'),
      createCsvFile('ids_and_dates_only.csv', csvContent),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );
    await screen.findByTestId('dataset-profiling-section');

    await user.keyboard('ga');

    const analysisPage = await screen.findByTestId('statistical-analysis-page');
    expect(
      within(analysisPage).getByTestId('statistics-unsupported-dataset-notice'),
    ).toHaveTextContent(/No numeric or categorical columns detected/i);
    expect(
      within(analysisPage).getByTestId('numeric-empty-state'),
    ).toBeInTheDocument();
    expect(
      within(analysisPage).getByTestId('categorical-empty-state'),
    ).toBeInTheDocument();
    expect(
      within(analysisPage).getByTestId('unsupported-columns-section'),
    ).toHaveTextContent('Customer ID');
  });
});
