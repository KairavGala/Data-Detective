import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Check,
  Edit3,
  FileText,
  RotateCcw,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import type {
  AiBriefGenerationData,
  CaseAiAnalysisRecord,
  CaseEvidenceItem,
  CaseNoteType,
  DatasetInsight,
  DatasetInvestigationSummary,
  DatasetProfileSummary,
  DatasetStatisticalSummary,
  InvestigationCase,
  InvestigationCasePriority,
  InvestigationCaseStatus,
} from '@/types';
import { cn, formatCount } from '@/utils';
import { CaseAiAnalysisPanel } from './CaseAiAnalysisPanel';
import { CaseEvidenceBoard } from './CaseEvidenceBoard';
import { CaseJournalPanel } from './CaseJournalPanel';
import { CaseTimelinePanel } from './CaseTimelinePanel';
import {
  CASE_PRIORITY_META,
  CASE_PRIORITY_ORDER,
  CASE_STATUS_META,
  CASE_STATUS_ORDER,
  formatCaseTimestamp,
} from './caseLabels';

interface CaseDetailViewProps {
  readonly caseItem: InvestigationCase;
  readonly activeDatasetId: string | null;
  readonly activeDatasetFileName: string | null;
  readonly profile: DatasetProfileSummary | null;
  readonly stats: DatasetStatisticalSummary | null;
  readonly investigation: DatasetInvestigationSummary | null;
  readonly existingBrief: {
    readonly datasetId: string;
    readonly profiledAt: number;
    readonly data: AiBriefGenerationData;
  } | null;
  readonly onBackToOverview: () => void;
  readonly onUpdateDetails: (updates: {
    readonly title?: string;
    readonly description?: string;
    readonly conclusion?: string;
  }) => void;
  readonly onChangeStatus: (status: InvestigationCaseStatus) => void;
  readonly onChangePriority: (priority: InvestigationCasePriority) => void;
  readonly onArchive: () => void;
  readonly onReopen: () => void;
  readonly onAddEvidence: (item: CaseEvidenceItem) => boolean;
  readonly onRemoveEvidence: (evidenceId: string) => void;
  readonly onAddNote: (input: {
    readonly type: CaseNoteType;
    readonly text: string;
    readonly supportingEvidenceIds?: readonly string[];
  }) => void;
  readonly onEditNote: (
    noteId: string,
    updates: {
      readonly type?: CaseNoteType;
      readonly text?: string;
      readonly supportingEvidenceIds?: readonly string[];
    },
  ) => void;
  readonly onDeleteNote: (noteId: string) => void;
  readonly onRecordAiAnalysis: (record: CaseAiAnalysisRecord) => boolean;
}

/**
 * Module 09 — Single Investigation Case Dossier Workspace.
 */
