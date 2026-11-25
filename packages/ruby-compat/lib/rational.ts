/**
 * Ruby's `Rational` (`vendor/ruby/v3.3.11/rational.c:481` `nurat_s_canonicalize_internal`)
 * and the `Kernel#Rational()` conversion function beside it
 * (`vendor/ruby/v3.3.11/rational.c:2691` `nurat_s_convert`). Ruby has both spellings
 * and Rails calls the function, so both ship here.
 */
import { ArgumentError } from "./argument-error.js";
import { classpaths } from "./classpath.js";
import { FloatDomainError } from "./float-domain-error.js";
import { FrozenError } from "./frozen-error.js";
import { rbIntegerTypeP } from "./numeric.js";
import {
  rbBuiltinClassName,
  rbCNumeric,
  rbFSend,
  rbInspect,
  rbObjClassname,
  rbObjIvarGet,
  rbObjIvarSet,
  rtest,
} from "./object.js";
import { rbEqual } from "./rb-equal.js";
import { TypeError } from "./type-error.js";

/** Ruby core `ZeroDivisionError`, what `rb_num_zerodiv`
 * (`vendor/ruby/v3.3.11/numeric.c:206`) raises for a denominator of zero.
 *
 * @noRailsEquivalent PERMANENT — Ruby core; Rails defines no such error. */
export class ZeroDivisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZeroDivisionError";
  }
}

/** @internal `vendor/ruby/v3.3.11/rational.c:292` `i_gcd`, the greatest common divisor a
 * Rational reduces by. */
