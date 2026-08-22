/**
 * BigDecimal — arbitrary-precision decimal value.
 *
 * JS has no native arbitrary-precision decimal, so values are kept as
 * normalized digit strings (no float round-trip) to preserve precision.
 *
 * Mirrors: Ruby's `BigDecimal` together with the ActiveSupport core-ext that
 * defaults `#to_s` to the `"F"` (non-scientific, fixed) format. Both the
 * fixed (`"F"`) and engineering/scientific (`"E"`) forms are implemented.
 * (activesupport/lib/active_support/core_ext/big_decimal/conversions.rb)
 */

const MAX_EXPONENT_EXPANSION = 4000;

/**
 * The shape of a Ruby `Rational`, which `Kernel#BigDecimal` accepts as its
 * first argument. Structural and unexported rather than an import:
 * `Rational` lives in `@blazetrails/date`, which depends on this package.
 */
type RationalLike = { numerator: bigint; denominator: bigint };

export class BigDecimal {
  /** "-" for negative values, "" otherwise. Zero is non-negative. */
  readonly sign: "" | "-";
  /** Integer-part digits, leading zeros stripped (at least "0"). */
  readonly intDigits: string;
  /** Fractional-part digits, trailing zeros stripped (possibly ""). */
  readonly fracDigits: string;

  /**
   * Ruby `Kernel#BigDecimal(value, ndigits)`. `ndigits` is a count of
   * SIGNIFICANT decimal digits, not a fractional scale, and it only rounds
   * for the two arguments that carry more digits than a decimal can hold: a
   * Float and a Rational. For a String, an Integer or another BigDecimal it
   * is a minimum-precision hint and every digit survives — `BigDecimal(1234.5,
   * 3)` is `0.123e4` where `BigDecimal("1234.5", 3)` is `0.12345e4`
   * (verified on MRI 3.3).
   *
   * A Rational is expanded by exact long division over `bigint`s — never
   * through a float, which would lose digits well before the default
   * precision of 18 — and Ruby raises without a precision for one, since the
   * expansion is otherwise unbounded.
   */
  constructor(
    value: string | number | bigint | BigDecimal | { numerator: bigint; denominator: bigint },
    ndigits = 0,
  ) {
    const isRational = typeof value === "object" && !(value instanceof BigDecimal);
    const parsed = isRational
      ? parseRational(value, ndigits)
      : parse(value instanceof BigDecimal ? value.toString("F") : value);
    if (parsed === null) {
      throw new TypeError(`BigDecimal: cannot parse ${String(value)}`);
    }
    this.sign = parsed.sign;
    this.intDigits = parsed.intDigits;
    this.fracDigits = parsed.fracDigits;
    if (ndigits > 0 && (isRational || typeof value === "number")) {
      // Significant-digit rounding IS a fractional-scale round, offset by the
      // value's decimal exponent: 1234.5 at 3 digits rounds at scale -1, and
      // 0.00123456 at 3 digits rounds at scale 5.
      const rounded = this.round(ndigits - this.exponent());
      this.sign = rounded.sign;
      this.intDigits = rounded.intDigits;
      this.fracDigits = rounded.fracDigits;
    }
  }

  /**
   * Render the value. The default `"F"` format produces fixed (non-scientific)
   * notation with a trailing `.0` for whole numbers, matching ActiveSupport's
   * defaulted `BigDecimal#to_s`.
   *
   * Format flags (subset of Ruby's): a leading `+` prints a sign on
   * non-negative values, a leading space prints a space instead; an integer
   * `n` inserts a space every `n` digits counting outward from the decimal
   * point; a trailing `F`/`f` selects fixed notation.
   *
   * The engineering/scientific `"E"`/`"e"` form normalizes the value to
   * `0.<digits>e<exp>` (mantissa in `[0.1, 1)`, exponent the power of ten),
   * matching Ruby's `BigDecimal#to_s`. The output exponent marker is always a
   * lowercase `e`; the grouping flag spaces the mantissa digits from the left.
   */
  toString(format = "F"): string {
    const { signFlag, group, scientific } = parseFormat(format);
    let prefix = "";
    if (this.sign === "-") prefix = "-";
    else if (signFlag === "+") prefix = "+";
    else if (signFlag === " ") prefix = " ";
    if (scientific) return `${prefix}${this.toScientific(group)}`;
    const frac = this.fracDigits === "" ? "0" : this.fracDigits;
    const intPart = group > 0 ? groupFromRight(this.intDigits, group) : this.intDigits;
    const fracPart = group > 0 ? groupFromLeft(frac, group) : frac;
    return `${prefix}${intPart}.${fracPart}`;
  }

