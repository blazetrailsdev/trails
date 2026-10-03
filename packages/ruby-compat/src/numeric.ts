import { Complex } from "./complex.js";
import { FloatDomainError } from "./float-domain-error.js";
import { NilClass } from "./nil-class.js";
import { NoMethodError } from "./no-method-error.js";
import { rbBuiltinClassName, rbObjClassname } from "./object.js";
import { Rational, ZeroDivisionError } from "./rational.js";
import { TypeError } from "./type-error.js";
import { rbStrToF, rbStrToI } from "./string/convert.js";
import { isSymbol } from "./symbol.js";

/**
 * Ruby `Float#round` (`vendor/ruby/v3.3.11/numeric.c:2505` `flo_round`): rounds to
 * `ndigits` decimal places, half away from zero — which is where JS
 * `Math.round` differs, rounding `-0.5` up to `-0` where Ruby answers `-1`.
 * A negative `ndigits` rounds the truncated Integer (`rb_int_round`,
 * `vendor/ruby/v3.3.11/numeric.c:2341`). A positive one answers the receiver
 * itself once `float_round_overflow` (`numeric.c:2544`) says it holds no digit
 * past `ndigits`, zero once `float_round_underflow` (`numeric.c:2572`) says it
 * is smaller than the last one, and past 14 digits rounds the exact Rational
 * (`rb_flo_round_by_rational`, `vendor/ruby/v3.3.11/rational.c:1549`); otherwise
 * `round_half_up` (`numeric.c:110`), whose correction is what makes
 * `1.005.round(2)` answer `1.01` although `1.005 * 100` is
 * `100.49999999999999`.
 * Any other receiver answers its own `round`, as the Ruby send would.
 * @noRailsEquivalent PERMANENT — Ruby core `Float#round` (`vendor/ruby/v3.3.11/numeric.c:2505`).
 */
export function round(x: number, ndigits?: number): number;
/** @noRailsEquivalent PERMANENT — Ruby core `Float#round` (`vendor/ruby/v3.3.11/numeric.c:2505`). */
export function round<T extends { round(ndigits?: number): T }>(x: T, ndigits?: number): T;
/** @noRailsEquivalent PERMANENT — Ruby core `Float#round` (`vendor/ruby/v3.3.11/numeric.c:2505`). */
export function round<T extends { round(ndigits?: number): T }>(
  x: number | T,
  ndigits?: number,
): number | T;
/** @noRailsEquivalent PERMANENT — Ruby core `Float#round` (`vendor/ruby/v3.3.11/numeric.c:2505`). */
export function round(x: number | { round(ndigits?: number): unknown }, ndigits = 0): unknown {
  if (typeof x !== "number" && !(x instanceof Number)) return x.round(ndigits);
  const number = x.valueOf();
  if (number === 0) return ndigits > 0 ? number : 0;
  if (ndigits < 0) return intRound(Number(toI(number)), ndigits);
  if (ndigits === 0) return roundHalfUp(number, 1);
  if (Number.isFinite(number)) {
    const binexp = frexp(number);
    if (floatRoundOverflow(ndigits, binexp)) return number;
    if (floatRoundUnderflow(ndigits, binexp)) return 0;
    if (ndigits > 14) return floRoundByRational(number, ndigits);
    const f = 10 ** ndigits;
    return roundHalfUp(number, f) / f;
  }
  return number;
}

function roundHalfUp(x: number, s: number): number {
  const xs = x * s;
  let f = Math.sign(xs) * Math.round(Math.abs(xs));
  if (s === 1) return f;
  if (x > 0) {
    if ((f + 0.5) / s <= x) f += 1;
  } else if ((f - 0.5) / s >= x) {
    f -= 1;
  }
  return f;
}

function intRound(num: number, ndigits: number): number {
  const f = 10 ** -ndigits;
  if (!Number.isFinite(f)) return 0;
  const x = Math.abs(num);
  return Math.sign(num) * Math.floor((x + f / 2) / f) * f + 0;
}

function frexp(number: number): number {
  let binexp = Math.floor(Math.log2(Math.abs(number))) + 1;
  while (Math.abs(number) >= 2 ** binexp) binexp += 1;
  while (Math.abs(number) < 2 ** (binexp - 1)) binexp -= 1;
  return binexp;
}

function floatRoundOverflow(ndigits: number, binexp: number): boolean {
  const floatDig = 15 + 2;
  return ndigits >= floatDig - (binexp > 0 ? Math.trunc(binexp / 4) : Math.trunc(binexp / 3) - 1);
}

function floatRoundUnderflow(ndigits: number, binexp: number): boolean {
  return ndigits < -(binexp > 0 ? Math.trunc(binexp / 3) + 1 : Math.trunc(binexp / 4));
}

