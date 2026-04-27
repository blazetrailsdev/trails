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
 * Full Temporal-native driver integration lands in PR 5a; the cast
 * and typeCastForSchema overrides here are updated so that
 * DateTimeType returning `Temporal.Instant | Temporal.PlainDateTime`
 * does not break compilation.
 */

import { Temporal } from "@blazetrails/activesupport/temporal";
import { DateTimeType } from "@blazetrails/activemodel";
import {
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinityType,
  type DateNegativeInfinityType,
} from "@blazetrails/activemodel";
import { parsePostgresPlainDateTime, parsePostgresInstant } from "../../abstract/temporal-wire.js";

type PgDateTimeResult =
  | Temporal.Instant
  | Temporal.PlainDateTime
  | DateInfinityType
  | DateNegativeInfinityType;

export class DateTime extends DateTimeType {
  override readonly name: string = "datetime";

  override cast(value: unknown): PgDateTimeResult | null {
    return this.castValue(value);
  }

  /**
   * Rails' `cast_value` — public here so subclasses can call directly
   * and api:compare matches the Rails method name.
   */
  castValue(value: unknown): PgDateTimeResult | null {
    if (typeof value === "string") {
      if (value === "infinity") return DateInfinity;
      if (value === "-infinity") return DateNegativeInfinity;
      if (/ BC$/.test(value)) {
        // Has offset → treat as timestamptz (Instant); otherwise plain.
        const hasOffset = /[-+]\d{2}(?::\d{2})?$/.test(value.slice(0, -3).trimEnd());
        try {
          return hasOffset ? parsePostgresInstant(value) : parsePostgresPlainDateTime(value);
        } catch {
          return null;
        }
      }
    }
    return super.cast(value);
  }

  override serialize(value: unknown): string | null {
    if (value === DateInfinity) return "infinity";
    if (value === DateNegativeInfinity) return "-infinity";
    return super.serialize(value);
  }

  override typeCastForSchema(value: unknown): string {
    if (value === DateInfinity) return "::Float::INFINITY";
    if (value === DateNegativeInfinity) return "-::Float::INFINITY";
    return super.typeCastForSchema(value);
  }

  /**
   * Rails' `real_type_unless_aliased` — Timestamp / TimestampWithTimeZone
   * call this to return `:datetime` when the adapter's datetime_type
   * matches `real_type`, else `real_type` itself. We don't yet have a
   * per-adapter datetime_type setting so always return the real type,
   * matching Rails' default when nothing is aliased.
   */
  protected realTypeUnlessAliased(realType: string): string {
    return realType;
  }
}
