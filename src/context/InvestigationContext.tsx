import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useDataset } from '@/context/DatasetContext';
import {
  addCaseNote,
  addEvidenceToCase,
  archiveCase,
  attachFindingToCase,
  changeCasePriority,
  changeCaseStatus,
  createInvestigationCase,
  deleteCaseNote,
  editCaseNote,
  partitionCasesByDataset,
  recordCaseAiAnalysis,
  removeEvidenceFromCase,
  reopenArchivedCase,
  updateCaseDetails,
  type CreateCaseResult,
} from '@/engine/cases';
import type {
  AiBriefGenerationData,
  AiInvestigationResponseMeta,
  CaseAiAnalysisRecord,
  CaseEvidenceItem,
  CaseNoteType,
  DatasetInsight,
  InvestigationCase,
  InvestigationCasePriority,
  InvestigationCaseStatus,
} from '@/types';

export interface DatasetScopedAiBrief {
  readonly datasetId: string;
  readonly profiledAt: number;
  readonly data: AiBriefGenerationData;
  readonly meta: AiInvestigationResponseMeta | null;
}

export interface CreateWorkspaceCaseInput {
  readonly title: string;
  readonly description?: string;
  readonly priority?: InvestigationCasePriority;
  readonly initialFindings?: readonly DatasetInsight[];
  readonly initialEvidence?: readonly CaseEvidenceItem[];
}

export interface InvestigationContextValue {
  readonly allCases: readonly InvestigationCase[];
  readonly currentDatasetCases: readonly InvestigationCase[];
  readonly previousDatasetCases: readonly InvestigationCase[];
  readonly verifiedAiBrief: DatasetScopedAiBrief | null;
  readonly publishAiBrief: (
    datasetId: string,
    profiledAt: number,
    data: AiBriefGenerationData,
    meta: AiInvestigationResponseMeta | null,
  ) => void;
  readonly clearAiBrief: () => void;
  readonly createCase: (
    input: CreateWorkspaceCaseInput,
  ) => CreateCaseResult | null;
  readonly updateCase: (
    caseId: string,
    updates: {
      readonly title?: string;
      readonly description?: string;
      readonly conclusion?: string;
    },
  ) => void;
  readonly setCaseStatus: (
    caseId: string,
    status: InvestigationCaseStatus,
  ) => void;
  readonly setCasePriority: (
    caseId: string,
    priority: InvestigationCasePriority,
  ) => void;
  readonly archiveCaseById: (caseId: string) => void;
  readonly reopenCaseById: (caseId: string) => void;
  readonly attachFinding: (
    caseId: string,
    finding: DatasetInsight,
    validFindingIds: ReadonlySet<string>,
    asRelated?: boolean,
  ) => boolean;
  readonly addEvidence: (caseId: string, item: CaseEvidenceItem) => boolean;
  readonly removeEvidence: (caseId: string, evidenceId: string) => void;
  readonly addNote: (
    caseId: string,
    input: {
      readonly type: CaseNoteType;
      readonly text: string;
      readonly supportingEvidenceIds?: readonly string[];
    },
  ) => void;
  readonly editNote: (
    caseId: string,
    noteId: string,
    updates: {
      readonly type?: CaseNoteType;
      readonly text?: string;
      readonly supportingEvidenceIds?: readonly string[];
    },
  ) => void;
  readonly deleteNote: (caseId: string, noteId: string) => void;
  readonly saveCaseAiAnalysis: (
    caseId: string,
    record: CaseAiAnalysisRecord,
  ) => boolean;
}

const InvestigationContext = createContext<InvestigationContextValue | null>(
  null,
);

interface InvestigationProviderProps {
  readonly children: ReactNode;
}

/**
 * Session-scoped Integrated Investigation Center state provider (Module 09).
 *
 * Strictly in-memory: never writes raw spreadsheet rows or uploaded data to
 * localStorage/sessionStorage. Enforces dataset identity isolation so cases
 * and Module 08 AI briefs from a previous dataset are never silently mixed
 * with a newly imported or cleared dataset.
 */
