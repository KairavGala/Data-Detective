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
      'Interactive forensic spreadsheet explorer with global and column search, typed numeric and categorical filters, stable sorting, column visibility, and bounded pagination.',
    plannedModule: 'Active — Module 05 Interactive Data Explorer',
    plannedCapabilities: [
      'Sticky-header scrollable grid preserving original cell values and explicit missing-value styling',
      'Case-insensitive global and column search combined with numeric range and category filters',
      'Stable ascending/descending typed sorting, column visibility controls, and 25/50/100/250 pagination',
    ],
    prerequisites: [
      'Active CSV or Excel (.xlsx) file imported into workspace',
      'Module 03 schema classifications and missing-value policy',
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
      'Deterministic numeric descriptive statistics and categorical frequency distributions computed locally from Module 03 schema classifications.',
    plannedModule: 'Active — Module 04 Statistical Engine',
    plannedCapabilities: [
      'Numeric descriptive statistics: mean, median, mode, min, max, range, variance, std dev, quartiles, and IQR',
      'Categorical frequency and percentage distributions with tie-aware most and least frequent categories',
      'Explicit separation of valid observations from missing and invalid values under Module 03 policy',
    ],
    prerequisites: [
      'Active dataset loaded into workspace',
      'Completed Module 03 schema profile',
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
      'Interactive Visualization Studio converting uploaded datasets into schema-validated bar charts, histograms, ordered line charts, scatter plots, and quartile box plots.',
    plannedModule: 'Active — Module 06 Visualization Studio',
    plannedCapabilities: [
      'Deterministic chart recommendations driven strictly by Module 03 column types and Module 04 statistics',
      'Bar charts, numeric histograms, ordered/temporal line charts, scatter plots, and exact M04 quartile box plots',
      'Interactive chart configuration, multi-chart workspace canvas, tooltips, and large-dataset downsampling',
    ],
    prerequisites: [
      'Active dataset imported into workspace',
      'Completed Module 03 schema profile and Module 04 statistics',
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
      'Deterministic forensic findings workspace surfacing statistical outliers, data-quality issues, distribution patterns, categorical anomalies, and numeric correlations.',
    plannedModule: 'Active — Module 07 Insights & Anomaly Detection',
    plannedCapabilities: [
      'Deterministic IQR and optional Z-score numeric outlier detection with row-level Explorer navigation',
      'Confirmed data-quality audits for missingness concentrations, invalid values, and zero-variance columns',
      'Distribution skewness, categorical dominance/rarity, and Pearson correlation findings linked directly to charts',
    ],
    prerequisites: [
      'Active dataset imported into workspace',
      'Completed Module 03 schema profile and Module 04 statistical baselines',
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
