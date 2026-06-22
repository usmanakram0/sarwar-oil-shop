const DB_NAME = 'sarwar-oil-shop';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open IndexedDB'));
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
  });

  return dbPromise;
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const request = fn(store);

        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
        request.onsuccess = () => resolve(request.result as T);

        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      }),
  );
}

export async function idbGet(key: string): Promise<string | null> {
  const row = await runTransaction<{ key: string; value: string } | undefined>(
    'readonly',
    (store) => store.get(key),
  );
  return row?.value ?? null;
}

export async function idbSet(key: string, value: string): Promise<void> {
  await runTransaction('readwrite', (store) => store.put({ key, value }));
}

export async function idbDelete(key: string): Promise<void> {
  await runTransaction('readwrite', (store) => store.delete(key));
}

export async function idbGetKeysByPrefix(prefix: string): Promise<string[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const keys: string[] = [];
    const request = store.openCursor();

    request.onerror = () => reject(request.error ?? new Error('IndexedDB cursor failed'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(keys);
        return;
      }
      const row = cursor.value as { key: string };
      if (row.key.startsWith(prefix)) keys.push(row.key);
      cursor.continue();
    };
  });
}

export async function idbDeleteByPrefix(prefix: string): Promise<void> {
  const keys = await idbGetKeysByPrefix(prefix);
  await Promise.all(keys.map((key) => idbDelete(key)));
}

export async function idbEstimateBytesForPrefix(prefix: string): Promise<number> {
  const keys = await idbGetKeysByPrefix(prefix);
  let total = 0;
  for (const key of keys) {
    const value = await idbGet(key);
    if (value) total += (key.length + value.length) * 2;
  }
  return total;
}

export async function getIndexedDbQuota(): Promise<{
  used: number;
  total: number;
}> {
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage ?? 0,
      total: estimate.quota ?? 250 * 1024 * 1024,
    };
  }
  return { used: 0, total: 250 * 1024 * 1024 };
}
