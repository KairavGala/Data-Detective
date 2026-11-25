import { FileSpreadsheet, Menu, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { WorkspaceRouteConfig } from '@/config/navigation';
import { useDataset } from '@/context/DatasetContext';
import { cn, formatCount } from '@/utils';

interface TopbarProps {
  readonly currentRoute: WorkspaceRouteConfig;
  readonly onOpenMobileMenu: () => void;
}

/**
 * Forensic workstation Topbar.
 * Displays active section identity (sole H1) and a compact, responsive,
 * interactive dataset indicator linking directly to Overview dataset management
 * on both desktop and mobile viewports.
 */
export function Topbar({ currentRoute, onOpenMobileMenu }: TopbarProps) {
  const { activeDataset } = useDataset();

  return (
    <header className="sticky top-0 z-[var(--dd-z-sticky)] flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--dd-border-subtle)] bg-[var(--dd-bg-backdrop)]/95 px-4 backdrop-blur-sm sm:gap-4 sm:px-6">
      {/* Left zone: Mobile drawer toggle + Active section title */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-default)] hover:text-[var(--dd-text-primary)] lg:hidden"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="flex min-w-0 items-center gap-2.5">
          <span className="hidden font-mono text-[0.72rem] tracking-[0.06em] text-[var(--dd-accent-teal)] dd-tabular sm:inline whitespace-nowrap shrink-0">
            {currentRoute.sectionCode}
          </span>
          <span
            className="hidden text-[var(--dd-border-strong)] sm:inline"
            aria-hidden="true"
          >
            /
          </span>
          <h1 className="truncate text-[0.9375rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)] whitespace-nowrap">
            {currentRoute.label}
          </h1>
        </div>
      </div>

      {/* Right zone: Interactive responsive dataset context indicator (desktop & mobile) */}
      <div className="flex min-w-0 items-center shrink-0">
        <Link
          to="/"
          data-testid="topbar-dataset-context"
          title={
            activeDataset
              ? `Manage active dataset: ${activeDataset.fileName}${activeDataset.sheetName ? ` (${activeDataset.sheetName})` : ''}`
              : 'Import a dataset on Overview'
          }
          aria-label={
            activeDataset
              ? `Active dataset ${activeDataset.fileName} (${formatCount(activeDataset.rowCount)} rows by ${formatCount(activeDataset.columnCount)} columns). Open dataset overview.`
              : 'No file loaded. Open Overview to import a dataset.'
          }
          className={cn(
            'inline-flex min-w-0 items-center gap-2 rounded-[var(--dd-radius-sm)] border px-2.5 py-1.5 text-[0.8125rem] transition-colors whitespace-nowrap',
            activeDataset
              ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-surface-primary)] text-[var(--dd-text-primary)] hover:border-[var(--dd-accent-teal)] hover:bg-[var(--dd-surface-elevated)]'
              : 'border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] text-[var(--dd-text-secondary)] hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)]',
          )}
        >
          {activeDataset ? (
            <>
              <FileSpreadsheet
                className="h-3.5 w-3.5 shrink-0 text-[var(--dd-accent-teal)]"
                aria-hidden="true"
              />
              <span className="max-w-[115px] truncate font-medium sm:max-w-[200px] md:max-w-[260px]">
                {activeDataset.fileName}
              </span>
              <span className="font-mono text-[0.7rem] text-[var(--dd-text-muted)] dd-tabular shrink-0">
                {formatCount(activeDataset.rowCount)}×
                {formatCount(activeDataset.columnCount)}
              </span>
              <span className="hidden font-mono text-[0.68rem] uppercase text-[var(--dd-accent-teal)] md:inline shrink-0">
                {activeDataset.fileType}
              </span>
            </>
          ) : (
            <>
              <Upload
                className="h-3.5 w-3.5 shrink-0 text-[var(--dd-text-muted)]"
                aria-hidden="true"
              />
              <span className="text-[0.78rem] sm:text-[0.8125rem]">
                No file loaded
              </span>
            </>
          )}
        </Link>
      </div>
    </header>
  );
}
