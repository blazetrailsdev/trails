import { Complex } from "./complex.js";
import { FloatDomainError } from "./float-domain-error.js";
import { NilClass } from "./nil-class.js";
import { NoMethodError } from "./no-method-error.js";
import { rbBuiltinClassName, rbObjClass } from "./object.js";
import { Rational } from "./rational.js";
import { TypeError } from "./type-error.js";
import { rbStrToI } from "./string/convert.js";
import { isSymbol } from "./symbol.js";

/**
 * Ruby `Float#round` (`vendor/ruby/v3.3.11/numeric.c:2505` `flo_round`): rounds to
 * `ndigits` decimal places, half away from zero — which is where JS
 * `Math.round` differs, rounding `-0.5` up to `-0` where Ruby answers `-1`.
 * @noRailsEquivalent PERMANENT — Ruby core `Float#round` (`vendor/ruby/v3.3.11/numeric.c:2505`).
 */
export function round(x: number, ndigits = 0): number {
  const f = 10 ** ndigits;
  const scaled = x * f;
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
  return ndigits === 0 ? rounded : rounded / f;
}

/**
 * Ruby `Integer#anybits?` (`vendor/ruby/v3.3.11/numeric.c:3647` `int_anybits_p`):
 * whether any of `mask`'s set bits are set in `self`.
 *
 * Taken over BigInt rather than JS `&`, which truncates both operands to signed
 * 32 bits: `rb_int_and` is arbitrary-precision, so `(2**40).anybits?(2**40)` is
 * true in Ruby and false under `&`. BigInt's bitwise operators read a value as
 * two's complement of unbounded width, which is the notation
 * `vendor/ruby/v3.3.11/spec/ruby/core/integer/anybits_spec.rb:15-20` pins for negative
 * receivers and the bignum cases at `:9-12`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Integer#anybits?` (`vendor/ruby/v3.3.11/numeric.c:3647`).
 */
export function anybits(x: number | bigint, mask: number | bigint): boolean {
  return (BigInt(x) & BigInt(mask)) !== 0n;
}

/**
 * Ruby's `obj.to_i` send, dispatched on the receiver's class: `NilClass#to_i`
 * (`vendor/ruby/v3.3.11/object.c:4414`), `Integer#to_i` (`vendor/ruby/v3.3.11/numeric.c`
 * `int_to_i`), `Float#to_i` (`flo_to_i`, `FloatDomainError` off the finite
 * range), `String#to_i` (`rb_str_to_i`, {@link rbStrToI}), else the
 * receiver's own `toI`. A Symbol has no `to_i` (`vendor/ruby/v3.3.11/string.c`
 * defines none on `rb_cSymbol`), so a colon-prefixed string raises.
 *
 * @noRailsEquivalent PERMANENT — a Ruby method send, which JS has no receiver
 * for on a primitive.
 */
export function toI(obj: unknown): number | bigint {
  if (obj == null) return NilClass.toI() as number;
  if (typeof obj === "bigint") return obj;
  if (typeof obj === "number") {
    if (!Number.isFinite(obj)) throw new FloatDomainError(String(obj));
    return Math.trunc(obj);
  }
  if (isSymbol(obj)) throw new NoMethodError("undefined method 'to_i' for an instance of Symbol");
  if (typeof obj === "string") return rbStrToI(obj);
  if (typeof (obj as { toI?: unknown }).toI === "function") {
    return (obj as { toI(): number | bigint }).toI();
  }
  throw new NoMethodError(`undefined method 'to_i' for an instance of ${rbObjClass(obj)}`);
}

/**
 * `RB_FLOAT_TYPE_P` (`vendor/ruby/v3.3.11/include/ruby/internal/value_type.h:263`)
 * over the Float seats `rbObjClass` reads: a fractional `number`, or a boxed one.
 * @noRailsEquivalent PERMANENT
 */
export function rbFloatTypeP(x: unknown): x is number {
  return x instanceof Number || (typeof x === "number" && !Number.isInteger(x));
}

/**
 * `DBL2NUM` (`vendor/ruby/v3.3.11/include/ruby/internal/arithmetic/double.h:29`), boxed when whole-valued.
 * @noRailsEquivalent PERMANENT
 */
export function rbDbl2num(d: number): number {
  return (Number.isInteger(d) ? new Number(d) : d) as number;
}

/**
 * `RB_INTEGER_TYPE_P` (`vendor/ruby/v3.3.11/include/ruby/internal/value_type.h:94`).
 * @noRailsEquivalent PERMANENT
 */
export function rbIntegerTypeP(x: unknown): x is number | bigint {
  return typeof x === "bigint" || (typeof x === "number" && Number.isInteger(x));
}

/**
 * `fix_plus` (`vendor/ruby/v3.3.11/numeric.c:3942`), `rb_float_plus` (`numeric.c:1176`),
 * `rb_rational_plus` (`vendor/ruby/v3.3.11/rational.c:724`), else `rb_num_coerce_bin`.
 * @noRailsEquivalent PERMANENT
 */
export function numericPlus(x: unknown, y: unknown): unknown {
  if (rbFloatTypeP(x)) {
    if (rbIntegerTypeP(y) || rbFloatTypeP(y)) return rbDbl2num(x.valueOf() + Number(y.valueOf()));
  } else if (x instanceof Rational) {
    if (rbIntegerTypeP(y)) return x.add(y);
    if (rbFloatTypeP(y)) return rbDbl2num(x.toF() + y.valueOf());
    if (y instanceof Rational) return x.add(y);
  } else if (rbIntegerTypeP(x)) {
    if (rbIntegerTypeP(y)) {
      if (typeof x === typeof y) return (x as number) + (y as number);
      return BigInt(x) + BigInt(y);
    }
    if (rbFloatTypeP(y)) return rbDbl2num(Number(x) + y.valueOf());
    if (y instanceof Complex) return y.plus(x);
  }
  const coerce = (y as { coerce?: unknown } | null)?.coerce;
  if (typeof coerce !== "function") {
    throw new TypeError(`${rbBuiltinClassName(y)} can't be coerced into ${rbObjClass(x)}`);
  }
  const [a, b] = coerce.call(y, x) as [unknown, unknown];
  if (rbIntegerTypeP(a) || rbFloatTypeP(a) || a instanceof Rational) return numericPlus(a, b);
  return (a as { plus(other: unknown): unknown }).plus(b);
}
