/**
 * Data Detective — Module 10 Multi-Page A4 PDF Export Engine
 *
 * Generates genuine, standards-compliant multi-page A4 PDF documents directly
 * in browser memory (and Node/Vitest for real automated PDF inspection).
 *
 * Invariants:
 * - Never requires Gemini API or any backend PDF service.
 * - Strict A4 dimensions (595.28 × 841.89 pt) with generous print margins.
 * - Institutional document typography, cover page, running headers/footers,
 *   page numbering ("Page X of Y"), keep-with-next heading guards, atomic
 *   chart blocks, and multi-page wrapping tables via jspdf-autotable.
 * - Preserves clear visual and textual separation between verified evidence,
 *   statistical outliers, user hypotheses, and AI interpretations.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  CompiledReportDocument,
  ReportSectionConfig,
} from '@/types';
import { buildReportSafeFilename } from './reportBuilder';
import { drawPreparedChartToPdf } from './pdfChartRenderer';
import { REPORT_TYPE_META } from './reportTemplates';

export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;
const MARGIN_X = 48;
const MARGIN_TOP = 58;
const MARGIN_BOTTOM = 54;
const CONTENT_WIDTH = A4_WIDTH_PT - MARGIN_X * 2;
const USABLE_BOTTOM = A4_HEIGHT_PT - MARGIN_BOTTOM;

const PALETTE = {
  ink: [17, 24, 39] as const,
  body: [51, 65, 85] as const,
  muted: [100, 116, 139] as const,
  rule: [203, 213, 225] as const,
  teal: [15, 118, 110] as const,
  tealBg: [240, 253, 250] as const,
  amber: [180, 83, 9] as const,
  amberBg: [255, 251, 235] as const,
  crimson: [185, 28, 28] as const,
  tableHeadBg: [241, 245, 249] as const,
  zebraBg: [248, 250, 252] as const,
};

export interface GeneratedPdfResult {
  readonly bytes: Uint8Array;
  readonly blob: Blob;
  readonly fileName: string;
  readonly pageCount: number;
  readonly durationMs: number;
}

function fmtDate(ts: number | string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function fmtDateTime(ts: number | string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtStat(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 10_000) return Math.round(n).toLocaleString();
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(2);
}

function getLastTableY(doc: jsPDF, fallbackY: number): number {
  const maybeDoc = doc as jsPDF & { lastAutoTable?: { finalY?: number } };
  return typeof maybeDoc.lastAutoTable?.finalY === 'number'
    ? maybeDoc.lastAutoTable.finalY
    : fallbackY;
}

class A4PdfCursor {
  readonly doc: jsPDF;
  y: number;
  hasCoverPage: boolean;
  sectionCounter: number;

  constructor(doc: jsPDF, hasCoverPage: boolean) {
    this.doc = doc;
    this.y = MARGIN_TOP;
    this.hasCoverPage = hasCoverPage;
    this.sectionCounter = 0;
  }

  addPage(): void {
    this.doc.addPage('a4', 'portrait');
    this.y = MARGIN_TOP;
  }

  ensureSpace(requiredPt: number): void {
    if (this.y + requiredPt > USABLE_BOTTOM) {
      this.addPage();
    }
  }

  /**
   * Renders a numbered institutional section heading with keep-with-next protection
   * so headings are never stranded at the bottom of a page.
   */
  drawSectionHeading(title: string, kicker?: string): void {
    this.sectionCounter += 1;
    const prefix = String(this.sectionCounter).padStart(2, '0');
    const headingText = `${prefix}. ${title}`;

    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(13.5);
    const wrapped = this.doc.splitTextToSize(headingText, CONTENT_WIDTH) as string[];
    const needed = wrapped.length * 17 + (kicker ? 16 : 0) + 54;
    this.ensureSpace(needed);

    if (kicker) {
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(7.5);
      this.doc.setTextColor(...PALETTE.teal);
      this.doc.text(kicker.toUpperCase(), MARGIN_X, this.y);
      this.y += 12;
    }

    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(13.5);
    this.doc.setTextColor(...PALETTE.ink);
    for (const line of wrapped) {
      this.doc.text(line, MARGIN_X, this.y);
      this.y += 17;
    }

    this.doc.setDrawColor(...PALETTE.rule);
    this.doc.setLineWidth(0.75);
    this.doc.line(MARGIN_X, this.y - 4, MARGIN_X + CONTENT_WIDTH, this.y - 4);
    this.y += 12;
  }

  drawSubheading(title: string, color: readonly [number, number, number] = PALETTE.ink): void {
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(10.5);
    const wrapped = this.doc.splitTextToSize(title, CONTENT_WIDTH) as string[];
    this.ensureSpace(wrapped.length * 14 + 34);
    this.doc.setTextColor(...color);
    for (const line of wrapped) {
      this.doc.text(line, MARGIN_X, this.y);
      this.y += 14;
    }
    this.y += 2;
  }

  drawParagraph(
    text: string,
    options?: {
      readonly fontSize?: number;
      readonly color?: readonly [number, number, number];
      readonly fontStyle?: 'normal' | 'bold' | 'italic';
      readonly indent?: number;
      readonly spacingAfter?: number;
    },
  ): void {
    const fontSize = options?.fontSize ?? 9.5;
    const lineHeight = fontSize * 1.45;
    const indent = options?.indent ?? 0;
    const color = options?.color ?? PALETTE.body;
    const style = options?.fontStyle ?? 'normal';

    this.doc.setFont('helvetica', style);
    this.doc.setFontSize(fontSize);
    this.doc.setTextColor(...color);

    const lines = this.doc.splitTextToSize(
      text,
      Math.max(80, CONTENT_WIDTH - indent),
    ) as string[];

    for (const line of lines) {
      this.ensureSpace(lineHeight + 4);
      this.doc.text(line, MARGIN_X + indent, this.y);
      this.y += lineHeight;
    }
    this.y += options?.spacingAfter ?? 7;
  }

  drawBulletList(
    items: readonly string[],
    color: readonly [number, number, number] = PALETTE.body,
  ): void {
    for (const item of items) {
      const clean = item.trim();
      if (!clean) continue;
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(9.2);
      const lines = this.doc.splitTextToSize(clean, CONTENT_WIDTH - 14) as string[];
      this.ensureSpace(lines.length * 13 + 6);
      this.doc.setTextColor(...PALETTE.teal);
      this.doc.text('•', MARGIN_X + 3, this.y);
      this.doc.setTextColor(...color);
      for (const line of lines) {
        this.doc.text(line, MARGIN_X + 14, this.y);
        this.y += 13;
      }
      this.y += 3;
    }
    this.y += 4;
  }

  drawCalloutBox(
    label: string,
    body: string,
    tone: 'teal' | 'amber' = 'teal',
  ): void {
    const bg: readonly [number, number, number] =
      tone === 'amber' ? PALETTE.amberBg : PALETTE.tealBg;
    const accent: readonly [number, number, number] =
      tone === 'amber' ? PALETTE.amber : PALETTE.teal;

    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9.2);
    const lines = this.doc.splitTextToSize(body, CONTENT_WIDTH - 24) as string[];
    const boxH = 26 + lines.length * 13.2;

    this.ensureSpace(boxH + 10);

    this.doc.setFillColor(...bg);
    this.doc.setDrawColor(...PALETTE.rule);
    this.doc.setLineWidth(0.6);
    this.doc.rect(MARGIN_X, this.y, CONTENT_WIDTH, boxH, 'FD');

    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(7.5);
    this.doc.setTextColor(...accent);
    this.doc.text(label.toUpperCase(), MARGIN_X + 12, this.y + 14);

    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9.2);
    this.doc.setTextColor(...PALETTE.ink);
    let ty = this.y + 27;
    for (const line of lines) {
      this.doc.text(line, MARGIN_X + 12, ty);
      ty += 13.2;
    }

    this.y += boxH + 12;
  }

  drawTable(
    head: string[],
    body: (string | number)[][],
    columnStyles?: Record<number, { halign?: 'left' | 'right' | 'center'; cellWidth?: number | 'auto' }>,
  ): void {
    this.ensureSpace(72);
    autoTable(this.doc, {
      startY: this.y,
      head: [head],
      body,
      margin: { left: MARGIN_X, right: MARGIN_X, top: MARGIN_TOP, bottom: MARGIN_BOTTOM },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8.2,
        textColor: [30, 41, 59],
        cellPadding: { top: 4.5, right: 5.5, bottom: 4.5, left: 5.5 },
        lineColor: [226, 232, 240],
        lineWidth: 0.45,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [...PALETTE.tableHeadBg],
        textColor: [...PALETTE.ink],
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: [...PALETTE.zebraBg],
      },
      columnStyles,
    });
    this.y = getLastTableY(this.doc, this.y + 40) + 14;
  }
}

