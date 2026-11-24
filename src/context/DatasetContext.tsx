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
import {
  DatasetStatisticsClient,
  StatisticsCancelledError,
} from '@/engine/statistics';
import type {
  DatasetProfileSummary,
  DatasetStatisticalSummary,
  ImportedDataset,
  MissingValuePolicy,
  ProfilingStatus,
  StatisticalAnalysisStatus,
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
  readonly statisticalSummary: DatasetStatisticalSummary | null;
  readonly statisticsStatus: StatisticalAnalysisStatus;
  readonly statisticsError: string | null;
  readonly recomputeStatistics: () => void;
}

const DatasetContext = createContext<DatasetContextValue | null>(null);

interface DatasetProviderProps {
  readonly children: ReactNode;
}

/**
 * Single source of truth for the active imported dataset, its Module 03
 * schema & quality profile, and its Module 04 deterministic statistical summary.
 * Strictly in-memory: neither raw dataset contents nor analytical results are
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

  const [statisticalSummary, setStatisticalSummary] =
    useState<DatasetStatisticalSummary | null>(null);
  const [statisticsStatus, setStatisticsStatus] =
    useState<StatisticalAnalysisStatus>('idle');
  const [statisticsError, setStatisticsError] = useState<string | null>(null);
  const [statisticsNonce, setStatisticsNonce] = useState<number>(0);

  const profilingClientRef = useRef<DatasetProfilingClient | null>(null);
  const activeRunIdRef = useRef<number>(0);

  const statisticsClientRef = useRef<DatasetStatisticsClient | null>(null);
  const activeStatsRunIdRef = useRef<number>(0);

  const getProfilingClient = useCallback(() => {
    if (!profilingClientRef.current) {
      profilingClientRef.current = new DatasetProfilingClient();
    }
    return profilingClientRef.current;
  }, []);

  const getStatisticsClient = useCallback(() => {
    if (!statisticsClientRef.current) {
      statisticsClientRef.current = new DatasetStatisticsClient();
    }
    return statisticsClientRef.current;
  }, []);

  // Terminate any active background workers when provider unmounts
  useEffect(() => {
    return () => {
      profilingClientRef.current?.cancelAndTerminate();
      profilingClientRef.current = null;
      statisticsClientRef.current?.cancelAndTerminate();
      statisticsClientRef.current = null;
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

  // Defensive guarantee: never expose a profile belonging to a different dataset ID
  const verifiedProfile =
    activeDataset &&
    datasetProfile &&
    datasetProfile.datasetId === activeDataset.id
      ? datasetProfile
      : null;

  // Automatically compute Module 04 statistics once the verified M03 profile is ready
  useEffect(() => {
    const runId = ++activeStatsRunIdRef.current;
    const client = getStatisticsClient();

    if (!activeDataset || !verifiedProfile) {
      client.cancelAndTerminate();
      setStatisticalSummary(null);
      setStatisticsStatus(
        activeDataset && profilingStatus === 'profiling' ? 'analyzing' : 'idle',
      );
      setStatisticsError(null);
      return;
    }

    const targetDatasetId = activeDataset.id;
    const targetProfiledAt = verifiedProfile.profiledAt;
    const controller = new AbortController();

    setStatisticalSummary((current) =>
      current &&
      current.datasetId === targetDatasetId &&
      current.profiledAt === targetProfiledAt
        ? current
        : null,
    );
    setStatisticsStatus('analyzing');
    setStatisticsError(null);

    void client
      .analyze(activeDataset, verifiedProfile, {
        signal: controller.signal,
      })
      .then((summary) => {
        if (
          controller.signal.aborted ||
          activeStatsRunIdRef.current !== runId ||
          summary.datasetId !== targetDatasetId ||
          summary.profiledAt !== targetProfiledAt
        ) {
          return;
        }
        setStatisticalSummary(summary);
        setStatisticsStatus('ready');
        setStatisticsError(null);
      })
      .catch((err: unknown) => {
        if (
          controller.signal.aborted ||
          activeStatsRunIdRef.current !== runId ||
          err instanceof StatisticsCancelledError
        ) {
          return;
        }
        setStatisticalSummary(null);
        setStatisticsStatus('error');
        setStatisticsError(
          err instanceof Error
            ? err.message
            : 'Unable to compute statistical analysis for the imported dataset.',
        );
      });

    return () => {
      controller.abort();
      client.cancelAndTerminate();
    };
  }, [
    activeDataset,
    verifiedProfile,
    profilingStatus,
    getStatisticsClient,
    statisticsNonce,
  ]);

  const registerDataset = useCallback((dataset: ImportedDataset) => {
    // Invalidate previous profile and statistics synchronously before switching active dataset
    setDatasetProfile(null);
    setProfilingError(null);
    setProfilingStatus('profiling');
    setStatisticalSummary(null);
    setStatisticsError(null);
    setStatisticsStatus('analyzing');
    setActiveDataset(dataset);
  }, []);

  const clearDataset = useCallback(() => {
    activeRunIdRef.current += 1;
    activeStatsRunIdRef.current += 1;
    profilingClientRef.current?.cancelAndTerminate();
    statisticsClientRef.current?.cancelAndTerminate();
    setActiveDataset(null);
    setDatasetProfile(null);
    setProfilingStatus('idle');
    setProfilingError(null);
    setStatisticalSummary(null);
    setStatisticsStatus('idle');
    setStatisticsError(null);
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

  const recomputeStatistics = useCallback(() => {
    if (!activeDataset) return;
    if (!verifiedProfile) {
      setProfileNonce((n) => n + 1);
      return;
    }
    setStatisticsNonce((n) => n + 1);
  }, [activeDataset, verifiedProfile]);

  // Defensive guarantee: never expose statistics belonging to a different dataset or stale profile
  const verifiedStatistics =
    activeDataset &&
    verifiedProfile &&
    statisticalSummary &&
    statisticalSummary.datasetId === activeDataset.id &&
    statisticalSummary.profiledAt === verifiedProfile.profiledAt
      ? statisticalSummary
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
      statisticalSummary: verifiedStatistics,
      statisticsStatus,
      statisticsError,
      recomputeStatistics,
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
      verifiedStatistics,
      statisticsStatus,
      statisticsError,
      recomputeStatistics,
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
