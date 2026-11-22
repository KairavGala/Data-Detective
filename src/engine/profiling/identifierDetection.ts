export interface IdentifierColumnNameSignals {
  readonly isStrongIdName: boolean;
  readonly isPostalName: boolean;
  readonly isMeasurementName: boolean;
}

const POSTAL_NAME_RE =
  /(?:^|[_\s-])(zip|zipcode|zip_code|postal|postal_code|postcode|pincode|pin_code)(?:$|[_\s-])/i;

// Matches explicit identifier keywords using token boundaries after camelCase splitting
// so words like "AmountPaid" or "IsValid" do not falsely match "id".
const STRONG_ID_NAME_RE =
  /(?:^|[_\s-])(id|ids|uuid|guid|sku|ssn|iban|vin|isbn|ean|upc|ref|reference|serial|key|token|hash|code|identifier|email|phone|mobile|account|acct|invoice|order|case|ticket|transaction|tx|customer|client|user|member|employee|patient|student|record|batch|tracking)(?:$|[_\s-])/i;

const NUMBER_SUFFIX_ID_RE =
  /(?:^|[_\s-])(order|invoice|account|case|ticket|reference|tracking|serial|receipt|po|policy|claim|badge|license|licence|permit|card|member|customer|employee|patient|phone|mobile|routing|check|cheque)[_\s-]?(?:no|num|number|#)(?:$|[_\s-])/i;

const MEASUREMENT_NAME_RE =
  /(?:^|[_\s-])(revenue|amount|price|cost|total|subtotal|tax|profit|margin|salary|wage|income|balance|rate|ratio|percent|pct|percentage|score|weight|height|length|width|depth|distance|duration|age|temp|temperature|quantity|qty|count|units|volume|sales|spend|budget|fee|discount|latitude|longitude|lat|lng|lon|hours|minutes|seconds|days|metric|value)(?:$|[_\s-])/i;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Prefixed alphanumeric identifiers like ORD-10042, CUST_01, EV-001, SKU9281
const PREFIXED_ID_RE = /^[A-Za-z]{1,6}[-_#]?\d{2,}$/;

// Common postal/ZIP formats: 5-digit US, ZIP+4, Canadian (A1A 1A1), UK-like alphanumeric
const POSTAL_VALUE_RE =
  /^(?:\d{5}(?:-\d{4})?|\d{4,6}|[A-Za-z]\d[A-Za-z][\s-]?\d[A-Za-z]\d|[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2})$/;

function splitCamelAndNormalize(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').trim();
}

export function analyzeIdentifierColumnName(
  columnName: string,
): IdentifierColumnNameSignals {
  const normalized = splitCamelAndNormalize(columnName);
  const isPostalName = POSTAL_NAME_RE.test(normalized);
  const isMeasurementName = MEASUREMENT_NAME_RE.test(normalized);

  // If a column clearly combines an entity with a measurement (e.g. "Order Total",
  // "Customer Revenue", "Invoice Amount"), treat it as a measurement, NOT an ID.
  if (isMeasurementName && !/(?:^|[_\s-])(id|uuid|guid|sku|code)(?:$|[_\s-])/i.test(normalized)) {
    return {
      isStrongIdName: false,
      isPostalName,
      isMeasurementName: true,
    };
  }

  // Require an explicit ID/code/number token rather than bare entity names like "Customer" or "Order"
  // (e.g. "Customer" alone could be a categorical customer name, whereas "Customer ID" or "Order Number" is an ID).
  const hasExplicitIdToken =
    /(?:^|[_\s-])(id|ids|uuid|guid|sku|ssn|iban|vin|isbn|ean|upc|ref|reference|serial|key|token|hash|code|identifier|email|phone|mobile|tracking)(?:$|[_\s-])/i.test(
      normalized,
    ) || NUMBER_SUFFIX_ID_RE.test(normalized);

  const isStrongIdName =
    hasExplicitIdToken || (STRONG_ID_NAME_RE.test(normalized) && /_id$/i.test(normalized));

  return {
    isStrongIdName,
    isPostalName,
    isMeasurementName,
  };
}

export function matchesUuidPattern(value: string): boolean {
  return UUID_RE.test(value);
}

export function matchesPrefixedIdPattern(value: string): boolean {
  return PREFIXED_ID_RE.test(value);
}

export function matchesPostalCodePattern(value: string): boolean {
  return POSTAL_VALUE_RE.test(value);
}
