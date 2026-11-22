import { useEffect, useRef } from 'react';
import { Keyboard, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
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
 * Supports Escape-key dismissal, backdrop click dismissal, focus handoff on open,
 * and auto-close on navigation.
 */
export function MobileDrawer({
  open,
  onClose,
  onOpenShortcuts,
}: MobileDrawerProps) {
  const drawerRef = useRef<HTMLElement | null>(null);

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

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-2 px-2.5 font-mono text-[0.65rem] tracking-[0.09em] text-[var(--dd-text-muted)] uppercase">
            Investigation Sections
          </div>

          <ul className="space-y-1">
            {workspaceRoutes.map((route) => {
              const Icon = route.icon;
              return (
                <li key={route.id}>
                  <NavLink
                    to={route.path}
                    end={route.path === '/'}
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
                      <>
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
                        <span className="font-mono text-[0.7rem] text-[var(--dd-text-muted)] dd-tabular">
                          {route.sectionCode.replace('SEC-', '')}
                        </span>
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
                      <>
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
                        <span className="font-mono text-[0.7rem] text-[var(--dd-text-muted)] dd-tabular">
                          {route.sectionCode.replace('SEC-', '')}
                        </span>
                      </>
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
