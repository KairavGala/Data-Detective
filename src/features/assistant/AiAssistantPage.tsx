import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  FileText,
  Loader2,
  Lock,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { useDataset } from '@/context/DatasetContext';
import { useOptionalInvestigation } from '@/context/InvestigationContext';
import {
  buildInvestigationContext,
  buildQuestionInvestigationContext,
  HARD_MAX_CONTEXT_CHARS,
} from '@/engine/assistant';
import { analyzeDatasetInsights } from '@/engine/investigation';
import type {
  AiBriefGenerationData,
  AiConversationTurn,
  AiDatasetQuestionHistoryItem,
  AiHealthStatus,
  AiInvestigationResponseMeta,
  DatasetInsight,
} from '@/types';
import { formatCount } from '@/utils';
import {
  AiInvestigationClientError,
  fetchAiHealth,
  requestDatasetAnswer,
  requestInvestigationBrief,
} from './aiInvestigationClient';
import { AskDatasetPanel } from './AskDatasetPanel';
import { ConnectedFindingsSection } from './ConnectedFindingsSection';
import { InvestigationBriefSection } from './InvestigationBriefSection';
import { RecommendedInvestigationsSection } from './RecommendedInvestigationsSection';

const MAX_SESSION_TURNS = 12;

interface ActiveSessionCache {
  readonly sessionKey: string;
  readonly briefData: AiBriefGenerationData | null;
  readonly briefMeta: AiInvestigationResponseMeta | null;
  readonly turns: readonly AiConversationTurn[];
}

/**
 * Strictly in-memory single-session cache (never touches localStorage/sessionStorage).
 * Retains the generated brief and Q&A thread when navigating between modules for the
 * SAME active dataset session, and immediately invalidates whenever the dataset is
 * replaced, cleared, or reprofiled.
 */
let activeSessionCache: ActiveSessionCache | null = null;

export function resetAssistantSessionCache(): void {
  activeSessionCache = null;
}

