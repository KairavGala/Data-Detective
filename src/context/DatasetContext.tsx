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
import {
  DatasetProfilingClient,
  DEFAULT_MISSING_VALUE_POLICY,
  ProfilingCancelledError,
} from '@/engine/profiling';
import type {
  DatasetProfileSummary,
  ImportedDataset,
  MissingValuePolicy,
  ProfilingStatus,
} from '@/types';

export interface DatasetContextValue {
  readonly activeDataset: ImportedDataset | null;
  readonly registerDataset: (dataset: ImportedDataset) => void;
  readonly clearDataset: () => void;
  readonly datasetProfile: DatasetProfileSummary | null;
  readonly profilingStatus: ProfilingStatus;
  readonly profilingError: string | null;
  readonly missingValuePolicy: MissingValuePolicy;
  readonly updateMissingValuePolicy: (policy: MissingValuePolicy) => void;
  readonly reprofileDataset: () => void;
}

const DatasetContext = createContext<DatasetContextValue | null>(null);

interface DatasetProviderProps {
  readonly children: ReactNode;
}

/**
 * Single source of truth for the active imported dataset and its Module 03
 * schema & quality profile.
 * Strictly in-memory: neither raw dataset contents nor profiling results are
 * persisted to localStorage/sessionStorage or transmitted to any server.
 */
export function DatasetProvider({ children }: DatasetProviderProps) {
  const [activeDataset, setActiveDataset] = useState<ImportedDataset | null>(
    null,
  );
  const [datasetProfile, setDatasetProfile] =
    useState<DatasetProfileSummary | null>(null);
  const [profilingStatus, setProfilingStatus] =
    useState<ProfilingStatus>('idle');
  const [profilingError, setProfilingError] = useState<string | null>(null);
  const [missingValuePolicy, setMissingValuePolicy] =
    useState<MissingValuePolicy>(DEFAULT_MISSING_VALUE_POLICY);
  const [profileNonce, setProfileNonce] = useState<number>(0);

  const profilingClientRef = useRef<DatasetProfilingClient | null>(null);
  const activeRunIdRef = useRef<number>(0);

  const getProfilingClient = useCallback(() => {
    if (!profilingClientRef.current) {
      profilingClientRef.current = new DatasetProfilingClient();
    }
    return profilingClientRef.current;
  }, []);

  // Terminate any active profiling worker when provider unmounts
  useEffect(() => {
    return () => {
      profilingClientRef.current?.cancelAndTerminate();
      profilingClientRef.current = null;
    };
  }, []);

  // Automatically profile whenever activeDataset, missingValuePolicy, or manual retry changes
  useEffect(() => {
    const runId = ++activeRunIdRef.current;
    const client = getProfilingClient();

    if (!activeDataset) {
      client.cancelAndTerminate();
      setDatasetProfile(null);
      setProfilingStatus('idle');
      setProfilingError(null);
      return;
    }

    const targetDatasetId = activeDataset.id;
    const controller = new AbortController();

    // Immediately invalidate any previous dataset's profile
    setDatasetProfile((current) =>
      current && current.datasetId === targetDatasetId ? current : null,
    );
    setProfilingStatus('profiling');
    setProfilingError(null);

    void client
      .profile(activeDataset, {
        missingValuePolicy,
        signal: controller.signal,
      })
      .then((profile) => {
        if (
          controller.signal.aborted ||
          activeRunIdRef.current !== runId ||
          profile.datasetId !== targetDatasetId
        ) {
          return;
        }
        setDatasetProfile(profile);
        setProfilingStatus('ready');
        setProfilingError(null);
      })
      .catch((err: unknown) => {
        if (
          controller.signal.aborted ||
          activeRunIdRef.current !== runId ||
          err instanceof ProfilingCancelledError
        ) {
          return;
        }
        setDatasetProfile(null);
        setProfilingStatus('error');
        setProfilingError(
          err instanceof Error
            ? err.message
            : 'Unable to profile the imported dataset.',
        );
      });

    return () => {
      controller.abort();
      client.cancelAndTerminate();
    };
  }, [activeDataset, getProfilingClient, missingValuePolicy, profileNonce]);

  const registerDataset = useCallback((dataset: ImportedDataset) => {
    // Invalidate previous profile synchronously before switching active dataset
    setDatasetProfile(null);
    setProfilingError(null);
    setProfilingStatus('profiling');
    setActiveDataset(dataset);
  }, []);

  const clearDataset = useCallback(() => {
    activeRunIdRef.current += 1;
    profilingClientRef.current?.cancelAndTerminate();
    setActiveDataset(null);
    setDatasetProfile(null);
    setProfilingStatus('idle');
    setProfilingError(null);
  }, []);

  const updateMissingValuePolicy = useCallback(
    (policy: MissingValuePolicy) => {
      setMissingValuePolicy(policy);
    },
    [],
  );

  const reprofileDataset = useCallback(() => {
    if (!activeDataset) return;
    setProfileNonce((n) => n + 1);
  }, [activeDataset]);

  // Defensive guarantee: never expose a profile belonging to a different dataset ID
  const verifiedProfile =
    activeDataset &&
    datasetProfile &&
    datasetProfile.datasetId === activeDataset.id
      ? datasetProfile
      : null;

  const value = useMemo<DatasetContextValue>(
    () => ({
      activeDataset,
      registerDataset,
      clearDataset,
      datasetProfile: verifiedProfile,
      profilingStatus,
      profilingError,
      missingValuePolicy,
      updateMissingValuePolicy,
      reprofileDataset,
    }),
    [
      activeDataset,
      registerDataset,
      clearDataset,
      verifiedProfile,
      profilingStatus,
      profilingError,
      missingValuePolicy,
      updateMissingValuePolicy,
      reprofileDataset,
    ],
  );

  return (
    <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>
  );
}

export function useDataset(): DatasetContextValue {
  const context = useContext(DatasetContext);
  if (!context) {
    throw new Error('useDataset must be used within a DatasetProvider');
  }
  return context;
}
