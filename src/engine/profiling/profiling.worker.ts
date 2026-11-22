import type {
  DatasetProfileSummary,
  ImportedDataset,
  MissingValuePolicy,
} from '@/types';
import { profileDataset } from './profileDataset';

export interface ProfilingWorkerRequest {
  readonly type: 'profile-dataset';
  readonly requestId: number;
  readonly dataset: ImportedDataset;
  readonly missingValuePolicy?: MissingValuePolicy;
}

export type ProfilingWorkerResponse =
  | {
      readonly type: 'profile-result';
      readonly requestId: number;
      readonly profile: DatasetProfileSummary;
    }
  | {
      readonly type: 'profile-error';
      readonly requestId: number;
      readonly message: string;
    };

const workerSelf = self as unknown as {
  postMessage: (message: ProfilingWorkerResponse) => void;
  onmessage: ((event: MessageEvent<ProfilingWorkerRequest>) => void) | null;
};

workerSelf.onmessage = (event: MessageEvent<ProfilingWorkerRequest>) => {
  const msg = event.data;
  if (msg.type !== 'profile-dataset') return;

  try {
    const profile = profileDataset(msg.dataset, {
      ...(msg.missingValuePolicy
        ? { missingValuePolicy: msg.missingValuePolicy }
        : {}),
    });

    workerSelf.postMessage({
      type: 'profile-result',
      requestId: msg.requestId,
      profile,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Unexpected error while profiling dataset.';
    workerSelf.postMessage({
      type: 'profile-error',
      requestId: msg.requestId,
      message,
    });
  }
};
