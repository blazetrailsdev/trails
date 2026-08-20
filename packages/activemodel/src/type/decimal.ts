import { BigDecimal } from "@blazetrails/activesupport";
import { Rational } from "@blazetrails/date";
import { ValueType } from "./value.js";
import { applyNumericMixin } from "./helpers/numeric.js";

const NumericValueType = applyNumericMixin(ValueType<BigDecimal | string>);

/** Mirrors: ActiveModel::Type::Decimal::BIGDECIMAL_PRECISION (decimal.rb:46). */
const BIGDECIMAL_PRECISION = 18;

export class DecimalType extends NumericValueType {
  readonly name: string = "decimal";

  type(): string {
    return this.name;
  }

  typeCastForSchema(value: unknown): string {
    // Rails: `value.to_s.inspect`. A cast decimal is a BigDecimal whose
    // default `to_s` is the fixed ("F") form, so dump that string (quoted)
    // rather than the object's field shape.
    if (value instanceof BigDecimal) return JSON.stringify(value.toString("F"));
    return JSON.stringify(value) ?? String(value);
  }

  /**
   * Mirrors: decimal.rb:57-74
   *
   *   def cast_value(value)
   *     casted_value = \
   *       case value
   *       when ::Float   then convert_float_to_big_decimal(value)
   *       when ::Numeric then BigDecimal(value, precision || BIGDECIMAL_PRECISION)
   *       when ::String
   *         begin
   *           value.to_d
   *         rescue ArgumentError
   *           BigDecimal(0)
   *         end
   *       else
   *         if value.respond_to?(:to_d)
   *           value.to_d
   *         else
   *           cast_value(value.to_s)
   *         end
   *       end
   *     apply_scale(casted_value)
   *   end
   *
   * BigDecimal has no NaN/±Infinity form, so those three values round-trip as
   * sentinel strings rather than BigDecimals — PG's `'NaN'`/`'Infinity'::numeric`
   * serialization reads them back out. Ruby has no such gap: `Float::NAN.to_d`
   * is BigDecimal::NAN.
   *
   * @internal Rails-private helper.
   */
  protected castValue(value: unknown): BigDecimal | string | null {
    if (value === null || value === undefined) return null;

    let castedValue: BigDecimal | string | null;
    if (typeof value === "number") {
      if (Number.isNaN(value)) return "NaN";
      if (value === Infinity) return "Infinity";
      if (value === -Infinity) return "-Infinity";
      castedValue = this.convertFloatToBigDecimal(value);
    } else if (
      value instanceof BigDecimal ||
      typeof value === "bigint" ||
      value instanceof Rational
    ) {
      // A Rational is the case that makes the significant-digit count matter
      // here rather than in the Float arm: it carries an exact fraction, so
      // `Rational(1, 3)` is `0.333333333333333333E0` at the default 18.
      castedValue = new BigDecimal(
        value instanceof BigDecimal ? value.toString("F") : value,
        this.precision ?? BIGDECIMAL_PRECISION,
      );
    } else if (typeof value === "string") {
      castedValue = toD(value);
    } else {
      const toDMethod = (value as { toD?: unknown }).toD;
      castedValue =
        typeof toDMethod === "function"
          ? (toDMethod as () => BigDecimal).call(value)
          : this.castValue(String(value));
    }

    return this.applyScale(castedValue);
  }

  /**
   * Mirrors: ActiveModel::Type::Decimal#convert_float_to_big_decimal
   * (decimal.rb:76-82).
   *
   *   def convert_float_to_big_decimal(value)
   *     if precision
   *       BigDecimal(apply_scale(value), float_precision)
   *     else
   *       value.to_d
   *     end
   *   end
   *
   * The inner `apply_scale` is load-bearing and runs first, exactly as Rails
   * has it — that ordering is what `decimal_test.rb:81-86` pins.
   *
   * @internal Rails-private helper.
   */
  protected convertFloatToBigDecimal(value: number): BigDecimal {
    if (this.precision !== undefined) {
      return new BigDecimal(this.applyScale(value), this.floatPrecision());
    }
    // `Float#to_d` reads the float's SHORTEST round-trip decimal string —
    // what `String(value)` yields — not its binary expansion.
    return new BigDecimal(String(value));
  }

  /**
   * Mirrors: ActiveModel::Type::Decimal#float_precision (decimal.rb:84-90).
   *
   *   def float_precision
   *     if precision.to_i > ::Float::DIG + 1
   *       ::Float::DIG + 1
   *     else
   *       precision.to_i
   *     end
   *   end
   *
   * Ruby `::Float::DIG` is 15 on IEEE-754 doubles; cap at 16 so we never
   * request more digits than the underlying representation can preserve.
   * `precision.to_i` on `nil` gives `0`, truncates fractional values toward
   * zero, and treats non-finite values as `0`.
   *
   * @internal Rails-private helper.
   */
  protected floatPrecision(): number {
    const raw = this.precision ?? 0;
    const p = Number.isFinite(raw) ? Math.trunc(raw) : 0;
    return p > 16 ? 16 : p;
  }

  /**
   * Mirrors: ActiveModel::Type::Decimal#apply_scale (decimal.rb:92-98).
   *
   *   def apply_scale(value)
   *     if scale
   *       value.round(scale)
   *     else
   *       value
   *     end
   *   end
   *
   * Ruby dispatches `round` on whatever the value is — a Float in the
   * `convert_float_to_big_decimal` call site, a BigDecimal in the `cast_value`
   * tail — and both round half away from zero, which is `BigDecimal#round`'s
   * default mode. The NaN/Infinity sentinel strings pass through untouched.
   *
   * @internal Rails-private helper.
   */
  protected applyScale(value: number): number;
  protected applyScale(value: BigDecimal | string | null): BigDecimal | string | null;
  protected applyScale(
    value: BigDecimal | string | number | null,
  ): BigDecimal | string | number | null {
    if (this.scale === undefined) return value;
    if (value instanceof BigDecimal) return value.round(this.scale);
    if (typeof value === "number") {
      return Number(new BigDecimal(String(value)).round(this.scale).toString("F"));
    }
    return value;
  }
}

/**
 * Ruby's `String#to_d` (`bigdecimal/util.rb`), which `cast_value`'s `::String`
 * arm calls: it parses a leading numeric prefix, silently drops everything
 * after it, and answers `BigDecimal(0)` when there is no leading number —
 * so its `rescue ArgumentError` arm is unreachable from a String.
 *
 * PG hands numeric NaN and ±Infinity back as those literal strings, and
 * `"NaN".to_d` / `"Infinity".to_d` yield BigDecimal NAN / INFINITY, which
 * trails carries as the same sentinel strings `cast_value` emits for the
 * Float case.
 */
function toD(value: string): BigDecimal | string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed === "NaN") return "NaN";
  if (trimmed === "Infinity") return "Infinity";
  if (trimmed === "-Infinity") return "-Infinity";
  const match = trimmed.match(/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/);
  try {
    return new BigDecimal(match ? match[0] : "0");
  } catch {
    // Adversarial exponents (e.g. "1e10000000") exceed BigDecimal's expansion
    // cap; leave the raw prefix untouched rather than answering a wrong value.
    return match ? match[0] : "0";
  }
}
