import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  buildColumnEvidenceItem,
  buildFindingEvidenceItem,
  buildStatisticEvidenceItem,
  buildVisualizationEvidenceItem,
  isSafeCaseDestinationUrl,
} from '@/engine/cases';
import { generateChartRecommendations } from '@/engine/visualization';
import type {
  CaseEvidenceItem,
  CaseEvidenceType,
  DatasetInsight,
  DatasetProfileSummary,
  DatasetStatisticalSummary,
  InvestigationCase,
} from '@/types';
import { cn, formatCount } from '@/utils';
import { EVIDENCE_TYPE_META, formatCaseTimestamp } from './caseLabels';

interface CaseEvidenceBoardProps {
  readonly caseItem: InvestigationCase;
  readonly isDatasetMatched: boolean;
  readonly profile: DatasetProfileSummary | null;
  readonly stats: DatasetStatisticalSummary | null;
  readonly insights: readonly DatasetInsight[];
  readonly onAddEvidence: (item: CaseEvidenceItem) => boolean;
  readonly onRemoveEvidence: (evidenceId: string) => void;
}

type PickerTab = 'finding' | 'column' | 'statistic' | 'visualization';

/**
 * Module 09 — Verified Evidence Board.
 * Stores aggregate-only references and validated deep links into existing modules
 * without ever copying raw spreadsheet rows or mutating source findings.
 */
