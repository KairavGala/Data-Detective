/**
 * Data Detective — Feature Modules Boundary
 *
 * Future incremental product modules will be organized into isolated
 * feature slices under `src/features/<feature-name>/`:
 *  - intake         (CSV / Excel ingestion & validation)
 *  - profiling      (dataset structure & statistical profiling)
 *  - anomalies      (automated outlier & pattern detection)
 *  - visualizations (interactive forensic charts)
 *  - investigation  (natural-language AI interrogation)
 *  - reports        (evidence-backed analytical dossiers)
 *
 * Module 00 does not implement feature screens or feature logic.
 */

export type PlannedFeatureSlice =
  | 'intake'
  | 'profiling'
  | 'anomalies'
  | 'visualizations'
  | 'investigation'
  | 'reports';