  /**
   * Encode as a JSON string in fixed ("F") form, mirroring ActiveSupport's
   * `BigDecimal#as_json` (which returns the value, encoded as a string by the
   * JSON encoder to avoid the float precision loss a bare JSON number would
   * incur). Without this, `JSON.stringify` would emit the internal
   * `{sign, intDigits, fracDigits}` shape.
   */
  toJSON(): string {
    return this.toString("F");
  }

  /**
   * Ruby `BigDecimal#to_i` — the integer part, truncated toward zero
   * (`BigDecimal("7.9").to_i == 7`, `BigDecimal("-7.9").to_i == -7`,
   * `BigDecimal("-0.4").to_i == 0`, verified on MRI 3.3).
   *
   * A BigDecimal is a `::Numeric`, so this is the conversion
   * `ActiveModel::Type::Integer#cast_value`'s `value.to_i` (integer.rb:90)
   * performs when a decimal aggregate is cast to an integer column's type —
   * without it that cast has nothing to call and answers nil.
   *
   * Digits beyond float64's safe-integer range keep their exact value as a
   * `bigint` carried under a `number` cast, the convention the numeric type
   * primitives already use (see `IntegerType#narrowBigInt`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `BigDecimal`, not Rails.
   * `conversions.rb` only adds `to_s`/`to_formatted_s`/`as_json` to a class MRI
   * already ships.
   */
  toI(): number {
    const magnitude = BigInt(this.intDigits === "" ? "0" : this.intDigits);
    const signed = this.sign === "-" ? -magnitude : magnitude;
    const num = Number(signed);
    return Number.isSafeInteger(num) ? num : (signed as unknown as number);
  }

  /**
   * Ruby `BigDecimal#to_f`, which the number helpers reach through
   * `Kernel.Float` (`number_to_human_size_converter.rb:12`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `BigDecimal`, not Rails.
   * `conversions.rb` only adds `to_s`/`to_formatted_s`/`as_json` to a class MRI
   * already ships.
   */
  toF(): number {
    return Number(this.toString("F"));
  }

  /**
   * Ruby `BigDecimal#zero?`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `BigDecimal`, not Rails.
   * `conversions.rb` only adds `to_s`/`to_formatted_s`/`as_json` to a class MRI
   * already ships; the arithmetic Rails' own number helpers call on it
   * (`number_to_currency_converter.rb:13-16` alone uses `negative?`, `abs`, `*`
   * and `>=`) has to exist here for those ports to have anything to call.
   */
  isZero(): boolean {
    return !/[1-9]/.test(this.intDigits + this.fracDigits);
  }

  /**
   * Ruby `BigDecimal#negative?` — zero is neither positive nor negative.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `BigDecimal`, not Rails.
   * `conversions.rb` only adds `to_s`/`to_formatted_s`/`as_json` to a class MRI
   * already ships; the arithmetic Rails' own number helpers call on it
   * (`number_to_currency_converter.rb:13-16` alone uses `negative?`, `abs`, `*`
   * and `>=`) has to exist here for those ports to have anything to call.
   */
  isNegative(): boolean {
    return this.sign === "-" && !this.isZero();
  }

  /**
   * Ruby `BigDecimal#abs`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `BigDecimal`, not Rails.
   * `conversions.rb` only adds `to_s`/`to_formatted_s`/`as_json` to a class MRI
   * already ships; the arithmetic Rails' own number helpers call on it
   * (`number_to_currency_converter.rb:13-16` alone uses `negative?`, `abs`, `*`
   * and `>=`) has to exist here for those ports to have anything to call.
   */
  abs(): BigDecimal {
    return this.sign === "-"
      ? BigDecimal.fromUnscaled(this.unscaled(-1), this.fracDigits.length)
      : this;
  }

  /**
   * Ruby `BigDecimal#mult` (and `*`); the product is exact.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `BigDecimal`, not Rails.
   * `conversions.rb` only adds `to_s`/`to_formatted_s`/`as_json` to a class MRI
   * already ships; the arithmetic Rails' own number helpers call on it
   * (`number_to_currency_converter.rb:13-16` alone uses `negative?`, `abs`, `*`
   * and `>=`) has to exist here for those ports to have anything to call.
   */
  mult(other: BigDecimal): BigDecimal {
    return BigDecimal.fromUnscaled(
      this.unscaled() * other.unscaled(),
      this.fracDigits.length + other.fracDigits.length,
    );
  }

