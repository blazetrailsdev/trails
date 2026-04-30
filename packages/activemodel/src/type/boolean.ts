import { ValueType } from "./value.js";

export class BooleanType extends ValueType<boolean> {
  readonly name = "boolean";

  // Mirrors Rails `ActiveModel::Type::Boolean::FALSE_VALUES`
  // (activemodel/lib/active_model/type/boolean.rb:15-24). Rails' Symbol
  // variants (`:"0"`, `:false`, `:FALSE`, `:off`, `:OFF`, …) are omitted
  // since JS has no symbols for those strings.
  private static readonly FALSE_VALUES: ReadonlySet<unknown> = new Set([
    false,
    0,
    0n, // safeIntegers mode returns bigint 0n for SQLite boolean columns
    "0",
    "f",
    "F",
    "false",
    "FALSE",
    "off",
    "OFF",
  ]);

  /**
   * Mirrors Rails `cast_value` (type/boolean.rb:40-45):
   *
   *   def cast_value(value)
   *     if value == ""
   *       nil
   *     else
   *       !FALSE_VALUES.include?(value)
   *     end
   *   end
   *
   * Anything not in `FALSE_VALUES` is `true` — Rails' permissive
   * policy. "yes", "no", "garbage" all coerce to `true`. Empty string
   * and `null`/`undefined` map to `null`.
   */
  /** @internal Rails-private helper. */
  protected castValue(value: unknown): boolean | null {
    if (value === "") return null;
    return !BooleanType.FALSE_VALUES.has(value);
  }

  serialize(value: unknown): boolean | null {
    return this.cast(value);
  }

  type(): string {
    return this.name;
  }

  serializeCastValue(value: boolean | null): boolean | null {
    return value;
  }
}
