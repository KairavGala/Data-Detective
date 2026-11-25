import type { RouteId } from '@/config/navigation';
import { useDataset } from '@/context/DatasetContext';
import { useOptionalInvestigation } from '@/context/InvestigationContext';
import { useOptionalReports } from '@/context/ReportContext';
import { formatCount } from '@/utils';

export interface NavigationAwareness {
  readonly hasDataset: boolean;
  readonly datasetFileName: string | null;
  readonly datasetDimensions: string | null;
  readonly findingsCount: number | null;
  readonly activeCasesCount: number;
  readonly sessionReportsCount: number;
}

export interface RouteNavIndicator {
  readonly display: string;
  readonly srLabel: string;
  readonly title: string;
  readonly tone: 'verified' | 'analytical' | 'muted';
}

/**
 * Aggregates real, strictly factual navigation awareness signals from existing
 * in-memory application contexts without duplicating state or fabricating counts.
 */
export function useNavigationAwareness(): NavigationAwareness {
  const { activeDataset } = useDataset();
  const investigationCtx = useOptionalInvestigation();
  const reportsCtx = useOptionalReports();

  const hasDataset = Boolean(activeDataset);
  const datasetFileName = activeDataset?.fileName ?? null;
  const datasetDimensions = activeDataset
    ? `${formatCount(activeDataset.rowCount)}×${formatCount(activeDataset.columnCount)}`
    : null;

  const findingsCount =
    hasDataset && reportsCtx?.activeSources
      ? reportsCtx.activeSources.investigation.overview.totalFindings
      : null;

  const activeCasesCount =
    hasDataset && investigationCtx
      ? investigationCtx.currentDatasetCases.filter((c) => !c.archived).length
      : 0;

  const sessionReportsCount = reportsCtx ? reportsCtx.allReports.length : 0;

  return {
    hasDataset,
    datasetFileName,
    datasetDimensions,
    findingsCount,
    activeCasesCount,
    sessionReportsCount,
  };
}

/**
 * Returns a subtle, factual navigation indicator for a given route when
 * relevant live data exists, or null when no count/status applies.
 */
export function getRouteNavIndicator(
  routeId: RouteId,
  awareness: NavigationAwareness,
): RouteNavIndicator | null {
  if (routeId === 'overview' && awareness.hasDataset) {
    return {
      display: 'Active',
      srLabel: 'Dataset loaded',
      title: `Active dataset: ${awareness.datasetFileName ?? ''}`,
      tone: 'verified',
    };
  }

  if (routeId === 'investigation' && awareness.hasDataset) {
    const findings = awareness.findingsCount ?? 0;
    const cases = awareness.activeCasesCount;

    if (findings > 0 && cases > 0) {
      return {
        display: `${formatCount(findings)} · ${formatCount(cases)}`,
        srLabel: `${findings} active ${findings === 1 ? 'finding' : 'findings'}, ${cases} active ${cases === 1 ? 'case' : 'cases'}`,
        title: `${formatCount(findings)} active ${findings === 1 ? 'finding' : 'findings'} · ${formatCount(cases)} active ${cases === 1 ? 'case' : 'cases'}`,
        tone: 'analytical',
      };
    }

    if (findings > 0) {
      return {
        display: formatCount(findings),
        srLabel: `${findings} active ${findings === 1 ? 'finding' : 'findings'}`,
        title: `${formatCount(findings)} active ${findings === 1 ? 'finding' : 'findings'}`,
        tone: 'analytical',
      };
    }

    if (cases > 0) {
      return {
        display: formatCount(cases),
        srLabel: `${cases} active ${cases === 1 ? 'case' : 'cases'}`,
        title: `${formatCount(cases)} active ${cases === 1 ? 'case' : 'cases'}`,
        tone: 'verified',
      };
    }
  }

  if (routeId === 'reports' && awareness.sessionReportsCount > 0) {
    const count = awareness.sessionReportsCount;
    return {
      display: formatCount(count),
      srLabel: `${count} session ${count === 1 ? 'report' : 'reports'}`,
      title: `${formatCount(count)} session ${count === 1 ? 'report' : 'reports'}`,
      tone: 'muted',
    };
  }

  return null;
}
