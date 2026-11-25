import type {
  CaseNoteType,
  InsightClassification,
  InsightSeverity,
  ReportSourceKind,
} from '@/types';

export const FINDING_CLASSIFICATION_LABELS: Readonly<
  Record<InsightClassification, string>
> = {
  data_quality_issue: 'Data-Quality Issue',
  statistical_outlier: 'Statistical Outlier (Not Automatically Error)',
  notable_observation: 'Notable Observation',
};

export const FINDING_SEVERITY_LABELS: Readonly<Record<InsightSeverity, string>> =
  {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    info: 'Info',
  };

export const SOURCE_KIND_LABELS: Readonly<Record<ReportSourceKind, string>> = {
  dataset: 'Active Dataset',
  case: 'Investigation Case',
  findings: 'Selected Findings',
};

export const CASE_NOTE_TYPE_LABELS: Readonly<Record<CaseNoteType, string>> = {
  observation: 'User Observation',
  hypothesis: 'Unverified Hypothesis',
  question: 'Open Question',
  conclusion: 'Final Conclusion',
};

export function formatReportDate(ts: number | string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatReportDateTime(ts: number | string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatReportStat(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 10_000) return Math.round(n).toLocaleString();
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(2);
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
