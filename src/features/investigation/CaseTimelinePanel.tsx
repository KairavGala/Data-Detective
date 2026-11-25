import { Clock } from 'lucide-react';
import type { CaseTimelineEvent } from '@/types';
import { formatCount } from '@/utils';
import { formatCaseTimestamp } from './caseLabels';

interface CaseTimelinePanelProps {
  readonly timeline: readonly CaseTimelineEvent[];
}

/**
 * Module 09 — Chronological Investigation Activity Timeline.
 * Displays privacy-safe audit events for every case lifecycle action.
 */
export function CaseTimelinePanel({ timeline }: CaseTimelinePanelProps) {
  const ordered = [...timeline].reverse();

  return (
    <section
      data-testid="case-timeline-panel"
      aria-label="Investigation activity timeline"
      className="dd-surface-primary space-y-4 p-5"
    >
      <header className="flex items-center justify-between gap-2 border-b border-[var(--dd-border-subtle)] pb-3">
        <div className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            Activity Timeline · {formatCount(timeline.length)}{' '}
            {timeline.length === 1 ? 'Event' : 'Events'}
          </span>
        </div>
        <span className="font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
          Newest first
        </span>
      </header>

      <ol className="space-y-3">
        {ordered.map((evt) => (
          <li
            key={evt.id}
            data-testid={`timeline-event-${evt.type}`}
            className="flex items-start justify-between gap-3 border-b border-[var(--dd-border-subtle)] pb-2.5 last:border-b-0 last:pb-0"
          >
            <div className="min-w-0 space-y-0.5">
              <div className="text-[0.8125rem] font-medium text-[var(--dd-text-primary)]">
                {evt.label}
              </div>
              {evt.detail && (
                <div className="truncate font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
                  {evt.detail}
                </div>
              )}
            </div>
            <time
              dateTime={new Date(evt.timestamp).toISOString()}
              className="shrink-0 font-mono text-[0.6875rem] text-[var(--dd-text-muted)] dd-tabular"
            >
              {formatCaseTimestamp(evt.timestamp)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
