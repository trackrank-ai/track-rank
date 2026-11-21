function collectionStorage<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("trackrank-pending-collections", 1);
    open.onupgradeneeded = () => { open.result.createObjectStore("collections"); };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction("collections", mode);
      const request = operation(transaction.objectStore("collections"));
      transaction.oncomplete = () => { db.close(); resolve(request.result); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  });
}

export function readPendingCollection<T>(key: string): Promise<T | undefined> {
  return collectionStorage("readonly", store => store.get(key));
}

export async function savePendingCollection<T>(key: string, value: T | null) {
  if (value === null) await collectionStorage("readwrite", store => store.delete(key));
  else await collectionStorage("readwrite", store => store.put(value, key));
}
