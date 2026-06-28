import { IntegerType } from "./integer.js";

export class BigIntegerType extends IntegerType {
  readonly name: string = "big_integer";

  // Mirrors Rails: `BigInteger < Integer` inherits `Integer#type`, hardcoded
  // `:integer`. Our `name` ("big_integer") is the type-registry key, not the
  // reflected column type — `column.type` for a bigint is `:integer`.
  override type(): string {
    return "integer";
  }

  override serializeCastValue(value: number | null): number | null {
    return this.ensureInRange(value);
  }

  /**
   * @internal Rails-private helper. Bigint columns are always 8 bytes; default
   * to 8 so the range check covers `[-2^63, 2^63-1]` when no explicit limit is set.
   */
  protected override _limit(): number {
    return this.limit ?? 8;
  }

  /**
   * @internal Rails-private helper. Uses BigInt arithmetic for BigInt cast values
   * so the check is exact (float comparison loses precision near 2^63).
   */
  protected override isInRange(value: number | null): boolean {
    if (value == null) return true;
    if (typeof value === "bigint") {
      const bytes = this._limit();
      const max = (1n << BigInt(bytes * 8 - 1)) - 1n;
      const min = -(1n << BigInt(bytes * 8 - 1));
      return value >= min && value <= max;
    }
    return super.isInRange(value);
  }

  override isSerializable(value: unknown): boolean {
    if (value == null) return true;
    if (typeof value === "bigint") return this.isInRange(value as unknown as number);
    return super.isSerializable(value);
  }

  /** @internal Rails-private helper. */
  protected override castValue(value: unknown): number | null {
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

  override serialize(value: unknown): unknown {
    return this.ensureInRange(this.cast(value));
  }
}
