/**
 * Data Detective — Module 08 Request & Model Output Validation
 *
 * Enforces:
 * 1. Privacy boundaries: recursively blocks raw spreadsheet rows, record-level
 *    anomaly samples, free-text cell samples, and frontend system prompts.
 * 2. Strict bounds on context size (<= 20,000 serialized chars), column count
 *    (<= 100), finding count (<= 100), categories per column (<= 20),
 *    relationships (<= 20), question length (<= 600), and history length (<= 6).
 * 3. Deterministic server-side output validation & normalization against the
 *    supplied dataset schema and finding IDs, preventing hallucinated IDs or
 *    arbitrary external navigation URLs.
 */

import { ApiPrototypeError } from './errors.js';
import {
  MAX_BRIEF_SUMMARY_LENGTH,
  MAX_CASE_DESCRIPTION_LENGTH,
  MAX_CASE_EVIDENCE_ITEMS,
  MAX_CASE_FINDING_IDS,
  MAX_CASE_TITLE_LENGTH,
  MAX_CONTEXT_CATEGORIES_PER_COLUMN,
  MAX_CONTEXT_COLUMNS,
  MAX_CONTEXT_FINDINGS,
  MAX_CONTEXT_RELATIONSHIPS,
  MAX_HISTORY_ITEM_LENGTH,
  MAX_HISTORY_TURNS,
  MAX_INVESTIGATION_CONTEXT_CHARS,
  MAX_QUESTION_LENGTH,
  type BriefInvestigationData,
  type CaseInvestigationData,
  type CrossFindingConnectionOutput,
  type InvestigationBriefOutput,
  type MajorFindingOutput,
  type QuestionInvestigationData,
  type RecommendedInvestigationOutput,
  type ServerAnswerSupportType,
  type ServerCaseEvidenceSummary,
  type ServerCaseInfo,
  type ServerChartType,
  type ServerColumnType,
  type ServerConfidenceLevel,
  type ServerContextColumn,
  type ServerDestinationType,
  type ServerHistoryMessage,
  type ServerInvestigationContext,
  type ServerRecommendationPriority,
  type ValidatedInvestigateRequest,
} from './investigateContracts.js';

const FORBIDDEN_RECURSIVE_KEYS = new Set([
  'rows',
  'rawrows',
  'rawdata',
  'cells',
  'csv',
  'rawcsv',
  'workbook',
  'worksheet',
  'filecontent',
  'spreadsheet',
  'datasetrows',
  'recordanomalies',
  'samplevalues',
  'systeminstruction',
  'systemprompt',
  'instructions',
]);

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  'mode',
  'context',
  'question',
  'history',
  'briefSummary',
  'caseInfo',
]);

const VALID_EVIDENCE_TYPES = new Set([
  'finding',
  'column',
  'statistic',
  'visualization',
  'related_finding',
]);

const VALID_COLUMN_TYPES = new Set<ServerColumnType>([
  'numeric',
  'categorical',
  'date',
  'boolean',
  'identifier',
  'unknown',
]);

const VALID_CHART_TYPES = new Set<ServerChartType>([
  'bar',
  'histogram',
  'line',
  'scatter',
  'boxplot',
]);

const VALID_CONFIDENCE_LEVELS = new Set<ServerConfidenceLevel>([
  'high',
  'moderate',
  'preliminary',
]);

const VALID_PRIORITIES = new Set<ServerRecommendationPriority>([
  'high',
  'medium',
  'low',
]);

const VALID_DESTINATIONS = new Set<ServerDestinationType>([
  'explorer',
  'visualizations',
  'investigation',
]);

const VALID_SUPPORT_TYPES = new Set<ServerAnswerSupportType>([
  'directly_supported',
  'reasonable_interpretation',
  'insufficient_evidence',
]);

const MAX_SHORT_TEXT = 240;
const MAX_PARAGRAPH_TEXT = 1_400;
const MAX_ANSWER_TEXT = 2_200;
const MAX_ARRAY_ITEMS = 6;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively scans request payloads for forbidden raw spreadsheet data fields
 * or client-injected system instruction overrides.
 */
function assertNoForbiddenKeys(value: unknown, depth = 0): void {
  if (depth > 8 || value === null || value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoForbiddenKeys(item, depth + 1);
    }
    return;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const lowered = key.toLowerCase();
      if (FORBIDDEN_RECURSIVE_KEYS.has(lowered)) {
        const isSystemOverride =
          lowered === 'systeminstruction' ||
          lowered === 'systemprompt' ||
          lowered === 'instructions';
        throw new ApiPrototypeError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: isSystemOverride
            ? 'Client-supplied system instructions are not permitted.'
            : `Forbidden raw dataset field "${key}" is not permitted in AI investigation requests.`,
        });
      }
      assertNoForbiddenKeys(nested, depth + 1);
    }
  }
}

