const DB_NAME = 'iceflow-offline';
const STORE = 'mutations';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface OfflineMutation {
  id?: number;
  method: string;
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  createdAt: string;
}

export async function queueOfflineMutation(
  mut: Omit<OfflineMutation, 'id' | 'createdAt'>
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add({ ...mut, createdAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listOfflineMutations(): Promise<OfflineMutation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as OfflineMutation[]);
    req.onerror = () => reject(req.error);
  });
}

export async function clearMutation(id: number) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function flushOfflineQueue(accessToken: string) {
  const items = await listOfflineMutations();
  for (const item of items) {
    try {
      await fetch(`/api${item.url.startsWith('/') ? item.url : '/' + item.url}`, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...(item.headers || {}),
        },
        body: item.data != null ? (typeof item.data === 'string' ? item.data : JSON.stringify(item.data)) : undefined,
      });
      if (item.id != null) await clearMutation(item.id);
    } catch {
      break; // stop on first failure; retry later
    }
  }

  // Also push sync envelope
  try {
    await fetch('/api/sync/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        clientId: localStorage.getItem('iceflow_client_id') || crypto.randomUUID(),
        events: items.map((i) => ({
          entityType: 'OfflineMutation',
          entityId: String(i.id),
          operation: 'create',
          payload: i,
        })),
      }),
    });
  } catch {
    /* ignore */
  }
}

export function ensureClientId() {
  if (!localStorage.getItem('iceflow_client_id')) {
    localStorage.setItem('iceflow_client_id', crypto.randomUUID());
  }
}
