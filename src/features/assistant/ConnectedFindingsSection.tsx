import { ArrowUpRight, Link2, Table2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  buildExplorerColumnUrl,
  CONFIDENCE_LABELS,
} from '@/features/investigation/investigationLabels';
import type {
  AiCrossFindingConnection,
  DatasetInsight,
  DatasetProfileSummary,
} from '@/types';

interface ConnectedFindingsSectionProps {
  readonly connections: readonly AiCrossFindingConnection[];
  readonly profile: DatasetProfileSummary;
  readonly findingsById: ReadonlyMap<string, DatasetInsight>;
}

function buildFindingUrl(findingId: string): string {
  const params = new URLSearchParams({ finding: findingId });
  return `/investigation?${params.toString()}`;
}

/**
 * Feature B — Cross-Finding Interpretation
 * Displays AI-surfaced interactions between verified Module 07 findings,
 * separating observed evidence from interpretive hypotheses and alternative explanations.
 */
export function ConnectedFindingsSection({
  connections,
  profile,
  findingsById,
}: ConnectedFindingsSectionProps) {
  const columnNameById = new Map(
    profile.columns.map((c) => [c.columnId, c.name]),
  );

  return (
    <section
      data-testid="ai-connected-findings"
      className="dd-surface-primary space-y-4 p-5 sm:p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--dd-border-subtle)] pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-status-warning)]">
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>AI HYPOTHESIS · CROSS-FINDING INTERPRETATION</span>
          </div>
          <h3 className="text-[1.0625rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]">
            Connected Findings ({connections.length})
          </h3>
        </div>
        <span className="font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
          Coexistence does not imply causation
        </span>
      </header>

      {connections.length === 0 ? (
        <p className="text-[0.84375rem] text-[var(--dd-text-secondary)]">
          No multi-finding interactions were surfaced from the current aggregate
          evidence. Inspect individual findings in the Investigation Center.
        </p>
      ) : (
        <div className="space-y-4">
          {connections.map((conn) => (
            <article
              key={conn.id}
              data-testid={`ai-connection-${conn.id}`}
              className="space-y-3.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h4 className="text-[0.96875rem] font-semibold text-[var(--dd-text-primary)]">
                  {conn.title}
                </h4>
                <span className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                  {CONFIDENCE_LABELS[conn.confidence]}
                </span>
              </div>

              {/* Clickable Verified Finding & Column References */}
              <div className="flex flex-wrap items-center gap-1.5">
                {conn.findingIds.map((findingId) => {
                  const finding = findingsById.get(findingId);
                  return (
                    <Link
                      key={findingId}
                      to={buildFindingUrl(findingId)}
                      title={finding?.title ?? findingId}
                      className="inline-flex items-center gap-1 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-2 py-0.5 font-mono text-[0.6875rem] text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20"
                    >
                      <span>{findingId}</span>
                      <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  );
                })}

                {conn.columnIds.map((colId) => (
                  <Link
                    key={colId}
                    to={buildExplorerColumnUrl(colId)}
                    className="inline-flex items-center gap-1 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2 py-0.5 font-mono text-[0.6875rem] text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-accent-teal-border)] hover:text-[var(--dd-text-primary)]"
                  >
                    <Table2 className="h-2.5 w-2.5" aria-hidden="true" />
                    <span>{columnNameById.get(colId) ?? colId}</span>
                  </Link>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 border-t border-[var(--dd-border-subtle)] pt-3 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="font-mono text-[0.625rem] uppercase tracking-[0.07em] text-[var(--dd-status-verified)]">
                    What Verified Evidence Shows
                  </div>
                  <p className="text-[0.84375rem] leading-relaxed text-[var(--dd-text-secondary)]">
                    {conn.evidenceSummary}
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="font-mono text-[0.625rem] uppercase tracking-[0.07em] text-[var(--dd-status-warning)]">
                    Possible Interpretation (Hypothesis)
                  </div>
                  <p className="text-[0.84375rem] leading-relaxed text-[var(--dd-text-secondary)]">
                    {conn.possibleInterpretation}
                  </p>
                </div>
              </div>

              {conn.alternativeExplanations.length > 0 && (
                <div className="space-y-1 border-t border-[var(--dd-border-subtle)] pt-2.5">
                  <div className="font-mono text-[0.625rem] uppercase tracking-[0.07em] text-[var(--dd-text-muted)]">
                    Alternative Explanations
                  </div>
                  <ul className="list-disc space-y-1 pl-4 text-[0.8125rem] text-[var(--dd-text-secondary)]">
                    {conn.alternativeExplanations.map((alt, idx) => (
                      <li key={`${conn.id}-alt-${idx}`}>{alt}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-[var(--dd-border-subtle)] pt-2.5 text-[0.8125rem] text-[var(--dd-text-secondary)]">
                <span className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-accent-teal)]">
                  Suggested Investigation:{' '}
                </span>
                {conn.suggestedInvestigation}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
