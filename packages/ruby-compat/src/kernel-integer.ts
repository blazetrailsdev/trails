import { ArgumentError } from "./argument-error.js";
import { FloatDomainError } from "./float-domain-error.js";
import { rbBuiltinClassName, rbInspect } from "./object.js";

const DIGITS_BY_BASE: Record<number, string> = {
  2: "[01]",
  8: "[0-7]",
  10: "[0-9]",
  16: "[0-9a-fA-F]",
};

const BASE_BY_PREFIX: Record<string, number> = { x: 16, b: 2, o: 8, d: 10 };

/**
 * `rb_convert_to_integer` (`vendor/ruby/object.c:3257`) with `raise_exception`
 * true — the arm every `Kernel#Integer` call site reaches. A Float answers its
 * truncation and raises `FloatDomainError` when it is not finite, a String is
 * parsed by `rb_str_to_inum(str, base, TRUE)` (`vendor/ruby/bignum.c:4302`),
 * and anything else is converted through `to_int` / `to_i`, raising
 * `TypeError` when the value defines neither.
 *
 * `rb_cstr_to_inum` (`vendor/ruby/bignum.c:4045`) is why the String arm is a
 * grammar rather than a `Number.parseInt`: it strips surrounding whitespace,
 * reads an optional sign and a radix prefix (`0x`/`0b`/`0o`/`0d`, plus bare
 * `0` for octal when the base is unspecified), allows a single `_` BETWEEN
 * digits, and then requires the whole remainder to be digits of that radix —
 * so `"012"` is 10, `"0_1"` is 1, and `"1__0"`, `"08"`, `"1e3"` and a trailing
 * `_` all raise, none of which `Number.parseInt` reproduces.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#Integer`
 * (`vendor/ruby/object.c:3355`), which Rails calls without defining, so there
 * is no Ruby file in any gem for the port to mirror.
 */
export function kernelInteger(val: unknown, base = 0): number {
  if (typeof val === "number") {
    if (!Number.isFinite(val)) throw new FloatDomainError(String(val));
    return Math.trunc(val);
  }
  if (typeof val === "bigint") return Number(val);
  if (typeof val === "string") return rbStrToInum(val, base);
  if (val !== null && val !== undefined && typeof val === "object") {
    const toInt = (val as { toInt?: unknown }).toInt ?? (val as { toI?: unknown }).toI;
    if (typeof toInt === "function") return (toInt as () => number).call(val);
  }
  throw new TypeError(`can't convert ${rbBuiltinClassName(val)} into Integer`);
}

function rbStrToInum(str: string, base: number): number {
  const signMatch = /^([+-]?)(.*)$/s.exec(str.trim())!;
  const sign = signMatch[1];
  let body = signMatch[2];

  const prefix = /^0([xbod])/i.exec(body);
  if (prefix && (base === 0 || base === BASE_BY_PREFIX[prefix[1].toLowerCase()])) {
    base = BASE_BY_PREFIX[prefix[1].toLowerCase()]!;
    body = body.slice(2);
  } else if (base === 0) {
    if (/^0./.test(body)) {
      base = 8;
      body = body.slice(1).replace(/^_/, "");
    } else {
      base = 10;
    }
  }

  const digits = DIGITS_BY_BASE[base];
  if (digits === undefined || !new RegExp(`^${digits}(?:_?${digits})*$`).test(body)) {
    throw new ArgumentError(`invalid value for Integer(): ${rbInspect(str)}`);
  }
  return (sign === "-" ? -1 : 1) * Number.parseInt(body.replace(/_/g, ""), base);
}