function floRoundByRational(number: number, ndigits: number): number {
  const r = new Rational(number, 1);
  const num = r.numerator * 10n ** BigInt(ndigits);
  const abs = num < 0n ? -num : num;
  const q = (2n * abs + r.denominator) / (2n * r.denominator);
  return Number(`${num < 0n ? "-" : ""}${q}e-${ndigits}`);
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
  return Math.floor(x / y) + 0;
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
  if (mod === 0) return 0;
  return mod < 0 !== y < 0 ? mod + y : mod;
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
 * range; `dbl2ival`'s Bignum arm, `vendor/ruby/v3.3.11/numeric.c:1436-1442`,
 * past the safe-integer range), `String#to_i` (`rb_str_to_i`, {@link rbStrToI}), else the
 * receiver's own `toI`. A Symbol has no `to_i` (`vendor/ruby/v3.3.11/string.c`
 * defines none on `rb_cSymbol`), so a colon-prefixed string raises.
 *
 * @noRailsEquivalent PERMANENT — a Ruby method send, which JS has no receiver
 * for on a primitive.
 */
export function toI(obj: unknown): number | bigint {
  if (obj == null) return NilClass.toI() as number;
  if (typeof obj === "bigint") return obj;
  if (typeof obj === "number" || obj instanceof Number) {
    if (!Number.isFinite(obj.valueOf())) throw new FloatDomainError(String(obj));
    const f = Math.trunc(obj.valueOf());
    return Number.isSafeInteger(f) ? f : BigInt(f);
  }
  if (isSymbol(obj)) throw new NoMethodError("undefined method 'to_i' for an instance of Symbol");
  if (typeof obj === "string") return rbStrToI(obj);
  if (typeof (obj as { toI?: unknown }).toI === "function") {
    return (obj as { toI(): number | bigint }).toI();
  }
  throw new NoMethodError(`undefined method 'to_i' for an instance of ${rbObjClassname(obj)}`);
}

/**
 * Ruby's `obj.to_f` send, dispatched on the receiver's class: `NilClass#to_f`
 * (`vendor/ruby/v3.3.11/nilclass.rb:22`), `Float#to_f`
 * (`vendor/ruby/v3.3.11/numeric.rb:312`), `Integer#to_f`
 * (`vendor/ruby/v3.3.11/numeric.c:5356` `int_to_f`), `String#to_f`
 * (`vendor/ruby/v3.3.11/string.c:6633` `rb_str_to_f`, {@link rbStrToF}), else the
 * receiver's own `toF`. The answer is a Float, so it is seated by
 * {@link rbDbl2num}.
 *
 * @noRailsEquivalent PERMANENT
 */
export function toF(obj: unknown): number {
  if (obj == null) return rbDbl2num(NilClass.toF() as number);
  if (obj instanceof Number) return obj as number;
  if (typeof obj === "number" || typeof obj === "bigint") return rbDbl2num(Number(obj));
  if (isSymbol(obj)) throw new NoMethodError("undefined method 'to_f' for an instance of Symbol");
  if (typeof obj === "string") return rbDbl2num(rbStrToF(obj));
  if (typeof (obj as { toF?: unknown }).toF === "function") {
    return rbDbl2num((obj as { toF(): number }).toF());
  }
  throw new NoMethodError(`undefined method 'to_f' for an instance of ${rbObjClassname(obj)}`);
}

/**
 * Ruby's `obj.nan?` send: `Float#nan?` (`vendor/ruby/v3.3.11/numeric.c:1961`
 * `flo_is_nan_p`) over the `number` seat, else the receiver's own `isNan`
 * (`BigDecimal#nan?`, `vendor/ruby/v3.3.11/ext/bigdecimal/bigdecimal.c:1208`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function isNan(obj: unknown): boolean {
  if (typeof obj === "number" || obj instanceof Number) return Number.isNaN(obj.valueOf());
  if (typeof (obj as { isNan?: unknown } | null)?.isNan === "function") {
    return (obj as { isNan(): boolean }).isNan();
  }
  throw new NoMethodError(`undefined method 'nan?' for an instance of ${rbObjClassname(obj)}`);
}

/**
 * `RB_FLOAT_TYPE_P` (`vendor/ruby/v3.3.11/include/ruby/internal/value_type.h:263`)
 * over the Float seats `rbObjClassname` reads: a fractional `number`, or a boxed one.
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
 * `fix_mul` (`vendor/ruby/v3.3.11/numeric.c:4045`), `rb_float_mul` (`numeric.c:1237`),
 * `rb_rational_mul` (`vendor/ruby/v3.3.11/rational.c:861`).
 * @noRailsEquivalent PERMANENT
 */
export function numericMul(x: unknown, y: unknown): unknown {
  if (rbFloatTypeP(x)) {
    if (rbIntegerTypeP(y) || rbFloatTypeP(y)) return rbDbl2num(x.valueOf() * Number(y.valueOf()));
    if (y instanceof Rational) return rbDbl2num(x.valueOf() * y.toF());
  } else if (x instanceof Rational) {
    if (rbIntegerTypeP(y)) return x.mul(y);
    if (rbFloatTypeP(y)) return rbDbl2num(x.toF() * y.valueOf());
  } else if (rbIntegerTypeP(x)) {
    if (rbIntegerTypeP(y)) {
      if (typeof x === "number" && typeof y === "number" && Number.isSafeInteger(x * y)) {
        return x * y;
      }
      return rbBigNorm(BigInt(x) * BigInt(y));
    }
    if (rbFloatTypeP(y)) return rbDbl2num(Number(x) * y.valueOf());
    if (y instanceof Rational) return y.mul(x);
  }
  throw new TypeError(`${rbBuiltinClassName(y)} can't be coerced into ${rbObjClassname(x)}`);
}

