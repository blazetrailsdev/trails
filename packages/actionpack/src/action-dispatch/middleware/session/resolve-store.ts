// Port of `ActionDispatch::Session.resolve_store` (`action_dispatch.rb:113-124`).
import { camelize } from "@blazetrails/activesupport";
import { AbstractStore, AbstractSecureStore } from "./abstract-store.js";
import { CookieStore } from "./cookie-store.js";
import { CacheStore } from "./cache-store.js";
import { MemCacheStore } from "./mem-cache-store.js";

/**
 * The constant table `resolve_store` reads, keyed by the camelized store name.
 * Rails calls `ActionDispatch::Session.const_get`, so it resolves whatever is
 * defined in that namespace — the five stores `action_dispatch.rb:107-111`
 * autoloads, and any an app or extension adds. ESM has no namespace to reopen
 * and no `const_missing` seam, so the namespace is this map, seeded with the
 * autoloaded five and open for a custom store to register into. Mirrors
 * {@link controllerConstants}, the same stand-in for the namespace
 * `Request#controller_class_for` constantizes against.
 *
 * @noRailsEquivalent PERMANENT
 */
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
    // Rails interpolates `session_store.inspect`; a trails Ruby Symbol value
    // already carries its leading colon, so the value renders as-is.
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
