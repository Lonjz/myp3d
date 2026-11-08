import type { QueueItem, QueueItemUpdate } from '../../api/queueApi';
import { createStrictContext } from '../../utils/strictContext';

export interface DownloadQueueContextValue {
  items: QueueItem[] | null;
  loadFailed: boolean;
  reload: () => Promise<void>;
  active: boolean;
  busy: boolean;
  start: (ids?: number[]) => Promise<boolean>;
  stop: () => Promise<boolean>;
  cancel: (id: number) => Promise<boolean>;
  clearDone: () => Promise<boolean>;
  remove: (id: number) => Promise<boolean>;
  update: (id: number, changes: QueueItemUpdate) => Promise<boolean>;
}

export const [DownloadQueueContext, useDownloadQueue] = createStrictContext<DownloadQueueContextValue>('useDownloadQueue');

export const isQueueItemActive = (item: QueueItem) => item.status === 'queued' || item.status === 'running';
