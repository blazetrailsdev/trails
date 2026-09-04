/**
 * `String#b` (`vendor/ruby/string.c:10955` `rb_str_b`) — a copy of the
 * receiver tagged `ASCII-8BIT`, which Rails inherits rather than defines.
 * `str_replace_shared_without_enc` shares the receiver's bytes and leaves the
 * receiver itself untouched, which is the whole difference from
 * {@link forceEncoding}'s in-place `rb_str_force_encoding`.
 *
 * A JS string carries no encoding tag, so an ASCII-8BIT String is spelled here
 * as one character per byte with every code unit below `0x100` — the
 * convention `IO#write` (`io.ts`) and {@link forceEncoding} already read. The
 * receiver's bytes are therefore its UTF-8 bytes, trails' external encoding,
 * and a receiver that is already in byte form is 7-bit ASCII in every call
 * site Rails makes, where the transcoding is the identity.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `String#b`
 * (`vendor/ruby/string.c:10955` `rb_str_b`).
 */
export function b(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let str2 = "";
  for (const byte of bytes) str2 += String.fromCharCode(byte);
  return str2;
}
