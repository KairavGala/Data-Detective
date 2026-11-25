import {
  ArrowUpRight,
  BarChart3,
  Compass,
  Crosshair,
  Table2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
  AiDestinationType,
  AiRecommendationPriority,
  AiRecommendedInvestigation,
  DatasetProfileSummary,
} from '@/types';
import { cn } from '@/utils';
import { isSafeInternalDestination } from './aiInvestigationClient';

interface RecommendedInvestigationsSectionProps {
  readonly recommendations: readonly AiRecommendedInvestigation[];
  readonly profile: DatasetProfileSummary;
}

const PRIORITY_STYLE: Readonly<
  Record<AiRecommendationPriority, { readonly label: string; readonly cls: string }>
> = {
  high: { label: 'HIGH PRIORITY', cls: 'text-[var(--dd-status-anomaly)]' },
  medium: { label: 'MEDIUM PRIORITY', cls: 'text-[var(--dd-status-warning)]' },
  low: { label: 'LOW PRIORITY', cls: 'text-[var(--dd-text-muted)]' },
};

const DESTINATION_LABEL: Readonly<Record<AiDestinationType, string>> = {
  explorer: 'Open in Data Explorer',
  visualizations: 'Open in Visualization Studio',
  investigation: 'Open in Investigation Center',
};

function DestinationIcon({ type }: { readonly type: AiDestinationType }) {
  if (type === 'explorer') {
    return <Table2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  if (type === 'visualizations') {
    return <BarChart3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  return <Crosshair className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}

function buildFindingUrl(findingId: string): string {
  const params = new URLSearchParams({ finding: findingId });
  return `/investigation?${params.toString()}`;
}

/**
 * Feature D — Recommended Investigations
 * Displays prioritized investigative steps with strictly validated internal
 * deep links into Explorer, Visualization Studio, and Investigation Center.
 */
export function RecommendedInvestigationsSection({
  recommendations,
  profile,
}: RecommendedInvestigationsSectionProps) {
  const columnNameById = new Map(
    profile.columns.map((c) => [c.columnId, c.name]),
  );

  return (
    <section
      data-testid="ai-recommended-investigations"
      className="dd-surface-primary space-y-4 p-5 sm:p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--dd-border-subtle)] pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-accent-teal)]">
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            <span>ACTIONABLE WORKSPACE NAVIGATION</span>
          </div>
          <h3 className="text-[1.0625rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]">
            Recommended Investigations ({recommendations.length})
          </h3>
        </div>
        <span className="font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
          Schema-validated internal routes
        </span>
      </header>

      {recommendations.length === 0 ? (
        <p className="text-[0.84375rem] text-[var(--dd-text-secondary)]">
          No specific follow-up actions were recommended for this dataset.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          {recommendations.map((rec) => {
            const pri = PRIORITY_STYLE[rec.priority];
            const safeUrl = isSafeInternalDestination(rec.destinationUrl)
              ? rec.destinationUrl
              : '/investigation';

            return (
              <article
                key={rec.id}
                data-testid={`ai-recommendation-${rec.id}`}
                className="flex flex-col justify-between gap-3.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.07em]">
                    <span className={cn('font-semibold', pri.cls)}>
                      {pri.label}
                    </span>
                    <span className="text-[var(--dd-text-muted)]">
                      {rec.id}
                    </span>
                  </div>

                  <h4 className="text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
                    {rec.title}
                  </h4>

                  <p className="text-[0.84375rem] leading-relaxed text-[var(--dd-text-secondary)]">
                    {rec.reason}
                  </p>

                  <div className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] px-3 py-2 text-[0.8125rem] text-[var(--dd-text-secondary)]">
                    <span className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                      What To Look For:{' '}
                    </span>
                    {rec.whatToLookFor}
                  </div>

                  {(rec.supportingFindingIds.length > 0 ||
                    rec.relevantColumnIds.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {rec.supportingFindingIds.map((findingId) => (
                        <Link
                          key={findingId}
                          to={buildFindingUrl(findingId)}
                          className="inline-flex items-center gap-1 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2 py-0.5 font-mono text-[0.6875rem] text-[var(--dd-text-secondary)] hover:border-[var(--dd-accent-teal-border)] hover:text-[var(--dd-text-primary)]"
                        >
                          <span>{findingId}</span>
                        </Link>
                      ))}
                      {rec.relevantColumnIds.map((colId) => (
                        <span
                          key={colId}
                          className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] px-2 py-0.5 font-mono text-[0.6875rem] text-[var(--dd-text-muted)]"
                        >
                          col: {columnNameById.get(colId) ?? colId}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-[var(--dd-border-subtle)] pt-3">
                  <Link
                    to={safeUrl}
                    className="inline-flex items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3 py-1.5 font-mono text-[0.75rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20"
                  >
                    <DestinationIcon type={rec.destinationType} />
                    <span>{DESTINATION_LABEL[rec.destinationType]}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
