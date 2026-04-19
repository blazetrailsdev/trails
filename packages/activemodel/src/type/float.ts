import { ValueType } from "./value.js";

export class FloatType extends ValueType<number> {
  readonly name = "float";

  cast(value: unknown): number | null {
    if (value === null || value === undefined) return null;
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