function validateContextObject(rawContext: unknown): {
  readonly context: ServerInvestigationContext;
  readonly serializedContext: string;
} {
  if (!isPlainObject(rawContext)) {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Field "context" is required and must be a JSON object.',
    });
  }

  let serializedContext: string;
  try {
    serializedContext = JSON.stringify(rawContext);
  } catch {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Field "context" could not be serialized to JSON.',
    });
  }

  if (serializedContext.length > MAX_INVESTIGATION_CONTEXT_CHARS) {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Serialized investigation context exceeds the maximum limit of ${MAX_INVESTIGATION_CONTEXT_CHARS} characters.`,
    });
  }

  const dataset = rawContext.dataset;
  if (
    !isPlainObject(dataset) ||
    typeof dataset.fileName !== 'string' ||
    dataset.fileName.trim().length === 0 ||
    typeof dataset.rowCount !== 'number' ||
    typeof dataset.columnCount !== 'number'
  ) {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Context "dataset" summary is missing required metadata fields.',
    });
  }

  if (!Array.isArray(rawContext.columns)) {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Context "columns" must be an array.',
    });
  }
  if (rawContext.columns.length > MAX_CONTEXT_COLUMNS) {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Context "columns" exceeds maximum of ${MAX_CONTEXT_COLUMNS} columns.`,
    });
  }

  for (const col of rawContext.columns) {
    if (
      !isPlainObject(col) ||
      typeof col.columnId !== 'string' ||
      col.columnId.trim().length === 0 ||
      typeof col.name !== 'string' ||
      !VALID_COLUMN_TYPES.has(col.detectedType as ServerColumnType)
    ) {
      throw new ApiPrototypeError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Every entry in context "columns" must contain valid columnId, name, and detectedType.',
      });
    }

    if (col.categoricalSummary !== undefined) {
      if (
        !isPlainObject(col.categoricalSummary) ||
        !Array.isArray(col.categoricalSummary.topCategories)
      ) {
        throw new ApiPrototypeError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'Column "categoricalSummary.topCategories" must be an array.',
        });
      }
      if (
        col.categoricalSummary.topCategories.length >
        MAX_CONTEXT_CATEGORIES_PER_COLUMN
      ) {
        throw new ApiPrototypeError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: `Column "${col.columnId}" exceeds maximum of ${MAX_CONTEXT_CATEGORIES_PER_COLUMN} categorical entries.`,
        });
      }
    }
  }

  if (!Array.isArray(rawContext.findings)) {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Context "findings" must be an array.',
    });
  }
  if (rawContext.findings.length > MAX_CONTEXT_FINDINGS) {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Context "findings" exceeds maximum of ${MAX_CONTEXT_FINDINGS} findings.`,
    });
  }

  for (const finding of rawContext.findings) {
    if (
      !isPlainObject(finding) ||
      typeof finding.id !== 'string' ||
      finding.id.trim().length === 0 ||
      typeof finding.title !== 'string'
    ) {
      throw new ApiPrototypeError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Every entry in context "findings" must contain a non-empty string id and title.',
      });
    }
  }

  if (
    rawContext.numericRelationships !== undefined &&
    (!Array.isArray(rawContext.numericRelationships) ||
      rawContext.numericRelationships.length > MAX_CONTEXT_RELATIONSHIPS)
  ) {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Context "numericRelationships" must be an array of at most ${MAX_CONTEXT_RELATIONSHIPS} entries.`,
    });
  }

  return {
    context: rawContext as unknown as ServerInvestigationContext,
    serializedContext,
  };
}

/**
 * Validates incoming POST /api/ai/investigate request payloads.
 */