export function CaseDetailView({
  caseItem,
  activeDatasetId,
  activeDatasetFileName,
  profile,
  stats,
  investigation,
  existingBrief,
  onBackToOverview,
  onUpdateDetails,
  onChangeStatus,
  onChangePriority,
  onArchive,
  onReopen,
  onAddEvidence,
  onRemoveEvidence,
  onAddNote,
  onEditNote,
  onDeleteNote,
  onRecordAiAnalysis,
}: CaseDetailViewProps) {
  const [editingMeta, setEditingMeta] = useState(false);
  const [titleDraft, setTitleDraft] = useState(caseItem.title);
  const [descriptionDraft, setDescriptionDraft] = useState(caseItem.description);

  useEffect(() => {
    setTitleDraft(caseItem.title);
    setDescriptionDraft(caseItem.description);
    setEditingMeta(false);
  }, [caseItem.id, caseItem.title, caseItem.description]);

  const isDatasetMatched =
    activeDatasetId !== null && caseItem.datasetId === activeDatasetId;
  const statusMeta = CASE_STATUS_META[caseItem.status];
  const priorityMeta = CASE_PRIORITY_META[caseItem.priority];
  const insights: readonly DatasetInsight[] = isDatasetMatched
    ? (investigation?.insights ?? [])
    : [];

  const handleSaveMeta = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleDraft.trim()) return;
    onUpdateDetails({
      title: titleDraft.trim(),
      description: descriptionDraft.trim(),
    });
    setEditingMeta(false);
  };

  return (
    <div
      data-testid="investigation-case-detail"
      data-case-id={caseItem.id}
      className="dd-anim-file-enter space-y-6"
    >
      {/* Breadcrumb & Case Action Header */}
      <section className="dd-surface-primary space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            data-testid="back-to-overview-button"
            onClick={onBackToOverview}
            className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-[0.75rem] text-[var(--dd-accent-teal)] hover:text-[var(--dd-accent-teal-hover)] whitespace-nowrap"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to Investigation Overview</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <DossierLabel
              code={caseItem.id}
              label={caseItem.archived ? 'Archived Case' : 'Active Case Dossier'}
            />
            <StatusIndicator
              tone={
                caseItem.archived
                  ? 'neutral'
                  : caseItem.status === 'resolved'
                    ? 'verified'
                    : caseItem.priority === 'critical' ||
                        caseItem.priority === 'high'
                      ? 'warning'
                      : 'analytical'
              }
              label={
                caseItem.archived
                  ? 'Archived'
                  : `${statusMeta.label} · ${priorityMeta.label}`
              }
            />
          </div>
        </div>

        {/* Previous Dataset Mismatch Warning */}
        {!isDatasetMatched && (
          <div
            role="alert"
            data-testid="case-dataset-mismatch-banner"
            className="flex items-start gap-3 rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-warning-border)] bg-[var(--dd-surface-recessed)] px-4 py-3 text-[0.8125rem] text-[var(--dd-text-secondary)]"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--dd-status-warning)]"
              aria-hidden="true"
            />
            <div className="space-y-0.5">
              <div className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-status-warning)]">
                Previous Dataset Case · Identity Mismatch
              </div>
              <p>
                This case originated from{' '}
                <strong className="text-[var(--dd-text-primary)]">
                  {caseItem.datasetFileName}
                </strong>
                {activeDatasetFileName
                  ? ` (active dataset is ${activeDatasetFileName})`
                  : ' (no active dataset is loaded)'}
                . Evidence references are preserved unchanged and new
                findings/AI analysis are locked to prevent cross-dataset mixing.
              </p>
            </div>
          </div>
        )}

        {/* Title & Description (View or Edit Mode) */}
        {editingMeta ? (
          <form onSubmit={handleSaveMeta} className="space-y-3">
            <div className="space-y-1">
              <label
                htmlFor="edit-case-title"
                className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]"
              >
                Case Title
              </label>
              <input
                id="edit-case-title"
                type="text"
                required
                maxLength={140}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-2 text-[0.9375rem] font-medium text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="edit-case-description"
                className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]"
              >
                Case Description
              </label>
              <textarea
                id="edit-case-description"
                rows={2}
                maxLength={500}
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-2 text-[0.84375rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3.5 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-primary)]"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Save Changes</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(caseItem.title);
                  setDescriptionDraft(caseItem.description);
                  setEditingMeta(false);
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-3 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-secondary)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Cancel</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1.5">
              <h2 className="text-[1.25rem] font-semibold tracking-[-0.02em] text-[var(--dd-text-primary)]">
                {caseItem.title}
              </h2>
              <p className="max-w-3xl text-[0.875rem] leading-relaxed text-[var(--dd-text-secondary)]">
                {caseItem.description ||
                  'No short description recorded yet. Edit case details to define the investigation scope.'}
              </p>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[0.6875rem] text-[var(--dd-text-muted)] dd-tabular">
                <span>Dataset: {caseItem.datasetFileName}</span>
                <span aria-hidden="true">·</span>
                <span>Created {formatCaseTimestamp(caseItem.createdAt)}</span>
                <span aria-hidden="true">·</span>
                <span>Updated {formatCaseTimestamp(caseItem.updatedAt)}</span>
              </div>
            </div>

            {/* Case Lifecycle Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {isDatasetMatched && (
                <Link
                  to={`/reports?source=case&caseId=${encodeURIComponent(caseItem.id)}`}
                  data-testid="case-create-report-link"
                  className="inline-flex items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3 py-1.5 font-mono text-[0.75rem] font-medium text-[var(--dd-text-primary)] hover:bg-[var(--dd-accent-teal)]/20 whitespace-nowrap"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Create Report</span>
                </Link>
              )}

              <button
                type="button"
                onClick={() => setEditingMeta(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-primary)] hover:border-[var(--dd-accent-teal-border)] whitespace-nowrap"
              >
                <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Edit Details</span>
              </button>

              <select
                aria-label="Case status"
                value={caseItem.status}
                onChange={(e) =>
                  onChangeStatus(e.target.value as InvestigationCaseStatus)
                }
                className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
              >
                {CASE_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    Status: {CASE_STATUS_META[s].label}
                  </option>
                ))}
              </select>

              <select
                aria-label="Case priority"
                value={caseItem.priority}
                onChange={(e) =>
                  onChangePriority(e.target.value as InvestigationCasePriority)
                }
                className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
              >
                {CASE_PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>
                    Priority: {CASE_PRIORITY_META[p].label}
                  </option>
                ))}
              </select>

              {caseItem.archived ? (
                <button
                  type="button"
                  onClick={onReopen}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-primary)] whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Reopen Case</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onArchive}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-secondary)] hover:border-[var(--dd-status-warning-border)] hover:text-[var(--dd-text-primary)] whitespace-nowrap"
                >
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Archive Case</span>
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Main 2-Column Case Dossier Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <CaseEvidenceBoard
            caseItem={caseItem}
            isDatasetMatched={isDatasetMatched}
            profile={isDatasetMatched ? profile : null}
            stats={isDatasetMatched ? stats : null}
            insights={insights}
            onAddEvidence={onAddEvidence}
            onRemoveEvidence={onRemoveEvidence}
          />

          <CaseJournalPanel
            caseItem={caseItem}
            onAddNote={onAddNote}
            onEditNote={onEditNote}
            onDeleteNote={onDeleteNote}
            onUpdateConclusion={(conclusion) => onUpdateDetails({ conclusion })}
          />

          <CaseAiAnalysisPanel
            caseItem={caseItem}
            isDatasetMatched={isDatasetMatched}
            profile={isDatasetMatched ? profile : null}
            stats={isDatasetMatched ? stats : null}
            investigation={isDatasetMatched ? investigation : null}
            existingBrief={isDatasetMatched ? existingBrief : null}
            onRecordAnalysis={onRecordAiAnalysis}
            onSaveHypothesisDraft={(text) =>
              onAddNote({ type: 'hypothesis', text })
            }
          />
        </div>

        <aside className="space-y-6 lg:col-span-4">
          {/* Case Telemetry Summary */}
          <section className="dd-surface-primary space-y-3 p-5">
            <h3 className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
              Case Summary
            </h3>
            <dl className="grid grid-cols-2 gap-3 font-mono text-[0.75rem] dd-tabular">
              <div>
                <dt className="text-[0.625rem] uppercase text-[var(--dd-text-muted)]">
                  Status
                </dt>
                <dd className={cn('font-semibold', statusMeta.textClass)}>
                  {statusMeta.label}
                </dd>
              </div>
              <div>
                <dt className="text-[0.625rem] uppercase text-[var(--dd-text-muted)]">
                  Priority
                </dt>
                <dd className={cn('font-semibold', priorityMeta.textClass)}>
                  {priorityMeta.label}
                </dd>
              </div>
              <div>
                <dt className="text-[0.625rem] uppercase text-[var(--dd-text-muted)]">
                  Findings Linked
                </dt>
                <dd className="text-[var(--dd-text-primary)]">
                  {formatCount(caseItem.findingIds.length)}
                </dd>
              </div>
              <div>
                <dt className="text-[0.625rem] uppercase text-[var(--dd-text-muted)]">
                  Evidence Items
                </dt>
                <dd className="text-[var(--dd-text-primary)]">
                  {formatCount(caseItem.evidence.length)}
                </dd>
              </div>
              <div>
                <dt className="text-[0.625rem] uppercase text-[var(--dd-text-muted)]">
                  Journal Notes
                </dt>
                <dd className="text-[var(--dd-text-primary)]">
                  {formatCount(caseItem.notes.length)}
                </dd>
              </div>
              <div>
                <dt className="text-[0.625rem] uppercase text-[var(--dd-text-muted)]">
                  AI Analyses
                </dt>
                <dd className="text-[var(--dd-text-primary)]">
                  {formatCount(caseItem.aiAnalyses.length)}
                </dd>
              </div>
            </dl>
          </section>

          <CaseTimelinePanel timeline={caseItem.timeline} />
        </aside>
      </div>
    </div>
  );
}
