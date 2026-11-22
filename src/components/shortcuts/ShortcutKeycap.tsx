import { Fragment } from 'react';
import { cn } from '@/utils';

interface ShortcutKeycapProps {
  readonly keys: readonly string[];
  readonly joiner?: 'then' | '+';
  readonly size?: 'sm' | 'md';
  readonly className?: string;
}

/**
 * Crisp forensic-terminal keycap display for keyboard chords and modifier combos.
 */
export function ShortcutKeycap({
  keys,
  joiner = 'then',
  size = 'sm',
  className,
}: ShortcutKeycapProps) {
  return (
    <span className={cn('inline-flex items-center gap-1 shrink-0', className)}>
      {keys.map((keyLabel, index) => (
        <Fragment key={`${keyLabel}-${index}`}>
          {index > 0 && (
            <span
              className="font-mono text-[0.65rem] text-[var(--dd-text-muted)] select-none"
              aria-hidden="true"
            >
              {joiner === 'then' ? '›' : '+'}
            </span>
          )}
          <kbd
            className={cn(
              'inline-flex items-center justify-center rounded-[var(--dd-radius-xs)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] font-mono font-medium text-[var(--dd-text-primary)] dd-tabular shadow-[inset_0_-1px_0_rgba(0,0,0,0.45)] whitespace-nowrap',
              size === 'sm'
                ? 'min-w-[20px] px-1.5 py-0.5 text-[0.6875rem] leading-none'
                : 'min-w-[24px] px-2 py-1 text-[0.75rem] leading-none',
            )}
          >
            {keyLabel}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}