export function validateInvestigateRequest(
  body: unknown,
): ValidatedInvestigateRequest {
  if (!isPlainObject(body)) {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Request body must be a JSON object.',
    });
  }

  assertNoForbiddenKeys(body);

  for (const key of Object.keys(body)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      throw new ApiPrototypeError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: `Unsupported request field "${key}".`,
      });
    }
  }

  const mode = body.mode;
  if (mode !== 'brief' && mode !== 'question' && mode !== 'case') {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Field "mode" must be "brief", "question", or "case".',
    });
  }

  const { context, serializedContext } = validateContextObject(body.context);

  if (mode === 'brief') {
    if (
      body.question !== undefined ||
      body.history !== undefined ||
      body.caseInfo !== undefined
    ) {
      throw new ApiPrototypeError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Fields "question", "history", and "caseInfo" are not permitted when mode is "brief".',
      });
    }
    return {
      mode: 'brief',
      context,
      serializedContext,
    };
  }

  if (mode === 'case') {
    if (body.question !== undefined || body.history !== undefined) {
      throw new ApiPrototypeError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Fields "question" and "history" are not permitted when mode is "case"; use "caseInfo.userQuestion".',
      });
    }
    const rawCase = body.caseInfo;
    if (!isPlainObject(rawCase)) {
      throw new ApiPrototypeError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Field "caseInfo" is required when mode is "case".',
      });
    }
    if (typeof rawCase.caseTitle !== 'string' || rawCase.caseTitle.trim().length === 0) {
      throw new ApiPrototypeError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Field "caseInfo.caseTitle" must be a non-empty string.',
      });
    }
    const caseTitle = rawCase.caseTitle.trim();
    if (caseTitle.length > MAX_CASE_TITLE_LENGTH) {
      throw new ApiPrototypeError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: `Field "caseInfo.caseTitle" exceeds maximum length of ${MAX_CASE_TITLE_LENGTH} characters.`,
      });
    }

    const caseDescription =
      typeof rawCase.caseDescription === 'string'
        ? rawCase.caseDescription.trim()
        : '';
    if (caseDescription.length > MAX_CASE_DESCRIPTION_LENGTH) {
      throw new ApiPrototypeError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: `Field "caseInfo.caseDescription" exceeds maximum length of ${MAX_CASE_DESCRIPTION_LENGTH} characters.`,
      });
    }

    const validFindingIdSet = new Set(context.findings.map((f) => f.id));
    const selectedFindingIds: string[] = [];
    if (rawCase.selectedFindingIds !== undefined) {
      if (!Array.isArray(rawCase.selectedFindingIds)) {
        throw new ApiPrototypeError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'Field "caseInfo.selectedFindingIds" must be an array.',
        });
      }
      if (rawCase.selectedFindingIds.length > MAX_CASE_FINDING_IDS) {
        throw new ApiPrototypeError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: `Field "caseInfo.selectedFindingIds" exceeds maximum of ${MAX_CASE_FINDING_IDS} items.`,
        });
      }
      const seen = new Set<string>();
      for (const rawId of rawCase.selectedFindingIds) {
        if (typeof rawId !== 'string' || rawId.trim().length === 0) {
          throw new ApiPrototypeError({
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            message: 'Every entry in "caseInfo.selectedFindingIds" must be a non-empty string.',
          });
        }
        const trimmedId = rawId.trim();
        if (!validFindingIdSet.has(trimmedId)) {
          throw new ApiPrototypeError({
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            message: `Selected finding ID "${trimmedId}" does not exist in the supplied dataset context.`,
          });
        }
        if (!seen.has(trimmedId)) {
          seen.add(trimmedId);
          selectedFindingIds.push(trimmedId);
        }
      }
    }

    const evidenceItems: ServerCaseEvidenceSummary[] = [];
    if (rawCase.evidenceItems !== undefined) {
      if (!Array.isArray(rawCase.evidenceItems)) {
        throw new ApiPrototypeError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'Field "caseInfo.evidenceItems" must be an array.',
        });
      }
      if (rawCase.evidenceItems.length > MAX_CASE_EVIDENCE_ITEMS) {
        throw new ApiPrototypeError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: `Field "caseInfo.evidenceItems" exceeds maximum of ${MAX_CASE_EVIDENCE_ITEMS} items.`,
        });
      }
      for (const item of rawCase.evidenceItems) {
        if (
          !isPlainObject(item) ||
          typeof item.type !== 'string' ||
          !VALID_EVIDENCE_TYPES.has(item.type) ||
          typeof item.title !== 'string' ||
          typeof item.sourceRef !== 'string'
        ) {
          throw new ApiPrototypeError({
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            message: 'Every entry in "caseInfo.evidenceItems" must contain valid type, title, and sourceRef strings.',
          });
        }
        evidenceItems.push({
          type: item.type,
          title: item.title.trim().slice(0, 140),
          sourceRef: item.sourceRef.trim().slice(0, 120),
        });
      }
    }

    let userQuestion: string | undefined;
    if (rawCase.userQuestion !== undefined) {
      if (typeof rawCase.userQuestion !== 'string') {
        throw new ApiPrototypeError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'Field "caseInfo.userQuestion" must be a string when provided.',
        });
      }
      const trimmedQ = rawCase.userQuestion.trim();
      if (trimmedQ.length > MAX_QUESTION_LENGTH) {
        throw new ApiPrototypeError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: `Field "caseInfo.userQuestion" exceeds maximum length of ${MAX_QUESTION_LENGTH} characters.`,
        });
      }
      if (trimmedQ.length > 0) {
        userQuestion = trimmedQ;
      }
    }

    let priorBriefSummary: string | undefined;
    if (rawCase.priorBriefSummary !== undefined) {
      if (typeof rawCase.priorBriefSummary !== 'string') {
        throw new ApiPrototypeError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'Field "caseInfo.priorBriefSummary" must be a string when provided.',
        });
      }
      const trimmedBrief = rawCase.priorBriefSummary.trim();
      if (trimmedBrief.length > MAX_BRIEF_SUMMARY_LENGTH) {
        throw new ApiPrototypeError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: `Field "caseInfo.priorBriefSummary" exceeds maximum length of ${MAX_BRIEF_SUMMARY_LENGTH} characters.`,
        });
      }
      if (trimmedBrief.length > 0) {
        priorBriefSummary = trimmedBrief;
      }
    }

    const caseInfo: ServerCaseInfo = {
      caseTitle,
      caseDescription,
      selectedFindingIds,
      evidenceItems,
      ...(userQuestion ? { userQuestion } : {}),
      ...(priorBriefSummary ? { priorBriefSummary } : {}),
    };

    return {
      mode: 'case',
      caseInfo,
      context,
      serializedContext,
    };
  }

  // mode === 'question'
  if (typeof body.question !== 'string') {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Field "question" is required and must be a string.',
    });
  }

  const question = body.question.trim();
  if (question.length === 0) {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Field "question" must not be empty.',
    });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new ApiPrototypeError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Field "question" exceeds the maximum length of ${MAX_QUESTION_LENGTH} characters.`,
    });
  }

  let briefSummary: string | undefined;
  if (body.briefSummary !== undefined) {
    if (typeof body.briefSummary !== 'string') {
      throw new ApiPrototypeError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Field "briefSummary" must be a string when provided.',
      });
    }
    const trimmedSummary = body.briefSummary.trim();
    if (trimmedSummary.length > MAX_BRIEF_SUMMARY_LENGTH) {
      throw new ApiPrototypeError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: `Field "briefSummary" exceeds maximum length of ${MAX_BRIEF_SUMMARY_LENGTH} characters.`,
      });
    }
    if (trimmedSummary.length > 0) {
      briefSummary = trimmedSummary;
    }
  }

  const history: ServerHistoryMessage[] = [];
  if (body.history !== undefined) {
    if (!Array.isArray(body.history)) {
      throw new ApiPrototypeError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Field "history" must be an array when provided.',
      });
    }
    if (body.history.length > MAX_HISTORY_TURNS) {
      throw new ApiPrototypeError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: `Field "history" exceeds the maximum of ${MAX_HISTORY_TURNS} messages.`,
      });
    }

    for (const entry of body.history) {
      if (
        !isPlainObject(entry) ||
        (entry.role !== 'user' && entry.role !== 'assistant') ||
        typeof entry.content !== 'string'
      ) {
        throw new ApiPrototypeError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'Each history entry must contain a valid "role" ("user" or "assistant") and string "content".',
        });
      }
      const trimmedContent = entry.content.trim();
      if (trimmedContent.length === 0) {
        continue;
      }
      if (trimmedContent.length > MAX_HISTORY_ITEM_LENGTH) {
        throw new ApiPrototypeError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: `History entry exceeds maximum length of ${MAX_HISTORY_ITEM_LENGTH} characters.`,
        });
      }
      history.push({ role: entry.role, content: trimmedContent });
    }
  }

  return {
    mode: 'question',
    question,
    context,
    serializedContext,
    ...(briefSummary ? { briefSummary } : {}),
    history,
  };
}

/* ── Server-Side Output Validation & Reference Grounding ────────────────── */

function clampText(raw: string, maxLen: number): string {
  const cleaned = raw.replace(/\u0000/g, '').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}

function requireNonEmptyString(
  value: unknown,
  fieldPath: string,
  maxLen: number,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message: `Structured investigation response missing required non-empty string field "${fieldPath}".`,
    });
  }
  return clampText(value, maxLen);
}

function normalizeStringList(
  value: unknown,
  maxItems: number,
  maxItemLen: number,
): readonly string[] {
  if (!Array.isArray(value)) return [];
  const results: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (results.length >= maxItems) break;
    if (typeof item !== 'string') continue;
    const cleaned = clampText(item, maxItemLen);
    if (cleaned.length === 0 || seen.has(cleaned)) continue;
    seen.add(cleaned);
    results.push(cleaned);
  }
  return results;
}

interface RefValidationCounters {
  strippedInvalidFindingRefs: number;
  strippedInvalidColumnRefs: number;
}

function filterValidRefs(
  rawRefs: unknown,
  validSet: ReadonlySet<string>,
  counterKey: keyof RefValidationCounters,
  counters: RefValidationCounters,
  maxItems = 8,
): readonly string[] {
  if (!Array.isArray(rawRefs)) return [];
  const valid: string[] = [];
  const seen = new Set<string>();
  for (const item of rawRefs) {
    if (typeof item !== 'string') {
      counters[counterKey] += 1;
      continue;
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (!validSet.has(trimmed)) {
      counters[counterKey] += 1;
      continue;
    }
    if (!seen.has(trimmed) && valid.length < maxItems) {
      seen.add(trimmed);
      valid.push(trimmed);
    }
  }
  return valid;
}

function isChartSchemaCompatible(
  chartType: ServerChartType,
  xCol: ServerContextColumn | undefined,
  yCol: ServerContextColumn | undefined,
): boolean {
  if (!xCol) return false;
  switch (chartType) {
    case 'bar':
      return xCol.detectedType === 'categorical' || xCol.detectedType === 'boolean';
    case 'histogram':
    case 'boxplot':
      return xCol.detectedType === 'numeric';
    case 'scatter':
      return (
        xCol.detectedType === 'numeric' &&
        yCol !== undefined &&
        yCol.columnId !== xCol.columnId &&
        yCol.detectedType === 'numeric'
      );
    case 'line':
      return (
        (xCol.detectedType === 'date' || xCol.detectedType === 'numeric') &&
        yCol !== undefined &&
        yCol.columnId !== xCol.columnId &&
        yCol.detectedType === 'numeric'
      );
    default:
      return false;
  }
}

/**
 * Deterministically constructs a validated internal-only destination URL.
 * Never accepts arbitrary AI-generated URLs or external origins.
 */
function buildValidatedDestination(
  rawDestType: unknown,
  rawChartType: unknown,
  rawTargetColId: unknown,
  rawSecondaryColId: unknown,
  validFindingIds: readonly string[],
  validColumnIds: readonly string[],
  columnById: ReadonlyMap<string, ServerContextColumn>,
  title: string,
): {
  readonly destinationType: ServerDestinationType;
  readonly destinationUrl: string;
} {
  const destinationType: ServerDestinationType = VALID_DESTINATIONS.has(
    rawDestType as ServerDestinationType,
  )
    ? (rawDestType as ServerDestinationType)
    : 'investigation';

  const targetColId =
    typeof rawTargetColId === 'string' && columnById.has(rawTargetColId.trim())
      ? rawTargetColId.trim()
      : validColumnIds[0];

  const secondaryColId =
    typeof rawSecondaryColId === 'string' &&
    columnById.has(rawSecondaryColId.trim())
      ? rawSecondaryColId.trim()
      : validColumnIds.find((id) => id !== targetColId);

  if (destinationType === 'explorer') {
    if (targetColId) {
      const params = new URLSearchParams({ column: targetColId });
      return {
        destinationType: 'explorer',
        destinationUrl: `/explorer?${params.toString()}`,
      };
    }
    return { destinationType: 'explorer', destinationUrl: '/explorer' };
  }

  if (destinationType === 'visualizations') {
    const chartType = VALID_CHART_TYPES.has(rawChartType as ServerChartType)
      ? (rawChartType as ServerChartType)
      : undefined;
    const xCol = targetColId ? columnById.get(targetColId) : undefined;
    const yCol = secondaryColId ? columnById.get(secondaryColId) : undefined;

    if (chartType && isChartSchemaCompatible(chartType, xCol, yCol) && xCol) {
      const params = new URLSearchParams({
        chartType,
        x: xCol.columnId,
        title: clampText(title, 80),
      });
      if ((chartType === 'scatter' || chartType === 'line') && yCol) {
        params.set('y', yCol.columnId);
      }
      return {
        destinationType: 'visualizations',
        destinationUrl: `/visualizations?${params.toString()}`,
      };
    }
    return {
      destinationType: 'visualizations',
      destinationUrl: '/visualizations',
    };
  }

  // investigation
  if (validFindingIds.length > 0) {
    const params = new URLSearchParams({ finding: validFindingIds[0]! });
    return {
      destinationType: 'investigation',
      destinationUrl: `/investigation?${params.toString()}`,
    };
  }
  return { destinationType: 'investigation', destinationUrl: '/investigation' };
}

function parseJsonObject(rawText: string | undefined): Record<string, unknown> {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message: 'Model returned an empty response when structured JSON was expected.',
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message: 'Model returned malformed JSON that could not be parsed.',
    });
  }

  if (!isPlainObject(parsed)) {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message: 'Model returned a non-object JSON payload.',
    });
  }

  return parsed;
}

export interface ValidatedBriefResult {
  readonly data: BriefInvestigationData;
  readonly strippedInvalidFindingRefs: number;
  readonly strippedInvalidColumnRefs: number;
}

/**
 * Validates and normalizes Gemini's Investigation Brief + Connections +
 * Recommendations response against the supplied aggregate context.
 */
export function parseAndValidateBriefOutput(
  rawText: string | undefined,
  context: ServerInvestigationContext,
): ValidatedBriefResult {
  const parsed = parseJsonObject(rawText);

  if (!isPlainObject(parsed.brief)) {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message: 'Structured response is missing required "brief" object.',
    });
  }

  const validFindingIds = new Set(context.findings.map((f) => f.id));
  const columnById = new Map(context.columns.map((c) => [c.columnId, c]));
  const validColumnIds = new Set(columnById.keys());
  const counters: RefValidationCounters = {
    strippedInvalidFindingRefs: 0,
    strippedInvalidColumnRefs: 0,
  };

  const rawBrief = parsed.brief;
  const executiveSummary = requireNonEmptyString(
    rawBrief.executiveSummary,
    'brief.executiveSummary',
    MAX_PARAGRAPH_TEXT,
  );
  const dataQualityAssessment = requireNonEmptyString(
    rawBrief.dataQualityAssessment,
    'brief.dataQualityAssessment',
    MAX_PARAGRAPH_TEXT,
  );
  const relationshipsAndPatterns = requireNonEmptyString(
    rawBrief.relationshipsAndPatterns,
    'brief.relationshipsAndPatterns',
    MAX_PARAGRAPH_TEXT,
  );
  const confidenceAndLimitations = requireNonEmptyString(
    rawBrief.confidenceAndLimitations,
    'brief.confidenceAndLimitations',
    MAX_PARAGRAPH_TEXT,
  );

  const potentialRisks = normalizeStringList(
    rawBrief.potentialRisks,
    MAX_ARRAY_ITEMS,
    360,
  );
  if (potentialRisks.length === 0) {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message: 'Structured response requires at least one item in "brief.potentialRisks".',
    });
  }

  const recommendedNextSteps = normalizeStringList(
    rawBrief.recommendedNextSteps,
    MAX_ARRAY_ITEMS,
    360,
  );
  if (recommendedNextSteps.length === 0) {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message: 'Structured response requires at least one item in "brief.recommendedNextSteps".',
    });
  }

  if (!Array.isArray(rawBrief.majorFindings)) {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message: 'Structured response requires "brief.majorFindings" array.',
    });
  }

  const majorFindings: MajorFindingOutput[] = [];
  for (const item of rawBrief.majorFindings.slice(0, MAX_ARRAY_ITEMS)) {
    if (!isPlainObject(item)) continue;
    if (
      typeof item.title !== 'string' ||
      item.title.trim().length === 0 ||
      typeof item.interpretation !== 'string' ||
      item.interpretation.trim().length === 0 ||
      typeof item.whyItMatters !== 'string' ||
      item.whyItMatters.trim().length === 0
    ) {
      continue;
    }

    majorFindings.push({
      title: clampText(item.title, MAX_SHORT_TEXT),
      interpretation: clampText(item.interpretation, 600),
      whyItMatters: clampText(item.whyItMatters, 400),
      supportingFindingIds: filterValidRefs(
        item.supportingFindingIds,
        validFindingIds,
        'strippedInvalidFindingRefs',
        counters,
      ),
      relevantColumnIds: filterValidRefs(
        item.relevantColumnIds,
        validColumnIds,
        'strippedInvalidColumnRefs',
        counters,
      ),
    });
  }

  // Validate Cross-Finding Connections (Feature B)
  const rawConnections = Array.isArray(parsed.connections)
    ? parsed.connections
    : [];
  const connections: CrossFindingConnectionOutput[] = [];

  for (const item of rawConnections.slice(0, 5)) {
    if (!isPlainObject(item)) continue;
    if (
      typeof item.title !== 'string' ||
      item.title.trim().length === 0 ||
      typeof item.evidenceSummary !== 'string' ||
      item.evidenceSummary.trim().length === 0 ||
      typeof item.possibleInterpretation !== 'string' ||
      item.possibleInterpretation.trim().length === 0 ||
      typeof item.suggestedInvestigation !== 'string' ||
      item.suggestedInvestigation.trim().length === 0
    ) {
      continue;
    }

    const findingIds = filterValidRefs(
      item.findingIds,
      validFindingIds,
      'strippedInvalidFindingRefs',
      counters,
    );
    // Only keep connections grounded in at least one actual finding from supplied context
    if (findingIds.length === 0) {
      continue;
    }

    const columnIds = filterValidRefs(
      item.columnIds,
      validColumnIds,
      'strippedInvalidColumnRefs',
      counters,
    );

    const confidence: ServerConfidenceLevel = VALID_CONFIDENCE_LEVELS.has(
      item.confidence as ServerConfidenceLevel,
    )
      ? (item.confidence as ServerConfidenceLevel)
      : 'preliminary';

    const alternativeExplanations = normalizeStringList(
      item.alternativeExplanations,
      3,
      300,
    );

    connections.push({
      id: `conn-${connections.length + 1}`,
      title: clampText(item.title, MAX_SHORT_TEXT),
      findingIds,
      columnIds,
      evidenceSummary: clampText(item.evidenceSummary, 600),
      possibleInterpretation: clampText(item.possibleInterpretation, 600),
      alternativeExplanations,
      confidence,
      suggestedInvestigation: clampText(item.suggestedInvestigation, 360),
    });
  }

  // Validate Recommended Investigations (Feature D)
  const rawRecs = Array.isArray(parsed.recommendations)
    ? parsed.recommendations
    : [];
  const recommendations: RecommendedInvestigationOutput[] = [];

  for (const item of rawRecs.slice(0, 5)) {
    if (!isPlainObject(item)) continue;
    if (
      typeof item.title !== 'string' ||
      item.title.trim().length === 0 ||
      typeof item.reason !== 'string' ||
      item.reason.trim().length === 0 ||
      typeof item.whatToLookFor !== 'string' ||
      item.whatToLookFor.trim().length === 0
    ) {
      continue;
    }

    const title = clampText(item.title, MAX_SHORT_TEXT);
    const supportingFindingIds = filterValidRefs(
      item.supportingFindingIds,
      validFindingIds,
      'strippedInvalidFindingRefs',
      counters,
    );
    const relevantColumnIds = filterValidRefs(
      item.relevantColumnIds,
      validColumnIds,
      'strippedInvalidColumnRefs',
      counters,
    );

    const priority: ServerRecommendationPriority = VALID_PRIORITIES.has(
      item.priority as ServerRecommendationPriority,
    )
      ? (item.priority as ServerRecommendationPriority)
      : 'medium';

    // Track invalid target column refs if the model supplied non-existent ones
    if (
      typeof item.targetColumnId === 'string' &&
      item.targetColumnId.trim().length > 0 &&
      !validColumnIds.has(item.targetColumnId.trim())
    ) {
      counters.strippedInvalidColumnRefs += 1;
    }
    if (
      typeof item.targetSecondaryColumnId === 'string' &&
      item.targetSecondaryColumnId.trim().length > 0 &&
      !validColumnIds.has(item.targetSecondaryColumnId.trim())
    ) {
      counters.strippedInvalidColumnRefs += 1;
    }

    const { destinationType, destinationUrl } = buildValidatedDestination(
      item.destinationType,
      item.chartType,
      item.targetColumnId,
      item.targetSecondaryColumnId,
      supportingFindingIds,
      relevantColumnIds,
      columnById,
      title,
    );

    recommendations.push({
      id: `rec-${recommendations.length + 1}`,
      title,
      reason: clampText(item.reason, 420),
      supportingFindingIds,
      relevantColumnIds,
      priority,
      destinationType,
      destinationUrl,
      whatToLookFor: clampText(item.whatToLookFor, 360),
    });
  }

  const brief: InvestigationBriefOutput = {
    executiveSummary,
    majorFindings,
    dataQualityAssessment,
    relationshipsAndPatterns,
    potentialRisks,
    recommendedNextSteps,
    confidenceAndLimitations,
  };

  return {
    data: {
      brief,
      connections,
      recommendations,
    },
    strippedInvalidFindingRefs: counters.strippedInvalidFindingRefs,
    strippedInvalidColumnRefs: counters.strippedInvalidColumnRefs,
  };
}

export interface ValidatedQuestionResult {
  readonly data: QuestionInvestigationData;
  readonly strippedInvalidFindingRefs: number;
  readonly strippedInvalidColumnRefs: number;
}

/**
 * Validates and normalizes Gemini's Ask Your Dataset Q&A response against
 * the supplied aggregate context.
 */
export function parseAndValidateQuestionOutput(
  rawText: string | undefined,
  context: ServerInvestigationContext,
): ValidatedQuestionResult {
  const parsed = parseJsonObject(rawText);

  const answer = requireNonEmptyString(parsed.answer, 'answer', MAX_ANSWER_TEXT);

  if (
    typeof parsed.supportType !== 'string' ||
    !VALID_SUPPORT_TYPES.has(parsed.supportType as ServerAnswerSupportType)
  ) {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message:
        'Structured Q&A response failed contract check: "supportType" must be "directly_supported", "reasonable_interpretation", or "insufficient_evidence".',
    });
  }

  const validFindingIds = new Set(context.findings.map((f) => f.id));
  const validColumnIds = new Set(context.columns.map((c) => c.columnId));
  const counters: RefValidationCounters = {
    strippedInvalidFindingRefs: 0,
    strippedInvalidColumnRefs: 0,
  };

  const referencedFindingIds = filterValidRefs(
    parsed.referencedFindingIds,
    validFindingIds,
    'strippedInvalidFindingRefs',
    counters,
  );
  const referencedColumnIds = filterValidRefs(
    parsed.referencedColumnIds,
    validColumnIds,
    'strippedInvalidColumnRefs',
    counters,
  );

  const caveats = normalizeStringList(parsed.caveats, 4, 300);
  const suggestedFollowUps = normalizeStringList(
    parsed.suggestedFollowUps,
    3,
    140,
  );

  return {
    data: {
      answer,
      supportType: parsed.supportType as ServerAnswerSupportType,
      referencedFindingIds,
      referencedColumnIds,
      caveats,
      suggestedFollowUps,
    },
    strippedInvalidFindingRefs: counters.strippedInvalidFindingRefs,
    strippedInvalidColumnRefs: counters.strippedInvalidColumnRefs,
  };
}

export interface ValidatedCaseAnalysisResult {
  readonly data: CaseInvestigationData;
  readonly strippedInvalidFindingRefs: number;
  readonly strippedInvalidColumnRefs: number;
}

/**
 * Validates and normalizes Gemini's Module 09 Case Investigation Analysis
 * output against the supplied aggregate dataset context.
 */
export function parseAndValidateCaseOutput(
  rawText: string | undefined,
  context: ServerInvestigationContext,
): ValidatedCaseAnalysisResult {
  const parsed = parseJsonObject(rawText);

  const evidenceAssessment = requireNonEmptyString(
    parsed.evidenceAssessment,
    'evidenceAssessment',
    MAX_PARAGRAPH_TEXT,
  );

  if (
    typeof parsed.supportType !== 'string' ||
    !VALID_SUPPORT_TYPES.has(parsed.supportType as ServerAnswerSupportType)
  ) {
    throw new ApiPrototypeError({
      code: 'MALFORMED_MODEL_RESPONSE',
      statusCode: 502,
      message:
        'Structured case analysis response failed contract check: "supportType" must be "directly_supported", "reasonable_interpretation", or "insufficient_evidence".',
    });
  }

  const validFindingIds = new Set(context.findings.map((f) => f.id));
  const validColumnIds = new Set(context.columns.map((c) => c.columnId));
  const counters: RefValidationCounters = {
    strippedInvalidFindingRefs: 0,
    strippedInvalidColumnRefs: 0,
  };

  const referencedFindingIds = filterValidRefs(
    parsed.referencedFindingIds,
    validFindingIds,
    'strippedInvalidFindingRefs',
    counters,
  );
  const referencedColumnIds = filterValidRefs(
    parsed.referencedColumnIds,
    validColumnIds,
    'strippedInvalidColumnRefs',
    counters,
  );

  const possibleConnections = normalizeStringList(
    parsed.possibleConnections,
    MAX_ARRAY_ITEMS,
    360,
  );
  const alternativeExplanations = normalizeStringList(
    parsed.alternativeExplanations,
    MAX_ARRAY_ITEMS,
    360,
  );
  const additionalEvidenceToExamine = normalizeStringList(
    parsed.additionalEvidenceToExamine,
    MAX_ARRAY_ITEMS,
    360,
  );
  const supportedConclusions = normalizeStringList(
    parsed.supportedConclusions,
    MAX_ARRAY_ITEMS,
    360,
  );
  const unansweredQuestions = normalizeStringList(
    parsed.unansweredQuestions,
    MAX_ARRAY_ITEMS,
    360,
  );
  const caveats = normalizeStringList(parsed.caveats, 4, 300);

  return {
    data: {
      evidenceAssessment,
      possibleConnections,
      alternativeExplanations,
      additionalEvidenceToExamine,
      supportedConclusions,
      unansweredQuestions,
      supportType: parsed.supportType as ServerAnswerSupportType,
      referencedFindingIds,
      referencedColumnIds,
      caveats,
    },
    strippedInvalidFindingRefs: counters.strippedInvalidFindingRefs,
    strippedInvalidColumnRefs: counters.strippedInvalidColumnRefs,
  };
}

