/**
 * PostgreSQL interval type — represents a time duration.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Interval.
 * Rails: `class Interval < Type::Value`. cast_value accepts Duration
 * or ISO8601 string; serialize emits ISO8601; type_cast_for_schema
 * inspects the serialized form.
 */

import { ValueType } from "@blazetrails/activemodel";
import { Duration } from "@blazetrails/activesupport";

export class Interval extends ValueType<Duration> {
  readonly name: string = "interval";

  constructor(options?: { precision?: number }) {
    super(options);
  }

  override type(): string {
    return "interval";
  }

  cast(value: unknown): Duration | null {
    return this.castValue(value);
  }

  /**
   * Rails' cast_value — exposed publicly so api:compare matches the
   * Rails method name and callers can invoke the hook directly.
   */
  castValue(value: unknown): Duration | null {
    if (value == null) return null;
    if (value instanceof Duration) return value;
    if (typeof value === "string") {
      try {
        return Duration.parse(value);
      } catch {
        // PG round-trips intervals in its verbose form ("3 years 2 mons",
        // "00:01:00.123456", "-1 year") rather than the ISO8601 input
        // string. Duration.parse only accepts ISO8601, so fall back to a
        // PG-format parser for AVG(interval) and pg_get_expr defaults.
        return parsePgInterval(value);
      }
    }
    if (typeof value === "number") {
      // Rails' cast_value lets numeric inputs fall through to super (identity),
      // then serialize converts. TS is typed `Duration | null`, so we upgrade
      // numeric seconds into a Duration here — same observable behaviour
      // through the cast → serialize pipeline.
      return Duration.build(value);
    }
    return null;
  }

  override serialize(value: unknown): string | null {
    if (value == null) return null;
    if (value instanceof Duration) {
      return value.iso8601({ precision: this.precision ?? null });
    }
    if (typeof value === "number") {
      // Rails: `Time - Time` yields a Float seconds count that reaches
      // serialize directly (without going through cast). Keep a numeric
      // branch so that path still round-trips.
      return Duration.build(value).iso8601({ precision: this.precision ?? null });
    }
    if (typeof value === "string") return value;
    return null;
  }

  override typeCastForSchema(value: unknown): string {
    const serialized = this.serialize(value);
    if (serialized == null) return "nil";
    // Rails: `serialize(value).inspect` — quote the string for schema dump.
    return `"${serialized.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
}

const PG_FIELD_RE =
  /(-?\d+)\s+(year|years|mon|mons|month|months|day|days|hour|hours|minute|minutes|second|seconds)/g;
const PG_TIME_RE = /(-)?(\d+):(\d+):(\d+)(?:\.(\d+))?/;

function parsePgInterval(raw: string): Duration | null {
  const value = raw.trim();
  if (value === "") return null;
  let totalSeconds = 0;
  let matched = false;
  for (const [, num, unit] of value.matchAll(PG_FIELD_RE)) {
    const n = Number(num);
    if (Number.isNaN(n)) continue;
    matched = true;
    if (unit.startsWith("year")) totalSeconds += n * 365.25 * 24 * 3600;
    else if (unit.startsWith("mon")) totalSeconds += n * 30 * 24 * 3600;
    else if (unit.startsWith("day")) totalSeconds += n * 24 * 3600;
    else if (unit.startsWith("hour")) totalSeconds += n * 3600;
    else if (unit.startsWith("minute")) totalSeconds += n * 60;
    else if (unit.startsWith("second")) totalSeconds += n;
  }
  const tm = PG_TIME_RE.exec(value);
  if (tm) {
    matched = true;
    const sign = tm[1] === "-" ? -1 : 1;
    const h = Number(tm[2]);
    const m = Number(tm[3]);
    const s = Number(tm[4]);
    const frac = tm[5] ? Number(`0.${tm[5]}`) : 0;
    totalSeconds += sign * (h * 3600 + m * 60 + s + frac);
  }
  if (!matched) return null;
  return Duration.build(totalSeconds);
}
