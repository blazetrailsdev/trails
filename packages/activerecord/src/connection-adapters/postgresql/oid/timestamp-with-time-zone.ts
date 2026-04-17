/**
 * PostgreSQL timestamptz type — timestamp with time zone.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::TimestampWithTimeZone.
 * Rails: `class TimestampWithTimeZone < DateTime`. `type` calls
 * real_type_unless_aliased(:timestamptz). `cast_value` normalises
 * returned times to UTC when the connection is in UTC mode — JS Date
 * is always UTC-internal, so the inherited cast_value is already
 * correct; we only override `type`.
 */

import { DateTime } from "./date-time.js";

export class TimestampWithTimeZone extends DateTime {
  override readonly name: string = "timestamptz";

  override type(): string {
    return this.realTypeUnlessAliased("timestamptz");
  }
}
