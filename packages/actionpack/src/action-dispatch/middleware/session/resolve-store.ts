import { camelize } from "@blazetrails/activesupport";
import { AbstractStore, AbstractSecureStore } from "./abstract-store.js";
import { CookieStore } from "./cookie-store.js";
import { CacheStore } from "./cache-store.js";
import { MemCacheStore } from "./mem-cache-store.js";

/** @noRailsEquivalent PERMANENT */
export const sessionStoreConstants = new Map<string, unknown>([
  ["AbstractStore", AbstractStore],
  ["AbstractSecureStore", AbstractSecureStore],
  ["CookieStore", CookieStore],
  ["MemCacheStore", MemCacheStore],
  ["CacheStore", CacheStore],
]);

export function resolveStore(sessionStore: string): unknown {
  const name = camelize(sessionStore.startsWith(":") ? sessionStore.slice(1) : sessionStore);
  const store = sessionStoreConstants.get(name);
  if (store === undefined) {
    throw new Error(
      `Unable to resolve session store ${sessionStore}.\n` +
        `\n` +
        `${sessionStore} resolves to ActionDispatch::Session::${name},\n` +
        `but that class is undefined.\n` +
        `\n` +
        `Is ${sessionStore} spelled correctly, and are any necessary gems installed?\n`,
    );
  }
  return store;
}
