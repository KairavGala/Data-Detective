import { useState } from 'react';
import {
  Activity,
  BarChart3,
  Crosshair,
  FileSpreadsheet,
  Info,
  Table2,
  Trash2,
  Upload,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import type { ImportedDataset } from '@/types';
import { cn, formatBytes, formatCount, formatTimestamp } from '@/utils';

interface ActiveDatasetBannerProps {
  readonly dataset: ImportedDataset;
  readonly onClearDataset: () => void;
  readonly onRequestReplace: () => void;
  readonly isReplaceOpen?: boolean;
}

const QUICK_LAUNCH_ACTIONS = [
  {
    id: 'explorer',
    label: 'Explore',
    to: '/explorer',
    icon: Table2,
  },
  {
    id: 'analysis',
    label: 'Statistics',
    to: '/analysis',
    icon: Activity,
  },
  {
    id: 'visualizations',
    label: 'Visualize',
    to: '/visualizations',
    icon: BarChart3,
  },
  {
    id: 'investigation',
    label: 'Investigate',
    to: '/investigation',
    icon: Crosshair,
  },
] as const;

/**
 * Displays the currently registered in-memory dataset with factual metadata,
 * direct quick-launch links into analytical modules, explicit session-memory
 * disclosure, and clear/replace controls.
 */
export function ActiveDatasetBanner({
  dataset,
  onClearDataset,
  onRequestReplace,
  isReplaceOpen = false,
}: ActiveDatasetBannerProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);

  const fileTypeLabel = dataset.fileType.toUpperCase();

  return (
    <section
      aria-label="Active imported dataset"
      className="dd-surface-elevated space-y-5 p-6"
    >
      {/* Header: Identity, active indicator, and dataset lifecycle controls */}
      <div className="flex flex-col gap-4 border-b border-[var(--dd-border-subtle)] pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <DossierLabel code="ACTIVE EVIDENCE" label={fileTypeLabel} />
            <StatusIndicator tone="verified" label="Active Dataset" />
          </div>

          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-accent-teal)]"
              aria-hidden="true"
            >
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <h2
                title={dataset.fileName}
                className="truncate text-[1.25rem] font-semibold tracking-[-0.02em] text-[var(--dd-text-primary)]"
              >
                {dataset.fileName}
              </h2>
              <p className="font-mono text-[0.72rem] text-[var(--dd-text-muted)] dd-tabular">
                {dataset.sheetName ? `Sheet: ${dataset.sheetName} · ` : ''}
                Imported {formatTimestamp(dataset.importedAt)} · ID:{' '}
                {dataset.id}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onRequestReplace}
            aria-expanded={isReplaceOpen}
            className={cn(
              'inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border px-3.5 py-2 text-[0.8125rem] font-medium transition-colors whitespace-nowrap shrink-0',
              isReplaceOpen
                ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-accent-teal)]'
                : 'border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] text-[var(--dd-text-secondary)] hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)]',
            )}
          >
            <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Load Another File</span>
          </button>

          {!confirmingClear ? (
            <button
              type="button"
              onClick={() => setConfirmingClear(true)}
              className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-anomaly-border)] bg-[var(--dd-status-anomaly-dim)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-status-anomaly)]/25 whitespace-nowrap shrink-0"
            >
              <Trash2
                className="h-3.5 w-3.5 shrink-0 text-[var(--dd-status-anomaly)]"
                aria-hidden="true"
              />
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
                className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-anomaly-border)] bg-[var(--dd-status-anomaly)] px-3 py-2 text-[0.75rem] font-medium text-[var(--dd-text-primary)] whitespace-nowrap shrink-0"
              >
                Confirm Clear
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClear(false)}
                className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3 py-2 text-[0.75rem] text-[var(--dd-text-secondary)] whitespace-nowrap shrink-0"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Factual dataset metadata strip (unboxed typographic grid) */}
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="space-y-1">
          <dt className="font-mono text-[0.68rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
            Rows
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
            File Type &amp; Size
          </dt>
          <dd className="font-mono text-[1.125rem] font-semibold text-[var(--dd-text-primary)] dd-tabular">
            {fileTypeLabel}{' '}
            <span className="text-[0.8125rem] font-normal text-[var(--dd-text-secondary)]">
              · {formatBytes(dataset.fileSizeBytes)}
            </span>
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

      {/* Direct quick-launch workspace actions */}
      <div
        aria-label="Quick workspace actions"
        data-testid="active-dataset-quick-actions"
        className="flex flex-wrap items-center gap-2 border-t border-[var(--dd-border-subtle)] pt-4"
      >
        <span className="mr-1 font-mono text-[0.68rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase whitespace-nowrap">
          Open in
        </span>
        {QUICK_LAUNCH_ACTIONS.map((action, index) => {
          const Icon = action.icon;
          const isPrimary = index === 0;
          return (
            <Link
              key={action.id}
              to={action.to}
              className={cn(
                'inline-flex items-center gap-2 rounded-[var(--dd-radius-sm)] border px-3.5 py-2 text-[0.8125rem] font-medium transition-colors whitespace-nowrap shrink-0',
                isPrimary
                  ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-accent-teal)] hover:bg-[var(--dd-accent-teal)] hover:text-[var(--dd-text-inverse)]'
                  : 'border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] text-[var(--dd-text-primary)] hover:border-[var(--dd-accent-teal-border)] hover:bg-[var(--dd-surface-hover)]',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{action.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Explicit session-memory notice */}
      <div className="flex items-start gap-2.5 border-t border-[var(--dd-border-subtle)] pt-3.5 font-mono text-[0.72rem] text-[var(--dd-text-muted)]">
        <Info
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dd-accent-teal)]"
          aria-hidden="true"
        />
        <span>
          Processed locally in browser memory. Original files are never uploaded
          to a server; refreshing or closing this tab clears the active dataset.
        </span>
      </div>
    </section>
  );
}
