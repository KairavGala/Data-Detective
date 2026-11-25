import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  FilePlus2,
  Library,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import {
  WorkspaceHeader,
  type WorkspaceContextLink,
} from '@/components/layout/WorkspaceHeader';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { useDataset } from '@/context/DatasetContext';
import {
  ReportProvider,
  useOptionalReports,
  useReports,
  type StagedReportChartsHandoff,
} from '@/context/ReportContext';
import {
  generateReportPdf,
  triggerBrowserPdfDownload,
  validateChartConfigsForDataset,
  type CreateReportInput,
} from '@/engine/reports';
import type {
  InvestigationReport,
  ReportSourceKind,
  ReportType,
} from '@/types';
import { cn, formatCount } from '@/utils';
import { ReportA4Preview } from './ReportA4Preview';
import {
  ReportBuilderPanel,
  type ReportBuilderPrefill,
} from './ReportBuilderPanel';
import {
  ReportEditorSidebar,
  type ExportStatusInfo,
} from './ReportEditorSidebar';
import { ReportLibraryView } from './ReportLibraryView';

type ReportsWorkspaceMode = 'library' | 'builder' | 'editor';

const VALID_REPORT_TYPES = new Set<ReportType>([
  'dataset_analysis',
  'data_quality',
  'investigation_dossier',
  'statistical_analysis',
  'custom',
]);

const VALID_SOURCE_KINDS = new Set<ReportSourceKind>([
  'dataset',
  'case',
  'findings',
]);

/**
 * Module 10 — Investigation Reports & Dossiers (`/reports`).
 *
 * Self-resilient wrapper so isolated tests can mount ReportsPage directly
 * while the full App mounts ReportProvider globally for session persistence.
 */
export function ReportsPage() {
  const existing = useOptionalReports();
  if (!existing) {
    return (
      <ReportProvider>
        <ReportsPageContent />
      </ReportProvider>
    );
  }
  return <ReportsPageContent />;
}

