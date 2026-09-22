import { ArgumentError } from "../argument-error.js";
import { IndexError } from "../index-error.js";
import { rbBuiltinClassName } from "../object.js";
import { Range } from "../range.js";
import { TypeError } from "../type-error.js";

/**
 * A `STRING_METHOD_TABLE` entry's receiver. A JS string is immutable, so a
 * destructive entry writes back to `string`, as `rb_str_update`
 * (`vendor/ruby/string.c:5378`) writes the receiver's bytes.
 *
 * @noRailsEquivalent PERMANENT
 */
export interface StringReceiver {
  string: string;
}

/**
 * Split a trailing block off `args` (`rb_block_given_p`, `vendor/ruby/eval.c:866`).
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
 * `rb_str_length` (`vendor/ruby/string.c:2211`): the character count.
 *
 * @noRailsEquivalent PERMANENT
 */
export function strlen(str: string): number {
  return [...str].length;
}

/**
 * `rb_str_sublen` (`vendor/ruby/string.c:2841`): a UTF-16 offset as a character offset.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrSublen(str: string, pos: number): number {
  return strlen(str.slice(0, pos));
}

/**
 * `str_offset` (`vendor/ruby/string.c:2786`): a character offset as a UTF-16 offset.
 *
 * @noRailsEquivalent PERMANENT
 */
export function strOffset(str: string, pos: number): number {
  return [...str].slice(0, pos).join("").length;
}

/**
 * `StringValue` (`vendor/ruby/string.c:2551` `rb_string_value`): a String, or its `to_str`.
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
 * `rb_check_string_type` (`vendor/ruby/string.c:2690`): a String, its `to_str`, or nil.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbCheckStringType(val: unknown): string | null {
  if (typeof val === "string") return val;
  const toStr = (val as { toStr?: unknown } | null)?.toStr;
  if (typeof toStr === "function") return toStr.call(val) as string;
  return null;
}

/**
 * `NUM2LONG` (`vendor/ruby/numeric.c:3135` `rb_num2long`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function num2long(val: unknown): number {
  if (typeof val === "number") return Math.trunc(val);
  if (val == null) throw new TypeError("no implicit conversion from nil to integer");
  throw new TypeError(`no implicit conversion of ${rbBuiltinClassName(val)} into Integer`);
}

/**
 * `rb_error_arity` (`vendor/ruby/vm_insnhelper.c:466` `rb_arity_error_new`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbErrorArity(argc: number, min: number, max: number): never {
  const expected = min === max ? `${min}` : max === Infinity ? `${min}+` : `${min}..${max}`;
  throw new ArgumentError(`wrong number of arguments (given ${argc}, expected ${expected})`);
}

/**
 * `rb_check_arity` (`vendor/ruby/include/ruby/internal/intern/error.h:280`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function checkArity(argc: number, min: number, max: number): void {
  if (argc < min || argc > max) rbErrorArity(argc, min, max);
}

/**
 * A bang form's nil-when-unchanged return (`vendor/ruby/string.c:7535` `rb_str_upcase_bang`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function bang(self: StringReceiver, string: string): string | null {
  if (string === self.string) return null;
  self.string = string;
  return string;
}

/**
 * `rb_reg_prepare_re` (`vendor/ruby/re.c:1587`): a pattern matched by character, not
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
 * `rb_reg_search` (`vendor/ruby/re.c:1796`) from character offset `pos`, forward or reverse.
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
 * `rb_reg_backref_number` (`vendor/ruby/re.c:1235`).
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
 * `get_pat_quoted` (`vendor/ruby/string.c:5698`): a Regexp as is, else a String
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
 * `get_pat` (`vendor/ruby/string.c:5675`): {@link getPatQuoted}, with a String
 * compiled as a pattern (`rb_reg_regcomp`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function getPat(pat: unknown): RegExp {
  const val = getPatQuoted(pat);
  return typeof val === "string" ? new RegExp(val) : val;
}

/**
 * A literal String as the Regexp `rb_pat_search` (`vendor/ruby/string.c:5723`)
 * searches for it by.
 *
 * @noRailsEquivalent PERMANENT
 */
export function literalRegexp(str: string): RegExp {
  return new RegExp(str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u");
}

/**
 * `rb_range_beg_len` (`vendor/ruby/range.c:1744`), `err` 0 or 2.
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
 * `rb_str_cmp` (`vendor/ruby/string.c:3696`): byte order, then length. UTF-8
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
