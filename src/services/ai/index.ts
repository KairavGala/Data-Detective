/**
 * Data Detective — AI Services Client Boundary
 *
 * Security invariant:
 * Frontend code must NEVER import or execute Gemini API credentials directly.
 * Future AI investigation requests will be dispatched to Vercel serverless
 * functions configured in `APP_CONFIG.apiRoutes`.
 *
 * Module 00 defines transport contracts only. No AI calls are implemented yet.
 */

import type { AnalyticalFinding, DatasetDescriptor } from '@/types';

export interface InvestigationPromptPayload {
  readonly question: string;
  readonly dataset: DatasetDescriptor;
  readonly contextFindings?: readonly AnalyticalFinding[];
}

export interface InvestigationResponsePayload {
  readonly answer: string;
  readonly citations: readonly string[];
  readonly generatedAt: string;
}
