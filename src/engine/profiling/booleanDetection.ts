export type BooleanTokenFamily =
  | 'native'
  | 'true_false'
  | 'yes_no'
  | 't_f'
  | 'y_n'
  | 'binary_01';

export interface BooleanClassification {
  readonly isBoolean: boolean;
  readonly family?: BooleanTokenFamily;
}

const BOOLEAN_NAME_RE =
  /(?:^|[_\s-])(is|has|can|should|was|were|active|enabled|disabled|flag|verified|confirmed|approved|completed|deleted|archived|subscribed|opt_in|optin|boolean|bool)(?:$|[_\s-])/i;

export function hasBooleanColumnName(columnName: string): boolean {
  const normalized = columnName
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .trim();
  return BOOLEAN_NAME_RE.test(normalized);
}

/**
 * Classifies whether a non-missing value is boolean-like.
 * Distinguishes unambiguous boolean tokens (true/false, yes/no, t/f, y/n)
 * from 0/1 flags so numeric counts are not misclassified as boolean.
 */
export function classifyBooleanValue(value: unknown): BooleanClassification {
  if (typeof value === 'boolean') {
    return { isBoolean: true, family: 'native' };
  }

  if (typeof value === 'number') {
    if (value === 0 || value === 1) {
      return { isBoolean: true, family: 'binary_01' };
    }
    return { isBoolean: false };
  }

  if (typeof value !== 'string') {
    return { isBoolean: false };
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === 'false') {
    return { isBoolean: true, family: 'true_false' };
  }
  if (normalized === 'yes' || normalized === 'no') {
    return { isBoolean: true, family: 'yes_no' };
  }
  if (normalized === 't' || normalized === 'f') {
    return { isBoolean: true, family: 't_f' };
  }
  if (normalized === 'y' || normalized === 'n') {
    return { isBoolean: true, family: 'y_n' };
  }
  if (normalized === '0' || normalized === '1') {
    return { isBoolean: true, family: 'binary_01' };
  }

  return { isBoolean: false };
}
