import { ArgumentError } from "../argument-error.js";
import { RuntimeError } from "../runtime-error.js";
import { bytes, sequenceLength, strNew } from "./bytes.js";
import { forceEncoding } from "./force-encoding.js";
import { checkArity, num2long } from "./support.js";

const ISSPACE = /[\t\n\v\f\r ]/;

function digitValue(c: string): number {
  const code = c.toLowerCase().charCodeAt(0);
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  if (code >= 0x61 && code <= 0x7a) return code - 0x61 + 10;
  return 99;
}

/**
 * `rb_int_parse_cstr` (`vendor/ruby/v3.3.11/bignum.c:4074`) without `badcheck`: optional
 * leading whitespace and sign, a radix prefix, then digits with single
 * underscores between them; whatever cannot be read answers 0. A base of 0
 * or below reads the prefix (`0x`, `0b`, `0o`, `0d`, a bare `0` for octal),
 * falling back to `-base`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbIntParseCstr(str: string, base: number): number | bigint {
  let i = 0;
  let sign = 1n;
  while (i < str.length && ISSPACE.test(str[i])) i++;
  if (str[i] === "+") i++;
  else if (str[i] === "-") {
    i++;
    sign = -1n;
  }
  const prefix = str.slice(i, i + 2).toLowerCase();
  if (base <= 0) {
    if (str[i] === "0" && i + 1 < str.length) {
      const radix = { "0x": 16, "0b": 2, "0o": 8, "0d": 10 }[prefix];
      if (radix) {
        base = radix;
        i += 2;
      } else {
        base = 8;
      }
    } else if (base < -1) {
      base = -base;
    } else {
      base = 10;
    }
  } else if (str.length - i > 1 && { 2: "0b", 8: "0o", 10: "0d", 16: "0x" }[base] === prefix) {
    i += 2;
  }
  if (base < 2 || base > 36) throw new ArgumentError(`invalid radix ${base}`);
  let value = 0n;
  let digits = 0;
  let underscore = false;
  for (; i < str.length; i++) {
    const c = str[i];
    if (c === "_") {
      if (underscore || digits === 0) break;
      underscore = true;
      continue;
    }
    const d = digitValue(c);
    if (d >= base) break;
    value = value * BigInt(base) + BigInt(d);
    digits++;
    underscore = false;
  }
  const result = sign * value;
  const small =
    result >= BigInt(Number.MIN_SAFE_INTEGER) && result <= BigInt(Number.MAX_SAFE_INTEGER);
  return small ? Number(result) : result;
}

/**
 * `String#to_i` (`vendor/ruby/v3.3.11/string.c:6602` `rb_str_to_i`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrToI(str: string, ...args: unknown[]): number | bigint {
  checkArity(args.length, 0, 1);
  const base = args.length ? num2long(args[0]) : 10;
  if (base < 0) throw new ArgumentError(`invalid radix ${base}`);
  return rbIntParseCstr(str, base);
}

/**
 * `String#hex` (`vendor/ruby/v3.3.11/string.c:10183` `rb_str_hex`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrHex(str: string): number | bigint {
  return rbIntParseCstr(str, 16);
}

/**
 * `String#oct` (`vendor/ruby/v3.3.11/string.c:10210` `rb_str_oct`): octal, unless a
 * radix prefix says otherwise.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrOct(str: string): number | bigint {
  return rbIntParseCstr(str, -8);
}

const FLOAT_PREFIX =
  /^[\t\n\v\f\r ]*([+-]?(?:\d+(?:_\d+)*(?:\.\d+(?:_\d+)*)?|\.\d+(?:_\d+)*)(?:[eE][+-]?\d+(?:_\d+)*)?)/;

/**
 * `String#to_f` (`vendor/ruby/v3.3.11/string.c:6633` `rb_str_to_f`, over
 * `rb_cstr_to_dbl_raise` at `vendor/ruby/v3.3.11/object.c:3362` without `badcheck`):
 * the leading decimal float, 0.0 when there is none.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrToF(str: string): number {
  const match = FLOAT_PREFIX.exec(str);
  if (!match) return 0;
  return Number.parseFloat(match[1].replace(/_/g, ""));
}

const DUMP_ESCAPES: Record<string, string> = {
  '"': '\\"',
  "\\": "\\\\",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\f": "\\f",
  "\v": "\\v",
  "\b": "\\b",
  "\x07": "\\a",
  "\x1b": "\\e",
};

/**
 * `String#dump` (`vendor/ruby/v3.3.11/string.c:6901` `rb_str_dump`): printable ASCII
 * as is, `#` escaped before `$`, `@` and `{`, a non-ASCII character as
 * `\uXXXX` / `\u{X}`, any other byte as `\xHH`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrDump(str: string): string {
  const b = bytes(str);
  let out = '"';
  let i = 0;
  while (i < b.length) {
    const c = b[i];
    const len = c < 0x80 ? 1 : sequenceLength(b, i);
    if (c < 0x80) {
      const ch = String.fromCharCode(c);
      if (ch in DUMP_ESCAPES) out += DUMP_ESCAPES[ch];
      else if (ch === "#" && i + 1 < b.length && [0x24, 0x40, 0x7b].includes(b[i + 1]))
        out += "\\#";
      else if (c >= 0x20 && c < 0x7f) out += ch;
      else out += `\\x${c.toString(16).toUpperCase().padStart(2, "0")}`;
      i++;
    } else if (len > 0) {
      const cp = strNew(b.slice(i, i + len)).codePointAt(0)!;
      const hex = cp.toString(16).toUpperCase();
      out += cp > 0xffff ? `\\u{${hex}}` : `\\u${hex.padStart(4, "0")}`;
      i += len;
    } else {
      out += `\\x${c.toString(16).toUpperCase()}`;
      i++;
    }
  }
  return out + '"';
}

const UNDUMP_ESCAPES: Record<string, number> = {
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
  f: 0x0c,
  v: 0x0b,
  b: 0x08,
  a: 0x07,
  e: 0x1b,
};

function utf8(cp: number): number[] {
  return bytes(String.fromCodePoint(cp));
}

/**
 * `String#undump` (`vendor/ruby/v3.3.11/string.c:7196` `str_undump`, with
 * `undump_after_backslash` at `:7071`): the inverse of {@link rbStrDump}. A
 * `.force_encoding("...")` epilogue re-reads the bytes through
 * `forceEncoding`, the one tag a JS string can take.
 *
 * @noRailsEquivalent PERMANENT
 */
