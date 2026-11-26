import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Trash2,
} from 'lucide-react';
import {
  getChartConfigSignature,
  reorderReportSections,
  toggleReportSection,
  updateReportMetadata,
  updateReportSectionTitle,
  updateReportSelections,
  type ActiveReportSources,
} from '@/engine/reports';
import type {
  ChartConfig,
  CompiledReportDocument,
  InvestigationReport,
} from '@/types';
import { cn } from '@/utils';
import { formatFileSize } from './reportLabels';

type EditorTab = 'metadata' | 'sections' | 'content';

export interface ExportStatusInfo {
  readonly isExporting: boolean;
  readonly error: string | null;
  readonly lastExport: {
    readonly fileName: string;
    readonly pageCount: number;
    readonly bytesLength: number;
    readonly durationMs: number;
  } | null;
}

interface ReportEditorSidebarProps {
  readonly report: InvestigationReport;
  readonly compiled: CompiledReportDocument;
  readonly activeSources: ActiveReportSources | null;
  readonly recommendedCharts: readonly ChartConfig[];
  readonly exportStatus: ExportStatusInfo;
  readonly onUpdateReport: (
    updater: (r: InvestigationReport) => InvestigationReport,
  ) => void;
  readonly onExportPdf: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
}

function chartKey(cfg: ChartConfig): string {
  return getChartConfigSignature(cfg);
}

function SectionHeadingInput({
  sectionKey,
  value,
  onCommit,
}: {
  readonly sectionKey: string;
  readonly value: string;
  readonly onCommit: (nextTitle: string) => void;
}) {
  const [draft, setDraft] = useState<string>(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      type="text"
      aria-label={`Heading for ${sectionKey}`}
      value={draft}
      maxLength={100}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (next.trim()) {
          onCommit(next);
        }
      }}
      onBlur={() => {
        if (!draft.trim()) {
          setDraft(value);
        }
      }}
      className="min-w-0 flex-1 bg-transparent text-[0.78125rem] font-medium text-[var(--dd-text-primary)] outline-none focus:underline"
    />
  );
}

/**
 * Module 10 — Interactive Report Editor Sidebar.
 * Controls metadata, section ordering/visibility/titles, evidence selections,
 * and triggers genuine multi-page A4 PDF export.
 */
