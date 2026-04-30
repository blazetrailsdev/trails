import { ValueType } from "./value.js";

export class DecimalType extends ValueType<string> {
  readonly name: string = "decimal";

  // JS has no BigDecimal, so we represent decimals as strings to avoid
  // losing precision through IEEE-754 floats. Rails' `cast_value`:
  //   - Numeric  -> BigDecimal(value)
  //   - String   -> value.to_d  (returns BigDecimal(0) on invalid)
  //   - nil      -> nil
  // We mirror the same shape, returning the string form rather than a
  // BigDecimal wrapper.
  /** @internal Rails-private helper. */
  protected castValue(value: unknown): string | null {
    const casted = this._castWithoutScale(value);
    return this.applyScale(casted);
  }

  /**
   * Apply Rails' `scale:` option to a decimal string, rounding to the
   * configured number of fractional digits using Ruby's default
   * `BigDecimal#round` mode (`ROUND_HALF_UP` — half away from zero).
   *
   * Mirrors: ActiveModel::Type::Decimal#apply_scale
   * (activemodel/lib/active_model/type/decimal.rb).
   */
  protected applyScale(value: string | null): string | null {
    if (value === null) return null;
    if (this.scale === undefined) return value;
    // Ruby `BigDecimal#round(n)` only accepts an Integer argument; a
    // non-integer or negative TS `scale:` option would just misfire our
    // slice/charCodeAt math, so leave the value untouched rather than
    // invent new semantics.
    if (!Number.isInteger(this.scale) || this.scale < 0) return value;
    return roundHalfUpToScale(value, this.scale);
  }

  private _castWithoutScale(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return null;
      // Rails dispatches Float through `convert_float_to_big_decimal`
      // (decimal.rb:75-81). Route every JS number through the same hook
      // so a configured `precision:` applies the same significant-digit
      // rounding per Rails; integer-valued inputs may still change when
      // the value has more digits than `floatPrecision()` preserves.
      return this.convertFloatToBigDecimal(value);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return null;
      // Rails' `String#to_d` parses a leading numeric prefix and
      // silently drops everything after, returning `BigDecimal(0)` if
      // no leading number is present. Tests assert, e.g.,
      // `"1ignore" -> BigDecimal("1")`, `"bad" -> BigDecimal("0")`.
      const match = trimmed.match(/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/);
      return match ? match[0] : "0";
    }
    return null;
  }

  /**
   * Mirrors the float-conversion portion of
   * ActiveModel::Type::Decimal#convert_float_to_big_decimal
   * (decimal.rb:75-81).
   *
   *   def convert_float_to_big_decimal(value)
   *     if precision
   *       BigDecimal(apply_scale(value), float_precision)
   *     else
   *       value.to_d
   *     end
   *   end
   *
   * Trails keeps the same overall cast pipeline but applies `scale:`
   * later via the outer `castValue() → applyScale(...)` step rather
   * than inside this helper, so the inner `apply_scale(value)` call
   * Rails makes here is intentionally elided. Trails has no
   * BigDecimal — decimals are strings — so the precision-sensitive
   * portion translates to "round to `floatPrecision()` significant
   * digits". When no precision is configured, fall through to
   * `String(value)` (the same form `_castWithoutScale` would
   * otherwise emit).
   *
   * @internal Rails-private helper.
   */
  protected convertFloatToBigDecimal(value: number): string {
    if (this.precision === undefined) return String(value);
    const precision = this.floatPrecision();
    if (precision <= 0) return String(value);
    return roundFloatToSignificantDigits(value, precision);
  }

  /**
   * Mirrors: ActiveModel::Type::Decimal#float_precision (decimal.rb:83-89).
   *
   *   def float_precision
   *     if precision.to_i > ::Float::DIG + 1
   *       ::Float::DIG + 1
   *     else
   *       precision.to_i
   *     end
   *   end
   *
   * Ruby `::Float::DIG` is 15 on IEEE-754 doubles; cap at 16 so we
   * never request more digits than the underlying representation can
   * preserve. `precision.to_i` on `nil` gives `0`, truncates
   * fractional values toward zero, and treats non-finite values as
   * `0` — mirror that exactly so a fractional or NaN `precision:`
   * doesn't trip `Number#toPrecision`'s integer requirement.
   *
   * @internal Rails-private helper.
   */
  protected floatPrecision(): number {
    const raw = this.precision ?? 0;
    const p = Number.isFinite(raw) ? Math.trunc(raw) : 0;
    return p > 16 ? 16 : p;
  }

  type(): string {
    return this.name;
  }

  typeCastForSchema(value: unknown): string {
    return JSON.stringify(value) ?? String(value);
  }
}

