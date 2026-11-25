import {
  AlertTriangle,
  ArrowUpRight,
  Compass,
  Crosshair,
  FileSearch,
  GitBranch,
  ShieldAlert,
  Table2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { buildExplorerColumnUrl } from '@/features/investigation/investigationLabels';
import type {
  AiInvestigationBrief,
  DatasetInsight,
  DatasetProfileSummary,
} from '@/types';

interface InvestigationBriefSectionProps {
  readonly brief: AiInvestigationBrief;
  readonly profile: DatasetProfileSummary;
  readonly findingsById: ReadonlyMap<string, DatasetInsight>;
}

function buildFindingUrl(findingId: string): string {
  const params = new URLSearchParams({ finding: findingId });
  return `/investigation?${params.toString()}`;
}

/**
 * Feature A — AI Investigation Brief
 * Renders all 7 evidence-grounded brief sections while clearly distinguishing
 * AI interpretation from verified M03–M07 evidence references.
 */
export function InvestigationBriefSection({
  brief,
  profile,
  findingsById,
}: InvestigationBriefSectionProps) {
  const columnNameById = new Map(
    profile.columns.map((c) => [c.columnId, c.name]),
  );

  return (
    <section
      data-testid="ai-investigation-brief"
      className="dd-surface-primary space-y-6 p-5 sm:p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--dd-border-subtle)] pb-3">
        <div className="space-y-0.5">
          <div className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-accent-teal)]">
            AI INTERPRETATION · GROUNDED IN VERIFIED AGGREGATE ANALYSIS
          </div>
          <h3 className="text-[1.125rem] font-semibold tracking-[-0.02em] text-[var(--dd-text-primary)]">
            Investigation Brief
          </h3>
        </div>
        <span className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
          Interpretive Synthesis · Verify in Source Workspaces
        </span>
      </header>

      {/* 1. Executive Summary */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
          <FileSearch className="h-3.5 w-3.5 text-[var(--dd-accent-teal)]" aria-hidden="true" />
          <span>01 · Executive Summary</span>
        </div>
        <p className="text-[0.9375rem] leading-relaxed text-[var(--dd-text-primary)]">
          {brief.executiveSummary}
        </p>
      </div>

      {/* 2. Major Findings */}
      {brief.majorFindings.length > 0 && (
        <div className="space-y-3 border-t border-[var(--dd-border-subtle)] pt-5">
          <div className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
            <Crosshair className="h-3.5 w-3.5 text-[var(--dd-accent-teal)]" aria-hidden="true" />
            <span>02 · Major Findings Interpretation</span>
          </div>

          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            {brief.majorFindings.map((item, index) => (
              <article
                key={`${item.title}-${index}`}
                className="space-y-2.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
                    {item.title}
                  </h4>
                  <span className="shrink-0 font-mono text-[0.625rem] uppercase tracking-[0.07em] text-[var(--dd-accent-teal)]">
                    AI Interpretation
                  </span>
                </div>

                <p className="text-[0.84375rem] leading-relaxed text-[var(--dd-text-secondary)]">
                  {item.interpretation}
                </p>

                <p className="border-t border-[var(--dd-border-subtle)] pt-2 text-[0.8125rem] text-[var(--dd-text-secondary)]">
                  <span className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                    Why It Matters:{' '}
                  </span>
                  {item.whyItMatters}
                </p>

                {(item.supportingFindingIds.length > 0 ||
                  item.relevantColumnIds.length > 0) && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {item.supportingFindingIds.map((findingId) => {
                      const finding = findingsById.get(findingId);
                      return (
                        <Link
                          key={findingId}
                          to={buildFindingUrl(findingId)}
                          title={finding?.title ?? findingId}
                          className="inline-flex items-center gap-1 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-2 py-0.5 font-mono text-[0.6875rem] text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20"
                        >
                          <span>Finding: {findingId}</span>
                          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      );
                    })}

                    {item.relevantColumnIds.map((colId) => (
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
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      {/* 3 & 4. Data Quality Assessment + Relationships & Patterns */}
      <div className="grid grid-cols-1 gap-5 border-t border-[var(--dd-border-subtle)] pt-5 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
            <ShieldAlert className="h-3.5 w-3.5 text-[var(--dd-status-warning)]" aria-hidden="true" />
            <span>03 · Data Quality Assessment</span>
          </div>
          <p className="text-[0.875rem] leading-relaxed text-[var(--dd-text-secondary)]">
            {brief.dataQualityAssessment}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
            <GitBranch className="h-3.5 w-3.5 text-[var(--dd-accent-teal)]" aria-hidden="true" />
            <span>04 · Relationships & Patterns (Association Only)</span>
          </div>
          <p className="text-[0.875rem] leading-relaxed text-[var(--dd-text-secondary)]">
            {brief.relationshipsAndPatterns}
          </p>
        </div>
      </div>

      {/* 5 & 6. Potential Risks + Recommended Next Steps */}
      <div className="grid grid-cols-1 gap-5 border-t border-[var(--dd-border-subtle)] pt-5 lg:grid-cols-2">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
            <AlertTriangle className="h-3.5 w-3.5 text-[var(--dd-status-anomaly)]" aria-hidden="true" />
            <span>05 · Potential Risks</span>
          </div>
          <ul className="space-y-2 text-[0.84375rem] leading-relaxed text-[var(--dd-text-secondary)]">
            {brief.potentialRisks.map((risk, idx) => (
              <li
                key={`risk-${idx}`}
                className="flex items-start gap-2.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-3 py-2"
              >
                <span className="mt-0.5 font-mono text-[0.6875rem] text-[var(--dd-status-anomaly)]">
                  0{idx + 1}
                </span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
            <Compass className="h-3.5 w-3.5 text-[var(--dd-accent-teal)]" aria-hidden="true" />
            <span>06 · Recommended Next Steps</span>
          </div>
          <ol className="space-y-2 text-[0.84375rem] leading-relaxed text-[var(--dd-text-secondary)]">
            {brief.recommendedNextSteps.map((step, idx) => (
              <li
                key={`step-${idx}`}
                className="flex items-start gap-2.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-3 py-2"
              >
                <span className="mt-0.5 font-mono text-[0.6875rem] text-[var(--dd-accent-teal)]">
                  0{idx + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* 7. Confidence & Limitations */}
      <div className="space-y-1.5 border-t border-[var(--dd-border-subtle)] pt-4">
        <div className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
          07 · Confidence & Limitations
        </div>
        <p className="text-[0.84375rem] leading-relaxed text-[var(--dd-text-secondary)]">
          {brief.confidenceAndLimitations}
        </p>
      </div>
    </section>
  );
}
