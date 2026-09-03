/**
 * With no separator (or `undefined`), removes a single trailing `\n`, `\r\n`,
 * or `\r`. With a separator string, removes that suffix if present. An
 * empty-string separator (Ruby paragraph mode) strips all trailing newline
 * characters. A `"\n"` separator is the *smart newline* case, not a literal
 * suffix strip: `chompped_length` (`vendor/ruby/string.c:9700-9730`) removes a
 * trailing `"\r\n"`, `"\n"` or a lone `"\r"`, so `chomp(str, "\n")` is the
 * same operation as `chomp(str)`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `String#chomp`
 * (`vendor/ruby/string.c:9786`), which Rails inherits rather than defines.
 */
export function chomp(str: string, separator?: string): string {
  if (separator === undefined) return str.replace(/(\r\n|\r|\n)$/, "");
  if (separator === "") return str.replace(/[\r\n]+$/, "");
  if (separator === "\n") return str.replace(/(\r\n|\r|\n)$/, "");
  return str.endsWith(separator) ? str.slice(0, str.length - separator.length) : str;
}
