import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { buildCaseAiRequest } from '@/engine/cases';
import {
  AiInvestigationClientError,
  fetchAiHealth,
  requestCaseAnalysis,
} from '@/features/assistant/aiInvestigationClient';
import { buildExplorerColumnUrl } from './investigationLabels';
import {
  AI_SUPPORT_TYPE_LABELS,
  formatCaseTimestamp,
} from './caseLabels';
import type {
  AiBriefGenerationData,
  AiHealthStatus,
  CaseAiAnalysisRecord,
  DatasetInvestigationSummary,
  DatasetProfileSummary,
  DatasetStatisticalSummary,
  InvestigationCase,
} from '@/types';
import { cn, formatCount } from '@/utils';

interface CaseAiAnalysisPanelProps {
  readonly caseItem: InvestigationCase;
  readonly isDatasetMatched: boolean;
  readonly profile: DatasetProfileSummary | null;
  readonly stats: DatasetStatisticalSummary | null;
  readonly investigation: DatasetInvestigationSummary | null;
  readonly existingBrief: {
    readonly datasetId: string;
    readonly profiledAt: number;
    readonly data: AiBriefGenerationData;
  } | null;
  readonly onRecordAnalysis: (record: CaseAiAnalysisRecord) => boolean;
  readonly onSaveHypothesisDraft: (text: string) => void;
}

/**
 * Module 09 — AI-Assisted Case Investigation Panel.
 * Reuses the Module 08 `/api/ai/investigate` backend (`mode: 'case'`) with
 * strictly bounded aggregate-only evidence. Never sends raw spreadsheet rows
 * and never auto-promotes AI interpretations into verified evidence.
 */
