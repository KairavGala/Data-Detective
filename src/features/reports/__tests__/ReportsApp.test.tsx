import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppWorkspace } from '@/App';

function createCsvFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/csv' });
}

function buildDatasetCsv(prefix: string): string {
  const lines = ['OrderID,Region,Amount,CorrelatedAmount,SparseNote'];
  for (let i = 1; i <= 24; i += 1) {
    const region = i <= 18 ? 'North' : i <= 22 ? 'South' : 'RareZone';
    const amount = i === 24 ? 9500 : 25 + (i % 6) * 4;
    const corr = amount * 2 + 5;
    const sparse = i <= 12 ? '' : `ROW_SECRET_${prefix}_${i}`;
    lines.push(`${prefix}-${100 + i},${region},${amount},${corr},${sparse}`);
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

describe('Module 10 — Investigation Reports & Dossiers End-to-End UI Workflows', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows empty state on /reports when no dataset is loaded', () => {
    renderWorkspace('/reports');
    expect(screen.getByTestId('reports-no-dataset-state')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /Investigation Reports & Dossiers/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Import Dataset on Overview/i }),
    ).toHaveAttribute('href', '/');
  });

  it('supports contextual navigation, report building, live A4 preview editing, real PDF export, library CRUD, and dataset replacement/clearing isolation', async () => {
    const user = userEvent.setup();
    const capturedBlobs: Blob[] = [];

    // Spy ONLY on browser download trigger so real jsPDF generation executes unmocked!
    const createObjectUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((obj: Blob | MediaSource) => {
        if (obj instanceof Blob) capturedBlobs.push(obj);
        return 'blob:mock-download-url';
      });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderWorkspace('/');

    // 1. Import Dataset A on Overview
    await user.upload(
      screen.getByTestId('evidence-file-input'),
      createCsvFile('ledger_alpha.csv', buildDatasetCsv('ALPHA')),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );
    await screen.findByTestId('dataset-profiling-section');

    // 2. Navigate to Statistical Analysis and click contextual "Create Report" link
    const desktopSidebar = screen.getByTestId('desktop-sidebar');
    await user.click(
      within(desktopSidebar).getByRole('link', {
        name: /Statistical Analysis/i,
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByTestId('statistics-create-report-link'),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('statistics-create-report-link'));

    // 3. Report Builder should open pre-configured for ledger_alpha.csv
    await waitFor(() => {
      expect(screen.getByTestId('report-builder-form')).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText(/Report Title/i),
      'Alpha Forensic Statistical Brief',
    );
    await user.type(screen.getByLabelText(/Author/i), 'Audit Lead');
    await user.click(
      screen.getByRole('button', { name: /Generate Report & Preview/i }),
    );

    // 4. Split Editor + A4 Preview opens with real report content
    await waitFor(() => {
      expect(screen.getByTestId('report-a4-preview')).toBeInTheDocument();
    });

    const preview = screen.getByTestId('report-a4-preview');
    expect(
      within(preview).getAllByText('Alpha Forensic Statistical Brief').length,
    ).toBeGreaterThan(0);
    expect(within(preview).getByText('Audit Lead')).toBeInTheDocument();
    expect(
      within(preview).getAllByText(/ledger_alpha\.csv/i).length,
    ).toBeGreaterThan(0);

    // 5. Edit a section title and verify live update in A4 Preview
    const sidebar = screen.getByTestId('report-editor-sidebar');
    const execHeadingInput = within(sidebar).getByLabelText(
      'Heading for executive_summary',
    );
    await user.clear(execHeadingInput);
    await user.type(execHeadingInput, 'Key Findings Overview');

    await waitFor(() => {
      expect(
        within(preview).getByText(/Key Findings Overview/),
      ).toBeInTheDocument();
    });

    // 6. Trigger REAL PDF export from UI and verify actual generated PDF bytes
    await user.click(screen.getByTestId('export-pdf-button'));

    await waitFor(() => {
      expect(screen.getByTestId('export-pdf-success')).toBeInTheDocument();
    });
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(capturedBlobs).toHaveLength(1);
    expect(capturedBlobs[0]!.type).toBe('application/pdf');
    expect(capturedBlobs[0]!.size).toBeGreaterThan(5_000);

    // 7. Return to Report Library, duplicate report, and delete copy
    await user.click(screen.getByRole('button', { name: /Report Library/i }));
    await waitFor(() => {
      expect(screen.getByTestId('report-library-view')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Alpha Forensic Statistical Brief'),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: /Duplicate Alpha Forensic Statistical Brief/i,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText('Alpha Forensic Statistical Brief (Copy)'),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', {
        name: /Delete Alpha Forensic Statistical Brief \(Copy\)/i,
      }),
    );
    await waitFor(() => {
      expect(
        screen.queryByText('Alpha Forensic Statistical Brief (Copy)'),
      ).not.toBeInTheDocument();
    });

    // 8. Replace dataset on Overview -> verify strict dataset identity isolation in Report Library
    await user.click(
      within(desktopSidebar).getByRole('link', {
        name: /Data Detective Overview/i,
      }),
    );
    const activeBanner = await screen.findByRole('region', {
      name: 'Active imported dataset',
    });
    await user.click(
      within(activeBanner).getByRole('button', { name: /Load Another File/i }),
    );
    await user.upload(
      screen.getByTestId('evidence-file-input'),
      createCsvFile('ledger_beta.csv', buildDatasetCsv('BETA')),
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
      ).toHaveTextContent('ledger_beta.csv');
    });

    // Navigate back to Reports & Export
    await user.click(
      within(desktopSidebar).getByRole('link', { name: /Reports & Export/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByTestId('previous-dataset-reports-section'),
      ).toBeInTheDocument();
    });

    // Previous dataset report is cleanly isolated under Previous Dataset Reports
    const prevSection = screen.getByTestId('previous-dataset-reports-section');
    expect(
      within(prevSection).getByText('Alpha Forensic Statistical Brief'),
    ).toBeInTheDocument();
    expect(
      within(prevSection).getByText(/Previous Dataset Snapshot/i),
    ).toBeInTheDocument();

    // Opening the previous-dataset report displays the read-only isolation banner
    await user.click(
      within(prevSection).getByRole('button', { name: /Open & Edit/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(
          /Previous Dataset Snapshot \(Read-Only Evidence Isolation\)/i,
        ),
      ).toBeInTheDocument();
    });

    // 9. Clear dataset on Overview -> Reports page shows no active dataset while keeping historical snapshot isolated
    await user.click(
      within(desktopSidebar).getByRole('link', {
        name: /Data Detective Overview/i,
      }),
    );
    const betaBanner = await screen.findByRole('region', {
      name: 'Active imported dataset',
    });
    await user.click(
      within(betaBanner).getByRole('button', { name: 'Clear Dataset' }),
    );
    await user.click(
      within(betaBanner).getByRole('button', { name: 'Confirm Clear' }),
    );

    await user.click(
      within(desktopSidebar).getByRole('link', { name: /Reports & Export/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/No active dataset loaded/i),
      ).toBeInTheDocument();
    });
  }, 25_000);
});
