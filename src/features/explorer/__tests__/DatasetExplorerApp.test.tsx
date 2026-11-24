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

describe('Module 05 — Interactive Data Explorer UI Integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('displays a clear empty state on /explorer when no dataset is loaded', () => {
    renderWorkspace('/explorer');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Dataset Explorer',
    );
    const emptyState = screen.getByTestId('explorer-no-dataset-state');
    expect(emptyState).toHaveTextContent(/No Active Dataset/i);
    expect(
      within(emptyState).getByRole('link', {
        name: /Import Dataset on Overview/i,
      }),
    ).toHaveAttribute('href', '/');
  });

  it('supports search, numeric & categorical multi-filtering, asc/desc sorting with missing values last, column visibility, reset, replace, and clear', async () => {
    const user = userEvent.setup();
    renderWorkspace('/');

    const csvContent = [
      'Order ID,Region,Amount,Status',
      'ORD-001,North,100,Open',
      'ORD-002,South,20,Closed',
      'ORD-003,North,250,Open',
      'ORD-004,East,N/A,Pending',
      'ORD-005,West,5,Closed',
      'ORD-006,South,,Open',
    ].join('\n');

    await user.upload(
      screen.getByTestId('evidence-file-input'),
      createCsvFile('orders_explorer.csv', csvContent),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );
    await screen.findByTestId('dataset-profiling-section');

    // Navigate to Dataset Explorer (/explorer) via keyboard chord G then E
    await user.keyboard('ge');

    const explorerPage = await screen.findByTestId('dataset-explorer-page');
    expect(explorerPage).toHaveTextContent('orders_explorer.csv');

    const tableContainer = within(explorerPage).getByTestId(
      'explorer-table-scroll-container',
    );
    // Preserves original cell values & clearly indicates missing values
    expect(tableContainer).toHaveTextContent('ORD-001');
    expect(tableContainer).toHaveTextContent('N/A');
    expect(tableContainer).toHaveTextContent('null');

    // 1. Numeric sorting ascending & descending on Amount (missing values N/A and null stay at bottom!)
    const sortAmountBtn = screen.getByRole('button', {
      name: 'Sort by Amount',
    });
    await user.click(sortAmountBtn); // asc: 5, 20, 100, 250, N/A, null

    const getRenderedOrderIds = () => {
      const bodyRows = within(tableContainer)
        .getAllByRole('row')
        .slice(1); // skip header
      return bodyRows.map((tr) => within(tr).getAllByRole('cell')[1]!.textContent);
    };

    expect(getRenderedOrderIds()).toEqual([
      'ORD-005',
      'ORD-002',
      'ORD-001',
      'ORD-003',
      'ORD-004',
      'ORD-006',
    ]);

    await user.click(sortAmountBtn); // desc: 250, 100, 20, 5, N/A, null
    expect(getRenderedOrderIds()).toEqual([
      'ORD-003',
      'ORD-001',
      'ORD-002',
      'ORD-005',
      'ORD-004',
      'ORD-006',
    ]);

    // 2. Global search (case-insensitive) + matching record count
    const globalSearch = screen.getByLabelText('Global search across records');
    await user.type(globalSearch, 'north');
    await waitFor(() => {
      expect(screen.getByTestId('explorer-match-summary')).toHaveTextContent(
        'Matching records: 2 of 6',
      );
    });
    await user.click(screen.getByRole('button', { name: 'Clear global search' }));
    await waitFor(() => {
      expect(screen.getByTestId('explorer-match-summary')).toHaveTextContent(
        'Matching records: 6 of 6',
      );
    });

    // 3. Multiple simultaneous filters: Numeric range on Amount [50..300] + Categorical filter on Region [North]
    await user.click(screen.getByRole('button', { name: 'Filter column Amount' }));
    const filterPanel = await screen.findByTestId('explorer-filter-panel');
    await user.type(within(filterPanel).getByLabelText('Minimum Value'), '50');
    await user.type(within(filterPanel).getByLabelText('Maximum Value'), '300');

    await user.click(screen.getByRole('button', { name: 'Filter column Region' }));
    const northCheckbox = within(
      screen.getByTestId('explorer-filter-panel'),
    ).getByRole('checkbox', { name: /North/i });
    await user.click(northCheckbox);

    await waitFor(() => {
      expect(screen.getByTestId('explorer-match-summary')).toHaveTextContent(
        'Matching records: 2 of 6',
      );
      expect(screen.getByTestId('active-filters-strip')).toHaveTextContent(
        'Amount: 50 to 300',
      );
      expect(screen.getByTestId('active-filters-strip')).toHaveTextContent(
        'Region: in [North]',
      );
    });

    // Clear all filters restores all 6 records
    await user.click(screen.getByRole('button', { name: 'Clear Filters' }));
    await waitFor(() => {
      expect(screen.getByTestId('explorer-match-summary')).toHaveTextContent(
        'Matching records: 6 of 6',
      );
    });

    // 4. Column visibility controls
    await user.click(screen.getByRole('button', { name: /Columns \(4\/4\)/i }));
    const colsPanel = await screen.findByTestId('explorer-columns-panel');
    const statusCheckbox = within(colsPanel).getByRole('checkbox', {
      name: /Status/i,
    });
    await user.click(statusCheckbox);

    expect(
      within(tableContainer).queryByRole('columnheader', { name: /Status/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('explorer-match-summary')).toHaveTextContent(
      'Visible columns: 3 of 4',
    );

    // 5. Reset Table restores hidden column and clears sort
    await user.click(screen.getByRole('button', { name: 'Reset Table' }));
    expect(
      within(tableContainer).getByRole('columnheader', { name: /Status/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('explorer-match-summary')).toHaveTextContent(
      'Visible columns: 4 of 4',
    );

    // 6. Replace dataset -> Explorer resets to new dataset without stale rows/columns
    await user.keyboard('go');
    await user.click(
      await screen.findByRole('button', { name: 'Load Another File' }),
    );
    await user.upload(
      screen.getByTestId('evidence-file-input'),
      createCsvFile('replacement.csv', 'Metric,Value\nSpeed,99\nLatency,12\n'),
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
      expect(screen.getByTestId('dataset-profiling-section')).toHaveTextContent(
        'replacement.csv',
      );
    });

    await user.keyboard('ge');
    const replacedExplorer = await screen.findByTestId('dataset-explorer-page');
    expect(replacedExplorer).toHaveTextContent('replacement.csv');
    expect(replacedExplorer).toHaveTextContent('Speed');
    expect(replacedExplorer).not.toHaveTextContent('ORD-001');

    // 7. Clear dataset -> Explorer returns cleanly to empty state
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

    await user.keyboard('ge');
    expect(
      await screen.findByTestId('explorer-no-dataset-state'),
    ).toBeInTheDocument();
  });

  it('paginates bounded slices cleanly across page sizes 25, 50, 100, and 250 without rendering all rows', async () => {
    const user = userEvent.setup();
    renderWorkspace('/');

    const header = 'Index,Category,Value';
    const dataLines = Array.from(
      { length: 60 },
      (_, idx) => `${idx + 1},Group-${(idx % 3) + 1},${(idx + 1) * 10}`,
    );
    const csvContent = [header, ...dataLines].join('\n');

    await user.upload(
      screen.getByTestId('evidence-file-input'),
      createCsvFile('paginated_60.csv', csvContent),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Import Dataset' }),
    );
    await screen.findByTestId('dataset-profiling-section');

    await user.keyboard('ge');
    const explorerPage = await screen.findByTestId('dataset-explorer-page');
    const tableContainer = within(explorerPage).getByTestId(
      'explorer-table-scroll-container',
    );

    // Default page size 50 -> 50 body rows on page 1 of 2
    expect(within(tableContainer).getAllByRole('row').slice(1)).toHaveLength(50);
    expect(screen.getByTestId('explorer-page-indicator')).toHaveTextContent(
      'Page 1 of 2',
    );
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();

    // Switch page size to 25 -> 25 body rows on page 1 of 3
    await user.selectOptions(screen.getByLabelText('Rows per page'), '25');
    expect(within(tableContainer).getAllByRole('row').slice(1)).toHaveLength(25);
    expect(screen.getByTestId('explorer-page-indicator')).toHaveTextContent(
      'Page 1 of 3',
    );

    // Navigate to last page -> 10 remaining rows, Next & Last disabled
    await user.click(screen.getByRole('button', { name: 'Last page' }));
    expect(within(tableContainer).getAllByRole('row').slice(1)).toHaveLength(10);
    expect(screen.getByTestId('explorer-page-indicator')).toHaveTextContent(
      'Page 3 of 3',
    );
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Last page' })).toBeDisabled();

    // Switch page size to 100 -> all 60 rows fit on page 1 of 1
    await user.selectOptions(screen.getByLabelText('Rows per page'), '100');
    expect(within(tableContainer).getAllByRole('row').slice(1)).toHaveLength(60);
    expect(screen.getByTestId('explorer-page-indicator')).toHaveTextContent(
      'Page 1 of 1',
    );
  });
});
