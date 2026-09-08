/** @internal */
function trSetup(selector: string): (cp: string) => boolean {
  const chars = Array.from(selector);
  let i = 0;
  let negate = false;
  if (chars[0] === "^" && chars.length > 1) {
    negate = true;
    i = 1;
  }
  const singles = new Set<string>();
  const ranges: Array<[string, string]> = [];
  while (i < chars.length) {
    let c = chars[i];
    if (c === "\\" && i + 1 < chars.length) {
      i += 1;
      c = chars[i];
    }
    if (chars[i + 1] === "-" && i + 2 < chars.length) {
      let last = chars[i + 2];
      if (last === "\\" && i + 3 < chars.length) {
        i += 1;
        last = chars[i + 2];
      }
      ranges.push([c, last]);
      i += 3;
    } else {
      singles.add(c);
      i += 1;
    }
  }
  return (cp) => {
    const inSet =
      singles.has(cp) ||
      ranges.some(
        ([a, b]) =>
          cp.codePointAt(0)! >= a.codePointAt(0)! && cp.codePointAt(0)! <= b.codePointAt(0)!,
      );
    return negate ? !inSet : inSet;
  };
}

/**
 * Returns a copy of `str` with every character in the intersection of the
 * given selectors removed. Each selector is a character SET, not a substring:
 * `c1-c2` denotes a range, a leading `^` negates, and a backslash escapes the
 * next character. Multiple selectors intersect.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `String#delete`
 * (`vendor/ruby/string.c:8407` `rb_str_delete`), which Rails inherits rather
 * than defines.
 */
export function stringDelete(str: string, ...selectors: string[]): string {
  if (selectors.length === 0) return str;
  const tables = selectors.map(trSetup);
  let out = "";
  for (const cp of str) {
    if (!tables.every((t) => t(cp))) out += cp;
  }
  return out;
}
