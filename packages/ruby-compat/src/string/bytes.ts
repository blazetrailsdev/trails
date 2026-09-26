/**
 * `String#bytes` (`vendor/ruby/v3.3.11/string.c:9253` `rb_str_bytes`): the receiver's
 * UTF-8 bytes. A JS string holds UTF-16, so a byte that is not part of a
 * well-formed UTF-8 sequence is carried as the lone low surrogate
 * `U+DC80`..`U+DCFF` (`"\udc80"` is Ruby's `"\x80"`), the one code unit a
 * UTF-8 String cannot otherwise hold (`vendor/ruby/v3.3.11/string.c:6845`). Any
 * other lone surrogate contributes its generalized UTF-8 bytes.
 *
 * @noRailsEquivalent PERMANENT
 */
export function bytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.codePointAt(i)!;
    if (c > 0xffff) i++;
    if (c >= 0xdc80 && c <= 0xdcff) bytes.push(c - 0xdc00);
    else if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else {
      bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f));
      bytes.push(0x80 | (c & 0x3f));
    }
  }
  return bytes;
}

/**
 * A well-formed UTF-8 sequence's length at `i`, or the negated length of the
 * invalid chunk there (`vendor/ruby/v3.3.11/enc/utf_8.c:50` `EncLen_UTF8`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function sequenceLength(b: number[], i: number): number {
  const lead = b[i];
  if (lead < 0x80) return 1;
  let n: number;
  let lo = 0x80;
  let hi = 0xbf;
  if (lead >= 0xc2 && lead <= 0xdf) n = 2;
  else if (lead >= 0xe0 && lead <= 0xef) n = 3;
  else if (lead >= 0xf0 && lead <= 0xf4) n = 4;
  else return -1;
  if (lead === 0xe0) lo = 0xa0;
  else if (lead === 0xed) hi = 0x9f;
  else if (lead === 0xf0) lo = 0x90;
  else if (lead === 0xf4) hi = 0x8f;
  let j = i + 1;
  while (
    j < i + n &&
    j < b.length &&
    b[j] >= (j === i + 1 ? lo : 0x80) &&
    b[j] <= (j === i + 1 ? hi : 0xbf)
  )
    j++;
  if (j === i + n) return n;
  return -(j - i);
}

/**
 * `rb_str_new` (`vendor/ruby/v3.3.11/string.c:907`) over raw UTF-8 bytes: each
 * well-formed sequence decoded, every other byte carried as {@link bytes}
 * describes.
 *
 * @noRailsEquivalent PERMANENT
 */
export function strNew(b: number[]): string {
  let str = "";
  let i = 0;
  while (i < b.length) {
    const len = sequenceLength(b, i);
    if (len > 0) {
      str += new TextDecoder().decode(Uint8Array.from(b.slice(i, i + len)));
      i += len;
    } else {
      str += String.fromCharCode(0xdc00 + b[i]);
      i += 1;
    }
  }
  return str;
}

/**
 * Whether byte offset `pos` starts a character (`str_ensure_byte_pos`,
 * `vendor/ruby/v3.3.11/string.c:4082`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function isCharBoundary(b: number[], pos: number): boolean {
  let i = 0;
  while (i < pos) {
    const len = sequenceLength(b, i);
    i += len > 0 ? len : 1;
  }
  return i === pos;
}
