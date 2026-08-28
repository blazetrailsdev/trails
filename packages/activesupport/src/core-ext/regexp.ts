/**
 * Ruby's `Regexp.escape` (`re.c` `rb_reg_s_quote`): the metacharacters of
 * `string` escaped so it matches itself literally when spliced into a pattern.
 *
 * @noRailsEquivalent PERMANENT — `Regexp.escape` is Ruby CORE, implemented in
 * C, and JS has no `RegExp.escape`, so the ports that need it cannot call it.
 * It lives beside Rails' one Regexp core-ext (`core_ext/regexp.rb`'s
 * `multiline?`, which JS answers natively as `RegExp#multiline`) so there is
 * one implementation rather than a copy per call site.
 *
 * Escapes what a JS `RegExp` gives meaning to, which is a SUBSET of what MRI
 * escapes: MRI also escapes `-`, `#` and whitespace, and `\-` / `\#` / `\ `
 * are invalid identity escapes under a `u`-flagged JS pattern
 * (`new RegExp("a\\-b", "u")` throws), which `ParameterFilter#precompileFilters`
 * builds. All three are literal outside a character class in JS, so the subset
 * matches the same strings MRI's output does.
 */
export function regexpEscape(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