/**
 * `fix_minus` (`vendor/ruby/v3.3.11/numeric.c:3995`), `rb_float_minus` (`numeric.c:1207`),
 * `rb_rational_minus` (`vendor/ruby/v3.3.11/rational.c:765`).
 * @noRailsEquivalent PERMANENT
 */
export function numericMinus(x: unknown, y: unknown): unknown {
  if (rbFloatTypeP(x)) {
    if (rbIntegerTypeP(y) || rbFloatTypeP(y)) return rbDbl2num(x.valueOf() - Number(y.valueOf()));
    if (y instanceof Rational) return rbDbl2num(x.valueOf() - y.toF());
  } else if (x instanceof Rational) {
    if (rbIntegerTypeP(y)) return x.add(-BigInt(y));
    if (rbFloatTypeP(y)) return rbDbl2num(x.toF() - y.valueOf());
    if (y instanceof Rational) return x.add(new Rational(-y.numerator, y.denominator));
  } else if (rbIntegerTypeP(x)) {
    if (rbIntegerTypeP(y)) {
      if (typeof x === "number" && typeof y === "number" && Number.isSafeInteger(x - y)) {
        return x - y;
      }
      return rbBigNorm(BigInt(x) - BigInt(y));
    }
    if (rbFloatTypeP(y)) return rbDbl2num(Number(x) - y.valueOf());
    if (y instanceof Rational)
      return new Rational(x, 1).add(new Rational(-y.numerator, y.denominator));
  }
  throw new TypeError(`${rbBuiltinClassName(y)} can't be coerced into ${rbObjClassname(x)}`);
}

/**
 * `fix_mod` (`vendor/ruby/v3.3.11/numeric.c:4268`), `flo_mod` (`numeric.c:1416`),
 * `num_modulo` (`numeric.c:700`) for a Rational: the result takes the divisor's sign.
 * @noRailsEquivalent PERMANENT
 */
export function numericModulo(x: unknown, y: unknown): unknown {
  if (x instanceof Rational || y instanceof Rational) {
    if (rbFloatTypeP(x) || rbFloatTypeP(y)) {
      return numericModulo(rbDbl2num(toF(x)), rbDbl2num(toF(y)));
    }
    if (rbIntegerTypeP(x) && y instanceof Rational) return new Rational(x, 1).mod(y);
    if (x instanceof Rational && (rbIntegerTypeP(y) || y instanceof Rational)) return x.mod(y);
  } else if (rbIntegerTypeP(x) && rbIntegerTypeP(y)) {
    if (typeof x === "number" && typeof y === "number") return fixMod(x, y);
    const b = BigInt(y);
    if (b === 0n) throw new ZeroDivisionError("divided by 0");
    const mod = BigInt(x) % b;
    return rbBigNorm(mod !== 0n && mod < 0n !== b < 0n ? mod + b : mod);
  } else if ((rbIntegerTypeP(x) || rbFloatTypeP(x)) && (rbIntegerTypeP(y) || rbFloatTypeP(y))) {
    const fx = Number(x.valueOf());
    const fy = Number(y.valueOf());
    if (fy === 0) throw new ZeroDivisionError("divided by 0");
    const mod = fx % fy;
    return rbDbl2num(fy * mod < 0 ? mod + fy : mod);
  }
  throw new TypeError(`${rbBuiltinClassName(y)} can't be coerced into ${rbObjClassname(x)}`);
}

/**
 * `fix_pow` (`vendor/ruby/v3.3.11/numeric.c:4521`), whose negative Integer exponent
 * is `fix_pow_inverted`'s Rational (`numeric.c:4501`), and `rb_float_pow`
 * (`numeric.c:1510`), for the real results.
 * @noRailsEquivalent PERMANENT
 */
export function numericPow(x: unknown, y: unknown): unknown {
  if (rbIntegerTypeP(x) && rbIntegerTypeP(y)) {
    const a = BigInt(x);
    const b = BigInt(y);
    if (a === 1n) return 1;
    if (a === -1n) return b % 2n ? -1 : 1;
    if (b < 0n) {
      if (a === 0n) throw new ZeroDivisionError("divided by 0");
      return new Rational(1n, a ** -b);
    }
    return rbBigNorm(a ** b);
  }
  if ((rbIntegerTypeP(x) || rbFloatTypeP(x)) && (rbIntegerTypeP(y) || rbFloatTypeP(y))) {
    return rbDbl2num(Math.pow(Number(x.valueOf()), Number(y.valueOf())));
  }
  throw new TypeError(`${rbBuiltinClassName(y)} can't be coerced into ${rbObjClassname(x)}`);
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
    throw new TypeError(`${rbBuiltinClassName(y)} can't be coerced into ${rbObjClassname(x)}`);
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
    `undefined method '+' for ${v == null ? "nil" : `an instance of ${rbObjClassname(v)}`}`,
  );
}
