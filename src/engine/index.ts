/**
 * Data Detective — Statistical & Data Ingestion Engine Boundary
 *
 * Architectural invariant:
 * Everything inside `src/engine` MUST remain strictly independent of React
 * and browser UI state so parsing and statistical routines stay pure,
 * testable, and portable across Web Workers or Node runtimes.
 */

import type {
  AnalyticalFinding,
  ColumnDataType,
  DatasetDescriptor,
} from '@/types';

export interface ColumnProfile {
  readonly columnId: string;
  readonly name: string;
  readonly dataType: ColumnDataType;
  readonly totalCount: number;
  readonly missingCount: number;
  readonly uniqueCount: number;
  readonly mean?: number;
  readonly median?: number;
  readonly standardDeviation?: number;
  readonly min?: number | string;
  readonly max?: number | string;
}

export interface DatasetProfileResult {
  readonly dataset: DatasetDescriptor;
  readonly columnProfiles: readonly ColumnProfile[];
  readonly findings: readonly AnalyticalFinding[];
  readonly computedAt: string;
}

export interface DataAnalysisEngine {
  readonly engineVersion: string;
}

export * from './explorer';
export * from './intake';
export * from './investigation';
export * from './profiling';
export * from './statistics';
export * from './visualization';
