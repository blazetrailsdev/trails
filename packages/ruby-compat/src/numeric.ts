import { Complex } from "./complex.js";
import { FloatDomainError } from "./float-domain-error.js";
import { NilClass } from "./nil-class.js";
import { NoMethodError } from "./no-method-error.js";
import { rbBuiltinClassName, rbObjClass } from "./object.js";
import { Rational, ZeroDivisionError } from "./rational.js";
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
 * Ruby `Integer#/` over two Fixnums (`vendor/ruby/v3.3.11/numeric.c:4164`
 * `fix_divide`, the `FIXNUM_P(y)` arm): `rb_num_zerodiv` for a zero divisor,
 * else `rb_fix_div_fix` (`vendor/ruby/v3.3.11/internal/fixnum.h:149`), which
 * floors where JS `/` answers a fraction.
 * @noRailsEquivalent PERMANENT — Ruby core `Integer#/` (`vendor/ruby/v3.3.11/numeric.c:4164`).
 */
export function fixDiv(x: number, y: number): number {
  if (y === 0) throw new ZeroDivisionError("divided by 0");
  return Math.floor(x / y);
}

/**
 * Ruby `Integer#%` over two Fixnums (`vendor/ruby/v3.3.11/numeric.c:4268`
 * `fix_mod`, the `FIXNUM_P(y)` arm): `rb_num_zerodiv` for a zero divisor,
 * else `rb_fix_mod_fix` (`vendor/ruby/v3.3.11/internal/fixnum.h:160`), whose
 * result takes the divisor's sign where JS `%` takes the dividend's.
 * @noRailsEquivalent PERMANENT — Ruby core `Integer#%` (`vendor/ruby/v3.3.11/numeric.c:4268`).
 */
export function fixMod(x: number, y: number): number {
  if (y === 0) throw new ZeroDivisionError("divided by 0");
  const mod = x % y;
  return mod !== 0 && mod < 0 !== y < 0 ? mod + y : mod;
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
 * `rb_big_norm` (`vendor/ruby/v3.3.11/bignum.c:3188`).
 * @noRailsEquivalent PERMANENT
 */
export function rbBigNorm(x: bigint): number | bigint {
  return Number.isSafeInteger(Number(x)) ? Number(x) : x;
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
      if (typeof x === "number" && typeof y === "number" && Number.isSafeInteger(x + y)) {
        return x + y;
      }
      return rbBigNorm(BigInt(x) + BigInt(y));
    }
    if (rbFloatTypeP(y)) return rbDbl2num(Number(x) + y.valueOf());
    if (y instanceof Complex) return y.plus(x);
  }
  const coerce = (y as { coerce?: unknown } | null)?.coerce;
  if (typeof coerce !== "function") {
    throw new TypeError(`${rbBuiltinClassName(y)} can't be coerced into ${rbObjClass(x)}`);
  }
  const [a, b] = coerce.call(y, x) as [unknown, unknown];
  return rbPlus(a, b);
}

/**
 * The `+` send (`rb_funcallv(v, idPLUS, 1, &i)`, `vendor/ruby/v3.3.11/enum.c:4583`),
 * over `vm_opt_plus`'s String and Array arms (`vendor/ruby/v3.3.11/vm_insnhelper.c:6010`).
 * @noRailsEquivalent PERMANENT
 */
export function rbPlus(v: unknown, i: unknown): unknown {
  if (rbIntegerTypeP(v) || rbFloatTypeP(v) || v instanceof Rational) return numericPlus(v, i);
  if (typeof v === "string") {
    if (typeof i !== "string") {
      throw new TypeError(`no implicit conversion of ${rbBuiltinClassName(i)} into String`);
    }
    return v + i;
  }
  if (Array.isArray(v)) {
    if (!Array.isArray(i)) {
      throw new TypeError(`no implicit conversion of ${rbBuiltinClassName(i)} into Array`);
    }
    return [...v, ...i];
  }
  const plus = (v as { plus?: unknown } | null)?.plus;
  if (typeof plus === "function") return plus.call(v, i);
  throw new NoMethodError(
    `undefined method '+' for ${v == null ? "nil" : `an instance of ${rbObjClass(v)}`}`,
  );
}
