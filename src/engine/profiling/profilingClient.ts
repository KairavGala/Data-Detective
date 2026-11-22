import type {
  DatasetProfileSummary,
  ImportedDataset,
  MissingValuePolicy,
} from '@/types';
import { profileDataset } from './profileDataset';
import type {
  ProfilingWorkerRequest,
  ProfilingWorkerResponse,
} from './profiling.worker';

export class ProfilingCancelledError extends Error {
  constructor() {
    super('Dataset profiling was cancelled.');
    this.name = 'ProfilingCancelledError';
  }
}

/**
 * Coordinates off-thread Web Worker dataset profiling when supported by the runtime,
 * with automatic cancellation, worker termination on dataset replacement/clear,
 * and direct async fallback for non-worker environments (e.g. jsdom/Vitest).
 */
export class DatasetProfilingClient {
  private worker: Worker | null = null;
  private requestCounter = 0;
  private activeCancel: (() => void) | null = null;

  private canUseWorker(): boolean {
    return typeof Worker !== 'undefined';
  }

  private getOrCreateWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('./profiling.worker.ts', import.meta.url),
        { type: 'module' },
      );
    }
    return this.worker;
  }

  /**
   * Immediately terminates any running worker and rejects any in-flight profiling request.
   */
  cancelAndTerminate(): void {
    const pending = this.activeCancel;
    this.activeCancel = null;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    pending?.();
  }

  async profile(
    dataset: ImportedDataset,
    options: {
      readonly missingValuePolicy?: MissingValuePolicy;
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<DatasetProfileSummary> {
    if (options.signal?.aborted) {
      throw new ProfilingCancelledError();
    }

    if (!this.canUseWorker()) {
      // Yield a microtask so UI loading transitions remain predictable
      await Promise.resolve();
      if (options.signal?.aborted) {
        throw new ProfilingCancelledError();
      }
      return profileDataset(dataset, {
        ...(options.missingValuePolicy
          ? { missingValuePolicy: options.missingValuePolicy }
          : {}),
      });
    }

    // Cancel any previous in-flight worker job before starting a new one
    if (this.activeCancel) {
      this.cancelAndTerminate();
    }

    const requestId = ++this.requestCounter;
    const worker = this.getOrCreateWorker();

    return new Promise<DatasetProfileSummary>((resolve, reject) => {
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
        reject(new ProfilingCancelledError());
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
            'The background profiling worker stopped unexpectedly while inspecting this dataset.',
          ),
        );
      };

      const handleMessage = (event: MessageEvent<ProfilingWorkerResponse>) => {
        if (settled) return;
        const msg = event.data;
        if (msg.requestId !== requestId) return;

        settled = true;
        cleanup();

        // Terminate idle profiling worker after completion to reclaim structured-clone memory
        if (this.worker) {
          this.worker.terminate();
          this.worker = null;
        }

        if (msg.type === 'profile-error') {
          reject(new Error(msg.message));
          return;
        }

        resolve(msg.profile);
      };

      this.activeCancel = rejectCancelled;
      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      options.signal?.addEventListener('abort', handleAbort, { once: true });

      const request: ProfilingWorkerRequest = {
        type: 'profile-dataset',
        requestId,
        dataset,
        ...(options.missingValuePolicy
          ? { missingValuePolicy: options.missingValuePolicy }
          : {}),
      };
      worker.postMessage(request);
    });
  }
}
