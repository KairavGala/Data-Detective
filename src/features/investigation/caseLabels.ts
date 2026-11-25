import type {
  AiAnswerSupportType,
  CaseEvidenceType,
  CaseNoteType,
  InvestigationCasePriority,
  InvestigationCaseStatus,
} from '@/types';

export const CASE_STATUS_ORDER: readonly InvestigationCaseStatus[] = [
  'open',
  'in_progress',
  'under_review',
  'resolved',
];

export const CASE_STATUS_META: Readonly<
  Record<
    InvestigationCaseStatus,
    {
      readonly label: string;
      readonly textClass: string;
    }
  >
> = {
  open: {
    label: 'Open',
    textClass: 'text-[var(--dd-accent-teal)]',
  },
  in_progress: {
    label: 'In Progress',
    textClass: 'text-[var(--dd-status-warning)]',
  },
  under_review: {
    label: 'Under Review',
    textClass: 'text-[var(--dd-text-primary)]',
  },
  resolved: {
    label: 'Resolved',
    textClass: 'text-[var(--dd-status-verified)]',
  },
};

export const CASE_PRIORITY_ORDER: readonly InvestigationCasePriority[] = [
  'critical',
  'high',
  'medium',
  'low',
];

export const CASE_PRIORITY_META: Readonly<
  Record<
    InvestigationCasePriority,
    {
      readonly label: string;
      readonly textClass: string;
    }
  >
> = {
  critical: {
    label: 'Critical',
    textClass: 'text-[var(--dd-status-anomaly)]',
  },
  high: {
    label: 'High',
    textClass: 'text-[var(--dd-status-anomaly)]',
  },
  medium: {
    label: 'Medium',
    textClass: 'text-[var(--dd-status-warning)]',
  },
  low: {
    label: 'Low',
    textClass: 'text-[var(--dd-text-secondary)]',
  },
};

export const EVIDENCE_TYPE_META: Readonly<
  Record<
    CaseEvidenceType,
    {
      readonly label: string;
      readonly actionLabel: string;
    }
  >
> = {
  finding: {
    label: 'Automated Finding',
    actionLabel: 'Inspect Finding',
  },
  related_finding: {
    label: 'Related Finding',
    actionLabel: 'Inspect Finding',
  },
  column: {
    label: 'Dataset Column',
    actionLabel: 'Open in Explorer',
  },
  statistic: {
    label: 'Statistical Summary',
    actionLabel: 'View Statistics',
  },
  visualization: {
    label: 'Visualization',
    actionLabel: 'Open Chart',
  },
};

export const NOTE_TYPE_ORDER: readonly CaseNoteType[] = [
  'observation',
  'hypothesis',
  'question',
  'conclusion',
];

export const NOTE_TYPE_META: Readonly<
  Record<
    CaseNoteType,
    {
      readonly label: string;
      readonly epistemicLabel: string;
      readonly textClass: string;
      readonly placeholder: string;
    }
  >
> = {
  observation: {
    label: 'Observation',
    epistemicLabel: 'USER OBSERVATION',
    textClass: 'text-[var(--dd-accent-teal)]',
    placeholder:
      'Record what you directly observed while inspecting rows, distributions, or charts…',
  },
  hypothesis: {
    label: 'Hypothesis',
    epistemicLabel: 'UNVERIFIED HYPOTHESIS',
    textClass: 'text-[var(--dd-status-warning)]',
    placeholder:
      'Propose a testable explanation (remains unverified until supported by evidence)…',
  },
  question: {
    label: 'Question',
    epistemicLabel: 'OPEN QUESTION',
    textClass: 'text-[var(--dd-text-secondary)]',
    placeholder:
      'Note an unanswered question requiring row-level or domain verification…',
  },
  conclusion: {
    label: 'Conclusion',
    epistemicLabel: 'FINAL CONCLUSION',
    textClass: 'text-[var(--dd-status-verified)]',
    placeholder:
      'Document an evidence-grounded conclusion citing verified findings or columns…',
  },
};

export const AI_SUPPORT_TYPE_LABELS: Readonly<
  Record<
    AiAnswerSupportType,
    {
      readonly label: string;
      readonly textClass: string;
    }
  >
> = {
  directly_supported: {
    label: 'Directly Supported by Aggregate Evidence',
    textClass: 'text-[var(--dd-status-verified)]',
  },
  reasonable_interpretation: {
    label: 'Reasonable Interpretation (Requires Verification)',
    textClass: 'text-[var(--dd-status-warning)]',
  },
  insufficient_evidence: {
    label: 'Insufficient Aggregate Evidence',
    textClass: 'text-[var(--dd-status-anomaly)]',
  },
};

export function formatCaseTimestamp(ts: number | string): string {
  const date = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (Number.isNaN(date.getTime())) return String(ts);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
