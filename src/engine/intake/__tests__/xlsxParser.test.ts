import * as XLSX from 'xlsx';
import { describe, expect, it, vi } from 'vitest';
import {
  EvidenceIntakeClient,
  inspectXlsxBuffer,
  IntakeValidationError,
  parseXlsxWorksheetFromBuffer,
} from '@/engine/intake';

function createWorkbookBuffer(
  sheets: Record<string, unknown[][]>,
): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, data] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const view = new Uint8Array(out);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

describe('Excel (.xlsx) parsing & validation engine', () => {
  it('parses a single-sheet workbook preserving column order and cell values', () => {
    const buffer = createWorkbookBuffer({
      Ledger: [
        ['CaseID', 'Department', 'Amount'],
        ['EV-01', 'Finance', 4250.75],
        ['EV-02', 'Logistics', 910],
      ],
    });

    const draft = parseXlsxWorksheetFromBuffer(buffer, {
      fileName: 'ledger.xlsx',
      fileSizeBytes: buffer.byteLength,
      hasHeaders: true,
    });

    expect(draft.fileType).toBe('xlsx');
    expect(draft.sheetName).toBe('Ledger');
    expect(draft.rowCount).toBe(2);
    expect(draft.columnCount).toBe(3);
    expect(draft.columns.map((c) => c.name)).toEqual([
      'CaseID',
      'Department',
      'Amount',
    ]);
    expect(draft.rows[0]).toEqual(['EV-01', 'Finance', 4250.75]);
    expect(draft.rows[1]).toEqual(['EV-02', 'Logistics', 910]);
  });

  it('inspects multi-sheet workbooks and allows selecting a specific worksheet', () => {
    const buffer = createWorkbookBuffer({
      Summary: [['Metric', 'Value'], ['Count', 12]],
      Transactions: [
        ['TxID', 'Vendor', 'Total'],
        ['T-1', 'Apex', 500],
        ['T-2', 'Northwind', 750],
      ],
    });

    const inspected = inspectXlsxBuffer(buffer, 'audit.xlsx');
    expect(inspected.sheets.map((s) => s.name)).toEqual([
      'Summary',
      'Transactions',
    ]);

    const secondSheet = parseXlsxWorksheetFromBuffer(buffer, {
      fileName: 'audit.xlsx',
      fileSizeBytes: buffer.byteLength,
      sheetName: 'Transactions',
      hasHeaders: true,
    });

    expect(secondSheet.sheetName).toBe('Transactions');
    expect(secondSheet.rowCount).toBe(2);
    expect(secondSheet.columns.map((c) => c.name)).toEqual([
      'TxID',
      'Vendor',
      'Total',
    ]);
  });

  it('rejects an empty worksheet with EMPTY_WORKSHEET', () => {
    const buffer = createWorkbookBuffer({
      EmptySheet: [],
    });

    try {
      parseXlsxWorksheetFromBuffer(buffer, {
        fileName: 'blank.xlsx',
        fileSizeBytes: buffer.byteLength,
        sheetName: 'EmptySheet',
        hasHeaders: true,
      });
      expect.unreachable('Expected EMPTY_WORKSHEET error');
    } catch (err) {
      expect(err).toBeInstanceOf(IntakeValidationError);
      expect((err as IntakeValidationError).code).toBe('EMPTY_WORKSHEET');
    }
  });

  it('preserves duplicate headers and detects missing headers in worksheets', () => {
    const buffer = createWorkbookBuffer({
      Audit: [
        ['Score', '', 'Score'],
        [88, 'Flag A', 91],
      ],
    });

    const draft = parseXlsxWorksheetFromBuffer(buffer, {
      fileName: 'headers.xlsx',
      fileSizeBytes: buffer.byteLength,
      hasHeaders: true,
    });

    expect(draft.columns.map((c) => c.name)).toEqual([
      'Score',
      'Column 2',
      'Score (2)',
    ]);
    expect(draft.warnings.some((w) => w.code === 'EMPTY_HEADER')).toBe(true);
    expect(draft.warnings.some((w) => w.code === 'DUPLICATE_HEADER')).toBe(true);

    const noHeadersDraft = parseXlsxWorksheetFromBuffer(buffer, {
      fileName: 'headers.xlsx',
      fileSizeBytes: buffer.byteLength,
      hasHeaders: false,
    });
    expect(noHeadersDraft.rowCount).toBe(2);
    expect(noHeadersDraft.columns.map((c) => c.name)).toEqual([
      'Column 1',
      'Column 2',
      'Column 3',
    ]);
  });

  it('rejects corrupted workbooks and non-ZIP payloads masquerading as .xlsx', () => {
    const plainTextBuffer = new TextEncoder().encode('not a zip file').buffer;
    try {
      inspectXlsxBuffer(plainTextBuffer, 'fake.xlsx');
      expect.unreachable('Expected INVALID_XLSX_SIGNATURE');
    } catch (err) {
      expect((err as IntakeValidationError).code).toBe('INVALID_XLSX_SIGNATURE');
    }

    // Valid ZIP local header bytes followed by garbage data
    const corruptZip = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, 0xff, 0xff, 0x00, 0xde, 0xad, 0xbe, 0xef,
    ]).buffer;
    try {
      inspectXlsxBuffer(corruptZip, 'corrupt.xlsx');
      expect.unreachable('Expected CORRUPTED_WORKBOOK');
    } catch (err) {
      expect((err as IntakeValidationError).code).toBe('CORRUPTED_WORKBOOK');
    }
  });

  it('enforces row and column limits on Excel worksheets', () => {
    const buffer = createWorkbookBuffer({
      Wide: [
        ['C1', 'C2', 'C3', 'C4'],
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        [9, 10, 11, 12],
      ],
    });

    try {
      parseXlsxWorksheetFromBuffer(buffer, {
        fileName: 'wide.xlsx',
        fileSizeBytes: buffer.byteLength,
        hasHeaders: true,
        limits: { maxFileSizeBytes: 100_000, maxRows: 100, maxColumns: 3 },
      });
      expect.unreachable('Expected COLUMN_LIMIT_EXCEEDED');
    } catch (err) {
      expect((err as IntakeValidationError).code).toBe('COLUMN_LIMIT_EXCEEDED');
    }

    try {
      parseXlsxWorksheetFromBuffer(buffer, {
        fileName: 'wide.xlsx',
        fileSizeBytes: buffer.byteLength,
        hasHeaders: true,
        limits: { maxFileSizeBytes: 100_000, maxRows: 2, maxColumns: 10 },
      });
      expect.unreachable('Expected ROW_LIMIT_EXCEEDED');
    } catch (err) {
      expect((err as IntakeValidationError).code).toBe('ROW_LIMIT_EXCEEDED');
    }
  });

  it('never evaluates formulas, keeps cell HTML as raw text, and blocks prototype-key sheet lookups', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Label', 'FormulaCell', 'HtmlPayload'],
      ['Row1', 0, '<script>alert("xss")</script>'],
    ]);
    // Inject a formula cell whose cached value (42) differs from formula text
    ws['B2'] = { t: 'n', v: 42, f: '1+1' };
    XLSX.utils.book_append_sheet(wb, ws, 'SafeSheet');

    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const view = new Uint8Array(out);
    const copy = new Uint8Array(view.byteLength);
    copy.set(view);

    const inspected = inspectXlsxBuffer(copy.buffer, 'formulas.xlsx');
    // Formula string must not be populated on cell object when cellFormula: false
    expect(inspected.workbook.Sheets['SafeSheet']?.['B2']?.f).toBeUndefined();

    const draft = parseXlsxWorksheetFromBuffer(copy.buffer, {
      fileName: 'formulas.xlsx',
      fileSizeBytes: copy.byteLength,
      sheetName: 'SafeSheet',
      hasHeaders: true,
    });
    expect(draft.rows[0]).toEqual(['Row1', 42, '<script>alert("xss")</script>']);

    // Prototype property lookup (e.g. "constructor") must fail safely as EMPTY_WORKSHEET
    expect(() =>
      parseXlsxWorksheetFromBuffer(copy.buffer, {
        fileName: 'formulas.xlsx',
        fileSizeBytes: copy.byteLength,
        sheetName: 'constructor',
        hasHeaders: true,
      }),
    ).toThrow(IntakeValidationError);
  });

  it('uses SheetJS 0.20.3 and terminates active Web Workers cleanly on abort and reset', async () => {
    expect(XLSX.version).toBe('0.20.3');

    const terminateSpy = vi.fn();
    const postMessageSpy = vi.fn();
    const listeners = new Map<string, Set<EventListener>>();

    class MockWorker {
      addEventListener(type: string, listener: EventListener) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      }
      removeEventListener(type: string, listener: EventListener) {
        listeners.get(type)?.delete(listener);
      }
      postMessage(data: unknown) {
        postMessageSpy(data);
      }
      terminate() {
        terminateSpy();
      }
    }

    vi.stubGlobal('Worker', MockWorker);
    try {
      const buffer = createWorkbookBuffer({
        Sheet1: [
          ['ID', 'Val'],
          [1, 'A'],
        ],
      });
      const file = new File([buffer], 'cancel_me.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const client = new EvidenceIntakeClient();
      const controller = new AbortController();
      const progressCalls: Array<[number, number]> = [];

      const intakePromise = client.startFileIntake(file, {
        hasHeaders: true,
        signal: controller.signal,
        onProgress: (loaded, total) => progressCalls.push([loaded, total]),
      });

      // Wait until worker receives the inspect-xlsx message
      await vi.waitFor(() => {
        expect(postMessageSpy).toHaveBeenCalledTimes(1);
      });

      // Abort mid-flight
      controller.abort();

      await expect(intakePromise).rejects.toMatchObject({
        code: 'CANCELLED',
      });
      expect(terminateSpy).toHaveBeenCalledTimes(1);
      expect(listeners.get('message')?.size ?? 0).toBe(0);
      expect(listeners.get('error')?.size ?? 0).toBe(0);

      // Calling cancelAndReset again after termination is a safe no-op
      client.cancelAndReset();
      expect(terminateSpy).toHaveBeenCalledTimes(1);
      expect(progressCalls).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
