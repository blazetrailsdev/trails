import { Temporal } from "@blazetrails/activesupport/temporal";
import { looseDateParse } from "./helpers/loose-date-parse.js";
import { ValueType } from "./value.js";

export class TimeType extends ValueType<Temporal.PlainTime> {
  readonly name = "time";

  /** @internal Rails-private helper. */
  protected castValue(value: unknown): Temporal.PlainTime | null {
    if (value instanceof Temporal.PlainTime) return value;
    // Accept PlainDateTime from multiparameter assignment — extract the time part.
    if (value instanceof Temporal.PlainDateTime) return value.toPlainTime();
    const str = String(value).trim();
    if (str === "") return null;
    const parts = looseDateParse(str);
    if (!parts || parts.hour === undefined) return null;
    try {
      return Temporal.PlainTime.from(
        {
          hour: parts.hour,
          minute: parts.minute ?? 0,
          second: parts.second ?? 0,
          millisecond: parts.millisecond ?? 0,
          microsecond: parts.microsecond ?? 0,
        },
        { overflow: "reject" },
      );
    } catch {
      return null;
    }
  }

  serialize(value: unknown): string | null {
    const cast = this.cast(value);
    if (cast === null) return null;
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
    return cast.toString({ fractionalSecondDigits: digits });
  }

  serializeCastValue(value: Temporal.PlainTime | null): string | null {
    return this.serialize(value);
  }

  type(): string {
    return this.name;
  }

  userInputInTimeZone(value: unknown, zone: string = "UTC"): Temporal.ZonedDateTime | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Temporal.ZonedDateTime) return value;
    // Full ZonedDateTime string (has timezone bracket)
    const str = String(value).trim();
    if (str === "") return null;
    if (str.includes("[")) {
      try {
        return Temporal.ZonedDateTime.from(str);
      } catch {
        return null;
      }
    }
    // Otherwise cast to PlainTime and attach the given zone
    const plain = this.cast(value);
    if (!plain) return null;
    // Use a fixed reference date (Rails convention: 2000-01-01) so the result
    // is stable across DST transitions and independent of the current date.
    try {
      return Temporal.PlainDate.from("2000-01-01").toPlainDateTime(plain).toZonedDateTime(zone);
    } catch {
      return null;
    }
  }
}