export function CaseAiAnalysisPanel({
  caseItem,
  isDatasetMatched,
  profile,
  stats,
  investigation,
  existingBrief,
  onRecordAnalysis,
  onSaveHypothesisDraft,
}: CaseAiAnalysisPanelProps) {
  const [healthStatus, setHealthStatus] = useState<AiHealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(true);
  const [questionInput, setQuestionInput] = useState<string>('');
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [errorState, setErrorState] = useState<{
    readonly code: string;
    readonly message: string;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef<boolean>(false);

  const loadHealth = useCallback(() => {
    const controller = new AbortController();
    setHealthLoading(true);
    void fetchAiHealth(controller.signal)
      .then((status) => {
        if (controller.signal.aborted) return;
        setHealthStatus(status);
        setHealthLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setHealthStatus(null);
        setHealthLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    return loadHealth();
  }, [loadHealth]);

  // Abort any in-flight case analysis when switching cases or changing datasets
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      inFlightRef.current = false;
    };
  }, [caseItem.id, profile?.datasetId]);

  const isServiceAvailable =
    healthStatus !== null &&
    healthStatus.configured &&
    healthStatus.investigationEnabled;

  const canAnalyze =
    isDatasetMatched &&
    Boolean(profile && stats && investigation) &&
    isServiceAvailable &&
    !analyzing;

  const handleAnalyzeCase = () => {
    if (!canAnalyze || !profile || !stats || !investigation) return;
    if (inFlightRef.current) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;
    setAnalyzing(true);
    setErrorState(null);

    const askedQuestion =
      questionInput.trim() ||
      'Evaluate the selected evidence, possible connections, alternative explanations, supported conclusions, and unanswered questions.';

    let built;
    try {
      built = buildCaseAiRequest({
        caseItem,
        profile,
        stats,
        investigation,
        userQuestion: questionInput.trim() || undefined,
        existingBrief,
      });
    } catch (err: unknown) {
      inFlightRef.current = false;
      setAnalyzing(false);
      setErrorState({
        code: 'DATASET_MISMATCH',
        message:
          err instanceof Error
            ? err.message
            : 'Unable to prepare aggregate case context.',
      });
      return;
    }

    void requestCaseAnalysis(
      {
        context: built.context,
        caseInfo: built.caseInfo,
      },
      controller.signal,
    )
      .then((res) => {
        if (controller.signal.aborted) return;
        const record: CaseAiAnalysisRecord = {
          id: `ai-case-${Date.now()}`,
          generatedAt: res.meta.generatedAt,
          question: askedQuestion,
          model: res.meta.model,
          durationMs: res.meta.durationMs,
          contextCharCount: res.meta.contextCharCount,
          data: res.data,
        };
        onRecordAnalysis(record);
        setQuestionInput('');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof AiInvestigationClientError) {
          setErrorState({ code: err.code, message: err.message });
        } else {
          setErrorState({
            code: 'UPSTREAM_ERROR',
            message: 'Unable to analyze this investigation case.',
          });
        }
      })
      .finally(() => {
        if (abortRef.current === controller) {
          inFlightRef.current = false;
          setAnalyzing(false);
        }
      });
  };

  const columnNameById = new Map(
    profile?.columns.map((c) => [c.columnId, c.name]) ?? [],
  );

  return (
    <section
      data-testid="case-ai-analysis-panel"
      aria-label="AI-assisted case investigation"
      className="dd-surface-primary space-y-4 p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--dd-border-subtle)] pb-3.5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-status-warning)]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>AI Case Interpretation · Aggregate Analysis</span>
          </div>
          <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
            Sends only aggregate statistics, schema metadata, and selected
            finding summaries. Outputs are labeled as interpretation or
            hypothesis and are never promoted into verified evidence.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
          <Lock
            className="h-3.5 w-3.5 text-[var(--dd-status-verified)]"
            aria-hidden="true"
          />
          <span>0 raw rows sent</span>
        </div>
      </header>

      {!isDatasetMatched && (
        <div
          role="alert"
          data-testid="case-ai-dataset-mismatch"
          className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-warning-border)] bg-[var(--dd-surface-recessed)] px-3.5 py-2.5 text-[0.8125rem] text-[var(--dd-text-secondary)]"
        >
          AI case analysis is unavailable because this case belongs to a
          previous dataset ({caseItem.datasetFileName}).
        </div>
      )}

      {isDatasetMatched && !healthLoading && !isServiceAvailable && (
        <div
          role="alert"
          data-testid="case-ai-unavailable"
          className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-warning-border)] bg-[var(--dd-surface-recessed)] px-3.5 py-2.5 text-[0.8125rem] text-[var(--dd-text-secondary)]"
        >
          <span>
            Server-side Gemini investigation service is currently unavailable.
            Deterministic case management remains fully operational.
          </span>
          <button
            type="button"
            onClick={loadHealth}
            className="inline-flex cursor-pointer items-center gap-1 font-mono text-[0.75rem] text-[var(--dd-accent-teal)]"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            <span>Recheck</span>
          </button>
        </div>
      )}

      {/* Optional question + Analyze trigger */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <input
          type="text"
          aria-label="Focused case investigation question"
          maxLength={600}
          disabled={!isDatasetMatched || analyzing}
          value={questionInput}
          onChange={(e) => setQuestionInput(e.target.value)}
          placeholder="Optional question (e.g. Could missing region values explain the revenue skew?)…"
          className="flex-1 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-2 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none placeholder:text-[var(--dd-text-muted)] focus:border-[var(--dd-accent-teal-border)] disabled:opacity-50"
        />
        <button
          type="button"
          data-testid="analyze-case-button"
          disabled={!canAnalyze}
          onClick={handleAnalyzeCase}
          className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-4 py-2 font-mono text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
        >
          {analyzing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <span>Analyzing Investigation…</span>
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Analyze this investigation</span>
            </>
          )}
        </button>
      </div>

      {errorState && (
        <div
          role="alert"
          data-testid="case-ai-error-banner"
          className="flex items-start gap-2.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-anomaly-border)] bg-[var(--dd-surface-recessed)] px-3.5 py-2.5 text-[0.8125rem] text-[var(--dd-text-secondary)]"
        >
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--dd-status-anomaly)]"
            aria-hidden="true"
          />
          <span>
            <strong className="font-mono text-[0.75rem] text-[var(--dd-status-anomaly)]">
              {errorState.code}:{' '}
            </strong>
            {errorState.message}
          </span>
        </div>
      )}

      {/* Recorded AI Interpretations */}
      {caseItem.aiAnalyses.length === 0 ? (
        <p className="rounded-[var(--dd-radius-sm)] border border-dashed border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-4 text-center text-[0.8125rem] text-[var(--dd-text-muted)]">
          No AI case interpretation generated yet. Click{' '}
          <span className="font-medium text-[var(--dd-text-primary)]">
            Analyze this investigation
          </span>{' '}
          to evaluate the attached aggregate findings and open questions.
        </p>
      ) : (
        <div className="space-y-4">
          {caseItem.aiAnalyses.map((record) => {
            const supportMeta = AI_SUPPORT_TYPE_LABELS[record.data.supportType];
            return (
              <article
                key={record.id}
                data-testid={`case-ai-record-${record.id}`}
                className="space-y-4 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--dd-border-subtle)] pb-2.5 font-mono text-[0.6875rem] uppercase tracking-[0.07em] dd-tabular">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--dd-status-warning)]">
                      AI INTERPRETATION / HYPOTHESIS (NOT VERIFIED EVIDENCE)
                    </span>
                    <span className="text-[var(--dd-text-muted)]" aria-hidden="true">
                      ·
                    </span>
                    <span className={cn('font-semibold', supportMeta.textClass)}>
                      {supportMeta.label}
                    </span>
                  </div>
                  <span className="text-[var(--dd-text-muted)]">
                    {record.model} · {formatCount(record.durationMs)} ms ·{' '}
                    {formatCaseTimestamp(record.generatedAt)}
                  </span>
                </div>

                {/* 1. What selected evidence suggests */}
                <div className="space-y-1">
                  <h4 className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-text-muted)]">
                    What Selected Evidence Suggests
                  </h4>
                  <p className="text-[0.84375rem] leading-relaxed text-[var(--dd-text-primary)]">
                    {record.data.evidenceAssessment}
                  </p>
                </div>

                {/* 2-6 Structured Grid */}
                <div className="grid grid-cols-1 gap-4 border-t border-[var(--dd-border-subtle)] pt-3.5 md:grid-cols-2">
                  {record.data.possibleConnections.length > 0 && (
                    <div className="space-y-1.5">
                      <h5 className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-status-warning)]">
                        Possible Connections (Hypotheses)
                      </h5>
                      <ul className="list-disc space-y-1 pl-4 text-[0.8125rem] text-[var(--dd-text-secondary)]">
                        {record.data.possibleConnections.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {record.data.alternativeExplanations.length > 0 && (
                    <div className="space-y-1.5">
                      <h5 className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-text-muted)]">
                        Alternative Explanations
                      </h5>
                      <ul className="list-disc space-y-1 pl-4 text-[0.8125rem] text-[var(--dd-text-secondary)]">
                        {record.data.alternativeExplanations.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {record.data.supportedConclusions.length > 0 && (
                    <div className="space-y-1.5">
                      <h5 className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-status-verified)]">
                        Supported Aggregate Conclusions
                      </h5>
                      <ul className="list-disc space-y-1 pl-4 text-[0.8125rem] text-[var(--dd-text-secondary)]">
                        {record.data.supportedConclusions.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {record.data.additionalEvidenceToExamine.length > 0 && (
                    <div className="space-y-1.5">
                      <h5 className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-accent-teal)]">
                        Additional Evidence to Examine
                      </h5>
                      <ul className="list-disc space-y-1 pl-4 text-[0.8125rem] text-[var(--dd-text-secondary)]">
                        {record.data.additionalEvidenceToExamine.map(
                          (line, i) => (
                            <li key={i}>{line}</li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}

                  {record.data.unansweredQuestions.length > 0 && (
                    <div className="space-y-1.5 md:col-span-2">
                      <h5 className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-status-anomaly)]">
                        Unanswered Questions
                      </h5>
                      <ul className="list-disc space-y-1 pl-4 text-[0.8125rem] text-[var(--dd-text-secondary)]">
                        {record.data.unansweredQuestions.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* References & Explicit Save-as-Unverified-Hypothesis Action */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--dd-border-subtle)] pt-3">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
                    {record.data.referencedFindingIds.map((fid) => (
                      <Link
                        key={fid}
                        to={`/investigation?finding=${encodeURIComponent(fid)}`}
                        className="inline-flex items-center gap-1 text-[var(--dd-accent-teal)] hover:text-[var(--dd-accent-teal-hover)]"
                      >
                        <span>{fid}</span>
                        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    ))}
                    {record.data.referencedColumnIds.map((cid) => (
                      <Link
                        key={cid}
                        to={buildExplorerColumnUrl(cid)}
                        className="inline-flex items-center gap-1 text-[var(--dd-text-secondary)] hover:text-[var(--dd-accent-teal)]"
                      >
                        <span>{columnNameById.get(cid) ?? cid}</span>
                        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onSaveHypothesisDraft(
                        `[AI-assisted hypothesis — unverified] ${record.data.evidenceAssessment}`,
                      )
                    }
                    className="inline-flex cursor-pointer items-center gap-1 font-mono text-[0.75rem] text-[var(--dd-status-warning)] hover:underline whitespace-nowrap"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    <span>Save as Unverified Hypothesis Note</span>
                  </button>
                </div>

                {record.data.caveats.length > 0 && (
                  <p className="font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
                    Caveats: {record.data.caveats.join(' · ')}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
