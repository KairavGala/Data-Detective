import { Info } from 'lucide-react';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import type { DatasetQualityAssessment, SemanticTone } from '@/types';

interface QualityScorePanelProps {
  readonly quality: DatasetQualityAssessment;
}

function gradeToTone(grade: DatasetQualityAssessment['grade']): SemanticTone {
  switch (grade) {
    case 'High':
      return 'verified';
    case 'Moderate':
      return 'analytical';
    case 'Fair':
      return 'warning';
    case 'Poor':
      return 'anomaly';
    case 'Empty':
      return 'neutral';
  }
}

/**
 * Explainable dataset quality dossier displaying the deterministic overall score,
 * 3-dimension weighted breakdown, formula, and explicit assessment limitations.
 */
export function QualityScorePanel({ quality }: QualityScorePanelProps) {
  const tone = gradeToTone(quality.grade);

  return (
    <section
      aria-labelledby="quality-assessment-heading"
      data-testid="quality-score-panel"
      className="dd-surface-primary space-y-6 p-6"
    >
      {/* Header + overall score readout */}
      <div className="flex flex-col gap-4 border-b border-[var(--dd-border-subtle)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <DossierLabel code="QUALITY INDEX" label="Deterministic Assessment" />
          <h3
            id="quality-assessment-heading"
            className="text-[1.125rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]"
          >
            Dataset Quality Assessment
          </h3>
          <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
            {quality.formulaDescription}
          </p>
        </div>

        <div className="flex items-baseline gap-4 shrink-0">
          <div className="text-right">
            <div
              data-testid="quality-overall-score"
              className="font-mono text-[2rem] font-semibold leading-none text-[var(--dd-text-primary)] dd-tabular"
            >
              {quality.overallScore}
              <span className="text-[0.875rem] font-normal text-[var(--dd-text-muted)]">
                /100
              </span>
            </div>
          </div>
          <StatusIndicator tone={tone} label={`${quality.grade} Quality`} />
        </div>
      </div>

      {/* Three weighted quality dimensions */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {quality.dimensions.map((dim) => (
          <div
            key={dim.id}
            className="space-y-2.5 border-t border-[var(--dd-border-subtle)] pt-3.5 md:border-t-0 md:border-l md:pl-5 md:pt-0 first:border-t-0 first:pt-0 md:first:border-l-0 md:first:pl-0"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-[0.875rem] font-medium text-[var(--dd-text-primary)]">
                {dim.label}
              </h4>
              <span className="font-mono text-[0.7rem] text-[var(--dd-text-muted)] dd-tabular">
                Weight {Math.round(dim.weight * 100)}%
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[1.25rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
                {dim.score.toFixed(1)}%
              </span>
              <span className="font-mono text-[0.72rem] text-[var(--dd-accent-teal)] dd-tabular">
                +{dim.weightedContribution.toFixed(1)} pts
              </span>
            </div>

            {/* Proportional hairline gauge */}
            <div
              className="h-1.5 w-full overflow-hidden rounded-[var(--dd-radius-xs)] bg-[var(--dd-surface-recessed)]"
              aria-hidden="true"
            >
              <div
                className="h-full bg-[var(--dd-accent-teal)]"
                style={{ width: `${Math.max(0, Math.min(100, dim.score))}%` }}
              />
            </div>

            <p className="text-[0.78rem] leading-relaxed text-[var(--dd-text-secondary)]">
              {dim.explanation}
            </p>
          </div>
        ))}
      </div>

      {/* Explicit scope & limitations */}
      <div className="border-t border-[var(--dd-border-subtle)] pt-4">
        <div className="flex items-start gap-2.5 text-[0.75rem] text-[var(--dd-text-muted)]">
          <Info
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dd-accent-teal)]"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <span className="font-mono text-[0.7rem] tracking-[0.05em] text-[var(--dd-text-secondary)] uppercase">
              Scoring Scope &amp; Limitations
            </span>
            <ul className="space-y-1">
              {quality.limitations.map((limitation) => (
                <li key={limitation} className="leading-relaxed">
                  · {limitation}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
