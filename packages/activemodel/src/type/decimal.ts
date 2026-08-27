import { BigDecimal } from "@blazetrails/activesupport";
import { Rational } from "@blazetrails/date";
import { ValueType } from "./value.js";
import { applyNumericMixin } from "./helpers/numeric.js";

const NumericValueType = applyNumericMixin(ValueType<BigDecimal | string>);

const BIGDECIMAL_PRECISION = 18;

export class DecimalType extends NumericValueType {
  readonly name: string = "decimal";

  type(): string {
    return this.name;
  }

  typeCastForSchema(value: unknown): string {
    if (value instanceof BigDecimal) return JSON.stringify(value.toString("F"));
    return JSON.stringify(value) ?? String(value);
  }

  /** @internal */
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
      castedValue = new BigDecimal(value, this.precision ?? BIGDECIMAL_PRECISION);
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
    return match ? match[0] : "0";
  }
}
