import { Type } from "./value.js";

export class BigIntegerType extends Type<bigint> {
  readonly name: string = "big_integer";

  /** @internal Rails-private helper. */
  protected castValue(value: unknown): bigint | null {
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

  serializeCastValue(value: bigint | null): string | null {
    return value !== null ? value.toString() : null;
  }

  /**
   * Mirrors: ActiveModel::Type::BigInteger#max_value (big_integer.rb:27-29).
   *   def max_value
   *     ::Float::INFINITY
   *   end
   *
   * Overrides Integer#max_value so range checks treat big-integer values
   * as unbounded. trails' BigIntegerType uses native bigint so the
   * Integer#range/ensure_in_range chain isn't inherited, but we expose
   * the helper for parity and so subclasses see the same hook Rails does.
   *
   * @internal Rails-private helper.
   */
  protected maxValue(): number {
    return Number.POSITIVE_INFINITY;
  }
}
