/**
 * PostgreSQL date OID type.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Date.
 * Rails: `class Date < Type::Date`. Overrides cast_value to handle
 * PG-specific string forms ("infinity" / "-infinity" / "… BC" for BCE
 * dates) and type_cast_for_schema so those sentinels render as
 * `::Float::INFINITY` / `-::Float::INFINITY` in schema dumps.
 *
 * Full Temporal-native driver integration lands in PR 5a; this file
 * is updated here so that `DateType#cast` returning `Temporal.PlainDate`
 * does not break compilation.
 */

import { Temporal } from "@blazetrails/activesupport/temporal";
import {
  DateType,
  type DateCastResult,
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinityType,
  type DateNegativeInfinityType,
} from "@blazetrails/activemodel";
import { parsePostgresDate } from "../../abstract/temporal-wire.js";

export class Date extends DateType {
  override readonly name: string = "date";

  override cast(value: unknown): DateCastResult | null {
    return this.castValue(value);
  }

  /**
   * Rails' `cast_value` — the protected hook cast delegates to.
   * Kept public so subclasses and tests can call it directly, and so
   * api:compare finds the method name that matches Rails.
   */
  castValue(
    value: unknown,
  ): Temporal.PlainDate | DateInfinityType | DateNegativeInfinityType | null {
    if (typeof value === "string") {
      if (value === "infinity") return DateInfinity;
      if (value === "-infinity") return DateNegativeInfinity;
      if (/ BC$/.test(value)) {
        try {
          return parsePostgresDate(value);
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
}
