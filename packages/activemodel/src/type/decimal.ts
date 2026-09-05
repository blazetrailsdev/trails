import { BigDecimal, toD } from "@blazetrails/activesupport";
import { rbInspect as inspect } from "@blazetrails/ruby-compat";
import { Rational } from "@blazetrails/ruby-compat";
import { ValueType } from "./value.js";
import { applyNumericMixin } from "./helpers/numeric.js";

const NumericValueType = applyNumericMixin(ValueType<BigDecimal>);

const BIGDECIMAL_PRECISION = 18;

export class DecimalType extends NumericValueType {
  type(): string {
    return "decimal";
  }

  typeCastForSchema(value: unknown): string {
    return inspect(value === null || value === undefined ? "" : String(value));
  }

  /** @internal */
  protected castValue(value: unknown): BigDecimal | null {
    if (value === null || value === undefined) return null;

    let castedValue: BigDecimal | null;
    if (typeof value === "number") {
      castedValue = this.convertFloatToBigDecimal(value);
    } else if (
      value instanceof BigDecimal ||
      typeof value === "bigint" ||
      value instanceof Rational
    ) {
      castedValue = new BigDecimal(value, this.precision ?? BIGDECIMAL_PRECISION);
    } else if (typeof value === "string") {
      try {
        castedValue = toD(value);
      } catch {
        castedValue = new BigDecimal(0);
      }
    } else {
      const toDMethod = (value as { toD?: unknown }).toD;
      castedValue =
        typeof toDMethod === "function"
          ? (toDMethod as () => BigDecimal).call(value)
          : this.castValue(String(value));
    }

    return this.applyScale(castedValue);
  }

  /** @internal */
  protected convertFloatToBigDecimal(value: number): BigDecimal {
    if (this.precision !== undefined) {
      return new BigDecimal(this.applyScale(value), this.floatPrecision());
    }
    return new BigDecimal(String(value));
  }

  /** @internal */
  protected floatPrecision(): number {
    const raw = this.precision ?? 0;
    const p = Number.isFinite(raw) ? Math.trunc(raw) : 0;
    return p > 16 ? 16 : p;
  }

  /** @internal */
  protected applyScale(value: number): number;
  protected applyScale(value: BigDecimal | null): BigDecimal | null;
  protected applyScale(value: BigDecimal | number | null): BigDecimal | number | null {
    if (this.scale === undefined) return value;
    if (value instanceof BigDecimal) return value.round(this.scale);
    if (typeof value === "number") {
      return Number(new BigDecimal(String(value)).round(this.scale).toString("F"));
    }
    return value;
  }
}
