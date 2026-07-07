import { IntegerType } from "./integer.js";

export class BigIntegerType extends IntegerType {
  readonly name: string = "big_integer";

  // Mirrors Rails: `BigInteger < Integer` inherits `Integer#type`, hardcoded
  // `:integer`. Our `name` ("big_integer") is the type-registry key, not the
  // reflected column type — `column.type` for a bigint is `:integer`.
  override type(): string {
    return "integer";
  }

  // Mirrors Rails big_integer.rb:29 — serialize_cast_value returns value as-is,
  // bypassing Integer's ensureInRange. BigIntegerType is unconditionally unlimited.
  override serializeCastValue(value: number | null): number | null {
    return value;
  }

  // Mirrors Rails big_integer.rb:33 — max_value is Float::INFINITY regardless of
  // limit, so Integer's number-path range check never fires.
  protected override maxValue(): number {
    return Number.POSITIVE_INFINITY;
  }

  /**
   * @internal Rails-private helper.
   *
   * Ruby has a single unbounded `Integer`, so Rails represents every id the
   * same way regardless of magnitude. Trails is `number`-backed, so we keep a
   * safe-range integer (`[MIN_SAFE_INTEGER, MAX_SAFE_INTEGER]`) as a plain JS
   * `number` and only carry a `bigint` (under a `number` cast) for genuine
   * bignums beyond float64's exact-integer range. This matches
   * `IntegerType#castValue` and gives pg/MariaDB the same "safe-range integer
   * is a number" contract better-sqlite3/mysql2 already honor, so a default
   * `bigint` PK, `pluck`, collection `ids`, and an `integer` FK holding the
   * same value all compare `===`.
   */
  protected override castValue(value: unknown): number | null {
    if (typeof value === "bigint") return this.narrow(value);
    if (typeof value === "number") {
      if (isNaN(value) || !isFinite(value)) return null;
      return this.narrow(BigInt(Math.trunc(value)));
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
      return this.narrow(BigInt(lead.startsWith("+") ? lead.slice(1) : lead));
    }
    return super.castValue(value);
  }

  /**
   * Collapse a `bigint` to a JS `number` when it fits float64's safe-integer
   * range; otherwise keep the `bigint` (carried under a `number` cast, the
   * technique the type primitives use to stay `ValueType<number>`-backed while
   * preserving precision for out-of-range bignums).
   */
  private narrow(value: bigint): number {
    const num = Number(value);
    return Number.isSafeInteger(num) ? num : (value as unknown as number);
  }

  override serialize(value: unknown): unknown {
    return this.cast(value);
  }
}
