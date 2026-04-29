/**
 * PostgreSQL enum OID type — casts PostgreSQL enum column values.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Enum.
 * Rails: `class Enum < Type::Value; def type; :enum; end;
 * def cast_value(value); value.to_s; end`.
 */

import { NotImplementedError } from "../../../errors.js";
import { ValueType } from "@blazetrails/activemodel";

export class Enum extends ValueType<string> {
  readonly name: string = "enum";

  override type(): string {
    return "enum";
  }

  /** Rails' cast_value is `value.to_s` — matches `String(value)` here. */
  cast(value: unknown): string | null {
    if (value == null) return null;
    return String(value);
  }
}

/** @internal */
function castValue(value: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Enum#cast_value is not implemented",
  );
}
