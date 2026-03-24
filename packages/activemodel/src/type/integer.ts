import { Type } from "./value.js";

export class IntegerType extends Type<number> {
  readonly name = "integer";

  cast(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") {
      if (isNaN(value)) return null;
      return Math.trunc(value);
    }
    const parsed = parseInt(String(value), 10);
    return isNaN(parsed) ? null : parsed;
  }
}
