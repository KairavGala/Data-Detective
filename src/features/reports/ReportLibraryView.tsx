import {
  AlertTriangle,
  Copy,
  Download,
  FilePlus2,
  FileText,
  FolderOpen,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { REPORT_TYPE_META } from '@/engine/reports';
import type { InvestigationReport } from '@/types';
import { formatReportDateTime } from './reportLabels';

interface ReportLibraryViewProps {
  readonly currentDatasetReports: readonly InvestigationReport[];
  readonly previousDatasetReports: readonly InvestigationReport[];
  readonly hasActiveDataset: boolean;
  readonly activeDatasetFileName?: string;
  readonly exportingReportId: string | null;
  readonly onCreateNew: () => void;
  readonly onOpenReport: (reportId: string) => void;
  readonly onExportReport: (report: InvestigationReport) => void;
  readonly onDuplicateReport: (reportId: string) => void;
  readonly onDeleteReport: (reportId: string) => void;
}

function ReportRowCard({
  report,
  isPreviousDataset,
  isExporting,
  onOpen,
  onExport,
  onDuplicate,
  onDelete,
}: {
  readonly report: InvestigationReport;
  readonly isPreviousDataset: boolean;
  readonly isExporting: boolean;
  readonly onOpen: () => void;
  readonly onExport: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
}) {
  const typeMeta = REPORT_TYPE_META[report.reportType];
  const enabledSectionCount = report.sections.filter((s) => s.enabled).length;

  return (
    <div
      data-testid={`report-card-${report.id}`}
      className="flex flex-col gap-3 rounded-[var(--dd-radius-md)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] p-4 lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
          <span className="font-semibold text-[var(--dd-accent-teal)]">
            {report.id}
          </span>
          <span>·</span>
          <span>{typeMeta.label}</span>
          {isPreviousDataset && (
            <>
              <span>·</span>
              <span className="text-[var(--dd-status-warning)]">
                Previous Dataset Snapshot
              </span>
            </>
          )}
        </div>

        <h4 className="truncate text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
          {report.title}
        </h4>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] text-[var(--dd-text-secondary)]">
          <span className="font-mono text-[0.71875rem] text-[var(--dd-text-primary)]">
            {report.datasetFileName}
          </span>
          {report.caseId && (
            <span>
              Case {report.caseId}
              {report.caseTitle ? ` — ${report.caseTitle}` : ''}
            </span>
          )}
          <span className="tabular-nums text-[var(--dd-text-muted)]">
            {enabledSectionCount} sections · {report.selectedFindingIds.length}{' '}
            findings · {report.selectedCharts.length} charts
          </span>
          <span className="text-[var(--dd-text-muted)]">
            Updated {formatReportDateTime(report.updatedAt)}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3 py-1.5 font-mono text-[0.71875rem] font-medium text-[var(--dd-text-primary)] hover:bg-[var(--dd-accent-teal)]/25"
        >
          <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
          Open &amp; Edit
        </button>
        <button
          type="button"
          disabled={isExporting}
          onClick={onExport}
          className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-1.5 font-mono text-[0.71875rem] text-[var(--dd-text-primary)] transition-colors hover:border-[var(--dd-accent-teal-border)] hover:bg-[var(--dd-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          {isExporting ? 'Exporting…' : 'Export PDF'}
        </button>
        <button
          type="button"
          aria-label={`Duplicate ${report.title}`}
          onClick={onDuplicate}
          className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 font-mono text-[0.71875rem] text-[var(--dd-text-secondary)] transition-colors hover:bg-[var(--dd-surface-hover)] hover:text-[var(--dd-text-primary)]"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          Duplicate
        </button>
        <button
          type="button"
          aria-label={`Delete ${report.title}`}
          onClick={onDelete}
          className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-anomaly-border)] bg-[var(--dd-status-anomaly-dim)] px-2.5 py-1.5 font-mono text-[0.71875rem] text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-status-anomaly)]/25"
        >
          <Trash2
            className="h-3.5 w-3.5 text-[var(--dd-status-anomaly)]"
            aria-hidden="true"
          />
          Delete
        </button>
      </div>
    </div>
  );
}