function formatGeneratedTimestamp(iso: string | undefined): string {
  if (!iso) return 'Not generated yet';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function buildCompactHistory(
  turns: readonly AiConversationTurn[],
): readonly AiDatasetQuestionHistoryItem[] {
  const messages: AiDatasetQuestionHistoryItem[] = [];
  for (const turn of turns) {
    if (turn.status !== 'answered' || !turn.answer) continue;
    messages.push({ role: 'user', content: turn.question.slice(0, 600) });
    messages.push({
      role: 'assistant',
      content: turn.answer.answer.slice(0, 600),
    });
  }
  return messages.slice(-6);
}

/**
 * Module 08 — AI Investigation & Intelligence Workspace (`/assistant`, SEC-05).
 */
export function AiAssistantPage() {
  const {
    activeDataset,
    datasetProfile,
    profilingStatus,
    profilingError,
    reprofileDataset,
    statisticalSummary,
    statisticsStatus,
    statisticsError,
    recomputeStatistics,
  } = useDataset();

  const investigationCtx = useOptionalInvestigation();
  const publishAiBrief = investigationCtx?.publishAiBrief;

  const datasetSessionKey =
    activeDataset && datasetProfile
      ? `${activeDataset.id}:${datasetProfile.profiledAt}`
      : null;

  // Deterministic M07 findings + M08 aggregate-only context
  const investigationSummary = useMemo(() => {
    if (!activeDataset || !datasetProfile || !statisticalSummary) return null;
    return analyzeDatasetInsights(
      activeDataset,
      datasetProfile,
      statisticalSummary,
    );
  }, [activeDataset, datasetProfile, statisticalSummary]);

  const briefContext = useMemo(() => {
    if (!datasetProfile || !statisticalSummary || !investigationSummary) {
      return null;
    }
    return buildInvestigationContext(
      datasetProfile,
      statisticalSummary,
      investigationSummary,
    );
  }, [datasetProfile, statisticalSummary, investigationSummary]);

  const questionContext = useMemo(() => {
    if (!datasetProfile || !statisticalSummary || !investigationSummary) {
      return null;
    }
    return buildQuestionInvestigationContext(
      datasetProfile,
      statisticalSummary,
      investigationSummary,
    );
  }, [datasetProfile, statisticalSummary, investigationSummary]);

  const findingsById = useMemo<ReadonlyMap<string, DatasetInsight>>(() => {
    if (!investigationSummary) return new Map();
    return new Map(investigationSummary.insights.map((f) => [f.id, f]));
  }, [investigationSummary]);

  // Health state (non-billable check against /api/ai/health)
  const [healthStatus, setHealthStatus] = useState<AiHealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  const loadHealth = useCallback(() => {
    const controller = new AbortController();
    setHealthLoading(true);
    setHealthError(null);

    void fetchAiHealth(controller.signal)
      .then((status) => {
        if (controller.signal.aborted) return;
        setHealthStatus(status);
        setHealthLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setHealthStatus(null);
        setHealthLoading(false);
        setHealthError(
          err instanceof Error
            ? err.message
            : 'Unable to check AI service status.',
        );
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    return loadHealth();
  }, [loadHealth]);

  // Dataset-scoped AI investigation state
  const [briefData, setBriefData] = useState<AiBriefGenerationData | null>(() =>
    datasetSessionKey && activeSessionCache?.sessionKey === datasetSessionKey
      ? activeSessionCache.briefData
      : null,
  );
  const [briefMeta, setBriefMeta] =
    useState<AiInvestigationResponseMeta | null>(() =>
      datasetSessionKey && activeSessionCache?.sessionKey === datasetSessionKey
        ? activeSessionCache.briefMeta
        : null,
    );
  const [briefLoading, setBriefLoading] = useState<boolean>(false);
  const [briefError, setBriefError] = useState<{
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  } | null>(null);

  const [turns, setTurns] = useState<readonly AiConversationTurn[]>(() =>
    datasetSessionKey && activeSessionCache?.sessionKey === datasetSessionKey
      ? activeSessionCache.turns
      : [],
  );
  const [questionInput, setQuestionInput] = useState<string>('');
  const [questionSubmitting, setQuestionSubmitting] = useState<boolean>(false);

  const briefAbortRef = useRef<AbortController | null>(null);
  const questionAbortRef = useRef<AbortController | null>(null);
  const briefInFlightRef = useRef<boolean>(false);
  const questionInFlightRef = useRef<boolean>(false);
  const currentSessionKeyRef = useRef<string | null>(datasetSessionKey);
  const turnCounterRef = useRef<number>(0);

  // Strict dataset lifecycle invalidation: replace, clear, or reprofile immediately
  // aborts in-flight requests and removes all stale dataset-specific AI state.
  useEffect(() => {
    currentSessionKeyRef.current = datasetSessionKey;
    briefAbortRef.current?.abort();
    briefAbortRef.current = null;
    questionAbortRef.current?.abort();
    questionAbortRef.current = null;
    briefInFlightRef.current = false;
    questionInFlightRef.current = false;

    setBriefLoading(false);
    setBriefError(null);
    setQuestionSubmitting(false);

    if (!datasetSessionKey) {
      activeSessionCache = null;
      setBriefData(null);
      setBriefMeta(null);
      setTurns([]);
      setQuestionInput('');
      return;
    }

    if (activeSessionCache && activeSessionCache.sessionKey === datasetSessionKey) {
      setBriefData(activeSessionCache.briefData);
      setBriefMeta(activeSessionCache.briefMeta);
      setTurns(activeSessionCache.turns);
    } else {
      activeSessionCache = null;
      setBriefData(null);
      setBriefMeta(null);
      setTurns([]);
      setQuestionInput('');
    }
  }, [datasetSessionKey]);

  // Keep in-memory single-session cache synchronized with current active dataset
  // and publish the verified brief to InvestigationContext for Module 09.
  useEffect(() => {
    if (!datasetSessionKey) return;
    if (briefData || turns.length > 0) {
      activeSessionCache = {
        sessionKey: datasetSessionKey,
        briefData,
        briefMeta,
        turns,
      };
    }
    if (briefData && activeDataset && datasetProfile && publishAiBrief) {
      publishAiBrief(
        activeDataset.id,
        datasetProfile.profiledAt,
        briefData,
        briefMeta,
      );
    }
  }, [
    datasetSessionKey,
    briefData,
    briefMeta,
    turns,
    activeDataset,
    datasetProfile,
    publishAiBrief,
  ]);

  // Abort pending requests on unmount
  useEffect(() => {
    return () => {
      briefAbortRef.current?.abort();
      questionAbortRef.current?.abort();
    };
  }, []);

  const isServiceAvailable =
    healthStatus !== null &&
    healthStatus.configured &&
    healthStatus.investigationEnabled;

  // Explicit user-triggered Brief generation (never auto-runs on render or filter changes)
  const handleGenerateBrief = useCallback(() => {
    if (!briefContext || !datasetSessionKey) return;
    if (briefInFlightRef.current) return;

    briefAbortRef.current?.abort();
    const controller = new AbortController();
    briefAbortRef.current = controller;
    briefInFlightRef.current = true;

    const targetKey = datasetSessionKey;
    setBriefLoading(true);
    setBriefError(null);

    void requestInvestigationBrief(briefContext, controller.signal)
      .then((result) => {
        if (
          controller.signal.aborted ||
          currentSessionKeyRef.current !== targetKey
        ) {
          return;
        }
        setBriefData(result.data);
        setBriefMeta(result.meta);
        setBriefError(null);
      })
      .catch((err: unknown) => {
        if (
          controller.signal.aborted ||
          currentSessionKeyRef.current !== targetKey
        ) {
          return;
        }
        if (err instanceof AiInvestigationClientError) {
          setBriefError({
            code: err.code,
            message: err.message,
            retryable: err.retryable,
          });
        } else {
          setBriefError({
            code: 'UPSTREAM_ERROR',
            message: 'Unable to generate investigation brief.',
            retryable: true,
          });
        }
      })
      .finally(() => {
        if (briefAbortRef.current === controller) {
          briefInFlightRef.current = false;
          setBriefLoading(false);
        }
      });
  }, [briefContext, datasetSessionKey]);

  // Explicit user-triggered Question submission (duplicate submission locked)
  const submitQuestionInternal = useCallback(
    (questionText: string, existingTurnId?: string) => {
      if (!questionContext || !datasetSessionKey) return;
      if (questionInFlightRef.current) return;

      const trimmed = questionText.trim();
      if (!trimmed) return;

      questionAbortRef.current?.abort();
      const controller = new AbortController();
      questionAbortRef.current = controller;
      questionInFlightRef.current = true;

      const targetKey = datasetSessionKey;
      const turnId =
        existingTurnId ?? `turn-${Date.now()}-${++turnCounterRef.current}`;

      const priorHistory = buildCompactHistory(
        existingTurnId ? turns.filter((t) => t.id !== existingTurnId) : turns,
      );

      if (existingTurnId) {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === existingTurnId
              ? {
                  ...t,
                  status: 'pending',
                  errorMessage: undefined,
                  errorCode: undefined,
                }
              : t,
          ),
        );
      } else {
        const pendingTurn: AiConversationTurn = {
          id: turnId,
          question: trimmed,
          askedAt: Date.now(),
          status: 'pending',
        };
        setTurns((prev) => [...prev.slice(-(MAX_SESSION_TURNS - 1)), pendingTurn]);
      }

      setQuestionSubmitting(true);

      void requestDatasetAnswer(
        {
          question: trimmed,
          context: questionContext,
          briefSummary: briefData?.brief.executiveSummary.slice(0, 750),
          history: priorHistory,
        },
        controller.signal,
      )
        .then((result) => {
          if (
            controller.signal.aborted ||
            currentSessionKeyRef.current !== targetKey
          ) {
            return;
          }
          setTurns((prev) =>
            prev.map((t) =>
              t.id === turnId
                ? {
                    ...t,
                    status: 'answered',
                    answer: result.data,
                    meta: result.meta,
                    errorMessage: undefined,
                    errorCode: undefined,
                  }
                : t,
            ),
          );
          // Clear input only on success; preserve user input on error
          if (!existingTurnId) {
            setQuestionInput('');
          }
        })
        .catch((err: unknown) => {
          if (
            controller.signal.aborted ||
            currentSessionKeyRef.current !== targetKey
          ) {
            return;
          }
          const code =
            err instanceof AiInvestigationClientError
              ? err.code
              : 'UPSTREAM_ERROR';
          const message =
            err instanceof Error
              ? err.message
              : 'Unable to answer dataset question.';
          const retryable =
            err instanceof AiInvestigationClientError ? err.retryable : true;

          setTurns((prev) =>
            prev.map((t) =>
              t.id === turnId
                ? {
                    ...t,
                    status: 'error',
                    errorCode: code,
                    errorMessage: message,
                    retryable,
                  }
                : t,
            ),
          );
          // Preserve failed question text in input so user can edit or retry
          if (!existingTurnId) {
            setQuestionInput(trimmed);
          }
        })
        .finally(() => {
          if (questionAbortRef.current === controller) {
            questionInFlightRef.current = false;
            setQuestionSubmitting(false);
          }
        });
    },
    [briefData, datasetSessionKey, questionContext, turns],
  );

  const handleRetryTurn = useCallback(
    (turnId: string) => {
      const target = turns.find((t) => t.id === turnId);
      if (!target) return;
      submitQuestionInternal(target.question, turnId);
    },
    [submitQuestionInternal, turns],
  );

  const handleClearConversation = useCallback(() => {
    questionAbortRef.current?.abort();
    questionInFlightRef.current = false;
    setQuestionSubmitting(false);
    setTurns([]);
  }, []);

  // 1. Empty state: no active dataset loaded
  if (!activeDataset) {
    return (
      <PageContainer width="standard">
        <div
          className="dd-anim-file-enter space-y-6"
          data-testid="assistant-no-dataset-state"
        >
          <section className="dd-surface-primary space-y-5 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DossierLabel
                code="SEC-05"
                label="AI Investigation"
              />
              <StatusIndicator tone="neutral" label="No Active Dataset" />
            </div>

            <div className="space-y-2">
              <h2 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-[var(--dd-text-primary)]">
                AI Investigation Workspace
              </h2>
              <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--dd-text-secondary)]">
                Import a CSV or Excel (.xlsx) dataset on the Overview workspace
                to generate an evidence-grounded AI Investigation Brief, surface
                cross-finding connections, receive validated follow-up actions,
                and interrogate aggregate findings via Gemini — without ever
                transmitting raw spreadsheet rows.
              </p>
            </div>

            <div className="border-t border-[var(--dd-border-subtle)] pt-5">
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20 whitespace-nowrap"
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

  // 2. Upstream deterministic module error
  if (profilingStatus === 'error' || statisticsStatus === 'error') {
    const isProfileFailure = profilingStatus === 'error';
    const message = isProfileFailure
      ? (profilingError ?? 'Dataset schema profiling failed.')
      : (statisticsError ?? 'Statistical analysis failed.');

    return (
      <PageContainer width="standard">
        <div className="dd-anim-file-enter">
          <section
            role="alert"
            data-testid="assistant-upstream-error-state"
            className="dd-surface-primary flex flex-col gap-4 border-[var(--dd-status-anomaly-border)] p-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--dd-status-anomaly)]"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <h2 className="text-[1rem] font-semibold text-[var(--dd-text-primary)]">
                  Deterministic prerequisites unavailable
                </h2>
                <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
                  {message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={
                isProfileFailure ? reprofileDataset : recomputeStatistics
              }
              className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-primary)] hover:border-[var(--dd-accent-teal-border)]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Retry Deterministic Analysis</span>
            </button>
          </section>
        </div>
      </PageContainer>
    );
  }

  // 3. Loading deterministic M03/M04/M07 baseline
  if (
    profilingStatus === 'profiling' ||
    statisticsStatus === 'analyzing' ||
    !datasetProfile ||
    !statisticalSummary ||
    !investigationSummary ||
    !briefContext
  ) {
    return (
      <PageContainer width="standard">
        <div className="dd-anim-file-enter">
          <section
            data-testid="assistant-loading-state"
            className="dd-surface-primary flex items-center gap-4 p-6"
          >
            <Loader2
              className="h-5 w-5 animate-spin text-[var(--dd-accent-teal)]"
              aria-hidden="true"
            />
            <div className="space-y-0.5">
              <h2 className="text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
                Preparing Aggregate Investigation Context
              </h2>
              <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
                Waiting for schema profiling and statistical summaries to finish
                locally…
              </p>
            </div>
          </section>
        </div>
      </PageContainer>
    );
  }

  const aiStatusTone = healthLoading
    ? 'neutral'
    : isServiceAvailable
      ? 'verified'
      : 'warning';
  const aiStatusLabel = healthLoading
    ? 'Checking AI Service…'
    : isServiceAvailable
      ? `Gemini Ready (${healthStatus.model})`
      : healthError
        ? 'AI Service Unreachable'
        : healthStatus && !healthStatus.investigationEnabled
          ? 'AI Investigation Disabled'
          : 'Server API Key Missing';

  return (
    <PageContainer width="wide">
      <div
        className="dd-anim-file-enter space-y-6"
        data-testid="ai-assistant-workspace"
      >
        {/* Investigation Intelligence Header */}
        <WorkspaceHeader
          code="SEC-05"
          sectionLabel="AI Investigation"
          title="AI Assistant"
          status={<StatusIndicator tone={aiStatusTone} label={aiStatusLabel} />}
          navigationLinks={[
            {
              label: 'Investigation Center',
              to: '/investigation',
              testId: 'assistant-nav-investigation',
            },
            {
              label: 'Data Explorer',
              to: '/explorer',
              testId: 'assistant-nav-explorer',
            },
          ]}
          context={
            <>
              <span className="text-[var(--dd-text-primary)]">
                {activeDataset.fileName}
              </span>{' '}
              · {formatCount(datasetProfile.rowCount)} rows ·{' '}
              {formatCount(datasetProfile.columnCount)} columns · Quality{' '}
              {datasetProfile.quality.overallScore}/100 (
              {datasetProfile.quality.grade}) ·{' '}
              {formatCount(investigationSummary.overview.totalFindings)}{' '}
              verified findings · Last brief:{' '}
              {formatGeneratedTimestamp(briefMeta?.generatedAt)}
            </>
          }
          actions={
            <>
              <Link
                to="/reports?source=dataset&includeAi=1"
                data-testid="assistant-create-report-link"
                className="inline-flex items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3.5 py-2 font-mono text-[0.78125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:border-[var(--dd-accent-teal-border)] whitespace-nowrap"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Build Report</span>
              </Link>
              <button
                type="button"
                data-testid="generate-brief-button"
                disabled={briefLoading || !isServiceAvailable}
                onClick={handleGenerateBrief}
                className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-4 py-2 font-mono text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
              >
                {briefLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Generating Brief…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {briefData
                        ? 'Regenerate Investigation Brief'
                        : 'Generate Investigation Brief'}
                    </span>
                  </>
                )}
              </button>
            </>
          }
        />

        {/* Privacy & Context Boundary Bar + Service Status */}
        <section className="dd-surface-primary space-y-3 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[0.6875rem] text-[var(--dd-text-muted)] dd-tabular">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-[var(--dd-status-verified)]" aria-hidden="true" />
              <span>
                Privacy Boundary: Aggregate summaries only · 0 raw spreadsheet
                rows transmitted ·{' '}
                {formatCount(briefContext.contextMeta.serializedCharCount)} /{' '}
                {formatCount(HARD_MAX_CONTEXT_CHARS)} context chars
              </span>
            </div>
            <div>
              {briefContext.contextMeta.truncated
                ? `Compacted: ${briefContext.contextMeta.includedColumnCount}/${briefContext.contextMeta.totalColumnCount} cols · ${briefContext.contextMeta.includedFindingCount}/${briefContext.contextMeta.totalFindingCount} findings`
                : `Full aggregate scope: ${briefContext.contextMeta.includedColumnCount} cols · ${briefContext.contextMeta.includedFindingCount} findings`}
            </div>
          </div>

          {/* Service Unavailable Warning */}
          {!healthLoading && !isServiceAvailable && (
            <div
              role="alert"
              data-testid="ai-service-unavailable-banner"
              className="flex flex-col gap-3 rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-warning-border)] bg-[var(--dd-surface-recessed)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-0.5 text-[0.8125rem] text-[var(--dd-text-secondary)]">
                <div className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-status-warning)]">
                  AI Backend Unavailable
                </div>
                <p>
                  {healthError ??
                    (healthStatus && !healthStatus.investigationEnabled
                      ? 'The server-side AI investigation service is currently disabled via environment configuration.'
                      : 'No server-side Gemini API key is configured. Local data exploration, statistical analysis, visualizations, and anomaly detection remain fully operational.')}
                </p>
              </div>
              <button
                type="button"
                onClick={loadHealth}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-primary)] hover:border-[var(--dd-accent-teal-border)]"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                <span>Recheck Status</span>
              </button>
            </div>
          )}
        </section>

        {/* Brief Error State */}
        {briefError && (
          <section
            role="alert"
            data-testid="ai-brief-error-banner"
            className="dd-surface-primary flex flex-col gap-4 border-[var(--dd-status-anomaly-border)] p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--dd-status-anomaly)]"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <div className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-status-anomaly)]">
                  Brief Generation Failed · {briefError.code}
                </div>
                <p className="text-[0.84375rem] text-[var(--dd-text-secondary)]">
                  {briefError.message}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={briefLoading || !isServiceAvailable}
              onClick={handleGenerateBrief}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-3.5 py-2 font-mono text-[0.75rem] text-[var(--dd-text-primary)] hover:border-[var(--dd-accent-teal-border)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Retry Brief</span>
            </button>
          </section>
        )}

        {/* Brief Prompt / Loading / Result */}
        {!briefData && !briefLoading && !briefError && (
          <section
            data-testid="ai-brief-ready-prompt"
            className="dd-surface-primary space-y-3 p-6"
          >
            <div className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
              INTENTIONAL ON-DEMAND SYNTHESIS
            </div>
            <h3 className="text-[1.0625rem] font-semibold text-[var(--dd-text-primary)]">
              Generate an evidence-grounded AI Investigation Brief
            </h3>
            <p className="max-w-3xl text-[0.875rem] leading-relaxed text-[var(--dd-text-secondary)]">
              Click{' '}
              <span className="font-medium text-[var(--dd-text-primary)]">
                Generate Investigation Brief
              </span>{' '}
              above to synthesize schema profiling signals, statistical
              summaries, and automated findings into an executive brief,
              cross-finding hypotheses, and validated workspace navigation
              recommendations. Or ask a direct question in the Q&A panel below.
            </p>
          </section>
        )}

        {briefLoading && !briefData && (
          <section
            data-testid="ai-brief-loading-state"
            className="dd-surface-primary flex items-center gap-4 p-6"
          >
            <Loader2
              className="h-5 w-5 animate-spin text-[var(--dd-accent-teal)]"
              aria-hidden="true"
            />
            <div className="space-y-0.5">
              <h3 className="text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
                Synthesizing Forensic Investigation Brief
              </h3>
              <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
                Evaluating verified aggregate analysis context via server-side
                Gemini service (bounded single request)…
              </p>
            </div>
          </section>
        )}

        {briefData && (
          <div className="space-y-6">
            <InvestigationBriefSection
              brief={briefData.brief}
              profile={datasetProfile}
              findingsById={findingsById}
            />

            <ConnectedFindingsSection
              connections={briefData.connections}
              profile={datasetProfile}
              findingsById={findingsById}
            />

            <RecommendedInvestigationsSection
              recommendations={briefData.recommendations}
              profile={datasetProfile}
            />
          </div>
        )}

        {/* Feature C — Ask Your Dataset */}
        <AskDatasetPanel
          profile={datasetProfile}
          findingsById={findingsById}
          turns={turns}
          questionInput={questionInput}
          onQuestionInputChange={setQuestionInput}
          onSubmitQuestion={(q) => submitQuestionInternal(q)}
          onRetryTurn={handleRetryTurn}
          onClearConversation={handleClearConversation}
          isSubmitting={questionSubmitting}
          isServiceAvailable={isServiceAvailable}
        />
      </div>
    </PageContainer>
  );
}
