/**
 * `String#inspect` — a Ruby *core* method, not a Rails extension, so it has no
 * `core_ext/string/*.rb` counterpart. It lives beside `succ.ts` and `chomp.ts`,
 * the other Ruby core String methods the port carries.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `String#inspect`
 * (`vendor/ruby/string.c:6825` `rb_str_inspect`), which Rails inherits rather
 * than defines.
 */

/**
 * Ruby `String#inspect` (`vendor/ruby/string.c:6825` `rb_str_inspect`), the
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
 * (`vendor/ruby/string.c:6825`).
 */
export function stringInspect(str: string): string {
  let result = '"';
  const chars = [...str];

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const c = char.codePointAt(0)!;

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

/** The `switch (c)` of `rb_str_inspect` (`vendor/ruby/string.c:6877-6886`). */
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
 * `rb_enc_isprint(c, enc) && c != 0x85` (`vendor/ruby/string.c:6902`) for
 * UTF-8: the C0 controls, DEL and the C1 controls are not printable, and
 * everything above them is — Onigmo answers `print` for U+200B and U+FFFD
 * alike, and `"\u200b".inspect` keeps the literal character.
 *
 * A lone surrogate is the one JS string a UTF-8 `String` cannot hold; MRI
 * reaches such bytes through `!MBCLEN_CHARFOUND_P` (`string.c:6845-6857`) and
 * escapes them, which is the arm {@link catEscapedChar} lands on here.
 */
function isPrint(c: number): boolean {
  if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return false;
  if (c >= 0xd800 && c <= 0xdfff) return false;
  return true;
}

/**
 * `rb_str_buf_cat_escaped_char` (`vendor/ruby/string.c:6671`), the
 * `unicode_p` arm: `\uXXXX` below U+10000 and `\u{XXXX}` above it, in
 * uppercase hex.
 */
function catEscapedChar(c: number): string {
  if (c < 0x10000) return `\\u${c.toString(16).toUpperCase().padStart(4, "0")}`;
  return `\\u{${c.toString(16).toUpperCase()}}`;
}
