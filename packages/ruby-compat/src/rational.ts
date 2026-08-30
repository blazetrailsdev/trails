/**
 * Ruby's `Rational` (`vendor/ruby/rational.c:481` `nurat_s_canonicalize_internal`)
 * and the `Kernel#Rational()` conversion function beside it
 * (`vendor/ruby/rational.c:2691` `nurat_s_convert`). Ruby has both spellings
 * and Rails calls the function, so both ship here.
 */

/** Ruby core `ZeroDivisionError`, what `rb_num_zerodiv`
 * (`vendor/ruby/numeric.c:206`) raises for a denominator of zero.
 *
 * @noRailsEquivalent PERMANENT — Ruby core; Rails defines no such error. */
export class ZeroDivisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZeroDivisionError";
  }
}

/** @internal Ruby core `FloatDomainError`, a `RangeError`
 * (`vendor/ruby/numeric.c:6155`). `float_decode_internal`
 * (`vendor/ruby/rational.c:2168`) refuses a non-finite Float with it, with the
 * Float's own `to_s` as the message: on ruby 3.3.11
 * `Rational(Float::INFINITY, 1)` is `FloatDomainError: Infinity`. */
class FloatDomainError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "FloatDomainError";
  }
}

/** @internal `vendor/ruby/rational.c:292` `i_gcd`, the greatest common divisor a
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
 * @internal `vendor/ruby/rational.c:2199` `float_to_r`, which decodes a Float
 * into the exact `f * 2 ** e` its bits already hold
 * (`vendor/ruby/numeric.c` `float_decode_internal`, i.e. `frexp`) and answers
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
 * Ruby's `Rational` (`vendor/ruby/rational.c`), as much of it as its callers
 * need: the constructor canonicalizes to lowest terms
 * (`vendor/ruby/rational.c:481` `nurat_s_canonicalize_internal`), `+` adds an
 * Integer (`vendor/ruby/rational.c:724` `rb_rational_plus`), and
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
  /** `vendor/ruby/rational.c:580` `nurat_numerator` (`Rational#numerator`).
   *
   * Ruby's is an Integer — arbitrary precision — so a `bigint` is the JS
   * analogue, not a `number`: a `number` is exact only inside
   * `Number.MAX_SAFE_INTEGER` and a parsed fraction literal of more than
   * sixteen digits (`date_parse.c:2319-2325`) runs straight past it.
   *
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  readonly numerator: bigint;

  /** `vendor/ruby/rational.c:598` `nurat_denominator` (`Rational#denominator`).
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  readonly denominator: bigint;

  /**
   * `vendor/ruby/rational.c:481` `nurat_s_canonicalize_internal`, the C
   * constructor every `Rational` goes through — there is no public
   * `Rational.new` in Ruby, so this is `rb_rational_new`
   * (`vendor/ruby/rational.c:1969`) rather than a method with a Ruby name.
   * A Float argument goes through `float_to_r` ({@link floatToR}) — the
   * `nurat_convert` division arm, so `new Rational(0.5, 86400)` is `(1/172800)`
   * on ruby 3.3.11.
   *
   * `nurat_canonicalize` (`vendor/ruby/rational.c:457`) puts the SIGN on the
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

  /** `vendor/ruby/rational.c:1075` `rb_rational_cmp` (`Rational#<=>`), which
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

  /** `vendor/ruby/rational.c:724` `rb_rational_plus` (`Rational#+`), for the
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

  /** `vendor/ruby/rational.c:861` `rb_rational_mul` (`Rational#*`), for the
   * Integer multiplier this port needs. `f_muldiv`
   * (`vendor/ruby/rational.c:794`) cancels the multiplier against the
   * denominator BEFORE it multiplies.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  mul(other: number | bigint): Rational {
    const o = BigInt(other);
    const g = iGcd(o, this.denominator);
    return new Rational(this.numerator * (o / g), this.denominator / g);
  }

  /** `vendor/ruby/rational.c:903` `rb_rational_div` (`Rational#/`), for the
   * Integer divisor this port needs, cancelled the same way {@link mul} is.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  quo(other: number | bigint): Rational {
    const o = BigInt(other);
    const g = iGcd(this.numerator, o);
    return new Rational(this.numerator / g, this.denominator * (o / g));
  }

  /** `vendor/ruby/numeric.c:828` `num_zero_p` (`Rational#zero?`, inherited from
   * Numeric), what `date_core.c`'s `f_zero_p` dispatches to for a Rational.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  isZero(): boolean {
    return this.numerator === 0n;
  }

  /** `vendor/ruby/numeric.c:659` `num_div` (`Rational#div`, inherited from
   * Numeric), the floored quotient — the method `date_core.c`'s `f_idiv` macro
   * sends (`date_core.c:43`) — for the Integer divisor this port needs.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  div(other: number | bigint): number {
    const den = this.denominator * BigInt(other);
    const q = this.numerator / den;
    return Number(this.numerator % den !== 0n && this.numerator < 0n !== den < 0n ? q - 1n : q);
  }

  /** `vendor/ruby/numeric.c:700` `num_modulo` (`Rational#%`, inherited from
   * Numeric), which is `self - other * (self.div other)` there too — what
   * `date_core.c`'s `f_mod` dispatches to for a Rational — for the Integer
   * divisor this port needs.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  mod(other: number | bigint): Rational {
    return this.add(-BigInt(other) * BigInt(this.div(other)));
  }

  /** `vendor/ruby/rational.c:1278` `nurat_truncate` (`Rational#to_i`), which
   * truncates toward zero.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  toI(): number {
    return Number(this.numerator / this.denominator);
  }

  /** `vendor/ruby/rational.c:1287` `nurat_round_half_up` (`Rational#round`),
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
   * `vendor/ruby/rational.c:1576` `nurat_to_f`, which is what every reader that
   * hands the value to a floating-point API needs.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  toF(): number {
    return Number(this.numerator) / Number(this.denominator);
  }

  /** `vendor/ruby/rational.c:1802` `nurat_to_s` (`Rational#to_s`).
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  toString(): string {
    return `${this.numerator}/${this.denominator}`;
  }

  /** `vendor/ruby/rational.c:1818` `nurat_inspect` (`Rational#inspect`), which
   * parenthesizes where {@link toString} does not.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  inspect(): string {
    return `(${this.toString()})`;
  }
}

/**
 * `Kernel#Rational()` — `vendor/ruby/rational.c:2691` `nurat_s_convert`, whose
 * `rb_scan_args(argc, argv, "11", ...)` makes the denominator optional and
 * defaults it to `ONE` (`vendor/ruby/rational.c:2674`) before handing both to
 * `nurat_s_canonicalize_internal`. It is the spelling Rails writes — 20 call
 * sites across activesupport and activerecord — and it is NOT an Integer fold:
 * on ruby 3.3.11 `Rational(6, 1)` is `(6/1)` and its class is `Rational`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#Rational()`, which Rails
 * calls and does not define. */
export function rational(numv: number | bigint, denv: number | bigint = 1): Rational {
  return new Rational(numv, denv);
}
