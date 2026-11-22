export interface NumericClassification {
  readonly isValid: boolean;
  readonly isInteger: boolean;
  readonly isFormattedString: boolean;
  readonly hasLeadingZero: boolean;
  readonly numericValue?: number;
}

const PLAIN_NUMBER_RE = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const GROUPED_NUMBER_RE = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
const ACCOUNTING_PAREN_RE = /^\(\s*([$€£¥₹])?\s*([0-9][0-9,]*(?:\.\d+)?)\s*\)$/;
const LEADING_ZERO_DIGITS_RE = /^0\d+$/;

const CURRENCY_SYMBOLS = new Set(['$', '€', '£', '¥', '₹']);

/**
 * Evaluates whether a non-missing cell value represents a valid numeric value.
 * Preserves the original value without mutation and captures structural signals
 * (leading zeros, formatting, integer vs decimal) needed for identifier vs measurement
 * classification.
 */
export function classifyNumericValue(value: unknown): NumericClassification {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return {
        isValid: false,
        isInteger: false,
        isFormattedString: false,
        hasLeadingZero: false,
      };
    }
    return {
      isValid: true,
      isInteger: Number.isInteger(value),
      isFormattedString: false,
      hasLeadingZero: false,
      numericValue: value,
    };
  }

  if (typeof value !== 'string') {
    return {
      isValid: false,
      isInteger: false,
      isFormattedString: false,
      hasLeadingZero: false,
    };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      isInteger: false,
      isFormattedString: false,
      hasLeadingZero: false,
    };
  }

  // Leading-zero digit sequences (e.g. "02139", "00412") are strong ID/postal signals
  const hasLeadingZero = LEADING_ZERO_DIGITS_RE.test(trimmed);

  // Plain unformatted numeric string
  if (PLAIN_NUMBER_RE.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return {
        isValid: true,
        isInteger: Number.isInteger(parsed) && !trimmed.includes('.'),
        isFormattedString: false,
        hasLeadingZero,
        numericValue: parsed,
      };
    }
  }

  // Accounting negative format e.g. ($1,250.50) or (420.00)
  const parenMatch = ACCOUNTING_PAREN_RE.exec(trimmed);
  if (parenMatch) {
    const body = parenMatch[2]!;
    if (PLAIN_NUMBER_RE.test(body) || GROUPED_NUMBER_RE.test(body)) {
      const normalized = body.replaceAll(',', '');
      const parsed = -Number(normalized);
      if (Number.isFinite(parsed)) {
        return {
          isValid: true,
          isInteger: Number.isInteger(parsed) && !normalized.includes('.'),
          isFormattedString: true,
          hasLeadingZero: false,
          numericValue: parsed,
        };
      }
    }
  }

  // Currency prefix/sign or percentage suffix with optional thousands grouping
  let working = trimmed;
  let isFormattedString = false;
  let negative = false;

  if (working.startsWith('-')) {
    negative = true;
    working = working.slice(1).trim();
  } else if (working.startsWith('+')) {
    working = working.slice(1).trim();
  }

  if (working.length > 1 && CURRENCY_SYMBOLS.has(working[0]!)) {
    isFormattedString = true;
    working = working.slice(1).trim();
  }

  if (working.length > 1 && working.endsWith('%')) {
    isFormattedString = true;
    working = working.slice(0, -1).trim();
  }

  if (working.length === 0) {
    return {
      isValid: false,
      isInteger: false,
      isFormattedString: false,
      hasLeadingZero: false,
    };
  }

  const isGrouped = GROUPED_NUMBER_RE.test(working);
  const isPlain = !isGrouped && PLAIN_NUMBER_RE.test(working);

  if (isGrouped || isPlain) {
    if (isGrouped) {
      isFormattedString = true;
    }
    const normalized = isGrouped ? working.replaceAll(',', '') : working;
    const rawNumber = Number(normalized);
    const parsed = negative ? -rawNumber : rawNumber;

    if (Number.isFinite(parsed)) {
      return {
        isValid: true,
        isInteger: Number.isInteger(parsed) && !normalized.includes('.'),
        isFormattedString,
        hasLeadingZero: !isFormattedString && LEADING_ZERO_DIGITS_RE.test(working),
        numericValue: parsed,
      };
    }
  }

  return {
    isValid: false,
    isInteger: false,
    isFormattedString: false,
    hasLeadingZero: false,
  };
}
