import { ArgumentError } from "../argument-error.js";
import { IndexError } from "../index-error.js";
import { conversionMismatch, rbBuiltinClassName } from "../object.js";
import { Range } from "../range.js";
import { RangeError as RbRangeError } from "../range-error.js";
import { TypeError } from "../type-error.js";

/**
 * A `STRING_METHOD_TABLE` entry's receiver. A JS string is immutable, so a
 * destructive entry writes back to `string`, as `rb_str_update`
 * (`vendor/ruby/v3.3.11/string.c:5378`) writes the receiver's bytes.
 *
 * @noRailsEquivalent PERMANENT
 */
export interface StringReceiver {
  string: string;
}

/**
 * Split a trailing block off `args` (`rb_block_given_p`, `vendor/ruby/v3.3.11/eval.c:866`),
 * for the methods whose MRI body takes one. JS has no block syntax apart from
 * its arguments, so a trailing function IS the block there; every other table
 * entry reads a function as an ordinary argument.
 *
 * @noRailsEquivalent PERMANENT
 */
export function blockArg(args: unknown[]): [unknown[], ((...args: unknown[]) => unknown) | null] {
  const last = args[args.length - 1];
  if (typeof last === "function") {
    return [args.slice(0, -1), last as (...args: unknown[]) => unknown];
  }
  return [args, null];
}

/**
 * `rb_str_length` (`vendor/ruby/v3.3.11/string.c:2211`): the character count.
 *
 * @noRailsEquivalent PERMANENT
 */
export function strlen(str: string): number {
  return [...str].length;
}

/**
 * `rb_str_sublen` (`vendor/ruby/v3.3.11/string.c:2841`): a UTF-16 offset as a character offset.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrSublen(str: string, pos: number): number {
  return strlen(str.slice(0, pos));
}

/**
 * `str_offset` (`vendor/ruby/v3.3.11/string.c:2786`): a character offset as a UTF-16 offset.
 *
 * @noRailsEquivalent PERMANENT
 */
export function strOffset(str: string, pos: number): number {
  return [...str].slice(0, pos).join("").length;
}

/**
 * `StringValue` (`vendor/ruby/v3.3.11/string.c:2551` `rb_string_value`): a String, or its `to_str`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function stringValue(val: unknown): string {
  if (typeof val === "string") return val;
  const toStr = (val as { toStr?: unknown } | null)?.toStr;
  if (typeof toStr === "function") return toStr.call(val) as string;
  throw new TypeError(`no implicit conversion of ${rbBuiltinClassName(val)} into String`);
}

/**
 * `rb_check_string_type` (`vendor/ruby/v3.3.11/string.c:2690`): a String, its `to_str`, or nil.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbCheckStringType(val: unknown): string | null {
  if (typeof val === "string") return val;
  const toStr = (val as { toStr?: unknown } | null)?.toStr;
  if (typeof toStr !== "function") return null;
  const v: unknown = toStr.call(val);
  if (v == null) return null;
  if (typeof v !== "string") conversionMismatch(val, "String", "to_str", v);
  return v;
}

/**
 * `NUM2LONG` (`vendor/ruby/v3.3.11/numeric.c:3135` `rb_num2long`): a Float
 * outside `long` raises `RangeError` with `out_of_range_float`'s `%-.10g`
 * (`numeric.c:3109-3124`), a `bigint` (Ruby's Bignum) outside it raises
 * `rb_big2long`'s, and anything else goes through `rb_to_int`. The result
 * is a JS `number`, the one integer type an index or length takes, so an
 * in-range `bigint` past `Number.MAX_SAFE_INTEGER` arrives rounded to the
 * nearest double.
 *
 * @noRailsEquivalent PERMANENT
 */
export function num2long(val: unknown): number {
  for (;;) {
    if (val == null) throw new TypeError("no implicit conversion from nil to integer");
    if (typeof val === "number") {
      if (val < 2 ** 63 && -(2 ** 63) <= val) return Math.trunc(val);
      const g = Number.isNaN(val)
        ? "NaN"
        : Number.isFinite(val)
          ? val.toPrecision(10).replace(/\.?0*e/, "e")
          : val > 0
            ? "Inf"
            : "-Inf";
      throw new RbRangeError(`float ${g} out of range of integer`);
    }
    if (typeof val === "bigint") {
      if (val < 2n ** 63n && -(2n ** 63n) <= val) return Number(val);
      throw new RbRangeError("bignum too big to convert into `long'");
    }
    const toInt = (val as { toInt?: unknown }).toInt;
    if (typeof toInt !== "function") {
      throw new TypeError(`no implicit conversion of ${rbBuiltinClassName(val)} into Integer`);
    }
    const v = (toInt as () => unknown).call(val);
    if (typeof v !== "bigint" && (typeof v !== "number" || !Number.isInteger(v))) {
      const klass = rbBuiltinClassName(val);
      throw new TypeError(
        `can't convert ${klass} to Integer (${klass}#to_int gives ${rbBuiltinClassName(v)})`,
      );
    }
    val = v;
  }
}