function renderCoverPage(
  cursor: A4PdfCursor,
  compiled: CompiledReportDocument,
): void {
  const { doc } = cursor;
  const { report, datasetOverview, investigationCase } = compiled;
  const typeMeta = REPORT_TYPE_META[report.reportType];

  // Top institutional brand bar (restrained hairline + wordmark)
  doc.setDrawColor(...PALETTE.teal);
  doc.setLineWidth(2);
  doc.line(MARGIN_X, 58, MARGIN_X + 46, 58);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PALETTE.ink);
  doc.text('DATA DETECTIVE', MARGIN_X, 76);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PALETTE.muted);
  doc.text(
    `FORENSIC ANALYTICS & INVESTIGATION DOSSIER · ${report.id}`,
    MARGIN_X,
    90,
  );

  // Report Type Kicker
  let y = 166;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PALETTE.teal);
  doc.text(typeMeta.label.toUpperCase(), MARGIN_X, y);
  y += 22;

  // Report Title (properly wrapped for long titles)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.setTextColor(...PALETTE.ink);
  const titleLines = doc.splitTextToSize(report.title, CONTENT_WIDTH) as string[];
  for (const line of titleLines) {
    doc.text(line, MARGIN_X, y);
    y += 29;
  }

  // Subtitle
  if (report.subtitle) {
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(...PALETTE.body);
    const subLines = doc.splitTextToSize(report.subtitle, CONTENT_WIDTH) as string[];
    for (const line of subLines) {
      doc.text(line, MARGIN_X, y);
      y += 17;
    }
  }

  y += 14;
  doc.setDrawColor(...PALETTE.rule);
  doc.setLineWidth(0.9);
  doc.line(MARGIN_X, y, MARGIN_X + CONTENT_WIDTH, y);
  y += 22;

  // Intro description on cover if present
  if (report.introDescription) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...PALETTE.body);
    const introLines = doc.splitTextToSize(
      report.introDescription,
      CONTENT_WIDTH,
    ) as string[];
    for (const line of introLines.slice(0, 8)) {
      doc.text(line, MARGIN_X, y);
      y += 14.5;
    }
    y += 16;
  }

  // Cover Metadata Block (pinned in lower half)
  const metaY = Math.max(y + 20, 480);
  const metaRows: [string, string][] = [
    ['Document ID', report.id],
    ['Report Classification', typeMeta.label],
    ['Source Dataset', `${datasetOverview.fileName} (${datasetOverview.rowCount.toLocaleString()} rows × ${datasetOverview.columnCount.toLocaleString()} cols)`],
    ...(investigationCase
      ? [
          [
            'Investigation Case',
            `${investigationCase.id} — ${investigationCase.title} (${investigationCase.status.replace(/_/g, ' ')})`,
          ] as [string, string],
        ]
      : []),
    ['Generated Date', fmtDate(compiled.generatedAt)],
    ...(report.author ? [['Prepared By', report.author] as [string, string]] : []),
    [
      'Included Sections',
      `${compiled.activeSections.length} section(s) · ${compiled.findings.length} finding(s) · ${compiled.charts.length} chart(s)`,
    ],
  ];

  autoTable(doc, {
    startY: metaY,
    body: metaRows,
    margin: { left: MARGIN_X, right: MARGIN_X },
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 5, right: 8, bottom: 5, left: 0 },
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 135, textColor: [100, 116, 139] },
      1: { cellWidth: 'auto' },
    },
    didDrawCell: (data) => {
      if (data.row.index < metaRows.length - 1) {
        doc.setDrawColor(...PALETTE.rule);
        doc.setLineWidth(0.35);
        doc.line(
          MARGIN_X,
          data.cell.y + data.cell.height,
          MARGIN_X + CONTENT_WIDTH,
          data.cell.y + data.cell.height,
        );
      }
    },
  });

  // Footer note on cover
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(...PALETTE.muted);
  doc.text(
    'Generated locally in Data Detective from deterministic dataset analysis and verified investigation records.',
    MARGIN_X,
    A4_HEIGHT_PT - 42,
  );
}

