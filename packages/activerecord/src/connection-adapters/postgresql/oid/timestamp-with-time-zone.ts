/**
 * PostgreSQL timestamptz type — timestamp with time zone.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::TimestampWithTimeZone
 */

import { Timestamp } from "./timestamp.js";

export class TimestampWithTimeZone extends Timestamp {
  override get type(): string {
    return "timestamptz";
  }

  override serialize(value: unknown): string | null {
    if (value == null) return null;
    if (value instanceof globalThis.Date) {
      return value.toISOString();
    }
    if (typeof value === "string") return value;
    return null;
  }
}
