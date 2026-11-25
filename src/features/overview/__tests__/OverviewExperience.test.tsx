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

describe('Consolidation Batch 2 — State-Aware Overview & Intake Experience', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('transitions from onboarding hero to analytical command centre upon dataset upload with factual metadata and quick-launch links', async () => {
    const user = userEvent.setup();
    renderWorkspace('/');

    // 1. Unloaded state: onboarding hero & upload input visible; roadmap placeholder absent
    expect(screen.getByTestId('overview-onboarding-hero')).toBeInTheDocument();
    expect(screen.getByTestId('evidence-file-input')).toBeInTheDocument();
    expect(
      screen.queryByTestId('overview-loaded-workspace'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Analytical Capabilities Roadmap/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/What you will be able to investigate/i),
    ).not.toBeInTheDocument();

    // 2. Upload & import a CSV
    const csv = [
      'order_id,region,amount',
      'ORD-1,North,120.50',
      'ORD-2,South,85.00',
      'ORD-3,North,210.00',
    ].join('\n');

    await user.upload(
      screen.getByTestId('evidence-file-input'),
      createCsvFile('sales_2026.csv', csv),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );

    // 3. Loaded state: onboarding hero removed, analytical workspace active
    const loadedWorkspace = await screen.findByTestId(
      'overview-loaded-workspace',
    );
    expect(
      screen.queryByTestId('overview-onboarding-hero'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Analytical Capabilities Roadmap/i),
    ).not.toBeInTheDocument();

    // 4. ActiveDatasetBanner shows filename, row/col counts, file type, single active indicator, and direct quick-launch links
    const banner = within(loadedWorkspace).getByRole('region', {
      name: 'Active imported dataset',
    });
    expect(
      within(banner).getByRole('heading', { level: 2, name: 'sales_2026.csv' }),
    ).toBeInTheDocument();
    expect(banner).toHaveTextContent('CSV');
    expect(banner).toHaveTextContent('3');
    expect(banner).toHaveTextContent('Active Dataset');
    // No duplicate "Dataset Loaded" badge inside Overview workspace
    expect(within(loadedWorkspace).queryByText('Dataset Loaded')).toBeNull();

    const quickActions = within(banner).getByTestId(
      'active-dataset-quick-actions',
    );
    expect(
      within(quickActions).getByRole('link', { name: 'Explore' }),
    ).toHaveAttribute('href', '/explorer');
    expect(
      within(quickActions).getByRole('link', { name: 'Statistics' }),
    ).toHaveAttribute('href', '/analysis');
    expect(
      within(quickActions).getByRole('link', { name: 'Visualize' }),
    ).toHaveAttribute('href', '/visualizations');
    expect(
      within(quickActions).getByRole('link', { name: 'Investigate' }),
    ).toHaveAttribute('href', '/investigation');

    // 5. Workspace cards render factual metadata once profiling/statistics complete
    const cardsSection = within(loadedWorkspace).getByTestId(
      'overview-workspace-cards',
    );
    expect(
      within(cardsSection).getByRole('link', { name: /Explorer/i }),
    ).toHaveAttribute('href', '/explorer');
    expect(
      within(cardsSection).getByRole('link', { name: /Statistics/i }),
    ).toHaveAttribute('href', '/analysis');
    expect(
      within(cardsSection).getByRole('link', { name: /Visualizations/i }),
    ).toHaveAttribute('href', '/visualizations');
    expect(
      within(cardsSection).getByRole('link', { name: /Investigation/i }),
    ).toHaveAttribute('href', '/investigation');

    expect(cardsSection).toHaveTextContent('3 rows · 3 columns');

    // Wait for M03 profiling & M04 statistics handoff to populate real counts
    await waitFor(() => {
      expect(screen.getByTestId('dataset-profiling-section')).toBeInTheDocument();
      expect(cardsSection).toHaveTextContent(/1 numeric · 1 categorical/i);
      expect(cardsSection).toHaveTextContent(/Quality \d+\/100/i);
    });

    // 6. Clicking a quick-launch action navigates directly to the target route
    await user.click(
      within(quickActions).getByRole('link', { name: 'Explore' }),
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Dataset Explorer',
      );
    });
  });

  it('allows cancelling Load Another File from empty, preview, and error stages without losing the active dataset', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderWorkspace('/');

    // Load initial dataset
    await user.upload(
      screen.getByTestId('evidence-file-input'),
      createCsvFile('baseline.csv', 'id,score\nA,10\nB,20\n'),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );

    const banner = await screen.findByRole('region', {
      name: 'Active imported dataset',
    });
    expect(banner).toHaveTextContent('baseline.csv');

    // 1. Open Load Another File and cancel immediately from empty dropzone
    await user.click(
      within(banner).getByRole('button', { name: 'Load Another File' }),
    );
    const intakeRegion = screen.getByRole('region', {
      name: 'Evidence Intake Bay',
    });
    expect(intakeRegion).toBeInTheDocument();

    await user.click(within(intakeRegion).getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('region', { name: 'Evidence Intake Bay' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('topbar-dataset-context')).toHaveTextContent(
      'baseline.csv',
    );
    expect(
      screen.getByRole('region', { name: 'Active imported dataset' }),
    ).toHaveTextContent('baseline.csv');

    // 2. Open Load Another File, upload candidate file to preview stage, then Cancel
    await user.click(
      within(banner).getByRole('button', { name: 'Load Another File' }),
    );
    await user.upload(
      screen.getByTestId('evidence-file-input'),
      createCsvFile('candidate.csv', 'id,score\nC,30\n'),
    );
    expect(await screen.findByText('candidate.csv')).toBeInTheDocument();

    const previewIntake = screen.getByRole('region', {
      name: 'Evidence Intake Bay',
    });
    await user.click(
      within(previewIntake).getByRole('button', { name: 'Cancel' }),
    );
    expect(
      screen.queryByRole('region', { name: 'Evidence Intake Bay' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('topbar-dataset-context')).toHaveTextContent(
      'baseline.csv',
    );

    // 3. Open Load Another File, trigger validation error (.xls), then Cancel
    await user.click(
      within(banner).getByRole('button', { name: 'Load Another File' }),
    );
    const badFile = new File(['abc'], 'legacy.xls', {
      type: 'application/vnd.ms-excel',
    });
    await user.upload(screen.getByTestId('evidence-file-input'), badFile);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Legacy Excel \(\.xls\) format is not supported/i,
    );

    const errorIntake = screen.getByRole('region', {
      name: 'Evidence Intake Bay',
    });
    await user.click(
      within(errorIntake).getByRole('button', { name: 'Cancel' }),
    );
    expect(
      screen.queryByRole('region', { name: 'Evidence Intake Bay' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('topbar-dataset-context')).toHaveTextContent(
      'baseline.csv',
    );

    // 4. Clearing dataset remains an explicit action and returns to unloaded onboarding state
    await user.click(
      within(banner).getByRole('button', { name: 'Clear Dataset' }),
    );
    await user.click(
      within(banner).getByRole('button', { name: 'Confirm Clear' }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('overview-onboarding-hero')).toBeInTheDocument();
      expect(screen.getByTestId('topbar-dataset-context')).toHaveTextContent(
        'No file loaded',
      );
    });
  });
});