/**
 * Module 10 — Session-Scoped Report Library.
 * Displays active-dataset reports separately from previous-dataset snapshots.
 */
export function ReportLibraryView({
  currentDatasetReports,
  previousDatasetReports,
  hasActiveDataset,
  activeDatasetFileName,
  exportingReportId,
  onCreateNew,
  onOpenReport,
  onExportReport,
  onDuplicateReport,
  onDeleteReport,
}: ReportLibraryViewProps) {
  return (
    <div className="space-y-6" data-testid="report-library-view">
      {/* Session Scope Privacy Notice */}
      <div className="flex items-start gap-2.5 rounded-[var(--dd-radius-md)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-4 py-3 text-[0.78125rem] text-[var(--dd-text-secondary)]">
        <ShieldCheck
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--dd-accent-teal)]"
          aria-hidden="true"
        />
        <span>
          Reports are maintained in session memory only and export directly to
          A4 PDF in your browser. No raw spreadsheet rows are persisted to
          browser storage or transmitted to external servers.
        </span>
      </div>

      {/* Current Dataset Reports */}
      {hasActiveDataset && (
        <section className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
                Active Dataset Reports ({currentDatasetReports.length})
              </h3>
              {activeDatasetFileName && (
                <p className="font-mono text-[0.71875rem] text-[var(--dd-text-muted)]">
                  Bound to {activeDatasetFileName}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onCreateNew}
              className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3.5 py-1.5 font-mono text-[0.75rem] font-medium text-[var(--dd-text-primary)] hover:bg-[var(--dd-accent-teal)]/25"
            >
              <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
              New Report
            </button>
          </div>

          {currentDatasetReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[var(--dd-radius-md)] border border-dashed border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-6 py-10 text-center">
              <FileText className="mb-2.5 h-7 w-7 text-[var(--dd-text-muted)]" />
              <div className="text-[0.9375rem] font-medium text-[var(--dd-text-primary)]">
                No reports created for this dataset yet
              </div>
              <p className="mt-1 max-w-md text-[0.8125rem] text-[var(--dd-text-secondary)]">
                Compile a Dataset Analysis Report, Data Quality Report,
                Statistical Analysis Report, or Investigation Dossier directly
                from your active analysis.
              </p>
              <button
                type="button"
                onClick={onCreateNew}
                className="mt-4 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-4 py-2 font-mono text-[0.75rem] font-medium text-[var(--dd-text-primary)] hover:bg-[var(--dd-accent-teal)]/25"
              >
                <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                Create First Report
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {currentDatasetReports.map((report) => (
                <ReportRowCard
                  key={report.id}
                  report={report}
                  isPreviousDataset={false}
                  isExporting={exportingReportId === report.id}
                  onOpen={() => onOpenReport(report.id)}
                  onExport={() => onExportReport(report)}
                  onDuplicate={() => onDuplicateReport(report.id)}
                  onDelete={() => onDeleteReport(report.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Previous Dataset Reports (Isolated) */}
      {previousDatasetReports.length > 0 && (
        <section
          data-testid="previous-dataset-reports-section"
          className="space-y-3 border-t border-[var(--dd-border-subtle)] pt-5"
        >
          <div className="flex items-start gap-2.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-warning-border)] bg-[var(--dd-status-warning-dim)] px-3.5 py-2.5 text-[0.78125rem] text-[var(--dd-text-secondary)]">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--dd-status-warning)]"
              aria-hidden="true"
            />
            <div>
              <h3 className="font-semibold text-[var(--dd-text-primary)]">
                Previous Dataset Reports ({previousDatasetReports.length})
              </h3>
              <p className="mt-0.5 text-[var(--dd-text-secondary)]">
                These reports belong to an earlier dataset in this session. They
                are isolated from your active dataset to prevent evidence mixing
                and can still be inspected or exported from their frozen
                aggregate snapshots.
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {previousDatasetReports.map((report) => (
              <ReportRowCard
                key={report.id}
                report={report}
                isPreviousDataset={true}
                isExporting={exportingReportId === report.id}
                onOpen={() => onOpenReport(report.id)}
                onExport={() => onExportReport(report)}
                onDuplicate={() => onDuplicateReport(report.id)}
                onDelete={() => onDeleteReport(report.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
