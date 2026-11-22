/**
 * Data Detective — Centralized Application Configuration
 *
 * Security boundary: Never store API keys or secrets in frontend configuration.
 * All AI operations will communicate exclusively with server-side Vercel
 * serverless routes under `/api/*`.
 */

export const APP_CONFIG = {
  identity: {
    name: 'Data Detective',
    tagline: 'Forensic Data Investigation Platform',
  },

  /**
   * Single source of truth for evidence intake limits and supported formats.
   * Legacy .xls files are intentionally excluded.
   */
  intake: {
    supportedExtensions: ['.csv', '.xlsx'] as const,
    acceptAttribute: '.csv,.xlsx',
    maxFileSizeBytes: 25 * 1024 * 1024, // 25 MB
    maxRows: 100_000,
    maxColumns: 200,
    previewRowLimit: 100,
  },

  /**
   * Relative paths for future Vercel Serverless Functions.
   * No backend endpoints are implemented yet.
   */
  apiRoutes: {
    investigate: '/api/investigate',
    summarize: '/api/summarize',
  },

  motion: {
    instantMs: 100,
    fastMs: 160,
    baseMs: 240,
    slowMs: 420,
  },
} as const;

export type SupportedExtension =
  (typeof APP_CONFIG.intake.supportedExtensions)[number];

export interface IntakeLimits {
  readonly maxFileSizeBytes: number;
  readonly maxRows: number;
  readonly maxColumns: number;
}
