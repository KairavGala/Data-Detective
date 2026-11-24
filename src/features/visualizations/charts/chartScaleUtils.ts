import { useEffect, useRef, useState } from 'react';
import { formatStatNumber } from '@/utils/format';

/**
 * Observes a chart container's inline width so SVG charts scale crisply
 * across narrow mobile viewports and wide desktop grids while providing a
 * deterministic fallback width in headless / jsdom test environments.
 */
export function useChartWidth(defaultWidth = 560, minWidth = 280): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  width: number;
} {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(defaultWidth);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const measured = Math.floor(el.getBoundingClientRect().width);
      if (measured >= minWidth) {
        setWidth(measured);
      }
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextWidth = Math.floor(entry.contentRect.width);
      if (nextWidth >= minWidth) {
        setWidth((prev) => (Math.abs(prev - nextWidth) >= 4 ? nextWidth : prev));
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [minWidth]);

  return { containerRef, width };
}

export interface LinearScaleTicks {
  readonly domainMin: number;
  readonly domainMax: number;
  readonly ticks: readonly number[];
}

/**
 * Computes human-readable 1-2-5 stepped linear axis ticks safely for any
 * finite numeric domain, including constant values (min === max) and zero.
 */
export function computeLinearTicks(
  min: number,
  max: number,
  targetTicks = 5,
  forceZeroFloor = false,
): LinearScaleTicks {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : 1;

  let lo = forceZeroFloor ? Math.min(0, safeMin) : safeMin;
  let hi = forceZeroFloor ? Math.max(0, safeMax) : safeMax;

  if (lo === hi) {
    if (lo === 0) {
      return { domainMin: 0, domainMax: 1, ticks: [0, 0.5, 1] };
    }
    const pad = Math.abs(lo) * 0.1 || 1;
    lo = forceZeroFloor && lo > 0 ? 0 : lo - pad;
    hi = hi + pad;
  }

  const rawRange = hi - lo;
  const approxStep = rawRange / Math.max(2, targetTicks - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(approxStep)));
  const residual = approxStep / magnitude;

  let niceFraction: number;
  if (residual <= 1) niceFraction = 1;
  else if (residual <= 2) niceFraction = 2;
  else if (residual <= 5) niceFraction = 5;
  else niceFraction = 10;

  const step = niceFraction * magnitude;
  const domainMin = Math.floor(lo / step) * step;
  const domainMax = Math.ceil(hi / step) * step;

  const ticks: number[] = [];
  const maxSteps = 20;
  for (let i = 0; i <= maxSteps; i += 1) {
    const val = domainMin + i * step;
    if (val > domainMax + step * 1e-6) break;
    const normalized = Math.abs(val) < step * 1e-9 ? 0 : Number(val.toPrecision(10));
    ticks.push(normalized);
  }

  if (ticks.length < 2) {
    return { domainMin: lo, domainMax: hi, ticks: [lo, hi] };
  }

  return { domainMin, domainMax, ticks };
}

/**
 * Formats compact axis tick labels (e.g., 1.2K, 3.4M) without losing precision
 * on small decimals.
 */
export function formatCompactTick(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const normalized = Object.is(value, -0) ? 0 : value;
  const abs = Math.abs(normalized);

  if (abs >= 1e9) return `${(normalized / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (abs >= 1e6) return `${(normalized / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1e4) return `${(normalized / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return formatStatNumber(normalized, 2);
}

/**
 * Truncates long category or date axis tick labels cleanly with an ellipsis.
 */
export function truncateAxisLabel(label: string, maxChars = 14): string {
  if (label.length <= maxChars) return label;
  return `${label.slice(0, Math.max(1, maxChars - 1))}…`;
}
