import { useKeyboardShortcuts } from '@/context/KeyboardShortcutsContext';
import { useReducedMotion } from '@/hooks';
import { cn } from '@/utils';
import { ShortcutKeycap } from './ShortcutKeycap';

/**
 * Quiet bottom-right workstation HUD for in-progress keyboard chords (e.g. "G -> ...")
 * and brief accessible confirmation when a shortcut executes.
 */
export function ShortcutHud() {
  const { pendingPrefix, cancelPendingPrefix, shortcuts, lastAnnouncement } =
    useKeyboardShortcuts();
  const prefersReducedMotion = useReducedMotion();

  const prefixTargets = pendingPrefix
    ? shortcuts.filter(
        (item) => item.sequence && item.sequence[0] === pendingPrefix,
      )
    : [];

  return (
    <>
      {/* Screen-reader polite live region */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {pendingPrefix
          ? `Shortcut prefix ${pendingPrefix.toUpperCase()} active. Press a destination key or Escape to cancel.`
          : (lastAnnouncement?.message ?? '')}
      </div>

      {/* Active chord prompt */}
      {pendingPrefix && prefixTargets.length > 0 && (
        <div
          data-testid="shortcut-chord-hud"
          className={cn(
            'fixed bottom-5 right-5 z-[var(--dd-z-toast)] max-w-md rounded-[var(--dd-radius-md)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-surface-elevated)] px-4 py-3 shadow-[var(--dd-shadow-elevated)]',
            !prefersReducedMotion && 'dd-anim-file-enter',
          )}
        >
          <div className="mb-2 flex items-center justify-between gap-4 border-b border-[var(--dd-border-subtle)] pb-2">
            <div className="flex items-center gap-2">
              <ShortcutKeycap keys={[pendingPrefix.toUpperCase()]} size="sm" />
              <span className="font-mono text-[0.72rem] tracking-[0.04em] text-[var(--dd-text-primary)]">
                Go to section…
              </span>
            </div>
            <button
              type="button"
              onClick={cancelPendingPrefix}
              className="cursor-pointer font-mono text-[0.6875rem] text-[var(--dd-text-muted)] transition-colors hover:text-[var(--dd-text-primary)]"
            >
              Esc to cancel
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.75rem] text-[var(--dd-text-secondary)]">
            {prefixTargets.map((target) => (
              <span
                key={target.id}
                className="inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <kbd className="inline-flex min-w-[18px] items-center justify-center rounded-[var(--dd-radius-xs)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-1 py-0.5 font-mono text-[0.65rem] text-[var(--dd-accent-teal)]">
                  {target.sequence?.[1].toUpperCase()}
                </kbd>
                <span>{target.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Brief confirmation feedback when no chord is pending */}
      {!pendingPrefix && lastAnnouncement && (
        <div
          data-testid="shortcut-feedback-toast"
          className={cn(
            'pointer-events-none fixed bottom-5 right-5 z-[var(--dd-z-toast)] flex items-center gap-3 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-3.5 py-2 text-[0.75rem] text-[var(--dd-text-primary)] shadow-[var(--dd-shadow-panel)]',
            !prefersReducedMotion && 'dd-anim-file-enter',
          )}
        >
          <ShortcutKeycap
            keys={lastAnnouncement.keys}
            joiner={lastAnnouncement.keyJoiner}
            size="sm"
          />
          <span className="whitespace-nowrap">{lastAnnouncement.message}</span>
        </div>
      )}
    </>
  );
}
