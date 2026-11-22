import type {
  CategoryFrequency,
  DatasetColumnProfile,
  DatasetProfileSummary,
  DateDetectionStats,
  ImportedColumn,
  ImportedDataset,
  MissingValuePolicy,
  NumericValidityStats,
  ProfileColumnType,
  ProfileWarning,
  TypeConfidence,
} from '@/types';
import { formatCellValue } from '@/utils/format';
import {
  classifyBooleanValue,
  hasBooleanColumnName,
} from './booleanDetection';
import {
  classifyDateValue,
  type DateFormatKind,
  hasDateColumnName,
} from './dateDetection';
import {
  analyzeIdentifierColumnName,
  matchesPostalCodePattern,
  matchesPrefixedIdPattern,
  matchesUuidPattern,
} from './identifierDetection';
import {
  classifyMissingValue,
  type CompiledMissingPolicy,
  compileMissingPolicy,
  DEFAULT_MISSING_VALUE_POLICY,
} from './missingValues';
import { classifyNumericValue } from './numericDetection';
import { computeDatasetQuality } from './qualityScore';

const MAX_SAMPLE_VALUES = 5;
const MAX_TOP_CATEGORIES = 5;
const HIGH_MISSING_WARNING_PCT = 20;
const CRITICAL_MISSING_WARNING_PCT = 50;

