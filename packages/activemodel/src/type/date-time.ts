import { Temporal } from "@blazetrails/activesupport/temporal";
import {
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinity as DateInfinityType,
  type DateNegativeInfinity as DateNegativeInfinityType,
} from "./internal/sentinels.js";
import { ValueType } from "./value.js";

export type DateTimeCastResult =
  | Temporal.Instant
  | Temporal.PlainDateTime
  | DateInfinityType
  | DateNegativeInfinityType;

export class DateTimeType extends ValueType<DateTimeCastResult> {
  readonly name: string = "datetime";

  cast(value: unknown): DateTimeCastResult | null {
    if (value === null || value === undefined) return null;
    if (value === DateInfinity) return DateInfinity;
    if (value === DateNegativeInfinity) return DateNegativeInfinity;
    if (value instanceof Temporal.Instant) return value;
    if (value instanceof Temporal.PlainDateTime) return value;
    // Dual-typed window: pg driver still returns Date until PR 5a.
    if (value instanceof Date) {
      return Number.isNaN(value.getTime())
        ? null
        : Temporal.Instant.fromEpochMilliseconds(value.getTime());
    }
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
      return Temporal.PlainDateTime.from(datetimeString, { overflow: "reject" });
    } catch {
      return null;
    }
  }

  serialize(value: unknown): string | null {
    const cast = this.cast(value);
    // Sentinels are Postgres-specific; base type returns null. The Postgres
    // OID::DateTime subclass overrides serialize() to emit 'infinity'/'-infinity'.
    if (cast === null || cast === DateInfinity || cast === DateNegativeInfinity) return null;
    const temporal = cast as Temporal.Instant | Temporal.PlainDateTime;
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

  serializeCastValue(value: Temporal.Instant | Temporal.PlainDateTime | null): string | null {
    return this.serialize(value);
  }

  type(): string {
    return this.name;
  }
}
