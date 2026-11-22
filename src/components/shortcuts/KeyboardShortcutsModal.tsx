import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Search, X } from 'lucide-react';
import { DossierLabel } from '@/components/ui/DossierLabel';
import {
  type ShortcutCategory,
  type ShortcutDefinition,
  useKeyboardShortcuts,
} from '@/context/KeyboardShortcutsContext';
import { ShortcutKeycap } from './ShortcutKeycap';

const CATEGORY_ORDER: readonly {
  readonly id: ShortcutCategory;
  readonly title: string;
  readonly subtitle: string;
}[] = [
  {
    id: 'navigation',
    title: 'Section Navigation',
    subtitle: 'Press G then a destination key (or section digit 0–7)',
  },
  {
    id: 'workspace',
    title: 'Workspace Focus & Layout',
    subtitle: 'Direct focus handoff and desktop sidebar rail controls',
  },
  {
    id: 'reference',
    title: 'Reference & Dismissal',
    subtitle: 'Keyboard overlay and chord cancellation controls',
  },
];

/**
 * Interactive Keyboard Shortcuts reference dialog.
 * Allows investigators to inspect, filter, toggle, and click-to-run
 * any registered global workstation shortcut.
 */
export function KeyboardShortcutsModal() {
  const {
    shortcuts,
    enabled,
    setEnabled,
    helpOpen,
    closeHelp,
    executeShortcut,
  } = useKeyboardShortcuts();

  const [query, setQuery] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (helpOpen) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setQuery('');
      const frame = window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (previousFocusRef.current?.isConnected) {
      previousFocusRef.current.focus();
    }
    previousFocusRef.current = null;
    return undefined;
  }, [helpOpen]);

  const filteredShortcuts = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return shortcuts;
    return shortcuts.filter((item) => {
      const haystack = [
        item.label,
        item.description,
        item.keys.join(' '),
        item.alternateHint ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [query, shortcuts]);

  const grouped = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      ...category,
      items: filteredShortcuts.filter((item) => item.category === category.id),
    })).filter((group) => group.items.length > 0);
  }, [filteredShortcuts]);

  if (!helpOpen) return null;

  const handleRowAction = (item: ShortcutDefinition) => {
    // Do not restore previous focus back to the trigger element when a shortcut
    // is explicitly executed (e.g. Focus Sidebar or Focus Main Workspace).
    if (item.id !== 'reference.help') {
      previousFocusRef.current = null;
    }
    executeShortcut(item.id);
  };

  return (
    <div
      className="fixed inset-0 z-[var(--dd-z-modal)] flex items-center justify-center p-4 sm:p-6"
      role="presentation"
    >
      {/* Backdrop scrim */}
      <div
        onClick={closeHelp}
        className="fixed inset-0 bg-[var(--dd-surface-overlay)] backdrop-blur-[2px]"
        aria-hidden="true"
      />

      {/* Dialog surface */}
      <div
        role="dialog"
        aria-modal="true"
        data-dd-shortcuts-modal="true"
        aria-labelledby="dd-shortcuts-title"
        className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--dd-radius-md)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] shadow-[var(--dd-shadow-elevated)] dd-anim-file-enter"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--dd-border-subtle)] px-6 py-5">
          <div className="space-y-1.5">
            <DossierLabel code="KEY-MAP" label="Workstation Shortcuts" />
            <h2
              id="dd-shortcuts-title"
              className="text-[1.125rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]"
            >
              Keyboard Command Reference
            </h2>
            <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
              Navigate sections, focus the sidebar, or adjust workspace layout
              without leaving the keyboard. Click any row to run it directly.
            </p>
          </div>

          <button
            type="button"
            onClick={closeHelp}
            aria-label="Close keyboard shortcuts"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Filter bar & status toggle */}
        <div className="flex flex-col gap-3 border-b border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--dd-text-muted)]"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter shortcuts by section, action, or key..."
              aria-label="Filter keyboard shortcuts"
              className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] py-1.5 pl-8 pr-3 text-[0.8125rem] text-[var(--dd-text-primary)] placeholder:text-[var(--dd-text-muted)] focus:border-[var(--dd-accent-teal-border)] focus:outline-none"
            />
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-primary)] transition-colors hover:border-[var(--dd-border-strong)] whitespace-nowrap shrink-0"
          >
            <Keyboard
              className="h-3.5 w-3.5 text-[var(--dd-accent-teal)]"
              aria-hidden="true"
            />
            <span>{enabled ? 'Shortcuts Active' : 'Shortcuts Paused'}</span>
          </button>
        </div>

        {/* Shortcut groups */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {!enabled && (
            <div className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-warning-border)] bg-[var(--dd-status-warning-dim)] px-4 py-2.5 text-[0.8125rem] text-[var(--dd-text-primary)]">
              Global keyboard shortcuts are currently paused. Press{' '}
              <span className="font-mono font-medium">Shortcuts Paused</span>{' '}
              above to re-enable them.
            </div>
          )}

          {grouped.length === 0 ? (
            <div className="py-10 text-center text-[0.875rem] text-[var(--dd-text-secondary)]">
              No shortcuts match &ldquo;{query.trim()}&rdquo;.
            </div>
          ) : (
            grouped.map((group) => (
              <section key={group.id} className="space-y-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--dd-border-subtle)] pb-2">
                  <h3 className="font-mono text-[0.72rem] font-medium tracking-[0.06em] text-[var(--dd-text-primary)] uppercase">
                    {group.title}
                  </h3>
                  <span className="text-[0.75rem] text-[var(--dd-text-muted)]">
                    {group.subtitle}
                  </span>
                </div>

                <ul className="divide-y divide-[var(--dd-border-subtle)]">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleRowAction(item)}
                        className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-[var(--dd-radius-sm)] px-2 py-2.5 text-left transition-colors hover:bg-[var(--dd-surface-hover)]"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="text-[0.8125rem] font-medium text-[var(--dd-text-primary)]">
                            {item.label}
                          </div>
                          <div className="text-[0.75rem] text-[var(--dd-text-secondary)]">
                            {item.description}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <ShortcutKeycap
                            keys={item.keys}
                            joiner={
                              item.keyJoiner ?? (item.sequence ? 'then' : '+')
                            }
                            size="sm"
                          />
                          {item.alternateHint && (
                            <span className="font-mono text-[0.65rem] text-[var(--dd-text-muted)]">
                              {item.alternateHint}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        {/* Footer tip */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-6 py-3 text-[0.75rem] text-[var(--dd-text-muted)]">
          <span>
            Inside focused Sidebar: use{' '}
            <span className="font-mono text-[var(--dd-text-secondary)]">
              ↑ / ↓
            </span>{' '}
            to move between sections and{' '}
            <span className="font-mono text-[var(--dd-text-secondary)]">
              Enter
            </span>{' '}
            to open.
          </span>
          <span className="font-mono text-[0.7rem]">
            Shortcuts pause while typing in inputs
          </span>
        </div>
      </div>
    </div>
  );
}
