const DATABASE = 'myp3d';
const STORE = 'appearance';
const IMAGE_KEY = 'background';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export const backgroundImage = {
  async load(): Promise<Blob | null> {
    const image = await withStore<Blob | undefined>('readonly', (store) => store.get(IMAGE_KEY));
    return image ?? null;
  },

  async save(image: Blob): Promise<void> {
    await withStore('readwrite', (store) => store.put(image, IMAGE_KEY));
  },

  async clear(): Promise<void> {
    await withStore('readwrite', (store) => store.delete(IMAGE_KEY));
  },
};
