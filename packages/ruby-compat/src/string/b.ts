import { bytes } from "./bytes.js";

/**
 * `String#b` (`vendor/ruby/v3.3.11/string.c:10955` `rb_str_b`) — a copy of the
 * receiver tagged `ASCII-8BIT`, which Rails inherits rather than defines.
 * `str_replace_shared_without_enc` shares the receiver's bytes and leaves the
 * receiver itself untouched, which is the whole difference from
 * {@link forceEncoding}'s in-place `rb_str_force_encoding`.
 *
 * An ASCII-8BIT String is a `Uint8Array` (CLAUDE.md, "A String has no
 * encoding tag either"), so the copy is the receiver's bytes: a JS string's
 * UTF-8 bytes, trails' external encoding, with an invalid byte carried as a
 * lone surrogate (`bytes.ts`) answering that byte, and a `Uint8Array`'s own.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `String#b`
 * (`vendor/ruby/v3.3.11/string.c:10955` `rb_str_b`).
 */
export function b(str: string | Uint8Array): Uint8Array {
  return Uint8Array.from(str instanceof Uint8Array ? str : bytes(String(str)));
}
