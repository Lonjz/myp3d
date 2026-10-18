import { createContext, useContext } from 'react';
import type { QueueItem, QueueItemUpdate } from '../../api/queueApi';

export interface DownloadQueueContextValue {
  items: QueueItem[] | null;
  active: boolean;
  busy: boolean;
  start: (ids?: number[]) => Promise<boolean>;
  stop: () => Promise<boolean>;
  clearDone: () => Promise<boolean>;
  remove: (id: number) => Promise<boolean>;
  update: (id: number, changes: QueueItemUpdate) => Promise<boolean>;
}

export const DownloadQueueContext = createContext<DownloadQueueContextValue | undefined>(undefined);

export const isQueueItemActive = (item: QueueItem) => item.status === 'queued' || item.status === 'running';

export function useDownloadQueue(): DownloadQueueContextValue {
  const context = useContext(DownloadQueueContext);
  if (!context) {
    throw new Error('useDownloadQueue must be used within a DownloadQueueProvider');
  }
  return context;
}
