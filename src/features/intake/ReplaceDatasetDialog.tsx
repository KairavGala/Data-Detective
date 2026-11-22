import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatCount } from '@/utils';

interface ReplaceDatasetDialogProps {
  readonly open: boolean;
  readonly currentFileName: string;
  readonly currentRowCount: number;
  readonly incomingFileName: string;
  readonly incomingRowCount: number;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/**
 * Accessible confirmation modal before replacing an already-registered dataset.
 */
export function ReplaceDatasetDialog({
  open,
  currentFileName,
  currentRowCount,
  incomingFileName,
  incomingRowCount,
  onCancel,
  onConfirm,
}: ReplaceDatasetDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--dd-z-modal)] flex items-center justify-center bg-[var(--dd-surface-overlay)] p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="replace-dataset-title"
        onClick={(event) => event.stopPropagation()}
        className="dd-surface-elevated w-full max-w-md space-y-5 p-6"
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-warning-border)] bg-[var(--dd-status-warning-dim)] text-[var(--dd-status-warning)]"
            aria-hidden="true"
          >
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <h3
              id="replace-dataset-title"
              className="text-[1rem] font-semibold text-[var(--dd-text-primary)]"
            >
              Replace active dataset?
            </h3>
            <p className="text-[0.8125rem] leading-relaxed text-[var(--dd-text-secondary)]">
              Importing this file will unload the currently active dataset from
              browser memory.
            </p>
          </div>
        </div>

        <div className="dd-surface-recessed space-y-2.5 p-4 font-mono text-[0.75rem]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--dd-text-muted)]">Current:</span>
            <span className="truncate text-[var(--dd-text-secondary)]">
              {currentFileName} ({formatCount(currentRowCount)} rows)
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--dd-border-subtle)] pt-2.5">
            <span className="text-[var(--dd-accent-teal)]">Incoming:</span>
            <span className="truncate text-[var(--dd-text-primary)]">
              {incomingFileName} ({formatCount(incomingRowCount)} rows)
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-inverse)] transition-colors hover:bg-[var(--dd-accent-teal-hover)]"
          >
            Replace Dataset
          </button>
        </div>
      </div>
    </div>
  );
}
