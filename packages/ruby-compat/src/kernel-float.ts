/**
 * Ruby's `Kernel#Float` (`vendor/ruby/object.c:3648` `rb_f_float` →
 * `vendor/ruby/object.c:3605` `rb_convert_to_float`), the strict decimal parse
 * Rails reaches for directly (`activemodel/validations/numericality.rb:82`,
 * `activesupport/number_helper/number_to_human_converter.rb:17`,
 * `activerecord/connection_adapters/postgresql/oid/point.rb:64`). Ruby core,
 * so no gem file declares it.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#Float`
 * (`vendor/ruby/object.c:3648`), which Rails calls without defining, so no
 * Rails file declares the module this file's single export lives in.
 */

import { ArgumentError } from "./argument-error.js";

const DECIMAL_REGEX =
  /^[+-]?(?:\d(?:_?\d)*(?:\.\d(?:_?\d)*)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?$/;

const HEXADECIMAL_REGEX =
  /^([+-]?)0[xX]([\da-fA-F](?:_?[\da-fA-F])*)(?:\.([\da-fA-F](?:_?[\da-fA-F])*))?(?:[pP]([+-]?\d+))?$/;

const DIGIT_SEPARATOR_REGEX = /_/g;

/**
 * `vendor/ruby/object.c:3605` `rb_convert_to_float` with `raise_exception`
 * true — the arm every Rails call site reaches. A Numeric answers itself, a
 * String is parsed by `rb_str_to_dbl` and raises `ArgumentError` when it does
 * not parse, and anything else is converted through `to_f`, raising
 * `TypeError` when the value does not define one.
 *
 * `rb_cstr_to_dbl` strips surrounding whitespace and then requires the WHOLE
 * remainder to match Ruby's float grammar, so the parse is validated against
 * that grammar rather than delegated to `Number()`, which reads `0b…`, `0o…`,
 * `"Infinity"`, `"NaN"`, `"5."` and `"1e"` that Ruby rejects and rejects the
 * `1_000` separators and `0x1p3` hex floats Ruby reads.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#Float`
 * (`vendor/ruby/object.c:3648`), which Rails calls without defining, so there
 * is no Ruby file in any gem for the port to mirror.
 */
export function kernelFloat(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "bigint") return Number(val);
  if (typeof val === "string") {
    const str = val.trim();
    if (DECIMAL_REGEX.test(str)) return Number(str.replace(DIGIT_SEPARATOR_REGEX, ""));
    const hex = HEXADECIMAL_REGEX.exec(str);
    if (hex !== null) return hexFloat(hex);
    throw new ArgumentError(`invalid value for Float(): ${JSON.stringify(val)}`);
  }
  if (val !== null && val !== undefined && typeof val === "object") {
    const toF = (val as { toF?: unknown }).toF;
    if (typeof toF === "function") return (toF as () => number).call(val);
  }
  throw new TypeError(`can't convert ${rbObjClass(val)} into Float`);
}

function hexFloat(hex: RegExpExecArray): number {
  const [, sign, intDigits, fracDigits, exponent] = hex;
  const digits = intDigits.replace(DIGIT_SEPARATOR_REGEX, "");
  const frac = (fracDigits ?? "").replace(DIGIT_SEPARATOR_REGEX, "");
  const mantissa = Number.parseInt(digits + frac, 16) / 16 ** frac.length;
  const scaled = mantissa * 2 ** Number(exponent ?? "0");
  return sign === "-" ? -scaled : scaled;
}

/** `rb_obj_class` (`vendor/ruby/object.c:296`) as `conversion_mismatch`
 *  spells it: `nil` for nil, the class name otherwise. */
function rbObjClass(val: unknown): string {
  if (val === null || val === undefined) return "nil";
  if (Array.isArray(val)) return "Array";
  if (typeof val === "boolean") return val ? "TrueClass" : "FalseClass";
  return (val as object).constructor?.name ?? "Object";
}
