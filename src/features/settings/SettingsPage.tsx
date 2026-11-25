import { Keyboard, PanelLeft, RotateCcw } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import type { AppShellContext } from '@/components/layout/AppShell';
import { PageContainer } from '@/components/layout/PageContainer';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { APP_CONFIG } from '@/config/app.config';
import { useKeyboardShortcuts } from '@/context/KeyboardShortcutsContext';
import { useReducedMotion } from '@/hooks';

/**
 * Workstation Settings page with genuine, live-wired controls for
 * sidebar layout, keyboard shortcuts, cinematic initialization replay/startup
 * behavior, reduced-motion inspection, and configuration metadata.
 */
export function SettingsPage() {
  const {
    sidebarCollapsed,
    toggleSidebar,
    replayBootSequence,
    skipBootOnStartup,
    setSkipBootOnStartup,
  } = useOutletContext<AppShellContext>();

  const {
    enabled: shortcutsEnabled,
    setEnabled: setShortcutsEnabled,
    openHelp: openShortcutsHelp,
  } = useKeyboardShortcuts();

  const prefersReducedMotion = useReducedMotion();
  const maxMb = Math.round(APP_CONFIG.intake.maxFileSizeBytes / (1024 * 1024));

  return (
    <PageContainer width="standard">
      <div className="dd-anim-file-enter space-y-8">
        {/* Header */}
        <WorkspaceHeader
          code="SEC-07"
          sectionLabel="Workstation Preferences"
          title="Settings"
          description="Manage application shell layout, keyboard command navigation, cinematic initialization behavior, and verify motion accessibility settings."
        />

        {/* Functional Workstation Controls */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="dd-surface-primary divide-y divide-[var(--dd-border-subtle)] lg:col-span-7">
            {/* Sidebar preference */}
            <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h3 className="text-[0.9375rem] font-medium text-[var(--dd-text-primary)]">
                  Desktop Sidebar Layout
                </h3>
                <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
                  Switch between the expanded dossier rail and compact icon
                  navigation on desktop screens.
                </p>
              </div>
              <button
                type="button"
                onClick={toggleSidebar}
                className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:border-[var(--dd-accent-teal-border)] whitespace-nowrap shrink-0"
              >
                <PanelLeft className="h-4 w-4 text-[var(--dd-accent-teal)]" aria-hidden="true" />
                <span>{sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}</span>
              </button>
            </div>

            {/* Global keyboard shortcuts */}
            <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h3 className="text-[0.9375rem] font-medium text-[var(--dd-text-primary)]">
                  Global Keyboard Shortcuts
                </h3>
                <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
                  Navigate sections with G chords (e.g. G then O for Overview),
                  focus the sidebar with S, or press ? for the full reference.
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={openShortcutsHelp}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:border-[var(--dd-accent-teal-border)] whitespace-nowrap"
                >
                  <Keyboard
                    className="h-4 w-4 text-[var(--dd-accent-teal)]"
                    aria-hidden="true"
                  />
                  <span>View Map</span>
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-label="Enable global keyboard shortcuts"
                  aria-checked={shortcutsEnabled}
                  onClick={() => setShortcutsEnabled(!shortcutsEnabled)}
                  className="inline-flex cursor-pointer items-center gap-2.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3.5 py-2 font-mono text-[0.75rem] text-[var(--dd-text-primary)] transition-colors hover:border-[var(--dd-border-strong)] whitespace-nowrap"
                >
                  <span
                    className={
                      shortcutsEnabled
                        ? 'text-[var(--dd-status-verified)]'
                        : 'text-[var(--dd-text-muted)]'
                    }
                    aria-hidden="true"
                  >
                    {shortcutsEnabled ? '●' : '○'}
                  </span>
                  <span>{shortcutsEnabled ? 'Enabled' : 'Disabled'}</span>
                </button>
              </div>
            </div>

            {/* Boot sequence replay */}
            <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h3 className="text-[0.9375rem] font-medium text-[var(--dd-text-primary)]">
                  Cinematic Initialization Sequence
                </h3>
                <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
                  Replay the terminal boot sequence on demand without clearing
                  your browser session.
                </p>
              </div>
              <button
                type="button"
                onClick={replayBootSequence}
                className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-4 w-4 text-[var(--dd-accent-teal)]" aria-hidden="true" />
                <span>Replay Initialization</span>
              </button>
            </div>

            {/* Startup boot preference */}
            <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h3 className="text-[0.9375rem] font-medium text-[var(--dd-text-primary)]">
                  Skip Initialization on Startup
                </h3>
                <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
                  Bypass the terminal loading sequence automatically when
                  starting a new browser session.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={skipBootOnStartup}
                onClick={() => setSkipBootOnStartup(!skipBootOnStartup)}
                className="inline-flex cursor-pointer items-center gap-2.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3.5 py-2 font-mono text-[0.75rem] text-[var(--dd-text-primary)] transition-colors hover:border-[var(--dd-border-strong)] whitespace-nowrap shrink-0"
              >
                <span
                  className={
                    skipBootOnStartup
                      ? 'text-[var(--dd-status-verified)]'
                      : 'text-[var(--dd-text-muted)]'
                  }
                  aria-hidden="true"
                >
                  {skipBootOnStartup ? '●' : '○'}
                </span>
                <span>{skipBootOnStartup ? 'Enabled' : 'Disabled'}</span>
              </button>
            </div>
          </section>

          {/* Read-only System & Accessibility Readout */}
          <aside className="dd-surface-recessed space-y-5 p-6 lg:col-span-5">
            <div className="border-b border-[var(--dd-border-subtle)] pb-3">
              <h3 className="font-mono text-[0.75rem] font-medium tracking-[0.06em] text-[var(--dd-text-secondary)] uppercase">
                Environment & Accessibility
              </h3>
            </div>

            <dl className="space-y-4 text-[0.8125rem]">
              <div className="flex items-center justify-between gap-4 border-b border-[var(--dd-border-subtle)] pb-3">
                <dt className="text-[var(--dd-text-muted)]">
                  OS Reduced Motion
                </dt>
                <dd className="font-mono text-[var(--dd-text-primary)]">
                  {prefersReducedMotion ? 'Reduced (Active)' : 'Standard'}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-[var(--dd-border-subtle)] pb-3">
                <dt className="text-[var(--dd-text-muted)]">
                  Configured Formats
                </dt>
                <dd className="font-mono text-[var(--dd-text-secondary)]">
                  {APP_CONFIG.intake.supportedExtensions.join(', ')}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-[var(--dd-border-subtle)] pb-3">
                <dt className="text-[var(--dd-text-muted)]">
                  Intake Limits
                </dt>
                <dd className="font-mono text-[var(--dd-text-secondary)] dd-tabular">
                  {maxMb} MB · {APP_CONFIG.intake.maxRows.toLocaleString('en-US')} rows · {APP_CONFIG.intake.maxColumns} cols
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4">
                <dt className="text-[var(--dd-text-muted)]">
                  AI Investigation Service
                </dt>
                <dd className="font-mono text-[var(--dd-text-secondary)]">
                  Server-side (aggregate summaries only)
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>
    </PageContainer>
  );
}