export function InvestigationProvider({
  children,
}: InvestigationProviderProps) {
  const { activeDataset, datasetProfile } = useDataset();

  const [cases, setCases] = useState<readonly InvestigationCase[]>([]);
  const casesRef = useRef<readonly InvestigationCase[]>(cases);
  casesRef.current = cases;

  const [aiBrief, setAiBrief] = useState<DatasetScopedAiBrief | null>(null);

  const activeDatasetId = activeDataset?.id ?? null;
  const activeProfiledAt = datasetProfile?.profiledAt ?? null;

  // Immediately clear any Module 08 AI brief when dataset is cleared or replaced
  useEffect(() => {
    if (!activeDatasetId || !activeProfiledAt) {
      setAiBrief(null);
      return;
    }
    setAiBrief((prev) =>
      prev &&
      prev.datasetId === activeDatasetId &&
      prev.profiledAt === activeProfiledAt
        ? prev
        : null,
    );
  }, [activeDatasetId, activeProfiledAt]);

  const publishAiBrief = useCallback(
    (
      datasetId: string,
      profiledAt: number,
      data: AiBriefGenerationData,
      meta: AiInvestigationResponseMeta | null,
    ) => {
      setAiBrief({ datasetId, profiledAt, data, meta });
    },
    [],
  );

  const clearAiBrief = useCallback(() => {
    setAiBrief(null);
  }, []);

  // Defensive guarantee: expose AI brief ONLY when its dataset identity matches
  const verifiedAiBrief = useMemo<DatasetScopedAiBrief | null>(() => {
    if (!activeDatasetId || !activeProfiledAt || !aiBrief) return null;
    if (
      aiBrief.datasetId !== activeDatasetId ||
      aiBrief.profiledAt !== activeProfiledAt
    ) {
      return null;
    }
    return aiBrief;
  }, [activeDatasetId, activeProfiledAt, aiBrief]);

  const { currentDatasetCases, previousDatasetCases } = useMemo(
    () => partitionCasesByDataset(cases, activeDatasetId),
    [cases, activeDatasetId],
  );

  const createCase = useCallback(
    (input: CreateWorkspaceCaseInput): CreateCaseResult | null => {
      if (!activeDataset || !datasetProfile) return null;

      const result = createInvestigationCase(casesRef.current, {
        title: input.title,
        description: input.description,
        priority: input.priority,
        datasetId: activeDataset.id,
        datasetFileName: activeDataset.fileName,
        datasetProfiledAt: datasetProfile.profiledAt,
        initialFindings: input.initialFindings,
        initialEvidence: input.initialEvidence,
      });

      if (result.created) {
        const next = [result.caseItem, ...casesRef.current];
        casesRef.current = next;
        setCases(next);
      }

      return result;
    },
    [activeDataset, datasetProfile],
  );

  const updateCase = useCallback(
    (
      caseId: string,
      updates: {
        readonly title?: string;
        readonly description?: string;
        readonly conclusion?: string;
      },
    ) => {
      setCases((prev) =>
        prev.map((c) => (c.id === caseId ? updateCaseDetails(c, updates) : c)),
      );
    },
    [],
  );

  const setCaseStatus = useCallback(
    (caseId: string, status: InvestigationCaseStatus) => {
      setCases((prev) =>
        prev.map((c) => (c.id === caseId ? changeCaseStatus(c, status) : c)),
      );
    },
    [],
  );

  const setCasePriority = useCallback(
    (caseId: string, priority: InvestigationCasePriority) => {
      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId ? changeCasePriority(c, priority) : c,
        ),
      );
    },
    [],
  );

  const archiveCaseById = useCallback((caseId: string) => {
    setCases((prev) =>
      prev.map((c) => (c.id === caseId ? archiveCase(c) : c)),
    );
  }, []);

  const reopenCaseById = useCallback((caseId: string) => {
    setCases((prev) =>
      prev.map((c) => (c.id === caseId ? reopenArchivedCase(c) : c)),
    );
  }, []);

  const attachFinding = useCallback(
    (
      caseId: string,
      finding: DatasetInsight,
      validFindingIds: ReadonlySet<string>,
      asRelated = false,
    ): boolean => {
      if (!activeDatasetId) return false;
      const target = casesRef.current.find((c) => c.id === caseId);
      if (!target || target.datasetId !== activeDatasetId) return false;
      if (!validFindingIds.has(finding.id)) return false;

      let attached = false;
      setCases((prev) =>
        prev.map((c) => {
          if (c.id !== caseId) return c;
          const updated = attachFindingToCase(
            c,
            finding,
            activeDatasetId,
            validFindingIds,
            Date.now(),
            asRelated,
          );
          if (updated !== c) attached = true;
          return updated;
        }),
      );
      return attached || target.findingIds.includes(finding.id);
    },
    [activeDatasetId],
  );

  const addEvidence = useCallback(
    (caseId: string, item: CaseEvidenceItem): boolean => {
      if (!activeDatasetId) return false;
      const target = casesRef.current.find((c) => c.id === caseId);
      if (!target || target.datasetId !== activeDatasetId) return false;

      let added = false;
      setCases((prev) =>
        prev.map((c) => {
          if (c.id !== caseId) return c;
          const updated = addEvidenceToCase(c, item, activeDatasetId);
          if (updated !== c) added = true;
          return updated;
        }),
      );
      return added;
    },
    [activeDatasetId],
  );

  const removeEvidence = useCallback((caseId: string, evidenceId: string) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId ? removeEvidenceFromCase(c, evidenceId) : c,
      ),
    );
  }, []);

  const addNote = useCallback(
    (
      caseId: string,
      input: {
        readonly type: CaseNoteType;
        readonly text: string;
        readonly supportingEvidenceIds?: readonly string[];
      },
    ) => {
      setCases((prev) =>
        prev.map((c) => (c.id === caseId ? addCaseNote(c, input) : c)),
      );
    },
    [],
  );

  const editNote = useCallback(
    (
      caseId: string,
      noteId: string,
      updates: {
        readonly type?: CaseNoteType;
        readonly text?: string;
        readonly supportingEvidenceIds?: readonly string[];
      },
    ) => {
      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId ? editCaseNote(c, noteId, updates) : c,
        ),
      );
    },
    [],
  );

  const deleteNote = useCallback((caseId: string, noteId: string) => {
    setCases((prev) =>
      prev.map((c) => (c.id === caseId ? deleteCaseNote(c, noteId) : c)),
    );
  }, []);

  const saveCaseAiAnalysis = useCallback(
    (caseId: string, record: CaseAiAnalysisRecord): boolean => {
      if (!activeDatasetId) return false;
      const target = casesRef.current.find((c) => c.id === caseId);
      if (!target || target.datasetId !== activeDatasetId) return false;

      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId
            ? recordCaseAiAnalysis(c, record, activeDatasetId)
            : c,
        ),
      );
      return true;
    },
    [activeDatasetId],
  );

  const value = useMemo<InvestigationContextValue>(
    () => ({
      allCases: cases,
      currentDatasetCases,
      previousDatasetCases,
      verifiedAiBrief,
      publishAiBrief,
      clearAiBrief,
      createCase,
      updateCase,
      setCaseStatus,
      setCasePriority,
      archiveCaseById,
      reopenCaseById,
      attachFinding,
      addEvidence,
      removeEvidence,
      addNote,
      editNote,
      deleteNote,
      saveCaseAiAnalysis,
    }),
    [
      cases,
      currentDatasetCases,
      previousDatasetCases,
      verifiedAiBrief,
      publishAiBrief,
      clearAiBrief,
      createCase,
      updateCase,
      setCaseStatus,
      setCasePriority,
      archiveCaseById,
      reopenCaseById,
      attachFinding,
      addEvidence,
      removeEvidence,
      addNote,
      editNote,
      deleteNote,
      saveCaseAiAnalysis,
    ],
  );

  return (
    <InvestigationContext.Provider value={value}>
      {children}
    </InvestigationContext.Provider>
  );
}

export function useInvestigation(): InvestigationContextValue {
  const ctx = useContext(InvestigationContext);
  if (!ctx) {
    throw new Error(
      'useInvestigation must be used within an InvestigationProvider',
    );
  }
  return ctx;
}

export function useOptionalInvestigation(): InvestigationContextValue | null {
  return useContext(InvestigationContext);
}
