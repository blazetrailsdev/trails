// Port of `ActionDispatch::Session.resolve_store` (`action_dispatch.rb:113-124`).
import { camelize } from "@blazetrails/activesupport";
import { AbstractStore, AbstractSecureStore } from "./abstract-store.js";
import { CookieStore } from "./cookie-store.js";
import { CacheStore } from "./cache-store.js";
import { MemCacheStore } from "./mem-cache-store.js";

/**
 * Rails resolves a `:cookie_store` symbol with `const_get` against the
 * `ActionDispatch::Session` namespace, which Zeitwerk autoloads. ESM resolves
 * nothing from a name, so the namespace the constant is looked up in is this
 * table — the same set `action_dispatch.rb:107-111` autoloads.
 *
 * @noRailsEquivalent PERMANENT — the JS stand-in for the `Session` namespace
 * `const_get` reads. See CLAUDE.md, "Call-time constant resolution".
 */
const constants: Record<string, unknown> = {
  AbstractStore,
  AbstractSecureStore,
  CookieStore,
  MemCacheStore,
  CacheStore,
};

export function resolveStore(sessionStore: string): unknown {
  const name = camelize(sessionStore.replace(/^:/, ""));
  const store = constants[name];
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
