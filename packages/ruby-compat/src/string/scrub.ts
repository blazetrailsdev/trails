import { ArgumentError } from "../argument-error.js";
import { bytes, sequenceLength } from "./bytes.js";

/**
 * `String#scrub` (`vendor/ruby/string.c:11354` `str_scrub`, over
 * `enc_str_scrub` at `:11104`): every invalid UTF-8 byte sequence of `str`,
 * in the byte convention {@link bytes} documents, replaced by `repl`, by what
 * `block` answers for it, or by `"�"`. A truncated but otherwise
 * well-formed sequence is one invalid chunk; any other invalid byte stands
 * alone.
 *
 * @noRailsEquivalent PERMANENT
 */
export function scrub(
  str: string,
  repl: string | null = null,
  block?: (bytes: string) => string,
): string {
  if (block && repl != null) throw new ArgumentError("both of block and replacement given");
  const b = bytes(str);
  let result = "";
  let i = 0;
  while (i < b.length) {
    const len = sequenceLength(b, i);
    if (len > 0) {
      result += new TextDecoder().decode(Uint8Array.from(b.slice(i, i + len)));
      i += len;
      continue;
    }
    const clen = -len;
    const bad = String.fromCharCode(...b.slice(i, i + clen).map((x) => 0xdc00 + x));
    result += block ? block(bad) : (repl ?? "�");
    i += clen;
  }
  return result;
}
