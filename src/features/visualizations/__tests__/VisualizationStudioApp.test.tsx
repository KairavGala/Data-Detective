import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

describe('Module 06 — Visualization Studio UI Integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('shows an explicit empty state on /visualizations before any dataset is loaded', () => {
    renderWorkspace('/visualizations');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Visualizations',
    );
    const emptyState = screen.getByTestId('visualizations-no-dataset-state');
    expect(emptyState).toHaveTextContent(/No Active Dataset/i);
    expect(
      within(emptyState).getByRole('link', {
        name: /Import Dataset on Overview/i,
      }),
    ).toHaveAttribute('href', '/');
  });

  it('auto-recommends charts from M03/M04, supports tooltips, configuration, custom chart creation, removal, and dataset clearing', async () => {
    const user = userEvent.setup();
    renderWorkspace('/');

    const csvContent = [
      'Order ID,Order Date,Region,Revenue,Units',
      'ORD-1001,2026-01-01,North,120,4',
      'ORD-1002,2026-01-02,South,240,8',
      'ORD-1003,2026-01-03,North,180,6',
      'ORD-1004,2026-01-04,East,300,10',
      'ORD-1005,2026-01-05,West,150,5',
      'ORD-1006,2026-01-06,North,210,7',
      'ORD-1007,2026-01-07,South,N/A,N/A',
    ].join('\n');

    await user.upload(
      screen.getByTestId('evidence-file-input'),
      createCsvFile('studio_metrics.csv', csvContent),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );
    await screen.findByTestId('dataset-profiling-section');

    // Navigate to Visualization Studio (/visualizations) via keyboard chord G then V
    await user.keyboard('gv');

    const studio = await screen.findByTestId('visualizations-studio-workspace');
    expect(studio).toHaveTextContent('studio_metrics.csv');

    // Initial workspace auto-seeds top 4 recommended charts
    const grid = within(studio).getByTestId('visualizations-chart-grid');
    const initialCards = within(grid).getAllByRole('article');
    expect(initialCards.length).toBe(4);

    // Verify bar chart exists and interactive tooltip activates on bar hover
    const barCard = initialCards.find(
      (el) => el.getAttribute('data-chart-type') === 'bar',
    );
    expect(barCard).toBeDefined();
    if (barCard) {
      const northBar = within(barCard).getByLabelText(/North: 3/i);
      fireEvent.mouseEnter(northBar);
      expect(within(barCard).getByTestId('chart-tooltip')).toHaveTextContent(
        'North',
      );

      // Open Configure drawer on bar chart and edit title, axis label, category sort, and legend
      await user.click(
        within(barCard).getByRole('button', { name: /Configure/i }),
      );
      const titleInput = within(barCard).getByLabelText('Chart Title');
      await user.clear(titleInput);
      await user.type(titleInput, 'Regional Volume Breakdown');
      expect(within(barCard).getByRole('heading', { level: 3 })).toHaveTextContent(
        'Regional Volume Breakdown',
      );

      const xAxisInput = within(barCard).getByLabelText('X-Axis Label');
      await user.clear(xAxisInput);
      await user.type(xAxisInput, 'Sales Territory');
      expect(barCard).toHaveTextContent('Sales Territory');

      await user.selectOptions(
        within(barCard).getByLabelText('Category Sort'),
        'label_asc',
      );

      // Toggle legend off and verify legend disappears
      expect(within(barCard).getByTestId('chart-legend')).toBeInTheDocument();
      await user.click(within(barCard).getByLabelText('Show Legend'));
      expect(
        within(barCard).queryByTestId('chart-legend'),
      ).not.toBeInTheDocument();
    }

    // Add an additional recommended chart from the recommendations shelf (e.g., Scatter or Box Plot)
    const shelf = within(studio).getByTestId('recommendations-shelf');
    const addShelfButtons = within(shelf).getAllByRole('button', {
      name: /Add recommended chart/i,
    });
    expect(addShelfButtons.length).toBeGreaterThan(0);
    await user.click(addShelfButtons[0]!);

    expect(within(grid).getAllByRole('article').length).toBe(5);

    // Add a custom Box Plot chart via the + Add Chart builder
    await user.click(screen.getByRole('button', { name: 'Add Chart' }));
    const builder = screen.getByTestId('new-chart-builder');
    await user.selectOptions(
      within(builder).getByLabelText('New Chart Type'),
      'boxplot',
    );
    const newTitleInput = within(builder).getByLabelText('New Chart Title');
    await user.clear(newTitleInput);
    await user.type(newTitleInput, 'Custom Revenue Quartiles');
    await user.click(
      within(builder).getByRole('button', { name: 'Add to Studio' }),
    );

    expect(within(grid).getAllByRole('article').length).toBe(6);
    expect(grid).toHaveTextContent('Custom Revenue Quartiles');

    // Remove the custom chart
    await user.click(
      within(grid).getByRole('button', {
        name: 'Remove Custom Revenue Quartiles',
      }),
    );
    expect(within(grid).getAllByRole('article').length).toBe(5);
    expect(grid).not.toHaveTextContent('Custom Revenue Quartiles');

    // Reset back to recommended set
    await user.click(screen.getByRole('button', { name: 'Reset Recommended' }));
    expect(within(grid).getAllByRole('article').length).toBe(4);

    // Clear dataset from Overview -> returning to /visualizations resets cleanly to empty state
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

    await user.keyboard('gv');
    await waitFor(() => {
      expect(
        screen.getByTestId('visualizations-no-dataset-state'),
      ).toBeInTheDocument();
    });
  });

  it('shows a clear unsupported schema state when dataset has no numeric or categorical columns', async () => {
    const user = userEvent.setup();
    renderWorkspace('/');

    const csvContent = [
      'Customer ID,Event Date',
      'CUST-001,2026-01-01',
      'CUST-002,2026-01-02',
      'CUST-003,2026-01-03',
    ].join('\n');

    await user.upload(
      screen.getByTestId('evidence-file-input'),
      createCsvFile('ids_only.csv', csvContent),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );
    await screen.findByTestId('dataset-profiling-section');

    await user.keyboard('gv');
    const unsupported = await screen.findByTestId(
      'visualizations-unsupported-state',
    );
    expect(unsupported).toHaveTextContent(/No valid chart combinations/i);
    expect(unsupported).toHaveTextContent('ids_only.csv');
  });
});
