import { useEffect, useState } from 'react';
import { Check, Edit3, FileText, Plus, Trash2, X } from 'lucide-react';
import type { CaseNote, CaseNoteType, InvestigationCase } from '@/types';
import { cn, formatCount } from '@/utils';
import {
  formatCaseTimestamp,
  NOTE_TYPE_META,
  NOTE_TYPE_ORDER,
} from './caseLabels';

interface CaseJournalPanelProps {
  readonly caseItem: InvestigationCase;
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
  readonly onUpdateConclusion: (conclusion: string) => void;
}

/**
 * Module 09 — Structured Investigation Journal & Documented Conclusion.
 * Visually separates User Observations, Unverified Hypotheses, Open Questions,
 * and Final Conclusions from the Verified Evidence Board.
 */
export function CaseJournalPanel({
  caseItem,
  onAddNote,
  onEditNote,
  onDeleteNote,
  onUpdateConclusion,
}: CaseJournalPanelProps) {
  const [noteType, setNoteType] = useState<CaseNoteType>('observation');
  const [noteText, setNoteText] = useState('');
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([]);

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<CaseNoteType>('observation');
  const [editingText, setEditingText] = useState('');

  const [conclusionDraft, setConclusionDraft] = useState(caseItem.conclusion);

  useEffect(() => {
    setConclusionDraft(caseItem.conclusion);
  }, [caseItem.id, caseItem.conclusion]);

  const evidenceById = new Map(caseItem.evidence.map((e) => [e.id, e]));

  const toggleEvidenceRef = (evidenceId: string) => {
    setSelectedEvidenceIds((prev) =>
      prev.includes(evidenceId)
        ? prev.filter((id) => id !== evidenceId)
        : [...prev, evidenceId],
    );
  };

  const handleSubmitNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    onAddNote({
      type: noteType,
      text: noteText.trim(),
      supportingEvidenceIds: selectedEvidenceIds,
    });
    setNoteText('');
    setSelectedEvidenceIds([]);
  };

  const startEditing = (note: CaseNote) => {
    setEditingNoteId(note.id);
    setEditingType(note.type);
    setEditingText(note.text);
  };

  const saveEdit = (noteId: string) => {
    if (!editingText.trim()) return;
    onEditNote(noteId, {
      type: editingType,
      text: editingText.trim(),
    });
    setEditingNoteId(null);
  };

  const conclusionDirty =
    conclusionDraft.trim() !== caseItem.conclusion.trim();

  return (
    <section
      data-testid="case-journal-panel"
      aria-label="Investigation notes and hypotheses"
      className="dd-surface-primary space-y-5 p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--dd-border-subtle)] pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              Investigation Journal · {formatCount(caseItem.notes.length)}{' '}
              {caseItem.notes.length === 1 ? 'Entry' : 'Entries'}
            </span>
          </div>
          <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
            Document analyst observations, unverified hypotheses, open
            questions, and final conclusions separately from verified evidence.
          </p>
        </div>
      </header>

      {/* New Note Form */}
      <form onSubmit={handleSubmitNote} className="space-y-3">
        <div
          role="radiogroup"
          aria-label="Journal entry type"
          className="flex flex-wrap items-center gap-1.5"
        >
          {NOTE_TYPE_ORDER.map((type) => {
            const meta = NOTE_TYPE_META[type];
            const active = noteType === type;
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setNoteType(type)}
                className={cn(
                  'cursor-pointer rounded-[var(--dd-radius-sm)] border px-2.5 py-1 font-mono text-[0.75rem] transition-colors whitespace-nowrap',
                  active
                    ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-text-primary)]'
                    : 'border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)]',
                )}
              >
                {meta.label}
              </button>
            );
          })}
        </div>

        <textarea
          aria-label="Journal entry text"
          rows={3}
          maxLength={1200}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder={NOTE_TYPE_META[noteType].placeholder}
          className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-2 text-[0.84375rem] text-[var(--dd-text-primary)] outline-none placeholder:text-[var(--dd-text-muted)] focus:border-[var(--dd-accent-teal-border)]"
        />

        {caseItem.evidence.length > 0 && (
          <div className="space-y-1.5">
            <div className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
              Link Supporting Evidence (Optional):
            </div>
            <div className="flex flex-wrap gap-1.5">
              {caseItem.evidence.map((ev) => {
                const selected = selectedEvidenceIds.includes(ev.id);
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => toggleEvidenceRef(ev.id)}
                    aria-pressed={selected}
                    className={cn(
                      'cursor-pointer rounded-[var(--dd-radius-sm)] border px-2 py-1 font-mono text-[0.6875rem] transition-colors',
                      selected
                        ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-text-primary)]'
                        : 'border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-muted)] hover:text-[var(--dd-text-primary)]',
                    )}
                  >
                    {selected ? '✓ ' : '+ '}
                    {ev.sourceRef}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
            Classification:{' '}
            <strong className={NOTE_TYPE_META[noteType].textClass}>
              {NOTE_TYPE_META[noteType].epistemicLabel}
            </strong>
          </span>
          <button
            type="submit"
            disabled={noteText.trim().length === 0}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-3.5 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-accent-teal)]/20 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Add {NOTE_TYPE_META[noteType].label}</span>
          </button>
        </div>
      </form>

      {/* Recorded Journal Entries */}
      {caseItem.notes.length === 0 ? (
        <p className="rounded-[var(--dd-radius-sm)] border border-dashed border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-4 text-center text-[0.8125rem] text-[var(--dd-text-muted)]">
          No journal entries recorded yet. Add an observation, hypothesis,
          question, or conclusion above.
        </p>
      ) : (
        <div className="divide-y divide-[var(--dd-border-subtle)] rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)]">
          {caseItem.notes.map((note) => {
            const meta = NOTE_TYPE_META[note.type];
            const isEditing = editingNoteId === note.id;

            return (
              <article
                key={note.id}
                data-testid={`case-note-${note.id}`}
                data-note-type={note.type}
                className="space-y-2 px-4 py-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.07em] dd-tabular">
                    <span className={cn('font-semibold', meta.textClass)}>
                      {meta.epistemicLabel}
                    </span>
                    <span className="text-[var(--dd-text-muted)]" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-[var(--dd-text-muted)]">
                      {formatCaseTimestamp(note.updatedAt)}
                      {note.updatedAt !== note.createdAt ? ' (edited)' : ''}
                    </span>
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(note)}
                        aria-label={`Edit ${meta.label} note`}
                        className="inline-flex cursor-pointer items-center gap-1 font-mono text-[0.75rem] text-[var(--dd-text-muted)] hover:text-[var(--dd-text-primary)]"
                      >
                        <Edit3 className="h-3 w-3" aria-hidden="true" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteNote(note.id)}
                        aria-label={`Delete ${meta.label} note`}
                        className="inline-flex cursor-pointer items-center gap-1 font-mono text-[0.75rem] text-[var(--dd-text-muted)] hover:text-[var(--dd-status-anomaly)]"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {NOTE_TYPE_ORDER.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setEditingType(t)}
                          className={cn(
                            'cursor-pointer rounded-[var(--dd-radius-sm)] border px-2 py-0.5 font-mono text-[0.6875rem]',
                            editingType === t
                              ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-text-primary)]'
                              : 'border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] text-[var(--dd-text-secondary)]',
                          )}
                        >
                          {NOTE_TYPE_META[t].label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      aria-label="Edit note text"
                      rows={3}
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3 py-2 text-[0.84375rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(note.id)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-2.5 py-1 font-mono text-[0.75rem] text-[var(--dd-text-primary)]"
                      >
                        <Check className="h-3 w-3" aria-hidden="true" />
                        <span>Save Note</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingNoteId(null)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] px-2.5 py-1 font-mono text-[0.75rem] text-[var(--dd-text-secondary)]"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                        <span>Cancel</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-[0.84375rem] leading-relaxed text-[var(--dd-text-primary)]">
                      {note.text}
                    </p>
                    {note.supportingEvidenceIds.length > 0 && (
                      <div className="font-mono text-[0.6875rem] text-[var(--dd-text-muted)]">
                        Supporting evidence:{' '}
                        {note.supportingEvidenceIds
                          .map((id) => evidenceById.get(id)?.sourceRef ?? id)
                          .join(' · ')}
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Dedicated Case Conclusion Summary */}
      <div className="space-y-2 border-t border-[var(--dd-border-subtle)] pt-4">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="case-conclusion-input"
            className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--dd-status-verified)]"
          >
            Documented Case Conclusion
          </label>
          {conclusionDirty && (
            <button
              type="button"
              onClick={() => onUpdateConclusion(conclusionDraft)}
              className="cursor-pointer font-mono text-[0.75rem] text-[var(--dd-accent-teal)] hover:text-[var(--dd-accent-teal-hover)]"
            >
              Save Conclusion
            </button>
          )}
        </div>
        <textarea
          id="case-conclusion-input"
          rows={2}
          maxLength={1200}
          value={conclusionDraft}
          onChange={(e) => setConclusionDraft(e.target.value)}
          placeholder="Summarize the final verified conclusion for this investigation case…"
          className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-2 text-[0.84375rem] text-[var(--dd-text-primary)] outline-none placeholder:text-[var(--dd-text-muted)] focus:border-[var(--dd-accent-teal-border)]"
        />
      </div>
    </section>
  );
}
