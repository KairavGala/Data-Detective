import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { APP_CONFIG } from '@/config/app.config';
import { WORKSPACE_ROUTES } from '@/config/navigation';
import { useDataset } from '@/context/DatasetContext';
import {
  ActiveDatasetBanner,
  EvidenceIntakePanel,
} from '@/features/intake';
import { DatasetProfilingSection } from '@/features/profiling';
import { useReducedMotion } from '@/hooks';
import { formatCount } from '@/utils';

const INVESTIGATIVE_SECTIONS = WORKSPACE_ROUTES.filter(
  (route) => route.group === 'workspace' && route.id !== 'overview',
);

const MAX_MB = Math.round(APP_CONFIG.intake.maxFileSizeBytes / (1024 * 1024));

/**
 * Overview workspace integrating the forensic welcome dossier,
 * the active in-memory dataset summary, the Module 02 Evidence Intake Bay,
 * the Module 03 Dataset Schema & Quality Profiling report,
 * and navigation into analytical sections.
 */
export function OverviewPage() {
  const { activeDataset, clearDataset } = useDataset();
  const prefersReducedMotion = useReducedMotion();
  const [showIntakeWhileLoaded, setShowIntakeWhileLoaded] = useState(false);

  const handleClear = () => {
    clearDataset();
    setShowIntakeWhileLoaded(false);
  };

  const shouldRenderIntake = !activeDataset || showIntakeWhileLoaded;

  return (
    <PageContainer width="standard">
      <div className="dd-anim-file-enter space-y-8">
        {/* Hero Investigative Dossier Frame */}
        <section className="dd-surface-elevated relative overflow-hidden p-6 sm:p-8">
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
                label={
                  activeDataset
                    ? 'Active Evidence Registered'
                    : 'Awaiting Evidence File'
                }
              />
              <StatusIndicator
                tone={activeDataset ? 'verified' : 'analytical'}
                label={activeDataset ? 'Dataset Loaded' : 'Ready for Intake'}
              />
            </div>

            <h2 className="max-w-3xl text-[clamp(1.65rem,2.8vw,2.25rem)] font-semibold leading-[1.16] tracking-[-0.025em] text-[var(--dd-text-primary)]">
              Transform raw spreadsheets into evidence-backed discoveries.
            </h2>

            <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--dd-text-secondary)]">
              Data Detective is a forensic analytical workstation built to
              ingest CSV and Excel (.xlsx) datasets locally in your browser,
              verify file structure and headers, detect column schemas, and
              profile dataset quality for analytical modules.
            </p>

            {/* Clean unboxed technical metadata row */}
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
                  {MAX_MB} MB · {formatCount(APP_CONFIG.intake.maxRows)} rows ·{' '}
                  {formatCount(APP_CONFIG.intake.maxColumns)} cols
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

        {/* Active Dataset Dossier (when a dataset is registered in memory) */}
        {activeDataset && (
          <ActiveDatasetBanner
            dataset={activeDataset}
            onClearDataset={handleClear}
            onRequestReplace={() => setShowIntakeWhileLoaded(true)}
          />
        )}

        {/* Evidence Intake Bay (Upload, Validation, Worksheet Selection & Preview) */}
        {shouldRenderIntake && (
          <EvidenceIntakePanel
            onImportComplete={() => setShowIntakeWhileLoaded(false)}
          />
        )}

        {/* Module 03: Dataset Schema Detection & Intelligent Profiling */}
        {activeDataset && <DatasetProfilingSection />}

        {/* Investigation Protocol: What users will eventually be able to investigate */}
        <section
          aria-labelledby="investigation-protocol-heading"
          className="space-y-5 pt-2"
        >
          <div className="flex flex-col gap-2 border-b border-[var(--dd-border-subtle)] pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <DossierLabel
                code="PROTOCOL"
                label="Analytical Capabilities Roadmap"
              />
              <h3
                id="investigation-protocol-heading"
                className="text-[1.125rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]"
              >
                What you will be able to investigate
              </h3>
            </div>
            <p className="font-mono text-[0.75rem] text-[var(--dd-text-muted)]">
              Select any section to inspect its scope and prerequisites
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {INVESTIGATIVE_SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <Link
                  key={section.id}
                  to={section.path}
                  className="dd-surface-primary group flex flex-col justify-between p-5 transition-colors duration-150 hover:border-[var(--dd-accent-teal-border)] hover:bg-[var(--dd-surface-elevated)]"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[0.7rem] tracking-[0.06em] text-[var(--dd-accent-teal)] dd-tabular">
                        {section.sectionCode}
                      </span>
                      <ArrowUpRight
                        className="h-4 w-4 text-[var(--dd-text-muted)] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--dd-accent-teal)]"
                        aria-hidden="true"
                      />
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Icon
                        className="h-4 w-4 shrink-0 text-[var(--dd-text-secondary)] group-hover:text-[var(--dd-text-primary)]"
                        aria-hidden="true"
                      />
                      <h4 className="text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
                        {section.label}
                      </h4>
                    </div>

                    <p className="text-[0.8125rem] leading-relaxed text-[var(--dd-text-secondary)]">
                      {section.summary}
                    </p>
                  </div>

                  <div className="mt-5 border-t border-[var(--dd-border-subtle)] pt-3 font-mono text-[0.7rem] text-[var(--dd-text-muted)]">
                    {section.plannedModule}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
