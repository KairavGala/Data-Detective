export {
  buildDefaultSections,
  buildDeterministicExecutiveSummary,
  deriveLimitationsAndConclusions,
  deriveMethodologyItems,
  REPORT_SECTION_LABELS,
  REPORT_TYPE_META,
  REPORT_TYPE_ORDER,
  type ReportTypeDescriptor,
} from './reportTemplates';
export {
  buildDatasetOverviewSnapshot,
  buildFindingSnapshot,
  buildReportSafeFilename,
  compileReportDocument,
  createReportFromSources,
  deleteReportById,
  duplicateReport,
  getChartConfigSignature,
  partitionReportsByDataset,
  refreshReportSnapshot,
  reorderReportSections,
  toggleReportSection,
  updateReportMetadata,
  updateReportSectionTitle,
  updateReportSelections,
  validateChartConfigsForDataset,
  type ActiveReportSources,
  type CreateReportInput,
  type InvalidChartConfigEntry,
  type ValidatedChartHandoffResult,
} from './reportBuilder';
export {
  drawPreparedChartToPdf,
  type PdfChartBox,
} from './pdfChartRenderer';
export {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  generateReportPdf,
  triggerBrowserPdfDownload,
  type GeneratedPdfResult,
} from './pdfExporter';