function iGcd(x: bigint, y: bigint): bigint {
  if (x < 0n) x = -x;
  if (y < 0n) y = -y;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * @internal `vendor/ruby/v3.3.11/rational.c:2199` `float_to_r`, which decodes a Float
 * into the exact `f * 2 ** e` its bits already hold
 * (`vendor/ruby/v3.3.11/numeric.c` `float_decode_internal`, i.e. `frexp`) and answers
 * `f` over `2 ** -e`. A double IS a binary fraction, so doubling until the
 * value is whole is that decode with no rounding in it, and it stops inside
 * `Number.MAX_SAFE_INTEGER` because a mantissa is 53 bits wide. An Integer — a
 * `bigint`, or a `number` `Integer#===` would accept — is itself over one, the
 * `nurat_convert` Integer arm. `float_decode_internal` refuses a non-finite
 * Float with a `FloatDomainError`.
 */
function floatToR(x: number | bigint): { numerator: bigint; denominator: bigint } {
  if (typeof x === "bigint" || Number.isInteger(x)) {
    return { numerator: BigInt(x), denominator: 1n };
  }
  if (!Number.isFinite(x)) throw new FloatDomainError(String(x));
  let f = x;
  let e = 1n;
  while (!Number.isInteger(f)) {
    f *= 2;
    e *= 2n;
  }
  return { numerator: BigInt(f), denominator: e };
}

/**
 * Ruby's `Rational` (`vendor/ruby/v3.3.11/rational.c`), as much of it as its callers
 * need: the constructor canonicalizes to lowest terms
 * (`vendor/ruby/v3.3.11/rational.c:481` `nurat_s_canonicalize_internal`), `+` adds an
 * Integer (`vendor/ruby/v3.3.11/rational.c:724` `rb_rational_plus`), and
 * `numerator`/`denominator` read the parts back out. A Rational stays a
 * Rational under arithmetic in Ruby — on ruby 3.3.11 `(Rational(1,2) * 12).class`
 * is `Rational`, `(6/1)`, and so is `Rational(9,3)` — so a ported `FIXNUM_P`
 * branch is NOT reached by a reducible Rational and this class matches by
 * staying a Rational too. Nothing in `rational.c` folds a denominator of one to
 * an Integer; the date gem spells that fold out inline where it wants it
 * (`date_parse.c:531-534`), and where a body TESTS for it it sends
 * `wholenum_p`, which is a predicate, not a conversion.
 *
 * @noRailsEquivalent PERMANENT — Ruby core. Rails defines no Rational; it
 * inherits Ruby's, and `Date._parse` answers one for a fractional-hour
 * `:offset`, so trails needs the value type to answer the same.
 */
export class Rational {
  /** `vendor/ruby/v3.3.11/rational.c:580` `nurat_numerator` (`Rational#numerator`).
   *
   * Ruby's is an Integer — arbitrary precision — so a `bigint` is the JS
   * analogue, not a `number`: a `number` is exact only inside
   * `Number.MAX_SAFE_INTEGER` and a parsed fraction literal of more than
   * sixteen digits (`date_parse.c:2319-2325`) runs straight past it.
   *
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  readonly numerator: bigint;

  /** `vendor/ruby/v3.3.11/rational.c:598` `nurat_denominator` (`Rational#denominator`).
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  readonly denominator: bigint;

  /** `Rational::compatible` (`vendor/ruby/v3.3.11/rational.c:2806`), pathed at
   * the foot of include.ts.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  declare static compatible: abstract new () => { marshalLoad(a: unknown): unknown };

  /**
   * `vendor/ruby/v3.3.11/rational.c:481` `nurat_s_canonicalize_internal`, the C
   * constructor every `Rational` goes through — there is no public
   * `Rational.new` in Ruby, so this is `rb_rational_new`
   * (`vendor/ruby/v3.3.11/rational.c:1969`) rather than a method with a Ruby name.
   * A Float argument goes through `float_to_r` ({@link floatToR}) — the
   * `nurat_convert` division arm, so `new Rational(0.5, 86400)` is `(1/172800)`
   * on ruby 3.3.11.
   *
   * `nurat_canonicalize` (`vendor/ruby/v3.3.11/rational.c:457`) puts the SIGN on the
   * numerator before `nurat_reduce` cancels: it negates BOTH parts on a
   * negative denominator, which is why `Rational(3, -4)` is `(-3/4)` on ruby
   * 3.3.11 and not `(3/-4)`, and raises `rb_num_zerodiv` on a zero one.
   *
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  constructor(num: number | bigint, den: number | bigint) {
    const a = floatToR(num);
    const b = floatToR(den);
    let n = a.numerator * b.denominator;
    let d = a.denominator * b.numerator;
    if (d < 0n) {
      n = -n;
      d = -d;
    } else if (d === 0n) {
      throw new ZeroDivisionError("divided by 0");
    }
    const g = iGcd(n, d);
    this.numerator = n / g;
    this.denominator = d / g;
  }

  /** `vendor/ruby/v3.3.11/rational.c:1075` `rb_rational_cmp` (`Rational#<=>`), which
   * compares `a.num * b.den` against `b.num * a.den` — exact, where a `toF`
   * comparison would not be. Its T_FLOAT arm, `f_cmp(f_to_f(self), other)`,
   * takes both sides to Float instead, and it is the only arm a non-integral
   * operand has.
   *
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  cmp(other: number | bigint | Rational): number {
    if (typeof other === "number" && !Number.isInteger(other)) {
      const f = this.toF();
      return f === other ? 0 : f < other ? -1 : 1;
    }
    const b = other instanceof Rational ? other : new Rational(other, 1);
    const a = this.numerator * b.denominator;
    const c = b.numerator * this.denominator;
    if (a === c) return 0;
    return a < c ? -1 : 1;
  }

  /** `vendor/ruby/v3.3.11/rational.c:724` `rb_rational_plus` (`Rational#+`), for the
   * Integer and Rational addends this port needs.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  add(other: number | bigint | Rational): Rational {
    if (other instanceof Rational) {
      return new Rational(
        this.numerator * other.denominator + other.numerator * this.denominator,
        this.denominator * other.denominator,
      );
    }
    return new Rational(this.numerator + BigInt(other) * this.denominator, this.denominator);
  }

  /** `vendor/ruby/v3.3.11/rational.c:1128` `nurat_eqeq_p` (`Rational#==`). A Float
   * operand compares as a double; anything else is asked `other == self`.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  equals(other: unknown): boolean {
    if (rbIntegerTypeP(other)) {
      if (this.numerator === 0n && BigInt(other) === 0n) return true;
      if (this.denominator !== 1n) return false;
      return this.numerator === BigInt(other);
    } else if (other instanceof Number || typeof other === "number") {
      return this.toF() === other.valueOf();
    } else if (other instanceof Rational) {
      if (this.numerator === 0n && other.numerator === 0n) return true;
      return this.numerator === other.numerator && this.denominator === other.denominator;
    } else {
      return rbEqual(other, this);
    }
  }

  /** `vendor/ruby/v3.3.11/rational.c:1170` `nurat_coerce` (`Rational#coerce`), for the
   * Integer, Float and Rational operands this port needs.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  coerce(other: unknown): [unknown, unknown] {
    if (rbIntegerTypeP(other)) return [new Rational(other, 1), this];
    else if (other instanceof Number || typeof other === "number") return [other, this.toF()];
    else if (other instanceof Rational) return [other, this];
    throw new TypeError(`${rbObjClassname(other)} can't be coerced into Rational`);
  }

  /** `vendor/ruby/v3.3.11/rational.c:861` `rb_rational_mul` (`Rational#*`), for the
   * Integer multiplier this port needs. `f_muldiv`
   * (`vendor/ruby/v3.3.11/rational.c:794`) cancels the multiplier against the
   * denominator BEFORE it multiplies.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  mul(other: number | bigint): Rational {
    const o = BigInt(other);
    const g = iGcd(o, this.denominator);
    return new Rational(this.numerator * (o / g), this.denominator / g);
  }

  /** `vendor/ruby/v3.3.11/rational.c:903` `rb_rational_div` (`Rational#/`), for an
   * Integer or Rational divisor (`f_muldiv`), the Integer one cancelled the same way {@link mul} is.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  quo(other: number | bigint | Rational): Rational {
    if (other instanceof Rational) {
      return new Rational(this.numerator * other.denominator, this.denominator * other.numerator);
    }
    const o = BigInt(other);
    const g = iGcd(this.numerator, o);
    return new Rational(this.numerator / g, this.denominator * (o / g));
  }

  /** `vendor/ruby/v3.3.11/numeric.c:828` `num_zero_p` (`Rational#zero?`, inherited from
   * Numeric), what `date_core.c`'s `f_zero_p` dispatches to for a Rational.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  isZero(): boolean {
    return this.numerator === 0n;
  }

  /** `vendor/ruby/v3.3.11/numeric.c:659` `num_div` (`Rational#div`, inherited from
   * Numeric), the floored quotient — the method `date_core.c`'s `f_idiv` macro
   * sends (`date_core.c:43`) — for the Integer divisor this port needs.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  div(other: number | bigint): number {
    const den = this.denominator * BigInt(other);
    const q = this.numerator / den;
    return Number(this.numerator % den !== 0n && this.numerator < 0n !== den < 0n ? q - 1n : q);
  }

  /** `vendor/ruby/v3.3.11/numeric.c:700` `num_modulo` (`Rational#%`, inherited from
   * Numeric), which is `self - other * (self.div other)` there too — what
   * `date_core.c`'s `f_mod` dispatches to for a Rational — for the Integer
   * and Rational divisors this port needs (`time.c`'s `modv`).
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  mod(other: number | bigint | Rational): Rational {
    const b = other instanceof Rational ? other : new Rational(other, 1);
    const num = this.numerator * b.denominator;
    const den = this.denominator * b.numerator;
    const q = num / den - (num % den !== 0n && num < 0n !== den < 0n ? 1n : 0n);
    return this.add(new Rational(-b.numerator * q, b.denominator));
  }

  /** `vendor/ruby/v3.3.11/rational.c:1278` `nurat_truncate` (`Rational#to_i`), which
   * truncates toward zero.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  toI(): number {
    return Number(this.numerator / this.denominator);
  }

  /** `vendor/ruby/v3.3.11/rational.c:1287` `nurat_round_half_up` (`Rational#round`),
   * which rounds half away from zero.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  round(): number {
    const q = this.numerator / this.denominator;
    const r = this.numerator % this.denominator;
    const half =
      (r < 0n ? -r : r) * 2n >= (this.denominator < 0n ? -this.denominator : this.denominator);
    return Number(half ? q + (r < 0n !== this.denominator < 0n ? -1n : 1n) : q);
  }

  /** The `Float` a Rational becomes at a `number` seam —
   * `vendor/ruby/v3.3.11/rational.c:1576` `nurat_to_f`, which is what every reader that
   * hands the value to a floating-point API needs.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  toF(): number {
    return Number(this.numerator) / Number(this.denominator);
  }

  /** `vendor/ruby/v3.3.11/rational.c:1802` `nurat_to_s` (`Rational#to_s`).
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  toString(): string {
    return `${this.numerator}/${this.denominator}`;
  }

  /** `vendor/ruby/v3.3.11/rational.c:1818` `nurat_inspect` (`Rational#inspect`), which
   * parenthesizes where {@link toString} does not.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  inspect(): string {
    return `(${this.toString()})`;
  }

  /** `vendor/ruby/v3.3.11/rational.c:1857` `nurat_marshal_dump` (`Rational#marshal_dump`).
   * Its `rb_copy_generic_ivar(a, self)` has no ivar table to write: a JS Array
   * holds no ivars, which is why `has_ivars` (`vendor/ruby/v3.3.11/marshal.c:713`)
   * counts none on one.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  marshalDump(): [bigint, bigint] {
    const a: [bigint, bigint] = [this.numerator, this.denominator];
    return a;
  }
}

/** @internal `vendor/ruby/v3.3.11/rational.c:439` `nurat_int_check`. It admits a
 * Numeric answering `integer?`, which `nurat_canonicalize` then `assert`s is
 * an Integer (`vendor/ruby/v3.3.11/rational.c:459-460`); the narrowing is that
 * assertion, and `BigInt()` raises for a value that fails it. */
function nuratIntCheck(num: unknown): asserts num is number | bigint {
  if (!rbIntegerTypeP(num)) {
    if (!(num instanceof rbCNumeric) || !rtest(rbFSend(num, "isInteger"))) {
      throw new TypeError("not an integer");
    }
  }
}

/** @internal `vendor/ruby/v3.3.11/rational.c:457` `nurat_canonicalize`, answering
 * the pair its two out-parameters hold. */
function nuratCanonicalize(num: bigint, den: bigint): [num: bigint, den: bigint] {
  if (den < 0n) {
    num = -num;
    den = -den;
  } else if (den === 0n) {
    throw new ZeroDivisionError("divided by 0");
  }
  return [num, den];
}

/** @internal `Rational::compatible` (`vendor/ruby/v3.3.11/rational.c:2806`), the
 * class `Marshal.load` allocates in a Rational's place and sends `marshal_load`. */
class compatible {
  /** `vendor/ruby/v3.3.11/rational.c:1869` `nurat_marshal_load`.
   * @noRailsEquivalent PERMANENT */
  marshalLoad(a: unknown): this {
    if (Object.isFrozen(this)) {
      throw new FrozenError(`can't modify frozen ${rbObjClassname(this)}: ${rbInspect(this)}`);
    }

    if (!Array.isArray(a)) {
      throw new TypeError(`wrong argument type ${rbBuiltinClassName(a)} (expected Array)`);
    }
    if (a.length !== 2) {
      throw new ArgumentError(
        `marshaled rational must have an array whose length is 2 but ${a.length}`,
      );
    }

    let num: unknown = a[0];
    let den: unknown = a[1];
    nuratIntCheck(num);
    nuratIntCheck(den);
    [num, den] = nuratCanonicalize(BigInt(num), BigInt(den));
    rbObjIvarSet(this, "@numerator", num);
    rbObjIvarSet(this, "@denominator", den);

    return this;
  }
}

Rational.compatible = compatible;

/**
 * `vendor/ruby/v3.3.11/rational.c:1831` `nurat_dumper`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function nuratDumper(self: Rational): Rational {
  return self;
}

/**
 * `vendor/ruby/v3.3.11/rational.c:1838` `nurat_loader`. `nurat_marshal_load`
 * leaves the pair canonical and not reduced, and so does this.
 *
 * @noRailsEquivalent PERMANENT
 */
export function nuratLoader(self: Rational, a: object): Rational {
  let num: unknown = rbObjIvarGet(a, "@numerator");
  let den: unknown = rbObjIvarGet(a, "@denominator");
  nuratIntCheck(num);
  nuratIntCheck(den);
  [num, den] = nuratCanonicalize(BigInt(num), BigInt(den));
  const dat = self as { numerator: bigint; denominator: bigint };
  dat.numerator = num as bigint;
  dat.denominator = den as bigint;
  Object.freeze(self);

  return self;
}

/**
 * `Kernel#Rational()` — `vendor/ruby/v3.3.11/rational.c:2691` `nurat_s_convert`, whose
 * `rb_scan_args(argc, argv, "11", ...)` makes the denominator optional and
 * defaults it to `ONE` (`vendor/ruby/v3.3.11/rational.c:2674`) before handing both to
 * `nurat_s_canonicalize_internal`. It is the spelling Rails writes — 20 call
 * sites across activesupport and activerecord — and it is NOT an Integer fold:
 * on ruby 3.3.11 `Rational(6, 1)` is `(6/1)` and its class is `Rational`.
 *
 * A Rational numerator is NOT canonicalized against the denominator:
 * `nurat_convert` (`vendor/ruby/v3.3.11/rational.c:2621`) returns it unchanged for an
 * exact-one denominator, and otherwise leaves the canonicalizer for `f_div`
 * (`vendor/ruby/v3.3.11/rational.c:2668`), so `Rational(r, 1000000)` is a division.
 *
 * A non-numeric operand is converted through its `to_r`
 * (`vendor/ruby/v3.3.11/rational.c:2591,2647`), and `nil` raises TypeError (`:2564-2567`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#Rational()`, which Rails
 * calls and does not define. */
export function rational(
  numv: number | bigint | string | Rational | { toR(): Rational },
  denv: number | bigint | string = 1,
): Rational {
  if (numv == null) throw new TypeError("can't convert nil into Rational");
  if (typeof numv === "string") numv = stringToRStrict(numv);
  else if (typeof numv === "object" && !(numv instanceof Rational)) numv = numv.toR();
  if (typeof denv === "string") return rational(numv).quo(rational(stringToRStrict(denv)));
  if (numv instanceof Rational) {
    return denv === 1 || denv === 1n ? numv : numv.quo(denv);
  }
  return new Rational(numv, denv);
}

interface Cursor {
  s: number;
}

/** @internal `vendor/ruby/v3.3.11/bignum.c:4074` `rb_int_parse_cstr` for base 10 with
 * `RB_INT_PARSE_UNDERSCORE` and no sign or prefix: the digits at `p.s`, an
 * underscore allowed only between two of them. */
function rbIntParseCstr(str: string, p: Cursor): { n: bigint; count: number } | null {
  const md = /^\d+(?:_\d+)*/.exec(str.slice(p.s));
  if (md == null) return null;
  p.s += md[0].length;
  const digits = md[0].replaceAll("_", "");
  return { n: BigInt(digits), count: digits.length };
}

/** @internal `vendor/ruby/v3.3.11/rational.c:2308` `read_sign`. */
function readSign(str: string, p: Cursor, e: number): string {
  let sign = "?";
  if (p.s < e && (str[p.s] === "-" || str[p.s] === "+")) {
    sign = str[p.s];
    p.s++;
  }
  return sign;
}

/** @internal `vendor/ruby/v3.3.11/rational.c:2338` `read_num`. */
function readNum(str: string, p: Cursor, end: number, out: { num: bigint; nexp: bigint }): boolean {
  let fn = 0n;
  let ok = false;

  out.nexp = 0n;
  out.num = 0n;
  if (p.s < end && str[p.s] !== ".") {
    const n = rbIntParseCstr(str, p);
    if (n == null) return false;
    out.num = n.n;
    ok = true;
  }

  if (p.s < end && str[p.s] === ".") {
    p.s++;
    const fp = rbIntParseCstr(str, p);
    if (fp == null) return true;
    out.nexp = BigInt(fp.count);
    const l = 10n ** out.nexp;
    out.num = out.num === 0n ? fp.n : out.num * l + fp.n;
    fn = BigInt(fp.count);
    ok = true;
  }

  if (ok && p.s + 1 < end && (str[p.s] === "e" || str[p.s] === "E")) {
    p.s++;
    const expsign = readSign(str, p, end);
    const parsed = rbIntParseCstr(str, p);
    if (parsed == null) return true;
    let exp = parsed.n;
    if (exp !== 0n) {
      if (expsign === "-") {
        if (fn !== 0n) exp = exp + fn;
      } else {
        if (fn !== 0n) exp = exp - fn;
        exp = -exp;
      }
      out.nexp = exp;
    }
  }

  return ok;
}

/** @internal `vendor/ruby/v3.3.11/rational.c:2398` `skip_ws`. */
function skipWs(str: string, s: number, e: number): number {
  while (s < e && " \t\n\v\f\r".includes(str[s])) ++s;
  return s;
}

const FIXNUM_MAX = 2n ** 62n - 1n;
const SQRT_LONG_MAX = 3037000499n;

/**
 * @internal `f_expt10` (`vendor/ruby/v3.3.11/rational.c:169`), `rb_int_pow(10, x)`:
 * `int_pow` (`numeric.c:4454-4491`) squares while `FIT_SQRT_LONG`, and hands the
 * rest to `rb_big_pow` (`bignum.c:6297-6309`), which answers a Float once
 * `xbits * yy` passes `BIGLEN_LIMIT`.
 */
function fExpt10(n: bigint): bigint | number {
  let x = 10n;
  let y = n;
  let z = 1n;
  if (y === 0n) return 1n;
  if (y === 1n) return x;
  if (y % 2n === 1n) z = x;
  y -= y % 2n;
  do {
    while (y % 2n === 0n) {
      if (x >= SQRT_LONG_MAX) return bigPow(x, y, z);
      x = x * x;
      y >>= 1n;
    }
    if (x * z > FIXNUM_MAX) return bigPow(x, y, z);
    z = x * z;
  } while (--y);
  return z;
}

/** @internal `vendor/ruby/v3.3.11/numeric.c:4485-4490`, `int_pow`'s `bignum:` arm
 * over `rb_big_pow`'s `BIGLEN_LIMIT` check (`bignum.c:6297-6309`). */
function bigPow(x: bigint, yy: bigint, z: bigint): bigint | number {
  const xbits = BigInt(x.toString(2).length);
  if (xbits * yy > 32n * 1024n * 1024n) return Infinity;
  const v = x ** yy;
  return z !== 1n ? z * v : v;
}

/** @internal `vendor/ruby/v3.3.11/rational.c:2406` `parse_rat`, strict and raising. */
function parseRat(str: string): Rational | number | null {
  const e = str.length;
  const p: Cursor = { s: skipWs(str, 0, e) };
  const sign = readSign(str, p, e);

  const n = { num: 0n, nexp: 0n };
  if (!readNum(str, p, e, n)) return null;
  let { num, nexp } = n;
  let den = 1n;
  if (p.s < e && str[p.s] === "/") {
    p.s++;
    const d = { num: 0n, nexp: 0n };
    if (!readNum(str, p, e, d)) {
      return null;
    } else if (d.num === 0n) {
      throw new ZeroDivisionError("divided by 0");
    } else if (skipWs(str, p.s, e) !== e) {
      return null;
    } else {
      den = d.num;
      nexp = nexp - d.nexp;
    }
  } else if (skipWs(str, p.s, e) !== e) {
    return null;
  }

  if (nexp !== 0n) {
    if (nexp < 0n) {
      const mul = nexp >= -FIXNUM_MAX - 1n && nexp <= FIXNUM_MAX ? fExpt10(-nexp) : Infinity;
      if (typeof mul !== "number") {
        num = num * mul;
      } else {
        return sign === "-" ? -Infinity : Infinity;
      }
    } else {
      const div = nexp >= -FIXNUM_MAX - 1n && nexp <= FIXNUM_MAX ? fExpt10(nexp) : Infinity;
      if (typeof div !== "number") {
        den = den * div;
      } else {
        return sign === "-" ? -0.0 : +0.0;
      }
    }
  }

  if (sign === "-") {
    num = -num;
  }

  return new Rational(num, den);
}

/** @internal `vendor/ruby/v3.3.11/rational.c:2476` `string_to_r_strict`. */
function stringToRStrict(self: string): Rational | number {
  const num = parseRat(self);
  if (num == null) {
    throw new ArgumentError(`invalid value for convert(): ${rbInspect(self)}`);
  }

  if (typeof num === "number" && num !== 0) {
    throw new FloatDomainError("Infinity");
  }
  return num;
}

classpaths.set(Rational, { path: "Rational", permanent: true });
