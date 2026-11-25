import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useDataset } from '@/context/DatasetContext';
import { useOptionalInvestigation } from '@/context/InvestigationContext';
import { analyzeDatasetInsights } from '@/engine/investigation';
import {
  compileReportDocument,
  createReportFromSources,
  deleteReportById,
  duplicateReport,
  partitionReportsByDataset,
  type ActiveReportSources,
  type CreateReportInput,
} from '@/engine/reports';
import {
  generateChartRecommendations,
  recommendationToChartConfig,
} from '@/engine/visualization';
import type {
  ChartConfig,
  CompiledReportDocument,
  InvestigationReport,
} from '@/types';

export interface StagedReportChartsHandoff {
  readonly datasetId: string;
  readonly profiledAt: number;
  readonly charts: readonly ChartConfig[];
  readonly stagedAt: number;
}

export interface ReportContextValue {
  readonly allReports: readonly InvestigationReport[];
  readonly currentDatasetReports: readonly InvestigationReport[];
  readonly previousDatasetReports: readonly InvestigationReport[];
  readonly activeSources: ActiveReportSources | null;
  readonly recommendedCharts: readonly ChartConfig[];
  readonly stagedChartHandoff: StagedReportChartsHandoff | null;
  readonly stageChartsForReport: (charts: readonly ChartConfig[]) => void;
  readonly clearStagedChartsForReport: () => void;
  readonly createReport: (
    input: CreateReportInput,
  ) => InvestigationReport | null;
  readonly updateReport: (
    reportId: string,
    updater: (report: InvestigationReport) => InvestigationReport,
  ) => void;
  readonly duplicateReportById: (
    reportId: string,
  ) => InvestigationReport | null;
  readonly deleteReport: (reportId: string) => void;
  readonly getReportById: (reportId: string) => InvestigationReport | undefined;
  readonly compileReport: (
    report: InvestigationReport,
  ) => CompiledReportDocument;
}

const ReportContext = createContext<ReportContextValue | null>(null);

interface ReportProviderProps {
  readonly children: ReactNode;
}

/**
 * Session-scoped Investigation Reports & Dossiers state provider (Module 10).
 *
 * Strictly in-memory: never writes raw spreadsheet rows or report snapshots to
 * localStorage/sessionStorage. Enforces dataset identity isolation so reports
 * created for a previous dataset are clearly separated when a dataset is
 * replaced or cleared.
 */