  /**
   * Ruby `BigDecimal#<=>`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `BigDecimal`, not Rails.
   * `conversions.rb` only adds `to_s`/`to_formatted_s`/`as_json` to a class MRI
   * already ships; the arithmetic Rails' own number helpers call on it
   * (`number_to_currency_converter.rb:13-16` alone uses `negative?`, `abs`, `*`
   * and `>=`) has to exist here for those ports to have anything to call.
   */
  compare(other: BigDecimal): number {
    const scale = Math.max(this.fracDigits.length, other.fracDigits.length);
    const left = this.unscaledAt(scale);
    const right = other.unscaledAt(scale);
    return left < right ? -1 : left > right ? 1 : 0;
  }

  /**
   * Ruby `BigDecimal#round(n, mode)`. `mode` is the rounding mode Symbol
   * `RoundingHelper#round` forwards (`rounding_helper.rb:16`); it defaults to
   * `:default`, i.e. ROUND_HALF_UP — ties away from zero. A negative `n`
   * rounds to a multiple of `10 ** -n`, which is how the significant-digit
   * path of `RoundingHelper#absolute_precision` uses it. Ruby answers an
   * Integer for `n <= 0`; there is no separate Integer here, so the value
   * comes back as a `BigDecimal` with no fractional digits.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `BigDecimal`, not Rails.
   * `conversions.rb` only adds `to_s`/`to_formatted_s`/`as_json` to a class MRI
   * already ships; the arithmetic Rails' own number helpers call on it
   * (`number_to_currency_converter.rb:13-16` alone uses `negative?`, `abs`, `*`
   * and `>=`) has to exist here for those ports to have anything to call.
   */
  round(n = 0, mode = ":default"): BigDecimal {
    if (n >= this.fracDigits.length) return this;
    const digits = this.intDigits + this.fracDigits;
    const keepCount = this.intDigits.length + n;
    const kept = keepCount > 0 ? digits.slice(0, keepCount) : "";
    const rest = keepCount > 0 ? digits.slice(keepCount) : "0".repeat(-keepCount) + digits;
    let value = BigInt(kept === "" ? "0" : kept);
    if (roundsAway(rest, kept, this.sign === "-", mode)) value += 1n;
    if (n < 0) value *= 10n ** BigInt(-n);
    return BigDecimal.fromUnscaled(this.sign === "-" ? -value : value, Math.max(n, 0));
  }

  /**
   * Ruby `BigDecimal#exponent` — the power of ten of the value's leading
   * significant digit under the `0.<digits>e<exp>` normalization, and `0` for
   * zero.
   */
  private exponent(): number {
    const allDigits = this.intDigits + this.fracDigits;
    const stripped = allDigits.replace(/^0+/, "");
    if (stripped === "") return 0;
    return this.intDigits.length - (allDigits.length - stripped.length);
  }

  /** Digits as one integer, scaled by `10 ** fracDigits.length`. */
  private unscaled(signum = 1): bigint {
    const magnitude = BigInt(this.intDigits + this.fracDigits);
    return this.sign === "-" && signum > 0 ? -magnitude : magnitude;
  }

  /** {@link unscaled}, re-scaled to `10 ** scale`. */
  private unscaledAt(scale: number): bigint {
    return this.unscaled() * 10n ** BigInt(scale - this.fracDigits.length);
  }

  private static fromUnscaled(value: bigint, scale: number): BigDecimal {
    const negative = value < 0n;
    const digits = (negative ? -value : value).toString().padStart(scale + 1, "0");
    const intPart = digits.slice(0, digits.length - scale);
    const fracPart = scale > 0 ? digits.slice(digits.length - scale) : "0";
    return new BigDecimal(`${negative ? "-" : ""}${intPart}.${fracPart}`);
  }

  /** Render as `0.<digits>e<exp>` (Ruby's `"E"` form, sans sign prefix). */
  private toScientific(group: number): string {
    const allDigits = this.intDigits + this.fracDigits;
    const mantissa = allDigits.replace(/^0+/, "").replace(/0+$/, "");
    if (mantissa === "") return "0.0";
    const digits = group > 0 ? groupFromLeft(mantissa, group) : mantissa;
    return `0.${digits}e${this.exponent()}`;
  }
}

