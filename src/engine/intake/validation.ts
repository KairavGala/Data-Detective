import { APP_CONFIG, type IntakeLimits } from '@/config/app.config';
import type { ImportedFileType } from '@/types';
import { formatBytes } from '@/utils/format';
import { IntakeValidationError } from './errors';

export interface FileLikeMetadata {
  readonly name: string;
  readonly size: number;
  readonly type?: string;
}

const DEFAULT_LIMITS: IntakeLimits = {
  maxFileSizeBytes: APP_CONFIG.intake.maxFileSizeBytes,
  maxRows: APP_CONFIG.intake.maxRows,
  maxColumns: APP_CONFIG.intake.maxColumns,
};

/**
 * Extracts normalized lowercase file extension including leading dot.
 */
export function getFileExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    return '';
  }
  return trimmed.slice(lastDot).toLowerCase();
}

/**
 * Pre-flight validation on file name, extension, and byte size.
 * Does not trust browser MIME type as an authoritative rejection criterion.
 */
export function validateFilePreFlight(
  file: FileLikeMetadata,
  limits: IntakeLimits = DEFAULT_LIMITS,
): ImportedFileType {
  const ext = getFileExtension(file.name);

  if (ext === '.xls') {
    throw new IntakeValidationError({
      code: 'LEGACY_XLS_UNSUPPORTED',
      title: 'Legacy Excel (.xls) format is not supported',
      message:
        'Data Detective supports modern Excel (.xlsx) and CSV (.csv) files only. Convert this workbook to .xlsx or export it as .csv, then try again.',
    });
  }

  if (ext !== '.csv' && ext !== '.xlsx') {
    throw new IntakeValidationError({
      code: 'UNSUPPORTED_EXTENSION',
      title: 'Unsupported file format',
      message: `Files with extension "${ext || 'none'}" cannot be imported. Supported formats are CSV (.csv) and Excel (.xlsx).`,
    });
  }

  if (file.size <= 0) {
    throw new IntakeValidationError({
      code: 'EMPTY_FILE',
      title: 'File is empty',
      message: `"${file.name}" contains 0 bytes of data. Select a file with tabular records and retry.`,
    });
  }

  if (file.size > limits.maxFileSizeBytes) {
    throw new IntakeValidationError({
      code: 'FILE_TOO_LARGE',
      title: 'File exceeds maximum size limit',
      message: `"${file.name}" is ${formatBytes(file.size)}, which exceeds the ${formatBytes(limits.maxFileSizeBytes)} limit. Split or filter the file before importing.`,
      details: `Maximum allowed file size: ${formatBytes(limits.maxFileSizeBytes)}`,
    });
  }

  return ext === '.xlsx' ? 'xlsx' : 'csv';
}

function startsWithBytes(
  bytes: Uint8Array,
  signature: readonly number[],
): boolean {
  if (bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}

const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04] as const;
const ZIP_EMPTY_ARCHIVE = [0x50, 0x4b, 0x05, 0x06] as const;
const OLE2_LEGACY_HEADER = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47] as const;

/**
 * Inspects leading file bytes to verify actual file content matches the expected format.
 * Guards against renamed binary files or mislabeled formats regardless of browser MIME type.
 */
export function validateFileContentSignature(
  bytes: Uint8Array,
  expectedType: ImportedFileType,
  fileName: string,
): void {
  if (bytes.length === 0) {
    throw new IntakeValidationError({
      code: 'EMPTY_FILE',
      title: 'File is empty',
      message: `"${fileName}" contains no readable bytes.`,
    });
  }

  if (expectedType === 'xlsx') {
    if (startsWithBytes(bytes, OLE2_LEGACY_HEADER)) {
      throw new IntakeValidationError({
        code: 'LEGACY_XLS_UNSUPPORTED',
        title: 'Legacy Excel binary workbook detected',
        message: `"${fileName}" uses the legacy .xls binary format despite its .xlsx extension. Re-save the file as a modern Excel (.xlsx) workbook.`,
      });
    }

    const isZip =
      startsWithBytes(bytes, ZIP_LOCAL_HEADER) ||
      startsWithBytes(bytes, ZIP_EMPTY_ARCHIVE);

    if (!isZip) {
      throw new IntakeValidationError({
        code: 'INVALID_XLSX_SIGNATURE',
        title: 'Invalid Excel (.xlsx) file structure',
        message: `"${fileName}" does not appear to be a valid OpenXML (.xlsx) workbook. Verify the file is not corrupted or renamed from another format.`,
      });
    }
    return;
  }

  // CSV content signature checks: reject known binary formats and NUL-heavy payloads
  if (
    startsWithBytes(bytes, ZIP_LOCAL_HEADER) ||
    startsWithBytes(bytes, OLE2_LEGACY_HEADER) ||
    startsWithBytes(bytes, PDF_HEADER) ||
    startsWithBytes(bytes, PNG_HEADER)
  ) {
    throw new IntakeValidationError({
      code: 'INVALID_CSV_CONTENT',
      title: 'Binary file detected instead of CSV text',
      message: `"${fileName}" appears to contain binary document data rather than plain-text CSV records. Export the source data as UTF-8 CSV or .xlsx.`,
    });
  }

  // Detect NUL bytes in sample (excluding UTF-16 BOM edge case, though UTF-8 is expected)
  const sampleLength = Math.min(bytes.length, 4096);
  let nulCount = 0;
  for (let i = 0; i < sampleLength; i += 1) {
    if (bytes[i] === 0x00) {
      nulCount += 1;
    }
  }
  if (nulCount > 0) {
    throw new IntakeValidationError({
      code: 'INVALID_CSV_CONTENT',
      title: 'Unreadable binary content in CSV file',
      message: `"${fileName}" contains null binary bytes and cannot be parsed as UTF-8 CSV text. Save the file as UTF-8 CSV and retry.`,
    });
  }
}