function ReportsPageContent() {
  const {
    activeDataset,
    profilingStatus,
    statisticsStatus,
    profilingError,
    statisticsError,
    reprofileDataset,
    recomputeStatistics,
  } = useDataset();
  const {
    allReports,
    currentDatasetReports,
    previousDatasetReports,
    activeSources,
    recommendedCharts,
    stagedChartHandoff,
    clearStagedChartsForReport,
    createReport,
    updateReport,
    duplicateReportById,
    deleteReport,
    compileReport,
  } = useReports();

  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<ReportsWorkspaceMode>('library');
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [builderPrefill, setBuilderPrefill] =
    useState<ReportBuilderPrefill | null>(null);
  const [builderSessionNonce, setBuilderSessionNonce] = useState<number>(0);
  const [exportingReportId, setExportingReportId] = useState<string | null>(
    null,
  );
  const [exportStatus, setExportStatus] = useState<ExportStatusInfo>({
    isExporting: false,
    error: null,
    lastExport: null,
  });

  // Strict synchronous lock to prevent duplicate simultaneous PDF exports
  const exportLockRef = useRef<boolean>(false);

  // Consume contextual deep-link query params & staged custom chart handoffs from Modules 04, 06, 07, 08, 09
  const searchKey = searchParams.toString();
  const locationStudioHandoff = useMemo<StagedReportChartsHandoff | null>(() => {
    const rawState = location.state as {
      readonly studioChartHandoff?: StagedReportChartsHandoff;
    } | null;
    if (
      rawState &&
      typeof rawState === 'object' &&
      rawState.studioChartHandoff &&
      Array.isArray(rawState.studioChartHandoff.charts)
    ) {
      return rawState.studioChartHandoff;
    }
    return null;
  }, [location.state]);

  useEffect(() => {
    if (!activeSources) return;
    const sourceRaw = searchParams.get('source');
    const caseIdRaw = searchParams.get('caseId');
    const findingSingle = searchParams.get('finding');
    const findingsMulti = searchParams.get('findings');
    const typeRaw = searchParams.get('type');
    const chartsRaw = searchParams.get('charts');
    const includeAiRaw = searchParams.get('includeAi');

    const isStudioChartHandoff =
      chartsRaw === 'studio' || Boolean(locationStudioHandoff);

    const hasContextParams = Boolean(
      sourceRaw ||
        caseIdRaw ||
        findingSingle ||
        findingsMulti ||
        typeRaw ||
        chartsRaw ||
        includeAiRaw ||
        locationStudioHandoff,
    );
    if (!hasContextParams) return;

    const findingIds: string[] = [];
    if (findingSingle) findingIds.push(findingSingle);
    if (findingsMulti) {
      for (const id of findingsMulti.split(',')) {
        const trimmed = id.trim();
        if (trimmed) findingIds.push(trimmed);
      }
    }

    let customChartPrefill: Partial<ReportBuilderPrefill> = {};
    if (isStudioChartHandoff) {
      const candidateHandoff = locationStudioHandoff ?? stagedChartHandoff;
      if (!candidateHandoff) {
        customChartPrefill = {
          customChartsRequested: true,
          customCharts: [],
          customChartNotice:
            'No active Visualization Studio chart selection was found for this link. Select charts manually below or return to Visualization Studio.',
        };
      } else if (
        candidateHandoff.datasetId !== activeSources.dataset.id ||
        candidateHandoff.profiledAt !== activeSources.profile.profiledAt
      ) {
        customChartPrefill = {
          customChartsRequested: true,
          customCharts: [],
          customChartNotice:
            'The handed-off Visualization Studio charts belonged to a previous dataset or schema version and were not applied. Select charts for the active dataset below.',
        };
      } else if (candidateHandoff.charts.length === 0) {
        customChartPrefill = {
          customChartsRequested: true,
          customCharts: [],
          customChartNotice:
            'Visualization Studio currently has no active charts on the canvas. Select recommended charts below or create charts in Visualization Studio.',
        };
      } else {
        const validated = validateChartConfigsForDataset(
          candidateHandoff.charts,
          activeSources.dataset,
          activeSources.profile,
          activeSources.stats,
        );
        customChartPrefill = {
          customChartsRequested: true,
          customCharts: validated.validCharts,
          invalidCustomCharts: validated.invalidCharts.map((entry) => ({
            title: entry.config?.title || 'Untitled chart',
            reason: entry.reason,
          })),
          ...(validated.validCharts.length === 0
            ? {
                customChartNotice:
                  'None of the handed-off Visualization Studio charts are valid for the active dataset. Review skipped charts below or choose recommended charts manually.',
              }
            : {}),
        };
      }
      clearStagedChartsForReport();
    }

    const prefill: ReportBuilderPrefill = {
      sourceKind:
        sourceRaw && VALID_SOURCE_KINDS.has(sourceRaw as ReportSourceKind)
          ? (sourceRaw as ReportSourceKind)
          : caseIdRaw
            ? 'case'
            : findingIds.length > 0
              ? 'findings'
              : 'dataset',
      ...(caseIdRaw ? { caseId: caseIdRaw } : {}),
      ...(findingIds.length > 0 ? { findingIds } : {}),
      ...(typeRaw && VALID_REPORT_TYPES.has(typeRaw as ReportType)
        ? { reportType: typeRaw as ReportType }
        : {}),
      includeCharts:
        !isStudioChartHandoff && (chartsRaw === '1' || chartsRaw === 'true'),
      includeAi: includeAiRaw === '1' || includeAiRaw === 'true',
      ...customChartPrefill,
    };

    setBuilderPrefill(prefill);
    setBuilderSessionNonce((n) => n + 1);
    setMode('builder');
    navigate('/reports', { replace: true, state: null });
  }, [
    searchKey,
    searchParams,
    activeSources,
    locationStudioHandoff,
    stagedChartHandoff,
    clearStagedChartsForReport,
    navigate,
  ]);

  const activeReport = useMemo<InvestigationReport | null>(
    () => allReports.find((r) => r.id === activeReportId) ?? null,
    [allReports, activeReportId],
  );

  // If active report was deleted, return cleanly to library
  useEffect(() => {
    if (mode === 'editor' && !activeReport) {
      setMode('library');
      setActiveReportId(null);
    }
  }, [mode, activeReport]);

  const compiledActiveReport = useMemo(
    () => (activeReport ? compileReport(activeReport) : null),
    [activeReport, compileReport],
  );

  const handleCreateReport = useCallback(
    (input: CreateReportInput) => {
      const created = createReport(input);
      if (!created) return;
      setBuilderPrefill(null);
      setActiveReportId(created.id);
      setExportStatus({ isExporting: false, error: null, lastExport: null });
      setMode('editor');
    },
    [createReport],
  );

  const handleOpenReport = useCallback((reportId: string) => {
    setActiveReportId(reportId);
    setExportStatus({ isExporting: false, error: null, lastExport: null });
    setMode('editor');
  }, []);

  const handleDuplicateReport = useCallback(
    (reportId: string) => {
      const copy = duplicateReportById(reportId);
      if (copy && mode === 'editor') {
        setActiveReportId(copy.id);
      }
    },
    [duplicateReportById, mode],
  );

  const handleDeleteReport = useCallback(
    (reportId: string) => {
      deleteReport(reportId);
      if (activeReportId === reportId) {
        setActiveReportId(null);
        setMode('library');
      }
    },
    [deleteReport, activeReportId],
  );

  const runPdfExport = useCallback(
    async (targetReport: InvestigationReport) => {
      if (exportLockRef.current) return;
      exportLockRef.current = true;
      setExportingReportId(targetReport.id);
      setExportStatus((prev) => ({
        ...prev,
        isExporting: true,
        error: null,
      }));

      try {
        // Yield a frame so progress state renders before synchronous PDF layout
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 10);
        });
        const compiled = compileReport(targetReport);
        const result = generateReportPdf(compiled);
        triggerBrowserPdfDownload(result);
        setExportStatus({
          isExporting: false,
          error: null,
          lastExport: {
            fileName: result.fileName,
            pageCount: result.pageCount,
            bytesLength: result.bytes.byteLength,
            durationMs: result.durationMs,
          },
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to generate PDF document.';
        setExportStatus((prev) => ({
          ...prev,
          isExporting: false,
          error: message,
        }));
      } finally {
        exportLockRef.current = false;
        setExportingReportId(null);
      }
    },
    [compileReport],
  );

  const isAnalyzing =
    Boolean(activeDataset) &&
    (profilingStatus === 'profiling' || statisticsStatus === 'analyzing');
  const isProfileFailure = profilingStatus === 'error';
  const hasAnalysisError =
    Boolean(activeDataset) &&
    (profilingStatus === 'error' || statisticsStatus === 'error');
  const analysisError = isProfileFailure
    ? (profilingError ??
      'Dataset schema profiling failed before reports could be prepared.')
    : (statisticsError ??
      'Statistical analysis failed before reports could be prepared.');

  // Empty State: No active dataset and no previous session reports
  if (!activeDataset && allReports.length === 0) {
    return (
      <PageContainer width="standard">
        <div
          className="dd-anim-file-enter space-y-6"
          data-testid="reports-no-dataset-state"
        >
          <section className="dd-surface-primary space-y-5 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DossierLabel code="SEC-06" label="Reports & Export" />
              <StatusIndicator tone="neutral" label="No Active Dataset" />
            </div>

            <div className="space-y-2">
              <h2 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-[var(--dd-text-primary)]">
                Investigation Reports &amp; Dossiers
              </h2>
              <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--dd-text-secondary)]">
                Import a CSV or Excel (.xlsx) dataset on the Overview workspace
                to compile verified profiling, deterministic statistics,
                findings, visualizations, and investigation cases into
                multi-page A4 PDF dossiers locally in your browser.
              </p>
            </div>

            <div className="border-t border-[var(--dd-border-subtle)] pt-5">
              <Link
                to="/"
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Import Dataset on Overview</span>
              </Link>
            </div>
          </section>
        </div>
      </PageContainer>
    );
  }

  // Full-page Error State when active dataset analysis failed and no previous reports exist
  if (hasAnalysisError && allReports.length === 0) {
    return (
      <PageContainer width="standard">
        <div className="dd-anim-file-enter">
          <section
            role="alert"
            data-testid="reports-error-state"
            className="dd-surface-primary flex flex-col gap-4 border-[var(--dd-status-anomaly-border)] p-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--dd-status-anomaly)]"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <h2 className="text-[1rem] font-semibold text-[var(--dd-text-primary)]">
                  Report preparation failed
                </h2>
                <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
                  {analysisError}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={
                isProfileFailure ? reprofileDataset : recomputeStatistics
              }
              className="inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:border-[var(--dd-accent-teal-border)]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Retry Analysis</span>
            </button>
          </section>
        </div>
      </PageContainer>
    );
  }

  // Full-page Loading State when active dataset is still computing and no previous reports exist
  if (isAnalyzing && !activeSources && allReports.length === 0 && activeDataset) {
    return (
      <PageContainer width="standard">
        <div className="dd-anim-file-enter">
          <section
            aria-label="Report preparation in progress"
            data-testid="reports-loading-state"
            className="dd-surface-primary flex items-center justify-between gap-4 p-6"
          >
            <div className="flex items-center gap-3.5">
              <Loader2
                className="h-5 w-5 animate-spin text-[var(--dd-accent-teal)]"
                aria-hidden="true"
              />
              <div className="space-y-0.5">
                <h2 className="text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
                  Preparing analytical baseline for reports…
                </h2>
                <p className="font-mono text-[0.75rem] text-[var(--dd-text-muted)] dd-tabular">
                  Analyzing {formatCount(activeDataset.rowCount)} rows ×{' '}
                  {formatCount(activeDataset.columnCount)} columns locally in
                  browser memory.
                </p>
              </div>
            </div>
            <StatusIndicator tone="analytical" label="Preparing" />
          </section>
        </div>
      </PageContainer>
    );
  }

  // Context-aware links back to the relevant analytical source workspace
  const headerNavLinks = useMemo<readonly WorkspaceContextLink[]>(() => {
    if (!activeDataset) return [];

    if (mode === 'editor' && activeReport && compiledActiveReport?.isActiveDatasetMatch) {
      const links: WorkspaceContextLink[] = [];
      if (activeReport.caseId) {
        links.push({
          label: `Source Case (${activeReport.caseId})`,
          to: `/investigation?case=${encodeURIComponent(activeReport.caseId)}`,
          testId: 'reports-nav-source-case',
        });
      } else {
        links.push({
          label: 'Investigation Center',
          to: '/investigation',
          testId: 'reports-nav-investigation',
        });
      }

      if (activeReport.reportType === 'statistical_analysis') {
        links.push({
          label: 'Statistical Analysis',
          to: '/analysis',
          testId: 'reports-nav-statistics',
        });
      } else if (activeReport.selectedCharts.length > 0) {
        links.push({
          label: 'Visualization Studio',
          to: '/visualizations',
          testId: 'reports-nav-visualizations',
        });
      }

      if (activeReport.aiInclusion.includeModule08Brief) {
        links.push({
          label: 'AI Assistant',
          to: '/assistant',
          testId: 'reports-nav-assistant',
        });
      }
      return links;
    }

    if (mode === 'builder' && builderPrefill) {
      if (builderPrefill.sourceKind === 'case' && builderPrefill.caseId) {
        return [
          {
            label: `Return to Case ${builderPrefill.caseId}`,
            to: `/investigation?case=${encodeURIComponent(builderPrefill.caseId)}`,
            testId: 'reports-nav-source-case',
          },
          {
            label: 'Visualization Studio',
            to: '/visualizations',
            testId: 'reports-nav-visualizations',
          },
        ];
      }
      if (builderPrefill.customChartsRequested) {
        return [
          {
            label: 'Visualization Studio',
            to: '/visualizations',
            testId: 'reports-nav-visualizations',
          },
          {
            label: 'Investigation Center',
            to: '/investigation',
            testId: 'reports-nav-investigation',
          },
        ];
      }
      if (builderPrefill.reportType === 'statistical_analysis') {
        return [
          {
            label: 'Statistical Analysis',
            to: '/analysis',
            testId: 'reports-nav-statistics',
          },
          {
            label: 'Visualization Studio',
            to: '/visualizations',
            testId: 'reports-nav-visualizations',
          },
        ];
      }
      if (builderPrefill.includeAi) {
        return [
          {
            label: 'AI Assistant',
            to: '/assistant',
            testId: 'reports-nav-assistant',
          },
          {
            label: 'Investigation Center',
            to: '/investigation',
            testId: 'reports-nav-investigation',
          },
        ];
      }
    }

    return [
      {
        label: 'Investigation Center',
        to: '/investigation',
        testId: 'reports-nav-investigation',
      },
      {
        label: 'Visualization Studio',
        to: '/visualizations',
        testId: 'reports-nav-visualizations',
      },
      {
        label: 'Statistical Analysis',
        to: '/analysis',
        testId: 'reports-nav-statistics',
      },
    ];
  }, [activeDataset, mode, activeReport, compiledActiveReport, builderPrefill]);

  return (
    <PageContainer width="wide">
      <div className="dd-anim-file-enter space-y-6">
        {/* Workspace Header */}
        <WorkspaceHeader
          code="SEC-06"
          sectionLabel="Reports & Export"
          title="Investigation Reports & Dossiers"
          navigationLinks={headerNavLinks}
          context={
            activeDataset ? (
              <>
                Active dataset:{' '}
                <span className="text-[var(--dd-text-primary)]">
                  {activeDataset.fileName}
                </span>{' '}
                · {currentDatasetReports.length} active report(s)
                {previousDatasetReports.length > 0 &&
                  ` · ${previousDatasetReports.length} previous-dataset snapshot(s)`}
              </>
            ) : (
              <>
                No active dataset loaded · {previousDatasetReports.length}{' '}
                previous-dataset snapshot(s) available
              </>
            )
          }
          actions={
            <>
              <button
                type="button"
                onClick={() => setMode('library')}
                aria-pressed={mode === 'library'}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--dd-radius-sm)] border px-3 py-1.5 font-mono text-[0.75rem] transition-colors',
                  mode === 'library'
                    ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-text-primary)]'
                    : 'border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] text-[var(--dd-text-secondary)] hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)]',
                )}
              >
                {mode === 'library' ? (
                  <Library className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Report Library ({allReports.length})</span>
              </button>

              {activeSources && (
                <button
                  type="button"
                  onClick={() => {
                    setBuilderPrefill(null);
                    setBuilderSessionNonce((n) => n + 1);
                    setMode('builder');
                  }}
                  aria-pressed={mode === 'builder'}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--dd-radius-sm)] border px-3.5 py-1.5 font-mono text-[0.75rem] font-medium transition-colors',
                    mode === 'builder'
                      ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-text-primary)]'
                      : 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-surface-primary)] text-[var(--dd-text-primary)] hover:bg-[var(--dd-accent-teal-dim)]',
                  )}
                >
                  <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Create Report</span>
                </button>
              )}
            </>
          }
        />

        {/* Inline Loading / Analysis Error Banners (when historical reports are also shown) */}
        {isAnalyzing && activeDataset && (
          <div
            data-testid="reports-loading-state"
            className="dd-surface-primary flex items-center justify-between gap-4 px-4 py-3 text-[0.8125rem] text-[var(--dd-text-secondary)]"
          >
            <div className="flex items-center gap-2.5">
              <Loader2
                className="h-4 w-4 animate-spin text-[var(--dd-accent-teal)]"
                aria-hidden="true"
              />
              <span>
                Computing dataset profile and deterministic statistics for{' '}
                <span className="font-mono text-[var(--dd-text-primary)]">
                  {activeDataset.fileName}
                </span>
                …
              </span>
            </div>
            <StatusIndicator tone="analytical" label="Preparing" />
          </div>
        )}

        {hasAnalysisError && (
          <div
            role="alert"
            data-testid="reports-error-state"
            className="dd-surface-primary flex flex-col gap-3 border-[var(--dd-status-anomaly-border)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2.5 text-[0.8125rem]">
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--dd-status-anomaly)]"
                aria-hidden="true"
              />
              <div className="space-y-0.5">
                <div className="font-semibold text-[var(--dd-text-primary)]">
                  Report preparation failed
                </div>
                <p className="text-[var(--dd-text-secondary)]">
                  {analysisError}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={
                isProfileFailure ? reprofileDataset : recomputeStatistics
              }
              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-3.5 py-1.5 text-[0.78125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:border-[var(--dd-accent-teal-border)]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Retry Analysis</span>
            </button>
          </div>
        )}

        {/* Mode 1: Report Library */}
        {mode === 'library' && (
          <ReportLibraryView
            currentDatasetReports={currentDatasetReports}
            previousDatasetReports={previousDatasetReports}
            hasActiveDataset={Boolean(activeSources)}
            activeDatasetFileName={activeDataset?.fileName}
            exportingReportId={exportingReportId}
            onCreateNew={() => {
              setBuilderPrefill(null);
              setBuilderSessionNonce((n) => n + 1);
              setMode('builder');
            }}
            onOpenReport={handleOpenReport}
            onExportReport={(r) => {
              void runPdfExport(r);
            }}
            onDuplicateReport={handleDuplicateReport}
            onDeleteReport={handleDeleteReport}
          />
        )}

        {/* Mode 2: Report Builder */}
        {mode === 'builder' && activeSources && (
          <ReportBuilderPanel
            key={`${activeSources.dataset.id}:${builderSessionNonce}`}
            sources={activeSources}
            recommendedCharts={recommendedCharts}
            prefill={builderPrefill}
            onCreateReport={handleCreateReport}
            onCancel={() => setMode('library')}
          />
        )}

        {/* Mode 3: Split Editor + A4 Document Preview */}
        {mode === 'editor' && activeReport && compiledActiveReport && (
          <div className="grid items-start gap-6 xl:grid-cols-[340px_1fr]">
            <div className="xl:sticky xl:top-6">
              <ReportEditorSidebar
                report={activeReport}
                compiled={compiledActiveReport}
                activeSources={activeSources}
                recommendedCharts={recommendedCharts}
                exportStatus={exportStatus}
                onUpdateReport={(updater) =>
                  updateReport(activeReport.id, updater)
                }
                onExportPdf={() => {
                  void runPdfExport(activeReport);
                }}
                onDuplicate={() => handleDuplicateReport(activeReport.id)}
                onDelete={() => handleDeleteReport(activeReport.id)}
              />
            </div>

            <div className="min-w-0 rounded-[var(--dd-radius-md)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-4 sm:p-6">
              <ReportA4Preview compiled={compiledActiveReport} />
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
