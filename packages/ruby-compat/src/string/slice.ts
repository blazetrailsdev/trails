import { Range } from "../range.js";

/**
 * Ruby core `String#slice!` (`vendor/ruby/v3.3.11/string.c:5588` `rb_str_slice_bang`): the
 * substring `str[*args]` selects — an Integer index, an index and length, a
 * `Range`, a `Regexp` (with an optional capture) or a String — removed from
 * the receiver. A JS string is immutable, so the remaining string is returned
 * beside the slice, and `null` stands for Ruby's nil when nothing is selected.
 * An ASCII-8BIT receiver, a `Uint8Array`, is sliced by byte.
 *
 * @noRailsEquivalent PERMANENT
 */
export function sliceBang(
  string: Uint8Array,
  ...args: [number] | [number, number] | [Range<number | null>]
): [Uint8Array | null, Uint8Array];
/** @noRailsEquivalent PERMANENT — Ruby core `String#slice!` (`vendor/ruby/v3.3.11/string.c:5588`). */
export function sliceBang(
  string: string,
  ...args:
    | [number]
    | [number, number]
    | [Range<number | null>]
    | [RegExp, (number | string)?]
    | [string]
): [string | null, string];
/** @noRailsEquivalent PERMANENT — Ruby core `String#slice!` (`vendor/ruby/v3.3.11/string.c:5588`). */
export function sliceBang(
  string: string | Uint8Array,
  ...args:
    | [number]
    | [number, number]
    | [Range<number | null>]
    | [RegExp, (number | string)?]
    | [string]
): [string | Uint8Array | null, string | Uint8Array] {
  const [arg, arg2] = args;
  if (typeof arg === "string" && typeof string === "string") {
    const index = string.indexOf(arg);
    if (index === -1) return [null, string];
    return [arg, string.slice(0, index) + string.slice(index + arg.length)];
  }
  if (arg instanceof RegExp && typeof string === "string") {
    const m = new RegExp(arg.source, arg.flags.replace(/[gyd]/g, "") + "d").exec(string);
    const capture = arg2 ?? 0;
    const text =
      m?.[capture as number] ?? (typeof capture === "string" ? m?.groups?.[capture] : undefined);
    const span =
      typeof capture === "string" ? m?.indices?.groups?.[capture] : m?.indices?.[capture];
    if (text == null || span == null) return [null, string];
    return [text, string.slice(0, span[0]) + string.slice(span[1])];
  }
  const chars = string instanceof Uint8Array ? Array.from(string) : [...string];
  const n = chars.length;
  let start: number;
  let len: number;
  if (arg instanceof Range) {
    start = arg.begin ?? 0;
    let end = arg.end ?? -1;
    if (start < 0) start += n;
    if (start < 0 || start > n) return [null, string];
    if (end < 0) end += n;
    if (arg.excludeEnd && arg.end !== null) end -= 1;
    len = Math.max(end - start + 1, 0);
  } else if (arg2 !== undefined) {
    start = (arg as number) < 0 ? (arg as number) + n : (arg as number);
    len = arg2 as number;
    if (start < 0 || start > n || len < 0) return [null, string];
  } else {
    start = (arg as number) < 0 ? (arg as number) + n : (arg as number);
    if (start < 0 || start >= n) return [null, string];
    len = 1;
  }
  const sliced = chars.splice(start, len);
  if (string instanceof Uint8Array) {
    return [Uint8Array.from(sliced as number[]), Uint8Array.from(chars as number[])];
  }
  return [sliced.join(""), chars.join("")];
}
