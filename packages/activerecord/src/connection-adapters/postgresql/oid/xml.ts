/**
 * PostgreSQL xml type.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Xml.
 * Rails: `class Xml < Type::String`. Overrides type and serialize, with
 * a nested Data class wrapping the serialized output.
 */

import { StringType } from "@blazetrails/activemodel";

export class Data {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }
}

export class Xml extends StringType {
  override readonly name: string = "xml";

  override type(): string {
    return "xml";
  }

  /**
   * Rails: `Data.new(super) if value`. super is Type::String#serialize
   * which stringifies the value; nil passes through. We return a Data
   * instance so quoting.ts' `value instanceof Data` check routes PG's
   * `xml '...'` prefix correctly. StringType.serialize is typed as
   * `unknown` so wrapper returns like this don't need suppression.
   */
  override serialize(value: unknown): Data | null {
    if (value == null) return null;
    if (value instanceof Data) return value;
    const cast = this.cast(value);
    return cast == null ? null : new Data(cast);
  }
}
