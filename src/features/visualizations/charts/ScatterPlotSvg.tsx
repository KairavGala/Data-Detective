import { useState } from 'react';
import type { PreparedScatterChartData } from '@/types';
import { formatCount, formatStatNumber } from '@/utils/format';
import {
  computeLinearTicks,
  formatCompactTick,
  useChartWidth,
} from './chartScaleUtils';

interface ScatterPlotSvgProps {
  readonly data: PreparedScatterChartData;
  readonly xAxisLabel: string;
  readonly yAxisLabel: string;
  readonly showLegend: boolean;
  readonly chartTitle: string;
}

export function ScatterPlotSvg({
  data,
  xAxisLabel,
  yAxisLabel,
  showLegend,
  chartTitle,
}: ScatterPlotSvgProps) {
  const { containerRef, width } = useChartWidth(560, 280);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const points = data.points;
  const xScale = computeLinearTicks(data.xMin ?? 0, data.xMax ?? 1, 5, false);
  const yScale = computeLinearTicks(data.yMin ?? 0, data.yMax ?? 1, 5, false);

  const xSpan = Math.max(1e-9, xScale.domainMax - xScale.domainMin);
  const ySpan = Math.max(1e-9, yScale.domainMax - yScale.domainMin);

  const marginTop = 20;
  const marginRight = 22;
  const marginBottom = 56;
  const marginLeft = 60;
  const height = 286;

  const plotWidth = Math.max(120, width - marginLeft - marginRight);
  const plotHeight = Math.max(100, height - marginTop - marginBottom);

  const activePoint =
    activeIndex !== null && activeIndex >= 0 && activeIndex < points.length
      ? points[activeIndex]
      : null;

  const pointRadius = points.length > 500 ? 2.2 : 3.2;

  return (
    <div ref={containerRef} className="relative w-full select-none">
      {showLegend && (
        <div
          className="mb-2 flex flex-wrap items-center gap-4 text-[0.75rem] text-[var(--dd-text-secondary)]"
          data-testid="chart-legend"
        >
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--dd-accent-teal)]"
              aria-hidden="true"
            />
            <span>Paired Observations</span>
          </span>
          <span className="font-mono dd-tabular text-[0.6875rem] text-[var(--dd-text-muted)]">
            {data.isSampled
              ? `Deterministic sample: ${formatCount(points.length)} of ${formatCount(data.totalValidPairs)} valid pairs`
              : `${formatCount(points.length)} valid pairs`}
          </span>
        </div>
      )}

      {activePoint && (
        <div
          role="status"
          data-testid="chart-tooltip"
          className="pointer-events-none absolute top-2 right-2 z-10 max-w-[240px] rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-3 py-2 text-[0.75rem] shadow-lg"
        >
          <div className="font-mono dd-tabular text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--dd-text-muted)]">
            Row #{formatCount(activePoint.rowNumber)}
          </div>
          <div className="mt-1 flex items-center justify-between gap-4 font-mono dd-tabular text-[var(--dd-text-secondary)]">
            <span className="truncate">{xAxisLabel || data.xColumnName}</span>
            <span className="text-[var(--dd-text-primary)]">
              {formatStatNumber(activePoint.x, 4)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 font-mono dd-tabular text-[var(--dd-text-secondary)]">
            <span className="truncate">{yAxisLabel || data.yColumnName}</span>
            <span className="text-[var(--dd-accent-teal)]">
              {formatStatNumber(activePoint.y, 4)}
            </span>
          </div>
        </div>
      )}

      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Scatter plot: ${chartTitle}`}
        className="block w-full overflow-visible"
        onMouseLeave={() => setActiveIndex(null)}
      >
        {/* Horizontal gridlines & Y ticks */}
        {yScale.ticks.map((tick) => {
          const y =
            marginTop +
            plotHeight -
            ((tick - yScale.domainMin) / ySpan) * plotHeight;
          return (
            <g key={`y-${tick}`}>
              <line
                x1={marginLeft}
                y1={y}
                x2={marginLeft + plotWidth}
                y2={y}
                stroke="var(--dd-grid-line)"
                strokeWidth="1"
              />
              <text
                x={marginLeft - 8}
                y={y + 3.5}
                textAnchor="end"
                fill="var(--dd-text-muted)"
                fontSize="10.5"
                className="font-mono dd-tabular"
              >
                {formatCompactTick(tick)}
              </text>
            </g>
          );
        })}

        {/* Vertical gridlines & X ticks */}
        {xScale.ticks.map((tick) => {
          const x =
            marginLeft + ((tick - xScale.domainMin) / xSpan) * plotWidth;
          return (
            <g key={`x-${tick}`}>
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
                fontSize="10"
                className="font-mono dd-tabular"
              >
                {formatCompactTick(tick)}
              </text>
            </g>
          );
        })}

        {/* Axis frame lines */}
        <line
          x1={marginLeft}
          y1={marginTop + plotHeight}
          x2={marginLeft + plotWidth}
          y2={marginTop + plotHeight}
          stroke="var(--dd-border-default)"
          strokeWidth="1"
        />
        <line
          x1={marginLeft}
          y1={marginTop}
          x2={marginLeft}
          y2={marginTop + plotHeight}
          stroke="var(--dd-border-default)"
          strokeWidth="1"
        />

        {/* Scatter points */}
        {points.map((pt, idx) => {
          const cx = marginLeft + ((pt.x - xScale.domainMin) / xSpan) * plotWidth;
          const cy =
            marginTop +
            plotHeight -
            ((pt.y - yScale.domainMin) / ySpan) * plotHeight;
          const isActive = activeIndex === idx;

          return (
            <circle
              key={`sc-${idx}-${pt.rowNumber}`}
              cx={cx}
              cy={cy}
              r={isActive ? pointRadius + 2 : pointRadius}
              fill={
                isActive
                  ? 'var(--dd-text-primary)'
                  : 'rgba(68, 148, 144, 0.72)'
              }
              stroke={
                isActive
                  ? 'var(--dd-accent-teal)'
                  : 'rgba(68, 148, 144, 0.95)'
              }
              strokeWidth={isActive ? '1.5' : '0.6'}
              tabIndex={points.length <= 60 ? 0 : -1}
              aria-label={`Row ${pt.rowNumber}: ${formatStatNumber(pt.x, 2)}, ${formatStatNumber(pt.y, 2)}`}
              className="cursor-pointer outline-none"
              onMouseEnter={() => setActiveIndex(idx)}
              onFocus={() => setActiveIndex(idx)}
              onBlur={() => setActiveIndex(null)}
            />
          );
        })}

        {/* Axis labels */}
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

        {yAxisLabel && (
          <text
            x={14}
            y={marginTop + plotHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${marginTop + plotHeight / 2})`}
            fill="var(--dd-text-muted)"
            fontSize="11"
            className="font-mono uppercase tracking-[0.06em]"
          >
            {yAxisLabel}
          </text>
        )}
      </svg>
    </div>
  );
}
