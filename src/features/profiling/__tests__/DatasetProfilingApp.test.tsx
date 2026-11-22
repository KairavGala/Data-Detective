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

describe('Module 03 — Dataset Schema & Profiling UI Integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('automatically profiles an imported CSV, renders schema & quality metrics, allows expanding columns, toggles None policy, and invalidates on replace/clear', async () => {
    const user = userEvent.setup();
    renderWorkspace('/');

    const csvContent = [
      'Customer ID,Order Date,Region,Revenue,Allergy',
      'CUST-001,2026-01-15,North,1250.50,None',
      'CUST-002,01/02/2026,South,840.00,Peanuts',
      'CUST-003,2026-01-18,North,N/A,None',
      'CUST-004,2026-01-19,West,910.25,N/A',
    ].join('\n');

    await user.upload(
      screen.getByTestId('evidence-file-input'),
      createCsvFile('orders_q1.csv', csvContent),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );

    // Module 03 profiling section appears and matches active dataset
    const profilingSection = await screen.findByTestId(
      'dataset-profiling-section',
    );
    const firstDatasetId = profilingSection.getAttribute(
      'data-profiled-dataset-id',
    );
    expect(firstDatasetId).toBeTruthy();

    expect(
      within(profilingSection).getByTestId('quality-score-panel'),
    ).toBeInTheDocument();
    expect(
      within(profilingSection).getByTestId('type-distribution-strip'),
    ).toBeInTheDocument();

    // Ambiguous date warning surfaced for 01/02/2026
    const warningsPanel = within(profilingSection).getByTestId(
      'quality-warnings-panel',
    );
    expect(warningsPanel).toHaveTextContent(/Ambiguous date format detected/i);

    // Expand Customer ID column row to inspect classification rationale & samples
    const expandCustomerId = screen.getByRole('button', {
      name: 'Inspect column Customer ID',
    });
    await user.click(expandCustomerId);
    expect(
      await screen.findByText(/Classification Rationale/i),
    ).toBeInTheDocument();
    expect(screen.getByText('CUST-001')).toBeInTheDocument();

    // Toggle "Treat 'None' as Missing" switch -> updates missing count dynamically
    const noneToggle = screen.getByRole('switch', {
      name: /Treat “None” as Missing|Treat "None" as Missing/i,
    });
    expect(noneToggle).toHaveAttribute('aria-checked', 'false');
    await user.click(noneToggle);
    await waitFor(() => {
      expect(noneToggle).toHaveAttribute('aria-checked', 'true');
    });

    // Replace dataset with a completely different file -> profile updates to new dataset ID
    await user.click(
      screen.getByRole('button', { name: 'Load Another File' }),
    );
    await user.upload(
      screen.getByTestId('evidence-file-input'),
      createCsvFile('clean_metrics.csv', 'MetricName,Value\nAlpha,10\nBeta,20\n'),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );
    const replaceDialog = await screen.findByRole('dialog', {
      name: /Replace active dataset/i,
    });
    await user.click(
      within(replaceDialog).getByRole('button', { name: 'Replace Dataset' }),
    );

    await waitFor(() => {
      const updatedSection = screen.getByTestId('dataset-profiling-section');
      const secondDatasetId = updatedSection.getAttribute(
        'data-profiled-dataset-id',
      );
      expect(secondDatasetId).toBeTruthy();
      expect(secondDatasetId).not.toBe(firstDatasetId);
      expect(updatedSection).toHaveTextContent('clean_metrics.csv');
      expect(updatedSection).toHaveTextContent('MetricName');
      expect(updatedSection).not.toHaveTextContent('Customer ID');
    });

    // Verify no profiling data or dataset contents entered localStorage / sessionStorage
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      const val = key ? (window.localStorage.getItem(key) ?? '') : '';
      expect(val).not.toContain('orders_q1.csv');
      expect(val).not.toContain('clean_metrics.csv');
      expect(val).not.toContain('CUST-001');
    }
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      const val = key ? (window.sessionStorage.getItem(key) ?? '') : '';
      expect(val).not.toContain('orders_q1.csv');
      expect(val).not.toContain('clean_metrics.csv');
    }

    // Clear dataset -> profiling section is completely removed
    const activeBanner = screen.getByRole('region', {
      name: 'Active imported dataset',
    });
    await user.click(
      within(activeBanner).getByRole('button', { name: 'Clear Dataset' }),
    );
    await user.click(
      within(activeBanner).getByRole('button', { name: 'Confirm Clear' }),
    );

    await waitFor(() => {
      expect(
        screen.queryByTestId('dataset-profiling-section'),
      ).not.toBeInTheDocument();
    });
  });
});