function renderSectionContent(
  cursor: A4PdfCursor,
  section: ReportSectionConfig,
  compiled: CompiledReportDocument,
): void {
  switch (section.key) {
    case 'cover':
      return;

    case 'executive_summary': {
      cursor.drawSectionHeading(section.title, 'Verified Overview');
      if (compiled.report.introDescription && !cursor.hasCoverPage) {
        cursor.drawParagraph(compiled.report.introDescription);
      }
      cursor.drawParagraph(compiled.executiveSummary.deterministicSummary);

      if (compiled.executiveSummary.keyHighlights.length > 0) {
        cursor.drawSubheading('Key Verified Highlights');
        cursor.drawBulletList(compiled.executiveSummary.keyHighlights);
      }

      if (compiled.executiveSummary.aiBriefSummary) {
        cursor.drawCalloutBox(
          `AI-Generated Interpretation (${compiled.executiveSummary.aiBriefModel ?? 'Gemini'} · Not Verified Evidence)`,
          compiled.executiveSummary.aiBriefSummary,
          'amber',
        );
      }
      break;
    }

    case 'dataset_overview': {
      const ov = compiled.datasetOverview;
      cursor.drawSectionHeading(section.title, 'Dataset Intake & Schema Profile');

      cursor.drawTable(
        ['Metric', 'Observed Value', 'Metric', 'Observed Value'],
        [
          [
            'Filename',
            ov.fileName,
            'File Type',
            ov.fileType.toUpperCase(),
          ],
          [
            'Row Count',
            ov.rowCount.toLocaleString(),
            'Column Count',
            ov.columnCount.toLocaleString(),
          ],
          [
            'Quality Score',
            `${ov.qualityScore}/100 (Grade ${ov.qualityGrade})`,
            'Missing Cells',
            `${ov.totalMissingCount.toLocaleString()} (${ov.overallMissingPercentage.toFixed(1)}%)`,
          ],
          [
            'Total Cells',
            ov.totalCells.toLocaleString(),
            'Profiling Warnings',
            String(ov.warningCount),
          ],
        ],
        {
          0: { cellWidth: 105 },
          1: { cellWidth: 144 },
          2: { cellWidth: 105 },
          3: { cellWidth: 'auto' },
        },
      );

      if (ov.qualitySummary) {
        cursor.drawParagraph(ov.qualitySummary, {
          fontSize: 9,
          color: PALETTE.muted,
        });
      }

      const typeRows = Object.entries(ov.typeDistribution)
        .filter(([, count]) => count > 0)
        .map(([type, count]) => [
          type.charAt(0).toUpperCase() + type.slice(1),
          String(count),
          `${ov.columnCount > 0 ? ((count / ov.columnCount) * 100).toFixed(1) : '0.0'}%`,
        ]);

      if (typeRows.length > 0) {
        cursor.drawSubheading('Column Classification Distribution');
        cursor.drawTable(['Detected Type', 'Columns', 'Share'], typeRows, {
          1: { halign: 'right', cellWidth: 75 },
          2: { halign: 'right', cellWidth: 75 },
        });
      }

      if (ov.columns.length > 0) {
        cursor.drawSubheading('Column Profile Summary');
        cursor.drawTable(
          ['Column', 'Type', 'Confidence', 'Missing', 'Missing %', 'Unique'],
          ov.columns.map((c) => [
            c.name,
            c.detectedType,
            c.confidence,
            c.missingCount.toLocaleString(),
            `${c.missingPercentage.toFixed(1)}%`,
            c.uniqueCount.toLocaleString(),
          ]),
          {
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right' },
          },
        );
      }
      break;
    }

    case 'methodology': {
      cursor.drawSectionHeading(
        section.title,
        'Deterministic Analytical Procedures Applied',
      );
      if (compiled.methodology.length === 0) {
        cursor.drawParagraph(
          'No analytical methods were recorded for the selected scope.',
          { fontStyle: 'italic', color: PALETTE.muted },
        );
        break;
      }
      cursor.drawTable(
        ['Method', 'Applied Scope', 'Procedure Description'],
        compiled.methodology.map((m) => [m.name, m.scope, m.description]),
        {
          0: { cellWidth: 135 },
          1: { cellWidth: 115 },
        },
      );
      break;
    }

    case 'statistical_findings': {
      cursor.drawSectionHeading(section.title, 'Deterministic Statistical Analysis');
      if (
        compiled.numericStats.length === 0 &&
        compiled.categoricalStats.length === 0
      ) {
        cursor.drawParagraph(
          'No statistical columns were selected or available for this report.',
          { fontStyle: 'italic', color: PALETTE.muted },
        );
        break;
      }

      if (compiled.numericStats.length > 0) {
        cursor.drawSubheading('Numeric Column Descriptive Statistics');
        cursor.drawTable(
          [
            'Column',
            'Valid (Miss/Inv)',
            'Mean',
            'Median',
            'Std Dev (s)',
            'Min / Max',
            'Q1 / Q3 (IQR)',
          ],
          compiled.numericStats.map((c) => [
            c.name,
            `${c.validCount.toLocaleString()} (${c.missingCount}/${c.invalidCount})`,
            fmtStat(c.mean),
            fmtStat(c.median),
            fmtStat(c.sampleStdDev),
            `${fmtStat(c.min)} / ${fmtStat(c.max)}`,
            `${fmtStat(c.q1)} / ${fmtStat(c.q3)} (${fmtStat(c.iqr)})`,
          ]),
          {
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right' },
          },
        );
      }

      if (compiled.categoricalStats.length > 0) {
        cursor.drawSubheading('Categorical Column Frequency Distributions');
        cursor.drawTable(
          [
            'Column',
            'Valid / Missing',
            'Distinct',
            'Most Frequent',
            'Least Frequent',
          ],
          compiled.categoricalStats.map((c) => {
            const topStr = c.mostFrequent
              ? `${c.mostFrequent.values.slice(0, 2).join(', ')} (${c.mostFrequent.count}, ${c.mostFrequent.percentage.toFixed(1)}%)`
              : '—';
            const lowStr = c.leastFrequent
              ? `${c.leastFrequent.values.slice(0, 2).join(', ')} (${c.leastFrequent.count}, ${c.leastFrequent.percentage.toFixed(1)}%)`
              : '—';
            return [
              c.name,
              `${c.validCount.toLocaleString()} / ${c.missingCount.toLocaleString()}`,
              c.distinctCount.toLocaleString(),
              topStr,
              lowStr,
            ];
          }),
          {
            2: { halign: 'right', cellWidth: 52 },
          },
        );
      }
      break;
    }

    case 'insights_anomalies': {
      cursor.drawSectionHeading(
        section.title,
        'Automated Findings & Classifications',
      );
      if (compiled.findings.length === 0) {
        cursor.drawParagraph(
          'No automated findings were selected for this report.',
          { fontStyle: 'italic', color: PALETTE.muted },
        );
        break;
      }

      const classLabels: Record<string, string> = {
        data_quality_issue: 'Data-Quality Issue',
        statistical_outlier: 'Statistical Outlier (Not Automatically Error)',
        notable_observation: 'Notable Observation',
      };

      cursor.drawParagraph(
        'Findings below maintain strict separation between confirmed data-quality issues, statistical outliers (which may represent valid extreme values), and notable distributional observations.',
        { fontSize: 8.8, color: PALETTE.muted },
      );

      cursor.drawTable(
        [
          'Finding & Classification',
          'Severity / Category',
          'Columns',
          'Evidence & Rationale',
        ],
        compiled.findings.map((f) => {
          const metricsStr = f.evidenceMetrics
            .slice(0, 4)
            .map((m) => `${m.label}: ${m.value}`)
            .join(' · ');
          return [
            `${f.title}\n[${classLabels[f.classification] ?? f.classification}]`,
            `${f.severity.toUpperCase()}\n${f.category.replace(/_/g, ' ')}`,
            f.affectedColumnNames.join(', ') || 'Dataset',
            `${metricsStr ? `${metricsStr}\n` : ''}${f.explanation}`,
          ];
        }),
        {
          0: { cellWidth: 135 },
          1: { cellWidth: 78 },
          2: { cellWidth: 78 },
        },
      );
      break;
    }

    case 'visualizations': {
      cursor.drawSectionHeading(
        section.title,
        'Schema-Validated Visualizations',
      );
      if (compiled.charts.length === 0) {
        cursor.drawParagraph(
          'No charts were selected for inclusion in this report.',
          { fontStyle: 'italic', color: PALETTE.muted },
        );
        break;
      }

      compiled.charts.forEach((chartSnap, idx) => {
        const chartHeight = 165;
        const blockHeight = 28 + chartHeight + 36;
        // Atomic chart block: never split chart + caption across page boundaries
        cursor.ensureSpace(blockHeight);

        cursor.doc.setFont('helvetica', 'bold');
        cursor.doc.setFontSize(10);
        cursor.doc.setTextColor(...PALETTE.ink);
        cursor.doc.text(
          `Figure ${idx + 1}. ${chartSnap.config.title}`,
          MARGIN_X,
          cursor.y,
        );
        cursor.y += 12;

        cursor.doc.setFont('helvetica', 'normal');
        cursor.doc.setFontSize(7.8);
        cursor.doc.setTextColor(...PALETTE.muted);
        const colLabel = chartSnap.prepared.yColumnName
          ? `${chartSnap.prepared.xColumnName} vs ${chartSnap.prepared.yColumnName}`
          : chartSnap.prepared.xColumnName;
        cursor.doc.text(
          `Chart Type: ${chartSnap.config.type.toUpperCase()} · Columns: ${colLabel}`,
          MARGIN_X,
          cursor.y,
        );
        cursor.y += 8;

        drawPreparedChartToPdf(cursor.doc, chartSnap.config, chartSnap.prepared, {
          x: MARGIN_X,
          y: cursor.y,
          width: CONTENT_WIDTH,
          height: chartHeight,
        });
        cursor.y += chartHeight + 12;

        cursor.drawParagraph(chartSnap.caption, {
          fontSize: 8.3,
          fontStyle: 'italic',
          color: PALETTE.muted,
          spacingAfter: 12,
        });
      });
      break;
    }

    case 'investigation_case': {
      cursor.drawSectionHeading(
        section.title,
        'Investigation Case Record',
      );
      const c = compiled.investigationCase;
      if (!c) {
        cursor.drawParagraph(
          'No investigation case is linked to this report.',
          { fontStyle: 'italic', color: PALETTE.muted },
        );
        break;
      }

      cursor.drawTable(
        ['Case Field', 'Value', 'Case Field', 'Value'],
        [
          ['Case ID', c.id, 'Status', c.status.replace(/_/g, ' ').toUpperCase()],
          ['Priority', c.priority.toUpperCase(), 'Source Dataset', c.datasetFileName],
          ['Created', fmtDateTime(c.createdAt), 'Last Updated', fmtDateTime(c.updatedAt)],
        ],
        {
          0: { cellWidth: 95 },
          1: { cellWidth: 154 },
          2: { cellWidth: 95 },
          3: { cellWidth: 'auto' },
        },
      );

      if (c.description) {
        cursor.drawSubheading('Case Description');
        cursor.drawParagraph(c.description);
      }

      if (c.evidence.length > 0) {
        cursor.drawSubheading('Verified Evidence Board (References Only)');
        cursor.drawTable(
          ['Type', 'Title', 'Reference ID', 'Summary'],
          c.evidence.map((ev) => [
            `VERIFIED · ${ev.type.replace(/_/g, ' ')}`,
            ev.title,
            ev.sourceRef,
            ev.description,
          ]),
          {
            0: { cellWidth: 95 },
            1: { cellWidth: 130 },
            2: { cellWidth: 85 },
          },
        );
      }

      if (c.notes.length > 0) {
        cursor.drawSubheading(
          'Investigation Journal (Analyst Observations, Unverified Hypotheses & Conclusions)',
        );
        const noteLabels: Record<string, string> = {
          observation: 'USER OBSERVATION',
          hypothesis: 'UNVERIFIED HYPOTHESIS',
          question: 'OPEN QUESTION',
          conclusion: 'FINAL CONCLUSION',
        };
        cursor.drawTable(
          ['Classification', 'Timestamp', 'Entry'],
          c.notes.map((n) => [
            noteLabels[n.type] ?? n.type.toUpperCase(),
            fmtDateTime(n.updatedAt),
            n.text,
          ]),
          {
            0: { cellWidth: 115 },
            1: { cellWidth: 95 },
          },
        );
      }

      if (c.conclusion.trim()) {
        cursor.drawCalloutBox(
          `Documented Case Conclusion (${c.id})`,
          c.conclusion.trim(),
          'teal',
        );
      }

      if (c.timeline.length > 0) {
        cursor.drawSubheading('Chronological Activity Timeline');
        cursor.drawTable(
          ['Timestamp', 'Event', 'Details'],
          c.timeline.slice(-20).map((evt) => [
            fmtDateTime(evt.timestamp),
            evt.label,
            evt.detail ?? '—',
          ]),
          {
            0: { cellWidth: 115 },
            1: { cellWidth: 165 },
          },
        );
      }
      break;
    }

    case 'ai_interpretation': {
      cursor.drawSectionHeading(
        section.title,
        'AI-Generated Interpretations · Not Verified Evidence',
      );
      const { module08Brief, module09CaseAnalyses } = compiled.aiInterpretations;
      if (!module08Brief && module09CaseAnalyses.length === 0) {
        cursor.drawParagraph(
          'No AI interpretations were selected or available for this dataset.',
          { fontStyle: 'italic', color: PALETTE.muted },
        );
        break;
      }

      cursor.drawCalloutBox(
        'Epistemic Notice — AI-Generated Content',
        'All interpretations below were generated by an AI model using aggregate dataset summaries only (0 raw spreadsheet rows). They represent interpretive hypotheses and must not be treated as verified conclusions without independent review.',
        'amber',
      );

      if (module08Brief) {
        cursor.drawSubheading(
          `Dataset Investigation Brief (${module08Brief.model} · ${fmtDateTime(module08Brief.generatedAt)})`,
          PALETTE.amber,
        );
        cursor.drawParagraph(module08Brief.data.brief.executiveSummary);
        if (module08Brief.data.brief.dataQualityAssessment) {
          cursor.drawParagraph(
            `Data quality assessment: ${module08Brief.data.brief.dataQualityAssessment}`,
          );
        }
        if (module08Brief.data.connections.length > 0) {
          cursor.drawTable(
            ['Proposed Connection', 'Evidence Strength', 'Referenced Findings', 'Interpretation'],
            module08Brief.data.connections.map((conn) => [
              conn.title,
              conn.confidence.toUpperCase(),
              conn.findingIds.join(', ') || '—',
              conn.possibleInterpretation,
            ]),
            {
              0: { cellWidth: 110 },
              1: { cellWidth: 78 },
              2: { cellWidth: 95 },
            },
          );
        }
      }

      for (const rec of module09CaseAnalyses) {
        cursor.drawSubheading(
          `Case AI Interpretation (${rec.model} · Support: ${rec.data.supportType.replace(/_/g, ' ')})`,
          PALETTE.amber,
        );
        cursor.drawParagraph(rec.data.evidenceAssessment);
        if (rec.data.possibleConnections.length > 0) {
          cursor.drawParagraph('Possible connections (hypotheses):', {
            fontStyle: 'bold',
            fontSize: 9,
            spacingAfter: 3,
          });
          cursor.drawBulletList(rec.data.possibleConnections);
        }
        if (rec.data.alternativeExplanations.length > 0) {
          cursor.drawParagraph('Alternative explanations:', {
            fontStyle: 'bold',
            fontSize: 9,
            spacingAfter: 3,
          });
          cursor.drawBulletList(rec.data.alternativeExplanations);
        }
        if (rec.data.referencedFindingIds.length > 0) {
          cursor.drawParagraph(
            `Referenced finding IDs: ${rec.data.referencedFindingIds.join(', ')}`,
            { fontSize: 8.2, color: PALETTE.muted },
          );
        }
      }
      break;
    }

    case 'limitations_conclusion': {
      cursor.drawSectionHeading(
        section.title,
        'Scope Boundaries & Evidence-Supported Conclusions',
      );

      cursor.drawSubheading('Data Limitations');
      cursor.drawBulletList(compiled.limitations.dataLimitations);

      cursor.drawSubheading('Analytical Limitations');
      cursor.drawBulletList(compiled.limitations.analyticalLimitations);

      cursor.drawSubheading('Unanswered Questions');
      cursor.drawBulletList(compiled.limitations.unansweredQuestions);

      cursor.drawSubheading('Conclusions Supported by Evidence');
      cursor.drawBulletList(
        compiled.limitations.supportedConclusions,
        PALETTE.ink,
      );
      break;
    }
  }
}

