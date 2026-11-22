import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { useDataset } from '@/context/DatasetContext';
import { createMissingValuePolicy } from '@/engine/profiling';
import { formatCount } from '@/utils';
import { ColumnProfilesTable } from './ColumnProfilesTable';
import { QualityScorePanel } from './QualityScorePanel';
import { QualityWarningsPanel } from './QualityWarningsPanel';
import { TypeDistributionStrip } from './TypeDistributionStrip';

/**
 * Module 03 Dataset Schema Detection & Intelligent Profiling workspace section.
 * Reads live profiling results associated with activeDataset.id from DatasetContext,
 * exposing loading/error states, dataset overview metrics, deterministic quality scoring,
 * transparent missing-value policy controls, quality warnings, and column profiles.
 */
export function DatasetProfilingSection() {
  const {
    activeDataset,
    datasetProfile,
    profilingStatus,
    profilingError,
    missingValuePolicy,
    updateMissingValuePolicy,
    reprofileDataset,
  } = useDataset();

  if (!activeDataset) return null;

  const treatsNoneAsMissing = missingValuePolicy.stringMarkers.includes('none');

  const handleToggleNoneMarker = () => {
    updateMissingValuePolicy(
      createMissingValuePolicy({ includeNone: !treatsNoneAsMissing }),
    );
  };

  if (profilingStatus === 'profiling' && !datasetProfile) {
    return (
      <section
        aria-label="Dataset schema profiling in progress"
        data-testid="profiling-loading-state"
        className="dd-surface-primary flex items-center justify-between gap-4 p-6"
      >
        <div className="flex items-center gap-3.5">
          <Loader2
            className="h-5 w-5 animate-spin text-[var(--dd-accent-teal)]"
            aria-hidden="true"
          />
          <div className="space-y-0.5">
            <h3 className="text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
              Profiling dataset schema &amp; data quality…
            </h3>
            <p className="font-mono text-[0.75rem] text-[var(--dd-text-muted)]">
              Inspecting {formatCount(activeDataset.rowCount)} rows ×{' '}
              {formatCount(activeDataset.columnCount)} columns locally in
              browser memory.
            </p>
          </div>
        </div>
        <StatusIndicator tone="analytical" label="Profiling" />
      </section>
    );
  }

  if (profilingStatus === 'error') {
    return (
      <section
        role="alert"
        data-testid="profiling-error-state"
        className="dd-surface-primary flex flex-col gap-4 border-[var(--dd-status-anomaly-border)] p-6 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <AlertCircle
            className="mt-0.5 h-5 w-5 shrink-0 text-[var(--dd-status-anomaly)]"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <h3 className="text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
              Dataset profiling failed
            </h3>
            <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
              {profilingError ??
                'An unexpected error occurred while inspecting dataset schema.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={reprofileDataset}
          className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:border-[var(--dd-accent-teal-border)] whitespace-nowrap shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Retry Profiling</span>
        </button>
      </section>
    );
  }

  if (!datasetProfile) return null;

  return (
    <div
      className="space-y-6"
      data-testid="dataset-profiling-section"
      data-profiled-dataset-id={datasetProfile.datasetId}
    >
      {/* Dataset Overview & Type Distribution */}
      <section
        aria-labelledby="dataset-profile-overview-heading"
        className="dd-surface-primary space-y-6 p-6"
      >
        <div className="flex flex-col gap-3 border-b border-[var(--dd-border-subtle)] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <DossierLabel
              code="SCHEMA PROFILE"
              label={`Module 03 · ${datasetProfile.fileName}`}
            />
            <h3
              id="dataset-profile-overview-heading"
              className="text-[1.125rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]"
            >
              Dataset Structure &amp; Schema Overview
            </h3>
          </div>

          <div className="flex items-center gap-3">
            {profilingStatus === 'profiling' && (
              <span className="inline-flex items-center gap-1.5 font-mono text-[0.72rem] text-[var(--dd-accent-teal)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Updating…
              </span>
            )}
            <StatusIndicator
              tone="verified"
              label={`Profiled in ${datasetProfile.durationMs} ms`}
            />
          </div>
        </div>

        {/* Key Overview Readouts (unboxed typographic grid) */}
        <dl className="grid grid-cols-2 gap-5 sm:grid-cols-5">
          <div className="space-y-1">
            <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
              Rows
            </dt>
            <dd className="font-mono text-[1.125rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
              {formatCount(datasetProfile.rowCount)}
            </dd>
          </div>

          <div className="space-y-1">
            <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
              Columns
            </dt>
            <dd className="font-mono text-[1.125rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
              {formatCount(datasetProfile.columnCount)}
            </dd>
          </div>

          <div className="space-y-1">
            <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
              Quality Score
            </dt>
            <dd className="font-mono text-[1.125rem] font-semibold text-[var(--dd-accent-teal)] dd-tabular">
              {datasetProfile.quality.overallScore}/100{' '}
              <span className="text-[0.75rem] font-normal text-[var(--dd-text-secondary)]">
                ({datasetProfile.quality.grade})
              </span>
            </dd>
          </div>

          <div className="space-y-1">
            <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
              Missing Values
            </dt>
            <dd className="font-mono text-[1.125rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
              {formatCount(datasetProfile.totalMissingCount)}{' '}
              <span className="text-[0.75rem] font-normal text-[var(--dd-text-muted)]">
                ({datasetProfile.overallMissingPercentage.toFixed(1)}%)
              </span>
            </dd>
          </div>

          <div className="space-y-1">
            <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
              Quality Warnings
            </dt>
            <dd className="font-mono text-[1.125rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
              {formatCount(datasetProfile.warnings.length)}
            </dd>
          </div>
        </dl>

        {/* Type Distribution */}
        <div className="border-t border-[var(--dd-border-subtle)] pt-5">
          <TypeDistributionStrip
            distribution={datasetProfile.typeDistribution}
            totalColumns={datasetProfile.columnCount}
          />
        </div>

        {/* Transparent Missing-Value Normalization Policy */}
        <div className="flex flex-col gap-3 border-t border-[var(--dd-border-subtle)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-3xl font-mono text-[0.72rem] leading-relaxed text-[var(--dd-text-muted)]">
            <span className="text-[var(--dd-text-secondary)]">
              Missing-value policy:
            </span>{' '}
            {datasetProfile.missingValuePolicy.description}
          </p>

          <button
            type="button"
            role="switch"
            aria-checked={treatsNoneAsMissing}
            onClick={handleToggleNoneMarker}
            className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-1.5 font-mono text-[0.72rem] text-[var(--dd-text-primary)] transition-colors hover:border-[var(--dd-border-strong)] whitespace-nowrap shrink-0"
          >
            <span
              className={
                treatsNoneAsMissing
                  ? 'text-[var(--dd-status-verified)]'
                  : 'text-[var(--dd-text-muted)]'
              }
              aria-hidden="true"
            >
              {treatsNoneAsMissing ? '●' : '○'}
            </span>
            <span>Treat &ldquo;None&rdquo; as Missing</span>
          </button>
        </div>
      </section>

      {/* Deterministic Quality Assessment */}
      <QualityScorePanel quality={datasetProfile.quality} />

      {/* Prioritized Warnings */}
      <QualityWarningsPanel warnings={datasetProfile.warnings} />

      {/* Column Profiles Ledger */}
      <ColumnProfilesTable columns={datasetProfile.columns} />
    </div>
  );
}
