/**
 * Mirrors: ActiveRecord::Type::DecimalWithoutScale.
 *
 * Used for NUMERIC columns declared without a scale — the value is an
 * integer but the type reports as `:decimal` for schema purposes.
 *
 * Rails source inherits from BigInteger, but our TS implementation extends
 * IntegerType directly so that cast() returns a plain number (not BigInt),
 * matching Ruby's to_i behavior for integer truncation.
 */

import { IntegerType } from "@blazetrails/activemodel";

export class DecimalWithoutScale extends IntegerType {
  // Default limit to 8 bytes — matching Rails' BigInteger ancestry as an
  // 8-byte signed integer range while keeping IntegerType truncation semantics.
  constructor(options: ConstructorParameters<typeof IntegerType>[0] = {}) {
    super({ ...options, limit: options.limit ?? 8 });
  }

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
