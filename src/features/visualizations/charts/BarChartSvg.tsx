import { useState } from 'react';
import type { PreparedBarChartData } from '@/types';
import { formatCount, formatPercentage } from '@/utils/format';
import {
  computeLinearTicks,
  formatCompactTick,
  truncateAxisLabel,
  useChartWidth,
} from './chartScaleUtils';

interface BarChartSvgProps {
  readonly data: PreparedBarChartData;
  readonly xAxisLabel: string;
  readonly yAxisLabel: string;
  readonly showLegend: boolean;
  readonly chartTitle: string;
}

export function BarChartSvg({
  data,
  xAxisLabel,
  yAxisLabel,
  showLegend,
  chartTitle,
}: BarChartSvgProps) {
  const { containerRef, width } = useChartWidth(560, 280);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const bars = data.bars;
  const maxCount = bars.reduce((max, b) => (b.count > max ? b.count : max), 0);
  const yScale = computeLinearTicks(0, Math.max(1, maxCount), 5, true);

  const rotateLabels = bars.length > 7 || bars.some((b) => b.label.length > 10);
  const marginTop = 18;
  const marginRight = 18;
  const marginBottom = rotateLabels ? 74 : 52;
  const marginLeft = 58;
  const height = rotateLabels ? 306 : 284;

  const plotWidth = Math.max(120, width - marginLeft - marginRight);
  const plotHeight = Math.max(100, height - marginTop - marginBottom);

  const slotWidth = plotWidth / Math.max(1, bars.length);
  const barWidth = Math.max(6, Math.min(48, slotWidth * 0.68));
  const ySpan = Math.max(1e-9, yScale.domainMax - yScale.domainMin);

  const activeBar =
    activeIndex !== null && activeIndex >= 0 && activeIndex < bars.length
      ? bars[activeIndex]
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
              className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[var(--dd-accent-teal)]"
              aria-hidden="true"
            />
            <span>{yAxisLabel || 'Count'}</span>
          </span>
          <span className="font-mono dd-tabular text-[0.6875rem] text-[var(--dd-text-muted)]">
            Showing {formatCount(bars.length)} of {formatCount(data.distinctCount)} categories
          </span>
        </div>
      )}

      {activeBar && (
        <div
          role="status"
          data-testid="chart-tooltip"
          className="pointer-events-none absolute top-2 right-2 z-10 max-w-[240px] rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-3 py-2 text-[0.75rem] shadow-lg"
        >
          <div className="truncate font-medium text-[var(--dd-text-primary)]">
            {activeBar.label}
          </div>
          <div className="mt-1 flex items-center justify-between gap-4 font-mono dd-tabular text-[var(--dd-text-secondary)]">
            <span>{yAxisLabel || 'Count'}</span>
            <span className="text-[var(--dd-text-primary)]">
              {formatCount(activeBar.count)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 font-mono dd-tabular text-[var(--dd-text-secondary)]">
            <span>Share of valid</span>
            <span className="text-[var(--dd-accent-teal)]">
              {formatPercentage(activeBar.percentage, 1)}
            </span>
          </div>
        </div>
      )}

      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Bar chart: ${chartTitle}`}
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

        {/* Baseline axis */}
        <line
          x1={marginLeft}
          y1={marginTop + plotHeight}
          x2={marginLeft + plotWidth}
          y2={marginTop + plotHeight}
          stroke="var(--dd-border-default)"
          strokeWidth="1"
        />

        {/* Bars & X category labels */}
        {bars.map((bar, idx) => {
          const cx = marginLeft + idx * slotWidth + slotWidth / 2;
          const x = cx - barWidth / 2;
          const barHeight = Math.max(
            2,
            ((bar.count - yScale.domainMin) / ySpan) * plotHeight,
          );
          const y = marginTop + plotHeight - barHeight;
          const isActive = activeIndex === idx;

          return (
            <g key={`bar-${idx}-${bar.label}`}>
              {/* Full-slot invisible hit zone for easier hover */}
              <rect
                x={marginLeft + idx * slotWidth}
                y={marginTop}
                width={slotWidth}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setActiveIndex(idx)}
              />
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx="2"
                fill={
                  isActive
                    ? 'var(--dd-accent-teal)'
                    : 'rgba(68, 148, 144, 0.78)'
                }
                stroke={
                  isActive
                    ? 'var(--dd-text-primary)'
                    : 'rgba(68, 148, 144, 0.95)'
                }
                strokeWidth={isActive ? '1.25' : '0.75'}
                tabIndex={0}
                aria-label={`${bar.label}: ${formatCount(bar.count)} (${formatPercentage(bar.percentage, 1)})`}
                className="cursor-pointer outline-none"
                onMouseEnter={() => setActiveIndex(idx)}
                onFocus={() => setActiveIndex(idx)}
                onBlur={() => setActiveIndex(null)}
              />
              {rotateLabels ? (
                <text
                  x={cx}
                  y={marginTop + plotHeight + 12}
                  textAnchor="end"
                  transform={`rotate(-34 ${cx} ${marginTop + plotHeight + 12})`}
                  fill={
                    isActive
                      ? 'var(--dd-text-primary)'
                      : 'var(--dd-text-secondary)'
                  }
                  fontSize="10.5"
                >
                  {truncateAxisLabel(bar.label, 14)}
                </text>
              ) : (
                <text
                  x={cx}
                  y={marginTop + plotHeight + 16}
                  textAnchor="middle"
                  fill={
                    isActive
                      ? 'var(--dd-text-primary)'
                      : 'var(--dd-text-secondary)'
                  }
                  fontSize="10.5"
                >
                  {truncateAxisLabel(bar.label, 14)}
                </text>
              )}
            </g>
          );
        })}

        {/* Axis labels */}
        {xAxisLabel && (
          <text
            x={marginLeft + plotWidth / 2}
            y={height - 6}
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
