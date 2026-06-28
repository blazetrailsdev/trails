import { IntegerType } from "./integer.js";

export class BigIntegerType extends IntegerType {
  readonly name: string = "big_integer";

  // Mirrors Rails: `BigInteger < Integer` inherits `Integer#type`, hardcoded
  // `:integer`. Our `name` ("big_integer") is the type-registry key, not the
  // reflected column type — `column.type` for a bigint is `:integer`.
  override type(): string {
    return "integer";
  }

  // Mirrors Rails: serialize_cast_value returns value as-is for standalone use.
  // big_integer.rb:29 overrides Integer's ensureInRange call with a pass-through.
  // When limit is set (adapter column type, e.g. int8), isInRange below applies
  // BigInt-precision arithmetic so ensureInRange can still raise for out-of-range
  // values (float arithmetic loses precision at 2^63: Number(2^63n) === Number((2^63-1)n)).
  override serializeCastValue(value: number | null): number | null {
    return this.ensureInRange(value);
  }

  // Mirrors Rails: max_value returns Float::INFINITY so Integer's number-path
  // range check never fires for standalone BigIntegerType (big_integer.rb:33).
  protected override maxValue(): number {
    return Number.POSITIVE_INFINITY;
  }

  // Overrides the inherited number-only check to handle BigInt values precisely.
  // When limit is null (standalone :big_integer), always in range (maxValue = Infinity).
  // When limit is set (adapter column type), uses BigInt arithmetic for exact boundary
  // detection — necessary because float64 cannot distinguish 2^63 from 2^63-1.
  protected override isInRange(value: number | null): boolean {
    if (value == null) return true;
    if (typeof value === "bigint") {
      if (this.limit == null) return true;
      const bytes = this.limit;
      const max = (1n << BigInt(bytes * 8 - 1)) - 1n;
      const min = -(1n << BigInt(bytes * 8 - 1));
      return value >= min && value <= max;
    }
    return super.isInRange(value);
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
