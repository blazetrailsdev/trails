import { ValueType } from "./value.js";

export class FloatType extends ValueType<number> {
  readonly name = "float";

  /** @internal Rails-private helper. */
  protected castValue(value: unknown): number | null {
    if (typeof value === "number") return value;
    const parsed = parseFloat(String(value));
    return isNaN(parsed) ? null : parsed;
  }

  type(): string {
    return this.name;
  }

  typeCastForSchema(value: unknown): string {
    if (typeof value === "number") {
      if (isNaN(value)) return '"NaN"';
      if (value === Infinity) return '"Infinity"';
      if (value === -Infinity) return '"-Infinity"';
    }
    return JSON.stringify(value) ?? String(value);
  }
}
