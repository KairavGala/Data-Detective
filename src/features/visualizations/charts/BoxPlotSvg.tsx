import { useState } from 'react';
import type { PreparedBoxPlotData } from '@/types';
import { formatStatNumber } from '@/utils/format';
import {
  computeLinearTicks,
  formatCompactTick,
  useChartWidth,
} from './chartScaleUtils';

interface BoxPlotSvgProps {
  readonly data: PreparedBoxPlotData;
  readonly xAxisLabel: string;
  readonly showLegend: boolean;
  readonly chartTitle: string;
}

export function BoxPlotSvg({
  data,
  xAxisLabel,
  showLegend,
  chartTitle,
}: BoxPlotSvgProps) {
  const { containerRef, width } = useChartWidth(560, 280);
  const [hoverZone, setHoverZone] = useState<string | null>(null);

  const minVal = data.min ?? 0;
  const q1Val = data.q1 ?? minVal;
  const medianVal = data.median ?? minVal;
  const q3Val = data.q3 ?? minVal;
  const maxVal = data.max ?? minVal;

  const xScale = computeLinearTicks(minVal, maxVal, 6, false);
  const xSpan = Math.max(1e-9, xScale.domainMax - xScale.domainMin);

  const marginTop = 24;
  const marginRight = 24;
  const marginBottom = 54;
  const marginLeft = 24;
  const height = 196;

  const plotWidth = Math.max(140, width - marginLeft - marginRight);
  const plotHeight = height - marginTop - marginBottom;
  const midY = marginTop + plotHeight / 2;
  const boxHalfH = 22;

  const toX = (val: number) =>
    marginLeft + ((val - xScale.domainMin) / xSpan) * plotWidth;

  const xMin = toX(minVal);
  const xQ1 = toX(q1Val);
  const xMedian = toX(medianVal);
  const xQ3 = toX(q3Val);
  const xMax = toX(maxVal);
  const xMean = data.mean !== null ? toX(data.mean) : null;

  return (
    <div ref={containerRef} className="relative w-full select-none space-y-3">
      {showLegend && (
        <div
          className="flex flex-wrap items-center gap-4 text-[0.75rem] text-[var(--dd-text-secondary)]"
          data-testid="chart-legend"
        >
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-3.5 rounded-[1px] border border-[var(--dd-accent-teal)] bg-[var(--dd-accent-teal-dim)]"
              aria-hidden="true"
            />
            <span>IQR (Q1–Q3)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-0.5 bg-[var(--dd-status-verified)]"
              aria-hidden="true"
            />
            <span>Median (Q2)</span>
          </span>
          {xMean !== null && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rotate-45 bg-[var(--dd-status-warning)]"
                aria-hidden="true"
              />
              <span>Mean</span>
            </span>
          )}
        </div>
      )}

      {hoverZone && (
        <div
          role="status"
          data-testid="chart-tooltip"
          className="pointer-events-none absolute top-2 right-2 z-10 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-3 py-2 text-[0.75rem] font-mono dd-tabular shadow-lg"
        >
          <div className="text-[var(--dd-text-primary)]">{hoverZone}</div>
        </div>
      )}

      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Box plot: ${chartTitle}`}
        className="block w-full overflow-visible"
        onMouseLeave={() => setHoverZone(null)}
      >
        {/* Vertical gridlines & X ticks */}
        {xScale.ticks.map((tick) => {
          const x = toX(tick);
          return (
            <g key={`bx-${tick}`}>
              <line
                x1={x}
                y1={marginTop}
                x2={x}
                y2={marginTop + plotHeight}
                stroke="var(--dd-grid-line)"
                strokeWidth="1"
              />
              <text
                x={x}
                y={marginTop + plotHeight + 17}
                textAnchor="middle"
                fill="var(--dd-text-muted)"
                fontSize="10.5"
                className="font-mono dd-tabular"
              >
                {formatCompactTick(tick)}
              </text>
            </g>
          );
        })}

        {/* Baseline */}
        <line
          x1={marginLeft}
          y1={marginTop + plotHeight}
          x2={marginLeft + plotWidth}
          y2={marginTop + plotHeight}
          stroke="var(--dd-border-default)"
          strokeWidth="1"
        />

        {/* Whisker span (Min to Max) */}
        <line
          x1={xMin}
          y1={midY}
          x2={xMax}
          y2={midY}
          stroke="var(--dd-text-secondary)"
          strokeWidth="1.5"
        />

        {/* Min cap */}
        <line
          x1={xMin}
          y1={midY - 12}
          x2={xMin}
          y2={midY + 12}
          stroke="var(--dd-text-secondary)"
          strokeWidth="2"
          tabIndex={0}
          aria-label={`Minimum: ${formatStatNumber(minVal, 4)}`}
          className="cursor-pointer outline-none"
          onMouseEnter={() =>
            setHoverZone(`Min: ${formatStatNumber(minVal, 4)}`)
          }
          onFocus={() => setHoverZone(`Min: ${formatStatNumber(minVal, 4)}`)}
          onBlur={() => setHoverZone(null)}
        />

        {/* Max cap */}
        <line
          x1={xMax}
          y1={midY - 12}
          x2={xMax}
          y2={midY + 12}
          stroke="var(--dd-text-secondary)"
          strokeWidth="2"
          tabIndex={0}
          aria-label={`Maximum: ${formatStatNumber(maxVal, 4)}`}
          className="cursor-pointer outline-none"
          onMouseEnter={() =>
            setHoverZone(`Max: ${formatStatNumber(maxVal, 4)}`)
          }
          onFocus={() => setHoverZone(`Max: ${formatStatNumber(maxVal, 4)}`)}
          onBlur={() => setHoverZone(null)}
        />

        {/* IQR box (Q1 to Q3) */}
        <rect
          x={Math.min(xQ1, xQ3)}
          y={midY - boxHalfH}
          width={Math.max(3, Math.abs(xQ3 - xQ1))}
          height={boxHalfH * 2}
          rx="2"
          fill="rgba(68, 148, 144, 0.25)"
          stroke="var(--dd-accent-teal)"
          strokeWidth="1.75"
          tabIndex={0}
          aria-label={`IQR: Q1 ${formatStatNumber(q1Val, 4)} to Q3 ${formatStatNumber(q3Val, 4)}`}
          className="cursor-pointer outline-none"
          onMouseEnter={() =>
            setHoverZone(
              `Q1: ${formatStatNumber(q1Val, 4)} · Q3: ${formatStatNumber(q3Val, 4)} · IQR: ${formatStatNumber(data.iqr, 4)}`,
            )
          }
          onFocus={() =>
            setHoverZone(
              `Q1: ${formatStatNumber(q1Val, 4)} · Q3: ${formatStatNumber(q3Val, 4)} · IQR: ${formatStatNumber(data.iqr, 4)}`,
            )
          }
          onBlur={() => setHoverZone(null)}
        />

        {/* Median vertical marker */}
        <line
          x1={xMedian}
          y1={midY - boxHalfH - 2}
          x2={xMedian}
          y2={midY + boxHalfH + 2}
          stroke="var(--dd-status-verified)"
          strokeWidth="2.5"
          tabIndex={0}
          aria-label={`Median: ${formatStatNumber(medianVal, 4)}`}
          className="cursor-pointer outline-none"
          onMouseEnter={() =>
            setHoverZone(`Median (Q2): ${formatStatNumber(medianVal, 4)}`)
          }
          onFocus={() =>
            setHoverZone(`Median (Q2): ${formatStatNumber(medianVal, 4)}`)
          }
          onBlur={() => setHoverZone(null)}
        />

        {/* Mean diamond marker */}
        {xMean !== null && data.mean !== null && (
          <polygon
            points={`${xMean},${midY - 6} ${xMean + 6},${midY} ${xMean},${midY + 6} ${xMean - 6},${midY}`}
            fill="var(--dd-status-warning)"
            stroke="var(--dd-surface-primary)"
            strokeWidth="1"
            tabIndex={0}
            aria-label={`Mean: ${formatStatNumber(data.mean, 4)}`}
            className="cursor-pointer outline-none"
            onMouseEnter={() =>
              setHoverZone(`Mean: ${formatStatNumber(data.mean, 4)}`)
            }
            onFocus={() =>
              setHoverZone(`Mean: ${formatStatNumber(data.mean, 4)}`)
            }
            onBlur={() => setHoverZone(null)}
          />
        )}

        {/* X axis label */}
        {xAxisLabel && (
          <text
            x={marginLeft + plotWidth / 2}
            y={height - 8}
            textAnchor="middle"
            fill="var(--dd-text-muted)"
            fontSize="11"
            className="font-mono uppercase tracking-[0.06em]"
          >
            {xAxisLabel}
          </text>
        )}
      </svg>

      {/* Exact M04 five-number quartile readout strip */}
      <dl className="grid grid-cols-3 gap-x-4 gap-y-2 border-t border-[var(--dd-border-subtle)] pt-3 text-[0.75rem] sm:grid-cols-6">
        {[
          { label: 'Min', value: data.min },
          { label: 'Q1', value: data.q1 },
          { label: 'Median', value: data.median },
          { label: 'Q3', value: data.q3 },
          { label: 'Max', value: data.max },
          { label: 'IQR', value: data.iqr },
        ].map((metric) => (
          <div key={metric.label} className="space-y-0.5">
            <dt className="font-mono text-[0.625rem] uppercase tracking-[0.08em] text-[var(--dd-text-muted)]">
              {metric.label}
            </dt>
            <dd className="font-mono dd-tabular text-[var(--dd-text-primary)]">
              {formatStatNumber(metric.value, 3)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