function stampRunningHeadersAndFooters(
  doc: jsPDF,
  compiled: CompiledReportDocument,
  hasCoverPage: boolean,
): void {
  const totalPages = doc.getNumberOfPages();
  const shortTitle =
    compiled.report.title.length > 56
      ? `${compiled.report.title.slice(0, 55)}…`
      : compiled.report.title;
  const sourceLabel = compiled.investigationCase
    ? `${compiled.datasetOverview.fileName} · Case ${compiled.investigationCase.id}`
    : compiled.datasetOverview.fileName;

  for (let page = 1; page <= totalPages; page += 1) {
    if (hasCoverPage && page === 1) continue;
    doc.setPage(page);

    // Running Header
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PALETTE.muted);
    doc.text(shortTitle, MARGIN_X, 34);
    doc.text(`Data Detective · ${compiled.report.id}`, A4_WIDTH_PT - MARGIN_X, 34, {
      align: 'right',
    });
    doc.setDrawColor(...PALETTE.rule);
    doc.setLineWidth(0.5);
    doc.line(MARGIN_X, 40, A4_WIDTH_PT - MARGIN_X, 40);

    // Running Footer
    doc.line(MARGIN_X, A4_HEIGHT_PT - 38, A4_WIDTH_PT - MARGIN_X, A4_HEIGHT_PT - 38);
    doc.text(
      sourceLabel.slice(0, 68),
      MARGIN_X,
      A4_HEIGHT_PT - 25,
    );
    doc.text(
      `Page ${page} of ${totalPages}`,
      A4_WIDTH_PT - MARGIN_X,
      A4_HEIGHT_PT - 25,
      { align: 'right' },
    );
  }
}

