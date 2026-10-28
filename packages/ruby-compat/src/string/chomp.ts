/**
 * With no separator (or `undefined`), removes a single trailing `\n`, `\r\n`,
 * or `\r`. With a separator string, removes that suffix if present. An
 * empty-string separator (Ruby paragraph mode) strips every trailing `\n`,
 * each with the `\r` before it (`vendor/ruby/v3.3.11/string.c:9682`). A `"\n"` separator is the *smart newline* case, not a literal
 * suffix strip: `chompped_length` (`vendor/ruby/v3.3.11/string.c:9700-9730`) removes a
 * trailing `"\r\n"`, `"\n"` or a lone `"\r"`, so `chomp(str, "\n")` is the
 * same operation as `chomp(str)`. A `Uint8Array` is an ASCII-8BIT String,
 * chomped by the smart-newline rule over its bytes (no other separator is ported for bytes).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `String#chomp`
 * (`vendor/ruby/v3.3.11/string.c:9786`), which Rails inherits rather than defines.
 */
export function chomp<T extends string | Uint8Array>(str: T, separator?: string): T {
  if (str instanceof Uint8Array && (separator === undefined || separator === "\n")) {
    let len = str.length;
    if (len > 0 && str[len - 1] === 0x0a) len--;
    if (len > 0 && str[len - 1] === 0x0d) len--;
    return str.subarray(0, len) as T;
  }
  const text = str as string;
  if (separator === undefined) return text.replace(/(\r\n|\r|\n)$/, "") as T;
  if (separator === "") return text.replace(/(?:\r?\n)+$/, "") as T;
  if (separator === "\n") return text.replace(/(\r\n|\r|\n)$/, "") as T;
  return (text.endsWith(separator) ? text.slice(0, text.length - separator.length) : text) as T;
}
