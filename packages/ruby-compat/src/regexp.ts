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
 * for MRI, not for JS, and {@link rbRegInitStr} reads it back. MRI has three
 * options, so a JS flag that is none of them is not written: `m`, since an MRI
 * `^` / `$` is a line anchor under every option, and `g`, `y`, `d`, `u` and
 * `v`, which {@link rbRegEqual} does not compare either.
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
 * a pattern in MRI's syntax. MRI keeps a `(?on-off:…)` wrapper in the source
 * and folds it into the options again in `rb_reg_str_with_term`
 * (`vendor/ruby/v3.3.11/re.c:582-640`); a JS pattern cannot hold MRI's option
 * letters, so that fold is made here: a pattern that is wholly one such group
 * becomes the group's body under the JS flags its options name. Anything else
 * is compiled as it stands, so an MRI-only construct (`(?x:…)`) is a
 * `SyntaxError`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbRegInitStr(s: string): RegExp {
  const m = /^\(\?([mi]*)(?:-[mix]*)?:/.exec(s);
  if (m && s.endsWith(")")) {
    let depth = 1;
    let inClass = false;
    let i = m[0].length;
    for (; i < s.length && depth > 0; i++) {
      const c = s[i];
      if (c === "\\") i++;
      else if (inClass) inClass = c !== "]";
      else if (c === "[") inClass = true;
      else if (c === "(") depth++;
      else if (c === ")") depth--;
    }
    if (depth === 0 && i === s.length) {
      const flags = (m[1].includes("i") ? "i" : "") + (m[1].includes("m") ? "s" : "");
      return new RegExp(s.slice(m[0].length, -1), flags);
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

/**
 * `Regexp#match?` (`rb_reg_match_p`, `vendor/ruby/v3.3.11/re.c:3811`): whether
 * `re` matches `str` at or after `pos`, keeping no state. A JS pattern carrying
 * `g` or `y` advances its `lastIndex` on a match, which MRI has no counterpart
 * for, so it is put back.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbRegMatchP(re: RegExp, str: string | null | undefined, pos = 0): boolean {
  if (str == null) return false;
  if (pos < 0) {
    pos += str.length;
    if (pos < 0) return false;
  }
  if (pos > str.length) return false;
  const { lastIndex } = re;
  try {
    if (re.global || re.sticky) {
      re.lastIndex = pos;
      return re.test(str);
    }
    if (pos === 0) return re.test(str);
    const from = new RegExp(re.source, `${re.flags}g`);
    from.lastIndex = pos;
    return from.test(str);
  } finally {
    re.lastIndex = lastIndex;
  }
}
