import { useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Crosshair,
  FileText,
  Table2,
  TerminalSquare,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { APP_CONFIG } from '@/config/app.config';
import { useDataset } from '@/context/DatasetContext';
import {
  ActiveDatasetBanner,
  EvidenceIntakePanel,
} from '@/features/intake';
import { DatasetProfilingSection } from '@/features/profiling';
import { useReducedMotion } from '@/hooks';
import { formatCount } from '@/utils';

const MAX_MB = Math.round(APP_CONFIG.intake.maxFileSizeBytes / (1024 * 1024));

const ONBOARDING_WORKFLOW_STEPS = [
  {
    code: '01',
    title: 'Explore',
    description:
      'Search, filter, sort, and inspect tabular records with missing values highlighted.',
    icon: Table2,
  },
  {
    code: '02',
    title: 'Statistics',
    description:
      'Compute numeric distributions, quartiles, and categorical frequency tables locally.',
    icon: Activity,
  },
  {
    code: '03',
    title: 'Visualize',
    description:
      'Build schema-validated bar charts, histograms, line charts, scatter plots, and box plots.',
    icon: BarChart3,
  },
  {
    code: '04',
    title: 'Investigate',
    description:
      'Surface deterministic anomalies, log hypotheses, and compile exportable dossiers.',
    icon: Crosshair,
  },
] as const;

/**
 * State-aware Overview workspace:
 * - Unloaded: concise onboarding experience and primary local evidence intake bay.
 * - Loaded: analytical command centre with active dataset banner, inline
 *   cancelable file-replacement bay, factual workspace launch cards, and
 *   Module 03 schema & quality profiling.
 */
export function OverviewPage() {
  const {
    activeDataset,
    clearDataset,
    datasetProfile,
    profilingStatus,
    statisticalSummary,
    statisticsStatus,
  } = useDataset();
  const prefersReducedMotion = useReducedMotion();
  const [showIntakeWhileLoaded, setShowIntakeWhileLoaded] = useState(false);

  const handleClear = () => {
    clearDataset();
    setShowIntakeWhileLoaded(false);
  };

  if (!activeDataset) {
    return (
      <PageContainer width="standard">
        <div className="dd-anim-file-enter space-y-8">
          {/* Unloaded Onboarding Hero */}
          <section
            data-testid="overview-onboarding-hero"
            className="dd-surface-elevated relative overflow-hidden p-6 sm:p-8"
          >
            {!prefersReducedMotion && (
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-[1px] overflow-hidden"
                aria-hidden="true"
              >
                <div className="dd-anim-scan-x h-full w-1/2 bg-[linear-gradient(90deg,transparent,var(--dd-accent-teal),transparent)]" />
              </div>
            )}

            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <DossierLabel
                  code="CASE WORKSPACE"
                  label="Awaiting Evidence File"
                />
                <StatusIndicator tone="analytical" label="Ready for Intake" />
              </div>

              <h2 className="max-w-3xl text-balance text-[clamp(1.65rem,2.8vw,2.25rem)] font-semibold leading-[1.16] tracking-[-0.025em] text-[var(--dd-text-primary)]">
                Transform raw spreadsheets into evidence-backed discoveries.
              </h2>

              <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--dd-text-secondary)]">
                Upload a CSV or Excel (.xlsx) dataset to profile its schema,
                compute descriptive statistics, build visualizations, and run
                structured investigations locally in your browser.
              </p>

              {/* Clean unboxed technical constraints metadata */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--dd-border-subtle)] pt-4 font-mono text-[0.75rem] text-[var(--dd-text-muted)] dd-tabular">
                <span>
                  Supported formats:{' '}
                  <span className="text-[var(--dd-text-secondary)]">
                    {APP_CONFIG.intake.supportedExtensions.join(' · ')}
                  </span>
                </span>
                <span aria-hidden="true">/</span>
                <span>
                  Limits:{' '}
                  <span className="text-[var(--dd-text-secondary)]">
                    {MAX_MB} MB · {formatCount(APP_CONFIG.intake.maxRows)} rows
                    · {formatCount(APP_CONFIG.intake.maxColumns)} cols
                  </span>
                </span>
                <span aria-hidden="true">/</span>
                <span>
                  Privacy:{' '}
                  <span className="text-[var(--dd-text-secondary)]">
                    Local browser processing only
                  </span>
                </span>
              </div>
            </div>
          </section>

          {/* Primary Upload Action */}
          <EvidenceIntakePanel
            onImportComplete={() => setShowIntakeWhileLoaded(false)}
          />

          {/* Concise Unloaded Workflow Summary */}
          <section
            aria-labelledby="onboarding-workflow-heading"
            className="space-y-4"
          >
            <h3
              id="onboarding-workflow-heading"
              className="font-mono text-[0.72rem] font-medium tracking-[0.06em] text-[var(--dd-text-muted)] uppercase"
            >
              Analytical workflow once loaded
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ONBOARDING_WORKFLOW_STEPS.map((step) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.code}
                    className="dd-surface-primary space-y-2.5 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[0.7rem] text-[var(--dd-accent-teal)] dd-tabular">
                        {step.code}
                      </span>
                      <Icon
                        className="h-4 w-4 text-[var(--dd-text-muted)]"
                        aria-hidden="true"
                      />
                    </div>
                    <h4 className="text-[0.875rem] font-semibold text-[var(--dd-text-primary)]">
                      {step.title}
                    </h4>
                    <p className="text-[0.8125rem] leading-relaxed text-[var(--dd-text-secondary)]">
                      {step.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </PageContainer>
    );
  }

  // Compute strictly factual metadata for workspace cards (no placeholder or fabricated metrics)
  const explorerMeta = `${formatCount(activeDataset.rowCount)} rows · ${formatCount(activeDataset.columnCount)} columns`;

  const statisticsMeta = statisticalSummary
    ? `${formatCount(statisticalSummary.numericColumns.length)} numeric · ${formatCount(statisticalSummary.categoricalColumns.length)} categorical`
    : statisticsStatus === 'analyzing' || profilingStatus === 'profiling'
      ? 'Computing statistical baselines…'
      : statisticsStatus === 'error' || profilingStatus === 'error'
        ? 'Analysis unavailable — retry below'
        : `${formatCount(activeDataset.columnCount)} columns queued`;

  const chartableColumnsCount = datasetProfile
    ? datasetProfile.typeDistribution.numeric +
      datasetProfile.typeDistribution.categorical +
      datasetProfile.typeDistribution.date
    : null;

  const visualizationsMeta =
    datasetProfile && chartableColumnsCount !== null
      ? `${formatCount(chartableColumnsCount)} of ${formatCount(datasetProfile.columnCount)} columns chartable`
      : profilingStatus === 'profiling'
        ? 'Detecting column schemas…'
        : profilingStatus === 'error'
          ? 'Schema profile required'
          : `${formatCount(activeDataset.columnCount)} columns loaded`;

  const investigationMeta = datasetProfile
    ? `${formatCount(datasetProfile.warnings.length)} quality notice${datasetProfile.warnings.length === 1 ? '' : 's'} · Quality ${datasetProfile.quality.overallScore}/100`
    : profilingStatus === 'profiling'
      ? 'Profiling dataset quality…'
      : profilingStatus === 'error'
        ? 'Profiling failed — retry below'
        : 'Ready for anomaly inspection';

  const workspaceCards = [
    {
      id: 'explorer',
      title: 'Explorer',
      path: '/explorer',
      icon: Table2,
      metadata: explorerMeta,
      description:
        'Filter, search, sort, and inspect records across all columns.',
    },
    {
      id: 'analysis',
      title: 'Statistics',
      path: '/analysis',
      icon: Activity,
      metadata: statisticsMeta,
      description:
        'Review descriptive statistics, quartiles, spread, and category frequencies.',
    },
    {
      id: 'visualizations',
      title: 'Visualizations',
      path: '/visualizations',
      icon: BarChart3,
      metadata: visualizationsMeta,
      description:
        'Create schema-validated bar charts, histograms, line, scatter, and box plots.',
    },
    {
      id: 'investigation',
      title: 'Investigation',
      path: '/investigation',
      icon: Crosshair,
      metadata: investigationMeta,
      description:
        'Review deterministic findings, anomalies, evidence boards, and cases.',
    },
  ] as const;

  return (
    <PageContainer width="standard">
      <div
        data-testid="overview-loaded-workspace"
        className="dd-anim-file-enter space-y-8"
      >
        {/* Active Dataset Command Banner */}
        <ActiveDatasetBanner
          dataset={activeDataset}
          onClearDataset={handleClear}
          onRequestReplace={() => setShowIntakeWhileLoaded(true)}
          isReplaceOpen={showIntakeWhileLoaded}
        />

        {/* Optional Inline Replace-File Intake Panel (dismissible without losing active dataset) */}
        {showIntakeWhileLoaded && (
          <EvidenceIntakePanel
            onImportComplete={() => setShowIntakeWhileLoaded(false)}
            onCancel={() => setShowIntakeWhileLoaded(false)}
          />
        )}

        {/* Analytical Workspace Command Cards */}
        <section
          aria-labelledby="workspace-modules-heading"
          data-testid="overview-workspace-cards"
          className="space-y-4"
        >
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--dd-border-subtle)] pb-3.5">
            <div className="space-y-1">
              <DossierLabel code="COMMAND CENTRE" label="Analytical Modules" />
              <h3
                id="workspace-modules-heading"
                className="text-[1.0625rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]"
              >
                Analytical Workspace
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-[0.78rem]">
              <Link
                to="/assistant"
                className="inline-flex items-center gap-1.5 text-[var(--dd-text-secondary)] transition-colors hover:text-[var(--dd-accent-teal)] whitespace-nowrap"
              >
                <TerminalSquare className="h-3.5 w-3.5" aria-hidden="true" />
                <span>AI Assistant</span>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link
                to="/reports"
                className="inline-flex items-center gap-1.5 text-[var(--dd-text-secondary)] transition-colors hover:text-[var(--dd-accent-teal)] whitespace-nowrap"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Reports &amp; Export</span>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workspaceCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.id}
                  to={card.path}
                  className="dd-surface-primary group flex flex-col justify-between p-5 transition-colors duration-150 hover:border-[var(--dd-accent-teal-border)] hover:bg-[var(--dd-surface-elevated)]"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon
                          className="h-4 w-4 shrink-0 text-[var(--dd-accent-teal)]"
                          aria-hidden="true"
                        />
                        <h4 className="truncate text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
                          {card.title}
                        </h4>
                      </div>
                      <ArrowUpRight
                        className="h-4 w-4 shrink-0 text-[var(--dd-text-muted)] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--dd-accent-teal)]"
                        aria-hidden="true"
                      />
                    </div>

                    <p className="text-[0.8125rem] leading-relaxed text-[var(--dd-text-secondary)]">
                      {card.description}
                    </p>
                  </div>

                  <p className="mt-4 border-t border-[var(--dd-border-subtle)] pt-3 font-mono text-[0.72rem] text-[var(--dd-text-muted)] dd-tabular">
                    {card.metadata}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Module 03: Dataset Schema Detection & Intelligent Profiling */}
        <DatasetProfilingSection />
      </div>
    </PageContainer>
  );
}
