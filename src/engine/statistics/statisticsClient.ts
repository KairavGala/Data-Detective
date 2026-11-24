import type {
  DatasetProfileSummary,
  DatasetStatisticalSummary,
  ImportedDataset,
} from '@/types';
import {
  analyzeDatasetStatistics,
  type AnalyzeDatasetStatisticsOptions,
} from './analyzeDatasetStatistics';
import type {
  StatisticsWorkerRequest,
  StatisticsWorkerResponse,
} from './statistics.worker';

export class StatisticsCancelledError extends Error {
  constructor() {
    super('Statistical analysis was cancelled.');
    this.name = 'StatisticsCancelledError';
  }
}

/**
 * Coordinates off-thread Web Worker statistical analysis when supported by the
 * runtime, with automatic cancellation, worker termination on dataset replacement
 * or clear, and direct async fallback for non-worker environments (e.g. jsdom/Vitest).
 */
export class DatasetStatisticsClient {
  private worker: Worker | null = null;
  private requestCounter = 0;
  private activeCancel: (() => void) | null = null;

  private canUseWorker(): boolean {
    return typeof Worker !== 'undefined';
  }

  private getOrCreateWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('./statistics.worker.ts', import.meta.url),
        { type: 'module' },
      );
    }
    return this.worker;
  }

  cancelAndTerminate(): void {
    const pending = this.activeCancel;
    this.activeCancel = null;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    pending?.();
  }

  async analyze(
    dataset: ImportedDataset,
    profile: DatasetProfileSummary,
    options: AnalyzeDatasetStatisticsOptions & {
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<DatasetStatisticalSummary> {
    if (options.signal?.aborted) {
      throw new StatisticsCancelledError();
    }

    const engineOptions: AnalyzeDatasetStatisticsOptions = {
      ...(options.maxModes !== undefined ? { maxModes: options.maxModes } : {}),
      ...(options.maxCategories !== undefined
        ? { maxCategories: options.maxCategories }
        : {}),
      ...(options.maxTiedExtrema !== undefined
        ? { maxTiedExtrema: options.maxTiedExtrema }
        : {}),
    };

    if (!this.canUseWorker()) {
      await Promise.resolve();
      if (options.signal?.aborted) {
        throw new StatisticsCancelledError();
      }
      return analyzeDatasetStatistics(dataset, profile, engineOptions);
    }

    if (this.activeCancel) {
      this.cancelAndTerminate();
    }

    const requestId = ++this.requestCounter;
    const worker = this.getOrCreateWorker();

    return new Promise<DatasetStatisticalSummary>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        options.signal?.removeEventListener('abort', handleAbort);
        if (this.activeCancel === rejectCancelled) {
          this.activeCancel = null;
        }
      };

      const rejectCancelled = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new StatisticsCancelledError());
      };

      const handleAbort = () => {
        this.cancelAndTerminate();
      };

      const handleError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        this.cancelAndTerminate();
        reject(
          new Error(
            'The background statistical worker stopped unexpectedly while analyzing this dataset.',
          ),
        );
      };

      const handleMessage = (
        event: MessageEvent<StatisticsWorkerResponse>,
      ) => {
        if (settled) return;
        const msg = event.data;
        if (msg.requestId !== requestId) return;

        settled = true;
        cleanup();

        if (this.worker) {
          this.worker.terminate();
          this.worker = null;
        }

        if (msg.type === 'statistics-error') {
          reject(new Error(msg.message));
          return;
        }

        resolve(msg.summary);
      };

      this.activeCancel = rejectCancelled;
      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      options.signal?.addEventListener('abort', handleAbort, { once: true });

      const request: StatisticsWorkerRequest = {
        type: 'analyze-statistics',
        requestId,
        dataset,
        profile,
        options: engineOptions,
      };
      worker.postMessage(request);
    });
  }
}
