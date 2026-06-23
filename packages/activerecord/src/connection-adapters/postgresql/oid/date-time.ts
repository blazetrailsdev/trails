/**
 * PostgreSQL datetime OID type.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::DateTime.
 * Rails: `class DateTime < Type::DateTime`. Overrides cast_value to
 * handle PG's "infinity" / "-infinity" / " BC" strings, and
 * type_cast_for_schema so infinity sentinels render as
 * `::Float::INFINITY` in schema dumps. Exposes a protected
 * `real_type_unless_aliased(real_type)` hook that Timestamp /
 * TimestampWithTimeZone use to report :datetime when the adapter's
 * datetime_type is aliased.
 *
 * Returns Temporal.Instant for all datetime values (treating naive timestamps as UTC).
 */

import { Temporal } from "@blazetrails/activesupport/temporal";
import { DateTimeType } from "@blazetrails/activemodel";
import { pgDatetimeConfig } from "../pg-datetime-config.js";
import {
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinityType,
  type DateNegativeInfinityType,
} from "@blazetrails/activemodel";
import {
  parsePostgresTimestampAsInstant,
  parsePostgresInstant,
} from "../../abstract/temporal-wire.js";

type PgDateTimeResult = Temporal.Instant | DateInfinityType | DateNegativeInfinityType;

export class DateTime extends DateTimeType {
  override readonly name: string = "datetime";

  /**
   * Rails' `cast_value` — public here so subclasses can call directly
   * and api:compare matches the Rails method name. Base `cast()`
   * handles the nil short-circuit and dispatches here, so we fall
   * through to the parent's `castValue` (NOT `cast`) to avoid the
   * virtual-dispatch loop that would re-enter this method.
   */
  override castValue(value: unknown): PgDateTimeResult | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      if (value === "infinity") return DateInfinity;
      if (value === "-infinity") return DateNegativeInfinity;
      if (/ BC$/.test(value)) {
        try {
          // BC dates may have offset (timestamptz) or not (timestamp). Both
          // return Instant — parsePostgresTimestampAsInstant interprets naive
          // values in defaultSqlTimezone() (UTC by default, host-local when
          // ActiveRecord.default_timezone === "local").
          const hasOffset = /[-+]\d{2}(?::\d{2})?$/.test(value.slice(0, -3).trimEnd());
          return hasOffset ? parsePostgresInstant(value) : parsePostgresTimestampAsInstant(value);
        } catch {
          return null;
        }
      }
    }
    return super.castValue(value);
  }

  /**
   * Mirrors: PostgreSQL::OID::DateTime#serialize. `infinity` sentinels serialize
   * to their wire strings (Rails' `value_for_database` for infinity is the string);
   * every other value returns the cast Temporal.Instant. SQL-string quoting —
   * including the " BC" suffix for proleptic years ≤ 0 — happens in the adapter's
   * `quoted_date` / bind layer, matching Rails where the adapter does the quoting.
   */
  override serialize(value: unknown): unknown {
    // Cast first so the PG infinity *strings* ("infinity" / "-infinity") and
    // the numeric ±Infinity sentinels both resolve to the sentinel before the
    // wire-literal mapping — otherwise the string forms fall through to the
    // base serialize, which hands back the raw ±Infinity number instead of the
    // "infinity"/"-infinity" wire literal PG expects.
    const cast = this.cast(value);
    if (cast === DateInfinity) return "infinity";
    if (cast === DateNegativeInfinity) return "-infinity";
    return super.serializeCastValue(cast);
  }

  override typeCastForSchema(value: unknown): string {
    if (value === DateInfinity) return "::Float::INFINITY";
    if (value === DateNegativeInfinity) return "-::Float::INFINITY";
    return super.typeCastForSchema(value);
  }

  /**
   * Mirrors: PostgreSQL::OID::DateTime#real_type_unless_aliased.
   * Returns "datetime" when the adapter's datetime_type is aliased to
   * real_type (i.e. real_type IS the storage type for datetime), else
   * returns real_type unchanged.
   */
  protected realTypeUnlessAliased(realType: string): string {
    return pgDatetimeConfig.datetimeType === realType ? "datetime" : realType;
  }
}
