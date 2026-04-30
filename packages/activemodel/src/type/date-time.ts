import { Temporal } from "@blazetrails/activesupport/temporal";
import {
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinity as DateInfinityType,
  type DateNegativeInfinity as DateNegativeInfinityType,
} from "./internal/sentinels.js";
import { isUtc } from "./helpers/timezone.js";
import { ValueType } from "./value.js";

function configuredTimezone(): string {
  return isUtc() ? "UTC" : Temporal.Now.timeZoneId();
}

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
}