export interface ProfileDatasetOptions {
  readonly missingValuePolicy?: MissingValuePolicy;
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundFour(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function toConfidence(score: number): TypeConfidence {
  if (score >= 0.92) return 'high';
  if (score >= 0.72) return 'medium';
  return 'low';
}

/**
 * Produces a type-tagged key so distinct JavaScript types (e.g. number 42 vs string "42")
 * are tracked accurately without colliding in Map lookups.
 */
function toUniqueKey(value: unknown): string {
  if (typeof value === 'string') return `s:${value.trim()}`;
  if (typeof value === 'number') return `n:${value}`;
  if (typeof value === 'boolean') return `b:${value}`;
  if (value instanceof Date) return `d:${value.getTime()}`;
  return `o:${String(value)}`;
}

function extractTopCategories(
  frequencyMap: Map<string, number>,
  displayByKey: Map<string, string>,
  nonMissingCount: number,
  limit = MAX_TOP_CATEGORIES,
): CategoryFrequency[] {
  if (nonMissingCount === 0 || frequencyMap.size === 0) return [];

  // Maintain a small top-K buffer to avoid sorting huge cardinality maps
  const top: Array<{ key: string; count: number }> = [];

  for (const [key, count] of frequencyMap.entries()) {
    if (top.length < limit) {
      top.push({ key, count });
      top.sort((a, b) => b.count - a.count);
    } else if (count > top[top.length - 1]!.count) {
      top[top.length - 1] = { key, count };
      top.sort((a, b) => b.count - a.count);
    }
  }

  return top.map((entry) => ({
    value: displayByKey.get(entry.key) ?? entry.key.slice(2),
    count: entry.count,
    percentage: roundTwo((entry.count / nonMissingCount) * 100),
  }));
}

interface SeparatorEvidence {
  dmy: number;
  mdy: number;
  ambiguous: number;
}

function profileSingleColumn(
  column: ImportedColumn,
  rows: readonly (readonly unknown[])[],
  compiledMissing: CompiledMissingPolicy,
): DatasetColumnProfile {
  const colIndex = column.index;
  const totalCount = rows.length;

  let structuralMissingCount = 0;
  let markerMissingCount = 0;
  const matchedMissingMarkers = new Set<string>();

  const frequencyMap = new Map<string, number>();
  const displayByKey = new Map<string, string>();
  const sampleValues: string[] = [];

  // Single-pass type-signal accumulators
  let numericValidCount = 0;
  let numericIntegerCount = 0;
  let numericDecimalCount = 0;
  let numericFormattedCount = 0;
  let numericLeadingZeroCount = 0;
  let numericMinVal = Number.POSITIVE_INFINITY;
  let numericMaxVal = Number.NEGATIVE_INFINITY;

  let booleanStrictCount = 0; // true/false, yes/no, t/f, y/n, native boolean
  let booleanBinary01Count = 0; // 0/1

  let dateUnambiguousValidCount = 0;
  let dateAmbiguousCount = 0;
  let dateMalformedCount = 0;
  const dateFormats = new Set<DateFormatKind>();
  const sepEvidence: Record<'/' | '-' | '.', SeparatorEvidence> = {
    '/': { dmy: 0, mdy: 0, ambiguous: 0 },
    '-': { dmy: 0, mdy: 0, ambiguous: 0 },
    '.': { dmy: 0, mdy: 0, ambiguous: 0 },
  };

  let uuidMatchCount = 0;
  let prefixedIdMatchCount = 0;
  let postalMatchCount = 0;
  let stringLikeCount = 0;

  // Single linear pass over all rows for this column (never mutates row cells)
  for (let r = 0; r < totalCount; r += 1) {
    const row = rows[r];
    const value = row !== undefined && colIndex < row.length ? row[colIndex] : undefined;

    const missingResult = classifyMissingValue(value, compiledMissing);
    if (missingResult.kind === 'structural') {
      structuralMissingCount += 1;
      continue;
    }
    if (missingResult.kind === 'marker') {
      markerMissingCount += 1;
      matchedMissingMarkers.add(missingResult.marker);
      continue;
    }

    // Track unique occurrences & samples
    const uniqueKey = toUniqueKey(value);
    const prevFreq = frequencyMap.get(uniqueKey);
    if (prevFreq === undefined) {
      frequencyMap.set(uniqueKey, 1);
      const display = formatCellValue(value).trim();
      displayByKey.set(uniqueKey, display);
      if (sampleValues.length < MAX_SAMPLE_VALUES) {
        sampleValues.push(display);
      }
    } else {
      frequencyMap.set(uniqueKey, prevFreq + 1);
    }

    // Numeric signals
    const numClass = classifyNumericValue(value);
    if (numClass.isValid) {
      numericValidCount += 1;
      if (numClass.isInteger) numericIntegerCount += 1;
      else numericDecimalCount += 1;
      if (numClass.isFormattedString) numericFormattedCount += 1;
      if (numClass.hasLeadingZero) numericLeadingZeroCount += 1;
      if (numClass.numericValue !== undefined) {
        if (numClass.numericValue < numericMinVal) numericMinVal = numClass.numericValue;
        if (numClass.numericValue > numericMaxVal) numericMaxVal = numClass.numericValue;
      }
    }

    // Boolean signals
    const boolClass = classifyBooleanValue(value);
    if (boolClass.isBoolean) {
      if (boolClass.family === 'binary_01') {
        booleanBinary01Count += 1;
      } else {
        booleanStrictCount += 1;
      }
    }

    // Date signals
    const dateClass = classifyDateValue(value);
    if (dateClass.status === 'valid') {
      dateUnambiguousValidCount += 1;
      if (dateClass.format) dateFormats.add(dateClass.format);
      if (dateClass.separator) {
        if (dateClass.format === 'DMY-Unambiguous') {
          sepEvidence[dateClass.separator].dmy += 1;
        } else if (dateClass.format === 'MDY-Unambiguous') {
          sepEvidence[dateClass.separator].mdy += 1;
        }
      }
    } else if (dateClass.status === 'ambiguous') {
      dateAmbiguousCount += 1;
      if (dateClass.format) dateFormats.add(dateClass.format);
      if (dateClass.separator) {
        sepEvidence[dateClass.separator].ambiguous += 1;
      }
    } else if (dateClass.status === 'invalid') {
      dateMalformedCount += 1;
      if (dateClass.format) dateFormats.add(dateClass.format);
    }

    // Identifier / postal string pattern signals
    const textValue = typeof value === 'string' ? value.trim() : String(value).trim();
    if (typeof value === 'string') {
      stringLikeCount += 1;
    }
    if (matchesUuidPattern(textValue)) {
      uuidMatchCount += 1;
    }
    if (matchesPrefixedIdPattern(textValue)) {
      prefixedIdMatchCount += 1;
    }
    if (matchesPostalCodePattern(textValue)) {
      postalMatchCount += 1;
    }
  }

  const missingCount = structuralMissingCount + markerMissingCount;
  const nonMissingCount = totalCount - missingCount;
  const missingPercentage =
    totalCount > 0 ? roundTwo((missingCount / totalCount) * 100) : 0;
  const uniqueCount = frequencyMap.size;
  const duplicateCount = Math.max(0, nonMissingCount - uniqueCount);
  const distinctRatio =
    nonMissingCount > 0 ? roundFour(uniqueCount / nonMissingCount) : 0;

  const warnings: ProfileWarning[] = [];

  if (column.wasEmptyHeader) {
    warnings.push({
      code: 'EMPTY_HEADER',
      severity: 'low',
      columnId: column.id,
      columnName: column.name,
      title: 'Synthesized column header',
      message: `Column ${column.index + 1} had an empty header and was assigned "${column.name}".`,
    });
  }

  if (column.wasDuplicateHeader) {
    warnings.push({
      code: 'DUPLICATE_COLUMN_NAME',
      severity: 'low',
      columnId: column.id,
      columnName: column.name,
      title: 'Disambiguated duplicate header',
      message: `Original header "${column.originalName}" appeared multiple times and was disambiguated to "${column.name}".`,
    });
  }

  if (markerMissingCount > 0) {
    const markers = Array.from(matchedMissingMarkers).slice(0, 5).join(', ');
    warnings.push({
      code: 'MISSING_MARKER_NORMALIZED',
      severity: 'info',
      columnId: column.id,
      columnName: column.name,
      title: 'Missing-value markers detected',
      message: `${markerMissingCount.toLocaleString('en-US')} cell${markerMissingCount === 1 ? '' : 's'} matched configured missing markers (${markers}) under the active policy.`,
    });
  }

  // Missingness warnings
  if (totalCount > 0 && nonMissingCount === 0) {
    warnings.push({
      code: 'ALL_MISSING',
      severity: 'high',
      columnId: column.id,
      columnName: column.name,
      title: 'Column contains no populated values',
      message: `All ${totalCount.toLocaleString('en-US')} rows in "${column.name}" are missing.`,
    });
  } else if (missingPercentage >= HIGH_MISSING_WARNING_PCT) {
    warnings.push({
      code: 'HIGH_MISSING_RATE',
      severity:
        missingPercentage >= CRITICAL_MISSING_WARNING_PCT ? 'high' : 'medium',
      columnId: column.id,
      columnName: column.name,
      title: 'High missing-value rate',
      message: `${missingPercentage}% of records (${missingCount.toLocaleString('en-US')} of ${totalCount.toLocaleString('en-US')}) in "${column.name}" are missing.`,
    });
  }

  // All-missing column short-circuit
  if (nonMissingCount === 0) {
    return {
      columnId: column.id,
      name: column.name,
      originalName: column.originalName,
      index: column.index,
      detectedType: 'unknown',
      confidence: 'low',
      confidenceScore: 0,
      detectionReason:
        totalCount === 0
          ? 'No data rows available to infer column type.'
          : 'All values in this column are missing under the active policy.',
      totalCount,
      nonMissingCount: 0,
      validCount: 0,
      invalidCount: 0,
      missingCount,
      missingPercentage,
      structuralMissingCount,
      markerMissingCount,
      matchedMissingMarkers: Array.from(matchedMissingMarkers),
      uniqueCount: 0,
      duplicateCount: 0,
      distinctRatio: 0,
      sampleValues: [],
      warnings,
    };
  }

  // Evaluate column-level date convention evidence across delimiters
  let resolvedAmbiguousCount = 0;
  let unresolvedAmbiguousCount = 0;
  let hasConflictingDateConventions = false;
  const conventionNotes: string[] = [];

  for (const sep of ['/', '-', '.'] as const) {
    const ev = sepEvidence[sep];
    if (ev.dmy > 0 && ev.mdy > 0) {
      hasConflictingDateConventions = true;
      unresolvedAmbiguousCount += ev.ambiguous;
      conventionNotes.push(
        `Conflicting DD${sep}MM${sep}YYYY (${ev.dmy}) and MM${sep}DD${sep}YYYY (${ev.mdy}) dates detected.`,
      );
    } else if (ev.ambiguous > 0 && ev.dmy > 0 && ev.mdy === 0) {
      resolvedAmbiguousCount += ev.ambiguous;
      conventionNotes.push(
        `${ev.ambiguous} ambiguous "${sep}" date${ev.ambiguous === 1 ? '' : 's'} align with DD${sep}MM${sep}YYYY evidence from unambiguous rows (original values preserved).`,
      );
    } else if (ev.ambiguous > 0 && ev.mdy > 0 && ev.dmy === 0) {
      resolvedAmbiguousCount += ev.ambiguous;
      conventionNotes.push(
        `${ev.ambiguous} ambiguous "${sep}" date${ev.ambiguous === 1 ? '' : 's'} align with MM${sep}DD${sep}YYYY evidence from unambiguous rows (original values preserved).`,
      );
    } else if (ev.ambiguous > 0) {
      unresolvedAmbiguousCount += ev.ambiguous;
      conventionNotes.push(
        `${ev.ambiguous} delimited date${ev.ambiguous === 1 ? '' : 's'} using "${sep}" have both day and month ≤ 12 with no unambiguous convention proof.`,
      );
    }
  }

  const effectiveDateValidCount =
    dateUnambiguousValidCount + resolvedAmbiguousCount;
  const totalRecognizedDates =
    dateUnambiguousValidCount + dateAmbiguousCount;
  const totalDateLikeTokens = totalRecognizedDates + dateMalformedCount;

  const numericRatio = numericValidCount / nonMissingCount;
  const booleanStrictRatio = booleanStrictCount / nonMissingCount;
  const booleanAllRatio =
    (booleanStrictCount + booleanBinary01Count) / nonMissingCount;
  const dateRecognizedRatio = totalRecognizedDates / nonMissingCount;
  const dateLikeRatio = totalDateLikeTokens / nonMissingCount;
  const uuidRatio = uuidMatchCount / nonMissingCount;
  const prefixedIdRatio = prefixedIdMatchCount / nonMissingCount;
  const postalRatio = postalMatchCount / nonMissingCount;

  const idSignals = analyzeIdentifierColumnName(column.name);
  const boolNameMatch = hasBooleanColumnName(column.name);
  const dateNameMatch = hasDateColumnName(column.name);

  let detectedType: ProfileColumnType = 'categorical';
  let confidenceScore = 0.85;
  let detectionReason = '';
  let validCount = nonMissingCount;
  let invalidCount = 0;
  let numericStats: NumericValidityStats | undefined;
  let dateStats: DateDetectionStats | undefined;
  let topCategories: CategoryFrequency[] | undefined;

  // ── Classification Priority Cascade (Conservative & Deterministic) ──────

  const looksLikeCurrencyOrDecimalMeasurement =
    numericDecimalCount > 0 || numericFormattedCount > 0;

  // 1. Postal / ZIP code identifier check
  if (
    idSignals.isPostalName &&
    !looksLikeCurrencyOrDecimalMeasurement &&
    (postalRatio >= 0.7 || numericLeadingZeroCount > 0 || numericIntegerCount / nonMissingCount >= 0.8)
  ) {
    detectedType = 'identifier';
    confidenceScore = postalRatio >= 0.85 ? 0.96 : 0.84;
    detectionReason =
      numericLeadingZeroCount > 0
        ? 'Column name indicates postal/ZIP code and values include leading-zero digit codes (classified as identifier, not a numeric measurement).'
        : 'Column name and code format match postal/ZIP codes (classified as identifier rather than a numeric measurement).';
    validCount = nonMissingCount;
    invalidCount = 0;
  }
  // 2. Explicit identifier name (e.g. Customer ID, Order Number, SKU, Case ID)
  else if (
    idSignals.isStrongIdName &&
    !looksLikeCurrencyOrDecimalMeasurement &&
    booleanStrictRatio < 0.9 &&
    dateRecognizedRatio < 0.8
  ) {
    detectedType = 'identifier';
    const isForeignKeyLike = distinctRatio < 0.85 && nonMissingCount >= 4;
    confidenceScore = isForeignKeyLike ? 0.86 : 0.96;
    detectionReason = isForeignKeyLike
      ? `Identifier column name ("${column.name}") with repeated key occurrences (${Math.round(distinctRatio * 100)}% distinct — likely foreign-key/entity identifier).`
      : `Identifier column name ("${column.name}") with non-measurement key values (${Math.round(distinctRatio * 100)}% distinct).`;
    validCount = nonMissingCount;
    invalidCount = 0;
  }
  // 3. Structural value-pattern identifier (UUIDs, prefixed IDs like ORD-1001, or leading-zero fixed digit IDs)
  //    Conservative: NEVER classifies plain numeric measurements solely because values are unique!
  else if (
    !idSignals.isMeasurementName &&
    !looksLikeCurrencyOrDecimalMeasurement &&
    dateRecognizedRatio < 0.8 &&
    ((uuidRatio >= 0.9 && nonMissingCount >= 1) ||
      (prefixedIdRatio >= 0.9 &&
        distinctRatio >= 0.7 &&
        nonMissingCount >= 3) ||
      (numericLeadingZeroCount / nonMissingCount >= 0.5 &&
        numericIntegerCount === numericValidCount &&
        numericRatio >= 0.95 &&
        distinctRatio >= 0.7 &&
        nonMissingCount >= 3))
  ) {
    detectedType = 'identifier';
    confidenceScore = uuidRatio >= 0.9 ? 0.98 : 0.9;
    detectionReason =
      uuidRatio >= 0.9
        ? 'Values strictly match standard UUID identifier format.'
        : numericLeadingZeroCount > 0
          ? 'Leading-zero digit codes with high uniqueness indicate string identifiers rather than numeric quantities.'
          : 'Prefixed alphanumeric code pattern with high uniqueness indicates structured identifiers.';
    validCount = nonMissingCount;
    invalidCount = 0;
  }
  // 4. Boolean check
  else if (
    booleanStrictRatio >= 0.95 ||
    (boolNameMatch && booleanAllRatio >= 0.95 && uniqueCount <= 2)
  ) {
    detectedType = 'boolean';
    const boolValid = boolNameMatch
      ? booleanStrictCount + booleanBinary01Count
      : booleanStrictCount;
    validCount = boolValid;
    invalidCount = nonMissingCount - boolValid;
    confidenceScore = boolValid / nonMissingCount;
    detectionReason =
      boolNameMatch && booleanBinary01Count > 0
        ? `Boolean column name ("${column.name}") with binary 0/1 values.`
        : 'Values strictly match standard boolean tokens (true/false, yes/no, T/F, Y/N).';
    topCategories = extractTopCategories(
      frequencyMap,
      displayByKey,
      nonMissingCount,
    );
  }
  // 5. Date check (unambiguous ISO/named-month + explicit ambiguous/invalid tracking)
  else if (
    totalRecognizedDates > 0 &&
    (dateRecognizedRatio >= 0.8 ||
      (dateNameMatch && dateLikeRatio >= 0.65))
  ) {
    detectedType = 'date';
    validCount = effectiveDateValidCount;
    invalidCount = Math.max(
      0,
      nonMissingCount - effectiveDateValidCount - unresolvedAmbiguousCount,
    );

    const formatsList = Array.from(dateFormats);
    dateStats = {
      validCount: effectiveDateValidCount,
      ambiguousCount: unresolvedAmbiguousCount,
      invalidCount,
      detectedFormats: formatsList,
      ...(conventionNotes.length > 0
        ? { conventionNote: conventionNotes.join(' ') }
        : {}),
    };

    const validOrAmbigRatio =
      (effectiveDateValidCount + unresolvedAmbiguousCount * 0.6) /
      nonMissingCount;
    confidenceScore = roundFour(
      hasConflictingDateConventions
        ? Math.min(validOrAmbigRatio, 0.65)
        : validOrAmbigRatio,
    );

    if (unresolvedAmbiguousCount > 0) {
      detectionReason = `Detected date values (${formatsList.join(', ')}), including ${unresolvedAmbiguousCount} ambiguous date${unresolvedAmbiguousCount === 1 ? '' : 's'} requiring format verification.`;
    } else if (invalidCount > 0) {
      detectionReason = `Detected date values (${formatsList.join(', ')}) with ${invalidCount} invalid or malformed date value${invalidCount === 1 ? '' : 's'}.`;
    } else {
      detectionReason = `Consistent date values detected (${formatsList.join(', ')}).`;
    }

    if (unresolvedAmbiguousCount > 0 || hasConflictingDateConventions) {
      warnings.push({
        code: 'AMBIGUOUS_DATES',
        severity: hasConflictingDateConventions ? 'high' : 'medium',
        columnId: column.id,
        columnName: column.name,
        title: hasConflictingDateConventions
          ? 'Conflicting date format conventions'
          : 'Ambiguous date format detected',
        message:
          conventionNotes.length > 0
            ? conventionNotes.join(' ')
            : `${unresolvedAmbiguousCount} date value${unresolvedAmbiguousCount === 1 ? '' : 's'} cannot be interpreted unambiguously without confirming MM/DD vs DD/MM order.`,
      });
    }

    if (invalidCount > 0) {
      warnings.push({
        code: 'INVALID_DATES',
        severity: invalidCount / nonMissingCount >= 0.15 ? 'high' : 'medium',
        columnId: column.id,
        columnName: column.name,
        title: 'Invalid date values present',
        message: `${invalidCount.toLocaleString('en-US')} non-missing value${invalidCount === 1 ? '' : 's'} in "${column.name}" failed strict calendar date validation.`,
      });
    }
  }
  // 6. Numeric check (measurements, quantities, formatted currency/percentages)
  else if (numericRatio >= 0.85) {
    detectedType = 'numeric';
    validCount = numericValidCount;
    invalidCount = nonMissingCount - numericValidCount;
    confidenceScore = roundFour(numericRatio);

    numericStats = {
      validCount: numericValidCount,
      invalidCount,
      integerCount: numericIntegerCount,
      decimalCount: numericDecimalCount,
      formattedStringCount: numericFormattedCount,
      hasLeadingZeros: numericLeadingZeroCount > 0,
    };

    detectionReason =
      numericFormattedCount > 0
        ? `${roundTwo(numericRatio * 100)}% of non-missing values parse as numeric (including formatted currency/grouped strings).`
        : `${roundTwo(numericRatio * 100)}% of non-missing values are valid ${numericDecimalCount > 0 ? 'numeric measurements' : 'integers'}.`;

    if (invalidCount > 0) {
      warnings.push({
        code: 'MIXED_TYPES',
        severity: invalidCount / nonMissingCount >= 0.1 ? 'high' : 'medium',
        columnId: column.id,
        columnName: column.name,
        title: 'Non-numeric values in numeric column',
        message: `${invalidCount.toLocaleString('en-US')} of ${nonMissingCount.toLocaleString('en-US')} populated values in "${column.name}" could not be parsed as valid numbers.`,
      });
    }

    // Conservative warning for suspicious surrogate-key integer columns without an ID name
    const looksLikeSequentialSurrogateKey =
      !idSignals.isMeasurementName &&
      numericDecimalCount === 0 &&
      numericFormattedCount === 0 &&
      nonMissingCount >= 10 &&
      distinctRatio === 1 &&
      Number.isFinite(numericMinVal) &&
      Number.isFinite(numericMaxVal) &&
      numericMaxVal - numericMinVal === nonMissingCount - 1;

    if (looksLikeSequentialSurrogateKey || (numericLeadingZeroCount > 0 && !idSignals.isMeasurementName)) {
      warnings.push({
        code: 'POSSIBLE_IDENTIFIER',
        severity: 'info',
        columnId: column.id,
        columnName: column.name,
        title: 'Possible identifier column',
        message: numericLeadingZeroCount > 0
          ? `"${column.name}" contains leading-zero numeric strings; verify whether it represents a code/identifier rather than a numeric measurement.`
          : `"${column.name}" holds strictly sequential unique integers (${numericMinVal}–${numericMaxVal}); kept conservatively as numeric—confirm if it is a row/entity ID.`,
      });
    }
  }
  // 7. Mixed / incompatible types -> unknown
  else if (
    (numericRatio >= 0.25 && numericRatio < 0.85) ||
    (dateLikeRatio >= 0.25 && dateRecognizedRatio < 0.8) ||
    (booleanStrictRatio >= 0.25 && booleanStrictRatio < 0.95)
  ) {
    detectedType = 'unknown';
    validCount = 0;
    invalidCount = nonMissingCount;
    confidenceScore = 0.35;

    const components: string[] = [];
    if (numericValidCount > 0) {
      components.push(`${roundTwo(numericRatio * 100)}% numeric`);
    }
    if (totalRecognizedDates > 0 || dateMalformedCount > 0) {
      components.push(`${roundTwo(dateLikeRatio * 100)}% date-like`);
    }
    if (booleanStrictCount > 0) {
      components.push(`${roundTwo(booleanStrictRatio * 100)}% boolean`);
    }
    const otherCount = Math.max(
      0,
      nonMissingCount -
        Math.max(numericValidCount, totalDateLikeTokens, booleanStrictCount),
    );
    if (otherCount > 0) {
      components.push(
        `${roundTwo((otherCount / nonMissingCount) * 100)}% other text`,
      );
    }

    detectionReason = `Incompatible mixed value types prevented confident classification (${components.join(', ')}).`;

    if (totalDateLikeTokens > 0) {
      dateStats = {
        validCount: effectiveDateValidCount,
        ambiguousCount: unresolvedAmbiguousCount,
        invalidCount: nonMissingCount - effectiveDateValidCount - unresolvedAmbiguousCount,
        detectedFormats: Array.from(dateFormats),
        ...(conventionNotes.length > 0
          ? { conventionNote: conventionNotes.join(' ') }
          : {}),
      };
    }

    warnings.push({
      code: 'MIXED_TYPES',
      severity: 'high',
      columnId: column.id,
      columnName: column.name,
      title: 'Mixed data types detected',
      message: `"${column.name}" mixes incompatible value types (${components.join(', ')}) and was classified as unknown.`,
    });
  }
  // 8. Categorical fallback (consistent text/label values)
  else {
    detectedType = 'categorical';
    validCount = nonMissingCount;
    invalidCount = 0;
    confidenceScore = stringLikeCount === nonMissingCount ? 0.94 : 0.82;
    detectionReason =
      distinctRatio <= 0.35
        ? `Repeated text labels (${uniqueCount.toLocaleString('en-US')} distinct categories across ${nonMissingCount.toLocaleString('en-US')} populated records).`
        : `Consistent text/categorical values (${uniqueCount.toLocaleString('en-US')} unique values, ${Math.round(distinctRatio * 100)}% distinct).`;

    topCategories = extractTopCategories(
      frequencyMap,
      displayByKey,
      nonMissingCount,
    );
  }

  // Constant column structural notice (informational)
  if (nonMissingCount >= 2 && uniqueCount === 1) {
    warnings.push({
      code: 'CONSTANT_COLUMN',
      severity: 'info',
      columnId: column.id,
      columnName: column.name,
      title: 'Single constant value',
      message: `All ${nonMissingCount.toLocaleString('en-US')} populated rows in "${column.name}" contain the same value ("${sampleValues[0] ?? ''}").`,
    });
  }

  return {
    columnId: column.id,
    name: column.name,
    originalName: column.originalName,
    index: column.index,
    detectedType,
    confidence: toConfidence(confidenceScore),
    confidenceScore: roundFour(confidenceScore),
    detectionReason,
    totalCount,
    nonMissingCount,
    validCount,
    invalidCount,
    missingCount,
    missingPercentage,
    structuralMissingCount,
    markerMissingCount,
    matchedMissingMarkers: Array.from(matchedMissingMarkers),
    uniqueCount,
    duplicateCount,
    distinctRatio,
    sampleValues,
    ...(numericStats ? { numericStats } : {}),
    ...(dateStats ? { dateStats } : {}),
    ...(topCategories ? { topCategories } : {}),
    warnings,
  };
}

/**
 * Pure, React-independent dataset schema detection and quality profiling engine.
 * - Accepts the canonical ImportedDataset model.
 * - Never mutates dataset, columns, or row cells.
 * - Performs a single linear pass per column across the complete dataset.
 */
export function profileDataset(
  dataset: ImportedDataset,
  options: ProfileDatasetOptions = {},
): DatasetProfileSummary {
  const startMs =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  const missingValuePolicy =
    options.missingValuePolicy ?? DEFAULT_MISSING_VALUE_POLICY;
  const compiledMissing = compileMissingPolicy(missingValuePolicy);

  const typeDistribution: Record<ProfileColumnType, number> = {
    numeric: 0,
    categorical: 0,
    date: 0,
    boolean: 0,
    identifier: 0,
    unknown: 0,
  };

  const datasetWarnings: ProfileWarning[] = [];

  if (dataset.rowCount === 0 || dataset.columnCount === 0) {
    datasetWarnings.push({
      code: 'EMPTY_DATASET',
      severity: 'high',
      title: 'Empty dataset',
      message:
        dataset.columnCount === 0
          ? 'Dataset contains zero columns.'
          : 'Dataset contains column headers but zero data rows.',
    });
  }

  const columns: DatasetColumnProfile[] = [];
  let totalMissingCount = 0;

  for (let i = 0; i < dataset.columns.length; i += 1) {
    const col = dataset.columns[i]!;
    const colProfile = profileSingleColumn(col, dataset.rows, compiledMissing);
    columns.push(colProfile);
    typeDistribution[colProfile.detectedType] += 1;
    totalMissingCount += colProfile.missingCount;
    for (const w of colProfile.warnings) {
      datasetWarnings.push(w);
    }
  }

  const totalCells = dataset.rowCount * dataset.columnCount;
  const overallMissingPercentage =
    totalCells > 0 ? roundTwo((totalMissingCount / totalCells) * 100) : 0;

  const quality = computeDatasetQuality({
    dataset,
    columns,
    totalCells,
    totalMissingCount,
    warnings: datasetWarnings,
  });

  const endMs =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    datasetId: dataset.id,
    fileName: dataset.fileName,
    rowCount: dataset.rowCount,
    columnCount: dataset.columnCount,
    totalCells,
    totalMissingCount,
    overallMissingPercentage,
    typeDistribution,
    missingValuePolicy,
    columns,
    quality,
    warnings: datasetWarnings,
    profiledAt: Date.now(),
    durationMs: Math.max(0, Math.round(endMs - startMs)),
  };
}
