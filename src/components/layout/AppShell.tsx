import { useCallback, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { MobileDrawer } from '@/components/layout/MobileDrawer';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { KeyboardShortcutsModal } from '@/components/shortcuts/KeyboardShortcutsModal';
import { ShortcutHud } from '@/components/shortcuts/ShortcutHud';
import { getRouteByPath, WORKSPACE_ROUTES } from '@/config/navigation';
import {
  KeyboardShortcutsProvider,
  type ShortcutDefinition,
  useKeyboardShortcuts,
  useRegisterShortcuts,
} from '@/context/KeyboardShortcutsContext';

const SIDEBAR_STORAGE_KEY = 'dd_sidebar_collapsed';

export interface AppShellContext {
  readonly sidebarCollapsed: boolean;
  readonly toggleSidebar: () => void;
  readonly replayBootSequence: () => void;
  readonly skipBootOnStartup: boolean;
  readonly setSkipBootOnStartup: (skip: boolean) => void;
}

interface AppShellProps {
  onReplayBoot: () => void;
  skipBootOnStartup: boolean;
  onSetSkipBootOnStartup: (skip: boolean) => void;
}

function isDesktopViewport(): boolean {
  if (typeof window === 'undefined') return true;
  if (typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(min-width: 1024px)');
    // In jsdom, matchMedia may be unimplemented or default false while innerWidth is 1024
    if (mq.matches) return true;
  }
  return window.innerWidth >= 1024;
}

function AppShellInner({
  onReplayBoot,
  skipBootOnStartup,
  onSetSkipBootOnStartup,
}: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentRoute = getRouteByPath(location.pathname);
  const { openHelp, toggleHelp } = useKeyboardShortcuts();

  const sidebarRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage quota / privacy mode restrictions
      }
      return next;
    });
  }, []);

  const focusSidebar = useCallback(() => {
    if (isDesktopViewport() && sidebarRef.current) {
      const target =
        sidebarRef.current.querySelector<HTMLElement>(
          '[data-sidebar-nav-item="true"][aria-current="page"]',
        ) ??
        sidebarRef.current.querySelector<HTMLElement>(
          '[data-sidebar-nav-item="true"]',
        ) ??
        sidebarRef.current;
      target.focus();
      return;
    }
    setMobileMenuOpen(true);
  }, []);

  const focusMainWorkspace = useCallback(() => {
    mainRef.current?.focus();
  }, []);

  const workstationShortcuts = useMemo<readonly ShortcutDefinition[]>(() => {
    const routeShortcuts: ShortcutDefinition[] = WORKSPACE_ROUTES.map(
      (route, index) => ({
        id: `nav.${route.id}`,
        label: route.label,
        description: `Jump directly to ${route.label} (${route.sectionCode})`,
        category: 'navigation',
        keys: ['G', route.shortcutKey],
        keyJoiner: 'then',
        alternateHint: `or G › ${index}`,
        sequence: ['g', route.shortcutKey.toLowerCase()],
        altSequence: ['g', String(index)],
        announcement: `Navigated to ${route.label}`,
        handler: () => {
          setMobileMenuOpen(false);
          navigate(route.path);
        },
      }),
    );

    const workspaceControls: ShortcutDefinition[] = [
      {
        id: 'workspace.focus-sidebar',
        label: 'Focus Sidebar',
        description:
          'Move keyboard focus to the navigation sidebar (or open menu on mobile)',
        category: 'workspace',
        keys: ['S'],
        alternateHint: 'or G › S',
        combo: { key: 's' },
        sequence: ['g', 's'],
        announcement: 'Sidebar focused',
        handler: focusSidebar,
      },
      {
        id: 'workspace.focus-main',
        label: 'Focus Main Workspace',
        description: 'Return keyboard focus to the active workspace panel',
        category: 'workspace',
        keys: ['M'],
        alternateHint: 'or G › M',
        combo: { key: 'm' },
        sequence: ['g', 'm'],
        announcement: 'Main workspace focused',
        handler: focusMainWorkspace,
      },
      {
        id: 'workspace.toggle-sidebar',
        label: 'Toggle Sidebar Rail',
        description: 'Collapse or expand the desktop navigation sidebar',
        category: 'workspace',
        keys: ['['],
        alternateHint: 'or Ctrl/⌘ + B',
        combo: { key: '[' },
        altCombo: { key: 'b', mod: true },
        announcement: 'Toggled sidebar layout',
        handler: toggleSidebar,
      },
      {
        id: 'reference.help',
        label: 'Keyboard Shortcuts Reference',
        description: 'Open or close this keyboard command reference overlay',
        category: 'reference',
        keys: ['?'],
        combo: { key: '?' },
        allowWhenDisabled: true,
        handler: toggleHelp,
      },
    ];

    return [...routeShortcuts, ...workspaceControls];
  }, [focusMainWorkspace, focusSidebar, navigate, toggleHelp, toggleSidebar]);

  useRegisterShortcuts(workstationShortcuts);

  const shellContext: AppShellContext = {
    sidebarCollapsed,
    toggleSidebar,
    replayBootSequence: onReplayBoot,
    skipBootOnStartup,
    setSkipBootOnStartup: onSetSkipBootOnStartup,
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--dd-bg-canvas)] text-[var(--dd-text-primary)]">
      {/* Desktop collapsible sidebar */}
      <Sidebar
        sidebarRef={sidebarRef}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        onOpenShortcuts={openHelp}
      />

      {/* Mobile & tablet navigation drawer */}
      <MobileDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        onOpenShortcuts={openHelp}
      />

      {/* Main workspace column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          currentRoute={currentRoute}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onReplayBoot={onReplayBoot}
        />

        <main
          ref={mainRef}
          id="workspace-main"
          tabIndex={-1}
          aria-label="Workspace content"
          className="dd-grid-backdrop relative flex-1 overflow-y-auto focus:outline-none"
        >
          <Outlet context={shellContext} />
        </main>
      </div>

      {/* Global shortcut reference overlay & live chord HUD */}
      <KeyboardShortcutsModal />
      <ShortcutHud />
    </div>
  );
}

/**
 * Primary application shell composing KeyboardShortcutsProvider, Sidebar,
 * MobileDrawer, Topbar, and the flexible scrollable main content region.
 */
export function AppShell(props: AppShellProps) {
  return (
    <KeyboardShortcutsProvider>
      <AppShellInner {...props} />
    </KeyboardShortcutsProvider>
  );
}
