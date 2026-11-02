import { Hash } from "./hash.js";
import { rbBuiltinClassName } from "./object.js";
import { TypeError } from "./type-error.js";

/**
 * Mirrors: Ruby's `Kernel#Hash`, `vendor/ruby/v3.3.11/object.c:3834` `rb_Hash`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function kernelHash(arg: unknown): object {
  if (arg == null) return {};
  if (arg instanceof Hash) return arg;
  if (typeof arg === "object" && !Array.isArray(arg)) {
    const toHash = (arg as { toHash?: unknown }).toHash;
    if (typeof toHash === "function") {
      const hash = toHash.call(arg) as unknown;
      if (
        hash instanceof Hash ||
        (hash != null && Object.getPrototypeOf(hash) === Object.prototype)
      ) {
        return hash as object;
      }
      if (hash != null) {
        throw new TypeError(
          `can't convert ${rbBuiltinClassName(arg)} to Hash (${rbBuiltinClassName(arg)}#to_hash gives ${rbBuiltinClassName(hash)})`,
        );
      }
    }
    if (Object.getPrototypeOf(arg) === Object.prototype) return arg;
  }
  if (Array.isArray(arg) && arg.length === 0) return {};
  throw new TypeError(`can't convert ${rbBuiltinClassName(arg)} into Hash`);
}
