/**
 * `String#chomp` — a Ruby *core* method, not a Rails extension, so it has no
 * `core_ext/string/*.rb` counterpart. It lives beside `succ.ts`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `String#chomp`
 * (`vendor/ruby/string.c:9786` `rb_str_chomp`, bound at `:12228`), which Rails
 * inherits rather than defines.
 */

/**
 * Ruby `String#chomp` (`vendor/ruby/string.c:9786` `rb_str_chomp`, bound at
 * `:12228`) — a Ruby *core* method, not a Rails extension, so it has no
 * `core_ext/string/*.rb` counterpart; it lives beside `succ.ts`.
 *
 * With no separator (or `undefined`), removes a single trailing `\n`, `\r\n`, or `\r`. With a
 * separator string, removes that suffix if present. Empty-string separator
 * (Ruby paragraph mode) strips all trailing newline characters. A `"\n"`
 * separator also eats a preceding CR — `"x\r\n".chomp("\n") == "x"` — which is
 * `chompped_length`'s `\r\n` arm (`vendor/ruby/string.c:9651`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `String#chomp`
 * (`vendor/ruby/string.c:9786`), which Rails inherits rather than defines.
 */
export function chomp(str: string, separator?: string): string {
  if (separator === undefined) return str.replace(/(\r\n|\r|\n)$/, "");
  if (separator === "") return str.replace(/[\r\n]+$/, "");
  if (separator === "\n") return str.replace(/\r?\n$/, "");
  return str.endsWith(separator) ? str.slice(0, str.length - separator.length) : str;
}