/**
 * Round a JS number to `precision` significant digits, returning the
 * decimal string. Used by `convertFloatToBigDecimal` to emulate
 * Ruby's `BigDecimal(value, precision)`. Returns `String(value)` when
 * `precision <= 0` (Rails treats `precision: nil` as no rounding).
 */
function roundFloatToSignificantDigits(value: number, precision: number): string {
  if (precision <= 0 || !Number.isFinite(value)) return String(value);
  // Number#toPrecision may emit scientific notation for very small / large
  // magnitudes. Re-parse to a JS number for canonical rounding, then expand
  // any exponent form back into a plain decimal string so the emitted value
  // matches the rest of the cast pipeline (which feeds applyScale's regex
  // matcher — that one rejects exponent forms).
  const rounded = Number(value.toPrecision(precision));
  const parts = splitDecimal(String(rounded));
  if (!parts) return String(rounded);
  const { sign, intPart, fracPart } = parts;
  return fracPart.length > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
}

const MAX_EXPONENT_EXPANSION = 4000;

/**
 * Normalize a decimal-string representation (including scientific notation
 * as emitted by JS `String(1e-7)`) into `sign` + integer + fractional
 * parts. Exponent magnitude is capped at `MAX_EXPONENT_EXPANSION` so
 * adversarial input like `"1e10000000"` can't drive `padEnd`/`padStart`
 * into allocating multi-gigabyte strings; over the cap we return null and
 * callers leave the raw form alone.
 */

function splitDecimal(raw: string): { sign: "" | "-"; intPart: string; fracPart: string } | null {
  let s = raw;
  let sign: "" | "-" = "";
  if (s.startsWith("-")) {
    sign = "-";
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  // Accept the same numeric forms `_castWithoutScale` emits: `1`, `1.`,
  // `.5`, `1.5`, `1e3`, `1.e3`. Reject input with no digits at all.
  const m = s.match(/^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!m) return null;
  if (m[1] === "" && (m[2] ?? "") === "") return null;
  let intPart = m[1] || "0";
  let fracPart = m[2] ?? "";
  const exp = m[3] ? Number(m[3]) : 0;
  if (Math.abs(exp) > MAX_EXPONENT_EXPANSION) return null;
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
  return { sign, intPart: intPart.replace(/^0+(?=\d)/, "") || "0", fracPart };
}

function roundHalfUpToScale(raw: string, scale: number): string {
  const parts = splitDecimal(raw);
  if (!parts) return raw;
  const { sign, intPart, fracPart } = parts;
  if (fracPart.length <= scale) {
    const padded = scale > 0 ? `.${fracPart.padEnd(scale, "0")}` : "";
    return `${sign}${intPart}${padded}`;
  }
  const keep = fracPart.slice(0, scale);
  const roundDigit = fracPart.charCodeAt(scale) - 48; // '0' → 0
  if (roundDigit < 5) {
    return scale > 0 ? `${sign}${intPart}.${keep}` : `${sign}${intPart}`;
  }
  // Carry: half-away-from-zero bumps magnitude by 1 ulp at position `scale`.
  const out = incrementDecimalDigits(intPart + keep);
  const newIntLen = out.length - scale;
  const newInt = out.slice(0, newIntLen);
  const newFrac = out.slice(newIntLen);
  return scale > 0 ? `${sign}${newInt}.${newFrac}` : `${sign}${newInt}`;
}

/**
 * Increment a run of ASCII digits by 1 with carry, returning a new
 * string. Uses no intermediate arrays so a multi-million-digit input
 * doesn't blow up memory.
 */
function incrementDecimalDigits(digits: string): string {
  let i = digits.length - 1;
  while (i >= 0 && digits.charCodeAt(i) === 57 /* "9" */) {
    i -= 1;
  }
  if (i < 0) {
    return `1${"0".repeat(digits.length)}`;
  }
  const incremented = String.fromCharCode(digits.charCodeAt(i) + 1);
  return `${digits.slice(0, i)}${incremented}${"0".repeat(digits.length - i - 1)}`;
}