/**
 * `rb_error_arity` (`vendor/ruby/v3.3.11/vm_insnhelper.c:466` `rb_arity_error_new`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbErrorArity(argc: number, min: number, max: number): never {
  const expected = min === max ? `${min}` : max === Infinity ? `${min}+` : `${min}..${max}`;
  throw new ArgumentError(`wrong number of arguments (given ${argc}, expected ${expected})`);
}

/**
 * `rb_check_arity` (`vendor/ruby/v3.3.11/include/ruby/internal/intern/error.h:280`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function checkArity(argc: number, min: number, max: number): void {
  if (argc < min || argc > max) rbErrorArity(argc, min, max);
}

/**
 * A bang form's nil-when-unchanged return (`vendor/ruby/v3.3.11/string.c:7535` `rb_str_upcase_bang`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function bang(self: StringReceiver, string: string): string | null {
  if (string === self.string) return null;
  self.string = string;
  return string;
}

/**
 * `rb_reg_prepare_re` (`vendor/ruby/v3.3.11/re.c:1587`): a pattern matched by character, not
 * UTF-16 unit, with `flags` added.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbRegexp(re: RegExp, flags: string): RegExp {
  const base = re.flags.replace(/[gyd]/g, "") + flags;
  if (/[uv]/.test(base)) return new RegExp(re.source, base);
  try {
    return new RegExp(re.source, base + "u");
  } catch {
    return new RegExp(re.source, base);
  }
}

/**
 * `rb_reg_search` (`vendor/ruby/v3.3.11/re.c:1796`) from character offset `pos`, forward or reverse.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbRegSearch(
  re: RegExp,
  str: string,
  pos: number,
  reverse: boolean,
): RegExpExecArray | null {
  if (!reverse) {
    const global = rbRegexp(re, "dg");
    global.lastIndex = strOffset(str, pos);
    return global.exec(str);
  }
  const sticky = rbRegexp(re, "dy");
  for (let start = pos; start >= 0; start--) {
    sticky.lastIndex = strOffset(str, start);
    const match = sticky.exec(str);
    if (match) return match;
  }
  return null;
}

/**
 * `rb_reg_backref_number` (`vendor/ruby/v3.3.11/re.c:1235`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbRegBackrefNumber(match: RegExpExecArray, backref: unknown): number {
  if (typeof backref !== "string") return num2long(backref);
  const span = match.indices?.groups?.[backref];
  if (!match.groups || !(backref in match.groups)) {
    throw new IndexError(`undefined group name reference: ${backref}`);
  }
  return match.indices!.findIndex((s) => s === span);
}

/**
 * `get_pat_quoted` (`vendor/ruby/v3.3.11/string.c:5698`): a Regexp as is, else a String
 * (or `to_str`) matched literally, else `Check_Type`'s `TypeError`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function getPatQuoted(pat: unknown): RegExp | string {
  if (pat instanceof RegExp) return pat;
  const val = rbCheckStringType(pat);
  if (val === null) {
    throw new TypeError(`wrong argument type ${rbBuiltinClassName(pat)} (expected Regexp)`);
  }
  return val;
}

/**
 * `get_pat` (`vendor/ruby/v3.3.11/string.c:5675`): {@link getPatQuoted}, with a String
 * compiled as a pattern (`rb_reg_regcomp`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function getPat(pat: unknown): RegExp {
  const val = getPatQuoted(pat);
  return typeof val === "string" ? new RegExp(val) : val;
}

/**
 * A literal String as the Regexp `rb_pat_search` (`vendor/ruby/v3.3.11/string.c:5723`)
 * searches for it by.
 *
 * @noRailsEquivalent PERMANENT
 */
export function literalRegexp(str: string): RegExp {
  return new RegExp(str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u");
}

/**
 * `rb_range_beg_len` (`vendor/ruby/v3.3.11/range.c:1744`), `err` 0 or 2.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbRangeBegLen(range: Range, len: number, err: number): [number, number] | null {
  let beg = range.begin == null ? 0 : num2long(range.begin);
  let end = range.end == null ? -1 : num2long(range.end);
  const excl = range.end == null ? false : range.excludeEnd;
  outOfRange: {
    if (beg < 0) {
      beg += len;
      if (beg < 0) break outOfRange;
    }
    if (end < 0) end += len;
    if (!excl) end++;
    if (beg > len) break outOfRange;
    if (end > len) end = len;
    return [beg, Math.max(end - beg, 0)];
  }
  if (err) throw new RangeError(`${range.toS()} out of range`);
  return null;
}

/**
 * `rb_str_cmp` (`vendor/ruby/v3.3.11/string.c:3696`): byte order, then length. UTF-8
 * byte order is code point order.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrCmp(str1: string, str2: string): number {
  const a = [...str1];
  const b = [...str2];
  for (let i = 0; i < a.length && i < b.length; i++) {
    const c1 = a[i].codePointAt(0)!;
    const c2 = b[i].codePointAt(0)!;
    if (c1 !== c2) return c1 < c2 ? -1 : 1;
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}