/**
 * Whether the digits `rest` dropped by {@link BigDecimal.round} push the kept
 * magnitude one unit further from zero under `mode`.
 *
 * A Ruby Symbol option value is a `":name"` string in trails, and the
 * camelCased spelling is accepted alongside the Ruby one. `:up` is
 * BigDecimal's ROUND_UP — away from zero — not "half up".
 */
function roundsAway(rest: string, kept: string, negative: boolean, mode: string): boolean {
  const nonZero = /[1-9]/.test(rest);
  if (!nonZero) return false;
  const first = Number(rest[0]);
  switch (mode.replace(/^:/, "")) {
    case "up":
      return true;
    case "down":
    case "truncate":
      return false;
    case "ceiling":
    case "ceil":
      return !negative;
    case "floor":
      return negative;
    case "half_down":
    case "halfDown":
      return first > 5 || (first === 5 && /[1-9]/.test(rest.slice(1)));
    case "half_even":
    case "halfEven":
    case "even":
    case "banker":
      if (first !== 5) return first > 5;
      if (/[1-9]/.test(rest.slice(1))) return true;
      return Number(kept.slice(-1) || 0) % 2 === 1;
    default:
      return first >= 5;
  }
}

function parseFormat(format: string): {
  signFlag: "" | "+" | " ";
  group: number;
  scientific: boolean;
} {
  const m = format.match(/^([+ ]?)(\d*)([eEfF]?)$/);
  if (!m) return { signFlag: "", group: 0, scientific: false };
  const signFlag = (m[1] as "" | "+" | " ") || "";
  const group = m[2] ? Number(m[2]) : 0;
  const scientific = m[3] === "e" || m[3] === "E";
  return { signFlag, group, scientific };
}

/** Group digits with a space every `n`, counting from the right. */
function groupFromRight(s: string, n: number): string {
  let out = "";
  let count = 0;
  for (let i = s.length - 1; i >= 0; i -= 1) {
    out = s[i] + out;
    count += 1;
    if (count % n === 0 && i !== 0) out = ` ${out}`;
  }
  return out;
}

/** Group digits with a space every `n`, counting from the left. */
function groupFromLeft(s: string, n: number): string {
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    if (i > 0 && i % n === 0) out += " ";
    out += s[i];
  }
  return out;
}

/**
 * Expand a `Rational` to a decimal string by exact long division, carrying
 * two guard digits past the requested significant-digit count so the
 * constructor's rounding step sees a correctly-rounded tail.
 */
function parseRational(
  value: RationalLike,
  ndigits: number,
): { sign: "" | "-"; intDigits: string; fracDigits: string } | null {
  if (ndigits <= 0) {
    // Ruby raises `ArgumentError` here. This module has no runtime imports by
    // construction, and ActiveSupport's `ArgumentError` would drag the
    // `time-with-zone` graph in behind it, so it reuses the `TypeError` this
    // file already throws for an unparseable value — the message is Ruby's.
    throw new TypeError("can't omit precision for a Rational.");
  }
  const negative = value.numerator < 0n !== value.denominator < 0n;
  const sign: "" | "-" = negative ? "-" : "";
  const n = value.numerator < 0n ? -value.numerator : value.numerator;
  const d = value.denominator < 0n ? -value.denominator : value.denominator;
  if (d === 0n) return null;
  if (n === 0n) return { sign: "", intDigits: "0", fracDigits: "" };

  let fracNeeded: number;
  const intPartDigits = n / d;
  if (intPartDigits > 0n) {
    fracNeeded = Math.max(ndigits - intPartDigits.toString().length, 0) + 2;
  } else {
    // Leading fractional zeros are not significant digits, so expand past
    // them before asking for `ndigits` more.
    let leadingZeros = 0;
    for (let x = n * 10n; x < d && leadingZeros < MAX_EXPONENT_EXPANSION; x *= 10n) leadingZeros++;
    fracNeeded = leadingZeros + ndigits + 2;
  }
  const scaled = ((n * 10n ** BigInt(fracNeeded)) / d).toString().padStart(fracNeeded + 1, "0");
  return parse(
    `${sign}${scaled.slice(0, scaled.length - fracNeeded)}.${scaled.slice(scaled.length - fracNeeded)}`,
  );
}

