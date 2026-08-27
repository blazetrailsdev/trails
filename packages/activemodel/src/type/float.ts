import { ValueType } from "./value.js";
import { applyNumericMixin } from "./helpers/numeric.js";

const NumericValueType = applyNumericMixin(ValueType<number>);

export class FloatType extends NumericValueType {
  readonly name = "float";

  type(): string {
    return this.name;
  }

  typeCastForSchema(value: unknown): string {
    if (typeof value === "number") {
      if (isNaN(value)) return "::Float::NAN";
      if (value === Infinity) return "::Float::INFINITY";
      if (value === -Infinity) return "-::Float::INFINITY";
    }
    return super.typeCastForSchema(value);
  }

  /** @internal */
  protected castValue(value: unknown): number | null {
    if (typeof value === "number") return value;
    if (value === "Infinity") return Number.POSITIVE_INFINITY;
    if (value === "-Infinity") return Number.NEGATIVE_INFINITY;
    if (value === "NaN") return Number.NaN;
    const parsed = parseFloat(String(value));
    return isNaN(parsed) ? 0 : parsed;
  }
}
