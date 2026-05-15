import { IntegerType } from "./integer.js";

export class BigIntegerType extends IntegerType {
  readonly name: string = "big_integer";

  serializeCastValue(value: number | null): number | null {
    return value;
  }

  /**
   * @internal Rails-private helper. Returns Infinity to bypass Integer's range check.
   */
  protected maxValue(): number {
    return Number.POSITIVE_INFINITY;
  }

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
      // Extract a leading signed-digit run (e.g. "123abc" → 123n), matching Rails to_i behavior
      // for strings that start with digits. Unlike Ruby to_i, non-numeric strings return null
      // rather than 0 — consistent with IntegerType's parseInt/NaN → null path.
      // BigInt() rejects a leading "+"; strip it first.
      const lead = trimmed.match(/^([+-]?\d+)/)?.[1];
      if (!lead) return null;
      return BigInt(lead.startsWith("+") ? lead.slice(1) : lead) as unknown as number;
    }
    return super.castValue(value);
  }

  serialize(value: unknown): unknown {
    // No range check — maxValue is Infinity. Return cast value as-is (matches Rails).
    return this.cast(value);
  }
}
