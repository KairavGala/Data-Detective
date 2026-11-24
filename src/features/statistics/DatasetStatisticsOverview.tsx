import { Link } from 'react-router-dom';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import type { DatasetStatisticalSummary } from '@/types';
import { formatCount } from '@/utils';

interface DatasetStatisticsOverviewProps {
  readonly summary: DatasetStatisticalSummary;
}

/**
 * Module 04 Dataset Statistical Summary panel.
 * Presents unboxed tabular readouts of analyzed vs unsupported columns,
 * valid observations vs excluded values, and active calculation conventions.
 */
export function DatasetStatisticsOverview({
  summary,
}: DatasetStatisticsOverviewProps) {
  const { overview } = summary;
  const totalExcluded =
    overview.totalMissingExcluded + overview.totalInvalidExcluded;

  return (
    <section
      aria-labelledby="stats-dataset-summary-heading"
      data-testid="statistics-overview-section"
      className="dd-surface-primary space-y-6 p-6"
    >
      <div className="flex flex-col gap-3 border-b border-[var(--dd-border-subtle)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <DossierLabel
            code="STATISTICAL SUMMARY"
            label={`Module 04 · ${summary.fileName}`}
          />
          <h3
            id="stats-dataset-summary-heading"
            className="text-[1.125rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]"
          >
            Dataset Statistical Overview
          </h3>
        </div>

        <StatusIndicator
          tone="verified"
          label={`Computed in ${summary.durationMs} ms`}
        />
      </div>

      {/* Primary KPI readout strip (unboxed typographic grid) */}
      <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        <div className="space-y-1">
          <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
            Dataset Rows
          </dt>
          <dd className="font-mono text-[1.125rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
            {formatCount(overview.totalRows)}
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
            Numeric Columns
          </dt>
          <dd className="font-mono text-[1.125rem] font-semibold text-[var(--dd-accent-teal)] dd-tabular">
            {formatCount(overview.numericColumnCount)}
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
            Categorical Columns
          </dt>
          <dd className="font-mono text-[1.125rem] font-semibold text-[var(--dd-status-verified)] dd-tabular">
            {formatCount(overview.categoricalColumnCount)}
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
            Unsupported Columns
          </dt>
          <dd className="font-mono text-[1.125rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
            {formatCount(overview.unsupportedColumnCount)}
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
            Valid Observations
          </dt>
          <dd className="font-mono text-[1.125rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
            {formatCount(overview.totalValidObservations)}
          </dd>
        </div>
      </dl>

      {/* Excluded observations & methodological provenance */}
      <div className="flex flex-col gap-3 border-t border-[var(--dd-border-subtle)] pt-4 font-mono text-[0.75rem] text-[var(--dd-text-muted)] dd-tabular lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span>
            Excluded across analyzed columns:{' '}
            <span className="text-[var(--dd-text-secondary)]">
              {formatCount(totalExcluded)}
            </span>{' '}
            ({formatCount(overview.totalMissingExcluded)} missing ·{' '}
            {formatCount(overview.totalInvalidExcluded)} invalid)
          </span>
          <span aria-hidden="true">/</span>
          <span>
            Quartiles:{' '}
            <span className="text-[var(--dd-text-secondary)]">
              {overview.quartileMethod}
            </span>
          </span>
        </div>

        <Link
          to="/"
          className="text-[var(--dd-accent-teal)] transition-colors hover:text-[var(--dd-accent-teal-hover)] whitespace-nowrap shrink-0"
        >
          Inspect M03 Schema &amp; Missing Policy →
        </Link>
      </div>
    </section>
  );
}
