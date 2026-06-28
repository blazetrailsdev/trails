import { IntegerType } from "./integer.js";

export class BigIntegerType extends IntegerType {
  readonly name: string = "big_integer";

  // Mirrors Rails: `BigInteger < Integer` inherits `Integer#type`, hardcoded
  // `:integer`. Our `name` ("big_integer") is the type-registry key, not the
  // reflected column type — `column.type` for a bigint is `:integer`.
  override type(): string {
    return "integer";
  }

  // Mirrors Rails: serialize_cast_value returns value as-is (no range guard).
  // big_integer.rb:29 — overrides Integer's ensureInRange call with a pass-through.
  override serializeCastValue(value: number | null): number | null {
    return value;
  }

  // Mirrors Rails: max_value returns Float::INFINITY so Integer's range check
  // never fires for standalone BigIntegerType (big_integer.rb:33).
  // Adapter column types that need an 8-byte bound are registered as
  // IntegerType({ limit: 8 }) — e.g. PostgreSQL int8, MySQL bigint.
  protected override maxValue(): number {
    return Number.POSITIVE_INFINITY;
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
    return this.cast(value);
  }
}
