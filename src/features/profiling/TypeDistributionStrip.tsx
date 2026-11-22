import type { ProfileColumnType } from '@/types';
import { formatCount } from '@/utils';

export const COLUMN_TYPE_META: Readonly<
  Record<
    ProfileColumnType,
    {
      readonly label: string;
      readonly shortCode: string;
      readonly accentVar: string;
    }
  >
> = {
  numeric: {
    label: 'Numeric',
    shortCode: 'NUM',
    accentVar: 'var(--dd-accent-teal)',
  },
  categorical: {
    label: 'Categorical',
    shortCode: 'CAT',
    accentVar: 'var(--dd-status-verified)',
  },
  date: {
    label: 'Date',
    shortCode: 'DAT',
    accentVar: 'var(--dd-status-warning)',
  },
  boolean: {
    label: 'Boolean',
    shortCode: 'BOL',
    accentVar: '#7e8fd1',
  },
  identifier: {
    label: 'Identifier',
    shortCode: 'IDN',
    accentVar: 'var(--dd-text-secondary)',
  },
  unknown: {
    label: 'Unknown',
    shortCode: 'UNK',
    accentVar: 'var(--dd-status-anomaly)',
  },
};

const TYPE_ORDER: readonly ProfileColumnType[] = [
  'numeric',
  'categorical',
  'date',
  'boolean',
  'identifier',
  'unknown',
];

interface TypeDistributionStripProps {
  readonly distribution: Readonly<Record<ProfileColumnType, number>>;
  readonly totalColumns: number;
}

/**
 * Clean proportional schema-type distribution strip + unboxed typographic legend.
 * Strictly reflects detected column counts from the active DatasetProfileSummary.
 */
export function TypeDistributionStrip({
  distribution,
  totalColumns,
}: TypeDistributionStripProps) {
  const populatedTypes = TYPE_ORDER.filter((t) => distribution[t] > 0);

  return (
    <div className="space-y-3" data-testid="type-distribution-strip">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[0.7rem] tracking-[0.06em] text-[var(--dd-text-muted)] uppercase">
          Detected Schema Distribution
        </span>
        <span className="font-mono text-[0.7rem] text-[var(--dd-text-muted)] dd-tabular">
          {formatCount(totalColumns)} column{totalColumns === 1 ? '' : 's'}
        </span>
      </div>

      {/* Hairline proportional bar */}
      <div
        className="flex h-2 w-full overflow-hidden rounded-[var(--dd-radius-xs)] bg-[var(--dd-surface-recessed)]"
        role="img"
        aria-label={
          populatedTypes.length > 0
            ? `Column types: ${populatedTypes
                .map((t) => `${distribution[t]} ${COLUMN_TYPE_META[t].label}`)
                .join(', ')}`
            : 'No columns profiled'
        }
      >
        {totalColumns > 0 &&
          populatedTypes.map((type) => {
            const count = distribution[type];
            const widthPct = (count / totalColumns) * 100;
            return (
              <div
                key={type}
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: COLUMN_TYPE_META[type].accentVar,
                }}
                className="h-full border-r border-[var(--dd-bg-canvas)] last:border-r-0"
                title={`${COLUMN_TYPE_META[type].label}: ${count}`}
              />
            );
          })}
      </div>

      {/* Unboxed typographic breakdown */}
      <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.8125rem]">
        {TYPE_ORDER.map((type) => {
          const count = distribution[type];
          const meta = COLUMN_TYPE_META[type];
          return (
            <div
              key={type}
              className="inline-flex items-center gap-2 whitespace-nowrap"
            >
              <span
                className="inline-block h-2 w-2 rounded-[1px] shrink-0"
                style={{ backgroundColor: meta.accentVar }}
                aria-hidden="true"
              />
              <dt className="text-[var(--dd-text-secondary)]">{meta.label}</dt>
              <dd className="font-mono text-[0.75rem] font-medium text-[var(--dd-text-primary)] dd-tabular">
                {formatCount(count)}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
