import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import type { WorkspaceRouteConfig } from '@/config/navigation';
import { useDataset } from '@/context/DatasetContext';
import { formatCount } from '@/utils';

interface SectionEmptyStateProps {
  route: WorkspaceRouteConfig;
}

/**
 * Honest forensic empty state for analytical modules awaiting future incremental
 * module implementation. Reflects active dataset state factually without rendering
 * fake charts or metrics.
 */
export function SectionEmptyState({ route }: SectionEmptyStateProps) {
  const { activeDataset } = useDataset();
  const Icon = route.icon;

  return (
    <PageContainer width="standard">
      <div className="dd-anim-file-enter space-y-8">
        {/* Section header dossier block */}
        <header className="flex flex-col gap-4 border-b border-[var(--dd-border-subtle)] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2.5">
            <DossierLabel
              code={route.sectionCode}
              label={`Scheduled · ${route.plannedModule}`}
            />
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] text-[var(--dd-accent-teal)]"
                aria-hidden="true"
              >
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-[1.5rem] font-semibold tracking-[-0.02em] text-[var(--dd-text-primary)]">
                {route.label}
              </h2>
            </div>
            <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--dd-text-secondary)]">
              {route.summary}
            </p>
            {activeDataset && (
              <p className="font-mono text-[0.75rem] text-[var(--dd-accent-teal)] dd-tabular">
                Active dataset in memory: {activeDataset.fileName} (
                {formatCount(activeDataset.rowCount)} rows ×{' '}
                {formatCount(activeDataset.columnCount)} columns)
              </p>
            )}
          </div>

          <StatusIndicator
            tone={activeDataset ? 'verified' : 'neutral'}
            label={activeDataset ? 'Dataset Ready · Module Pending' : 'Awaiting Dataset'}
          />
        </header>

        {/* Two-column architectural briefing (zero fake metrics or charts) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Planned analytical capabilities */}
          <section className="dd-surface-primary p-6 lg:col-span-7">
            <div className="mb-4 flex items-center justify-between border-b border-[var(--dd-border-subtle)] pb-3">
              <h3 className="font-mono text-[0.75rem] font-medium tracking-[0.06em] text-[var(--dd-text-secondary)] uppercase">
                Planned Capabilities
              </h3>
              <span className="font-mono text-[0.7rem] text-[var(--dd-text-muted)] dd-tabular">
                {route.plannedCapabilities.length} items
              </span>
            </div>

            <ol className="space-y-4">
              {route.plannedCapabilities.map((capability, idx) => (
                <li
                  key={capability}
                  className="flex items-start gap-3.5 text-[0.875rem] leading-relaxed text-[var(--dd-text-secondary)]"
                >
                  <span className="mt-0.5 font-mono text-[0.75rem] text-[var(--dd-accent-teal)] dd-tabular shrink-0">
                    {String(idx + 1).padStart(2, '0')}.
                  </span>
                  <span>{capability}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* Prerequisites & navigation */}
          <aside className="dd-surface-recessed flex flex-col justify-between p-6 lg:col-span-5">
            <div className="space-y-4">
              <div className="border-b border-[var(--dd-border-subtle)] pb-3">
                <h3 className="font-mono text-[0.75rem] font-medium tracking-[0.06em] text-[var(--dd-text-secondary)] uppercase">
                  Activation Requirements
                </h3>
              </div>

              <ul className="space-y-3">
                {route.prerequisites.map((req) => (
                  <li
                    key={req}
                    className="flex items-start gap-2.5 text-[0.8125rem] leading-relaxed text-[var(--dd-text-secondary)]"
                  >
                    <span
                      className="mt-1 text-[0.6rem] text-[var(--dd-status-warning)] shrink-0"
                      aria-hidden="true"
                    >
                      ▲
                    </span>
                    <span>{req}</span>
                  </li>
                ))}
              </ul>

              <p className="pt-2 font-mono text-[0.75rem] leading-relaxed text-[var(--dd-text-muted)]">
                No synthetic records or placeholder charts are displayed when
                this section has no active dataset.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--dd-border-subtle)] pt-5">
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20 whitespace-nowrap"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Return to Overview</span>
              </Link>

              <Link
                to="/settings"
                className="inline-flex items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)] whitespace-nowrap"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Settings</span>
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </PageContainer>
  );
}
