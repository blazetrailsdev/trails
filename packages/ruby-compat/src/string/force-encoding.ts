import { Encoding } from "../encoding.js";

/**
 * Ruby core `String#force_encoding` (`vendor/ruby/v3.3.11/string.c:11005`
 * `rb_str_force_encoding`), which Rails inherits rather than defines.
 *
 * `rb_to_encoding` (`vendor/ruby/v3.3.11/encoding.c:323`) resolves the argument, so the
 * accepted names are {@link Encoding.find}'s registry rather than
 * `TextDecoder`'s WHATWG labels, and an unregistered name raises `ArgumentError`
 * from there. A JS string carries no encoding tag, so the two binary names —
 * which name bytes rather than a character set — return the receiver unchanged.
 * `str_to_encoding` answers a NULL `rb_encoding *` for the `internal` alias
 * while `Encoding.default_internal` is unset (`encoding.c:317-321`), and
 * `rb_str_force_encoding` leaves the receiver alone for it, so a `null` from
 * {@link Encoding.find} is the same no-op here.
 *
 * @noRailsEquivalent PERMANENT
 */
export function forceEncoding(string: string, encoding: string | Encoding | null): string {
  const enc = encoding == null ? null : Encoding.find(encoding);
  if (enc === null || enc.decoderLabel === null) return string;

  const bytes = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) bytes[i] = string.charCodeAt(i) & 0xff;
  try {
    return new TextDecoder(enc.decoderLabel).decode(bytes);
  } catch {
    return string;
  }
}

/**
 * Ruby core `String#valid_encoding?` (`vendor/ruby/v3.3.11/string.c:10999`
 * `rb_str_valid_encoding_p`): whether the receiver's bytes are not
 * `ENC_CODERANGE_BROKEN` in its encoding. A JS string carries no encoding tag,
 * so the encoding {@link forceEncoding} would tag it with is passed alongside the
 * one-character-per-byte string; a binary encoding, or one `TextDecoder` has no
 * label for, accepts every byte sequence.
 *
 * @noRailsEquivalent PERMANENT
 */
export function isValidEncoding(string: string, encoding: string | Encoding | null): boolean {
  const enc = encoding == null ? null : Encoding.find(encoding);
  if (enc === null || enc.decoderLabel === null) return true;

  const bytes = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) bytes[i] = string.charCodeAt(i) & 0xff;
  try {
    new TextDecoder(enc.decoderLabel, { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}
