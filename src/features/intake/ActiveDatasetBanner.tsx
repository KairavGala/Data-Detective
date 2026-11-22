import { useState } from 'react';
import { FileSpreadsheet, Info, Trash2, Upload } from 'lucide-react';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import type { ImportedDataset } from '@/types';
import { formatBytes, formatCount, formatTimestamp } from '@/utils';

interface ActiveDatasetBannerProps {
  readonly dataset: ImportedDataset;
  readonly onClearDataset: () => void;
  readonly onRequestReplace: () => void;
}

/**
 * Displays the currently registered in-memory dataset with factual metadata,
 * explicit refresh-clears-memory disclosure, and clear/replace controls.
 */
export function ActiveDatasetBanner({
  dataset,
  onClearDataset,
  onRequestReplace,
}: ActiveDatasetBannerProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);

  return (
    <section
      aria-label="Active imported dataset"
      className="dd-surface-elevated space-y-5 p-6"
    >
      <div className="flex flex-col gap-4 border-b border-[var(--dd-border-subtle)] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <DossierLabel code="ACTIVE EVIDENCE" label={dataset.fileType} />
            <StatusIndicator tone="verified" label="Dataset Loaded" />
          </div>

          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-accent-teal)]"
              aria-hidden="true"
            >
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-[1.125rem] font-semibold text-[var(--dd-text-primary)]">
                {dataset.fileName}
              </h3>
              <p className="font-mono text-[0.72rem] text-[var(--dd-text-muted)]">
                ID: {dataset.id}
                {dataset.sheetName ? ` · Sheet: ${dataset.sheetName}` : ''} ·
                Imported {formatTimestamp(dataset.importedAt)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onRequestReplace}
            className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)] whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Load Another File</span>
          </button>

          {!confirmingClear ? (
            <button
              type="button"
              onClick={() => setConfirmingClear(true)}
              className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-anomaly-border)] bg-[var(--dd-status-anomaly-dim)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-status-anomaly)]/25 whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5 text-[var(--dd-status-anomaly)]" aria-hidden="true" />
              <span>Clear Dataset</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmingClear(false);
                  onClearDataset();
                }}
                className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-anomaly-border)] bg-[var(--dd-status-anomaly)] px-3 py-2 text-[0.75rem] font-medium text-[var(--dd-text-primary)] whitespace-nowrap"
              >
                Confirm Clear
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClear(false)}
                className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3 py-2 text-[0.75rem] text-[var(--dd-text-secondary)] whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Factual dataset dimensions strip (unboxed typographic grid) */}
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="space-y-1">
          <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
            Records
          </dt>
          <dd className="font-mono text-[1.125rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
            {formatCount(dataset.rowCount)}
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
            Columns
          </dt>
          <dd className="font-mono text-[1.125rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
            {formatCount(dataset.columnCount)}
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
            File Size
          </dt>
          <dd className="font-mono text-[1.125rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
            {formatBytes(dataset.fileSizeBytes)}
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
            Intake Notices
          </dt>
          <dd className="font-mono text-[1.125rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
            {dataset.warnings.length === 0
              ? 'None'
              : `${dataset.warnings.length} warning${dataset.warnings.length === 1 ? '' : 's'}`}
          </dd>
        </div>
      </dl>

      {/* Explicit session-memory notice */}
      <div className="flex items-start gap-2.5 border-t border-[var(--dd-border-subtle)] pt-4 font-mono text-[0.72rem] text-[var(--dd-text-muted)]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dd-accent-teal)]" aria-hidden="true" />
        <span>
          Processed locally in browser memory. Original files are never uploaded
          to a server; refreshing or closing this tab clears the active dataset.
        </span>
      </div>
    </section>
  );
}
