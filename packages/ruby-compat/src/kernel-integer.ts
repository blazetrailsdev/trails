import { ArgumentError } from "./argument-error.js";
import { FloatDomainError } from "./float-domain-error.js";
import { rbBuiltinClassName, rbInspect } from "./object.js";

const BASE_BY_PREFIX: Record<string, number> = { x: 16, b: 2, o: 8, d: 10 };

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * `rb_convert_to_integer` (`vendor/ruby/object.c:3257`) with `raise_exception`
 * true — the arm every `Kernel#Integer` call site reaches. An explicit base is
 * only meaningful for a String, a Float answers its truncation and raises
 * `FloatDomainError` when it is not finite, a String is parsed by
 * `rb_str_convert_to_inum` (`vendor/ruby/bignum.c:4302`), and anything else is
 * converted through `to_int`, then `to_str`, then `to_i`.
 *
 * The base itself arrives through `NUM2INT` (`rb_f_integer`,
 * `vendor/ruby/object.c:3355-3358`), so it is converted before any parsing: a
 * fractional base truncates, a non-finite or out-of-`int` one is a
 * `RangeError`, and one that is not Integer-convertible is a `TypeError`.
 *
 * `rb_int_parse_cstr` (`vendor/ruby/bignum.c:4045`) is why the String arm is a
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
export function kernelInteger(val: unknown, base: unknown = 0): number {
  const radix = rbNum2Int(base);
  if (radix !== 0) {
    const tmp = rbCheckStringType(val);
    if (tmp !== null) val = tmp;
    else throw new ArgumentError("base specified for non string value");
  }
  if (typeof val === "number") {
    if (!Number.isFinite(val)) throw new FloatDomainError(String(val));
    return Math.trunc(val);
  }
  if (typeof val === "bigint") return Number(val);
  if (typeof val === "string") return rbStrConvertToInum(val, radix);
  if (val === null || val === undefined) {
    throw new TypeError("can't convert nil into Integer");
  }

  const tmp = rbCheckToInt(val);
  if (tmp !== null) return tmp;
  const str = rbCheckStringType(val);
  if (str !== null) return rbStrConvertToInum(str, radix);
  return rbToInteger(val);
}

function rbNum2Int(val: unknown): number {
  if (typeof val === "number") {
    if (Number.isNaN(val)) throw new RangeError("float NaN out of range of integer");
    if (!Number.isFinite(val)) {
      throw new RangeError(`float ${val > 0 ? "Inf" : "-Inf"} out of range of integer`);
    }
    return checkIntRange(Math.trunc(val));
  }
  if (typeof val === "bigint") return checkIntRange(Number(val));
  if (val === null || val === undefined) {
    throw new TypeError("no implicit conversion from nil to integer");
  }
  const klass = rbBuiltinClassName(val);
  const toInt = (val as { toInt?: unknown }).toInt;
  if (typeof toInt !== "function") {
    throw new TypeError(`no implicit conversion of ${klass} into Integer`);
  }
  const tmp = (toInt as () => unknown).call(val);
  if (!rbIntegerTypeP(tmp)) {
    throw new TypeError(
      `can't convert ${klass} to Integer (${klass}#to_int gives ${rbBuiltinClassName(tmp)})`,
    );
  }
  return checkIntRange(Number(tmp));
}

function rbIntegerTypeP(val: unknown): val is number | bigint {
  return (typeof val === "number" && Number.isInteger(val)) || typeof val === "bigint";
}

function checkIntRange(int: number): number {
  if (int > 2147483647) throw new RangeError(`integer ${int} too big to convert to \`int'`);
  if (int < -2147483648) throw new RangeError(`integer ${int} too small to convert to \`int'`);
  return int;
}

function rbCheckStringType(val: unknown): string | null {
  if (typeof val === "string") return val;
  const toStr = (val as { toStr?: unknown } | null | undefined)?.toStr;
  if (typeof toStr !== "function") return null;
  const tmp = (toStr as () => unknown).call(val);
  if (typeof tmp === "string") return tmp;
  if (tmp === null || tmp === undefined) return null;
  const klass = rbBuiltinClassName(val);
  throw new TypeError(
    `can't convert ${klass} to String (${klass}#to_str gives ${rbBuiltinClassName(tmp)})`,
  );
}

/**
 * `rb_check_to_int` (`vendor/ruby/object.c:3239`): `to_int` counts only when it
 * answers an Integer, so a receiver whose `to_int` answers anything else falls
 * through to the `to_str` and `to_i` arms rather than being accepted.
 */
function rbCheckToInt(val: unknown): number | null {
  const toInt = (val as { toInt?: unknown }).toInt;
  if (typeof toInt !== "function") return null;
  const tmp = (toInt as () => unknown).call(val);
  return rbIntegerTypeP(tmp) ? Number(tmp) : null;
}

/** `rb_to_integer(val, "to_i", idTo_i)` (`vendor/ruby/object.c:3213`). */
function rbToInteger(val: unknown): number {
  const klass = rbBuiltinClassName(val);
  const toI = (val as { toI?: unknown }).toI;
  if (typeof toI !== "function") {
    throw new TypeError(`can't convert ${klass} into Integer`);
  }
  const tmp = (toI as () => unknown).call(val);
  if (rbIntegerTypeP(tmp)) return Number(tmp);
  throw new TypeError(
    `can't convert ${klass} to Integer (${klass}#to_i gives ${rbBuiltinClassName(tmp)})`,
  );
}

/**
 * `rb_int_parse_cstr` (`vendor/ruby/bignum.c:4045`) under `rb_str_convert_to_inum`'s
 * `badcheck` — a base at or below zero reads the radix off the literal's own
 * prefix (falling back to `-base` below -1, then to 10), and any base outside
 * `valid_radix_p`'s 2..36 raises.
 */
function rbStrConvertToInum(str: string, base: number): number {
  const signMatch = /^([+-]?)(.*)$/s.exec(str.trim())!;
  const sign = signMatch[1];
  let body = signMatch[2];

  const prefix = /^0([xbod])/i.exec(body);
  if (base <= 0) {
    if (prefix) {
      base = BASE_BY_PREFIX[prefix[1].toLowerCase()]!;
      body = body.slice(2);
    } else if (/^0./.test(body)) {
      base = 8;
    } else if (base < -1) {
      base = -base;
    } else {
      base = 10;
    }
  } else if (prefix && base === BASE_BY_PREFIX[prefix[1].toLowerCase()]) {
    body = body.slice(2);
  }

  if (base < 2 || base > 36) throw new ArgumentError(`invalid radix ${base}`);

  const digits = `[${DIGITS.slice(0, base)}${base > 10 ? DIGITS.slice(10, base).toUpperCase() : ""}]`;
  if (!new RegExp(`^${digits}(?:_?${digits})*$`).test(body)) {
    throw new ArgumentError(`invalid value for Integer(): ${rbInspect(str)}`);
  }
  return (sign === "-" ? -1 : 1) * Number.parseInt(body.replace(/_/g, ""), base);
}
