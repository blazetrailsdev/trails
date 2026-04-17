/**
 * PostgreSQL timestamp type — timestamp without time zone.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Timestamp.
 * Rails: `class Timestamp < DateTime; def type; real_type_unless_aliased(:timestamp); end`.
 * `real_type_unless_aliased` returns :datetime when DateTime is aliased
 * to :datetime; otherwise returns :timestamp. We don't have the alias
 * registry yet, so report :timestamp directly (matches Rails' non-aliased
 * default).
 */

import { DateTimeType } from "@blazetrails/activemodel";

export class Timestamp extends DateTimeType {
  override readonly name: string = "timestamp";

  override type(): string {
    return "timestamp";
  }
}
