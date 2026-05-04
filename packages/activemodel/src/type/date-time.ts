import { Temporal } from "@blazetrails/activesupport/temporal";
import {
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinity as DateInfinityType,
  type DateNegativeInfinity as DateNegativeInfinityType,
} from "./internal/sentinels.js";
import { ArgumentError } from "../attribute-assignment.js";
import { AcceptsMultiparameterTime } from "./helpers/accepts-multiparameter-time.js";
import { configuredTimezone } from "./helpers/timezone.js";
import { ValueType } from "./value.js";

export type DateTimeCastResult = Temporal.Instant | DateInfinityType | DateNegativeInfinityType;

export class DateTimeType extends ValueType<DateTimeCastResult> {
  readonly name: string = "datetime";

  /** @internal Rails-private helper. */
  protected castValue(value: unknown): DateTimeCastResult | null {
    if (value === DateInfinity) return DateInfinity;
    if (value === DateNegativeInfinity) return DateNegativeInfinity;
    if (value instanceof Temporal.Instant) return value;
    const str = String(value).trim();
    if (str === "") return null;
    return this.parseString(str);
  }

  private parseString(str: string): DateTimeCastResult | null {
    // Normalize wire-format quirks before parsing:
    //   space separator → T; short offset ±HH → ±HH:MM
    const normalized = str
      .replace(" ", "T")
      .replace(/(T\d{2}:\d{2}:\d{2}(?:\.\d+)?)([-+]\d{2})$/, "$1$2:00");
    // Date-only string (YYYY-MM-DD) → midnight PlainDateTime, matching Rails behavior.
    const datetimeString = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
      ? `${normalized}T00:00:00`
      : normalized;
    const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(datetimeString);
    if (hasOffset) {
      try {
        return Temporal.Instant.from(datetimeString);
      } catch {
        return null;
      }
    }
    try {
      // No offset — interpret in the default timezone configured via
      // ActiveModel's helpers/timezone module (UTC by default, host-system
      // local when set to "local"). ActiveRecord wires its own
      // default_timezone setter into ActiveModel's so they stay in sync.
      return Temporal.PlainDateTime.from(datetimeString, { overflow: "reject" })
        .toZonedDateTime(configuredTimezone())
        .toInstant();
    } catch {
      return null;
    }
  }

  serialize(value: unknown): string | null {
    const cast = this.cast(value);
    // Sentinels are Postgres-specific; base type returns null. The Postgres
    // OID::DateTime subclass overrides serialize() to emit 'infinity'/'-infinity'.
    if (cast === null || cast === DateInfinity || cast === DateNegativeInfinity) return null;
    const temporal = cast as Temporal.Instant;
    const p = this.precision ?? -1;
    const digits = (Number.isInteger(p) && p >= 0 && p <= 9 ? p : 6) as
      | 0
      | 1
      | 2
      | 3
      | 4
      | 5
      | 6
      | 7
      | 8
      | 9;
    return temporal.toString({ fractionalSecondDigits: digits });
  }

  serializeCastValue(value: DateTimeCastResult | null): string | null {
    return this.serialize(value);
  }

  type(): string {
    return this.name;
  }

  /**
   * Mirrors: ActiveModel::Type::DateTime#microseconds (date_time.rb:62-64).
   *
   *   # '0.123456' -> 123456
   *   # '1.123456' -> 123456
   *   def microseconds(time)
   *     time[:sec_fraction] ? (time[:sec_fraction] * 1_000_000).to_i : 0
   *   end
   *
   * Rails parses sub-second precision out of `Date._parse` results as
   * a `Rational` (e.g. `123456/1000000`); multiplying by 1_000_000
   * normalizes it to an integer microsecond count.
   *
   * @internal Rails-private helper.
   */
  protected microseconds(time: { sec_fraction?: number | null }): number {
    return time.sec_fraction ? Math.trunc(time.sec_fraction * 1_000_000) : 0;
  }

  /**
   * Mirrors: ActiveModel::Type::DateTime#fallback_string_to_time
   * (date_time.rb:66-75).
   *
   *   def fallback_string_to_time(string)
   *     time_hash = begin
   *       ::Date._parse(string)
   *     rescue ArgumentError
   *     end
   *     return unless time_hash
   *     time_hash[:sec_fraction] = microseconds(time_hash)
   *     new_time(*time_hash.values_at(:year, :mon, :mday, :hour, :min, :sec, :sec_fraction, :offset))
   *   end
   *
   * Trails has no `Date._parse` equivalent; reuse Temporal's
   * permissive parser plus the configured-zone resolution that
   * `parseString` already implements. Returns null on parse failure.
   *
   * @internal Rails-private helper.
   */
  protected fallbackStringToTime(s: string): Temporal.Instant | null {
    const result = this.parseString(s.trim());
    return result instanceof Temporal.Instant ? result : null;
  }

  /**
   * Mirrors: ActiveModel::Type::DateTime#value_from_multiparameter_assignment
   * (date_time.rb:77-83).
   *
   *   def value_from_multiparameter_assignment(values_hash)
   *     missing_parameters = [1, 2, 3].delete_if { |key| values_hash.key?(key) }
   *     unless missing_parameters.empty?
   *       raise ArgumentError, "Provided hash #{values_hash} doesn't contain necessary keys: #{missing_parameters}"
   *     end
   *     super
   *   end
   *
   * Validates that year/mon/mday (multiparameter keys 1, 2, 3) are
   * present, then defers to the multiparameter wrapper. Trails routes
   * the actual reconstruction through `AcceptsMultiparameterTime`
   * (`helpers/accepts-multiparameter-time.ts`); this helper exists for
   * Rails parity and as the entry point for callers that want the
   * key-presence check.
   *
   * @internal Rails-private helper.
   */
  protected valueFromMultiparameterAssignment(
    values: Record<number, unknown>,
  ): DateTimeCastResult | null {
    const missing = [1, 2, 3].filter((k) => !Object.hasOwn(values, k));
    if (missing.length > 0) {
      throw new ArgumentError(
        `Provided hash ${JSON.stringify(values)} doesn't contain necessary keys: ${JSON.stringify(missing)}`,
      );
    }
    return new AcceptsMultiparameterTime(this, { "4": 0, "5": 0 }).cast(values) as DateTimeCastResult | null;
  }
}
