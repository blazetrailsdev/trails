/**
 * PostgreSQL timestamp type — timestamp without time zone.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Timestamp.
 * Rails: `class Timestamp < DateTime`. `type` calls
 * real_type_unless_aliased(:timestamp). Extends our OID::DateTime so
 * infinity / BC handling is inherited.
 */

import { DateTime } from "./date-time.js";

export class Timestamp extends DateTime {
  override readonly name: string = "timestamp";

  override type(): string {
    return this.realTypeUnlessAliased("timestamp");
  }
}
