/**
 * Data Detective — Module 10 Vector Chart Renderer for jsPDF
 *
 * Draws crisp, infinite-resolution vector charts directly onto an A4 PDF
 * strictly from Module 06 `PreparedChartData`.
 *
 * Invariants:
 * - Zero duplicate statistical or binning calculations (consumes M06 prepared data).
 * - Works identically in browser and Node/Vitest (no fragile DOM/canvas screenshots).
 * - Print-optimized high-contrast institutional palette on white A4 paper.
 */

import type { jsPDF } from 'jspdf';
import type {
  ChartConfig,
  PreparedBarChartData,
  PreparedBoxPlotData,
  PreparedChartData,
  PreparedHistogramData,
  PreparedLineChartData,
  PreparedScatterChartData,
} from '@/types';

export interface PdfChartBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const PRINT_COLORS = {
  ink: [20, 27, 36] as const,
  muted: [92, 103, 117] as const,
  axis: [120, 132, 148] as const,
  grid: [226, 232, 240] as const,
  frame: [203, 213, 225] as const,
  teal: [15, 118, 110] as const,
  tealSoft: [204, 236, 233] as const,
  amber: [180, 83, 9] as const,
  slate: [51, 65, 85] as const,
  paperTint: [248, 250, 252] as const,
};

