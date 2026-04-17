/**
 * Mirrors: ActiveRecord::Type::DecimalWithoutScale.
 *
 * Used for NUMERIC columns declared without a scale — the value is an
 * integer but the type reports as `:decimal` for schema purposes.
 *
 * Rails:
 *
 * ```ruby
 * class DecimalWithoutScale < ActiveModel::Type::BigInteger
 *   def type; :decimal; end
 *   def type_cast_for_schema(value); value.to_s.inspect; end
 * end
 * ```
 */

import { BigIntegerType } from "@blazetrails/activemodel";

export class DecimalWithoutScale extends BigIntegerType {
  override readonly name: string = "decimal";

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
