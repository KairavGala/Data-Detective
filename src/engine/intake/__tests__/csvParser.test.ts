import { describe, expect, it } from 'vitest';
import {
  IntakeValidationError,
  parseCsvFileChunked,
  parseCsvText,
  validateFileContentSignature,
  validateFilePreFlight,
} from '@/engine/intake';

const BASE_OPTS = {
  fileName: 'evidence.csv',
  fileSizeBytes: 512,
  hasHeaders: true,
} as const;

describe('CSV parsing & validation engine', () => {
  it('parses a simple CSV and preserves original cell values without type coercion', () => {
    const csv = 'id,account,amount,flag\n001,Alpha,1200.50,true\n002,Beta,0,false\n';
    const draft = parseCsvText(csv, BASE_OPTS);

    expect(draft.fileType).toBe('csv');
    expect(draft.rowCount).toBe(2);
    expect(draft.columnCount).toBe(4);
    expect(draft.columns.map((c) => c.name)).toEqual([
      'id',
      'account',
      'amount',
      'flag',
    ]);
    // Leading zeros and numeric strings remain strings (no Module 03 type inference)
    expect(draft.rows[0]).toEqual(['001', 'Alpha', '1200.50', 'true']);
    expect(draft.rows[1]).toEqual(['002', 'Beta', '0', 'false']);
    expect(draft.warnings).toHaveLength(0);
  });

  it('handles quoted values containing commas', () => {
    const csv =
      'case_id,location,note\nC-10,"London, UK","Verified, primary source"\n';
    const draft = parseCsvText(csv, BASE_OPTS);

    expect(draft.rowCount).toBe(1);
    expect(draft.rows[0]).toEqual([
      'C-10',
      'London, UK',
      'Verified, primary source',
    ]);
  });

  it('handles escaped double quotes inside quoted fields', () => {
    const csv = 'id,statement\n1,"Witness stated ""confirmed transfer"" at 09:00"\n';
    const draft = parseCsvText(csv, BASE_OPTS);

    expect(draft.rows[0]).toEqual([
      '1',
      'Witness stated "confirmed transfer" at 09:00',
    ]);
  });

  it('handles embedded newlines inside quoted cells', () => {
    const csv =
      'id,notes,status\n1,"Line one\nLine two\nLine three",open\n2,"Single line",closed\n';
    const draft = parseCsvText(csv, BASE_OPTS);

    expect(draft.rowCount).toBe(2);
    expect(draft.rows[0]).toEqual(['1', 'Line one\nLine two\nLine three', 'open']);
    expect(draft.rows[1]).toEqual(['2', 'Single line', 'closed']);
  });

  it('strips UTF-8 BOM cleanly and records an informational notice', () => {
    const csv = '\uFEFFcode,value\nA1,100\n';
    const draft = parseCsvText(csv, BASE_OPTS);

    expect(draft.columns[0]?.name).toBe('code');
    expect(draft.columns[0]?.originalName).toBe('code');
    expect(draft.warnings.some((w) => w.code === 'UTF8_BOM_STRIPPED')).toBe(true);
  });

  it('detects alternative delimiters such as semicolons', () => {
    const csv = 'date;region;total\n2026-01-01;North;450\n2026-01-02;South;510\n';
    const draft = parseCsvText(csv, BASE_OPTS);

    expect(draft.delimiter).toBe(';');
    expect(draft.columnCount).toBe(3);
    expect(draft.rowCount).toBe(2);
    expect(draft.rows[0]).toEqual(['2026-01-01', 'North', '450']);
  });

  it('rejects empty or whitespace-only CSV content', () => {
    expect(() => parseCsvText('', BASE_OPTS)).toThrow(IntakeValidationError);
    expect(() => parseCsvText('   \n  \r\n ', BASE_OPTS)).toThrow(
      IntakeValidationError,
    );

    try {
      parseCsvText('', BASE_OPTS);
    } catch (err) {
      expect((err as IntakeValidationError).code).toBe('EMPTY_FILE');
    }
  });

  it('detects empty/missing headers and supports no-header mode preserving row 1 as data', () => {
    const csv = 'id,,status\n1,alpha,ok\n2,beta,ok\n';
    const withHeaders = parseCsvText(csv, { ...BASE_OPTS, hasHeaders: true });

    expect(withHeaders.columns.map((c) => c.name)).toEqual([
      'id',
      'Column 2',
      'status',
    ]);
    expect(withHeaders.columns[1]?.wasEmptyHeader).toBe(true);
    expect(withHeaders.warnings.some((w) => w.code === 'EMPTY_HEADER')).toBe(
      true,
    );

    const noHeaders = parseCsvText('10,alpha\n20,beta\n', {
      ...BASE_OPTS,
      hasHeaders: false,
    });
    expect(noHeaders.columns.map((c) => c.name)).toEqual([
      'Column 1',
      'Column 2',
    ]);
    expect(noHeaders.rowCount).toBe(2);
    expect(noHeaders.rows[0]).toEqual(['10', 'alpha']);
  });

  it('preserves duplicate headers with unique IDs and numbered suffixes without overwriting', () => {
    const csv = 'Revenue,Cost,Revenue,Revenue\n100,40,120,130\n';
    const draft = parseCsvText(csv, BASE_OPTS);

    expect(draft.columnCount).toBe(4);
    expect(draft.columns.map((c) => c.name)).toEqual([
      'Revenue',
      'Cost',
      'Revenue (2)',
      'Revenue (3)',
    ]);
    expect(draft.columns.map((c) => c.originalName)).toEqual([
      'Revenue',
      'Cost',
      'Revenue',
      'Revenue',
    ]);
    expect(new Set(draft.columns.map((c) => c.id)).size).toBe(4);
    expect(draft.rows[0]).toEqual(['100', '40', '120', '130']);
    expect(draft.warnings.some((w) => w.code === 'DUPLICATE_HEADER')).toBe(true);
  });

  it('handles inconsistent row lengths with recoverable warnings and preserves all rows', () => {
    const csv = 'a,b,c\n1,2\n3,4,5,6\n7,8,9\n';
    const draft = parseCsvText(csv, BASE_OPTS);

    expect(draft.rowCount).toBe(3);
    expect(draft.columnCount).toBe(4);
    expect(draft.rows[0]).toEqual(['1', '2', null, null]);
    expect(draft.rows[1]).toEqual(['3', '4', '5', '6']);
    expect(draft.rows[2]).toEqual(['7', '8', '9', null]);
    expect(
      draft.warnings.some((w) => w.code === 'INCONSISTENT_ROW_LENGTH'),
    ).toBe(true);
  });

  it('rejects fatally malformed unclosed quotes in CSV', () => {
    const malformed = 'a,b\n1,"unclosed value\n2,normal';
    try {
      parseCsvText(malformed, BASE_OPTS);
      expect.unreachable('Expected MALFORMED_CSV error');
    } catch (err) {
      expect(err).toBeInstanceOf(IntakeValidationError);
      expect((err as IntakeValidationError).code).toBe('MALFORMED_CSV');
    }
  });

  it('enforces row and column limits without silent truncation', () => {
    const csv = 'a,b,c\n1,2,3\n4,5,6\n7,8,9\n';

    try {
      parseCsvText(csv, {
        ...BASE_OPTS,
        limits: { maxFileSizeBytes: 10_000, maxRows: 2, maxColumns: 10 },
      });
      expect.unreachable('Expected ROW_LIMIT_EXCEEDED');
    } catch (err) {
      expect((err as IntakeValidationError).code).toBe('ROW_LIMIT_EXCEEDED');
    }

    try {
      parseCsvText(csv, {
        ...BASE_OPTS,
        limits: { maxFileSizeBytes: 10_000, maxRows: 100, maxColumns: 2 },
      });
      expect.unreachable('Expected COLUMN_LIMIT_EXCEEDED');
    } catch (err) {
      expect((err as IntakeValidationError).code).toBe('COLUMN_LIMIT_EXCEEDED');
    }
  });

  it('validates file extension, legacy .xls rejection, file size, and binary signatures', () => {
    expect(() =>
      validateFilePreFlight({ name: 'legacy.xls', size: 1024 }),
    ).toThrow(/modern Excel \(\.xlsx\) and CSV \(\.csv\) files only/i);

    expect(() =>
      validateFilePreFlight({ name: 'notes.txt', size: 1024 }),
    ).toThrow(/cannot be imported/i);

    expect(() =>
      validateFilePreFlight(
        { name: 'huge.csv', size: 26 * 1024 * 1024 },
        { maxFileSizeBytes: 25 * 1024 * 1024, maxRows: 100_000, maxColumns: 200 },
      ),
    ).toThrow(/exceeds the/);

    // ZIP signature disguised as .csv should fail content signature check
    const fakeCsvBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(() =>
      validateFileContentSignature(fakeCsvBytes, 'csv', 'disguised.csv'),
    ).toThrow(/binary document data/i);
  });

  it('tracks accurate clamped byte progress (0-100%) and preserves multiline quoted records across chunks', async () => {
    const content = [
      'id,notes,region',
      '1,"First line of a long quoted note\nSecond line crossing the chunk boundary\nThird line complete",North',
      '2,"Another quoted field, with commas\nand embedded newlines",South',
      '3,"Trailing record",East',
    ].join('\n');

    const file = new File([content], 'chunked_multiline.csv', {
      type: 'text/csv',
    });

    const progressUpdates: Array<{ loaded: number; total: number }> = [];
    // Use small 48-byte chunks to force multiline quoted records across chunk boundaries
    const raw = await parseCsvFileChunked(
      file,
      { maxFileSizeBytes: 1024 * 1024, maxRows: 1000, maxColumns: 50 },
      (loaded, total) => {
        progressUpdates.push({ loaded, total });
      },
      48,
    );

    expect(raw.rawMatrix).toHaveLength(4);
    expect(raw.rawMatrix[1]).toEqual([
      '1',
      'First line of a long quoted note\nSecond line crossing the chunk boundary\nThird line complete',
      'North',
    ]);
    expect(raw.rawMatrix[2]).toEqual([
      '2',
      'Another quoted field, with commas\nand embedded newlines',
      'South',
    ]);

    // Verify monotonic, clamped byte progress reaching exact 100% (loaded === total)
    expect(progressUpdates.length).toBeGreaterThan(1);
    let previous = 0;
    for (const update of progressUpdates) {
      expect(update.total).toBe(file.size);
      expect(update.loaded).toBeGreaterThanOrEqual(previous);
      expect(update.loaded).toBeLessThanOrEqual(update.total);
      previous = update.loaded;
    }
    const finalUpdate = progressUpdates[progressUpdates.length - 1];
    expect(finalUpdate?.loaded).toBe(file.size);
  });
});
