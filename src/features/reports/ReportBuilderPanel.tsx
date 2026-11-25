import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckSquare,
  FilePlus2,
  FolderOpen,
  Sparkles,
  Square,
  Table2,
} from 'lucide-react';
import {
  buildDefaultSections,
  getChartConfigSignature,
  REPORT_TYPE_META,
  REPORT_TYPE_ORDER,
  type ActiveReportSources,
  type CreateReportInput,
} from '@/engine/reports';
import type {
  ChartConfig,
  ReportSectionConfig,
  ReportSourceKind,
  ReportType,
} from '@/types';
import { cn } from '@/utils';
import {
  FINDING_CLASSIFICATION_LABELS,
  SOURCE_KIND_LABELS,
} from './reportLabels';

export interface InvalidPrefillChartNotice {
  readonly title: string;
  readonly reason: string;
}

export interface ReportBuilderPrefill {
  readonly sourceKind?: ReportSourceKind;
  readonly caseId?: string;
  readonly findingIds?: readonly string[];
  readonly reportType?: ReportType;
  readonly includeCharts?: boolean;
  readonly includeAi?: boolean;
  readonly customChartsRequested?: boolean;
  readonly customCharts?: readonly ChartConfig[];
  readonly invalidCustomCharts?: readonly InvalidPrefillChartNotice[];
  readonly customChartNotice?: string;
}

interface ReportBuilderPanelProps {
  readonly sources: ActiveReportSources;
  readonly recommendedCharts: readonly ChartConfig[];
  readonly prefill?: ReportBuilderPrefill | null;
  readonly onCreateReport: (input: CreateReportInput) => void;
  readonly onCancel?: () => void;
}

function chartKey(cfg: ChartConfig): string {
  return getChartConfigSignature(cfg);
}

/**
 * Module 10 — Report Builder.
 * Creates deterministic, evidence-grounded reports from the active dataset,
 * an M09 investigation case, or selected M07 findings, with optional AI
 * interpretation inclusion (never required).
 */
