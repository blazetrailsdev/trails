import { Type } from "./value.js";

export class BigIntegerType extends Type<bigint> {
  readonly name = "big_integer";

  cast(value: unknown): bigint | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "bigint") return value;
    if (typeof value === "string") {
      try {
        return BigInt(value.trim());
      } catch {
        return null;
      }
    }
    if (typeof value === "number" || typeof value === "boolean") {
      try {
        return BigInt(value);
      } catch {
        return null;
      }
    }
    return null;
  }

  serialize(value: unknown): string | null {
    const cast = this.cast(value);
    return cast !== null ? cast.toString() : null;
  }
}
