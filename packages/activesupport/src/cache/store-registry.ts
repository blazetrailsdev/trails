import type { CacheStore } from "./index.js";

/** @noRailsEquivalent PERMANENT */
const STORE_CLASSES = new Map<string, new (...args: any[]) => any>();

/** @noRailsEquivalent PERMANENT */
export function registerStoreClass(store: string, klass: new (...args: any[]) => any): void {
  STORE_CLASSES.set(store, klass);
}

/** @noRailsEquivalent PERMANENT */
export function lookupStoreClass(store: string): (new (...args: any[]) => CacheStore) | undefined {
  return STORE_CLASSES.get(store);
}
