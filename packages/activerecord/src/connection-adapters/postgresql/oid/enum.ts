/**
 * PostgreSQL enum OID type — casts PostgreSQL enum column values.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Enum.
 * Rails: `class Enum < Type::Value; def type; :enum; end;
 * def cast_value(value); value.to_s; end`.
 */

import { ValueType } from "@blazetrails/activemodel";

export class Enum extends ValueType<string> {
  readonly name: string = "enum";

  override type(): string {
    return "enum";
  }

  /** @internal Mirrors: PostgreSQL::OID::Enum#cast_value (enum.rb:13). */
  protected override castValue(value: unknown): string {
    return String(value);
  }
}
