/**
 * PostgreSQL timestamptz type — timestamp with time zone.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::TimestampWithTimeZone.
 * Rails: `class TimestampWithTimeZone < DateTime`. Overrides type and
 * cast_value to normalise returned times to UTC when the connection
 * is in UTC mode (the PG gem may return non-UTC times even when the
 * wire-protocol value was UTC).
 */

import { DateTimeType } from "@blazetrails/activemodel";

export class TimestampWithTimeZone extends DateTimeType {
  override readonly name: string = "timestamptz";

  override type(): string {
    return "timestamptz";
  }

  /**
   * Rails normalises via `time.getutc` / `time.getlocal` depending on
   * the connection's `is_utc?` mode. JS Date is always UTC-based
   * internally; `toISOString()` always produces UTC. We don't yet have
   * a per-adapter timezone setting plumbed through, so defer to the
   * parent cast and let JS Date's UTC-internal representation stand.
   */
}
