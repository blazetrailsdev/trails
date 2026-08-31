/**
 * `String#succ` — a Ruby *core* method, not a Rails extension, so it has no
 * `core_ext/string/*.rb` counterpart. It lives beside `range.ts`, which
 * consumes it (`Range#include?` enumerates a string range by repeatedly
 * applying it).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `String#succ`
 * (`vendor/ruby/string.c:4868` `rb_str_succ`), which Rails inherits rather
 * than defines.
 */

const isAsciiAlnum = (c: number): boolean =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);

/** Inclusive [min, max] code-point bounds of the UTF-8 width encoding `cp`,
 *  the widths `vendor/ruby/string.c:4631` `enc_succ_char` steps between. */
function utf8WidthBounds(cp: number): [number, number] {
  if (cp < 0x80) return [0x00, 0x7f];
  if (cp < 0x800) return [0x80, 0x7ff];
  if (cp < 0x10000) return [0x800, 0xffff];
  return [0x10000, 0x10ffff];
}

/**
 * `String#succ` (`vendor/ruby/string.c:4868`) — Ruby's successor. Increments the rightmost alphanumeric,
 * carrying within its character class (`9→0`, `z→a`, `Z→A`) and skipping
 * non-alphanumerics during the carry; an overflow past the leftmost member of
 * a class inserts a new leading digit/letter (`"Zz".succ == "AAa"`,
 * `"99".succ == "100"`). Strings with no alphanumeric increment by raw code
 * unit instead (`"<<".succ == "<="`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `String#succ`
 * (`vendor/ruby/string.c:4868` `rb_str_succ`), which Rails inherits rather
 * than defines.
 */
export function succ(s: string): string {
  if (s.length === 0) return "";
  const codes = Array.from(s, (ch) => ch.codePointAt(0) as number);

  let lastAlnum = -1;
  for (let i = codes.length - 1; i >= 0; i--) {
    if (isAsciiAlnum(codes[i])) {
      lastAlnum = i;
      break;
    }
  }

  if (lastAlnum === -1) {
    /* No alphanumeric: whole-code-point increment with carry, matching Ruby's
       `enc_succ_char` (`vendor/ruby/string.c:4631`), which advances by encoded
       character — not by UTF-16 code unit, which would truncate an astral char
       to its high surrogate. */
    let i = codes.length - 1;
    let carry = true;
    while (i >= 0 && carry) {
      const [min, max] = utf8WidthBounds(codes[i]);
      if (codes[i] >= max) {
        /* `enc_succ_char` (`vendor/ruby/string.c:4631`) reports
           NEIGHBOR_WRAPPED whenever the successor's encoded length would
           differ, so a character at the top of its UTF-8 width wraps to that
           width's *minimum* and carries —
           `"\u{FFFF}".succ.codepoints == [0x1, 0x800]`, not [0x10000]. The
           carry then prepends U+0001 below. */
        codes[i] = min;
      } else {
        codes[i]++;
        /* Surrogates are not valid characters; `enc_succ_char`
           (`vendor/ruby/string.c:4631`) skips past them to the next valid one
           rather than emitting an unpaired half. */
        if (codes[i] >= 0xd800 && codes[i] <= 0xdfff) codes[i] = 0xe000;
        carry = false;
      }
      i--;
    }
    if (carry) codes.unshift(1);
    return String.fromCodePoint(...codes);
  }

  /* Carry leftward from the rightmost alphanumeric, wrapping within a class.
     `vendor/ruby/string.c:4868` stops the carry rather than crossing a
     non-alphanumeric gap into a *different* class (digit vs letter):
     `"z.9".succ == "z.10"`, not `"aa.0"`. */
  const DIGIT = 1;
  const ALPHA = 2;
  let i = lastAlnum;
  let carry = true;
  let overflowPos = lastAlnum;
  let overflowChar = 0;
  let lastWrapClass = 0;
  let crossedGap = false;
  while (i >= 0 && carry) {
    const c = codes[i];
    if (!isAsciiAlnum(c)) {
      crossedGap = true;
      i--;
      continue;
    }
    const thisClass = c >= 48 && c <= 57 ? DIGIT : ALPHA;
    if (crossedGap && lastWrapClass !== 0 && thisClass !== lastWrapClass) break;
    crossedGap = false;
    overflowPos = i;
    if (c === 57) {
      codes[i] = 48;
      overflowChar = 49;
      lastWrapClass = DIGIT;
    } else if (c === 122) {
      codes[i] = 97;
      overflowChar = 97;
      lastWrapClass = ALPHA;
    } else if (c === 90) {
      codes[i] = 65;
      overflowChar = 65;
      lastWrapClass = ALPHA;
    } else {
      codes[i] = c + 1;
      carry = false;
    }
    i--;
  }
  if (carry) codes.splice(overflowPos, 0, overflowChar);
  return String.fromCodePoint(...codes);
}
