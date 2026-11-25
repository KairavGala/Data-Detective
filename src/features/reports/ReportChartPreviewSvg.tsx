import type {
  ChartConfig,
  PreparedBarChartData,
  PreparedBoxPlotData,
  PreparedChartData,
  PreparedHistogramData,
  PreparedLineChartData,
  PreparedScatterChartData,
} from '@/types';

interface ReportChartPreviewSvgProps {
  readonly config: ChartConfig;
  readonly prepared: PreparedChartData;
}

const VIEW_W = 640;
const VIEW_H = 220;
const PAD_L = 56;
const PAD_R = 20;
const PAD_T = 18;
const PAD_B = 42;
const PLOT_W = VIEW_W - PAD_L - PAD_R;
const PLOT_H = VIEW_H - PAD_T - PAD_B;

function fmtAxisNum(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return 'n/a';
  if (Math.abs(n) >= 10_000) return Math.round(n).toLocaleString();
  if (Math.abs(n) >= 100) return n.toFixed(1);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function truncateText(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(1, maxChars - 1))}…`;
}

function PlotFrame({
  xLabel,
  yLabel,
  yTicks,
}: {
  readonly xLabel: string;
  readonly yLabel?: string;
  readonly yTicks?: readonly { readonly y: number; readonly label: string }[];
}) {
  return (
    <>
      <rect
        x={0}
        y={0}
        width={VIEW_W}
        height={VIEW_H}
        fill="#f8fafc"
        stroke="#cbd5e1"
        strokeWidth={1}
        rx={2}
      />
      {[0, 1, 2, 3, 4].map((i) => {
        const gy = PAD_T + (PLOT_H * i) / 4;
        return (
          <line
            key={i}
            x1={PAD_L}
            y1={gy}
            x2={PAD_L + PLOT_W}
            y2={gy}
            stroke="#e2e8f0"
            strokeWidth={0.8}
          />
        );
      })}
      <line
        x1={PAD_L}
        y1={PAD_T}
        x2={PAD_L}
        y2={PAD_T + PLOT_H}
        stroke="#94a3b8"
        strokeWidth={1.1}
      />
      <line
        x1={PAD_L}
        y1={PAD_T + PLOT_H}
        x2={PAD_L + PLOT_W}
        y2={PAD_T + PLOT_H}
        stroke="#94a3b8"
        strokeWidth={1.1}
      />
      {yTicks?.map((t, idx) => (
        <text
          key={idx}
          x={PAD_L - 7}
          y={t.y + 3}
          textAnchor="end"
          fontSize={9.5}
          fill="#64748b"
          fontFamily="ui-monospace, SFMono-Regular, monospace"
        >
          {t.label}
        </text>
      ))}
      {xLabel && (
        <text
          x={PAD_L + PLOT_W / 2}
          y={VIEW_H - 8}
          textAnchor="middle"
          fontSize={10}
          fill="#475569"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {truncateText(xLabel, 58)}
        </text>
      )}
      {yLabel && (
        <text
          x={14}
          y={PAD_T + PLOT_H / 2}
          textAnchor="middle"
          fontSize={10}
          fill="#475569"
          fontFamily="system-ui, -apple-system, sans-serif"
          transform={`rotate(-90 14 ${PAD_T + PLOT_H / 2})`}
        >
          {truncateText(yLabel, 26)}
        </text>
      )}
    </>
  );
}

function buildYTicks(yMin: number, yMax: number) {
  return [0, 1, 2, 3, 4].map((i) => {
    const frac = i / 4;
    const val = yMax - frac * (yMax - yMin);
    return { y: PAD_T + frac * PLOT_H, label: fmtAxisNum(val) };
  });
}

function BarSvg({
  config,
  data,
}: {
  readonly config: ChartConfig;
  readonly data: PreparedBarChartData;
}) {
  const bars = data.bars.slice(0, 12);
  const maxCount = Math.max(1, ...bars.map((b) => b.count));
  const slotW = bars.length > 0 ? PLOT_W / bars.length : PLOT_W;
  const barW = Math.max(10, Math.min(44, slotW * 0.65));

  return (
    <>
      <PlotFrame
        xLabel={config.xAxisLabel || data.xColumnName}
        yLabel={config.yAxisLabel || 'Count'}
        yTicks={buildYTicks(0, maxCount)}
      />
      {bars.map((bar, i) => {
        const h = (bar.count / maxCount) * PLOT_H;
        const bx = PAD_L + i * slotW + (slotW - barW) / 2;
        const by = PAD_T + PLOT_H - h;
        return (
          <g key={`${bar.label}-${i}`}>
            <rect
              x={bx}
              y={by}
              width={barW}
              height={Math.max(1, h)}
              fill="#0f766e"
              rx={1}
            />
            <text
              x={bx + barW / 2}
              y={PAD_T + PLOT_H + 14}
              textAnchor="middle"
              fontSize={9}
              fill="#1e293b"
            >
              {truncateText(bar.label, bars.length > 8 ? 9 : 14)}
            </text>
          </g>
        );
      })}
    </>
  );
}

function HistogramSvg({
  config,
  data,
}: {
  readonly config: ChartConfig;
  readonly data: PreparedHistogramData;
}) {
  const bins = data.bins;
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const binW = bins.length > 0 ? PLOT_W / bins.length : PLOT_W;
  const showMean =
    data.min !== null &&
    data.max !== null &&
    data.mean !== null &&
    data.max > data.min &&
    data.mean >= data.min &&
    data.mean <= data.max;
  const meanX = showMean
    ? PAD_L + ((data.mean! - data.min!) / (data.max! - data.min!)) * PLOT_W
    : 0;

  return (
    <>
      <PlotFrame
        xLabel={config.xAxisLabel || data.xColumnName}
        yLabel={config.yAxisLabel || 'Frequency'}
        yTicks={buildYTicks(0, maxCount)}
      />
      {bins.map((bin, i) => {
        const h = (bin.count / maxCount) * PLOT_H;
        const bx = PAD_L + i * binW + 0.8;
        const by = PAD_T + PLOT_H - h;
        return (
          <rect
            key={i}
            x={bx}
            y={by}
            width={Math.max(2, binW - 1.6)}
            height={Math.max(1, h)}
            fill="#0f766e"
          />
        );
      })}
      {showMean && (
        <g>
          <line
            x1={meanX}
            y1={PAD_T}
            x2={meanX}
            y2={PAD_T + PLOT_H}
            stroke="#b45309"
            strokeWidth={1.4}
            strokeDasharray="4 3"
          />
          <text
            x={Math.min(PAD_L + PLOT_W - 60, meanX + 4)}
            y={PAD_T + 12}
            fontSize={9}
            fontWeight={600}
            fill="#b45309"
          >
            Mean {fmtAxisNum(data.mean)}
          </text>
        </g>
      )}
      {data.min !== null && data.max !== null && (
        <>
          <text
            x={PAD_L}
            y={PAD_T + PLOT_H + 14}
            textAnchor="start"
            fontSize={9}
            fill="#64748b"
          >
            {fmtAxisNum(data.min)}
          </text>
          <text
            x={PAD_L + PLOT_W / 2}
            y={PAD_T + PLOT_H + 14}
            textAnchor="middle"
            fontSize={9}
            fill="#64748b"
          >
            {fmtAxisNum((data.min + data.max) / 2)}
          </text>
          <text
            x={PAD_L + PLOT_W}
            y={PAD_T + PLOT_H + 14}
            textAnchor="end"
            fontSize={9}
            fill="#64748b"
          >
            {fmtAxisNum(data.max)}
          </text>
        </>
      )}
    </>
  );
}

function LineSvg({
  config,
  data,
}: {
  readonly config: ChartConfig;
  readonly data: PreparedLineChartData;
}) {
  const pts = data.points;
  const yMinRaw =
    data.yMin ?? (pts.length ? Math.min(...pts.map((p) => p.yValue)) : 0);
  const yMaxRaw =
    data.yMax ?? (pts.length ? Math.max(...pts.map((p) => p.yValue)) : 1);
  const ySpan =
    yMaxRaw > yMinRaw
      ? yMaxRaw - yMinRaw
      : Math.max(1, Math.abs(yMaxRaw) * 0.2 || 1);
  const yMin = yMinRaw - ySpan * 0.05;
  const yMax = yMaxRaw + ySpan * 0.05;

  const xMin = pts[0]?.xValue ?? 0;
  const xMax = pts[pts.length - 1]?.xValue ?? 1;
  const xSpan = xMax > xMin ? xMax - xMin : 1;

  const coords = pts.map((p, idx) => {
    const cx =
      pts.length <= 1
        ? PAD_L + PLOT_W / 2
        : xMax > xMin
          ? PAD_L + ((p.xValue - xMin) / xSpan) * PLOT_W
          : PAD_L + (idx / (pts.length - 1)) * PLOT_W;
    const cy = PAD_T + PLOT_H - ((p.yValue - yMin) / (yMax - yMin)) * PLOT_H;
    return { cx, cy };
  });

  const polylinePoints = coords
    .map((c) => `${c.cx.toFixed(1)},${c.cy.toFixed(1)}`)
    .join(' ');

  return (
    <>
      <PlotFrame
        xLabel={config.xAxisLabel || data.xColumnName}
        yLabel={config.yAxisLabel || data.yColumnName || 'Value'}
        yTicks={buildYTicks(yMin, yMax)}
      />
      {coords.length > 1 && (
        <polyline
          fill="none"
          stroke="#0f766e"
          strokeWidth={1.8}
          points={polylinePoints}
        />
      )}
      {coords.length <= 40 &&
        coords.map((pt, i) => (
          <circle key={i} cx={pt.cx} cy={pt.cy} r={2.5} fill="#0f766e" />
        ))}
      {pts.length > 0 && (
        <>
          <text
            x={PAD_L}
            y={PAD_T + PLOT_H + 14}
            textAnchor="start"
            fontSize={9}
            fill="#64748b"
          >
            {truncateText(pts[0]!.xLabel, 14)}
          </text>
          {pts.length > 2 && (
            <text
              x={PAD_L + PLOT_W / 2}
              y={PAD_T + PLOT_H + 14}
              textAnchor="middle"
              fontSize={9}
              fill="#64748b"
            >
              {truncateText(pts[Math.floor(pts.length / 2)]!.xLabel, 14)}
            </text>
          )}
          <text
            x={PAD_L + PLOT_W}
            y={PAD_T + PLOT_H + 14}
            textAnchor="end"
            fontSize={9}
            fill="#64748b"
          >
            {truncateText(pts[pts.length - 1]!.xLabel, 14)}
          </text>
        </>
      )}
    </>
  );
}

function ScatterSvg({
  config,
  data,
}: {
  readonly config: ChartConfig;
  readonly data: PreparedScatterChartData;
}) {
  const pts = data.points;
  const xMinRaw =
    data.xMin ?? (pts.length ? Math.min(...pts.map((p) => p.x)) : 0);
  const xMaxRaw =
    data.xMax ?? (pts.length ? Math.max(...pts.map((p) => p.x)) : 1);
  const yMinRaw =
    data.yMin ?? (pts.length ? Math.min(...pts.map((p) => p.y)) : 0);
  const yMaxRaw =
    data.yMax ?? (pts.length ? Math.max(...pts.map((p) => p.y)) : 1);

  const xSpan = xMaxRaw > xMinRaw ? xMaxRaw - xMinRaw : 1;
  const ySpan = yMaxRaw > yMinRaw ? yMaxRaw - yMinRaw : 1;
  const xMin = xMinRaw - xSpan * 0.04;
  const xMax = xMaxRaw + xSpan * 0.04;
  const yMin = yMinRaw - ySpan * 0.04;
  const yMax = yMaxRaw + ySpan * 0.04;

  const step = pts.length > 400 ? Math.ceil(pts.length / 400) : 1;
  const sampled = [];
  for (let i = 0; i < pts.length; i += step) {
    sampled.push(pts[i]!);
  }

  return (
    <>
      <PlotFrame
        xLabel={config.xAxisLabel || data.xColumnName}
        yLabel={config.yAxisLabel || data.yColumnName || 'Y'}
        yTicks={buildYTicks(yMin, yMax)}
      />
      {sampled.map((p, i) => {
        const cx = PAD_L + ((p.x - xMin) / (xMax - xMin)) * PLOT_W;
        const cy = PAD_T + PLOT_H - ((p.y - yMin) / (yMax - yMin)) * PLOT_H;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={2.4}
            fill="#0f766e"
            fillOpacity={0.78}
          />
        );
      })}
      <text
        x={PAD_L}
        y={PAD_T + PLOT_H + 14}
        textAnchor="start"
        fontSize={9}
        fill="#64748b"
      >
        {fmtAxisNum(xMinRaw)}
      </text>
      <text
        x={PAD_L + PLOT_W / 2}
        y={PAD_T + PLOT_H + 14}
        textAnchor="middle"
        fontSize={9}
        fill="#64748b"
      >
        {fmtAxisNum((xMinRaw + xMaxRaw) / 2)}
      </text>
      <text
        x={PAD_L + PLOT_W}
        y={PAD_T + PLOT_H + 14}
        textAnchor="end"
        fontSize={9}
        fill="#64748b"
      >
        {fmtAxisNum(xMaxRaw)}
      </text>
    </>
  );
}

function BoxPlotSvg({
  config,
  data,
}: {
  readonly config: ChartConfig;
  readonly data: PreparedBoxPlotData;
}) {
  if (
    data.min === null ||
    data.q1 === null ||
    data.median === null ||
    data.q3 === null ||
    data.max === null
  ) {
    return <PlotFrame xLabel={config.xAxisLabel || data.xColumnName} />;
  }

  const span = data.max > data.min ? data.max - data.min : 1;
  const mapX = (v: number) =>
    data.max! > data.min!
      ? PAD_L + 20 + ((v - data.min!) / span) * (PLOT_W - 40)
      : PAD_L + PLOT_W / 2;

  const midY = PAD_T + PLOT_H * 0.48;
  const boxH = 42;
  const minX = mapX(data.min);
  const q1X = mapX(data.q1);
  const medX = mapX(data.median);
  const q3X = mapX(data.q3);
  const maxX = mapX(data.max);

  return (
    <>
      <PlotFrame xLabel={config.xAxisLabel || data.xColumnName} />
      <line
        x1={minX}
        y1={midY}
        x2={q1X}
        y2={midY}
        stroke="#334155"
        strokeWidth={1.6}
      />
      <line
        x1={q3X}
        y1={midY}
        x2={maxX}
        y2={midY}
        stroke="#334155"
        strokeWidth={1.6}
      />
      <line
        x1={minX}
        y1={midY - 12}
        x2={minX}
        y2={midY + 12}
        stroke="#334155"
        strokeWidth={1.6}
      />
      <line
        x1={maxX}
        y1={midY - 12}
        x2={maxX}
        y2={midY + 12}
        stroke="#334155"
        strokeWidth={1.6}
      />
      <rect
        x={q1X}
        y={midY - boxH / 2}
        width={Math.max(3, q3X - q1X)}
        height={boxH}
        fill="#ccece9"
        stroke="#0f766e"
        strokeWidth={1.6}
      />
      <line
        x1={medX}
        y1={midY - boxH / 2}
        x2={medX}
        y2={midY + boxH / 2}
        stroke="#b45309"
        strokeWidth={2.2}
      />
      {data.mean !== null && (
        <circle cx={mapX(data.mean)} cy={midY} r={3.2} fill="#0f172a" />
      )}
      <text
        x={PAD_L + PLOT_W / 2}
        y={PAD_T + PLOT_H + 15}
        textAnchor="middle"
        fontSize={9}
        fill="#475569"
        fontFamily="ui-monospace, SFMono-Regular, monospace"
      >
        {`Min: ${fmtAxisNum(data.min)} · Q1: ${fmtAxisNum(data.q1)} · Median: ${fmtAxisNum(data.median)} · Q3: ${fmtAxisNum(data.q3)} · Max: ${fmtAxisNum(data.max)} · IQR: ${fmtAxisNum(data.iqr)}`}
      </text>
    </>
  );
}

/**
 * Light-paper institutional SVG chart preview mirroring the exact geometry
 * and print palette of `pdfChartRenderer.ts` using Module 06 PreparedChartData.
 */
export function ReportChartPreviewSvg({
  config,
  prepared,
}: ReportChartPreviewSvgProps) {
  if (prepared.status !== 'ready') {
    return (
      <div className="flex h-36 items-center justify-center rounded border border-slate-200 bg-slate-50 px-4 text-xs italic text-slate-500">
        {prepared.emptyReason ?? 'Chart unavailable for the selected column.'}
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="block h-auto w-full"
      role="img"
      aria-label={`${config.title} (${config.type} chart)`}
    >
      {prepared.type === 'bar' && <BarSvg config={config} data={prepared} />}
      {prepared.type === 'histogram' && (
        <HistogramSvg config={config} data={prepared} />
      )}
      {prepared.type === 'line' && <LineSvg config={config} data={prepared} />}
      {prepared.type === 'scatter' && (
        <ScatterSvg config={config} data={prepared} />
      )}
      {prepared.type === 'boxplot' && (
        <BoxPlotSvg config={config} data={prepared} />
      )}
    </svg>
  );
}
