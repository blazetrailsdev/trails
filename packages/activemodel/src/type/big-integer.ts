import { IntegerType } from "./integer.js";

export class BigIntegerType extends IntegerType {
  readonly name: string = "big_integer";

  /**
   * @internal Rails-private helper. Returns Infinity to bypass Integer's range check.
   */
  protected maxValue(): number {
    return Number.POSITIVE_INFINITY;
  }

  // Mirrors Rails: `BigInteger < Integer` inherits `Integer#type`, hardcoded
  // `:integer`. Our `name` ("big_integer") is the type-registry key, not the
  // reflected column type — `column.type` for a bigint is `:integer`.
  override type(): string {
    return "integer";
  }

  serialize(value: unknown): unknown {
    // No range check — maxValue is Infinity. Return cast value as-is (matches Rails).
    return this.cast(value);
  }
}
