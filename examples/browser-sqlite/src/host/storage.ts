const NAME = "trails-browser";
const STORE = "databases";

let opened: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
  return (opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB did not open"));
  }));
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const request = fn(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

/**
 * An example's SQLite file, from IndexedDB: `localStorage` holds strings
 * only, and its few megabytes stop a growing database from being saved.
 */
export async function loadDatabase(example: string): Promise<Uint8Array | null> {
  try {
    const bytes = await run<unknown>("readonly", (store) => store.get(example));
    return bytes instanceof Uint8Array ? bytes : null;
  } catch {
    return null;
  }
}

/** Stores an example's SQLite file, or deletes it for `null`. */
export async function saveDatabase(example: string, bytes: Uint8Array | null): Promise<void> {
  await run<unknown>(
    "readwrite",
    (store) =>
      (bytes === null ? store.delete(example) : store.put(bytes.slice(), example)) as IDBRequest,
  );
}
