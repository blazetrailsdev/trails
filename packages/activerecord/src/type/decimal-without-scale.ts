/**
 * Mirrors: ActiveRecord::Type::DecimalWithoutScale.
 *
 * Used for NUMERIC columns declared without a scale — the value is an
 * integer but the type reports as `:decimal` for schema purposes.
 */

import { BigIntegerType } from "@blazetrails/activemodel";

export class DecimalWithoutScale extends BigIntegerType {
  override readonly name: string = "decimal";

  // BigIntegerType.castValue returns bigint; DecimalWithoutScale must return
  // plain number (Ruby to_i semantics) because NUMERIC-without-scale columns
  // are consumed as numbers by the rest of the stack.
  protected override castValue(value: unknown): number | null {
    if (typeof value === "number") {
      if (isNaN(value)) return null;
      return Math.trunc(value);
    }
    if (typeof value === "bigint") return Number(value);
    const parsed = parseInt(String(value), 10);
    return isNaN(parsed) ? null : parsed;
  }

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