function parse(
  value: string | number | bigint,
): { sign: "" | "-"; intDigits: string; fracDigits: string } | null {
  if (typeof value === "bigint") {
    const negative = value < 0n;
    return {
      sign: negative ? "-" : "",
      intDigits: (negative ? -value : value).toString(),
      fracDigits: "",
    };
  }
  const raw = String(value).trim();
  if (raw === "") return null;
  let s = raw;
  let sign: "" | "-" = "";
  if (s.startsWith("-")) {
    sign = "-";
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  const m = s.match(/^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!m) return null;
  if (m[1] === "" && (m[2] ?? "") === "") return null;
  let intPart = m[1] || "0";
  let fracPart = m[2] ?? "";
  const exp = m[3] ? Number(m[3]) : 0;
  // Ruby BigDecimal accepts arbitrarily large exponents; this cap is a
  // TS-specific guard so adversarial input (e.g. "1e10000000") can't drive
  // the digit-expansion below into multi-gigabyte string allocation.
  if (Math.abs(exp) > MAX_EXPONENT_EXPANSION) {
    throw new RangeError(
      `BigDecimal: exponent magnitude exceeds the ${MAX_EXPONENT_EXPANSION}-digit expansion limit (TS-specific guard against unbounded allocation)`,
    );
  }
  if (exp > 0) {
    if (fracPart.length >= exp) {
      intPart += fracPart.slice(0, exp);
      fracPart = fracPart.slice(exp);
    } else {
      intPart += fracPart.padEnd(exp, "0");
      fracPart = "";
    }
  } else if (exp < 0) {
    const shift = -exp;
    if (intPart.length > shift) {
      fracPart = intPart.slice(intPart.length - shift) + fracPart;
      intPart = intPart.slice(0, intPart.length - shift);
    } else {
      fracPart = intPart.padStart(shift, "0") + fracPart;
      intPart = "0";
    }
  }
  intPart = intPart.replace(/^0+(?=\d)/, "") || "0";
  fracPart = fracPart.replace(/0+$/, "");
  if (intPart === "0" && fracPart === "") sign = "";
  return { sign, intDigits: intPart, fracDigits: fracPart };
}

/**
 * Ruby's `Kernel.Float` — the strict decimal parse Rails reaches for directly
 * (`activemodel/lib/active_model/validations/numericality.rb:82`). It honors
 * `to_f` on a non-Numeric object and raises `ArgumentError`/`TypeError`
 * otherwise; every Rails call site rescues both, so the unparseable cases
 * answer `undefined` here rather than throwing.
 *
 * JS `Number()` and `Kernel.Float` disagree in three places trails has to
 * close by hand: `Number()` reads `0b…` and `0o…` literals, which Ruby
 * rejects; it coerces `""` and whitespace to `0`, which Ruby rejects; and it
 * rejects the `1_000` digit separators Ruby accepts. `0x…` is read by both
 * (`Float("0x10")` is 16.0 on MRI 3.3).
 *
 * @noRailsEquivalent PERMANENT — Ruby core (Kernel.Float), which Rails calls
 * without defining, so there is no Ruby file in any gem for the port to
 * mirror.
 */
export function kernelFloat(rawValue: unknown): number | undefined {
  if (rawValue !== null && typeof rawValue === "object") {
    const toF = (rawValue as { toF?: unknown }).toF;
    return typeof toF === "function" ? (toF as () => number).call(rawValue) : undefined;
  }
  if (typeof rawValue === "number") return rawValue;
  if (typeof rawValue !== "string") return undefined;
  if (rawValue.trim() === "") return undefined;
  // Kernel.Float strips leading whitespace before parsing, so "  0b1" is
  // rejected too.
  if (NON_DECIMAL_LITERAL_REGEX.test(rawValue.trimStart())) return undefined;
  const coerced = Number(rawValue.replace(DIGIT_SEPARATOR_REGEX, ""));
  return Number.isNaN(coerced) ? undefined : coerced;
}

/** The literal prefixes `Number()` reads and `Kernel.Float` rejects. */
const NON_DECIMAL_LITERAL_REGEX = /^[+-]?0[bBoO]/;

/** Ruby's `1_000` digit separator, which `Number()` does not read. */
const DIGIT_SEPARATOR_REGEX = /(?<=\d)_(?=\d)/g;
