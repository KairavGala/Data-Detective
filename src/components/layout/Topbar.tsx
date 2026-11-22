import { ArrowLeft, Menu, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import type { WorkspaceRouteConfig } from '@/config/navigation';
import { useDataset } from '@/context/DatasetContext';
import { formatCount } from '@/utils';

interface TopbarProps {
  currentRoute: WorkspaceRouteConfig;
  onOpenMobileMenu: () => void;
  onReplayBoot: () => void;
}

/**
 * Forensic workstation Topbar.
 * Displays active section identity, real in-memory dataset context,
 * application status indicator, and functional contextual actions.
 */
export function Topbar({
  currentRoute,
  onOpenMobileMenu,
  onReplayBoot,
}: TopbarProps) {
  const { activeDataset } = useDataset();
  const isOverview = currentRoute.id === 'overview';

  return (
    <header className="sticky top-0 z-[var(--dd-z-sticky)] flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--dd-border-subtle)] bg-[var(--dd-bg-backdrop)]/95 px-4 backdrop-blur-sm sm:px-6">
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

      {/* Center/Right context zone: Real dataset context + status + contextual action */}
      <div className="flex items-center gap-4 sm:gap-5 shrink-0">
        {/* Current dataset context area */}
        <div
          className="hidden md:flex items-center gap-2.5 border-r border-[var(--dd-border-subtle)] pr-5 max-w-[360px]"
          data-testid="topbar-dataset-context"
        >
          <span className="font-mono text-[0.7rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase whitespace-nowrap shrink-0">
            Dataset
          </span>
          {activeDataset ? (
            <div className="flex min-w-0 items-center gap-2 text-[0.8125rem]">
              <span
                title={
                  activeDataset.sheetName
                    ? `${activeDataset.fileName} (${activeDataset.sheetName})`
                    : activeDataset.fileName
                }
                className="truncate font-medium text-[var(--dd-text-primary)]"
              >
                {activeDataset.fileName}
              </span>
              <span
                className="font-mono text-[0.7rem] text-[var(--dd-text-muted)] dd-tabular whitespace-nowrap shrink-0"
              >
                {formatCount(activeDataset.rowCount)}×
                {formatCount(activeDataset.columnCount)}
              </span>
            </div>
          ) : (
            <span className="text-[0.8125rem] text-[var(--dd-text-secondary)] whitespace-nowrap">
              No file loaded
            </span>
          )}
        </div>

        {/* Application status indicator */}
        <StatusIndicator
          tone={activeDataset ? 'verified' : 'analytical'}
          label={activeDataset ? 'Dataset Loaded' : 'Standby'}
          className="hidden sm:inline-flex"
        />

        {/* Contextual action */}
        {isOverview ? (
          <button
            type="button"
            onClick={onReplayBoot}
            className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3 py-1.5 text-[0.75rem] font-medium text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)] whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Replay Intro</span>
          </button>
        ) : (
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3 py-1.5 text-[0.75rem] font-medium text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)] whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Overview</span>
          </Link>
        )}
      </div>
    </header>
  );
}
