import type { SemanticTone } from '@/types';
import { cn } from '@/utils';

interface StatusIndicatorProps {
  tone?: SemanticTone;
  label: string;
  className?: string;
}

const TONE_STYLES: Record<
  SemanticTone,
  {
    text: string;
    glyph: string;
    glyphColor: string;
  }
> = {
  analytical: {
    text: 'text-[var(--dd-text-secondary)]',
    glyph: '◆',
    glyphColor: 'text-[var(--dd-accent-teal)]',
  },
  verified: {
    text: 'text-[var(--dd-text-secondary)]',
    glyph: '●',
    glyphColor: 'text-[var(--dd-status-verified)]',
  },
  warning: {
    text: 'text-[var(--dd-status-warning)]',
    glyph: '▲',
    glyphColor: 'text-[var(--dd-status-warning)]',
  },
  anomaly: {
    text: 'text-[var(--dd-status-anomaly)]',
    glyph: '■',
    glyphColor: 'text-[var(--dd-status-anomaly)]',
  },
  neutral: {
    text: 'text-[var(--dd-text-muted)]',
    glyph: '○',
    glyphColor: 'text-[var(--dd-status-neutral)]',
  },
};

/**
 * Text-first, non-hue-only investigative status indicator.
 * Pairs distinct geometric symbols with semantic colors and explicit text labels.
 */
export function StatusIndicator({
  tone = 'neutral',
  label,
  className,
}: StatusIndicatorProps) {
  const style = TONE_STYLES[tone];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-mono text-[0.75rem] tracking-[0.04em] whitespace-nowrap shrink-0',
        style.text,
        className,
      )}
    >
      <span
        className={cn('text-[0.625rem] leading-none', style.glyphColor)}
        aria-hidden="true"
      >
        {style.glyph}
      </span>
      <span>{label}</span>
    </span>
  );
}
