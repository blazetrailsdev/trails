import { IntegerType } from "./integer.js";

export class BigIntegerType extends IntegerType {
  readonly name: string = "big_integer";

  /** @internal Rails-private helper. */
  protected castValue(value: unknown): number | null {
    if (typeof value === "bigint") return value as unknown as number;
    if (typeof value === "number") {
      if (isNaN(value) || !isFinite(value)) return null;
      return BigInt(Math.trunc(value)) as unknown as number;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return null;
      if (/^-?\d+$/.test(trimmed)) return BigInt(trimmed) as unknown as number;
    }
    return super.castValue(value);
  }

  serialize(value: unknown): unknown {
    // No range check — maxValue is Infinity. Return cast value as-is (matches Rails).
    return this.cast(value);
  }

  serializeCastValue(value: number | null): number | null {
    return value;
  }

  /**
   * @internal Rails-private helper. Returns Infinity to bypass Integer's range check.
   */
  protected maxValue(): number {
    return Number.POSITIVE_INFINITY;
  }
}
