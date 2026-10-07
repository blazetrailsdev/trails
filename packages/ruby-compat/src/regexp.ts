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
 * `syntax: "onig"` spells the group with MRI's own option letters instead
 * (`option_to_str`, `vendor/ruby/v3.3.11/re.c:322`), the bytes MRI's `to_s`
 * writes: JS's `s` is MRI's `m`, and JS has no `x`. That string is a pattern
 * for MRI, not for JS, and {@link rbRegInitStr} reads it back.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbRegToS(re: RegExp, syntax: "js" | "onig" = "js"): string {
  let on = "";
  let off = "";
  if (syntax === "onig") {
    for (const [opt, flag] of [
      ["m", "s"],
      ["i", "i"],
      ["x", ""],
    ]) {
      if (flag !== "" && re.flags.includes(flag)) on += opt;
      else off += opt;
    }
    return `(?${on}${off ? `-${off}` : ""}:${re.source})`;
  }
  for (const opt of "ims") {
    if (re.flags.includes(opt)) on += opt;
    else off += opt;
  }
  return `(?${on}${off ? `-${off}` : ""}:${re.source})`;
}

/**
 * `Regexp.new(string)` (`rb_reg_init_str`, `vendor/ruby/v3.3.11/re.c:3360`) for
 * a pattern in MRI's syntax. A pattern that is wholly one `(?on-off:…)` group,
 * the form MRI's `Regexp#to_s` writes, becomes the group's body under the JS
 * flags its options name, which is the pattern `rb_reg_str_with_term`
 * (`vendor/ruby/v3.3.11/re.c:575-640`) folds it back to. Anything else is
 * compiled as it stands, so an MRI-only construct (`(?x:…)`) is a
 * `SyntaxError`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbRegInitStr(s: string): RegExp {
  const m = /^\(\?([mi]*)(?:-([mix]*))?:([\s\S]*)\)$/.exec(s);
  if (m) {
    const flags = (m[1].includes("i") ? "i" : "") + (m[1].includes("m") ? "s" : "");
    try {
      return new RegExp(m[3], flags);
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
    }
  }
  return new RegExp(s);
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
