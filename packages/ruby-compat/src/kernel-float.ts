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

const NON_DECIMAL_LITERAL_REGEX = /^[+-]?0[bBoO]/;

const DIGIT_SEPARATOR_REGEX = /(?<=\d)_(?=\d)/g;

/**
 * `vendor/ruby/object.c:3605` `rb_convert_to_float` with `raise_exception`
 * true — the arm every Rails call site reaches. A Numeric answers itself, a
 * String is parsed by `rb_str_to_dbl` and raises `ArgumentError` when it does
 * not parse, and anything else is converted through `to_f`, raising
 * `TypeError` when the value does not define one. Leading whitespace is
 * stripped before the String parse, so `"  0b1"` is rejected too.
 *
 * JS `Number()` and `Kernel#Float` disagree in three places trails has to
 * close by hand: `Number()` reads `0b…` and `0o…` literals, which Ruby
 * rejects; it coerces `""` and whitespace to `0`, which Ruby rejects; and it
 * rejects the `1_000` digit separators Ruby accepts. `0x…` is read by both
 * (`Float("0x10")` is 16.0 on MRI 3.3).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#Float`
 * (`vendor/ruby/object.c:3648`), which Rails calls without defining, so there
 * is no Ruby file in any gem for the port to mirror.
 */
export function kernelFloat(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "bigint") return Number(val);
  if (typeof val === "string") {
    if (val.trim() === "" || NON_DECIMAL_LITERAL_REGEX.test(val.trimStart())) {
      throw new ArgumentError(`invalid value for Float(): ${JSON.stringify(val)}`);
    }
    const coerced = Number(val.replace(DIGIT_SEPARATOR_REGEX, ""));
    if (Number.isNaN(coerced)) {
      throw new ArgumentError(`invalid value for Float(): ${JSON.stringify(val)}`);
    }
    return coerced;
  }
  if (val !== null && val !== undefined && typeof val === "object") {
    const toF = (val as { toF?: unknown }).toF;
    if (typeof toF === "function") return (toF as () => number).call(val);
  }
  throw new TypeError(`can't convert ${rbObjClass(val)} into Float`);
}

/** `rb_obj_class` (`vendor/ruby/object.c:296`) as `conversion_mismatch`
 *  spells it: `nil` for nil, the class name otherwise. */
function rbObjClass(val: unknown): string {
  if (val === null || val === undefined) return "nil";
  if (Array.isArray(val)) return "Array";
  if (typeof val === "boolean") return val ? "TrueClass" : "FalseClass";
  return (val as object).constructor?.name ?? "Object";
}
