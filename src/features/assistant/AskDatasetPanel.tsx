import { type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Send,
  Table2,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { buildExplorerColumnUrl } from '@/features/investigation/investigationLabels';
import type {
  AiAnswerSupportType,
  AiConversationTurn,
  DatasetInsight,
  DatasetProfileSummary,
} from '@/types';
import { cn } from '@/utils';

const STARTER_QUESTIONS: readonly string[] = [
  'What are the biggest data-quality concerns?',
  'Which columns should I investigate first?',
  'Which relationships are worth investigating?',
  'Is this dataset reliable enough for further analysis?',
];

const SUPPORT_BADGE: Readonly<
  Record<
    AiAnswerSupportType,
    { readonly label: string; readonly cls: string }
  >
> = {
  directly_supported: {
    label: 'DIRECTLY SUPPORTED BY AGGREGATES',
    cls: 'text-[var(--dd-status-verified)]',
  },
  reasonable_interpretation: {
    label: 'REASONABLE AI INTERPRETATION',
    cls: 'text-[var(--dd-accent-teal)]',
  },
  insufficient_evidence: {
    label: 'INSUFFICIENT AGGREGATE EVIDENCE',
    cls: 'text-[var(--dd-status-warning)]',
  },
};

function buildFindingUrl(findingId: string): string {
  const params = new URLSearchParams({ finding: findingId });
  return `/investigation?${params.toString()}`;
}

interface AskDatasetPanelProps {
  readonly profile: DatasetProfileSummary;
  readonly findingsById: ReadonlyMap<string, DatasetInsight>;
  readonly turns: readonly AiConversationTurn[];
  readonly questionInput: string;
  readonly onQuestionInputChange: (next: string) => void;
  readonly onSubmitQuestion: (questionText: string) => void;
  readonly onRetryTurn: (turnId: string) => void;
  readonly onClearConversation: () => void;
  readonly isSubmitting: boolean;
  readonly isServiceAvailable: boolean;
}

/**
 * Feature C — Ask Your Dataset
 * Session-scoped, bounded forensic Q&A interface grounded strictly in
 * aggregate context. Never persists conversation history to browser storage.
 */
export function AskDatasetPanel({
  profile,
  findingsById,
  turns,
  questionInput,
  onQuestionInputChange,
  onSubmitQuestion,
  onRetryTurn,
  onClearConversation,
  isSubmitting,
  isServiceAvailable,
}: AskDatasetPanelProps) {
  const columnNameById = new Map(
    profile.columns.map((c) => [c.columnId, c.name]),
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || !isServiceAvailable) return;
    const trimmed = questionInput.trim();
    if (!trimmed) return;
    onSubmitQuestion(trimmed);
  };

  return (
    <section
      data-testid="ai-ask-dataset-panel"
      className="dd-surface-primary space-y-4 p-5 sm:p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--dd-border-subtle)] pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-accent-teal)]">
            <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>BOUNDED SESSION Q&A · AGGREGATE CONTEXT ONLY</span>
          </div>
          <h3 className="text-[1.0625rem] font-semibold tracking-[-0.015em] text-[var(--dd-text-primary)]">
            Ask Your Dataset
          </h3>
        </div>

        {turns.length > 0 && (
          <button
            type="button"
            onClick={onClearConversation}
            disabled={isSubmitting}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1 font-mono text-[0.75rem] text-[var(--dd-text-secondary)] transition-colors hover:text-[var(--dd-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            <span>Clear Thread</span>
          </button>
        )}
      </header>

      {/* Starter Forensic Prompts */}
      <div className="space-y-1.5">
        <div className="font-mono text-[0.625rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
          Suggested Forensic Questions
        </div>
        <div className="flex flex-wrap gap-2">
          {STARTER_QUESTIONS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={isSubmitting || !isServiceAvailable}
              onClick={() => onSubmitQuestion(prompt)}
              className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 text-left text-[0.75rem] text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-accent-teal-border)] hover:text-[var(--dd-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation Transcript */}
      {turns.length > 0 && (
        <div
          data-testid="ai-conversation-thread"
          className="space-y-3.5 border-t border-[var(--dd-border-subtle)] pt-4"
        >
          {turns.map((turn) => (
            <div
              key={turn.id}
              data-testid={`ai-turn-${turn.id}`}
              className="space-y-2.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-4"
            >
              {/* User Question */}
              <div className="space-y-1 border-b border-[var(--dd-border-subtle)] pb-2.5">
                <div className="font-mono text-[0.625rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
                  Investigator Question
                </div>
                <p className="text-[0.875rem] font-medium text-[var(--dd-text-primary)]">
                  {turn.question}
                </p>
              </div>

              {/* Pending State */}
              {turn.status === 'pending' && (
                <div className="flex items-center gap-2.5 py-1 text-[0.8125rem] text-[var(--dd-text-secondary)]">
                  <Loader2
                    className="h-4 w-4 animate-spin text-[var(--dd-accent-teal)]"
                    aria-hidden="true"
                  />
                  <span>Evaluating aggregate findings via Gemini…</span>
                </div>
              )}

              {/* Error State with explicit Retry */}
              {turn.status === 'error' && (
                <div
                  role="alert"
                  className="flex flex-col gap-2.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-anomaly-border)] bg-[var(--dd-surface-primary)] p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--dd-status-anomaly)]"
                      aria-hidden="true"
                    />
                    <div className="space-y-0.5">
                      <div className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-status-anomaly)]">
                        {turn.errorCode ?? 'REQUEST_FAILED'}
                      </div>
                      <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
                        {turn.errorMessage ?? 'Unable to answer this question.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isSubmitting || !isServiceAvailable}
                    onClick={() => onRetryTurn(turn.id)}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-primary)] hover:border-[var(--dd-accent-teal-border)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    <span>Retry Question</span>
                  </button>
                </div>
              )}

              {/* Answered State */}
              {turn.status === 'answered' && turn.answer && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[0.625rem] uppercase tracking-[0.08em]">
                    <span
                      className={cn(
                        'font-semibold',
                        SUPPORT_BADGE[turn.answer.supportType].cls,
                      )}
                    >
                      {SUPPORT_BADGE[turn.answer.supportType].label}
                    </span>
                    {turn.meta && (
                      <span className="text-[var(--dd-text-muted)] dd-tabular">
                        {turn.meta.model} · {turn.meta.durationMs} ms
                      </span>
                    )}
                  </div>

                  <p className="text-[0.875rem] leading-relaxed text-[var(--dd-text-primary)]">
                    {turn.answer.answer}
                  </p>

                  {(turn.answer.referencedFindingIds.length > 0 ||
                    turn.answer.referencedColumnIds.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {turn.answer.referencedFindingIds.map((findingId) => {
                        const finding = findingsById.get(findingId);
                        return (
                          <Link
                            key={findingId}
                            to={buildFindingUrl(findingId)}
                            title={finding?.title ?? findingId}
                            className="inline-flex items-center gap-1 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-2 py-0.5 font-mono text-[0.6875rem] text-[var(--dd-text-primary)] hover:bg-[var(--dd-accent-teal)]/20"
                          >
                            <span>Finding: {findingId}</span>
                            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                          </Link>
                        );
                      })}
                      {turn.answer.referencedColumnIds.map((colId) => (
                        <Link
                          key={colId}
                          to={buildExplorerColumnUrl(colId)}
                          className="inline-flex items-center gap-1 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-2 py-0.5 font-mono text-[0.6875rem] text-[var(--dd-text-secondary)] hover:border-[var(--dd-accent-teal-border)] hover:text-[var(--dd-text-primary)]"
                        >
                          <Table2 className="h-2.5 w-2.5" aria-hidden="true" />
                          <span>{columnNameById.get(colId) ?? colId}</span>
                        </Link>
                      ))}
                    </div>
                  )}

                  {turn.answer.caveats.length > 0 && (
                    <div className="space-y-1 border-t border-[var(--dd-border-subtle)] pt-2 text-[0.78125rem] text-[var(--dd-text-muted)]">
                      <div className="font-mono text-[0.625rem] uppercase tracking-[0.07em]">
                        Methodological Caveats
                      </div>
                      <ul className="list-disc space-y-0.5 pl-4">
                        {turn.answer.caveats.map((caveat, idx) => (
                          <li key={`${turn.id}-caveat-${idx}`}>{caveat}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {turn.answer.suggestedFollowUps.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="font-mono text-[0.625rem] uppercase tracking-[0.07em] text-[var(--dd-text-muted)]">
                        Follow-ups:
                      </span>
                      {turn.answer.suggestedFollowUps.map((followUp) => (
                        <button
                          key={followUp}
                          type="button"
                          disabled={isSubmitting || !isServiceAvailable}
                          onClick={() => onSubmitQuestion(followUp)}
                          className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] px-2 py-0.5 text-[0.75rem] text-[var(--dd-text-secondary)] hover:border-[var(--dd-accent-teal-border)] hover:text-[var(--dd-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {followUp}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Question Input Form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-2 border-t border-[var(--dd-border-subtle)] pt-3.5"
      >
        <label
          htmlFor="ai-dataset-question-input"
          className="block font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--dd-text-muted)]"
        >
          Interrogate Aggregate Findings (No Raw Rows Transmitted)
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="ai-dataset-question-input"
            type="text"
            maxLength={600}
            value={questionInput}
            onChange={(e) => onQuestionInputChange(e.target.value)}
            placeholder={
              isServiceAvailable
                ? 'Ask about data quality, outliers, distributions, or next steps…'
                : 'AI service unavailable — verify server Gemini API configuration'
            }
            disabled={!isServiceAvailable}
            className="flex-1 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-2 text-[0.84375rem] text-[var(--dd-text-primary)] outline-none placeholder:text-[var(--dd-text-muted)] focus:border-[var(--dd-accent-teal-border)] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={
              isSubmitting ||
              !isServiceAvailable ||
              questionInput.trim().length === 0
            }
            className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-4 py-2 font-mono text-[0.8125rem] font-medium text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>Analyzing…</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Ask Dataset</span>
              </>
            )}
          </button>
        </div>
        <div className="flex items-center justify-between font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
          <span>
            Answers rely exclusively on verified aggregate summaries and cannot
            query raw rows.
          </span>
          <span className="dd-tabular">{questionInput.length} / 600</span>
        </div>
      </form>
    </section>
  );
}
