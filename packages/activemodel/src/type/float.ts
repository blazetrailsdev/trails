import { ValueType } from "./value.js";
import { applyNumericMixin } from "./helpers/numeric.js";

const NumericValueType = applyNumericMixin(ValueType<number>);

export class FloatType extends NumericValueType {
  type(): string {
    return "float";
  }

  typeCastForSchema(value: unknown): unknown {
    if (typeof value === "number") {
      if (isNaN(value)) return "::Float::NAN";
      if (value === Infinity) return "::Float::INFINITY";
      if (value === -Infinity) return "-::Float::INFINITY";
    }
    return super.typeCastForSchema(value);
  }

  /** @internal */
  protected castValue(value: unknown): number | null {
    if (value instanceof Number || (typeof value === "number" && !Number.isInteger(value))) {
      return value as number;
    }
    if (value === "Infinity") return Number.POSITIVE_INFINITY;
    if (value === "-Infinity") return Number.NEGATIVE_INFINITY;
    if (value === "NaN") return Number.NaN;
    const parsed = typeof value === "number" ? value : parseFloat(String(value));
    const toF = isNaN(parsed) ? 0 : parsed;
    return (Number.isInteger(toF) ? new Number(toF) : toF) as number;
  }
}
