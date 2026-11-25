import { AlertTriangle, FileText } from 'lucide-react';
import { REPORT_TYPE_META } from '@/engine/reports';
import type { CompiledReportDocument, ReportSectionConfig } from '@/types';
import { ReportChartPreviewSvg } from './ReportChartPreviewSvg';
import {
  CASE_NOTE_TYPE_LABELS,
  FINDING_CLASSIFICATION_LABELS,
  formatReportDate,
  formatReportDateTime,
  formatReportStat,
} from './reportLabels';

interface ReportA4PreviewProps {
  readonly compiled: CompiledReportDocument;
}

function SectionHeading({
  numberLabel,
  kicker,
  title,
}: {
  readonly numberLabel: string;
  readonly kicker: string;
  readonly title: string;
}) {
  return (
    <div className="mb-4 border-b border-slate-300 pb-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-800">
        {kicker}
      </div>
      <h3 className="mt-0.5 text-[18px] font-bold leading-snug tracking-tight text-slate-900">
        {numberLabel}. {title}
      </h3>
    </div>
  );
}

function renderSectionBody(
  section: ReportSectionConfig,
  indexNumber: number,
  compiled: CompiledReportDocument,
  hasCover: boolean,
) {
  const numStr = String(indexNumber).padStart(2, '0');

  switch (section.key) {
    case 'cover':
      return null;

    case 'executive_summary':
      return (
        <section key={section.key} className="mb-8 break-inside-avoid">
          <SectionHeading
            numberLabel={numStr}
            kicker="Verified Overview"
            title={section.title}
          />
          {compiled.report.introDescription && !hasCover && (
            <p className="mb-3 text-[13px] leading-relaxed text-slate-700">
              {compiled.report.introDescription}
            </p>
          )}
          <p className="text-[13px] leading-relaxed text-slate-800">
            {compiled.executiveSummary.deterministicSummary}
          </p>

          {compiled.executiveSummary.keyHighlights.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-slate-900">
                Key Verified Highlights
              </h4>
              <ul className="space-y-1.5 pl-4 text-[12.5px] leading-relaxed text-slate-700">
                {compiled.executiveSummary.keyHighlights.map((item, idx) => (
                  <li key={idx} className="list-disc marker:text-teal-700">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {compiled.executiveSummary.aiBriefSummary && (
            <div className="mt-4 border border-amber-300 bg-amber-50/70 p-3.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-800">
                AI-Generated Interpretation ·{' '}
                {compiled.executiveSummary.aiBriefModel ?? 'Gemini'} · Not
                Verified Evidence
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-800">
                {compiled.executiveSummary.aiBriefSummary}
              </p>
            </div>
          )}
        </section>
      );

    case 'dataset_overview': {
      const ov = compiled.datasetOverview;
      const typeEntries = Object.entries(ov.typeDistribution).filter(
        ([, count]) => count > 0,
      );
      return (
        <section key={section.key} className="mb-8">
          <SectionHeading
            numberLabel={numStr}
            kicker="Dataset Intake & Schema Profile"
            title={section.title}
          />

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 border border-slate-200 bg-slate-50/70 p-3.5 text-[12px] sm:grid-cols-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Filename
              </div>
              <div className="mt-0.5 truncate font-semibold text-slate-900">
                {ov.fileName}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Dimensions
              </div>
              <div className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                {ov.rowCount.toLocaleString()} × {ov.columnCount.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Quality Score
              </div>
              <div className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                {ov.qualityScore}/100 (Grade {ov.qualityGrade})
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Missing Cells
              </div>
              <div className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                {ov.totalMissingCount.toLocaleString()} (
                {ov.overallMissingPercentage.toFixed(1)}%)
              </div>
            </div>
          </div>

          {ov.qualitySummary && (
            <p className="mt-2.5 text-[12px] leading-relaxed text-slate-600">
              {ov.qualitySummary}
            </p>
          )}

          {typeEntries.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-slate-900">
                Column Classification Distribution
              </h4>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-700">
                {typeEntries.map(([type, count]) => (
                  <span key={type} className="tabular-nums">
                    <span className="font-semibold capitalize text-slate-900">
                      {type}
                    </span>
                    : {count} (
                    {ov.columnCount > 0
                      ? ((count / ov.columnCount) * 100).toFixed(1)
                      : '0.0'}
                    %)
                  </span>
                ))}
              </div>
            </div>
          )}

          {ov.columns.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-slate-900">
                Column Profile Summary
              </h4>
              <table className="w-full border-collapse text-left text-[11.5px]">
                <thead>
                  <tr className="border-y border-slate-300 bg-slate-100 text-slate-900">
                    <th className="px-2.5 py-1.5 font-semibold">Column</th>
                    <th className="px-2.5 py-1.5 font-semibold">Type</th>
                    <th className="px-2.5 py-1.5 font-semibold">Confidence</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold">
                      Missing
                    </th>
                    <th className="px-2.5 py-1.5 text-right font-semibold">
                      Missing %
                    </th>
                    <th className="px-2.5 py-1.5 text-right font-semibold">
                      Unique
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {ov.columns.map((col) => (
                    <tr key={col.columnId} className="even:bg-slate-50/60">
                      <td className="px-2.5 py-1.5 font-medium text-slate-900">
                        {col.name}
                      </td>
                      <td className="px-2.5 py-1.5 capitalize text-slate-700">
                        {col.detectedType}
                      </td>
                      <td className="px-2.5 py-1.5 capitalize text-slate-600">
                        {col.confidence}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-slate-700">
                        {col.missingCount.toLocaleString()}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-slate-700">
                        {col.missingPercentage.toFixed(1)}%
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-slate-700">
                        {col.uniqueCount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      );
    }

    case 'methodology':
      return (
        <section key={section.key} className="mb-8">
          <SectionHeading
            numberLabel={numStr}
            kicker="Deterministic Analytical Procedures Applied"
            title={section.title}
          />
          {compiled.methodology.length === 0 ? (
            <p className="text-[12.5px] italic text-slate-500">
              No analytical methods were recorded for the selected scope.
            </p>
          ) : (
            <table className="w-full border-collapse text-left text-[11.5px]">
              <thead>
                <tr className="border-y border-slate-300 bg-slate-100 text-slate-900">
                  <th className="w-[28%] px-2.5 py-1.5 font-semibold">
                    Method
                  </th>
                  <th className="w-[22%] px-2.5 py-1.5 font-semibold">
                    Applied Scope
                  </th>
                  <th className="px-2.5 py-1.5 font-semibold">
                    Procedure Description
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {compiled.methodology.map((m) => (
                  <tr key={m.id} className="even:bg-slate-50/60">
                    <td className="px-2.5 py-2 align-top font-semibold text-slate-900">
                      {m.name}
                    </td>
                    <td className="px-2.5 py-2 align-top text-slate-600">
                      {m.scope}
                    </td>
                    <td className="px-2.5 py-2 align-top leading-relaxed text-slate-700">
                      {m.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      );

    case 'statistical_findings':
      return (
        <section key={section.key} className="mb-8">
          <SectionHeading
            numberLabel={numStr}
            kicker="Deterministic Statistical Analysis"
            title={section.title}
          />
          {compiled.numericStats.length === 0 &&
          compiled.categoricalStats.length === 0 ? (
            <p className="text-[12.5px] italic text-slate-500">
              No statistical columns were selected or available for this report.
            </p>
          ) : (
            <div className="space-y-5">
              {compiled.numericStats.length > 0 && (
                <div className="overflow-x-auto">
                  <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-slate-900">
                    Numeric Column Descriptive Statistics
                  </h4>
                  <table className="w-full border-collapse text-left text-[11px]">
                    <thead>
                      <tr className="border-y border-slate-300 bg-slate-100 text-slate-900">
                        <th className="px-2 py-1.5 font-semibold">Column</th>
                        <th className="px-2 py-1.5 font-semibold">
                          Valid (Miss/Inv)
                        </th>
                        <th className="px-2 py-1.5 text-right font-semibold">
                          Mean
                        </th>
                        <th className="px-2 py-1.5 text-right font-semibold">
                          Median
                        </th>
                        <th className="px-2 py-1.5 text-right font-semibold">
                          Std Dev (s)
                        </th>
                        <th className="px-2 py-1.5 font-semibold">Min / Max</th>
                        <th className="px-2 py-1.5 font-semibold">
                          Q1 / Q3 (IQR)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {compiled.numericStats.map((c) => (
                        <tr key={c.columnId} className="even:bg-slate-50/60">
                          <td className="px-2 py-1.5 font-medium text-slate-900">
                            {c.name}
                          </td>
                          <td className="px-2 py-1.5 font-mono tabular-nums text-slate-700">
                            {c.validCount.toLocaleString()} ({c.missingCount}/
                            {c.invalidCount})
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-800">
                            {formatReportStat(c.mean)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-800">
                            {formatReportStat(c.median)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-800">
                            {formatReportStat(c.sampleStdDev)}
                          </td>
                          <td className="px-2 py-1.5 font-mono tabular-nums text-slate-700">
                            {formatReportStat(c.min)} / {formatReportStat(c.max)}
                          </td>
                          <td className="px-2 py-1.5 font-mono tabular-nums text-slate-700">
                            {formatReportStat(c.q1)} / {formatReportStat(c.q3)}{' '}
                            ({formatReportStat(c.iqr)})
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {compiled.categoricalStats.length > 0 && (
                <div className="overflow-x-auto">
                  <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-slate-900">
                    Categorical Column Frequency Distributions
                  </h4>
                  <table className="w-full border-collapse text-left text-[11px]">
                    <thead>
                      <tr className="border-y border-slate-300 bg-slate-100 text-slate-900">
                        <th className="px-2 py-1.5 font-semibold">Column</th>
                        <th className="px-2 py-1.5 font-semibold">
                          Valid / Missing
                        </th>
                        <th className="px-2 py-1.5 text-right font-semibold">
                          Distinct
                        </th>
                        <th className="px-2 py-1.5 font-semibold">
                          Most Frequent
                        </th>
                        <th className="px-2 py-1.5 font-semibold">
                          Least Frequent
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {compiled.categoricalStats.map((c) => {
                        const topStr = c.mostFrequent
                          ? `${c.mostFrequent.values.slice(0, 2).join(', ')} (${c.mostFrequent.count}, ${c.mostFrequent.percentage.toFixed(1)}%)`
                          : '—';
                        const lowStr = c.leastFrequent
                          ? `${c.leastFrequent.values.slice(0, 2).join(', ')} (${c.leastFrequent.count}, ${c.leastFrequent.percentage.toFixed(1)}%)`
                          : '—';
                        return (
                          <tr key={c.columnId} className="even:bg-slate-50/60">
                            <td className="px-2 py-1.5 font-medium text-slate-900">
                              {c.name}
                            </td>
                            <td className="px-2 py-1.5 font-mono tabular-nums text-slate-700">
                              {c.validCount.toLocaleString()} /{' '}
                              {c.missingCount.toLocaleString()}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-800">
                              {c.distinctCount.toLocaleString()}
                            </td>
                            <td className="px-2 py-1.5 text-slate-700">
                              {topStr}
                            </td>
                            <td className="px-2 py-1.5 text-slate-600">
                              {lowStr}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      );

    case 'insights_anomalies':
      return (
        <section key={section.key} className="mb-8">
          <SectionHeading
            numberLabel={numStr}
            kicker="Automated Findings & Classifications"
            title={section.title}
          />
          {compiled.findings.length === 0 ? (
            <p className="text-[12.5px] italic text-slate-500">
              No automated findings were selected for this report.
            </p>
          ) : (
            <>
              <p className="mb-3 text-[12px] leading-relaxed text-slate-600">
                Findings below maintain strict separation between confirmed
                data-quality issues, statistical outliers (which may represent
                valid extreme values), and notable distributional observations.
              </p>
              <table className="w-full border-collapse text-left text-[11.5px]">
                <thead>
                  <tr className="border-y border-slate-300 bg-slate-100 text-slate-900">
                    <th className="w-[27%] px-2.5 py-1.5 font-semibold">
                      Finding &amp; Classification
                    </th>
                    <th className="w-[15%] px-2.5 py-1.5 font-semibold">
                      Severity / Category
                    </th>
                    <th className="w-[16%] px-2.5 py-1.5 font-semibold">
                      Columns
                    </th>
                    <th className="px-2.5 py-1.5 font-semibold">
                      Evidence &amp; Rationale
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {compiled.findings.map((f) => (
                    <tr key={f.id} className="even:bg-slate-50/60">
                      <td className="px-2.5 py-2 align-top">
                        <div className="font-semibold text-slate-900">
                          {f.title}
                        </div>
                        <div className="mt-0.5 text-[10.5px] font-medium text-teal-800">
                          {FINDING_CLASSIFICATION_LABELS[f.classification]}
                        </div>
                      </td>
                      <td className="px-2.5 py-2 align-top">
                        <div className="font-mono text-[10.5px] font-bold uppercase text-slate-900">
                          {f.severity}
                        </div>
                        <div className="text-[10.5px] capitalize text-slate-600">
                          {f.category.replace(/_/g, ' ')}
                        </div>
                      </td>
                      <td className="px-2.5 py-2 align-top text-slate-700">
                        {f.affectedColumnNames.join(', ') || 'Dataset'}
                      </td>
                      <td className="px-2.5 py-2 align-top leading-relaxed text-slate-700">
                        {f.evidenceMetrics.length > 0 && (
                          <div className="mb-1 font-mono text-[10.5px] text-slate-600">
                            {f.evidenceMetrics
                              .slice(0, 4)
                              .map((m) => `${m.label}: ${m.value}`)
                              .join(' · ')}
                          </div>
                        )}
                        <div>{f.explanation}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      );

    case 'visualizations':
      return (
        <section key={section.key} className="mb-8">
          <SectionHeading
            numberLabel={numStr}
            kicker="Schema-Validated Visualizations"
            title={section.title}
          />
          {compiled.charts.length === 0 ? (
            <p className="text-[12.5px] italic text-slate-500">
              No charts were selected for inclusion in this report.
            </p>
          ) : (
            <div className="space-y-6">
              {compiled.charts.map((chartSnap, idx) => {
                const colLabel = chartSnap.prepared.yColumnName
                  ? `${chartSnap.prepared.xColumnName} vs ${chartSnap.prepared.yColumnName}`
                  : chartSnap.prepared.xColumnName;
                return (
                  <figure
                    key={`${chartSnap.config.type}-${chartSnap.config.xColumnId}-${idx}`}
                    className="break-inside-avoid"
                  >
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <div className="text-[13px] font-bold text-slate-900">
                        Figure {idx + 1}. {chartSnap.config.title}
                      </div>
                      <div className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                        {chartSnap.config.type} · {colLabel}
                      </div>
                    </div>
                    <ReportChartPreviewSvg
                      config={chartSnap.config}
                      prepared={chartSnap.prepared}
                    />
                    <figcaption className="mt-1.5 text-[11.5px] italic leading-relaxed text-slate-600">
                      {chartSnap.caption}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          )}
        </section>
      );

    case 'investigation_case': {
      const c = compiled.investigationCase;
      return (
        <section key={section.key} className="mb-8">
          <SectionHeading
            numberLabel={numStr}
            kicker="Investigation Case Record"
            title={section.title}
          />
          {!c ? (
            <p className="text-[12.5px] italic text-slate-500">
              No investigation case is linked to this report.
            </p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 border border-slate-200 bg-slate-50/70 p-3.5 text-[12px] sm:grid-cols-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Case ID
                  </div>
                  <div className="mt-0.5 font-mono font-bold text-slate-900">
                    {c.id}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Status
                  </div>
                  <div className="mt-0.5 font-semibold uppercase text-slate-900">
                    {c.status.replace(/_/g, ' ')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Priority
                  </div>
                  <div className="mt-0.5 font-semibold uppercase text-slate-900">
                    {c.priority}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Updated
                  </div>
                  <div className="mt-0.5 text-slate-800">
                    {formatReportDateTime(c.updatedAt)}
                  </div>
                </div>
              </div>

              {c.description && (
                <div>
                  <h4 className="mb-1 text-[12px] font-bold uppercase tracking-wider text-slate-900">
                    Case Description
                  </h4>
                  <p className="text-[12.5px] leading-relaxed text-slate-800">
                    {c.description}
                  </p>
                </div>
              )}

              {c.evidence.length > 0 && (
                <div>
                  <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-slate-900">
                    Verified Evidence Board (References Only)
                  </h4>
                  <table className="w-full border-collapse text-left text-[11.5px]">
                    <thead>
                      <tr className="border-y border-slate-300 bg-slate-100 text-slate-900">
                        <th className="px-2.5 py-1.5 font-semibold">Type</th>
                        <th className="px-2.5 py-1.5 font-semibold">Title</th>
                        <th className="px-2.5 py-1.5 font-semibold">
                          Reference
                        </th>
                        <th className="px-2.5 py-1.5 font-semibold">Summary</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {c.evidence.map((ev) => (
                        <tr key={ev.id} className="even:bg-slate-50/60">
                          <td className="px-2.5 py-1.5 font-mono text-[10.5px] uppercase text-teal-800">
                            Verified · {ev.type.replace(/_/g, ' ')}
                          </td>
                          <td className="px-2.5 py-1.5 font-semibold text-slate-900">
                            {ev.title}
                          </td>
                          <td className="px-2.5 py-1.5 font-mono text-[10.5px] text-slate-600">
                            {ev.sourceRef}
                          </td>
                          <td className="px-2.5 py-1.5 text-slate-700">
                            {ev.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {c.notes.length > 0 && (
                <div>
                  <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-slate-900">
                    Investigation Journal (Observations, Hypotheses &amp;
                    Conclusions)
                  </h4>
                  <table className="w-full border-collapse text-left text-[11.5px]">
                    <thead>
                      <tr className="border-y border-slate-300 bg-slate-100 text-slate-900">
                        <th className="w-[24%] px-2.5 py-1.5 font-semibold">
                          Classification
                        </th>
                        <th className="w-[20%] px-2.5 py-1.5 font-semibold">
                          Timestamp
                        </th>
                        <th className="px-2.5 py-1.5 font-semibold">Entry</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {c.notes.map((n) => (
                        <tr key={n.id} className="even:bg-slate-50/60">
                          <td className="px-2.5 py-1.5 font-mono text-[10.5px] font-semibold uppercase text-slate-800">
                            {CASE_NOTE_TYPE_LABELS[n.type]}
                          </td>
                          <td className="px-2.5 py-1.5 text-slate-600">
                            {formatReportDateTime(n.updatedAt)}
                          </td>
                          <td className="px-2.5 py-1.5 leading-relaxed text-slate-800">
                            {n.text}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {c.conclusion.trim() && (
                <div className="border border-teal-300 bg-teal-50/70 p-3.5">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal-900">
                    Documented Case Conclusion ({c.id})
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-900">
                    {c.conclusion.trim()}
                  </p>
                </div>
              )}

              {c.timeline.length > 0 && (
                <div>
                  <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-slate-900">
                    Chronological Activity Timeline
                  </h4>
                  <table className="w-full border-collapse text-left text-[11px]">
                    <thead>
                      <tr className="border-y border-slate-300 bg-slate-100 text-slate-900">
                        <th className="w-[24%] px-2 py-1.5 font-semibold">
                          Timestamp
                        </th>
                        <th className="w-[34%] px-2 py-1.5 font-semibold">
                          Event
                        </th>
                        <th className="px-2 py-1.5 font-semibold">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {c.timeline.slice(-20).map((evt) => (
                        <tr key={evt.id} className="even:bg-slate-50/60">
                          <td className="px-2 py-1.5 text-slate-600">
                            {formatReportDateTime(evt.timestamp)}
                          </td>
                          <td className="px-2 py-1.5 font-medium text-slate-900">
                            {evt.label}
                          </td>
                          <td className="px-2 py-1.5 text-slate-700">
                            {evt.detail ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      );
    }

    case 'ai_interpretation': {
      const { module08Brief, module09CaseAnalyses } = compiled.aiInterpretations;
      return (
        <section key={section.key} className="mb-8">
          <SectionHeading
            numberLabel={numStr}
            kicker="AI-Generated Interpretations · Not Verified Evidence"
            title={section.title}
          />
          {!module08Brief && module09CaseAnalyses.length === 0 ? (
            <p className="text-[12.5px] italic text-slate-500">
              No AI interpretations were selected or available for this dataset.
            </p>
          ) : (
            <div className="space-y-5">
              <div className="border border-amber-300 bg-amber-50/80 p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-800">
                  Epistemic Notice — AI-Generated Content
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-800">
                  All interpretations below were generated by an AI model using
                  aggregate dataset summaries only (0 raw spreadsheet rows).
                  They represent interpretive hypotheses and must not be treated
                  as verified conclusions without independent review.
                </p>
              </div>

              {module08Brief && (
                <div className="space-y-3">
                  <h4 className="text-[12.5px] font-bold text-amber-900">
                    Dataset Investigation Brief ({module08Brief.model}{' '}
                    · {formatReportDateTime(module08Brief.generatedAt)})
                  </h4>
                  <p className="text-[12.5px] leading-relaxed text-slate-800">
                    {module08Brief.data.brief.executiveSummary}
                  </p>
                  {module08Brief.data.brief.dataQualityAssessment && (
                    <p className="text-[12px] leading-relaxed text-slate-700">
                      <span className="font-semibold text-slate-900">
                        Data quality assessment:{' '}
                      </span>
                      {module08Brief.data.brief.dataQualityAssessment}
                    </p>
                  )}
                  {module08Brief.data.connections.length > 0 && (
                    <table className="w-full border-collapse text-left text-[11.5px]">
                      <thead>
                        <tr className="border-y border-slate-300 bg-slate-100 text-slate-900">
                          <th className="px-2.5 py-1.5 font-semibold">
                            Proposed Connection
                          </th>
                          <th className="px-2.5 py-1.5 font-semibold">
                            Evidence Strength
                          </th>
                          <th className="px-2.5 py-1.5 font-semibold">
                            Referenced Findings
                          </th>
                          <th className="px-2.5 py-1.5 font-semibold">
                            Interpretation
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {module08Brief.data.connections.map((conn, idx) => (
                          <tr key={idx} className="even:bg-slate-50/60">
                            <td className="px-2.5 py-1.5 font-semibold text-slate-900">
                              {conn.title}
                            </td>
                            <td className="px-2.5 py-1.5 font-mono text-[10.5px] uppercase text-amber-800">
                              {conn.confidence}
                            </td>
                            <td className="px-2.5 py-1.5 font-mono text-[10.5px] text-slate-600">
                              {conn.findingIds.join(', ') || '—'}
                            </td>
                            <td className="px-2.5 py-1.5 text-slate-700">
                              {conn.possibleInterpretation}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {module09CaseAnalyses.map((rec) => (
                <div
                  key={rec.id}
                  className="space-y-2 border-t border-slate-200 pt-3"
                >
                  <h4 className="text-[12.5px] font-bold text-amber-900">
                    Case AI Interpretation ({rec.model} · Support:{' '}
                    {rec.data.supportType.replace(/_/g, ' ')})
                  </h4>
                  <p className="text-[12.5px] leading-relaxed text-slate-800">
                    {rec.data.evidenceAssessment}
                  </p>
                  {rec.data.possibleConnections.length > 0 && (
                    <div>
                      <div className="text-[11.5px] font-semibold text-slate-900">
                        Possible connections (hypotheses):
                      </div>
                      <ul className="mt-1 space-y-1 pl-4 text-[12px] text-slate-700">
                        {rec.data.possibleConnections.map((item, idx) => (
                          <li key={idx} className="list-disc">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {rec.data.alternativeExplanations.length > 0 && (
                    <div>
                      <div className="text-[11.5px] font-semibold text-slate-900">
                        Alternative explanations:
                      </div>
                      <ul className="mt-1 space-y-1 pl-4 text-[12px] text-slate-700">
                        {rec.data.alternativeExplanations.map((item, idx) => (
                          <li key={idx} className="list-disc">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {rec.data.referencedFindingIds.length > 0 && (
                    <div className="font-mono text-[10.5px] text-slate-500">
                      Referenced finding IDs:{' '}
                      {rec.data.referencedFindingIds.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      );
    }

    case 'limitations_conclusion':
      return (
        <section key={section.key} className="mb-4">
          <SectionHeading
            numberLabel={numStr}
            kicker="Scope Boundaries & Evidence-Supported Conclusions"
            title={section.title}
          />
          <div className="space-y-4">
            <div>
              <h4 className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-slate-900">
                Data Limitations
              </h4>
              <ul className="space-y-1 pl-4 text-[12.5px] leading-relaxed text-slate-700">
                {compiled.limitations.dataLimitations.map((item, idx) => (
                  <li key={idx} className="list-disc marker:text-teal-700">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-slate-900">
                Analytical Limitations
              </h4>
              <ul className="space-y-1 pl-4 text-[12.5px] leading-relaxed text-slate-700">
                {compiled.limitations.analyticalLimitations.map((item, idx) => (
                  <li key={idx} className="list-disc marker:text-teal-700">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-slate-900">
                Unanswered Questions
              </h4>
              <ul className="space-y-1 pl-4 text-[12.5px] leading-relaxed text-slate-700">
                {compiled.limitations.unansweredQuestions.map((item, idx) => (
                  <li key={idx} className="list-disc marker:text-teal-700">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-slate-900">
                Conclusions Supported by Evidence
              </h4>
              <ul className="space-y-1 pl-4 text-[12.5px] leading-relaxed text-slate-900">
                {compiled.limitations.supportedConclusions.map((item, idx) => (
                  <li key={idx} className="list-disc marker:text-teal-700">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      );
  }
}

/**
 * Institutional A4 Document Preview closely mirroring the exported PDF structure
 * (white archival paper, generous margins, cover sheet, running header/footer,
 * numbered sections, tables, vector-matching SVG charts, and epistemic labels).
 */
export function ReportA4Preview({ compiled }: ReportA4PreviewProps) {
  const { report, datasetOverview, investigationCase } = compiled;
  const typeMeta = REPORT_TYPE_META[report.reportType];
  const hasCover = compiled.activeSections.some((s) => s.key === 'cover');
  const contentSections = compiled.activeSections.filter(
    (s) => s.key !== 'cover',
  );
  const sourceFooterLabel = investigationCase
    ? `${datasetOverview.fileName} · Case ${investigationCase.id}`
    : datasetOverview.fileName;

  return (
    <div
      className="space-y-6"
      data-testid="report-a4-preview"
      aria-label="A4 Report Document Preview"
    >
      {!compiled.isActiveDatasetMatch && (
        <div className="flex items-start gap-3 rounded-[var(--dd-radius-sm)] border border-[var(--dd-status-warning-border)] bg-[var(--dd-status-warning-dim)] px-4 py-3 text-xs text-[var(--dd-text-secondary)]">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--dd-status-warning)]"
            aria-hidden="true"
          />
          <div>
            <div className="font-semibold text-[var(--dd-text-primary)]">
              Previous Dataset Snapshot (Read-Only Evidence Isolation)
            </div>
            <p className="mt-0.5 text-[var(--dd-text-secondary)]">
              This report was compiled from{' '}
              <span className="font-mono font-semibold text-[var(--dd-text-primary)]">
                {report.datasetFileName}
              </span>
              , which is no longer the active dataset. It remains frozen to its
              original aggregate snapshot so active and historical evidence are
              never mixed.
            </p>
          </div>
        </div>
      )}

      {/* A4 Cover Sheet */}
      {hasCover && (
        <article
          data-testid="report-cover-sheet"
          className="mx-auto flex min-h-[760px] w-full max-w-[794px] flex-col justify-between rounded-sm border border-slate-300 bg-white px-10 py-12 text-slate-900 shadow-lg sm:px-14 sm:py-14"
        >
          <div>
            <div className="h-[3px] w-14 bg-teal-700" />
            <div className="mt-3 text-xs font-bold tracking-[0.16em] text-slate-900">
              DATA DETECTIVE
            </div>
            <div className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-slate-500">
              Forensic Analytics &amp; Investigation Dossier · {report.id}
            </div>

            <div className="mt-14">
              <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-teal-800">
                {typeMeta.label}
              </div>
              <h3 className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-slate-950 sm:text-[32px]">
                {report.title}
              </h3>
              {report.subtitle && (
                <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
                  {report.subtitle}
                </p>
              )}
              <div className="mt-6 border-b border-slate-300" />
              {report.introDescription && (
                <p className="mt-5 text-[13px] leading-relaxed text-slate-700">
                  {report.introDescription}
                </p>
              )}
            </div>
          </div>

          <div className="mt-12">
            <dl className="divide-y divide-slate-200 border-y border-slate-200 text-[12.5px]">
              <div className="grid grid-cols-[150px_1fr] gap-3 py-2">
                <dt className="font-semibold text-slate-500">Document ID</dt>
                <dd className="font-mono font-semibold text-slate-900">
                  {report.id}
                </dd>
              </div>
              <div className="grid grid-cols-[150px_1fr] gap-3 py-2">
                <dt className="font-semibold text-slate-500">
                  Report Classification
                </dt>
                <dd className="text-slate-900">{typeMeta.label}</dd>
              </div>
              <div className="grid grid-cols-[150px_1fr] gap-3 py-2">
                <dt className="font-semibold text-slate-500">Source Dataset</dt>
                <dd className="font-mono text-slate-900 tabular-nums">
                  {datasetOverview.fileName} (
                  {datasetOverview.rowCount.toLocaleString()} rows ×{' '}
                  {datasetOverview.columnCount.toLocaleString()} cols)
                </dd>
              </div>
              {investigationCase && (
                <div className="grid grid-cols-[150px_1fr] gap-3 py-2">
                  <dt className="font-semibold text-slate-500">
                    Investigation Case
                  </dt>
                  <dd className="text-slate-900">
                    {investigationCase.id} — {investigationCase.title} (
                    {investigationCase.status.replace(/_/g, ' ')})
                  </dd>
                </div>
              )}
              <div className="grid grid-cols-[150px_1fr] gap-3 py-2">
                <dt className="font-semibold text-slate-500">Generated Date</dt>
                <dd className="text-slate-900">
                  {formatReportDate(compiled.generatedAt)}
                </dd>
              </div>
              {report.author && (
                <div className="grid grid-cols-[150px_1fr] gap-3 py-2">
                  <dt className="font-semibold text-slate-500">Prepared By</dt>
                  <dd className="text-slate-900">{report.author}</dd>
                </div>
              )}
              <div className="grid grid-cols-[150px_1fr] gap-3 py-2">
                <dt className="font-semibold text-slate-500">
                  Included Scope
                </dt>
                <dd className="text-slate-900 tabular-nums">
                  {compiled.activeSections.length} section(s) ·{' '}
                  {compiled.findings.length} finding(s) ·{' '}
                  {compiled.charts.length} chart(s)
                </dd>
              </div>
            </dl>
            <div className="mt-5 text-[10.5px] text-slate-500">
              Generated locally in Data Detective from deterministic dataset
              analysis and verified investigation records.
            </div>
          </div>
        </article>
      )}

      {/* A4 Content Sheet */}
      {contentSections.length > 0 ? (
        <article
          data-testid="report-content-sheet"
          className="mx-auto w-full max-w-[794px] rounded-sm border border-slate-300 bg-white px-10 py-10 text-slate-900 shadow-lg sm:px-14"
        >
          {/* Running Header */}
          <header className="mb-8 flex items-center justify-between gap-4 border-b border-slate-300 pb-2.5 text-[10.5px] text-slate-500">
            <span className="truncate font-medium text-slate-600">
              {report.title}
            </span>
            <span className="shrink-0 font-mono">
              Data Detective · {report.id}
            </span>
          </header>

          {/* Body Sections */}
          <div>
            {contentSections.map((section, idx) =>
              renderSectionBody(section, idx + 1, compiled, hasCover),
            )}
          </div>

          {/* Running Footer */}
          <footer className="mt-10 flex items-center justify-between gap-4 border-t border-slate-300 pt-2.5 text-[10.5px] text-slate-500">
            <span className="truncate">{sourceFooterLabel}</span>
            <span className="shrink-0 font-mono tabular-nums">
              A4 Print Preview · Auto-paginated on PDF Export
            </span>
          </footer>
        </article>
      ) : (
        <div className="mx-auto flex max-w-[794px] flex-col items-center justify-center rounded border border-slate-700 bg-slate-900/60 px-6 py-12 text-center text-sm text-slate-400">
          <FileText className="mb-2 h-6 w-6 text-slate-500" />
          Enable at least one content section in the report editor to preview
          the document body.
        </div>
      )}
    </div>
  );
}
