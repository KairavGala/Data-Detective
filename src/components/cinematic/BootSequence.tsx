import { useCallback, useEffect, useState } from 'react';
import { BrandMark } from '@/components/ui/BrandMark';
import { useReducedMotion } from '@/hooks';
import { cn } from '@/utils';

interface BootSequenceProps {
  onComplete: () => void;
}

const TERMINAL_STEPS = [
  'INITIALIZING INVESTIGATION SYSTEM...',
  'PREPARING ANALYTICAL WORKSPACE...',
  'LOADING MODULE ARCHITECTURE...',
  'CALIBRATING DETECTION INTERFACE...',
  'SYSTEM READY.',
  'WELCOME, INVESTIGATOR.',
] as const;

const STEP_INTERVAL_MS = 320;
const REVEAL_HOLD_MS = 900;
const EXIT_DURATION_MS = 380;

/**
 * Cinematic forensic initialization overlay.
 * - Concise runtime (~2.9s total) with immediate Skip control & Escape support.
 * - Respects prefers-reduced-motion cleanly (no scanning sweep or rapid flashing).
 * - Honest workspace initialization copy (no fabricated encryption/security claims).
 */
export function BootSequence({ onComplete }: BootSequenceProps) {
  const prefersReducedMotion = useReducedMotion();
  const [visibleLines, setVisibleLines] = useState<number>(() =>
    prefersReducedMotion ? TERMINAL_STEPS.length : 1,
  );
  const [showIdentity, setShowIdentity] = useState<boolean>(
    () => prefersReducedMotion,
  );
  const [isExiting, setIsExiting] = useState<boolean>(false);

  const completeOnce = useCallback(() => {
    onComplete();
  }, [onComplete]);

  const finishSequence = useCallback(() => {
    if (isExiting) return;
    if (prefersReducedMotion) {
      completeOnce();
      return;
    }
    setIsExiting(true);
  }, [completeOnce, isExiting, prefersReducedMotion]);

  // Complete cleanly after fade-out transition when exiting
  useEffect(() => {
    if (!isExiting) return;
    const exitTimer = window.setTimeout(() => {
      completeOnce();
    }, EXIT_DURATION_MS);
    return () => window.clearTimeout(exitTimer);
  }, [completeOnce, isExiting]);

  // Keyboard shortcut: Escape skips immediately
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        finishSequence();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finishSequence]);

  // Progressive terminal reveal and identity handoff
  useEffect(() => {
    if (prefersReducedMotion) {
      const reducedTimer = window.setTimeout(() => {
        completeOnce();
      }, 950);
      return () => window.clearTimeout(reducedTimer);
    }

    const timers: number[] = [];

    for (let i = 2; i <= TERMINAL_STEPS.length; i += 1) {
      timers.push(
        window.setTimeout(() => {
          setVisibleLines(i);
        }, (i - 1) * STEP_INTERVAL_MS),
      );
    }

    const identityStart = TERMINAL_STEPS.length * STEP_INTERVAL_MS + 120;
    timers.push(
      window.setTimeout(() => {
        setShowIdentity(true);
      }, identityStart),
    );

    timers.push(
      window.setTimeout(() => {
        setIsExiting(true);
      }, identityStart + REVEAL_HOLD_MS),
    );

    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [completeOnce, prefersReducedMotion]);

  const progressRatio = Math.min(visibleLines / TERMINAL_STEPS.length, 1);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Data Detective system initialization"
      className={cn(
        'fixed inset-0 z-[var(--dd-z-modal)] flex flex-col justify-between bg-[var(--dd-bg-canvas)] dd-grid-backdrop px-6 py-8 transition-opacity duration-300',
        isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100',
      )}
    >
      {/* Subtle atmospheric scanning sweep */}
      {!prefersReducedMotion && (
        <div
          className="pointer-events-none fixed inset-0 overflow-hidden"
          aria-hidden="true"
        >
          <div className="dd-anim-scan-y absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,transparent_0%,rgba(68,148,144,0.07)_50%,transparent_100%)]" />
        </div>
      )}

      {/* Top dossier header row */}
      <div className="relative mx-auto flex w-full max-w-3xl items-center justify-between border-b border-[var(--dd-border-subtle)] pb-4">
        <div className="font-mono text-[0.75rem] tracking-[0.08em] text-[var(--dd-text-muted)] uppercase">
          Data Detective · Workstation Boot
        </div>
        <button
          type="button"
          onClick={finishSequence}
          className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3.5 py-1.5 font-mono text-[0.75rem] tracking-[0.04em] text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)] whitespace-nowrap shrink-0"
        >
          Skip Intro
        </button>
      </div>

      {/* Center stage: Terminal log & Identity reveal */}
      <div className="relative mx-auto my-auto flex w-full max-w-2xl flex-col items-stretch py-10">
        {/* Calibrated radar ring & emblem */}
        <div className="mb-8 flex items-center gap-5">
          <div
            className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)]"
            aria-hidden="true"
          >
            {!prefersReducedMotion && (
              <div className="dd-anim-radar absolute inset-1 rounded-full bg-[conic-gradient(from_0deg,rgba(68,148,144,0.35)_0deg,transparent_70deg,transparent_360deg)]" />
            )}
            <div className="relative h-2.5 w-2.5 rounded-full border border-[var(--dd-accent-teal)] bg-[var(--dd-bg-canvas)]" />
          </div>

          <div
            className={cn(
              'transition-all duration-300',
              showIdentity
                ? 'opacity-100 translate-y-0'
                : 'opacity-45 translate-y-0.5',
            )}
          >
            <BrandMark />
          </div>
        </div>

        {/* Terminal readout well */}
        <div className="dd-surface-recessed relative overflow-hidden p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between border-b border-[var(--dd-border-subtle)] pb-3 font-mono text-[0.7rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
            <span>System Console</span>
            <span className="dd-tabular text-[var(--dd-accent-teal)]">
              {Math.round(progressRatio * 100)}%
            </span>
          </div>

          <ul className="space-y-2.5 font-mono text-[0.8125rem] leading-relaxed">
            {TERMINAL_STEPS.slice(0, visibleLines).map((line, index) => {
              const isFinal = index >= TERMINAL_STEPS.length - 2;
              const isLatest = index === visibleLines - 1;
              return (
                <li
                  key={line}
                  className={cn(
                    'flex items-center gap-3',
                    !prefersReducedMotion && 'dd-anim-terminal-reveal',
                    isFinal
                      ? 'text-[var(--dd-text-primary)] font-medium'
                      : 'text-[var(--dd-text-secondary)]',
                  )}
                >
                  <span
                    className={cn(
                      'select-none text-[0.75rem]',
                      isFinal
                        ? 'text-[var(--dd-status-verified)]'
                        : 'text-[var(--dd-accent-teal)]',
                    )}
                    aria-hidden="true"
                  >
                    {isFinal ? '◆' : '›'}
                  </span>
                  <span>{line}</span>
                  {isLatest && !showIdentity && !prefersReducedMotion && (
                    <span
                      className="dd-anim-cursor inline-block h-3.5 w-1.5 bg-[var(--dd-accent-teal)]"
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ul>

          {/* Progress hairline bar */}
          <div
            className="mt-6 h-[2px] w-full overflow-hidden bg-[var(--dd-border-subtle)]"
            aria-hidden="true"
          >
            <div
              className="h-full bg-[var(--dd-accent-teal)] transition-transform duration-300 ease-out origin-left"
              style={{ transform: `scaleX(${progressRatio})` }}
            />
          </div>
        </div>
      </div>

      {/* Bottom hint */}
      <div className="relative mx-auto flex w-full max-w-3xl items-center justify-between border-t border-[var(--dd-border-subtle)] pt-4 font-mono text-[0.7rem] text-[var(--dd-text-muted)]">
        <span>Press Esc to skip initialization</span>
        <span className="dd-tabular">Forensic Analytical Workstation</span>
      </div>
    </div>
  );
}
