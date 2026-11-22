import { cn } from '@/utils';

interface BrandMarkProps {
  compact?: boolean;
  className?: string;
}

/**
 * Data Detective geometric forensic emblem and wordmark.
 */
export function BrandMark({ compact = false, className }: BrandMarkProps) {
  return (
    <div className={cn('flex items-center gap-3 min-w-0', className)}>
      <div
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-surface-recessed)]"
        aria-hidden="true"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-[var(--dd-accent-teal)]"
        >
          {/* Outer calibrated reticle corners */}
          <path
            d="M4 9V5.5C4 4.67 4.67 4 5.5 4H9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="square"
          />
          <path
            d="M15 4H18.5C19.33 4 20 4.67 20 5.5V9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="square"
          />
          <path
            d="M20 15V18.5C20 19.33 19.33 20 18.5 20H15"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="square"
          />
          <path
            d="M9 20H5.5C4.67 20 4 19.33 4 18.5V15"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="square"
          />
          {/* Inner analytical lens & focal vector */}
          <circle
            cx="11.5"
            cy="11.5"
            r="3.75"
            stroke="#e5e9ee"
            strokeWidth="1.5"
          />
          <path
            d="M14.3 14.3L17.2 17.2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="square"
          />
          <circle cx="11.5" cy="11.5" r="1" fill="currentColor" />
        </svg>
      </div>

      {!compact && (
        <div className="min-w-0 leading-none">
          <span className="block truncate text-[0.9375rem] font-semibold tracking-[-0.02em] text-[var(--dd-text-primary)] whitespace-nowrap">
            Data Detective
          </span>
          <span className="mt-1 block truncate font-mono text-[0.65rem] tracking-[0.09em] text-[var(--dd-text-muted)] uppercase whitespace-nowrap">
            Forensic Analytics
          </span>
        </div>
      )}
    </div>
  );
}
