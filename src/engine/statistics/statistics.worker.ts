import type {
  DatasetProfileSummary,
  DatasetStatisticalSummary,
  ImportedDataset,
} from '@/types';
import {
  analyzeDatasetStatistics,
  type AnalyzeDatasetStatisticsOptions,
} from './analyzeDatasetStatistics';

export interface StatisticsWorkerRequest {
  readonly type: 'analyze-statistics';
  readonly requestId: number;
  readonly dataset: ImportedDataset;
  readonly profile: DatasetProfileSummary;
  readonly options?: AnalyzeDatasetStatisticsOptions;
}

export type StatisticsWorkerResponse =
  | {
      readonly type: 'statistics-result';
      readonly requestId: number;
      readonly summary: DatasetStatisticalSummary;
    }
  | {
      readonly type: 'statistics-error';
      readonly requestId: number;
      readonly message: string;
    };

const workerSelf = self as unknown as {
  postMessage: (message: StatisticsWorkerResponse) => void;
  onmessage: ((event: MessageEvent<StatisticsWorkerRequest>) => void) | null;
};

workerSelf.onmessage = (event: MessageEvent<StatisticsWorkerRequest>) => {
  const msg = event.data;
  if (msg.type !== 'analyze-statistics') return;

  try {
    const summary = analyzeDatasetStatistics(
      msg.dataset,
      msg.profile,
      msg.options,
    );

    workerSelf.postMessage({
      type: 'statistics-result',
      requestId: msg.requestId,
      summary,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Unexpected error while computing dataset statistics.';
    workerSelf.postMessage({
      type: 'statistics-error',
      requestId: msg.requestId,
      message,
    });
  }
};
