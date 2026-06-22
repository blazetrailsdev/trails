import { ValueType } from "./value.js";
import { applyNumericMixin } from "./helpers/numeric.js";

const NumericValueType = applyNumericMixin(ValueType<number>);

export class FloatType extends NumericValueType {
  readonly name = "float";

  type(): string {
    return this.name;
  }

  typeCastForSchema(value: unknown): string {
    // Mirrors Rails float.rb#type_cast_for_schema: the float specials dump as
    // bare Ruby constants so the schema reload re-applies them as Float values.
    if (typeof value === "number") {
      if (isNaN(value)) return "::Float::NAN";
      if (value === Infinity) return "::Float::INFINITY";
      if (value === -Infinity) return "-::Float::INFINITY";
    }
    return super.typeCastForSchema(value);
  }

  /** @internal Rails-private helper. */
  protected castValue(value: unknown): number | null {
    if (typeof value === "number") return value;
    // Case-sensitive exact match mirrors Rails float.rb:53-60; "nan"/"infinity" are not valid.
    if (value === "Infinity") return Number.POSITIVE_INFINITY;
    if (value === "-Infinity") return Number.NEGATIVE_INFINITY;
    if (value === "NaN") return Number.NaN;
    const parsed = parseFloat(String(value));
    return isNaN(parsed) ? null : parsed;
  }
}
