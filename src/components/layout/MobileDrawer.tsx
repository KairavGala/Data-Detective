import { useEffect, useRef } from 'react';
import { FileSpreadsheet, Keyboard, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import {
  getRouteNavIndicator,
  useNavigationAwareness,
} from '@/components/layout/useNavigationAwareness';
import { ShortcutKeycap } from '@/components/shortcuts/ShortcutKeycap';
import { BrandMark } from '@/components/ui/BrandMark';
import { WORKSPACE_ROUTES } from '@/config/navigation';
import { cn } from '@/utils';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpenShortcuts?: () => void;
}

/**
 * Responsive navigation drawer for tablet and mobile viewports (< lg).
 * Mirrors Sidebar dataset awareness, live factual findings/cases/reports
 * indicators, active route highlighting, Escape/backdrop dismissal, and focus handoff.
 */
export function MobileDrawer({
  open,
  onClose,
  onOpenShortcuts,
}: MobileDrawerProps) {
  const drawerRef = useRef<HTMLElement | null>(null);
  const awareness = useNavigationAwareness();

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    const frame = window.requestAnimationFrame(() => {
      const container = drawerRef.current;
      if (!container) return;
      const target =
        container.querySelector<HTMLElement>('nav a[aria-current="page"]') ??
        container.querySelector<HTMLElement>('nav a');
      target?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  const workspaceRoutes = WORKSPACE_ROUTES.filter(
    (route) => route.group === 'workspace',
  );
  const systemRoutes = WORKSPACE_ROUTES.filter(
    (route) => route.group === 'system',
  );

  return (
    <div
      className={cn(
        'fixed inset-0 z-[var(--dd-z-overlay)] lg:hidden',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      aria-hidden={!open}
    >
      {/* Backdrop scrim */}
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 bg-[var(--dd-surface-overlay)] transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* Drawer panel */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile workspace navigation"
        data-testid="mobile-drawer"
        className={cn(
          'fixed inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] shadow-[var(--dd-shadow-elevated)] transition-transform duration-200 ease-[var(--dd-ease-settle)]',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-[var(--dd-border-subtle)] px-4">
          <NavLink
            to="/"
            onClick={onClose}
            className="min-w-0 rounded-[var(--dd-radius-sm)]"
          >
            <BrandMark />
          </NavLink>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[var(--dd-radius-sm)] text-[var(--dd-text-secondary)] transition-colors hover:bg-[var(--dd-surface-hover)] hover:text-[var(--dd-text-primary)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Dataset Awareness Readout */}
        <div
          data-testid="drawer-dataset-status"
          className="border-b border-[var(--dd-border-subtle)] px-4 py-3"
        >
          {awareness.hasDataset && awareness.datasetFileName ? (
            <div className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet
                className="h-3.5 w-3.5 shrink-0 text-[var(--dd-status-verified)]"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div
                  title={awareness.datasetFileName}
                  className="truncate text-[0.78rem] font-medium text-[var(--dd-text-primary)]"
                >
                  {awareness.datasetFileName}
                </div>
                <div className="font-mono text-[0.68rem] text-[var(--dd-text-muted)] dd-tabular">
                  {awareness.datasetDimensions} · Loaded
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="font-mono text-[0.65rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                Active Dataset
              </div>
              <div className="text-[0.78rem] text-[var(--dd-text-secondary)]">
                No dataset loaded
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-2 px-2.5 font-mono text-[0.65rem] tracking-[0.09em] text-[var(--dd-text-muted)] uppercase">
            Workspace
          </div>

          <ul className="space-y-1">
            {workspaceRoutes.map((route) => {
              const Icon = route.icon;
              const indicator = getRouteNavIndicator(route.id, awareness);
              const isAwaitingDataset =
                route.requiresDataset &&
                !awareness.hasDataset &&
                !(route.id === 'reports' && awareness.sessionReportsCount > 0);

              return (
                <li key={route.id}>
                  <NavLink
                    to={route.path}
                    end={route.path === '/'}
                    onClick={onClose}
                    data-dataset-state={
                      isAwaitingDataset ? 'awaiting-dataset' : 'ready'
                    }
                    className={({ isActive }) =>
                      cn(
                        'flex items-center justify-between gap-2.5 rounded-[var(--dd-radius-sm)] px-3 py-2.5 text-[0.875rem] font-medium transition-colors',
                        isActive
                          ? 'bg-[var(--dd-surface-elevated)] text-[var(--dd-text-primary)] shadow-[inset_0_0_0_1px_var(--dd-accent-teal-border)]'
                          : isAwaitingDataset
                            ? 'text-[var(--dd-text-muted)] hover:bg-[var(--dd-surface-hover)] hover:text-[var(--dd-text-secondary)]'
                            : 'text-[var(--dd-text-secondary)] hover:bg-[var(--dd-surface-hover)] hover:text-[var(--dd-text-primary)]',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className="flex min-w-0 items-center gap-3">
                          <Icon
                            className={cn(
                              'h-4 w-4 shrink-0',
                              isActive
                                ? 'text-[var(--dd-accent-teal)]'
                                : isAwaitingDataset
                                  ? 'text-[var(--dd-text-muted)] opacity-60'
                                  : 'text-[var(--dd-text-muted)]',
                            )}
                            aria-hidden="true"
                          />
                          <span className="truncate whitespace-nowrap">
                            {route.label}
                          </span>
                        </span>

                        {indicator && (
                          <span
                            data-testid={`drawer-indicator-${route.id}`}
                            className={cn(
                              'font-mono text-[0.7rem] dd-tabular shrink-0 whitespace-nowrap',
                              indicator.tone === 'verified'
                                ? 'text-[var(--dd-status-verified)]'
                                : indicator.tone === 'analytical'
                                  ? 'text-[var(--dd-accent-teal)]'
                                  : 'text-[var(--dd-text-muted)]',
                            )}
                          >
                            <span aria-hidden="true">{indicator.display}</span>
                            <span className="sr-only">
                              {' '}
                              ({indicator.srLabel})
                            </span>
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-[var(--dd-border-subtle)] px-3 py-3">
          <ul className="space-y-1">
            {systemRoutes.map((route) => {
              const Icon = route.icon;
              return (
                <li key={route.id}>
                  <NavLink
                    to={route.path}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center justify-between gap-2.5 rounded-[var(--dd-radius-sm)] px-3 py-2.5 text-[0.875rem] font-medium transition-colors',
                        isActive
                          ? 'bg-[var(--dd-surface-elevated)] text-[var(--dd-text-primary)] shadow-[inset_0_0_0_1px_var(--dd-accent-teal-border)]'
                          : 'text-[var(--dd-text-secondary)] hover:bg-[var(--dd-surface-hover)] hover:text-[var(--dd-text-primary)]',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <span className="flex min-w-0 items-center gap-3">
                        <Icon
                          className={cn(
                            'h-4 w-4 shrink-0',
                            isActive
                              ? 'text-[var(--dd-accent-teal)]'
                              : 'text-[var(--dd-text-muted)]',
                          )}
                          aria-hidden="true"
                        />
                        <span className="truncate whitespace-nowrap">
                          {route.label}
                        </span>
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            })}

            {onOpenShortcuts && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenShortcuts();
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-[var(--dd-radius-sm)] px-3 py-2.5 text-[0.875rem] font-medium text-[var(--dd-text-secondary)] transition-colors hover:bg-[var(--dd-surface-hover)] hover:text-[var(--dd-text-primary)]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Keyboard
                      className="h-4 w-4 shrink-0 text-[var(--dd-text-muted)]"
                      aria-hidden="true"
                    />
                    <span className="truncate whitespace-nowrap">
                      Shortcuts
                    </span>
                  </span>
                  <ShortcutKeycap keys={['?']} size="sm" />
                </button>
              </li>
            )}
          </ul>
        </div>
      </aside>
    </div>
  );
}
