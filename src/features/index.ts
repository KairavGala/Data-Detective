/**
 * Data Detective — Feature Modules Boundary
 *
 * Future incremental product modules will be organized into isolated
 * feature slices under `src/features/<feature-name>/`:
 *  - intake         (CSV / Excel ingestion & validation)
 *  - profiling      (dataset structure & quality profiling)
 *  - statistics     (deterministic descriptive & categorical statistics)
 *  - explorer       (interactive forensic spreadsheet table)
 *  - anomalies      (automated outlier & pattern detection)
 *  - visualizations (interactive forensic charts)
 *  - investigation  (natural-language AI interrogation)
 *  - reports        (evidence-backed analytical dossiers)
 */

export type PlannedFeatureSlice =
  | 'intake'
  | 'profiling'
  | 'statistics'
  | 'explorer'
  | 'anomalies'
  | 'visualizations'
  | 'investigation'
  | 'reports';
