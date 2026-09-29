/**
 * Ruby `String#inspect` (`vendor/ruby/v3.3.11/string.c:6825` `rb_str_inspect`), the
 * receiver-qualified spelling `Symbol#to_s`'s `symbolToS` already establishes:
 * `Hash#inspect` takes the unqualified `inspect`, so the String one carries its
 * class in the name.
 *
 * The port is over UTF-8, which is the only encoding a JS string has: MRI's
 * `enc`, `resenc` and `unicode_p` are all fixed by that, so the branches those
 * select between collapse to the ones this file walks. A `#` is escaped only
 * when the next character would open an interpolation
 * (`string.c:6862-6867`); a bare `#` stays literal.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `String#inspect`
 * (`vendor/ruby/v3.3.11/string.c:6825`).
 */
export function stringInspect(str: string): string {
  let result = '"';
  const chars = [...str];

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const c = char.codePointAt(0)!;

    // (`vendor/ruby/v3.3.11/string.c:6810-6820`) meets and writes as `\xXX` each.
    if (c >= 0xd800 && c <= 0xdfff) {
      for (const byte of [0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)]) {
        result += `\\x${byte.toString(16).toUpperCase()}`;
      }
      continue;
    }
    if (char === '"' || char === "\\") {
      result += "\\" + char;
      continue;
    }
    if (char === "#" && ESCAPED_AFTER_HASH.includes(chars[i + 1])) {
      result += "\\#";
      continue;
    }
    const cc = ESCAPE_ALIASES[c];
    if (cc !== undefined) {
      result += "\\" + cc;
      continue;
    }
    if (isPrint(c)) {
      result += char;
      continue;
    }
    result += catEscapedChar(c);
  }

  return result + '"';
}

const ESCAPED_AFTER_HASH = ["$", "@", "{"];

/** The `switch (c)` of `rb_str_inspect` (`vendor/ruby/v3.3.11/string.c:6877-6886`). */
const ESCAPE_ALIASES: Record<number, string> = {
  0x0a: "n",
  0x0d: "r",
  0x09: "t",
  0x0c: "f",
  0x0b: "v",
  0x08: "b",
  0x07: "a",
  0x1b: "e",
};

/**
 * `rb_enc_isprint(c, enc) && c != 0x85` (`vendor/ruby/v3.3.11/string.c:6866-6867`)
 * for UTF-8: Onigmo's `print` excludes the controls, the unassigned code
 * points and the line / paragraph separators, so `"\u0378".inspect` and
 * `"\u2028".inspect` escape, while U+200B and U+00AD stay literal.
 */
function isPrint(c: number): boolean {
  return !NONPRINTABLE.test(String.fromCodePoint(c));
}

const NONPRINTABLE = /^[\p{Cc}\p{Cn}\p{Zl}\p{Zp}]$/u;

/**
 * `rb_str_buf_cat_escaped_char` (`vendor/ruby/v3.3.11/string.c:6671`), the
 * `unicode_p` arm: `\uXXXX` below U+10000 and `\u{XXXX}` above it, in
 * uppercase hex.
 */
function catEscapedChar(c: number): string {
  if (c < 0x10000) return `\\u${c.toString(16).toUpperCase().padStart(4, "0")}`;
  return `\\u{${c.toString(16).toUpperCase()}}`;
}