/**
 * Generates a real multi-page A4 PDF document synchronously/deterministically
 * from a CompiledReportDocument.
 */
export function generateReportPdf(
  compiled: CompiledReportDocument,
): GeneratedPdfResult {
  const start = performance.now();

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: false,
  });

  doc.setProperties({
    title: compiled.report.title,
    subject: compiled.report.subtitle || REPORT_TYPE_META[compiled.report.reportType].label,
    author: compiled.report.author || 'Data Detective',
    creator: 'Data Detective Reporting Engine',
  });

  const hasCover = compiled.activeSections.some((s) => s.key === 'cover');
  const cursor = new A4PdfCursor(doc, hasCover);

  if (hasCover) {
    renderCoverPage(cursor, compiled);
  }

  const contentSections = compiled.activeSections.filter((s) => s.key !== 'cover');
  if (contentSections.length > 0 && hasCover) {
    cursor.addPage();
  }

  for (const section of contentSections) {
    renderSectionContent(cursor, section, compiled);
  }

  stampRunningHeadersAndFooters(doc, compiled, hasCover);

  const arrayBuffer = doc.output('arraybuffer');
  const bytes = new Uint8Array(arrayBuffer);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const fileName = buildReportSafeFilename(compiled.report);
  const pageCount = doc.getNumberOfPages();
  const durationMs = Math.max(1, Math.round(performance.now() - start));

  return {
    bytes,
    blob,
    fileName,
    pageCount,
    durationMs,
  };
}

/**
 * Triggers a browser file download for a generated PDF without using window.open.
 */
export function triggerBrowserPdfDownload(result: GeneratedPdfResult): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const objectUrl = URL.createObjectURL(result.blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = result.fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 5_000);
}
