import { Hash } from "./hash.js";
import { rbBuiltinClassName } from "./object.js";
import { TypeError } from "./type-error.js";

/**
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#Hash`
 * (`vendor/ruby/v3.3.11/object.c:3834`).
 */
export function kernelHash(arg: unknown): object {
  if (arg == null) return {};
  if (arg instanceof Hash) return arg;
  if (typeof arg === "object" && !Array.isArray(arg)) {
    const toHash = (arg as { toHash?: unknown }).toHash;
    if (typeof toHash === "function") return toHash.call(arg) as object;
    if (Object.getPrototypeOf(arg) === Object.prototype) return arg;
  }
  if (Array.isArray(arg) && arg.length === 0) return {};
  throw new TypeError(`can't convert ${rbBuiltinClassName(arg)} into Hash`);
}
