/**
 * Pure formatting utilities for byte sizes, counts, timestamps,
 * and safe plain-text rendering of untrusted cell values.
 */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatTimestamp(epochMs: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(epochMs));
}

/**
 * Safely converts an unknown cell value into plain display text.
 * Never evaluates formulas or injects HTML.
 */
export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  return String(value);
}

/**
 * Formats a statistical numeric measurement cleanly for tabular display.
 * Handles null/non-finite values safely and avoids unreadable floating-point noise.
 */
export function formatStatNumber(
  value: number | null | undefined,
  maxFractionDigits = 4,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const normalized = Object.is(value, -0) ? 0 : value;
  const abs = Math.abs(normalized);

  if (abs !== 0 && (abs >= 1e9 || abs < 1e-4)) {
    return normalized.toExponential(3);
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: maxFractionDigits,
  }).format(normalized);
}

/**
 * Formats a percentage value (0–100) with fixed precision for consistent tabular columns.
 */
export function formatPercentage(
  value: number | null | undefined,
  fractionDigits = 2,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const normalized = Object.is(value, -0) ? 0 : value;
  return `${normalized.toFixed(fractionDigits)}%`;
}

