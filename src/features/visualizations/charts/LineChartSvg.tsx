import { useState } from 'react';
import type { PreparedLineChartData } from '@/types';
import { formatCount, formatStatNumber } from '@/utils/format';
import {
  computeLinearTicks,
  formatCompactTick,
  truncateAxisLabel,
  useChartWidth,
} from './chartScaleUtils';

interface LineChartSvgProps {
  readonly data: PreparedLineChartData;
  readonly xAxisLabel: string;
  readonly yAxisLabel: string;
  readonly showLegend: boolean;
  readonly chartTitle: string;
}

export function LineChartSvg({
  data,
  xAxisLabel,
  yAxisLabel,
  showLegend,
  chartTitle,
}: LineChartSvgProps) {
  const { containerRef, width } = useChartWidth(560, 280);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const points = data.points;
  const yMinRaw = data.yMin ?? 0;
  const yMaxRaw = data.yMax ?? 1;
  const yScale = computeLinearTicks(yMinRaw, yMaxRaw, 5, false);

  const xMin = points[0]?.xValue ?? 0;
  const xMax = points[points.length - 1]?.xValue ?? xMin;
  const xSpan = xMax - xMin;
  const ySpan = Math.max(1e-9, yScale.domainMax - yScale.domainMin);

  const marginTop = 20;
  const marginRight = 22;
  const marginBottom = 56;
  const marginLeft = 60;
  const height = 286;

  const plotWidth = Math.max(120, width - marginLeft - marginRight);
  const plotHeight = Math.max(100, height - marginTop - marginBottom);

  const coords = points.map((pt, idx) => {
    const xRatio =
      xSpan > 0
        ? (pt.xValue - xMin) / xSpan
        : points.length > 1
          ? idx / (points.length - 1)
          : 0.5;
    const x = marginLeft + xRatio * plotWidth;
    const y =
      marginTop +
      plotHeight -
      ((pt.yValue - yScale.domainMin) / ySpan) * plotHeight;
    return { x, y, pt };
  });

  const polylinePoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  // Select up to 5 evenly spaced X ticks
  const tickCount = Math.min(5, points.length);
  const xTickIndices: number[] = [];
  if (tickCount === 1) {
    xTickIndices.push(0);
  } else if (tickCount > 1) {
    for (let i = 0; i < tickCount; i += 1) {
      const idx = Math.round((i * (points.length - 1)) / (tickCount - 1));
      if (!xTickIndices.includes(idx)) xTickIndices.push(idx);
    }
  }

  const activePoint =
    activeIndex !== null && activeIndex >= 0 && activeIndex < coords.length
      ? coords[activeIndex]
      : null;

  return (
    <div ref={containerRef} className="relative w-full select-none">
      {showLegend && (
        <div
          className="mb-2 flex flex-wrap items-center gap-4 text-[0.75rem] text-[var(--dd-text-secondary)]"
          data-testid="chart-legend"
        >
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-3.5 bg-[var(--dd-accent-teal)]"
              aria-hidden="true"
            />
            <span>{yAxisLabel || data.yColumnName || 'Series'}</span>
          </span>
          <span className="font-mono dd-tabular text-[0.6875rem] text-[var(--dd-text-muted)]">
            {formatCount(points.length)} plotted{' '}
            {points.length === 1 ? 'point' : 'points'}
            {data.isDownsampled
              ? ` (downsampled from ${formatCount(data.originalPointCount)})`
              : data.isAggregated
                ? ' (mean per X)'
                : ''}
          </span>
        </div>
      )}

      {activePoint && (
        <div
          role="status"
          data-testid="chart-tooltip"
          className="pointer-events-none absolute top-2 right-2 z-10 max-w-[240px] rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-3 py-2 text-[0.75rem] shadow-lg"
        >
          <div className="font-mono dd-tabular font-medium text-[var(--dd-text-primary)]">
            {xAxisLabel || data.xColumnName}: {activePoint.pt.xLabel}
          </div>
          <div className="mt-1 flex items-center justify-between gap-4 font-mono dd-tabular text-[var(--dd-text-secondary)]">
            <span>{yAxisLabel || data.yColumnName}</span>
            <span className="text-[var(--dd-accent-teal)]">
              {formatStatNumber(activePoint.pt.yValue, 4)}
            </span>
          </div>
          {activePoint.pt.sampleCount > 1 && (
            <div className="flex items-center justify-between gap-4 font-mono dd-tabular text-[var(--dd-text-muted)]">
              <span>Aggregated rows</span>
              <span>{formatCount(activePoint.pt.sampleCount)}</span>
            </div>
          )}
        </div>
      )}

      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Line chart: ${chartTitle}`}
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

        {/* Baseline */}
        <line
          x1={marginLeft}
          y1={marginTop + plotHeight}
          x2={marginLeft + plotWidth}
          y2={marginTop + plotHeight}
          stroke="var(--dd-border-default)"
          strokeWidth="1"
        />

        {/* Active vertical hairline */}
        {activePoint && (
          <line
            x1={activePoint.x}
            y1={marginTop}
            x2={activePoint.x}
            y2={marginTop + plotHeight}
            stroke="var(--dd-border-default)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {/* Line path */}
        {coords.length > 1 && (
          <polyline
            fill="none"
            stroke="var(--dd-accent-teal)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={polylinePoints}
          />
        )}

        {/* Interactive vertices */}
        {coords.map((c, idx) => {
          const isActive = activeIndex === idx;
          const showDot = coords.length <= 45 || isActive;
          return (
            <g key={`pt-${idx}`}>
              <circle
                cx={c.x}
                cy={c.y}
                r={isActive ? 4.5 : showDot ? 2.8 : 0.1}
                fill={
                  isActive ? 'var(--dd-text-primary)' : 'var(--dd-accent-teal)'
                }
                stroke="var(--dd-surface-primary)"
                strokeWidth={showDot ? '1.25' : '0'}
              />
              <circle
                cx={c.x}
                cy={c.y}
                r="9"
                fill="transparent"
                tabIndex={coords.length <= 60 ? 0 : -1}
                aria-label={`${c.pt.xLabel}: ${formatStatNumber(c.pt.yValue, 2)}`}
                className="cursor-pointer outline-none"
                onMouseEnter={() => setActiveIndex(idx)}
                onFocus={() => setActiveIndex(idx)}
                onBlur={() => setActiveIndex(null)}
              />
            </g>
          );
        })}

        {/* X-axis tick labels */}
        {xTickIndices.map((idx) => {
          const c = coords[idx];
          if (!c) return null;
          return (
            <text
              key={`xtick-${idx}`}
              x={c.x}
              y={marginTop + plotHeight + 17}
              textAnchor="middle"
              fill="var(--dd-text-muted)"
              fontSize="10"
              className="font-mono dd-tabular"
            >
              {truncateAxisLabel(c.pt.xLabel, 12)}
            </text>
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
