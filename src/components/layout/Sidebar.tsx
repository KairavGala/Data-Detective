import { type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import {
  FileSpreadsheet,
  Keyboard,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import {
  getRouteNavIndicator,
  useNavigationAwareness,
} from '@/components/layout/useNavigationAwareness';
import { ShortcutKeycap } from '@/components/shortcuts/ShortcutKeycap';
import { BrandMark } from '@/components/ui/BrandMark';
import { WORKSPACE_ROUTES } from '@/config/navigation';
import { cn } from '@/utils';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenShortcuts: () => void;
  sidebarRef?: RefObject<HTMLElement | null>;
}

/**
 * Desktop investigative workstation sidebar.
 * Supports collapsible rail mode (72px), full dossier navigation (256px),
 * live factual dataset/findings/cases/reports awareness indicators,
 * programmatic focus via keyboard shortcut, and roving Up/Down arrow navigation.
 */
export function Sidebar({
  collapsed,
  onToggleCollapse,
  onOpenShortcuts,
  sidebarRef,
}: SidebarProps) {
  const awareness = useNavigationAwareness();

  const workspaceRoutes = WORKSPACE_ROUTES.filter(
    (route) => route.group === 'workspace',
  );
  const systemRoutes = WORKSPACE_ROUTES.filter(
    (route) => route.group === 'system',
  );

  const handleSidebarKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }

    const container = event.currentTarget;
    const items = Array.from(
      container.querySelectorAll<HTMLElement>('[data-sidebar-nav-item="true"]'),
    );
    if (items.length === 0) return;

    const currentIndex = items.findIndex(
      (item) => item === document.activeElement,
    );
    if (currentIndex === -1) return;

    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = items.length - 1;
    }

    items[nextIndex]?.focus();
  };

  return (
    <aside
      ref={sidebarRef}
      tabIndex={-1}
      onKeyDown={handleSidebarKeyDown}
      aria-label="Primary workspace navigation"
      data-testid="desktop-sidebar"
      className={cn(
        'hidden lg:flex lg:flex-col lg:shrink-0 border-r border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] transition-[width] duration-200 ease-[var(--dd-ease-settle)] focus:outline-none',
        collapsed ? 'w-[72px]' : 'w-[256px]',
      )}
    >
      {/* Brand identity header */}
      <div
        className={cn(
          'flex h-14 items-center border-b border-[var(--dd-border-subtle)]',
          collapsed ? 'justify-center px-3' : 'justify-between px-4',
        )}
      >
        <NavLink
          to="/"
          className="min-w-0 rounded-[var(--dd-radius-sm)] focus-visible:outline-2 focus-visible:outline-[var(--dd-accent-teal)]"
          aria-label="Data Detective Overview"
        >
          <BrandMark compact={collapsed} />
        </NavLink>

        {!collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            aria-expanded={!collapsed}
            title="Collapse sidebar ([ or Ctrl/⌘+B)"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--dd-radius-sm)] text-[var(--dd-text-muted)] transition-colors hover:bg-[var(--dd-surface-hover)] hover:text-[var(--dd-text-primary)]"
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <div className="flex justify-center border-b border-[var(--dd-border-subtle)] py-2.5">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            aria-expanded={!collapsed}
            title="Expand sidebar ([ or Ctrl/⌘+B)"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[var(--dd-radius-sm)] text-[var(--dd-text-muted)] transition-colors hover:bg-[var(--dd-surface-hover)] hover:text-[var(--dd-text-primary)]"
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Compact Dataset Awareness Readout (expanded mode only) */}
      {!collapsed && (
        <div
          data-testid="sidebar-dataset-status"
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
                  className="truncate text-[0.75rem] font-medium text-[var(--dd-text-primary)]"
                >
                  {awareness.datasetFileName}
                </div>
                <div className="font-mono text-[0.65rem] text-[var(--dd-text-muted)] dd-tabular">
                  {awareness.datasetDimensions} · Loaded
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="font-mono text-[0.65rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
                Active Dataset
              </div>
              <div className="text-[0.75rem] text-[var(--dd-text-secondary)]">
                No dataset loaded
              </div>
            </div>
          )}
        </div>
      )}

      {/* Primary analytical navigation */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-4">
        {!collapsed && (
          <div className="mb-2 px-2.5 font-mono text-[0.65rem] tracking-[0.09em] text-[var(--dd-text-muted)] uppercase">
            Workspace
          </div>
        )}

        <ul className="space-y-1">
          {workspaceRoutes.map((route) => {
            const Icon = route.icon;
            const indicator = getRouteNavIndicator(route.id, awareness);
            const isAwaitingDataset =
              route.requiresDataset &&
              !awareness.hasDataset &&
              !(route.id === 'reports' && awareness.sessionReportsCount > 0);

            const shortcutTitle = indicator
              ? `${route.label} — ${indicator.title} (G then ${route.shortcutKey})`
              : isAwaitingDataset
                ? `${route.label} — Load a dataset on Overview (G then ${route.shortcutKey})`
                : `${route.label} (G then ${route.shortcutKey})`;

            return (
              <li key={route.id}>
                <NavLink
                  to={route.path}
                  end={route.path === '/'}
                  data-sidebar-nav-item="true"
                  data-dataset-state={
                    isAwaitingDataset ? 'awaiting-dataset' : 'ready'
                  }
                  title={shortcutTitle}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center rounded-[var(--dd-radius-sm)] text-[0.8125rem] font-medium transition-colors duration-150',
                      collapsed
                        ? 'justify-center px-2 py-2.5'
                        : 'justify-between gap-2 px-2.5 py-2',
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
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Icon
                          className={cn(
                            'h-4 w-4 shrink-0 transition-colors',
                            isActive
                              ? 'text-[var(--dd-accent-teal)]'
                              : isAwaitingDataset
                                ? 'text-[var(--dd-text-muted)] opacity-60 group-hover:opacity-90'
                                : 'text-[var(--dd-text-muted)] group-hover:text-[var(--dd-text-secondary)]',
                          )}
                          aria-hidden="true"
                        />
                        {!collapsed && (
                          <span className="truncate whitespace-nowrap">
                            {route.label}
                          </span>
                        )}
                      </span>

                      {!collapsed && indicator && (
                        <span
                          data-testid={`sidebar-indicator-${route.id}`}
                          className={cn(
                            'font-mono text-[0.68rem] dd-tabular shrink-0 whitespace-nowrap',
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

      {/* System section (Settings & Keyboard Shortcuts) */}
      <div className="border-t border-[var(--dd-border-subtle)] px-2.5 py-3">
        <ul className="space-y-1">
          {systemRoutes.map((route) => {
            const Icon = route.icon;
            const shortcutTitle = `${route.label} (G then ${route.shortcutKey})`;
            return (
              <li key={route.id}>
                <NavLink
                  to={route.path}
                  data-sidebar-nav-item="true"
                  title={shortcutTitle}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center rounded-[var(--dd-radius-sm)] text-[0.8125rem] font-medium transition-colors duration-150',
                      collapsed
                        ? 'justify-center px-2 py-2.5'
                        : 'justify-between gap-2.5 px-2.5 py-2',
                      isActive
                        ? 'bg-[var(--dd-surface-elevated)] text-[var(--dd-text-primary)] shadow-[inset_0_0_0_1px_var(--dd-accent-teal-border)]'
                        : 'text-[var(--dd-text-secondary)] hover:bg-[var(--dd-surface-hover)] hover:text-[var(--dd-text-primary)]',
                    )
                  }
                >
                  {({ isActive }) => (
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0 transition-colors',
                          isActive
                            ? 'text-[var(--dd-accent-teal)]'
                            : 'text-[var(--dd-text-muted)] group-hover:text-[var(--dd-text-secondary)]',
                        )}
                        aria-hidden="true"
                      />
                      {!collapsed && (
                        <span className="truncate whitespace-nowrap">
                          {route.label}
                        </span>
                      )}
                    </span>
                  )}
                </NavLink>
              </li>
            );
          })}

          <li>
            <button
              type="button"
              onClick={onOpenShortcuts}
              data-sidebar-nav-item="true"
              aria-label="Keyboard Shortcuts"
              title="Keyboard Shortcuts (?)"
              className={cn(
                'group flex w-full cursor-pointer items-center rounded-[var(--dd-radius-sm)] text-[0.8125rem] font-medium text-[var(--dd-text-secondary)] transition-colors duration-150 hover:bg-[var(--dd-surface-hover)] hover:text-[var(--dd-text-primary)]',
                collapsed
                  ? 'justify-center px-2 py-2.5'
                  : 'justify-between gap-2.5 px-2.5 py-2',
              )}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Keyboard
                  className="h-4 w-4 shrink-0 text-[var(--dd-text-muted)] transition-colors group-hover:text-[var(--dd-text-secondary)]"
                  aria-hidden="true"
                />
                {!collapsed && (
                  <span className="truncate whitespace-nowrap">Shortcuts</span>
                )}
              </span>
              {!collapsed && <ShortcutKeycap keys={['?']} size="sm" />}
            </button>
          </li>
        </ul>
      </div>
    </aside>
  );
}
