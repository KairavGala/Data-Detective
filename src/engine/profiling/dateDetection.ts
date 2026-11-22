export type DateValueStatus =
  | 'valid'
  | 'ambiguous'
  | 'invalid'
  | 'not_date';

export type DateFormatKind =
  | 'ISO-8601'
  | 'ISO-Timestamp'
  | 'YMD-Slash'
  | 'Named-Month'
  | 'DMY-Unambiguous'
  | 'MDY-Unambiguous'
  | 'Numeric-SameDayMonth'
  | 'Numeric-Ambiguous'
  | 'Date-Object'
  | 'Malformed-Date';

export interface DateValueClassification {
  readonly status: DateValueStatus;
  readonly format?: DateFormatKind;
  readonly separator?: '/' | '-' | '.';
}

const MONTH_MAP: Readonly<Record<string, number>> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const DATE_COLUMN_NAME_RE =
  /(?:^|[_\s-])(date|dt|time|timestamp|created|updated|modified|deleted|dob|birth|birthdate|birthday|joined|started|ended|ordered|shipped|delivered|due|expires|expiry|expiration|day|month|year|schedule|scheduled|logged|occurred|reported|at)(?:$|[_\s-])/i;

// YYYY-MM-DD with optional time portion
const ISO_DATE_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

// YYYY/MM/DD with optional time portion
const YMD_SLASH_RE =
  /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

// DD/MM/YYYY or MM/DD/YYYY (supports /, -, . consistently)
const DELIMITED_4Y_RE = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})$/;

// Named month formats: "Jan 15, 2026" / "January 15 2026"
const MONTH_FIRST_RE =
  /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/;

// Named month formats: "15 Jan 2026" / "15-Jan-2026" / "15 January, 2026"
const DAY_FIRST_NAMED_RE =
  /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})$/;

export function hasDateColumnName(columnName: string): boolean {
  const normalized = columnName.replace(/([a-z])([A-Z])/g, '$1_$2').trim();
  return DATE_COLUMN_NAME_RE.test(normalized);
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (year < 1000 || year > 2999) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function isValidTimeParts(
  hourStr?: string,
  minStr?: string,
  secStr?: string,
): boolean {
  if (hourStr === undefined || minStr === undefined) return true;
  const h = Number(hourStr);
  const m = Number(minStr);
  const s = secStr !== undefined ? Number(secStr) : 0;
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 && s >= 0 && s <= 59;
}

/**
 * Strictly classifies a single non-missing value for date validity and ambiguity.
 * Never mutates the original value and never falls back to permissive JS Date parsing.
 */
export function classifyDateValue(value: unknown): DateValueClassification {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { status: 'invalid', format: 'Malformed-Date' }
      : { status: 'valid', format: 'Date-Object' };
  }

  if (typeof value !== 'string') {
    return { status: 'not_date' };
  }

  const trimmed = value.trim();
  if (trimmed.length < 6 || trimmed.length > 40) {
    return { status: 'not_date' };
  }

  // 1. ISO-8601 date or timestamp (unambiguous Y-M-D)
  const isoMatch = ISO_DATE_RE.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const validDate = isValidCalendarDate(year, month, day);
    const validTime = isValidTimeParts(isoMatch[4], isoMatch[5], isoMatch[6]);
    if (!validDate || !validTime) {
      return { status: 'invalid', format: 'Malformed-Date' };
    }
    return {
      status: 'valid',
      format: isoMatch[4] !== undefined ? 'ISO-Timestamp' : 'ISO-8601',
    };
  }

  // 2. YYYY/MM/DD (unambiguous 4-digit year first)
  const ymdSlash = YMD_SLASH_RE.exec(trimmed);
  if (ymdSlash) {
    const year = Number(ymdSlash[1]);
    const month = Number(ymdSlash[2]);
    const day = Number(ymdSlash[3]);
    const validDate = isValidCalendarDate(year, month, day);
    const validTime = isValidTimeParts(ymdSlash[4], ymdSlash[5], ymdSlash[6]);
    if (!validDate || !validTime) {
      return { status: 'invalid', format: 'Malformed-Date' };
    }
    return { status: 'valid', format: 'YMD-Slash' };
  }

  // 3. Named-month formats ("Jan 15, 2026" or "15 Jan 2026")
  const monthFirst = MONTH_FIRST_RE.exec(trimmed);
  if (monthFirst) {
    const month = MONTH_MAP[monthFirst[1]!.toLowerCase()];
    if (month !== undefined) {
      const day = Number(monthFirst[2]);
      const year = Number(monthFirst[3]);
      return isValidCalendarDate(year, month, day)
        ? { status: 'valid', format: 'Named-Month' }
        : { status: 'invalid', format: 'Malformed-Date' };
    }
  }

  const dayFirstNamed = DAY_FIRST_NAMED_RE.exec(trimmed);
  if (dayFirstNamed) {
    const month = MONTH_MAP[dayFirstNamed[2]!.toLowerCase()];
    if (month !== undefined) {
      const day = Number(dayFirstNamed[1]);
      const year = Number(dayFirstNamed[3]);
      return isValidCalendarDate(year, month, day)
        ? { status: 'valid', format: 'Named-Month' }
        : { status: 'invalid', format: 'Malformed-Date' };
    }
  }

  // 4. Numeric delimited dates (DD/MM/YYYY vs MM/DD/YYYY)
  const delimited = DELIMITED_4Y_RE.exec(trimmed);
  if (delimited) {
    const first = Number(delimited[1]);
    const separator = delimited[2] as '/' | '-' | '.';
    const second = Number(delimited[3]);
    const year = Number(delimited[4]);

    if (year < 1000 || year > 2999) {
      return { status: 'not_date' };
    }

    // Both parts invalid or zero -> clearly malformed calendar date
    if (first === 0 || second === 0 || (first > 12 && second > 12)) {
      return { status: 'invalid', format: 'Malformed-Date', separator };
    }

    // First > 12 => must be DD/MM/YYYY
    if (first > 12 && second <= 12) {
      return isValidCalendarDate(year, second, first)
        ? { status: 'valid', format: 'DMY-Unambiguous', separator }
        : { status: 'invalid', format: 'Malformed-Date', separator };
    }

    // Second > 12 => must be MM/DD/YYYY
    if (second > 12 && first <= 12) {
      return isValidCalendarDate(year, first, second)
        ? { status: 'valid', format: 'MDY-Unambiguous', separator }
        : { status: 'invalid', format: 'Malformed-Date', separator };
    }

    // Both <= 12: equal day & month (e.g. 05/05/2026) is unambiguous;
    // distinct values (e.g. 01/02/2026) are genuinely ambiguous without convention proof.
    if (first === second) {
      return isValidCalendarDate(year, first, second)
        ? { status: 'valid', format: 'Numeric-SameDayMonth', separator }
        : { status: 'invalid', format: 'Malformed-Date', separator };
    }

    return { status: 'ambiguous', format: 'Numeric-Ambiguous', separator };
  }

  return { status: 'not_date' };
}