export function CaseEvidenceBoard({
  caseItem,
  isDatasetMatched,
  profile,
  stats,
  insights,
  onAddEvidence,
  onRemoveEvidence,
}: CaseEvidenceBoardProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<PickerTab>('finding');

  const existingKeys = useMemo(
    () => new Set(caseItem.evidence.map((e) => `${e.type}:${e.sourceRef}`)),
    [caseItem.evidence],
  );

  const attachedFindingIds = useMemo(
    () => new Set(caseItem.findingIds),
    [caseItem.findingIds],
  );

  const chartCandidates = useMemo(() => {
    if (!profile || !stats || !isDatasetMatched) return [];
    const recs = generateChartRecommendations(profile, stats);
    return recs.slice(0, 12).map((rec) => ({
      chartLink: {
        chartType: rec.type,
        xColumnId: rec.xColumnId,
        ...(rec.yColumnId ? { yColumnId: rec.yColumnId } : {}),
        title: rec.title,
      },
      rationale: rec.reason,
      sourceRef: rec.yColumnId
        ? `chart:${rec.type}:${rec.xColumnId}:${rec.yColumnId}`
        : `chart:${rec.type}:${rec.xColumnId}`,
    }));
  }, [profile, stats, isDatasetMatched]);

  const handleAttachFinding = (
    finding: DatasetInsight,
    asRelated: boolean,
  ) => {
    const item = buildFindingEvidenceItem(finding, Date.now(), asRelated);
    onAddEvidence(item);
  };

  const handleAttachColumn = (columnId: string) => {
    if (!profile) return;
    const col = profile.columns.find((c) => c.columnId === columnId);
    if (!col) return;
    onAddEvidence(buildColumnEvidenceItem(col, Date.now()));
  };

  const handleAttachStatistic = (columnId: string) => {
    if (!profile || !stats) return;
    const col = profile.columns.find((c) => c.columnId === columnId);
    if (!col) return;
    onAddEvidence(buildStatisticEvidenceItem(col, stats, Date.now()));
  };

  const handleAttachVisualization = (candidate: (typeof chartCandidates)[number]) => {
    onAddEvidence(
      buildVisualizationEvidenceItem(
        candidate.chartLink,
        candidate.rationale,
        Date.now(),
      ),
    );
  };

  return (
    <section
      data-testid="case-evidence-board"
      aria-label="Verified evidence board"
      className="dd-surface-primary space-y-4 p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--dd-border-subtle)] pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-status-verified)]">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              Verified Evidence Board · {formatCount(caseItem.evidence.length)}{' '}
              {caseItem.evidence.length === 1 ? 'Reference' : 'References'}
            </span>
          </div>
          <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
            Deterministic findings, columns, statistical baselines, and charts
            attached by reference only (0 raw rows copied).
          </p>
        </div>

        <button
          type="button"
          data-testid="toggle-add-evidence-button"
          disabled={!isDatasetMatched || !profile}
          onClick={() => setShowPicker((prev) => !prev)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
        >
          {showPicker ? (
            <>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Close Evidence Picker</span>
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add Evidence</span>
            </>
          )}
        </button>
      </header>

      {/* Interactive Evidence Picker */}
      {showPicker && isDatasetMatched && profile && (
        <div
          data-testid="case-evidence-picker"
          className="space-y-3 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] p-4"
        >
          <div
            role="tablist"
            aria-label="Evidence source type"
            className="flex flex-wrap items-center gap-1.5"
          >
            {(
              [
                ['finding', `Findings (${insights.length})`],
                ['column', `Columns (${profile.columns.length})`],
                ['statistic', `Statistics (${profile.columns.length})`],
                ['visualization', `Charts (${chartCandidates.length})`],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={pickerTab === tab}
                onClick={() => setPickerTab(tab)}
                className={cn(
                  'cursor-pointer rounded-[var(--dd-radius-sm)] border px-2.5 py-1 font-mono text-[0.75rem] transition-colors whitespace-nowrap',
                  pickerTab === tab
                    ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-text-primary)]'
                    : 'border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)]',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-60 divide-y divide-[var(--dd-border-subtle)] overflow-y-auto rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)]">
            {pickerTab === 'finding' &&
              (insights.length === 0 ? (
                <p className="p-3 text-[0.8125rem] text-[var(--dd-text-muted)]">
                  No deterministic findings available for this dataset.
                </p>
              ) : (
                insights.map((finding) => {
                  const isAttached = attachedFindingIds.has(finding.id);
                  const hasPrimary = caseItem.findingIds.length > 0;
                  return (
                    <div
                      key={finding.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="truncate text-[0.8125rem] font-medium text-[var(--dd-text-primary)]">
                          {finding.title}
                        </div>
                        <div className="font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
                          {finding.id} · {finding.severity} ·{' '}
                          {finding.affectedColumnNames.join(', ') || 'Dataset'}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isAttached}
                        onClick={() =>
                          handleAttachFinding(finding, hasPrimary)
                        }
                        className="shrink-0 cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1 font-mono text-[0.75rem] text-[var(--dd-text-primary)] hover:border-[var(--dd-accent-teal-border)] disabled:cursor-default disabled:opacity-45 whitespace-nowrap"
                      >
                        {isAttached
                          ? 'Attached'
                          : hasPrimary
                            ? 'Attach Related'
                            : 'Attach Finding'}
                      </button>
                    </div>
                  );
                })
              ))}

            {pickerTab === 'column' &&
              profile.columns.map((col) => {
                const isAttached = existingKeys.has(`column:${col.columnId}`);
                return (
                  <div
                    key={col.columnId}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="truncate text-[0.8125rem] font-medium text-[var(--dd-text-primary)]">
                        {col.name}
                      </div>
                      <div className="font-mono text-[0.6875rem] text-[var(--dd-text-muted)] dd-tabular">
                        {col.detectedType} · {col.missingPercentage.toFixed(1)}%
                        missing · {formatCount(col.uniqueCount)} unique
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isAttached}
                      onClick={() => handleAttachColumn(col.columnId)}
                      className="shrink-0 cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1 font-mono text-[0.75rem] text-[var(--dd-text-primary)] hover:border-[var(--dd-accent-teal-border)] disabled:cursor-default disabled:opacity-45 whitespace-nowrap"
                    >
                      {isAttached ? 'Attached' : 'Attach Column'}
                    </button>
                  </div>
                );
              })}

            {pickerTab === 'statistic' &&
              profile.columns.map((col) => {
                const isAttached = existingKeys.has(
                  `statistic:stat:${col.columnId}`,
                );
                return (
                  <div
                    key={col.columnId}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="truncate text-[0.8125rem] font-medium text-[var(--dd-text-primary)]">
                        Statistical Summary: {col.name}
                      </div>
                      <div className="font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
                        Statistical baseline · {col.detectedType}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isAttached || !stats}
                      onClick={() => handleAttachStatistic(col.columnId)}
                      className="shrink-0 cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1 font-mono text-[0.75rem] text-[var(--dd-text-primary)] hover:border-[var(--dd-accent-teal-border)] disabled:cursor-default disabled:opacity-45 whitespace-nowrap"
                    >
                      {isAttached ? 'Attached' : 'Attach Summary'}
                    </button>
                  </div>
                );
              })}

            {pickerTab === 'visualization' &&
              (chartCandidates.length === 0 ? (
                <p className="p-3 text-[0.8125rem] text-[var(--dd-text-muted)]">
                  No schema-validated chart recommendations available.
                </p>
              ) : (
                chartCandidates.map((cand) => {
                  const isAttached = existingKeys.has(
                    `visualization:${cand.sourceRef}`,
                  );
                  return (
                    <div
                      key={cand.sourceRef}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="truncate text-[0.8125rem] font-medium text-[var(--dd-text-primary)]">
                          {cand.chartLink.title}
                        </div>
                        <div className="truncate font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
                          {cand.chartLink.chartType} · {cand.rationale}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isAttached}
                        onClick={() => handleAttachVisualization(cand)}
                        className="shrink-0 cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1 font-mono text-[0.75rem] text-[var(--dd-text-primary)] hover:border-[var(--dd-accent-teal-border)] disabled:cursor-default disabled:opacity-45 whitespace-nowrap"
                      >
                        {isAttached ? 'Attached' : 'Attach Chart'}
                      </button>
                    </div>
                  );
                })
              ))}
          </div>
        </div>
      )}

      {/* Attached Evidence List */}
      {caseItem.evidence.length === 0 ? (
        <div
          data-testid="case-evidence-empty"
          className="rounded-[var(--dd-radius-sm)] border border-dashed border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] p-5 text-center text-[0.8125rem] text-[var(--dd-text-secondary)]"
        >
          No evidence items attached yet. Use{' '}
          <span className="font-medium text-[var(--dd-text-primary)]">
            Add Evidence
          </span>{' '}
          to reference deterministic findings, columns, statistical summaries,
          or visualization charts.
        </div>
      ) : (
        <div className="divide-y divide-[var(--dd-border-subtle)] rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)]">
          {caseItem.evidence.map((item) => {
            const typeMeta =
              EVIDENCE_TYPE_META[item.type as CaseEvidenceType] ??
              EVIDENCE_TYPE_META.finding;
            const canNavigate =
              isDatasetMatched && isSafeCaseDestinationUrl(item.destinationUrl);

            return (
              <article
                key={item.id}
                data-testid={`evidence-item-${item.id}`}
                data-evidence-type={item.type}
                className="flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-text-muted)] dd-tabular">
                    <span className="font-semibold text-[var(--dd-status-verified)]">
                      VERIFIED · {typeMeta.label}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Ref: {item.sourceRef}</span>
                    <span aria-hidden="true">·</span>
                    <span>Added {formatCaseTimestamp(item.addedAt)}</span>
                  </div>

                  <h4 className="text-[0.875rem] font-semibold text-[var(--dd-text-primary)]">
                    {item.title}
                  </h4>

                  <p className="text-[0.8125rem] leading-relaxed text-[var(--dd-text-secondary)]">
                    {item.description}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {canNavigate ? (
                    <Link
                      to={item.destinationUrl}
                      className="inline-flex items-center gap-1 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2.5 py-1.5 font-mono text-[0.75rem] text-[var(--dd-accent-teal)] transition-colors hover:border-[var(--dd-accent-teal-border)] whitespace-nowrap"
                    >
                      <span>{typeMeta.actionLabel}</span>
                      <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  ) : (
                    <span className="font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
                      Previous dataset ref
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => onRemoveEvidence(item.id)}
                    aria-label={`Remove evidence ${item.title}`}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] px-2 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-muted)] transition-colors hover:border-[var(--dd-status-anomaly-border)] hover:text-[var(--dd-status-anomaly)] whitespace-nowrap"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    <span>Remove</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