export function strUndump(str: string): string {
  const invalid = () =>
    new RuntimeError(
      'invalid dumped string; not wrapped with \'"\' nor \'"...".force_encoding("...")\' form',
    );
  // eslint-disable-next-line no-control-regex -- `rb_str_is_ascii_only_p` (string.c:7209)
  if (!/^[\x00-\x7f]*$/.test(str)) throw new RuntimeError("non-ASCII character detected");
  if (str.includes("\0")) throw new RuntimeError("string contains null byte");
  if (str.length < 2 || str[0] !== '"') throw invalid();
  const out: number[] = [];
  let hasUtf8 = false;
  let binary = false;
  let s = 1;
  for (;;) {
    if (s >= str.length) throw new RuntimeError("unterminated dumped string");
    const ch = str[s];
    if (ch === '"') {
      s++;
      if (s === str.length) return strNew(out);
      let rest = str.slice(s);
      if (rest.startsWith(".dup") && rest.length > 4) rest = rest.slice(4);
      const suffix = '.force_encoding("';
      if (rest.length <= suffix.length || !rest.startsWith(suffix)) throw invalid();
      if (hasUtf8) {
        throw new RuntimeError("dumped string contained Unicode escape but used force_encoding");
      }
      const encname = rest.slice(suffix.length, rest.indexOf('"', suffix.length));
      if (rest.slice(suffix.length + encname.length) !== '")') throw invalid();
      if (/^utf-?8$/i.test(encname)) return strNew(out);
      const raw = String.fromCharCode(...out);
      try {
        return forceEncoding(raw, encname);
      } catch {
        throw new RuntimeError("dumped string has unknown encoding name");
      }
    }
    if (ch !== "\\") {
      out.push(ch.charCodeAt(0));
      s++;
      continue;
    }
    s++;
    if (s >= str.length) throw new RuntimeError("invalid escape");
    const e = str[s];
    if (e === "\\" || e === '"' || e === "#") {
      out.push(e.charCodeAt(0));
      s++;
    } else if (e in UNDUMP_ESCAPES) {
      out.push(UNDUMP_ESCAPES[e]);
      s++;
    } else if (e === "u") {
      if (binary) throw new RuntimeError("hex escape and Unicode escape are mixed");
      hasUtf8 = true;
      if (++s >= str.length) throw new RuntimeError("invalid Unicode escape");
      if (str[s] === "{") {
        s++;
        for (;;) {
          if (s >= str.length) throw new RuntimeError("unterminated Unicode escape");
          if (str[s] === "}") {
            s++;
            break;
          }
          if (ISSPACE.test(str[s])) {
            s++;
            continue;
          }
          const hex = /^[0-9a-fA-F]*/.exec(str.slice(s))![0];
          if (hex.length === 0 || hex.length > 6) throw new RuntimeError("invalid Unicode escape");
          const c = Number.parseInt(hex, 16);
          if (c > 0x10ffff) throw new RuntimeError("invalid Unicode codepoint (too large)");
          if (c >= 0xd800 && c <= 0xdfff) throw new RuntimeError("invalid Unicode codepoint");
          out.push(...utf8(c));
          s += hex.length;
        }
      } else {
        const hex = /^[0-9a-fA-F]{0,4}/.exec(str.slice(s))![0];
        if (hex.length !== 4) throw new RuntimeError("invalid Unicode escape");
        const c = Number.parseInt(hex, 16);
        if (c >= 0xd800 && c <= 0xdfff) throw new RuntimeError("invalid Unicode codepoint");
        out.push(...utf8(c));
        s += 4;
      }
    } else if (e === "x") {
      if (hasUtf8) throw new RuntimeError("hex escape and Unicode escape are mixed");
      binary = true;
      if (++s >= str.length) throw new RuntimeError("invalid hex escape");
      const hex = /^[0-9a-fA-F]{0,2}/.exec(str.slice(s))![0];
      if (hex.length !== 2) throw new RuntimeError("invalid hex escape");
      out.push(Number.parseInt(hex, 16));
      s += 2;
    } else {
      out.push(0x5c, e.charCodeAt(0));
      s++;
    }
  }
}
