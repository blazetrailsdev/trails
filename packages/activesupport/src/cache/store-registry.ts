import { LoadError } from "@blazetrails/ruby-compat";

import type { CacheStore } from "./index.js";

/** @noRailsEquivalent PERMANENT */
const STORE_CLASSES = new Map<string, new (...args: any[]) => any>();

/** @noRailsEquivalent PERMANENT */
export function registerStoreClass(store: string, klass: new (...args: any[]) => any): void {
  STORE_CLASSES.set(store, klass);
}

/** @noRailsEquivalent PERMANENT */
export function lookupStoreClass(store: string): new (...args: any[]) => CacheStore {
  const klass = STORE_CLASSES.get(store);
  if (klass === undefined) {
    throw new LoadError(`cannot load such file -- active_support/cache/${store.slice(1)}`);
  }
  return klass;
}
