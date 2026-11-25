/**
 * Data Detective — Module 08 Investigation Wire Contracts (Server-Only)
 *
 * Self-contained backend contracts (zero imports from `src/` or Vite aliases).
 */

import type { ApiErrorCode } from './contracts.js';

export type InvestigateMode = 'brief' | 'question' | 'case';

export type ServerChartType = 'bar' | 'histogram' | 'line' | 'scatter' | 'boxplot';

export type ServerColumnType =
  | 'numeric'
  | 'categorical'
  | 'date'
  | 'boolean'
  | 'identifier'
  | 'unknown';

export type ServerConfidenceLevel = 'high' | 'moderate' | 'preliminary';

export type ServerRecommendationPriority = 'high' | 'medium' | 'low';

export type ServerDestinationType = 'explorer' | 'visualizations' | 'investigation';

export type ServerAnswerSupportType =
  | 'directly_supported'
  | 'reasonable_interpretation'
  | 'insufficient_evidence';

export const MAX_INVESTIGATE_BODY_BYTES = 36 * 1024; // 36 KiB total JSON body cap
export const MAX_INVESTIGATION_CONTEXT_CHARS = 20_000;
export const MAX_CONTEXT_COLUMNS = 100;
export const MAX_CONTEXT_FINDINGS = 100;
export const MAX_CONTEXT_CATEGORIES_PER_COLUMN = 20;
export const MAX_CONTEXT_RELATIONSHIPS = 20;
export const MAX_QUESTION_LENGTH = 600;
export const MAX_HISTORY_TURNS = 6;
export const MAX_HISTORY_ITEM_LENGTH = 600;
export const MAX_BRIEF_SUMMARY_LENGTH = 800;
export const MAX_CASE_TITLE_LENGTH = 140;
export const MAX_CASE_DESCRIPTION_LENGTH = 500;
export const MAX_CASE_FINDING_IDS = 40;
export const MAX_CASE_EVIDENCE_ITEMS = 25;

export interface ServerContextCategory {
  readonly value: string;
  readonly count: number;
  readonly percentage: number;
}

export interface ServerContextColumn {
  readonly columnId: string;
  readonly name: string;
  readonly detectedType: ServerColumnType;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly missingPercentage: number;
  readonly invalidCount: number;
  readonly uniqueCount: number;
  readonly distinctRatio: number;
  readonly numericSummary?: {
    readonly validCount: number;
    readonly mean: number | null;
    readonly median: number | null;
    readonly min: number | null;
    readonly max: number | null;
    readonly range: number | null;
    readonly sampleStdDev: number | null;
    readonly q1: number | null;
    readonly q3: number | null;
    readonly iqr: number | null;
    readonly modeStatus: string;
  };
  readonly categoricalSummary?: {
    readonly validCount: number;
    readonly distinctCount: number;
    readonly isUniform: boolean;
    readonly topCategories: readonly ServerContextCategory[];
  };
}

export interface ServerContextFinding {
  readonly id: string;
  readonly category: string;
  readonly classification: string;
  readonly severity: string;
  readonly confidence: string;
  readonly title: string;
  readonly explanation: string;
  readonly affectedColumnIds: readonly string[];
  readonly evidence: readonly { readonly label: string; readonly value: string }[];
  readonly totalAnomalyCount?: number;
  readonly recommendedChartType?: ServerChartType;
}

export interface ServerContextRelationship {
  readonly findingId: string;
  readonly columnIds: readonly [string, string];
  readonly columnNames: readonly [string, string];
  readonly metricSummary: string;
}

export interface ServerContextChartAvailability {
  readonly chartType: ServerChartType;
  readonly xColumnId: string;
  readonly yColumnId?: string;
  readonly title: string;
}

export interface ServerInvestigationContext {
  readonly dataset: {
    readonly fileName: string;
    readonly rowCount: number;
    readonly columnCount: number;
    readonly totalCells: number;
    readonly overallMissingPercentage: number;
    readonly qualityScore: number;
    readonly qualityGrade: string;
    readonly qualityDimensions: readonly {
      readonly label: string;
      readonly score: number;
    }[];
    readonly missingPolicySummary: string;
    readonly typeDistribution: Readonly<Record<string, number>>;
  };
  readonly columns: readonly ServerContextColumn[];
  readonly findings: readonly ServerContextFinding[];
  readonly numericRelationships: readonly ServerContextRelationship[];
  readonly availableCharts: readonly ServerContextChartAvailability[];
  readonly contextMeta: {
    readonly truncated: boolean;
    readonly reductionNotes: readonly string[];
    readonly includedColumnCount: number;
    readonly totalColumnCount: number;
    readonly includedFindingCount: number;
    readonly totalFindingCount: number;
    readonly serializedCharCount: number;
  };
}

