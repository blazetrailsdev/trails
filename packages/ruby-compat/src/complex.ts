import {
  numericPlus,
  rbBigNorm,
  rbDbl2num,
  rbFloatTypeP,
  rbIntegerTypeP,
  rbPlus,
} from "./numeric.js";
import { rbObjClass } from "./object.js";
import { Rational } from "./rational.js";
import { rbEqual } from "./rb-equal.js";
import { TypeError } from "./type-error.js";

function fixnumZeroP(x: unknown): boolean {
  return x === 0 || x === 0n;
}

function fAdd(x: unknown, y: unknown): unknown {
  if (rbIntegerTypeP(x)) {
    if (fixnumZeroP(x)) return y;
    if (fixnumZeroP(y)) return x;
    return numericPlus(x, y);
  } else if (rbFloatTypeP(x)) {
    if (fixnumZeroP(y)) return x;
    return numericPlus(x, y);
  } else if (x instanceof Rational) {
    if (fixnumZeroP(y)) return x;
    return numericPlus(x, y);
  }
  return rbPlus(x, y);
}

function fixnumOneP(x: unknown): boolean {
  return x === 1 || x === 1n;
}

function fMul(x: unknown, y: unknown): unknown {
  if (rbIntegerTypeP(x)) {
    if (fixnumZeroP(y)) return 0;
    if (fixnumZeroP(x) && rbIntegerTypeP(y)) return 0;
    if (fixnumOneP(x)) return y;
    if (fixnumOneP(y)) return x;
    if (rbFloatTypeP(y)) return rbDbl2num(Number(x) * y.valueOf());
    if (y instanceof Rational) return y.mul(x);
    if (typeof x === "number" && typeof y === "number" && Number.isSafeInteger(x * y)) {
      return x * y;
    }
    return rbBigNorm(BigInt(x) * BigInt(y as number | bigint));
  } else if (rbFloatTypeP(x)) {
    if (fixnumOneP(y)) return x;
    if (y instanceof Rational) return rbDbl2num(x.valueOf() * y.toF());
    return rbDbl2num(x.valueOf() * Number((y as number | bigint).valueOf()));
  } else if (x instanceof Rational) {
    if (fixnumOneP(y)) return x;
    if (rbFloatTypeP(y)) return rbDbl2num(x.toF() * y.valueOf());
    return x.mul(y as number | bigint);
  }
  if (fixnumOneP(y)) return x;
  return (x as { multiply(other: unknown): unknown }).multiply(y);
}

function fZeroP(x: unknown): boolean {
  if (rbFloatTypeP(x)) return x.valueOf() === 0;
  if (rbIntegerTypeP(x)) return fixnumZeroP(x);
  if (x instanceof Rational) return x.numerator === 0n;
  return rbEqual(x, 0);
}

function kRealP(x: unknown): boolean {
  return rbIntegerTypeP(x) || rbFloatTypeP(x) || x instanceof Rational;
}

function fComplexNew2(x: unknown, y: unknown): Complex {
  if (x instanceof Complex) {
    y = fAdd(x.imaginary, y);
    x = x.real;
  }
  return new Complex(x, y);
}

/**
 * `rb_cComplex` (`vendor/ruby/v3.3.11/complex.c:2529`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core. Rails defines no Complex; its
 * `Enumerable#sum` tests (`core_ext/enumerable_test.rb:112-115`) sum one.
 */
export class Complex {
  /** `Complex::I` (`vendor/ruby/v3.3.11/complex.c:2638`).
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Complex above. */
  static readonly I = new Complex(0, 1);

  /** `nucomp_s_new_internal` (`vendor/ruby/v3.3.11/complex.c:393`).
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Complex above. */
  constructor(
    /** `Complex#real` (`vendor/ruby/v3.3.11/complex.c:771` `rb_complex_real`).
     * @noRailsEquivalent PERMANENT — Ruby core, part of the Complex above. */
    readonly real: unknown,
    /** `Complex#imaginary` (`vendor/ruby/v3.3.11/complex.c:794` `rb_complex_imag`).
     * @noRailsEquivalent PERMANENT — Ruby core, part of the Complex above. */
    readonly imaginary: unknown,
  ) {}

  /** `Complex#imag` (`vendor/ruby/v3.3.11/complex.c:2557`).
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Complex above. */
  get imag(): unknown {
    return this.imaginary;
  }

  /** `rb_complex_plus` (`vendor/ruby/v3.3.11/complex.c:832`, `Complex#+`).
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Complex above. */
  plus(other: unknown): unknown {
    if (other instanceof Complex) {
      const real = fAdd(this.real, other.real);
      const imag = fAdd(this.imaginary, other.imaginary);
      return fComplexNew2(real, imag);
    }
    if (kRealP(other)) return fComplexNew2(fAdd(this.real, other), this.imaginary);
    return numericPlus(this, other);
  }

  /** `rb_complex_mul` (`vendor/ruby/v3.3.11/complex.c:928`, `Complex#*`), for the real
   * multiplier this port needs.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Complex above. */
  multiply(other: unknown): Complex {
    return fComplexNew2(fMul(this.real, other), fMul(this.imaginary, other));
  }

  /** `nucomp_eqeq_p` (`vendor/ruby/v3.3.11/complex.c:1225`, `Complex#==`).
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Complex above. */
  equals(other: unknown): boolean {
    if (other instanceof Complex) {
      return rbEqual(this.real, other.real) && rbEqual(this.imaginary, other.imaginary);
    }
    if (kRealP(other)) return rbEqual(this.real, other) && fZeroP(this.imaginary);
    return rbEqual(other, this);
  }

  /** `nucomp_coerce` (`vendor/ruby/v3.3.11/complex.c:1300`, `Complex#coerce`).
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Complex above. */
  coerce(other: unknown): [unknown, unknown] {
    if (other instanceof Complex) return [other, this];
    if (kRealP(other)) return [new Complex(other, 0), this];
    throw new TypeError(`${rbObjClass(other)} can't be coerced into Complex`);
  }
}

/**
 * `Kernel#Complex()` (`vendor/ruby/v3.3.11/complex.c:2359` `nucomp_s_convert`).
 * @noRailsEquivalent PERMANENT
 */
export function complex(a1: unknown, a2: unknown = 0): Complex {
  return new Complex(a1, a2);
}
