import { Type } from "./value.js";

export class FloatType extends Type<number> {
  readonly name = "float";

  cast(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return value;
    const parsed = parseFloat(String(value));
    return isNaN(parsed) ? null : parsed;
  }
}
