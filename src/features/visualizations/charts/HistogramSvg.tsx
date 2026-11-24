import { useState } from 'react';
import type { PreparedHistogramData } from '@/types';
import {
  formatCount,
  formatPercentage,
  formatStatNumber,
} from '@/utils/format';
import {
  computeLinearTicks,
  formatCompactTick,
  useChartWidth,
} from './chartScaleUtils';

interface HistogramSvgProps {
  readonly data: PreparedHistogramData;
  readonly xAxisLabel: string;
  readonly yAxisLabel: string;
  readonly showLegend: boolean;
  readonly chartTitle: string;
}

export function HistogramSvg({
  data,
  xAxisLabel,
  yAxisLabel,
  showLegend,
  chartTitle,
}: HistogramSvgProps) {
  const { containerRef, width } = useChartWidth(560, 280);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const bins = data.bins;
  const maxCount = bins.reduce((max, b) => (b.count > max ? b.count : max), 0);
  const yScale = computeLinearTicks(0, Math.max(1, maxCount), 5, true);

  const marginTop = 20;
  const marginRight = 18;
  const marginBottom = 54;
  const marginLeft = 58;
  const height = 286;

  const plotWidth = Math.max(120, width - marginLeft - marginRight);
  const plotHeight = Math.max(100, height - marginTop - marginBottom);

  const ySpan = Math.max(1e-9, yScale.domainMax - yScale.domainMin);
  const binSlotWidth = plotWidth / Math.max(1, bins.length);

  const minVal = data.min ?? 0;
  const maxVal = data.max ?? minVal;
  const xSpan = maxVal - minVal;

  const valueToX = (val: number): number | null => {
    if (data.isConstant || xSpan <= 0 || !Number.isFinite(val)) return null;
    const ratio = (val - minVal) / xSpan;
    if (ratio < 0 || ratio > 1) return null;
    return marginLeft + ratio * plotWidth;
  };

  const meanX = data.mean !== null ? valueToX(data.mean) : null;
  const medianX = data.median !== null ? valueToX(data.median) : null;

  // Choose evenly spaced bin boundary labels to avoid horizontal crowding
  const xTickIndices = new Set<number>();
  if (bins.length <= 6) {
    for (let i = 0; i < bins.length; i += 1) xTickIndices.add(i);
  } else {
    const step = Math.ceil(bins.length / 5);
    for (let i = 0; i < bins.length; i += step) xTickIndices.add(i);
    xTickIndices.add(bins.length - 1);
  }

  const activeBin =
    activeIndex !== null && activeIndex >= 0 && activeIndex < bins.length
      ? bins[activeIndex]
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
            <span>Bin Frequency ({bins.length} bins)</span>
          </span>
          {meanX !== null && data.mean !== null && (
            <span className="inline-flex items-center gap-1.5 font-mono dd-tabular text-[0.6875rem]">
              <span
                className="inline-block h-0.5 w-3 bg-[var(--dd-status-warning)]"
                aria-hidden="true"
              />
              <span>Mean {formatStatNumber(data.mean, 2)}</span>
            </span>
          )}
          {medianX !== null && data.median !== null && (
            <span className="inline-flex items-center gap-1.5 font-mono dd-tabular text-[0.6875rem]">
              <span
                className="inline-block h-0.5 w-3 bg-[var(--dd-status-verified)]"
                aria-hidden="true"
              />
              <span>Median {formatStatNumber(data.median, 2)}</span>
            </span>
          )}
        </div>
      )}

      {activeBin && (
        <div
          role="status"
          data-testid="chart-tooltip"
          className="pointer-events-none absolute top-2 right-2 z-10 max-w-[250px] rounded-[var(--dd-radius-sm)] border border-[var(--dd-border-default)] bg-[var(--dd-surface-elevated)] px-3 py-2 text-[0.75rem] shadow-lg"
        >
          <div className="font-mono dd-tabular font-medium text-[var(--dd-text-primary)]">
            {data.isConstant
              ? `Value = ${formatStatNumber(activeBin.start, 4)}`
              : `[${formatStatNumber(activeBin.start, 2)}, ${formatStatNumber(activeBin.end, 2)}${activeBin.isLastInclusive ? ']' : ')'}`}
          </div>
          <div className="mt-1 flex items-center justify-between gap-4 font-mono dd-tabular text-[var(--dd-text-secondary)]">
            <span>{yAxisLabel || 'Frequency'}</span>
            <span className="text-[var(--dd-text-primary)]">
              {formatCount(activeBin.count)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 font-mono dd-tabular text-[var(--dd-text-secondary)]">
            <span>Share of valid</span>
            <span className="text-[var(--dd-accent-teal)]">
              {formatPercentage(activeBin.percentage, 1)}
            </span>
          </div>
        </div>
      )}

      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Histogram: ${chartTitle}`}
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

        {/* Histogram bars */}
        {bins.map((bin, idx) => {
          const x = data.isConstant
            ? marginLeft + plotWidth * 0.35
            : marginLeft + idx * binSlotWidth + 1;
          const barW = data.isConstant
            ? plotWidth * 0.3
            : Math.max(2, binSlotWidth - 2);
          const barH =
            bin.count > 0
              ? Math.max(2, ((bin.count - yScale.domainMin) / ySpan) * plotHeight)
              : 0;
          const y = marginTop + plotHeight - barH;
          const isActive = activeIndex === idx;

          return (
            <g key={`bin-${idx}`}>
              <rect
                x={marginLeft + idx * binSlotWidth}
                y={marginTop}
                width={binSlotWidth}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setActiveIndex(idx)}
              />
              {barH > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx="1"
                  fill={
                    isActive
                      ? 'var(--dd-accent-teal)'
                      : 'rgba(68, 148, 144, 0.72)'
                  }
                  stroke={
                    isActive
                      ? 'var(--dd-text-primary)'
                      : 'rgba(68, 148, 144, 0.95)'
                  }
                  strokeWidth={isActive ? '1.25' : '0.75'}
                  tabIndex={0}
                  aria-label={`Bin ${bin.label}: ${formatCount(bin.count)}`}
                  className="cursor-pointer outline-none"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onFocus={() => setActiveIndex(idx)}
                  onBlur={() => setActiveIndex(null)}
                />
              )}
              {xTickIndices.has(idx) && (
                <text
                  x={
                    data.isConstant
                      ? marginLeft + plotWidth / 2
                      : marginLeft + idx * binSlotWidth + binSlotWidth / 2
                  }
                  y={marginTop + plotHeight + 16}
                  textAnchor="middle"
                  fill="var(--dd-text-muted)"
                  fontSize="10"
                  className="font-mono dd-tabular"
                >
                  {data.isConstant
                    ? formatCompactTick(bin.start)
                    : formatCompactTick(bin.start)}
                </text>
              )}
            </g>
          );
        })}

        {/* Exact M04 Mean reference line */}
        {meanX !== null && (
          <line
            x1={meanX}
            y1={marginTop}
            x2={meanX}
            y2={marginTop + plotHeight}
            stroke="var(--dd-status-warning)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            className="pointer-events-none"
          />
        )}

        {/* Exact M04 Median reference line */}
        {medianX !== null && (
          <line
            x1={medianX}
            y1={marginTop}
            x2={medianX}
            y2={marginTop + plotHeight}
            stroke="var(--dd-status-verified)"
            strokeWidth="1.5"
            strokeDasharray="2 2"
            className="pointer-events-none"
          />
        )}

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
