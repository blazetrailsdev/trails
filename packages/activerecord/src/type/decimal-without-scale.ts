/**
 * Mirrors: ActiveRecord::Type::DecimalWithoutScale.
 *
 * Used for NUMERIC columns declared without a scale — the value is an
 * integer but the type reports as `:decimal` for schema purposes.
 */

import { BigIntegerType } from "@blazetrails/activemodel";

export class DecimalWithoutScale extends BigIntegerType {
  override readonly name: string = "decimal";

  // Rails: `DecimalWithoutScale < BigInteger`, so an unscaled/scale-0 decimal
  // reads back as an unbounded Ruby Integer. Inherit BigIntegerType.castValue
  // unchanged — it keeps safe-range values as JS `number` and only carries a
  // `bigint` for genuine bignums beyond float64's exact-integer range (e.g.
  // 2**62), so no JS-number precision loss. An earlier override truncated to a
  // lossy plain `number`; that divergence is what this type must not have.

  override type(): string {
    return "decimal";
  }

  override typeCastForSchema(value: unknown): string {
    // Rails: `value.to_s.inspect`. nil.to_s is "", so null/undefined
    // should render as "" (quoted empty string), not "null"/"undefined".
    // Use JSON.stringify so control chars (newline, tab, etc.) get
    // escaped the same way Ruby's inspect does, rather than leaking
    // literal characters into the schema dump.
    const s = value == null ? "" : String(value);
    return JSON.stringify(s);
  }
}
