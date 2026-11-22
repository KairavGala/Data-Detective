import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { AppWorkspace } from '@/App';
import { DatasetProvider } from '@/context/DatasetContext';
import { EvidenceIntakePanel } from '@/features/intake/EvidenceIntakePanel';

function createCsvFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/csv' });
}

function createXlsxFile(
  name: string,
  sheets: Record<string, unknown[][]>,
): File {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, data] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), sheetName);
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const view = new Uint8Array(out);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return new File([copy.buffer], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function renderWorkspace(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppWorkspace initialSkipBoot />
    </MemoryRouter>,
  );
}

describe('Evidence Intake application workflows', () => {
  it('uploads a CSV, previews parsed data, toggles headers, imports into state, updates Topbar, and clears dataset', async () => {
    const user = userEvent.setup();
    renderWorkspace('/');

    // Initial state: Topbar shows no file loaded
    expect(screen.getByTestId('topbar-dataset-context')).toHaveTextContent(
      'No file loaded',
    );

    const fileInput = screen.getByTestId(
      'evidence-file-input',
    ) as HTMLInputElement;
    const csvFile = createCsvFile(
      'transactions.csv',
      'case_id,merchant,amount\nC-01,"North, Ltd",420.50\nC-02,South Corp,190.00\n',
    );

    await user.upload(fileInput, csvFile);

    // Preview appears with actual parsed content
    expect(
      await screen.findByText('transactions.csv'),
    ).toBeInTheDocument();
    expect(screen.getByText('North, Ltd')).toBeInTheDocument();
    expect(screen.getByText('420.50')).toBeInTheDocument();

    // Toggle "First row contains column headers" OFF -> header row becomes data row 1
    const headerCheckbox = screen.getByRole('checkbox', {
      name: /First row contains column headers/i,
    });
    await user.click(headerCheckbox);
    expect(await screen.findByText('Column 1')).toBeInTheDocument();
    expect(screen.getByText('case_id')).toBeInTheDocument();

    // Toggle headers back ON
    await user.click(headerCheckbox);
    expect(await screen.findByText('merchant')).toBeInTheDocument();

    // Click Import Dataset
    await user.click(screen.getByRole('button', { name: 'Import Dataset' }));

    // Topbar updates with active dataset name and dimensions
    await waitFor(() => {
      const topbar = screen.getByTestId('topbar-dataset-context');
      expect(topbar).toHaveTextContent('transactions.csv');
      expect(topbar).toHaveTextContent('2×3');
    });

    // Active dataset banner appears on Overview with session memory notice
    const activeBanner = screen.getByRole('region', {
      name: 'Active imported dataset',
    });
    expect(activeBanner).toHaveTextContent('transactions.csv');
    expect(activeBanner).toHaveTextContent(/refreshing or closing this tab clears/i);

    // Clear dataset with confirmation
    await user.click(
      within(activeBanner).getByRole('button', { name: 'Clear Dataset' }),
    );
    await user.click(
      within(activeBanner).getByRole('button', { name: 'Confirm Clear' }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('topbar-dataset-context')).toHaveTextContent(
        'No file loaded',
      );
    });
  });

  it('requires explicit worksheet selection for multi-sheet Excel workbooks', async () => {
    const user = userEvent.setup();
    renderWorkspace('/');

    const xlsxFile = createXlsxFile('multi_sheet.xlsx', {
      Summary: [['Item', 'Total'], ['Alpha', 10]],
      Details: [
        ['Record', 'Region', 'Value'],
        ['R-100', 'West', 999],
      ],
    });

    const fileInput = screen.getByTestId('evidence-file-input');
    await user.upload(fileInput, xlsxFile);

    // Must stop at worksheet selection stage without auto-importing
    expect(
      await screen.findByRole('radiogroup', { name: 'Available worksheets' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Details/i }));
    await user.click(
      screen.getByRole('button', { name: 'Preview Worksheet' }),
    );

    // Preview displays the selected worksheet
    expect(await screen.findByText('R-100')).toBeInTheDocument();
    expect(screen.getByText('999')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Import Dataset' }));

    await waitFor(() => {
      expect(screen.getByTestId('topbar-dataset-context')).toHaveTextContent(
        'multi_sheet.xlsx',
      );
    });
  });

  it('asks for confirmation before replacing an existing active dataset', async () => {
    const user = userEvent.setup();
    renderWorkspace('/');

    // Import first file
    const firstFile = createCsvFile('first.csv', 'k,v\n1,one\n');
    await user.upload(screen.getByTestId('evidence-file-input'), firstFile);
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('topbar-dataset-context')).toHaveTextContent(
        'first.csv',
      );
    });

    // Open intake bay to load replacement file
    await user.click(
      screen.getByRole('button', { name: 'Load Another File' }),
    );

    const secondFile = createCsvFile('second.csv', 'k,v\n2,two\n3,three\n');
    await user.upload(screen.getByTestId('evidence-file-input'), secondFile);
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );

    // Confirmation dialog appears
    const dialog = await screen.findByRole('dialog', {
      name: /Replace active dataset/i,
    });
    expect(dialog).toHaveTextContent('first.csv');
    expect(dialog).toHaveTextContent('second.csv');

    // Cancel preserves first dataset
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('topbar-dataset-context')).toHaveTextContent(
      'first.csv',
    );

    // Click Import again and confirm replacement
    await user.click(screen.getByRole('button', { name: 'Import Dataset' }));
    const confirmDialog = await screen.findByRole('dialog', {
      name: /Replace active dataset/i,
    });
    await user.click(
      within(confirmDialog).getByRole('button', { name: 'Replace Dataset' }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('topbar-dataset-context')).toHaveTextContent(
        'second.csv',
      );
      expect(screen.getByTestId('topbar-dataset-context')).toHaveTextContent(
        '2×2',
      );
    });
  });

  it('enforces file-size, row-limit, column-limit, and legacy .xls rejections cleanly in UI', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(
      <DatasetProvider>
        <EvidenceIntakePanel
          limits={{
            maxFileSizeBytes: 64,
            maxRows: 2,
            maxColumns: 2,
          }}
        />
      </DatasetProvider>,
    );

    // 1. Legacy .xls rejection
    const legacyXls = new File(['abc'], 'legacy.xls', {
      type: 'application/vnd.ms-excel',
    });
    await user.upload(screen.getByTestId('evidence-file-input'), legacyXls);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Legacy Excel \(\.xls\) format is not supported/i,
    );

    await user.click(screen.getByRole('button', { name: 'Reset Intake' }));

    // 2. Oversized file rejection (> 64 bytes)
    const oversized = createCsvFile('oversized.csv', 'a,b\n' + 'x,y\n'.repeat(30));
    await user.upload(screen.getByTestId('evidence-file-input'), oversized);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /File exceeds maximum size limit/i,
    );

    await user.click(screen.getByRole('button', { name: 'Reset Intake' }));

    // 3. Row limit rejection (> 2 rows)
    const tooManyRows = createCsvFile('rows.csv', 'a,b\n1,2\n3,4\n5,6\n');
    await user.upload(screen.getByTestId('evidence-file-input'), tooManyRows);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Row limit exceeded/i,
    );

    await user.click(screen.getByRole('button', { name: 'Reset Intake' }));

    // 4. Column limit rejection (> 2 cols)
    const tooManyCols = createCsvFile('cols.csv', 'a,b,c\n1,2,3\n');
    await user.upload(screen.getByTestId('evidence-file-input'), tooManyCols);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Column limit exceeded/i,
    );
  });

  it('preserves Module 01 navigation and reflects active dataset across other sections', async () => {
    const user = userEvent.setup();
    renderWorkspace('/');

    const csvFile = createCsvFile('audit.csv', 'id,status\n1,ok\n');
    await user.upload(screen.getByTestId('evidence-file-input'), csvFile);
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('topbar-dataset-context')).toHaveTextContent(
        'audit.csv',
      );
    });

    // Navigate to Dataset Explorer via sidebar link
    const explorerLinks = screen.getAllByRole('link', {
      name: /Dataset Explorer/i,
    });
    await user.click(explorerLinks[0]!);

    expect(
      await screen.findByText(/Active dataset in memory: audit\.csv/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId('topbar-dataset-context')).toHaveTextContent(
      'audit.csv',
    );
  });

  it('renders untrusted HTML cell values strictly as plain text and never persists dataset contents to web storage', async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();

    const user = userEvent.setup();
    const { container } = renderWorkspace('/');

    const xssPayload = '<img src=x onerror=alert(1)>';
    const csvFile = createCsvFile(
      'untrusted.csv',
      `id,payload\n1,"${xssPayload}"\n`,
    );

    await user.upload(screen.getByTestId('evidence-file-input'), csvFile);

    // Payload renders as literal text node, never as an injected <img> element
    expect(await screen.findByText(xssPayload)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Import Dataset' }));
    await waitFor(() => {
      expect(screen.getByTestId('topbar-dataset-context')).toHaveTextContent(
        'untrusted.csv',
      );
    });

    // Neither localStorage nor sessionStorage may contain raw dataset contents or filename
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      const val = key ? window.localStorage.getItem(key) ?? '' : '';
      expect(val).not.toContain('untrusted.csv');
      expect(val).not.toContain(xssPayload);
    }
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      const val = key ? window.sessionStorage.getItem(key) ?? '' : '';
      expect(val).not.toContain('untrusted.csv');
      expect(val).not.toContain(xssPayload);
    }
  });
});