export interface ServerHistoryMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface ServerCaseEvidenceSummary {
  readonly type: string;
  readonly title: string;
  readonly sourceRef: string;
}

export interface ServerCaseInfo {
  readonly caseTitle: string;
  readonly caseDescription: string;
  readonly selectedFindingIds: readonly string[];
  readonly evidenceItems: readonly ServerCaseEvidenceSummary[];
  readonly userQuestion?: string;
  readonly priorBriefSummary?: string;
}

export type ValidatedInvestigateRequest =
  | {
      readonly mode: 'brief';
      readonly context: ServerInvestigationContext;
      readonly serializedContext: string;
    }
  | {
      readonly mode: 'question';
      readonly question: string;
      readonly context: ServerInvestigationContext;
      readonly serializedContext: string;
      readonly briefSummary?: string;
      readonly history: readonly ServerHistoryMessage[];
    }
  | {
      readonly mode: 'case';
      readonly caseInfo: ServerCaseInfo;
      readonly context: ServerInvestigationContext;
      readonly serializedContext: string;
    };

export interface MajorFindingOutput {
  readonly title: string;
  readonly interpretation: string;
  readonly whyItMatters: string;
  readonly supportingFindingIds: readonly string[];
  readonly relevantColumnIds: readonly string[];
}

export interface InvestigationBriefOutput {
  readonly executiveSummary: string;
  readonly majorFindings: readonly MajorFindingOutput[];
  readonly dataQualityAssessment: string;
  readonly relationshipsAndPatterns: string;
  readonly potentialRisks: readonly string[];
  readonly recommendedNextSteps: readonly string[];
  readonly confidenceAndLimitations: string;
}

export interface CrossFindingConnectionOutput {
  readonly id: string;
  readonly title: string;
  readonly findingIds: readonly string[];
  readonly columnIds: readonly string[];
  readonly evidenceSummary: string;
  readonly possibleInterpretation: string;
  readonly alternativeExplanations: readonly string[];
  readonly confidence: ServerConfidenceLevel;
  readonly suggestedInvestigation: string;
}

export interface RecommendedInvestigationOutput {
  readonly id: string;
  readonly title: string;
  readonly reason: string;
  readonly supportingFindingIds: readonly string[];
  readonly relevantColumnIds: readonly string[];
  readonly priority: ServerRecommendationPriority;
  readonly destinationType: ServerDestinationType;
  readonly destinationUrl: string;
  readonly whatToLookFor: string;
}

export interface BriefInvestigationData {
  readonly brief: InvestigationBriefOutput;
  readonly connections: readonly CrossFindingConnectionOutput[];
  readonly recommendations: readonly RecommendedInvestigationOutput[];
}

export interface QuestionInvestigationData {
  readonly answer: string;
  readonly supportType: ServerAnswerSupportType;
  readonly referencedFindingIds: readonly string[];
  readonly referencedColumnIds: readonly string[];
  readonly caveats: readonly string[];
  readonly suggestedFollowUps: readonly string[];
}

export interface CaseInvestigationData {
  readonly evidenceAssessment: string;
  readonly possibleConnections: readonly string[];
  readonly alternativeExplanations: readonly string[];
  readonly additionalEvidenceToExamine: readonly string[];
  readonly supportedConclusions: readonly string[];
  readonly unansweredQuestions: readonly string[];
  readonly supportType: ServerAnswerSupportType;
  readonly referencedFindingIds: readonly string[];
  readonly referencedColumnIds: readonly string[];
  readonly caveats: readonly string[];
}

export interface InvestigateResponseMeta {
  readonly model: string;
  readonly durationMs: number;
  readonly sdkAttemptsConfigured: number;
  readonly generatedAt: string;
  readonly contextCharCount?: number;
  readonly strippedInvalidFindingRefs?: number;
  readonly strippedInvalidColumnRefs?: number;
  readonly timeoutPhase?: 'gemini_sdk' | 'backend_deadline';
  readonly upstreamStatus?: number;
}

export type InvestigateSuccessResponse =
  | {
      readonly ok: true;
      readonly requestId: string;
      readonly mode: 'brief';
      readonly data: BriefInvestigationData;
      readonly meta: InvestigateResponseMeta;
    }
  | {
      readonly ok: true;
      readonly requestId: string;
      readonly mode: 'question';
      readonly data: QuestionInvestigationData;
      readonly meta: InvestigateResponseMeta;
    }
  | {
      readonly ok: true;
      readonly requestId: string;
      readonly mode: 'case';
      readonly data: CaseInvestigationData;
      readonly meta: InvestigateResponseMeta;
    };

export interface InvestigateErrorResponse {
  readonly ok: false;
  readonly requestId: string;
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly meta: InvestigateResponseMeta;
}