export function ReportEditorSidebar({
  report,
  compiled,
  activeSources,
  recommendedCharts,
  exportStatus,
  onUpdateReport,
  onExportPdf,
  onDuplicate,
  onDelete,
}: ReportEditorSidebarProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>('sections');
  const isMatched = compiled.isActiveDatasetMatch && activeSources !== null;

  const hasValidAiBrief = Boolean(
    isMatched &&
      activeSources?.verifiedAiBrief &&
      activeSources.verifiedAiBrief.datasetId === report.datasetId &&
      activeSources.verifiedAiBrief.profiledAt === report.datasetProfiledAt,
  );
  const hasCaseAi = Boolean(
    compiled.investigationCase &&
      compiled.investigationCase.aiAnalyses.length > 0,
  );

  const selectedChartKeySet = new Set(report.selectedCharts.map(chartKey));

  // Preserve any custom charts attached to the report alongside recommended charts
  const allEditorCharts: ChartConfig[] = [];
  const seenEditorChartKeys = new Set<string>();
  for (const cfg of report.selectedCharts) {
    const key = chartKey(cfg);
    if (seenEditorChartKeys.has(key)) continue;
    seenEditorChartKeys.add(key);
    allEditorCharts.push(cfg);
  }
  for (const cfg of recommendedCharts) {
    const key = chartKey(cfg);
    if (seenEditorChartKeys.has(key)) continue;
    seenEditorChartKeys.add(key);
    allEditorCharts.push(cfg);
  }

  const toggleFindingSelection = (findingId: string) => {
    if (!isMatched || !activeSources) return;
    const exists = report.selectedFindingIds.includes(findingId);
    const next = exists
      ? report.selectedFindingIds.filter((id) => id !== findingId)
      : [...report.selectedFindingIds, findingId];
    onUpdateReport((curr) =>
      updateReportSelections(curr, { selectedFindingIds: next }, activeSources),
    );
  };

  const toggleStatColumnSelection = (colId: string) => {
    if (!isMatched || !activeSources) return;
    const exists = report.selectedStatColumnIds.includes(colId);
    const next = exists
      ? report.selectedStatColumnIds.filter((id) => id !== colId)
      : [...report.selectedStatColumnIds, colId];
    onUpdateReport((curr) =>
      updateReportSelections(
        curr,
        { selectedStatColumnIds: next },
        activeSources,
      ),
    );
  };

  const toggleChartSelection = (cfg: ChartConfig) => {
    if (!isMatched || !activeSources) return;
    const key = chartKey(cfg);
    const exists = selectedChartKeySet.has(key);
    const next = exists
      ? report.selectedCharts.filter((c) => chartKey(c) !== key)
      : [...report.selectedCharts, cfg];
    onUpdateReport((curr) =>
      updateReportSelections(curr, { selectedCharts: next }, activeSources),
    );
  };

  return (
    <aside
      data-testid="report-editor-sidebar"
      className="flex flex-col gap-4 rounded-[var(--dd-radius-md)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] p-4"
    >
      {/* Primary Export PDF Action */}
      <div className="space-y-2.5 border-b border-[var(--dd-border-subtle)] pb-4">
        <button
          type="button"
          onClick={onExportPdf}
          disabled={exportStatus.isExporting}
          data-testid="export-pdf-button"
          className="flex w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-4 py-2 font-mono text-[0.78125rem] font-semibold text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exportStatus.isExporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Generating A4 PDF…
            </>
          ) : (
            <>
              <Download className="h-4 w-4" aria-hidden="true" />
              Export A4 PDF
            </>
          )}
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDuplicate}
            className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 font-mono text-[0.71875rem] text-[var(--dd-text-secondary)] transition-colors hover:bg-[var(--dd-surface-hover)] hover:text-[var(--dd-text-primary)]"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            Duplicate
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-anomaly-border)] bg-[var(--dd-status-anomaly-dim)] px-2.5 py-1.5 font-mono text-[0.71875rem] text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-status-anomaly)]/25"
          >
            <Trash2
              className="h-3.5 w-3.5 text-[var(--dd-status-anomaly)]"
              aria-hidden="true"
            />
            Delete
          </button>
        </div>

        {exportStatus.error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-anomaly-border)] bg-[var(--dd-status-anomaly-dim)] p-2.5 text-[0.75rem] text-[var(--dd-text-primary)]"
          >
            <AlertCircle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dd-status-anomaly)]"
              aria-hidden="true"
            />
            <span>{exportStatus.error}</span>
          </div>
        )}

        {exportStatus.lastExport && !exportStatus.error && (
          <div
            data-testid="export-pdf-success"
            className="flex items-start gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-verified-border)] bg-[var(--dd-status-verified-dim)] p-2.5 text-[0.71875rem] text-[var(--dd-text-primary)]"
          >
            <CheckCircle2
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dd-status-verified)]"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="truncate font-mono font-semibold text-[var(--dd-text-primary)]">
                {exportStatus.lastExport.fileName}
              </div>
              <div className="font-mono text-[0.6875rem] text-[var(--dd-text-secondary)] tabular-nums">
                {exportStatus.lastExport.pageCount} A4 page(s) ·{' '}
                {formatFileSize(exportStatus.lastExport.bytesLength)} ·{' '}
                {exportStatus.lastExport.durationMs}ms
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tab Strip */}
      <div
        role="tablist"
        aria-label="Report editor sections"
        className="grid grid-cols-3 gap-1 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-1"
      >
        {(
          [
            { id: 'sections', label: 'Sections' },
            { id: 'metadata', label: 'Metadata' },
            { id: 'content', label: 'Evidence' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'cursor-pointer whitespace-nowrap rounded-[var(--dd-radius-sm)] px-2 py-1.5 font-mono text-[0.71875rem] font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-[var(--dd-accent-teal-dim)] text-[var(--dd-text-primary)]'
                : 'text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Sections (Reorder, Toggle, Edit Headings) */}
      {activeTab === 'sections' && (
        <div className="space-y-2">
          <div className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
            Order, Visibility &amp; Headings ({compiled.activeSections.length}/
            {report.sections.length} enabled)
          </div>
          <div className="space-y-2">
            {report.sections.map((sec, idx) => (
              <div
                key={sec.key}
                className={cn(
                  'rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-2',
                  !sec.enabled && 'opacity-55',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`${sec.enabled ? 'Hide' : 'Show'} ${sec.title}`}
                    onClick={() =>
                      onUpdateReport((curr) =>
                        toggleReportSection(curr, sec.key),
                      )
                    }
                    className="cursor-pointer rounded p-1 text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)]"
                  >
                    {sec.enabled ? (
                      <Eye className="h-3.5 w-3.5 text-[var(--dd-accent-teal)]" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <SectionHeadingInput
                    sectionKey={sec.key}
                    value={sec.title}
                    onCommit={(val) =>
                      onUpdateReport((curr) =>
                        updateReportSectionTitle(curr, sec.key, val),
                      )
                    }
                  />

                  <button
                    type="button"
                    aria-label={`Move ${sec.title} up`}
                    disabled={idx === 0}
                    onClick={() =>
                      onUpdateReport((curr) =>
                        reorderReportSections(curr, idx, idx - 1),
                      )
                    }
                    className="cursor-pointer rounded p-1 text-[var(--dd-text-muted)] hover:text-[var(--dd-text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${sec.title} down`}
                    disabled={idx === report.sections.length - 1}
                    onClick={() =>
                      onUpdateReport((curr) =>
                        reorderReportSections(curr, idx, idx + 1),
                      )
                    }
                    className="cursor-pointer rounded p-1 text-[var(--dd-text-muted)] hover:text-[var(--dd-text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Metadata & Custom Narrative */}
      {activeTab === 'metadata' && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="editor-title"
              className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]"
            >
              Report Title
            </label>
            <input
              id="editor-title"
              type="text"
              maxLength={160}
              value={report.title}
              onChange={(e) =>
                onUpdateReport((curr) =>
                  updateReportMetadata(curr, { title: e.target.value }),
                )
              }
              className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="editor-subtitle"
              className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]"
            >
              Subtitle
            </label>
            <input
              id="editor-subtitle"
              type="text"
              maxLength={200}
              value={report.subtitle}
              onChange={(e) =>
                onUpdateReport((curr) =>
                  updateReportMetadata(curr, { subtitle: e.target.value }),
                )
              }
              className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="editor-author"
              className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]"
            >
              Author
            </label>
            <input
              id="editor-author"
              type="text"
              maxLength={100}
              value={report.author}
              onChange={(e) =>
                onUpdateReport((curr) =>
                  updateReportMetadata(curr, { author: e.target.value }),
                )
              }
              placeholder="Optional analyst / team"
              className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="editor-intro"
              className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]"
            >
              Introductory Note
            </label>
            <textarea
              id="editor-intro"
              rows={3}
              maxLength={1500}
              value={report.introDescription}
              onChange={(e) =>
                onUpdateReport((curr) =>
                  updateReportMetadata(curr, {
                    introDescription: e.target.value,
                  }),
                )
              }
              placeholder="Optional scope note shown on cover / executive summary…"
              className="w-full resize-y rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="editor-limitations"
              className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]"
            >
              Additional Limitations Note
            </label>
            <textarea
              id="editor-limitations"
              rows={2}
              maxLength={1000}
              value={report.customLimitations ?? ''}
              onChange={(e) =>
                onUpdateReport((curr) =>
                  updateReportMetadata(curr, {
                    customLimitations: e.target.value,
                  }),
                )
              }
              placeholder="Optional domain caveat or sampling boundary…"
              className="w-full resize-y rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="editor-conclusion"
              className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]"
            >
              Custom Conclusion Note
            </label>
            <textarea
              id="editor-conclusion"
              rows={2}
              maxLength={1200}
              value={report.customConclusion ?? ''}
              onChange={(e) =>
                onUpdateReport((curr) =>
                  updateReportMetadata(curr, {
                    customConclusion: e.target.value,
                  }),
                )
              }
              placeholder="Optional concluding statement grounded in evidence…"
              className="w-full resize-y rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
            />
          </div>
        </div>
      )}

      {/* Tab 3: Evidence, Charts & Optional AI Inclusion */}
      {activeTab === 'content' && (
        <div className="space-y-4">
          {!isMatched ? (
            <div className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-warning-border)] bg-[var(--dd-status-warning-dim)] p-3 text-[0.75rem] text-[var(--dd-text-secondary)]">
              <div className="mb-1 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--dd-status-warning)]">
                Evidence Selection Locked
              </div>
              Evidence selection is locked because this report belongs to a
              previous dataset ({report.datasetFileName}). You may still adjust
              section order, metadata, or export the frozen snapshot as PDF.
            </div>
          ) : (
            <>
              {/* Findings */}
              <div className="space-y-1.5">
                <div className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                  Findings ({report.selectedFindingIds.length}/
                  {activeSources.investigation.insights.length})
                </div>
                <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                  {activeSources.investigation.insights.map((f) => (
                    <label
                      key={f.id}
                      className="flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-2 py-1 text-[0.75rem] text-[var(--dd-text-primary)]"
                    >
                      <input
                        type="checkbox"
                        checked={report.selectedFindingIds.includes(f.id)}
                        onChange={() => toggleFindingSelection(f.id)}
                        className="accent-[var(--dd-accent-teal)]"
                      />
                      <span className="truncate">{f.title}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Statistical Columns */}
              <div className="space-y-1.5">
                <div className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                  Statistical Columns ({report.selectedStatColumnIds.length})
                </div>
                <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
                  {[
                    ...activeSources.stats.numericColumns.map((c) => ({
                      id: c.columnId,
                      name: c.name,
                    })),
                    ...activeSources.stats.categoricalColumns.map((c) => ({
                      id: c.columnId,
                      name: c.name,
                    })),
                  ].map((col) => (
                    <label
                      key={col.id}
                      className="flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-2 py-1 text-[0.75rem] text-[var(--dd-text-primary)]"
                    >
                      <input
                        type="checkbox"
                        checked={report.selectedStatColumnIds.includes(col.id)}
                        onChange={() => toggleStatColumnSelection(col.id)}
                        className="accent-[var(--dd-accent-teal)]"
                      />
                      <span className="truncate">{col.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Charts */}
              <div className="space-y-1.5">
                <div className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                  Visualizations ({report.selectedCharts.length}/
                  {allEditorCharts.length})
                </div>
                <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                  {allEditorCharts.map((cfg) => {
                    const key = chartKey(cfg);
                    return (
                      <label
                        key={key}
                        className="flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-2 py-1 text-[0.75rem] text-[var(--dd-text-primary)]"
                      >
                        <input
                          type="checkbox"
                          checked={selectedChartKeySet.has(key)}
                          onChange={() => toggleChartSelection(cfg)}
                          className="accent-[var(--dd-accent-teal)]"
                        />
                        <span className="truncate">{cfg.title}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Optional AI */}
              <div className="space-y-1.5 border-t border-[var(--dd-border-subtle)] pt-3">
                <div className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
                  Optional AI Sections
                </div>
                <label
                  className={cn(
                    'flex items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-2 py-1.5 text-[0.75rem]',
                    !hasValidAiBrief ? 'opacity-50' : 'cursor-pointer',
                  )}
                >
                  <input
                    type="checkbox"
                    disabled={!hasValidAiBrief}
                    checked={
                      report.aiInclusion.includeModule08Brief && hasValidAiBrief
                    }
                    onChange={(e) =>
                      onUpdateReport((curr) =>
                        updateReportSelections(
                          curr,
                          {
                            aiInclusion: {
                              ...curr.aiInclusion,
                              includeModule08Brief: e.target.checked,
                            },
                          },
                          activeSources,
                        ),
                      )
                    }
                    className="accent-[var(--dd-accent-teal)]"
                  />
                  <span>Include AI Investigation Brief</span>
                </label>

                <label
                  className={cn(
                    'flex items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-2 py-1.5 text-[0.75rem]',
                    !hasCaseAi ? 'opacity-50' : 'cursor-pointer',
                  )}
                >
                  <input
                    type="checkbox"
                    disabled={!hasCaseAi}
                    checked={
                      report.aiInclusion.includeModule09CaseAnalyses &&
                      hasCaseAi
                    }
                    onChange={(e) =>
                      onUpdateReport((curr) =>
                        updateReportSelections(
                          curr,
                          {
                            aiInclusion: {
                              ...curr.aiInclusion,
                              includeModule09CaseAnalyses: e.target.checked,
                            },
                          },
                          activeSources,
                        ),
                      )
                    }
                    className="accent-[var(--dd-accent-teal)]"
                  />
                  <span>Include Case AI Analyses</span>
                </label>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
