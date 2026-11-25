import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  RotateCcw,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { DossierLabel } from '@/components/ui/DossierLabel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { APP_CONFIG, type IntakeLimits } from '@/config/app.config';
import { useDataset } from '@/context/DatasetContext';
import {
  createDatasetFromDraft,
  EvidenceIntakeClient,
  toIntakeError,
} from '@/engine/intake';
import { useReducedMotion } from '@/hooks';
import type {
  IntakeError,
  IntakeStage,
  ParsedTableDraft,
  WorksheetInfo,
} from '@/types';
import { cn, formatBytes, formatCount } from '@/utils';
import { DataPreviewTable } from './DataPreviewTable';
import { ReplaceDatasetDialog } from './ReplaceDatasetDialog';

interface EvidenceIntakePanelProps {
  /** Optional custom limits (primarily for deterministic testing) */
  readonly limits?: IntakeLimits;
  /** Optional callback triggered after a dataset is registered */
  readonly onImportComplete?: () => void;
  /** Optional callback to dismiss intake without affecting the active dataset */
  readonly onCancel?: () => void;
}

interface ProgressState {
  readonly loadedBytes: number;
  readonly totalBytes: number;
}

interface PendingWorkbookState {
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly sheets: readonly WorksheetInfo[];
}

const DEFAULT_LIMITS: IntakeLimits = {
  maxFileSizeBytes: APP_CONFIG.intake.maxFileSizeBytes,
  maxRows: APP_CONFIG.intake.maxRows,
  maxColumns: APP_CONFIG.intake.maxColumns,
};

function describeDelimiter(delimiter?: string): string {
  if (!delimiter) return 'Auto';
  if (delimiter === ',') return 'Comma (,)';
  if (delimiter === '\t') return 'Tab (\\t)';
  if (delimiter === ';') return 'Semicolon (;)';
  if (delimiter === '|') return 'Pipe (|)';
  return `"${delimiter}"`;
}

/**
 * Full Module 02 Evidence Intake Bay.
 * Handles drag-and-drop & file-picker selection, pre-flight and content validation,
 * off-thread CSV/XLSX parsing, worksheet selection, live header toggling, bounded
 * data preview, replacement confirmation, and in-memory dataset registration.
 */
