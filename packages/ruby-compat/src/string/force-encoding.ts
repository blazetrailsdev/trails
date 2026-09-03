import { ArgumentError } from "../argument-error.js";
import { Encoding } from "../encoding.js";

/**
 * Ruby core `String#force_encoding` (`vendor/ruby/string.c:11005`
 * `rb_str_force_encoding`), which Rails inherits rather than defines.
 *
 * `rb_to_encoding` (`vendor/ruby/encoding.c:323`) is what resolves the
 * argument, so the accepted names are {@link Encoding.find}'s registry — not
 * `TextDecoder`'s WHATWG labels. A name Ruby does not register raises there;
 * here the buffer is returned unchanged, standing in for the binary string
 * `force_encoding("BINARY")` leaves behind.
 *
 * @noRailsEquivalent PERMANENT
 */
export function forceEncoding(string: string, encoding: string | Encoding): string {
  let enc: Encoding;
  try {
    enc = Encoding.find(encoding);
  } catch (error) {
    if (!(error instanceof ArgumentError)) throw error;
    return string;
  }
  if (enc.decoderLabel === null) return string;

  const bytes = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) bytes[i] = string.charCodeAt(i) & 0xff;
  try {
    return new TextDecoder(enc.decoderLabel).decode(bytes);
  } catch {
    return string;
  }
}
