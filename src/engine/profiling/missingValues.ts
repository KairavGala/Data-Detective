import type { MissingValuePolicy } from '@/types';

/**
 * Default documented missing-value normalization policy.
 *
 * Structural missing values:
 * - null, undefined, NaN (numeric), empty strings (""), and whitespace-only strings.
 *
 * Explicit sentinel string markers (case-insensitive after trimming):
 * - "NA", "N/A", "NULL", "NIL", "NaN", "MISSING", "-", "--"
 *
 * Deliberate conservative exclusion:
 * - "None" is NOT treated as missing by default because it is frequently a
 *   legitimate categorical value (e.g. "Allergies: None", "Discount: None").
 *   Callers can opt in via createMissingValuePolicy({ includeNone: true }) or
 *   custom stringMarkers.
 */
export const DEFAULT_MISSING_STRING_MARKERS: readonly string[] = [
  'na',
  'n/a',
  'null',
  'nil',
  'nan',
  'missing',
  '-',
  '--',
] as const;

export const DEFAULT_MISSING_VALUE_POLICY: MissingValuePolicy = {
  treatEmptyStringAsMissing: true,
  treatWhitespaceOnlyAsMissing: true,
  stringMarkers: DEFAULT_MISSING_STRING_MARKERS,
  description:
    'Treats null, undefined, NaN, empty/whitespace strings, and explicit sentinel tokens (NA, N/A, NULL, NIL, NaN, MISSING, -, --) as missing. Preserves "None" as a valid categorical label unless explicitly enabled.',
};

export interface CreateMissingValuePolicyOptions {
  readonly treatEmptyStringAsMissing?: boolean;
  readonly treatWhitespaceOnlyAsMissing?: boolean;
  readonly stringMarkers?: readonly string[];
  readonly includeNone?: boolean;
}

export function createMissingValuePolicy(
  options: CreateMissingValuePolicyOptions = {},
): MissingValuePolicy {
  const treatEmptyStringAsMissing = options.treatEmptyStringAsMissing ?? true;
  const treatWhitespaceOnlyAsMissing =
    options.treatWhitespaceOnlyAsMissing ?? true;

  const baseMarkers = options.stringMarkers
    ? options.stringMarkers.map((m) => m.trim().toLowerCase()).filter(Boolean)
    : [...DEFAULT_MISSING_STRING_MARKERS];

  if (options.includeNone && !baseMarkers.includes('none')) {
    baseMarkers.push('none');
  }

  const dedupedMarkers = Array.from(new Set(baseMarkers));
  const markerPreview =
    dedupedMarkers.length > 0
      ? dedupedMarkers.map((m) => m.toUpperCase()).join(', ')
      : 'none configured';

  const includesNone = dedupedMarkers.includes('none');

  return {
    treatEmptyStringAsMissing,
    treatWhitespaceOnlyAsMissing,
    stringMarkers: dedupedMarkers,
    description: includesNone
      ? `Treats null, undefined, NaN, empty/whitespace strings, and configured sentinel markers (${markerPreview}) including "None" as missing.`
      : `Treats null, undefined, NaN, empty/whitespace strings, and configured sentinel markers (${markerPreview}) as missing. Preserves "None" as a valid categorical value.`,
  };
}

export interface CompiledMissingPolicy {
  readonly policy: MissingValuePolicy;
  readonly markerSet: ReadonlySet<string>;
}

export function compileMissingPolicy(
  policy: MissingValuePolicy = DEFAULT_MISSING_VALUE_POLICY,
): CompiledMissingPolicy {
  const markerSet = new Set<string>(
    policy.stringMarkers.map((m) => m.trim().toLowerCase()).filter(Boolean),
  );
  return { policy, markerSet };
}

export type MissingClassification =
  | { readonly kind: 'present' }
  | { readonly kind: 'structural' }
  | { readonly kind: 'marker'; readonly marker: string };

/**
 * Classifies a single cell value without mutating the source value.
 */
export function classifyMissingValue(
  value: unknown,
  compiled: CompiledMissingPolicy,
): MissingClassification {
  if (value === null || value === undefined) {
    return { kind: 'structural' };
  }

  if (typeof value === 'number') {
    return Number.isNaN(value) ? { kind: 'structural' } : { kind: 'present' };
  }

  if (typeof value === 'string') {
    if (value.length === 0) {
      return compiled.policy.treatEmptyStringAsMissing
        ? { kind: 'structural' }
        : { kind: 'present' };
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return compiled.policy.treatWhitespaceOnlyAsMissing
        ? { kind: 'structural' }
        : { kind: 'present' };
    }

    if (compiled.markerSet.size > 0) {
      const normalized = trimmed.toLowerCase();
      if (compiled.markerSet.has(normalized)) {
        return { kind: 'marker', marker: trimmed };
      }
    }
  }

  return { kind: 'present' };
}