export function ReportProvider({ children }: ReportProviderProps) {
  const { activeDataset, datasetProfile, statisticalSummary } = useDataset();
  const investigationCtx = useOptionalInvestigation();

  const [reports, setReports] = useState<readonly InvestigationReport[]>([]);
  const reportsRef = useRef<readonly InvestigationReport[]>(reports);
  reportsRef.current = reports;
  const [stagedChartHandoff, setStagedChartHandoff] =
    useState<StagedReportChartsHandoff | null>(null);

  const activeDatasetId = activeDataset?.id ?? null;

  const investigationSummary = useMemo(() => {
    if (!activeDataset || !datasetProfile || !statisticalSummary) return null;
    if (
      datasetProfile.datasetId !== activeDataset.id ||
      statisticalSummary.datasetId !== activeDataset.id ||
      statisticalSummary.profiledAt !== datasetProfile.profiledAt
    ) {
      return null;
    }
    return analyzeDatasetInsights(
      activeDataset,
      datasetProfile,
      statisticalSummary,
    );
  }, [activeDataset, datasetProfile, statisticalSummary]);

  const activeSources = useMemo<ActiveReportSources | null>(() => {
    if (
      !activeDataset ||
      !datasetProfile ||
      !statisticalSummary ||
      !investigationSummary
    ) {
      return null;
    }
    return {
      dataset: activeDataset,
      profile: datasetProfile,
      stats: statisticalSummary,
      investigation: investigationSummary,
      activeCases: investigationCtx?.currentDatasetCases ?? [],
      verifiedAiBrief: investigationCtx?.verifiedAiBrief ?? null,
    };
  }, [
    activeDataset,
    datasetProfile,
    statisticalSummary,
    investigationSummary,
    investigationCtx?.currentDatasetCases,
    investigationCtx?.verifiedAiBrief,
  ]);

  const recommendedCharts = useMemo<readonly ChartConfig[]>(() => {
    if (!activeDataset || !datasetProfile || !statisticalSummary) return [];
    const recs = generateChartRecommendations(
      datasetProfile,
      statisticalSummary,
    ).slice(0, 8);
    return recs.map((rec) => recommendationToChartConfig(rec));
  }, [activeDataset, datasetProfile, statisticalSummary]);

  const { currentDatasetReports, previousDatasetReports } = useMemo(
    () => partitionReportsByDataset(reports, activeDatasetId),
    [reports, activeDatasetId],
  );

  const createReport = useCallback(
    (input: CreateReportInput): InvestigationReport | null => {
      if (!activeSources) return null;
      const created = createReportFromSources(
        reportsRef.current,
        input,
        activeSources,
      );
      const next = [created, ...reportsRef.current];
      reportsRef.current = next;
      setReports(next);
      return created;
    },
    [activeSources],
  );

  const updateReport = useCallback(
    (
      reportId: string,
      updater: (report: InvestigationReport) => InvestigationReport,
    ) => {
      setReports((prev) => {
        const next = prev.map((r) => (r.id === reportId ? updater(r) : r));
        reportsRef.current = next;
        return next;
      });
    },
    [],
  );

  const duplicateReportById = useCallback(
    (reportId: string): InvestigationReport | null => {
      const target = reportsRef.current.find((r) => r.id === reportId);
      if (!target) return null;
      const copy = duplicateReport(reportsRef.current, target);
      const next = [copy, ...reportsRef.current];
      reportsRef.current = next;
      setReports(next);
      return copy;
    },
    [],
  );

  const deleteReport = useCallback((reportId: string) => {
    setReports((prev) => {
      const next = deleteReportById(prev, reportId);
      reportsRef.current = next;
      return next;
    });
  }, []);

  const getReportById = useCallback((reportId: string) => {
    return reportsRef.current.find((r) => r.id === reportId);
  }, []);

  const stageChartsForReport = useCallback(
    (charts: readonly ChartConfig[]) => {
      if (!activeDataset || !datasetProfile) {
        setStagedChartHandoff(null);
        return;
      }
      setStagedChartHandoff({
        datasetId: activeDataset.id,
        profiledAt: datasetProfile.profiledAt,
        charts: charts.map((cfg) => ({ ...cfg })),
        stagedAt: Date.now(),
      });
    },
    [activeDataset, datasetProfile],
  );

  const clearStagedChartsForReport = useCallback(() => {
    setStagedChartHandoff(null);
  }, []);

  const compileReport = useCallback(
    (report: InvestigationReport): CompiledReportDocument => {
      return compileReportDocument(report, activeSources);
    },
    [activeSources],
  );

  const value = useMemo<ReportContextValue>(
    () => ({
      allReports: reports,
      currentDatasetReports,
      previousDatasetReports,
      activeSources,
      recommendedCharts,
      stagedChartHandoff,
      stageChartsForReport,
      clearStagedChartsForReport,
      createReport,
      updateReport,
      duplicateReportById,
      deleteReport,
      getReportById,
      compileReport,
    }),
    [
      reports,
      currentDatasetReports,
      previousDatasetReports,
      activeSources,
      recommendedCharts,
      stagedChartHandoff,
      stageChartsForReport,
      clearStagedChartsForReport,
      createReport,
      updateReport,
      duplicateReportById,
      deleteReport,
      getReportById,
      compileReport,
    ],
  );

  return (
    <ReportContext.Provider value={value}>{children}</ReportContext.Provider>
  );
}

export function useReports(): ReportContextValue {
  const ctx = useContext(ReportContext);
  if (!ctx) {
    throw new Error('useReports must be used within a ReportProvider');
  }
  return ctx;
}

export function useOptionalReports(): ReportContextValue | null {
  return useContext(ReportContext);
}