function fmtNum(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return 'n/a';
  if (Math.abs(n) >= 10_000) return Math.round(n).toLocaleString();
  if (Math.abs(n) >= 100) return n.toFixed(1);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function truncateLabel(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(1, maxChars - 1))}…`;
}

function drawPlotFrame(
  doc: jsPDF,
  box: PdfChartBox,
  xAxisLabel: string,
  yAxisLabel: string,
): { px: number; py: number; pw: number; ph: number } {
  // Subtle paper backdrop + hairline frame
  doc.setFillColor(...PRINT_COLORS.paperTint);
  doc.setDrawColor(...PRINT_COLORS.frame);
  doc.setLineWidth(0.6);
  doc.rect(box.x, box.y, box.width, box.height, 'FD');

  const padLeft = 46;
  const padRight = 16;
  const padTop = 14;
  const padBottom = 32;

  const px = box.x + padLeft;
  const py = box.y + padTop;
  const pw = Math.max(40, box.width - padLeft - padRight);
  const ph = Math.max(40, box.height - padTop - padBottom);

  // Horizontal grid lines (4 intervals)
  doc.setDrawColor(...PRINT_COLORS.grid);
  doc.setLineWidth(0.4);
  for (let i = 0; i <= 4; i += 1) {
    const gy = py + (ph * i) / 4;
    doc.line(px, gy, px + pw, gy);
  }

  // Axes
  doc.setDrawColor(...PRINT_COLORS.axis);
  doc.setLineWidth(0.7);
  doc.line(px, py, px, py + ph);
  doc.line(px, py + ph, px + pw, py + ph);

  // Axis titles
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PRINT_COLORS.muted);
  if (xAxisLabel) {
    doc.text(truncateLabel(xAxisLabel, 48), px + pw / 2, box.y + box.height - 6, {
      align: 'center',
    });
  }
  if (yAxisLabel) {
    doc.text(truncateLabel(yAxisLabel, 24), box.x + 10, py + ph / 2, {
      angle: 90,
      align: 'center',
    });
  }

  return { px, py, pw, ph };
}

function drawYAxisTicks(
  doc: jsPDF,
  px: number,
  py: number,
  ph: number,
  yMin: number,
  yMax: number,
): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...PRINT_COLORS.muted);
  for (let i = 0; i <= 4; i += 1) {
    const frac = i / 4;
    const val = yMax - frac * (yMax - yMin);
    const ty = py + frac * ph + 2.2;
    doc.text(fmtNum(val), px - 4, ty, { align: 'right' });
  }
}

function drawBarChart(
  doc: jsPDF,
  config: ChartConfig,
  data: PreparedBarChartData,
  box: PdfChartBox,
): void {
  const { px, py, pw, ph } = drawPlotFrame(
    doc,
    box,
    config.xAxisLabel || data.xColumnName,
    config.yAxisLabel || 'Count',
  );
  const bars = (data.bars ?? []).slice(0, 12);
  if (bars.length === 0) return;

  const maxCount = Math.max(1, ...bars.map((b) => b.count));
  drawYAxisTicks(doc, px, py, ph, 0, maxCount);

  const slotW = pw / bars.length;
  const barW = Math.max(6, Math.min(34, slotW * 0.66));

  bars.forEach((bar, i) => {
    const barH = (bar.count / maxCount) * ph;
    const bx = px + i * slotW + (slotW - barW) / 2;
    const by = py + ph - barH;

    doc.setFillColor(...PRINT_COLORS.teal);
    doc.rect(bx, by, barW, Math.max(0.8, barH), 'F');

    // Category label under X axis
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...PRINT_COLORS.ink);
    const labelLimit = bars.length > 8 ? 8 : 13;
    doc.text(
      truncateLabel(bar.label, labelLimit),
      bx + barW / 2,
      py + ph + 10,
      { align: 'center' },
    );
  });
}

function drawHistogram(
  doc: jsPDF,
  config: ChartConfig,
  data: PreparedHistogramData,
  box: PdfChartBox,
): void {
  const { px, py, pw, ph } = drawPlotFrame(
    doc,
    box,
    config.xAxisLabel || data.xColumnName,
    config.yAxisLabel || 'Frequency',
  );
  const bins = data.bins ?? [];
  if (bins.length === 0) return;

  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  drawYAxisTicks(doc, px, py, ph, 0, maxCount);

  const binW = pw / bins.length;
  bins.forEach((bin, i) => {
    const h = (bin.count / maxCount) * ph;
    const bx = px + i * binW + 0.6;
    const by = py + ph - h;
    doc.setFillColor(...PRINT_COLORS.teal);
    doc.rect(bx, by, Math.max(1.5, binW - 1.2), Math.max(0.5, h), 'F');
  });

  // Min / Mid / Max x-axis ticks
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...PRINT_COLORS.muted);
  if (data.min !== null && data.max !== null) {
    doc.text(fmtNum(data.min), px, py + ph + 10, { align: 'left' });
    doc.text(fmtNum((data.min + data.max) / 2), px + pw / 2, py + ph + 10, {
      align: 'center',
    });
    doc.text(fmtNum(data.max), px + pw, py + ph + 10, { align: 'right' });

    // Optional Mean reference line
    if (
      data.mean !== null &&
      data.max > data.min &&
      data.mean >= data.min &&
      data.mean <= data.max
    ) {
      const meanX = px + ((data.mean - data.min) / (data.max - data.min)) * pw;
      doc.setDrawColor(...PRINT_COLORS.amber);
      doc.setLineWidth(1);
      doc.line(meanX, py, meanX, py + ph);
      doc.setFontSize(6.5);
      doc.setTextColor(...PRINT_COLORS.amber);
      doc.text(`Mean ${fmtNum(data.mean)}`, Math.min(px + pw - 2, meanX + 3), py + 8);
    }
  }
}

function drawLineChart(
  doc: jsPDF,
  config: ChartConfig,
  data: PreparedLineChartData,
  box: PdfChartBox,
): void {
  const { px, py, pw, ph } = drawPlotFrame(
    doc,
    box,
    config.xAxisLabel || data.xColumnName,
    config.yAxisLabel || data.yColumnName || 'Value',
  );
  const pts = data.points ?? [];
  if (pts.length === 0) return;

  const yMinRaw = data.yMin ?? Math.min(...pts.map((p) => p.yValue));
  const yMaxRaw = data.yMax ?? Math.max(...pts.map((p) => p.yValue));
  const ySpan = yMaxRaw > yMinRaw ? yMaxRaw - yMinRaw : Math.max(1, Math.abs(yMaxRaw) * 0.2 || 1);
  const yMin = yMinRaw - ySpan * 0.05;
  const yMax = yMaxRaw + ySpan * 0.05;

  drawYAxisTicks(doc, px, py, ph, yMin, yMax);

  const xMin = pts[0]!.xValue;
  const xMax = pts[pts.length - 1]!.xValue;
  const xSpan = xMax > xMin ? xMax - xMin : 1;

  const coords = pts.map((p, idx) => {
    const cx =
      pts.length === 1
        ? px + pw / 2
        : xMax > xMin
          ? px + ((p.xValue - xMin) / xSpan) * pw
          : px + (idx / (pts.length - 1)) * pw;
    const cy = py + ph - ((p.yValue - yMin) / (yMax - yMin)) * ph;
    return { cx, cy };
  });

  doc.setDrawColor(...PRINT_COLORS.teal);
  doc.setLineWidth(1.2);
  for (let i = 1; i < coords.length; i += 1) {
    doc.line(coords[i - 1]!.cx, coords[i - 1]!.cy, coords[i]!.cx, coords[i]!.cy);
  }

  if (coords.length <= 40) {
    doc.setFillColor(...PRINT_COLORS.teal);
    for (const pt of coords) {
      doc.circle(pt.cx, pt.cy, 1.8, 'F');
    }
  }

  // First, middle, last X labels
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...PRINT_COLORS.muted);
  doc.text(truncateLabel(pts[0]!.xLabel, 14), px, py + ph + 10, { align: 'left' });
  if (pts.length > 2) {
    const mid = pts[Math.floor(pts.length / 2)]!;
    doc.text(truncateLabel(mid.xLabel, 14), px + pw / 2, py + ph + 10, {
      align: 'center',
    });
  }
  doc.text(
    truncateLabel(pts[pts.length - 1]!.xLabel, 14),
    px + pw,
    py + ph + 10,
    { align: 'right' },
  );
}

function drawScatterPlot(
  doc: jsPDF,
  config: ChartConfig,
  data: PreparedScatterChartData,
  box: PdfChartBox,
): void {
  const { px, py, pw, ph } = drawPlotFrame(
    doc,
    box,
    config.xAxisLabel || data.xColumnName,
    config.yAxisLabel || data.yColumnName || 'Y',
  );
  const pts = data.points ?? [];
  if (pts.length === 0) return;

  const xMinRaw = data.xMin ?? Math.min(...pts.map((p) => p.x));
  const xMaxRaw = data.xMax ?? Math.max(...pts.map((p) => p.x));
  const yMinRaw = data.yMin ?? Math.min(...pts.map((p) => p.y));
  const yMaxRaw = data.yMax ?? Math.max(...pts.map((p) => p.y));

  const xSpan = xMaxRaw > xMinRaw ? xMaxRaw - xMinRaw : 1;
  const ySpan = yMaxRaw > yMinRaw ? yMaxRaw - yMinRaw : 1;

  const xMin = xMinRaw - xSpan * 0.04;
  const xMax = xMaxRaw + xSpan * 0.04;
  const yMin = yMinRaw - ySpan * 0.04;
  const yMax = yMaxRaw + ySpan * 0.04;

  drawYAxisTicks(doc, px, py, ph, yMin, yMax);

  // Cap plotted vector dots for crisp PDF rendering speed while preserving full distribution
  const step = pts.length > 400 ? Math.ceil(pts.length / 400) : 1;
  doc.setFillColor(...PRINT_COLORS.teal);
  for (let i = 0; i < pts.length; i += step) {
    const p = pts[i]!;
    const cx = px + ((p.x - xMin) / (xMax - xMin)) * pw;
    const cy = py + ph - ((p.y - yMin) / (yMax - yMin)) * ph;
    doc.circle(cx, cy, 1.7, 'F');
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...PRINT_COLORS.muted);
  doc.text(fmtNum(xMinRaw), px, py + ph + 10, { align: 'left' });
  doc.text(fmtNum((xMinRaw + xMaxRaw) / 2), px + pw / 2, py + ph + 10, {
    align: 'center',
  });
  doc.text(fmtNum(xMaxRaw), px + pw, py + ph + 10, { align: 'right' });
}

function drawBoxPlot(
  doc: jsPDF,
  config: ChartConfig,
  data: PreparedBoxPlotData,
  box: PdfChartBox,
): void {
  const { px, py, pw, ph } = drawPlotFrame(
    doc,
    box,
    config.xAxisLabel || data.xColumnName,
    '',
  );
  if (
    data.min === null ||
    data.q1 === null ||
    data.median === null ||
    data.q3 === null ||
    data.max === null
  ) {
    return;
  }

  const span = data.max > data.min ? data.max - data.min : 1;
  const mapX = (v: number) =>
    data.max! > data.min!
      ? px + 16 + ((v - data.min!) / span) * (pw - 32)
      : px + pw / 2;

  const midY = py + ph * 0.48;
  const boxH = Math.min(34, ph * 0.36);

  const minX = mapX(data.min);
  const q1X = mapX(data.q1);
  const medX = mapX(data.median);
  const q3X = mapX(data.q3);
  const maxX = mapX(data.max);

  // Whiskers
  doc.setDrawColor(...PRINT_COLORS.slate);
  doc.setLineWidth(1.1);
  doc.line(minX, midY, q1X, midY);
  doc.line(q3X, midY, maxX, midY);
  doc.line(minX, midY - 10, minX, midY + 10);
  doc.line(maxX, midY - 10, maxX, midY + 10);

  // IQR Box
  doc.setFillColor(...PRINT_COLORS.tealSoft);
  doc.setDrawColor(...PRINT_COLORS.teal);
  doc.setLineWidth(1.2);
  doc.rect(q1X, midY - boxH / 2, Math.max(2, q3X - q1X), boxH, 'FD');

  // Median line
  doc.setDrawColor(...PRINT_COLORS.amber);
  doc.setLineWidth(1.6);
  doc.line(medX, midY - boxH / 2, medX, midY + boxH / 2);

  // Mean marker (if available)
  if (data.mean !== null) {
    const meanX = mapX(data.mean);
    doc.setFillColor(...PRINT_COLORS.ink);
    doc.circle(meanX, midY, 2.5, 'F');
  }

  // Summary annotations
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...PRINT_COLORS.muted);
  doc.text(
    `Min: ${fmtNum(data.min)}  ·  Q1: ${fmtNum(data.q1)}  ·  Median: ${fmtNum(data.median)}  ·  Q3: ${fmtNum(data.q3)}  ·  Max: ${fmtNum(data.max)}  ·  IQR: ${fmtNum(data.iqr)}`,
    px + pw / 2,
    py + ph + 10,
    { align: 'center' },
  );
}

/**
 * Draws a Module 06 PreparedChartData visualization directly into a jsPDF page.
 */
export function drawPreparedChartToPdf(
  doc: jsPDF,
  config: ChartConfig,
  prepared: PreparedChartData,
  box: PdfChartBox,
): void {
  if (prepared.status !== 'ready') {
    doc.setDrawColor(...PRINT_COLORS.frame);
    doc.rect(box.x, box.y, box.width, box.height);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...PRINT_COLORS.muted);
    doc.text(
      prepared.emptyReason ?? 'Chart unavailable for the selected column.',
      box.x + box.width / 2,
      box.y + box.height / 2,
      { align: 'center' },
    );
    return;
  }

  switch (prepared.type) {
    case 'bar':
      drawBarChart(doc, config, prepared, box);
      break;
    case 'histogram':
      drawHistogram(doc, config, prepared, box);
      break;
    case 'line':
      drawLineChart(doc, config, prepared, box);
      break;
    case 'scatter':
      drawScatterPlot(doc, config, prepared, box);
      break;
    case 'boxplot':
      drawBoxPlot(doc, config, prepared, box);
      break;
  }
}
