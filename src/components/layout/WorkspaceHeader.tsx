import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { cn } from '@/utils';

export interface WorkspaceContextLink {
  readonly label: string;
  readonly to: string;
  readonly testId?: string;
}

interface WorkspaceHeaderProps {
  readonly code: string;
  readonly sectionLabel: string;
  readonly title: string;
  readonly context?: ReactNode;
  readonly description?: ReactNode;
  readonly status?: ReactNode;
  readonly actions?: ReactNode;
  readonly navigationLinks?: readonly WorkspaceContextLink[];
  readonly className?: string;
}

/**
 * Shared page-level workspace header enforcing consistent anatomy across all
 * analytical routes: contextual dossier label, H2 page title (Topbar owns H1),
 * dataset/context line, optional page-specific status, compact related-workspace
 * links, and right-aligned primary actions.
 */
export function WorkspaceHeader({
  code,
  sectionLabel,
  title,
  context,
  description,
  status,
  actions,
  navigationLinks,
  className,
}: WorkspaceHeaderProps) {
  return (
    <header
      data-testid="workspace-page-header"
      className={cn(
        'flex flex-col gap-4 border-b border-[var(--dd-border-subtle)] pb-5 lg:flex-row lg:items-end lg:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <DossierLabel code={code} label={sectionLabel} />
          {status}
        </div>

        <h2 className="truncate text-[1.375rem] font-semibold tracking-[-0.02em] text-[var(--dd-text-primary)]">
          {title}
        </h2>

        {context && (
          <p className="font-mono text-[0.75rem] text-[var(--dd-text-muted)] dd-tabular">
            {context}
          </p>
        )}

        {description && (
          <p className="max-w-2xl text-[0.875rem] leading-relaxed text-[var(--dd-text-secondary)]">
            {description}
          </p>
        )}

        {navigationLinks && navigationLinks.length > 0 && (
          <nav
            aria-label="Related workspaces"
            data-testid="workspace-context-nav"
            className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 font-mono text-[0.75rem]"
          >
            <span className="text-[var(--dd-text-muted)]">Continue in:</span>
            {navigationLinks.map((item, idx) => (
              <span key={`${item.to}-${item.label}`} className="inline-flex items-center gap-2">
                {idx > 0 && (
                  <span aria-hidden="true" className="text-[var(--dd-border-strong)]">
                    ·
                  </span>
                )}
                <Link
                  to={item.to}
                  data-testid={item.testId}
                  className="whitespace-nowrap text-[var(--dd-accent-teal)] transition-colors hover:text-[var(--dd-accent-teal-hover)] hover:underline"
                >
                  {item.label}
                </Link>
              </span>
            ))}
          </nav>
        )}
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
}
