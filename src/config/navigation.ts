import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  Compass,
  Crosshair,
  FileText,
  SlidersHorizontal,
  Table2,
  TerminalSquare,
} from 'lucide-react';

export type RouteId =
  | 'overview'
  | 'explorer'
  | 'analysis'
  | 'visualizations'
  | 'investigation'
  | 'assistant'
  | 'reports'
  | 'settings';

export interface WorkspaceRouteConfig {
  readonly id: RouteId;
  readonly path: string;
  readonly label: string;
  readonly sectionCode: string;
  readonly shortcutKey: string;
  readonly icon: LucideIcon;
  readonly group: 'workspace' | 'system';
  readonly summary: string;
  readonly plannedModule: string;
  readonly plannedCapabilities: readonly string[];
  readonly prerequisites: readonly string[];
}

export const WORKSPACE_ROUTES: readonly WorkspaceRouteConfig[] = [
  {
    id: 'overview',
    path: '/',
    label: 'Overview',
    sectionCode: 'SEC-00',
    shortcutKey: 'O',
    icon: Compass,
    group: 'workspace',
    summary:
      'Central investigative briefing room and local evidence intake bay for CSV and Excel (.xlsx) datasets.',
    plannedModule: 'Active — Module 02 Evidence Intake',
    plannedCapabilities: [
      'Ingest CSV and Excel (.xlsx) files with local parsing and validation',
      'Inspect headers, worksheets, warnings, and bounded data previews',
      'Register active datasets into browser memory for analytical modules',
    ],
    prerequisites: [],
  },
  {
    id: 'explorer',
    path: '/explorer',
    label: 'Dataset Explorer',
    sectionCode: 'SEC-01',
    shortcutKey: 'E',
    icon: Table2,
    group: 'workspace',
    summary:
      'Inspect full datasets, inferred column schemas, null patterns, and structural integrity across imported files.',
    plannedModule: 'Module 03 — Dataset Explorer & Profiling',
    plannedCapabilities: [
      'Full virtualized tabular inspection with search, sorting, and filtering',
      'Automatic column type inference (numeric, categorical, datetime, boolean)',
      'Missing-value profiling and duplicate record diagnostics',
    ],
    prerequisites: [
      'Active CSV or Excel (.xlsx) file imported into workspace',
      'Profiling & explorer module (Module 03)',
    ],
  },
  {
    id: 'analysis',
    path: '/analysis',
    label: 'Statistical Analysis',
    sectionCode: 'SEC-02',
    shortcutKey: 'A',
    icon: Activity,
    group: 'workspace',
    summary:
      'Run deterministic, React-independent statistical routines to establish quantitative baselines across variables.',
    plannedModule: 'Module 03 — Statistical Engine',
    plannedCapabilities: [
      'Descriptive statistics: mean, median, quartiles, variance, and standard deviation',
      'Distribution skewness, kurtosis, and percentile breakdowns',
      'Cross-column correlation matrices and relationship strength scoring',
    ],
    prerequisites: [
      'Active dataset loaded into workspace',
      'Statistical computation engine (Module 03)',
    ],
  },
  {
    id: 'visualizations',
    path: '/visualizations',
    label: 'Visualizations',
    sectionCode: 'SEC-03',
    shortcutKey: 'V',
    icon: BarChart3,
    group: 'workspace',
    summary:
      'Examine distributions, temporal trends, and bivariate relationships through interactive analytical charts.',
    plannedModule: 'Module 04 — Interactive Visualizations',
    plannedCapabilities: [
      'Histograms, box plots, and category frequency breakdowns',
      'Time-series trend inspection and multi-variable scatter plots',
      'Cross-filtering between visual evidence and underlying rows',
    ],
    prerequisites: [
      'Active dataset and computed column profiles',
      'Charting & visual evidence module (Module 04)',
    ],
  },
  {
    id: 'investigation',
    path: '/investigation',
    label: 'Investigation Center',
    sectionCode: 'SEC-04',
    shortcutKey: 'I',
    icon: Crosshair,
    group: 'workspace',
    summary:
      'Automated forensic detection workspace highlighting statistical outliers, structural breaks, and irregular patterns.',
    plannedModule: 'Module 05 — Anomaly & Pattern Detection',
    plannedCapabilities: [
      'Automated outlier detection using IQR and Z-score thresholds',
      'Pattern drift, sudden shifts, and unexpected category concentrations',
      'Evidence-linked findings ranked by investigative severity',
    ],
    prerequisites: [
      'Active dataset and statistical baselines',
      'Anomaly & pattern detection engine (Module 05)',
    ],
  },
  {
    id: 'assistant',
    path: '/assistant',
    label: 'AI Assistant',
    sectionCode: 'SEC-05',
    shortcutKey: 'C',
    icon: TerminalSquare,
    group: 'workspace',
    summary:
      'Natural-language analytical interrogation grounded in verified statistical summaries via server-side Gemini endpoints.',
    plannedModule: 'Module 06 — AI Investigation Service',
    plannedCapabilities: [
      'Ask structured natural-language questions about active dataset evidence',
      'Receive findings citing concrete columns, metrics, and detected anomalies',
      'Server-side Vercel serverless execution keeping API credentials private',
    ],
    prerequisites: [
      'Active dataset profile and findings context',
      'Server-side Gemini API integration (Module 06)',
    ],
  },
  {
    id: 'reports',
    path: '/reports',
    label: 'Reports & Export',
    sectionCode: 'SEC-06',
    shortcutKey: 'R',
    icon: FileText,
    group: 'workspace',
    summary:
      'Compile structured, evidence-backed investigative dossiers summarizing findings, statistics, and key anomalies.',
    plannedModule: 'Module 07 — Analytical Reports & Export',
    plannedCapabilities: [
      'Structured executive and forensic report generation from verified findings',
      'Exportable analytical summaries and cleaned dataset artifacts',
      'Reproducible citation of dataset metadata and statistical thresholds',
    ],
    prerequisites: [
      'Completed statistical profile or investigation findings',
      'Report compilation & export module (Module 07)',
    ],
  },
  {
    id: 'settings',
    path: '/settings',
    label: 'Settings',
    sectionCode: 'SEC-07',
    shortcutKey: ',',
    icon: SlidersHorizontal,
    group: 'system',
    summary:
      'Configure workstation preferences, sidebar behavior, initialization sequence replay, and motion accessibility.',
    plannedModule: 'Active — Module 01 Workstation Shell',
    plannedCapabilities: [
      'Control sidebar layout defaults and initialization playback',
      'Inspect live reduced-motion accessibility status',
      'Review application intake limits and architecture boundaries',
    ],
    prerequisites: [],
  },
] as const;

export function getRouteByPath(pathname: string): WorkspaceRouteConfig {
  const exact = WORKSPACE_ROUTES.find((route) => route.path === pathname);
  return exact ?? WORKSPACE_ROUTES[0]!;
}
