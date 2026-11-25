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
  readonly requiresDataset: boolean;
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
    requiresDataset: false,
    summary:
      'Central workspace command centre and local file intake for CSV and Excel (.xlsx) datasets.',
    plannedModule: 'Evidence Intake & Data Quality',
    plannedCapabilities: [
      'Ingest CSV and Excel (.xlsx) files with local parsing and validation',
      'Inspect headers, worksheets, warnings, and bounded data previews',
      'Review detected column schemas and dataset quality scores',
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
    requiresDataset: true,
    summary:
      'Interactive data explorer with global and column search, typed numeric and categorical filters, stable sorting, column visibility, and bounded pagination.',
    plannedModule: 'Interactive Data Explorer',
    plannedCapabilities: [
      'Sticky-header scrollable grid preserving original cell values and explicit missing-value styling',
      'Case-insensitive global and column search combined with numeric range and category filters',
      'Stable ascending/descending typed sorting, column visibility controls, and 25/50/100/250 pagination',
    ],
    prerequisites: [
      'Active CSV or Excel (.xlsx) file imported into workspace',
      'Completed schema profiling and missing-value policy',
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
    requiresDataset: true,
    summary:
      'Numeric descriptive statistics and categorical frequency distributions computed locally from detected column schemas.',
    plannedModule: 'Statistical Analysis',
    plannedCapabilities: [
      'Numeric descriptive statistics: mean, median, mode, min, max, range, variance, std dev, quartiles, and IQR',
      'Categorical frequency and percentage distributions with tie-aware most and least frequent categories',
      'Explicit separation of valid observations from missing and invalid values',
    ],
    prerequisites: [
      'Active dataset loaded into workspace',
      'Completed dataset schema profile',
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
    requiresDataset: true,
    summary:
      'Visualization Studio converting uploaded datasets into schema-validated bar charts, histograms, ordered line charts, scatter plots, and quartile box plots.',
    plannedModule: 'Visualization Studio',
    plannedCapabilities: [
      'Chart recommendations driven strictly by detected column types and statistical baselines',
      'Bar charts, numeric histograms, ordered/temporal line charts, scatter plots, and quartile box plots',
      'Interactive chart configuration, multi-chart workspace canvas, tooltips, and large-dataset downsampling',
    ],
    prerequisites: [
      'Active dataset imported into workspace',
      'Completed schema profile and statistical analysis',
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
    requiresDataset: true,
    summary:
      'Integrated investigation workspace uniting automated anomaly findings, AI interpretations, structured investigation cases, evidence boards, hypotheses, and activity timelines.',
    plannedModule: 'Automated Insights & Case Management',
    plannedCapabilities: [
      'IQR/Z-score outliers, data-quality audits, distribution diagnostics, and correlation findings',
      'Investigation case management with evidence boards, observations, hypotheses, conclusions, and timelines',
      'Aggregate-only AI case interpretation with strict dataset isolation',
    ],
    prerequisites: [
      'Active dataset imported into workspace',
      'Completed schema profile and statistical baselines',
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
    requiresDataset: true,
    summary:
      'Evidence-grounded AI Investigation Briefs, cross-finding hypotheses, validated workspace recommendations, and aggregate-only dataset Q&A.',
    plannedModule: 'AI Investigation',
    plannedCapabilities: [
      'Generate structured Investigation Briefs grounded strictly in verified aggregate evidence',
      'Surface cross-finding connections and validated follow-up actions across workspace views',
      'Ask questions about aggregate findings without ever transmitting raw spreadsheet rows',
    ],
    prerequisites: [
      'Active dataset imported into workspace',
      'Completed schema profile, statistical analysis, and configured AI service',
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
    requiresDataset: true,
    summary:
      'Compile structured, evidence-backed investigation dossiers and dataset analysis reports with A4 document preview and offline browser PDF export.',
    plannedModule: 'Reports & Dossiers',
    plannedCapabilities: [
      'Build Dataset Analysis, Data Quality, Statistical Analysis, Investigation Dossier, and Custom reports',
      'Customize section ordering, headings, findings, statistical tables, charts, and optional AI interpretations',
      'Preview institutional A4 layouts and export multi-page A4 PDF documents directly in the browser',
    ],
    prerequisites: [
      'Active dataset imported into workspace',
      'Completed schema profile and statistical baselines',
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
    requiresDataset: false,
    summary:
      'Configure workstation preferences, sidebar behavior, initialization sequence replay, and motion accessibility.',
    plannedModule: 'Workstation Preferences',
    plannedCapabilities: [
      'Control sidebar layout defaults and initialization playback',
      'Inspect live reduced-motion accessibility status',
      'Review application intake limits and privacy boundaries',
    ],
    prerequisites: [],
  },
] as const;

export function getRouteByPath(pathname: string): WorkspaceRouteConfig {
  const exact = WORKSPACE_ROUTES.find((route) => route.path === pathname);
  return exact ?? WORKSPACE_ROUTES[0]!;
}