export function EvidenceIntakePanel({
  limits = DEFAULT_LIMITS,
  onImportComplete,
  onCancel,
}: EvidenceIntakePanelProps) {
  const { activeDataset, registerDataset } = useDataset();
  const prefersReducedMotion = useReducedMotion();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const clientRef = useRef<EvidenceIntakeClient | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [stage, setStage] = useState<IntakeStage>('empty');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileMeta, setSelectedFileMeta] = useState<{
    name: string;
    size: number;
    isCsv: boolean;
  } | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [hasHeaders, setHasHeaders] = useState<boolean>(true);
  const [pendingWorkbook, setPendingWorkbook] =
    useState<PendingWorkbookState | null>(null);
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');
  const [draft, setDraft] = useState<ParsedTableDraft | null>(null);
  const [error, setError] = useState<IntakeError | null>(null);
  const [replaceDialogOpen, setReplaceDialogOpen] = useState<boolean>(false);
  const [lastImportedSummary, setLastImportedSummary] = useState<{
    fileName: string;
    rowCount: number;
    columnCount: number;
    sheetName?: string;
  } | null>(null);

  const getClient = useCallback((): EvidenceIntakeClient => {
    if (!clientRef.current) {
      clientRef.current = new EvidenceIntakeClient();
    }
    return clientRef.current;
  }, []);

  // Clean up worker & temporary memory on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      clientRef.current?.cancelAndReset();
    };
  }, []);

  const resetIntake = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    clientRef.current?.cancelAndReset();
    setStage('empty');
    setSelectedFileMeta(null);
    setProgress(null);
    setPendingWorkbook(null);
    setSelectedSheetName('');
    setDraft(null);
    setError(null);
    setReplaceDialogOpen(false);
    setHasHeaders(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleDismissIntake = useCallback(() => {
    resetIntake();
    onCancel?.();
  }, [onCancel, resetIntake]);

  const handleCancelProcessing = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    clientRef.current?.cancelAndReset();
    setStage('empty');
    setProgress(null);
    setSelectedFileMeta(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const isCsv = file.name.toLowerCase().endsWith('.csv');
      setSelectedFileMeta({ name: file.name, size: file.size, isCsv });
      setError(null);
      setDraft(null);
      setPendingWorkbook(null);
      setSelectedSheetName('');
      setProgress(null);
      setHasHeaders(true);
      setStage('validating');

      try {
        const client = getClient();
        setStage('parsing');
        const result = await client.startFileIntake(file, {
          hasHeaders: true,
          limits,
          signal: controller.signal,
          onProgress: (loadedBytes, totalBytes) => {
            if (controller.signal.aborted) return;
            setProgress({ loadedBytes, totalBytes });
          },
        });

        if (controller.signal.aborted) return;

        if (result.kind === 'worksheet_selection') {
          const firstNonEmpty =
            result.sheets.find((s) => !s.isEmpty)?.name ??
            result.sheets[0]?.name ??
            '';
          setPendingWorkbook({
            fileName: result.fileName,
            fileSizeBytes: result.fileSizeBytes,
            sheets: result.sheets,
          });
          setSelectedSheetName(firstNonEmpty);
          setProgress(null);
          setStage('worksheet_selection');
          return;
        }

        setDraft(result.draft);
        setSelectedSheetName(result.draft.sheetName ?? '');
        setProgress(null);
        setStage('preview_ready');
      } catch (err) {
        setProgress(null);
        const intakeError = toIntakeError(err);
        if (intakeError.code === 'CANCELLED' || controller.signal.aborted) {
          setStage('empty');
          return;
        }
        clientRef.current?.cancelAndReset();
        setError(intakeError);
        setStage('error');
      }
    },
    [getClient, limits],
  );

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void processFile(file);
    }
    // Reset input value so selecting the same file again after retry fires onChange
    event.target.value = '';
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleLoadWorksheet = async (sheetName: string) => {
    if (!sheetName) return;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(null);
    setProgress(null);
    setSelectedSheetName(sheetName);
    setStage('parsing');

    try {
      const client = getClient();
      const nextDraft = await client.selectWorksheet(
        sheetName,
        hasHeaders,
        limits,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setDraft(nextDraft);
      setStage('preview_ready');
    } catch (err) {
      const intakeError = toIntakeError(err);
      if (intakeError.code === 'CANCELLED' || controller.signal.aborted) {
        setStage('empty');
        return;
      }
      setError(intakeError);
      setStage('error');
    }
  };

  const handleToggleHeaders = async (nextHasHeaders: boolean) => {
    setHasHeaders(nextHasHeaders);
    if (!draft) return;

    try {
      const client = getClient();
      const updatedDraft = await client.updateHasHeaders(
        nextHasHeaders,
        limits,
      );
      setDraft(updatedDraft);
      setError(null);
    } catch (err) {
      setError(toIntakeError(err));
      setStage('error');
    }
  };

  const commitImport = useCallback(() => {
    if (!draft) return;
    setStage('importing');
    const dataset = createDatasetFromDraft(draft);
    registerDataset(dataset);
    // Terminate worker immediately after registration to release workbook/raw parse buffers
    clientRef.current?.cancelAndReset();

    setLastImportedSummary({
      fileName: dataset.fileName,
      rowCount: dataset.rowCount,
      columnCount: dataset.columnCount,
      ...(dataset.sheetName !== undefined
        ? { sheetName: dataset.sheetName }
        : {}),
    });
    setDraft(null);
    setPendingWorkbook(null);
    setProgress(null);
    setReplaceDialogOpen(false);
    setStage('import_success');
    onImportComplete?.();
  }, [draft, onImportComplete, registerDataset]);

  const handleImportClick = () => {
    if (!draft) return;
    if (activeDataset) {
      setReplaceDialogOpen(true);
      return;
    }
    commitImport();
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const maxSizeLabel =
    limits.maxFileSizeBytes >= 1024 * 1024
      ? `${Math.round(limits.maxFileSizeBytes / (1024 * 1024))} MB`
      : formatBytes(limits.maxFileSizeBytes);
  const progressPercent =
    progress && progress.totalBytes > 0
      ? Math.min(
          100,
          Math.round((progress.loadedBytes / progress.totalBytes) * 100),
        )
      : null;

  return (
    <section aria-label="Evidence Intake Bay" className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept={APP_CONFIG.intake.acceptAttribute}
        onChange={handleFileInputChange}
        className="sr-only"
        aria-label="Select CSV or Excel file"
        data-testid="evidence-file-input"
      />

      {/* ── STAGE 1: EMPTY INTAKE DROPZONE ──────────────────────────────── */}
      {stage === 'empty' && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'dd-surface-recessed relative flex flex-col justify-between border border-dashed p-6 transition-colors duration-150',
            isDragging
              ? 'border-[var(--dd-accent-teal)] bg-[var(--dd-accent-teal-dim)]'
              : 'border-[var(--dd-border-default)] hover:border-[var(--dd-border-strong)]',
          )}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <DossierLabel
                code={onCancel ? 'REPLACE DATASET' : 'INTAKE BAY'}
                label={
                  onCancel && activeDataset
                    ? `Current: ${activeDataset.fileName}`
                    : 'Local File Registration'
                }
              />
              <div className="flex items-center gap-2.5">
                {isDragging && (
                  <StatusIndicator tone="verified" label="Release to Scan" />
                )}
                {onCancel && (
                  <button
                    type="button"
                    onClick={handleDismissIntake}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3 py-1.5 text-[0.75rem] font-medium text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)] whitespace-nowrap"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Cancel</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3.5 pt-1">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-surface-primary)] text-[var(--dd-accent-teal)]"
                aria-hidden="true"
              >
                <Upload className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-[0.9375rem] font-medium text-[var(--dd-text-primary)]">
                  {onCancel
                    ? 'Drop a replacement CSV or Excel (.xlsx) file here'
                    : 'Drop a CSV or Excel (.xlsx) file here'}
                </h3>
                <p className="text-[0.8125rem] leading-relaxed text-[var(--dd-text-secondary)]">
                  {onCancel
                    ? 'Your active dataset stays loaded until you confirm a replacement. Dismiss this panel at any time to keep working with the current file.'
                    : 'Files are parsed and validated locally inside your browser. Inspect headers, warnings, and records before registering the dataset.'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3 border-t border-[var(--dd-border-subtle)] pt-4">
            <button
              type="button"
              onClick={openFilePicker}
              className="w-full cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal)] px-4 py-2.5 text-[0.8125rem] font-medium text-[var(--dd-text-inverse)] transition-colors hover:bg-[var(--dd-accent-teal-hover)]"
            >
              Select Evidence File (.csv, .xlsx)
            </button>

            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-mono text-[0.7rem] text-[var(--dd-text-muted)] dd-tabular">
              <span>Formats: .csv · .xlsx</span>
              <span aria-hidden="true">/</span>
              <span>Max {maxSizeLabel}</span>
              <span aria-hidden="true">/</span>
              <span>
                Up to {formatCount(limits.maxRows)} rows ·{' '}
                {formatCount(limits.maxColumns)} cols
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── STAGE 2: VALIDATING / PARSING ───────────────────────────────── */}
      {(stage === 'validating' || stage === 'parsing' || stage === 'importing') && (
        <div
          role="status"
          aria-live="polite"
          className="dd-surface-primary relative overflow-hidden p-6 space-y-5"
        >
          {!prefersReducedMotion && (
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px] overflow-hidden"
              aria-hidden="true"
            >
              <div className="dd-anim-scan-x h-full w-1/2 bg-[linear-gradient(90deg,transparent,var(--dd-accent-teal),transparent)]" />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <DossierLabel
                code="FORENSIC SCAN"
                label={
                  stage === 'validating'
                    ? 'Validating File Structure'
                    : stage === 'importing'
                      ? 'Registering Dataset'
                      : 'Parsing Tabular Records'
                }
              />
              {selectedFileMeta && (
                <p className="truncate font-mono text-[0.8125rem] text-[var(--dd-text-primary)]">
                  {selectedFileMeta.name}{' '}
                  <span className="text-[var(--dd-text-muted)] dd-tabular">
                    ({formatBytes(selectedFileMeta.size)})
                  </span>
                </p>
              )}
            </div>

            {stage !== 'importing' && (
              <button
                type="button"
                onClick={handleCancelProcessing}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-3 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Cancel</span>
              </button>
            )}
          </div>

          {/* Honest progress indicator: measurable byte progress for CSV, indeterminate for XLSX */}
          {progress && progressPercent !== null ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between font-mono text-[0.72rem] text-[var(--dd-text-secondary)] dd-tabular">
                <span>
                  Processed {formatBytes(progress.loadedBytes)} of{' '}
                  {formatBytes(progress.totalBytes)}
                </span>
                <span className="text-[var(--dd-accent-teal)]">
                  {progressPercent}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-[var(--dd-radius-xs)] bg-[var(--dd-surface-recessed)]">
                <div
                  className="h-full bg-[var(--dd-accent-teal)] transition-transform duration-150 origin-left"
                  style={{ transform: `scaleX(${progressPercent / 100})` }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-mono text-[0.72rem] text-[var(--dd-text-muted)]">
                Reading workbook structure and validating cell boundaries...
              </p>
              <div
                className={cn(
                  'h-1.5 w-full overflow-hidden rounded-[var(--dd-radius-xs)] bg-[var(--dd-surface-recessed)]',
                  !prefersReducedMotion && 'dd-anim-data-load',
                )}
              />
            </div>
          )}
        </div>
      )}

      {/* ── STAGE 3: WORKSHEET SELECTION (MULTI-SHEET XLSX) ─────────────── */}
      {stage === 'worksheet_selection' && pendingWorkbook && (
        <div className="dd-surface-elevated dd-anim-file-enter space-y-5 p-6">
          <div className="flex flex-col gap-3 border-b border-[var(--dd-border-subtle)] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 min-w-0">
              <DossierLabel
                code="WORKBOOK INSPECTION"
                label="Select Target Worksheet"
              />
              <h3 className="truncate text-[1.0625rem] font-semibold text-[var(--dd-text-primary)]">
                {pendingWorkbook.fileName}
              </h3>
              <p className="font-mono text-[0.72rem] text-[var(--dd-text-muted)] dd-tabular">
                {pendingWorkbook.sheets.length} worksheets detected ·{' '}
                {formatBytes(pendingWorkbook.fileSizeBytes)}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel ? handleDismissIntake : resetIntake}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3 py-1.5 text-[0.75rem] text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)] self-start sm:self-auto"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Cancel</span>
            </button>
          </div>

          <p className="text-[0.8125rem] text-[var(--dd-text-secondary)]">
            This Excel workbook contains multiple worksheets. Choose one
            worksheet to parse and preview before importing.
          </p>

          <div
            role="radiogroup"
            aria-label="Available worksheets"
            className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
          >
            {pendingWorkbook.sheets.map((sheet) => {
              const isSelected = selectedSheetName === sheet.name;
              return (
                <button
                  key={sheet.name}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedSheetName(sheet.name)}
                  className={cn(
                    'flex cursor-pointer items-start justify-between gap-3 rounded-[var(--dd-radius-sm)] border p-3.5 text-left transition-colors',
                    isSelected
                      ? 'border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal-dim)]'
                      : 'border-[var(--dd-border-subtle)] bg-[var(--dd-surface-primary)] hover:border-[var(--dd-border-default)]',
                  )}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Layers
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        isSelected
                          ? 'text-[var(--dd-accent-teal)]'
                          : 'text-[var(--dd-text-muted)]',
                      )}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <span className="block truncate text-[0.875rem] font-medium text-[var(--dd-text-primary)]">
                        {sheet.name}
                      </span>
                      <span className="block font-mono text-[0.7rem] text-[var(--dd-text-muted)] dd-tabular">
                        {sheet.isEmpty
                          ? 'Empty worksheet'
                          : `~${formatCount(sheet.estimatedRows)} rows · ${formatCount(sheet.estimatedColumns)} cols`}
                      </span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'font-mono text-[0.7rem] shrink-0',
                      isSelected
                        ? 'text-[var(--dd-accent-teal)]'
                        : 'text-[var(--dd-text-muted)]',
                    )}
                  >
                    {isSelected ? '◆' : '○'}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--dd-border-subtle)] pt-4">
            <button
              type="button"
              onClick={openFilePicker}
              className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)]"
            >
              Choose Different File
            </button>
            <button
              type="button"
              disabled={!selectedSheetName}
              onClick={() => void handleLoadWorksheet(selectedSheetName)}
              className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-inverse)] transition-colors hover:bg-[var(--dd-accent-teal-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Preview Worksheet
            </button>
          </div>
        </div>
      )}

      {/* ── STAGE 4: DATA PREVIEW READY ─────────────────────────────────── */}
      {stage === 'preview_ready' && draft && (
        <div className="dd-surface-elevated dd-anim-file-enter space-y-5 p-6">
          {/* Preview Header */}
          <div className="flex flex-col gap-4 border-b border-[var(--dd-border-subtle)] pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <DossierLabel
                  code="PRE-IMPORT PREVIEW"
                  label={draft.fileType}
                />
                <StatusIndicator
                  tone={draft.warnings.length > 0 ? 'warning' : 'verified'}
                  label={
                    draft.warnings.length > 0
                      ? `${draft.warnings.length} Recoverable Notice${draft.warnings.length === 1 ? '' : 's'}`
                      : 'Validated'
                  }
                />
              </div>

              <div className="flex items-center gap-2.5">
                <FileSpreadsheet
                  className="h-4 w-4 shrink-0 text-[var(--dd-accent-teal)]"
                  aria-hidden="true"
                />
                <h3 className="truncate text-[1.0625rem] font-semibold text-[var(--dd-text-primary)]">
                  {draft.fileName}
                </h3>
              </div>

              {/* Clean unboxed technical summary metadata */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.72rem] text-[var(--dd-text-muted)] dd-tabular">
                <span>
                  Format:{' '}
                  <span className="text-[var(--dd-text-secondary)] uppercase">
                    {draft.fileType}
                  </span>
                </span>
                <span aria-hidden="true">/</span>
                <span>
                  Rows:{' '}
                  <span className="text-[var(--dd-text-primary)]">
                    {formatCount(draft.rowCount)}
                  </span>
                </span>
                <span aria-hidden="true">/</span>
                <span>
                  Columns:{' '}
                  <span className="text-[var(--dd-text-primary)]">
                    {formatCount(draft.columnCount)}
                  </span>
                </span>
                <span aria-hidden="true">/</span>
                <span>
                  Size:{' '}
                  <span className="text-[var(--dd-text-secondary)]">
                    {formatBytes(draft.fileSizeBytes)}
                  </span>
                </span>
                {draft.delimiter && (
                  <>
                    <span aria-hidden="true">/</span>
                    <span>
                      Delimiter:{' '}
                      <span className="text-[var(--dd-text-secondary)]">
                        {describeDelimiter(draft.delimiter)}
                      </span>
                    </span>
                  </>
                )}
                {draft.sheetName && (
                  <>
                    <span aria-hidden="true">/</span>
                    <span>
                      Worksheet:{' '}
                      <span className="text-[var(--dd-text-secondary)]">
                        {draft.sheetName}
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Header & Worksheet Controls */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {draft.availableSheets && draft.availableSheets.length > 1 && (
                <label className="flex items-center gap-2 font-mono text-[0.75rem] text-[var(--dd-text-secondary)]">
                  <span>Sheet:</span>
                  <select
                    value={draft.sheetName ?? ''}
                    onChange={(e) => void handleLoadWorksheet(e.target.value)}
                    aria-label="Switch Excel worksheet"
                    className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-recessed)] px-2.5 py-1.5 font-mono text-[0.75rem] text-[var(--dd-text-primary)]"
                  >
                    {draft.availableSheets.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3 py-1.5 text-[0.78rem] text-[var(--dd-text-secondary)] hover:border-[var(--dd-border-strong)]">
                <input
                  type="checkbox"
                  checked={hasHeaders}
                  onChange={(e) => void handleToggleHeaders(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--dd-accent-teal)]"
                />
                <span className="whitespace-nowrap">
                  First row contains column headers
                </span>
              </label>
            </div>
          </div>

          {/* Recoverable Validation Warnings */}
          {draft.warnings.length > 0 && (
            <div
              role="region"
              aria-label="Validation warnings"
              className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-warning-border)] bg-[var(--dd-status-warning-dim)] p-4 space-y-2"
            >
              <div className="flex items-center gap-2 font-mono text-[0.72rem] font-medium tracking-[0.05em] text-[var(--dd-status-warning)] uppercase">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Validation Notices (Recoverable)</span>
              </div>
              <ul className="space-y-1.5 text-[0.8125rem] text-[var(--dd-text-primary)]">
                {draft.warnings.map((warning, idx) => (
                  <li key={`${warning.code}-${idx}`} className="leading-relaxed">
                    <span>{warning.message}</span>
                    {warning.details && (
                      <span className="ml-1.5 font-mono text-[0.72rem] text-[var(--dd-text-secondary)]">
                        ({warning.details})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Scrollable Preview Table (first 100 rows max) */}
          <DataPreviewTable
            columns={draft.columns}
            rows={draft.rows}
            totalRowCount={draft.rowCount}
          />

          {/* Preview Footer Actions */}
          <div className="flex flex-col gap-3 border-t border-[var(--dd-border-subtle)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[0.72rem] text-[var(--dd-text-muted)]">
              Stored in browser memory only. Refreshing clears imported data.
            </p>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onCancel ? handleDismissIntake : resetIntake}
                className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)]"
              >
                {onCancel ? 'Cancel' : 'Discard'}
              </button>
              <button
                type="button"
                onClick={openFilePicker}
                className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)]"
              >
                Choose Different File
              </button>
              <button
                type="button"
                onClick={handleImportClick}
                className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-inverse)] transition-colors hover:bg-[var(--dd-accent-teal-hover)]"
              >
                Import Dataset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STAGE 5: IMPORT SUCCESS ─────────────────────────────────────── */}
      {stage === 'import_success' && lastImportedSummary && (
        <div
          role="status"
          aria-live="polite"
          className="dd-surface-primary dd-anim-file-enter flex flex-col gap-4 border border-[var(--dd-status-verified-border)] p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2
              className="mt-0.5 h-5 w-5 shrink-0 text-[var(--dd-status-verified)]"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="text-[0.9375rem] font-medium text-[var(--dd-text-primary)]">
                Dataset registered into active workspace
              </p>
              <p className="font-mono text-[0.75rem] text-[var(--dd-text-secondary)] dd-tabular">
                {lastImportedSummary.fileName}
                {lastImportedSummary.sheetName
                  ? ` (${lastImportedSummary.sheetName})`
                  : ''}{' '}
                · {formatCount(lastImportedSummary.rowCount)} rows ×{' '}
                {formatCount(lastImportedSummary.columnCount)} columns
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={resetIntake}
            className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-secondary)] transition-colors hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)] whitespace-nowrap shrink-0"
          >
            Import Another File
          </button>
        </div>
      )}

      {/* ── STAGE 6: FATAL VALIDATION / PARSE ERROR ─────────────────────── */}
      {stage === 'error' && error && (
        <div
          role="alert"
          className="dd-surface-primary dd-anim-file-enter space-y-4 border border-[var(--dd-status-anomaly-border)] p-6"
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-anomaly-border)] bg-[var(--dd-status-anomaly-dim)] text-[var(--dd-status-anomaly)]"
              aria-hidden="true"
            >
              <XCircle className="h-4 w-4" />
            </div>
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-[0.68rem] tracking-[0.08em] text-[var(--dd-status-anomaly)] uppercase">
                  Import Rejected · {error.code}
                </span>
              </div>
              <h3 className="text-[0.9375rem] font-semibold text-[var(--dd-text-primary)]">
                {error.title}
              </h3>
              <p className="text-[0.8125rem] leading-relaxed text-[var(--dd-text-secondary)]">
                {error.message}
              </p>
              {error.details && (
                <p className="font-mono text-[0.72rem] text-[var(--dd-text-muted)]">
                  {error.details}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[var(--dd-border-subtle)] pt-4">
            {pendingWorkbook && pendingWorkbook.sheets.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStage('worksheet_selection');
                }}
                className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)]"
              >
                Choose Another Worksheet
              </button>
            )}
            {onCancel && (
              <button
                type="button"
                onClick={handleDismissIntake}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-primary)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-secondary)] hover:border-[var(--dd-border-strong)] hover:text-[var(--dd-text-primary)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Cancel</span>
              </button>
            )}
            <button
              type="button"
              onClick={resetIntake}
              className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset Intake</span>
            </button>
            <button
              type="button"
              onClick={openFilePicker}
              className="cursor-pointer rounded-[var(--dd-radius-sm)] border border-[var(--dd-accent-teal-border)] bg-[var(--dd-accent-teal)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--dd-text-inverse)] hover:bg-[var(--dd-accent-teal-hover)]"
            >
              Select Another File
            </button>
          </div>
        </div>
      )}

      {/* ── DATASET REPLACEMENT CONFIRMATION DIALOG ─────────────────────── */}
      {activeDataset && draft && (
        <ReplaceDatasetDialog
          open={replaceDialogOpen}
          currentFileName={activeDataset.fileName}
          currentRowCount={activeDataset.rowCount}
          incomingFileName={draft.fileName}
          incomingRowCount={draft.rowCount}
          onCancel={() => setReplaceDialogOpen(false)}
          onConfirm={commitImport}
        />
      )}
    </section>
  );
}