export function ReportBuilderPanel({
  sources,
  recommendedCharts,
  prefill,
  onCreateReport,
  onCancel,
}: ReportBuilderPanelProps) {
  const validCaseIds = useMemo(
    () => new Set(sources.activeCases.map((c) => c.id)),
    [sources.activeCases],
  );
  const validFindingIds = useMemo(
    () => new Set(sources.investigation.insights.map((f) => f.id)),
    [sources.investigation.insights],
  );
  const allStatColumnIds = useMemo(
    () => [
      ...sources.stats.numericColumns.map((c) => c.columnId),
      ...sources.stats.categoricalColumns.map((c) => c.columnId),
    ],
    [sources.stats],
  );

  const initialCaseId =
    prefill?.caseId && validCaseIds.has(prefill.caseId)
      ? prefill.caseId
      : (sources.activeCases[0]?.id ?? '');

  const initialSourceKind: ReportSourceKind =
    prefill?.sourceKind === 'case' && initialCaseId
      ? 'case'
      : prefill?.sourceKind === 'findings' &&
          sources.investigation.insights.length > 0
        ? 'findings'
        : 'dataset';

  const initialReportType: ReportType =
    prefill?.reportType ??
    (initialSourceKind === 'case'
      ? 'investigation_dossier'
      : 'dataset_analysis');

  const [sourceKind, setSourceKind] =
    useState<ReportSourceKind>(initialSourceKind);
  const [selectedCaseId, setSelectedCaseId] = useState<string>(initialCaseId);
  const [reportType, setReportType] = useState<ReportType>(initialReportType);
  const [title, setTitle] = useState<string>('');
  const [subtitle, setSubtitle] = useState<string>('');
  const [author, setAuthor] = useState<string>('');
  const [introDescription, setIntroDescription] = useState<string>('');

  const [selectedFindingIds, setSelectedFindingIds] = useState<string[]>(() => {
    if (prefill?.findingIds && prefill.findingIds.length > 0) {
      return prefill.findingIds.filter((id) => validFindingIds.has(id));
    }
    if (initialSourceKind === 'case' && initialCaseId) {
      const matched = sources.activeCases.find((c) => c.id === initialCaseId);
      if (matched) {
        return matched.findingIds.filter((id) => validFindingIds.has(id));
      }
    }
    return sources.investigation.insights.map((f) => f.id);
  });

  const [selectedStatColumnIds, setSelectedStatColumnIds] =
    useState<string[]>(allStatColumnIds);

  const { availableCharts, studioChartKeySet } = useMemo(() => {
    const merged: ChartConfig[] = [];
    const seen = new Set<string>();
    const studioKeys = new Set<string>();

    if (prefill?.customCharts && prefill.customCharts.length > 0) {
      for (const cfg of prefill.customCharts) {
        const key = chartKey(cfg);
        if (seen.has(key)) continue;
        seen.add(key);
        studioKeys.add(key);
        merged.push(cfg);
      }
    }

    for (const cfg of recommendedCharts) {
      const key = chartKey(cfg);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(cfg);
    }

    return { availableCharts: merged, studioChartKeySet: studioKeys };
  }, [prefill?.customCharts, recommendedCharts]);

  const [selectedChartKeys, setSelectedChartKeys] = useState<string[]>(() => {
    // Explicit Visualization Studio handoff: preserve ONLY validated handed-off charts
    // without silently substituting unrelated recommended charts.
    if (prefill?.customChartsRequested) {
      return (prefill.customCharts ?? []).map(chartKey);
    }
    if (prefill?.includeCharts) {
      return recommendedCharts.slice(0, 4).map(chartKey);
    }
    return recommendedCharts.slice(0, 2).map(chartKey);
  });

  const hasValidAiBrief = Boolean(
    sources.verifiedAiBrief &&
      sources.verifiedAiBrief.datasetId === sources.dataset.id &&
      sources.verifiedAiBrief.profiledAt === sources.profile.profiledAt,
  );

  const activeCase = useMemo(
    () =>
      sourceKind === 'case'
        ? sources.activeCases.find((c) => c.id === selectedCaseId)
        : undefined,
    [sourceKind, sources.activeCases, selectedCaseId],
  );

  const hasCaseAi = Boolean(activeCase && activeCase.aiAnalyses.length > 0);

  const [includeModule08Brief, setIncludeModule08Brief] = useState<boolean>(
    Boolean(prefill?.includeAi) && hasValidAiBrief,
  );
  const [includeModule09CaseAnalyses, setIncludeModule09CaseAnalyses] =
    useState<boolean>(Boolean(prefill?.includeAi) && hasCaseAi);

  const [sections, setSections] = useState<readonly ReportSectionConfig[]>(() =>
    buildDefaultSections(initialReportType, {
      hasCase: Boolean(activeCase),
      includeAi:
        (Boolean(prefill?.includeAi) && hasValidAiBrief) ||
        (Boolean(prefill?.includeAi) && hasCaseAi),
      hasCharts: selectedChartKeys.length > 0,
      hasStats: allStatColumnIds.length > 0,
      hasFindings: sources.investigation.insights.length > 0,
    }),
  );

  // Sync default sections when report type or source kind switches
  useEffect(() => {
    setSections(
      buildDefaultSections(reportType, {
        hasCase: Boolean(activeCase),
        includeAi:
          (includeModule08Brief && hasValidAiBrief) ||
          (includeModule09CaseAnalyses && hasCaseAi),
        hasCharts: selectedChartKeys.length > 0,
        hasStats: selectedStatColumnIds.length > 0,
        hasFindings: selectedFindingIds.length > 0,
      }),
    );
  }, [
    reportType,
    activeCase,
    includeModule08Brief,
    hasValidAiBrief,
    includeModule09CaseAnalyses,
    hasCaseAi,
    selectedChartKeys.length,
    selectedStatColumnIds.length,
    selectedFindingIds.length,
  ]);

  const handleSourceChange = (nextKind: ReportSourceKind) => {
    setSourceKind(nextKind);
    if (nextKind === 'case') {
      const targetId = selectedCaseId || sources.activeCases[0]?.id || '';
      setSelectedCaseId(targetId);
      setReportType('investigation_dossier');
      const matched = sources.activeCases.find((c) => c.id === targetId);
      if (matched) {
        setSelectedFindingIds(
          matched.findingIds.filter((id) => validFindingIds.has(id)),
        );
      }
    }
  };

  const handleCaseSelect = (caseId: string) => {
    setSelectedCaseId(caseId);
    const matched = sources.activeCases.find((c) => c.id === caseId);
    if (matched) {
      setSelectedFindingIds(
        matched.findingIds.filter((id) => validFindingIds.has(id)),
      );
    }
  };

  const toggleFinding = (id: string) => {
    setSelectedFindingIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleStatCol = (id: string) => {
    setSelectedStatColumnIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleChart = (key: string) => {
    setSelectedChartKeys((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    );
  };

  const toggleSection = (key: ReportSectionConfig['key']) => {
    setSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, enabled: !s.enabled } : s)),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const chosenCharts = availableCharts.filter((cfg) =>
      selectedChartKeys.includes(chartKey(cfg)),
    );
    onCreateReport({
      title: title.trim() || undefined,
      subtitle: subtitle.trim() || undefined,
      author: author.trim() || undefined,
      introDescription: introDescription.trim() || undefined,
      reportType,
      sourceKind,
      ...(sourceKind === 'case' && selectedCaseId
        ? { caseId: selectedCaseId }
        : {}),
      selectedFindingIds,
      selectedStatColumnIds,
      selectedCharts: chosenCharts,
      sections,
      aiInclusion: {
        includeModule08Brief: includeModule08Brief && hasValidAiBrief,
        includeModule09CaseAnalyses: includeModule09CaseAnalyses && hasCaseAi,
      },
    });
  };

  const typeMeta = REPORT_TYPE_META[reportType];
  const defaultTitlePreview = activeCase
    ? `${activeCase.title} — ${typeMeta.shortLabel}`
    : `${sources.dataset.fileName} — ${typeMeta.label}`;

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="report-builder-form"
      className="space-y-6"
    >
      {/* Top Action Header */}
      <div className="flex flex-col gap-3 border-b border-[var(--dd-border-subtle)] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-[1.0625rem] font-semibold text-[var(--dd-text-primary)]">
            Configure New Report
          </h3>
          <p className="mt-0.5 text-[0.8125rem] text-[var(--dd-text-secondary)]">
            Source dataset:{' '}
            <span className="font-mono text-[var(--dd-text-primary)]">
              {sources.dataset.fileName}
            </span>{' '}
            · {sources.profile.rowCount.toLocaleString()} rows ×{' '}
            {sources.profile.columnCount} columns · Fully offline PDF export
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="cursor-pointer whitespace-nowrap rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] px-3 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)]"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={sourceKind === 'case' && !selectedCaseId}
            className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-4 py-1.5 font-mono text-[0.75rem] font-medium text-[var(--dd-text-primary)] hover:bg-[var(--dd-accent-teal)]/25 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
            Generate Report &amp; Preview
          </button>
        </div>
      </div>

      {/* Step 1: Source & Report Type */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 rounded-[var(--dd-radius-md)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] p-4">
          <div className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
            1. Report Source
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['dataset', 'case', 'findings'] as const).map((kind) => {
              const disabled =
                (kind === 'case' && sources.activeCases.length === 0) ||
                (kind === 'findings' &&
                  sources.investigation.insights.length === 0);
              return (
                <button
                  key={kind}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSourceChange(kind)}
                  className={cn(
                    'cursor-pointer rounded-[var(--dd-radius-sm)] border px-2.5 py-2 text-left text-[0.75rem] font-medium transition-colors',
                    sourceKind === kind
                      ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-text-primary)]'
                      : 'border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-secondary)] hover:bg-[var(--dd-surface-hover)] hover:text-[var(--dd-text-primary)]',
                    disabled && 'cursor-not-allowed opacity-45',
                  )}
                >
                  <div className="whitespace-nowrap">
                    {SOURCE_KIND_LABELS[kind]}
                  </div>
                  <div className="mt-0.5 font-mono text-[0.65rem] text-[var(--dd-text-muted)]">
                    {kind === 'dataset' &&
                      `${sources.profile.columnCount} cols`}
                    {kind === 'case' &&
                      `${sources.activeCases.length} case(s)`}
                    {kind === 'findings' &&
                      `${sources.investigation.insights.length} finding(s)`}
                  </div>
                </button>
              );
            })}
          </div>

          {sourceKind === 'case' && (
            <div className="space-y-1.5 pt-1">
              <label
                htmlFor="builder-case-select"
                className="flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]"
              >
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                Select Active Investigation Case
              </label>
              <select
                id="builder-case-select"
                value={selectedCaseId}
                onChange={(e) => handleCaseSelect(e.target.value)}
                className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
              >
                {sources.activeCases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} — {c.title} ({c.status.replace(/_/g, ' ')})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Report Type Selector */}
        <div className="space-y-3 rounded-[var(--dd-radius-md)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] p-4">
          <div className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
            2. Report Type
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {REPORT_TYPE_ORDER.map((typeKey) => {
              const meta = REPORT_TYPE_META[typeKey];
              const active = reportType === typeKey;
              return (
                <button
                  key={typeKey}
                  type="button"
                  onClick={() => setReportType(typeKey)}
                  className={cn(
                    'cursor-pointer rounded-[var(--dd-radius-sm)] border px-3 py-2 text-left transition-colors',
                    active
                      ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] text-[var(--dd-text-primary)]'
                      : 'border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] text-[var(--dd-text-secondary)] hover:bg-[var(--dd-surface-hover)] hover:text-[var(--dd-text-primary)]',
                  )}
                >
                  <div className="text-[0.8125rem] font-medium">
                    {meta.label}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[0.7rem] text-[var(--dd-text-muted)]">
                    {meta.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step 2: Document Metadata */}
      <div className="space-y-3 rounded-[var(--dd-radius-md)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] p-4">
        <div className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
          3. Report Metadata
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1 md:col-span-2">
            <label
              htmlFor="builder-report-title"
              className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]"
            >
              Report Title
            </label>
            <input
              id="builder-report-title"
              type="text"
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultTitlePreview}
              className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-1.5 text-[0.84375rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="builder-report-author"
              className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]"
            >
              Author (Optional)
            </label>
            <input
              id="builder-report-author"
              type="text"
              maxLength={100}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Analyst or team name"
              className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-1.5 text-[0.84375rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label
              htmlFor="builder-report-subtitle"
              className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]"
            >
              Subtitle
            </label>
            <input
              id="builder-report-subtitle"
              type="text"
              maxLength={200}
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder={typeMeta.defaultSubtitle}
              className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="builder-report-intro"
              className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]"
            >
              Introductory Context (Optional)
            </label>
            <input
              id="builder-report-intro"
              type="text"
              maxLength={1500}
              value={introDescription}
              onChange={(e) => setIntroDescription(e.target.value)}
              placeholder="Purpose, audience, or investigation mandate…"
              className="w-full rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-3 py-1.5 text-[0.8125rem] text-[var(--dd-text-primary)] outline-none focus:border-[var(--dd-accent-teal-border)]"
            />
          </div>
        </div>
      </div>

      {/* Step 3: Sections, Findings, Stats, Charts, Optional AI */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Included Sections */}
        <div className="space-y-2.5 rounded-[var(--dd-radius-md)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] p-4">
          <div className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
            4. Report Sections (A–J)
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {sections.map((sec) => (
              <label
                key={sec.key}
                className="flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 text-[0.78125rem] text-[var(--dd-text-primary)] transition-colors hover:bg-[var(--dd-surface-hover)]"
              >
                <input
                  type="checkbox"
                  checked={sec.enabled}
                  onChange={() => toggleSection(sec.key)}
                  className="accent-[var(--dd-accent-teal)]"
                />
                <span className="truncate">{sec.title}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Optional AI Inclusion */}
        <div className="space-y-3 rounded-[var(--dd-radius-md)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] p-4">
          <div className="flex items-center gap-1.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
            <Sparkles
              className="h-3.5 w-3.5 text-[var(--dd-status-warning)]"
              aria-hidden="true"
            />
            5. Optional AI Interpretations (Never Required)
          </div>
          <p className="text-[0.75rem] leading-relaxed text-[var(--dd-text-secondary)]">
            Reports and PDF exports are generated 100% deterministically without
            Gemini. If you already generated AI interpretations for this
            dataset, you may optionally include them in a clearly labeled
            interpretive section.
          </p>

          <label
            className={cn(
              'flex items-start gap-2.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-2.5 text-[0.78125rem]',
              !hasValidAiBrief ? 'opacity-55' : 'cursor-pointer hover:bg-[var(--dd-surface-hover)]',
            )}
          >
            <input
              type="checkbox"
              disabled={!hasValidAiBrief}
              checked={includeModule08Brief && hasValidAiBrief}
              onChange={(e) => setIncludeModule08Brief(e.target.checked)}
              className="mt-0.5 accent-[var(--dd-accent-teal)]"
            />
            <div>
              <div className="font-medium text-[var(--dd-text-primary)]">
                Include AI Investigation Brief
              </div>
              <div className="text-[0.7rem] text-[var(--dd-text-muted)]">
                {hasValidAiBrief
                  ? 'Verified dataset-matched brief available. Labeled as AI-generated interpretation.'
                  : 'Not generated for this dataset yet — optional.'}
              </div>
            </div>
          </label>

          <label
            className={cn(
              'flex items-start gap-2.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] p-2.5 text-[0.78125rem]',
              !hasCaseAi ? 'opacity-55' : 'cursor-pointer hover:bg-[var(--dd-surface-hover)]',
            )}
          >
            <input
              type="checkbox"
              disabled={!hasCaseAi}
              checked={includeModule09CaseAnalyses && hasCaseAi}
              onChange={(e) => setIncludeModule09CaseAnalyses(e.target.checked)}
              className="mt-0.5 accent-[var(--dd-accent-teal)]"
            />
            <div>
              <div className="font-medium text-[var(--dd-text-primary)]">
                Include Case AI Analyses
              </div>
              <div className="text-[0.7rem] text-[var(--dd-text-muted)]">
                {hasCaseAi
                  ? `${activeCase?.aiAnalyses.length} case interpretation record(s) available.`
                  : 'Select a case with saved AI analyses to include (optional).'}
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Step 4: Findings, Statistical Columns & Charts */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Findings Picker */}
        <div className="space-y-2.5 rounded-[var(--dd-radius-md)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
              Findings ({selectedFindingIds.length}/
              {sources.investigation.insights.length})
            </span>
            <div className="flex gap-2 font-mono text-[0.6875rem]">
              <button
                type="button"
                onClick={() =>
                  setSelectedFindingIds(
                    sources.investigation.insights.map((f) => f.id),
                  )
                }
                className="cursor-pointer text-[var(--dd-accent-teal)] hover:underline"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelectedFindingIds([])}
                className="cursor-pointer text-[var(--dd-text-muted)] hover:underline"
              >
                None
              </button>
            </div>
          </div>
          <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {sources.investigation.insights.length === 0 ? (
              <p className="text-xs italic text-[var(--dd-text-muted)]">
                No deterministic findings detected for this dataset.
              </p>
            ) : (
              sources.investigation.insights.map((f) => {
                const checked = selectedFindingIds.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggleFinding(f.id)}
                    className="flex w-full cursor-pointer items-start gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 text-left text-[0.75rem] transition-colors hover:bg-[var(--dd-surface-hover)]"
                  >
                    {checked ? (
                      <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dd-accent-teal)]" />
                    ) : (
                      <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dd-text-muted)]" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[var(--dd-text-primary)]">
                        {f.title}
                      </div>
                      <div className="font-mono text-[0.65rem] text-[var(--dd-text-muted)]">
                        {f.severity.toUpperCase()} ·{' '}
                        {FINDING_CLASSIFICATION_LABELS[f.classification]}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Statistical Columns Picker */}
        <div className="space-y-2.5 rounded-[var(--dd-radius-md)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
              <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
              Stats Columns ({selectedStatColumnIds.length}/
              {allStatColumnIds.length})
            </span>
            <div className="flex gap-2 font-mono text-[0.6875rem]">
              <button
                type="button"
                onClick={() => setSelectedStatColumnIds(allStatColumnIds)}
                className="cursor-pointer text-[var(--dd-accent-teal)] hover:underline"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatColumnIds([])}
                className="cursor-pointer text-[var(--dd-text-muted)] hover:underline"
              >
                None
              </button>
            </div>
          </div>
          <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {[
              ...sources.stats.numericColumns.map((c) => ({
                id: c.columnId,
                name: c.name,
                kind: 'Numeric',
              })),
              ...sources.stats.categoricalColumns.map((c) => ({
                id: c.columnId,
                name: c.name,
                kind: 'Categorical',
              })),
            ].map((col) => {
              const checked = selectedStatColumnIds.includes(col.id);
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => toggleStatCol(col.id)}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 text-left text-[0.75rem] transition-colors hover:bg-[var(--dd-surface-hover)]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {checked ? (
                      <CheckSquare className="h-3.5 w-3.5 shrink-0 text-[var(--dd-accent-teal)]" />
                    ) : (
                      <Square className="h-3.5 w-3.5 shrink-0 text-[var(--dd-text-muted)]" />
                    )}
                    <span className="truncate text-[var(--dd-text-primary)]">
                      {col.name}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[0.65rem] text-[var(--dd-text-muted)]">
                    {col.kind}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* M06 Charts Picker */}
        <div
          data-testid="report-builder-charts-picker"
          className="space-y-2.5 rounded-[var(--dd-radius-md)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
              <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
              Charts ({selectedChartKeys.length}/{availableCharts.length})
            </span>
            <div className="flex gap-2 font-mono text-[0.6875rem]">
              <button
                type="button"
                onClick={() =>
                  setSelectedChartKeys(availableCharts.map(chartKey))
                }
                className="cursor-pointer text-[var(--dd-accent-teal)] hover:underline"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelectedChartKeys([])}
                className="cursor-pointer text-[var(--dd-text-muted)] hover:underline"
              >
                None
              </button>
            </div>
          </div>

          {prefill?.customChartsRequested &&
            studioChartKeySet.size > 0 && (
              <p
                data-testid="report-builder-studio-charts-notice"
                className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)] px-2.5 py-1.5 font-mono text-[0.6875rem] text-[var(--dd-text-primary)]"
              >
                Preserved {studioChartKeySet.size} validated chart
                {studioChartKeySet.size === 1 ? '' : 's'} from Visualization
                Studio.
              </p>
            )}

          {(prefill?.customChartNotice ||
            (prefill?.invalidCustomCharts &&
              prefill.invalidCustomCharts.length > 0)) && (
            <div
              role="status"
              data-testid="report-builder-invalid-charts-notice"
              className="space-y-1 rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-warning-border)] bg-[var(--dd-surface-recessed)] px-2.5 py-2 text-[0.71875rem] text-[var(--dd-text-secondary)]"
            >
              <div className="flex items-center gap-1.5 font-mono text-[0.6875rem] font-medium text-[var(--dd-status-warning)]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Chart handoff validation notice</span>
              </div>
              {prefill.customChartNotice && <p>{prefill.customChartNotice}</p>}
              {prefill.invalidCustomCharts &&
                prefill.invalidCustomCharts.length > 0 && (
                  <ul className="space-y-0.5 pl-4 text-[0.6875rem] text-[var(--dd-text-muted)] list-disc">
                    {prefill.invalidCustomCharts.map((item, idx) => (
                      <li key={`${item.title}-${idx}`}>
                        <span className="font-medium text-[var(--dd-text-primary)]">
                          {item.title}:
                        </span>{' '}
                        {item.reason}
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          )}

          <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {availableCharts.length === 0 ? (
              <p className="text-xs italic text-[var(--dd-text-muted)]">
                No schema-validated chart recommendations available.
              </p>
            ) : (
              availableCharts.map((cfg) => {
                const key = chartKey(cfg);
                const checked = selectedChartKeys.includes(key);
                const fromStudio = studioChartKeySet.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => toggleChart(key)}
                    className="flex w-full cursor-pointer items-start gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-subtle)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 text-left text-[0.75rem] transition-colors hover:bg-[var(--dd-surface-hover)]"
                  >
                    {checked ? (
                      <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dd-accent-teal)]" />
                    ) : (
                      <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dd-text-muted)]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-[var(--dd-text-primary)]">
                        {cfg.title}
                      </div>
                      <div className="font-mono text-[0.65rem] uppercase text-[var(--dd-text-muted)]">
                        {cfg.type}
                        {fromStudio ? ' · Studio Selection' : ' · Recommended'}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
