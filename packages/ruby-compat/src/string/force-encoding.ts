import { Encoding } from "../encoding.js";

/**
 * Ruby core `String#force_encoding` (`vendor/ruby/string.c:11005`
 * `rb_str_force_encoding`), which Rails inherits rather than defines.
 *
 * `rb_to_encoding` (`vendor/ruby/encoding.c:323`) resolves the argument, so the
 * accepted names are {@link Encoding.find}'s registry rather than
 * `TextDecoder`'s WHATWG labels, and an unregistered name raises `ArgumentError`
 * from there. A JS string carries no encoding tag, so the two binary names —
 * which name bytes rather than a character set — return the receiver unchanged.
 *
 * @noRailsEquivalent PERMANENT
 */
export function forceEncoding(string: string, encoding: string | Encoding): string {
  const enc = Encoding.find(encoding);
  if (enc.decoderLabel === null) return string;

  const bytes = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) bytes[i] = string.charCodeAt(i) & 0xff;
  try {
    return new TextDecoder(enc.decoderLabel).decode(bytes);
  } catch {
    return string;
  }
}
