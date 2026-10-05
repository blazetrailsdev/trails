/**
 * Ruby's `Regexp.escape` (`re.c` `rb_reg_s_quote`,
 * `vendor/ruby/v3.3.11/re.c:4144`): the metacharacters of `string` escaped so it
 * matches itself literally when spliced into a pattern.
 *
 * @noRailsEquivalent PERMANENT — `Regexp.escape` is Ruby CORE, implemented in
 * C, and JS has no `RegExp.escape`, so the ports that need it cannot call it.
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

/**
 * `rb_reg_to_s` (`vendor/ruby/v3.3.11/re.c:565`): the source in a non-capturing
 * group carrying the pattern's own options, so it means the same spliced into
 * another pattern. Ruby's `m` is JS's `s`, and JS's `m` (Ruby's always-on line
 * anchors) is carried too, so a `^` ported from `\A` stays `\A`. The group is
 * spelled with JS's modifiers (`(?i-ms:a)` for MRI's `(?i-mx:a)`), so it is a
 * pattern only where the engine has them: Node 23, Chrome 125, Firefox 132,
 * Safari 18.4.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbRegToS(re: RegExp): string {
  let on = "";
  let off = "";
  for (const opt of "ims") {
    if (re.flags.includes(opt)) on += opt;
    else off += opt;
  }
  return `(?${on}${off ? `-${off}` : ""}:${re.source})`;
}

/**
 * `rb_reg_equal` (`vendor/ruby/v3.3.11/re.c:3486`): the same source under the
 * same options. `g`, `y`, `d`, `u` and `v` are how a JS pattern is run, not
 * options Ruby has, and are not compared.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbRegEqual(re1: RegExp, re2: unknown): boolean {
  if (re1 === re2) return true;
  if (!(re2 instanceof RegExp)) return false;
  for (const opt of "ims") {
    if (re1.flags.includes(opt) !== re2.flags.includes(opt)) return false;
  }
  return re1.source === re2.source;
}
