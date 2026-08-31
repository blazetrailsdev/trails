import { KeyError } from "./key-error.js";
import { isSymbol } from "./symbol.js";

/**
 * Ruby `Hash#fetch` (`vendor/ruby/hash.c:2176` `rb_hash_fetch_m`), both arms:
 * with a second argument the stored value or that default, and with one
 * argument the stored value or a `KeyError`. Ruby's block form is the third
 * arm and is not ported — no call site yields the missing key through this
 * export.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#fetch` (`vendor/ruby/hash.c:2176`).
 */
export function fetch<T>(hash: Record<string, unknown>, key: string): T;
/**
 * The two-argument arm: the STORED value whenever the key exists — including a
 * stored `nil` or `false` — and otherwise `defaultValue`, which is what `??`
 * gets wrong.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#fetch` (`vendor/ruby/hash.c:2176`).
 */
export function fetch<T>(hash: Record<string, unknown>, key: string, defaultValue: T): T;
/**
 * `rb_hash_fetch_m` dispatches on `argc`, so the two arms share one body over a
 * rest parameter: an absent second argument is the raising arm, and an
 * explicitly-passed `undefined` is a default, exactly as Ruby's `nil` is.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#fetch` (`vendor/ruby/hash.c:2176`).
 */
export function fetch(hash: Record<string, unknown>, key: string, ...rest: unknown[]): unknown {
  if (hasKey(hash, key)) {
    return hash[key];
  } else if (rest.length === 0) {
    throw new KeyError(`key not found: ${strEllipsize(inspectKey(key), 65)}`);
  } else {
    return rest[0];
  }
}

/**
 * Ruby `Hash#key?` / `#has_key?` (`vendor/ruby/hash.c:3671`
 * `rb_hash_has_key`) — membership, which for a stored `nil` or `false` is the
 * question `hash[key] !== undefined` cannot answer.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#key?` (`vendor/ruby/hash.c:3671`).
 */
export function hasKey(hash: Record<string, unknown>, key: string): boolean {
  /* `vendor/ruby/hash.c:3671` `rb_hash_has_key` reads the hash table through
     `hash_stlike_lookup`, never an ancestor: a Ruby Hash has no prototype
     chain, so `"toString" in {}` is an answer Ruby never gives. */
  return Object.hasOwn(hash, key);
}

function inspectKey(key: string): string {
  return isSymbol(key) ? key : JSON.stringify(key);
}

const ELLIPSIS = "...";

/**
 * `rb_str_ellipsize` (`vendor/ruby/string.c:11027`), the ASCII-compatible arm
 * `rb_hash_fetch_m` reaches with `len` 65: a longer description keeps its first
 * `len - 3` characters and ends in the ellipsis, so the whole is `len` wide.
 */
function strEllipsize(str: string, len: number): string {
  if (len >= str.length) return str;
  if (len <= ELLIPSIS.length) return ELLIPSIS;
  return str.slice(0, len - ELLIPSIS.length) + ELLIPSIS;
}
